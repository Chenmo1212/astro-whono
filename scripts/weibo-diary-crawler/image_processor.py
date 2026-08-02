"""
image_processor.py —— 图片压缩与上传集成模块

在爬虫工作流中集成 compress_and_upload.py 的功能：
  - 下载图片后自动压缩
  - 压缩完成后自动上传到七牛 CDN
  - 生成 CDN URL 并更新 post 记录

用法：
    from image_processor import process_post_images, process_posts_batch
    
    # 处理单条微博的图片（下载 → 压缩 → 上传）
    post_with_urls = process_post_images(post, quality=75, dry_run=False)
    
    # 批量处理
    posts_with_urls = process_posts_batch(posts, quality=75, dry_run=False)
"""

import os
import sys
import json
import time
import hashlib
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is not installed.  Run: pip install Pillow")
    sys.exit(1)

try:
    import qiniu
    from qiniu import Auth
except ImportError:
    print("ERROR: qiniu SDK is not installed.  Run: pip install qiniu")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
SETTINGS_FILE = PROJECT_ROOT / "src" / "data" / "settings" / "ui.json"

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_DIMENSION = 1080      # resize if either side exceeds this (px)
SKIP_THRESHOLD_KB = 50    # skip compression for files already smaller than this


class ImageProcessor:
    """
    图片处理器：压缩 + 上传集成。
    直接复用 compress_and_upload.py 的核心逻辑。
    """

    def __init__(self, quality: int = 75, dry_run: bool = False, workers: int = 3):
        """
        初始化图片处理器。
        
        Args:
            quality: JPEG/WebP 压缩质量（1-100，默认 75）
            dry_run: 仅压缩，不上传
            workers: 上传并发数
        """
        self.quality = quality
        self.dry_run = dry_run
        self.workers = workers
        self.config = None
        self.auth = None
        
        if not dry_run:
            self._load_qiniu_config()

    def _load_qiniu_config(self) -> None:
        """读取七牛配置"""
        if not SETTINGS_FILE.exists():
            print(f"ERROR: settings file not found: {SETTINGS_FILE}")
            raise FileNotFoundError(str(SETTINGS_FILE))

        with open(SETTINGS_FILE, encoding="utf-8") as f:
            data = json.load(f)

        cfg = data.get("imageProvider", {}).get("qiniu", {})
        required = ("accessKey", "secretKey", "bucket", "domain")
        missing = [k for k in required if not cfg.get(k)]
        if missing:
            print(f"ERROR: missing Qiniu config keys: {', '.join(missing)}")
            raise ValueError(f"Missing config: {missing}")

        self.config = {
            "access_key": cfg["accessKey"],
            "secret_key": cfg["secretKey"],
            "bucket": cfg["bucket"],
            "domain": cfg["domain"].rstrip("/"),
            "path": cfg.get("path", "/").strip("/"),
        }
        self.auth = Auth(self.config["access_key"], self.config["secret_key"])

    def _year_from_filename(self, filename: str) -> Optional[str]:
        """从文件名中提取年份"""
        stem = Path(filename).stem
        candidate = stem[:4]
        if candidate.isdigit() and 2000 <= int(candidate) <= 2099:
            return candidate
        return None

    def _qiniu_key(self, filename: str) -> str:
        """生成七牛对象键"""
        prefix = self.config["path"]
        year = self._year_from_filename(filename)
        if year:
            return f"{prefix}/{year}/{filename}" if prefix else f"{year}/{filename}"
        return f"{prefix}/{filename}" if prefix else filename

    def compress_image(self, src: Path, dest: Path) -> tuple[int, int]:
        """
        压缩图片。
        返回 (原始字节数, 压缩后字节数)
        """
        orig_size = src.stat().st_size

        if orig_size < SKIP_THRESHOLD_KB * 1024:
            # 文件足够小，直接复制
            dest.write_bytes(src.read_bytes())
            return orig_size, orig_size

        with Image.open(src) as img:
            # 转换为 RGB（如果是 JPEG 输出）
            ext = dest.suffix.lower()
            if ext in (".jpg", ".jpeg") and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            # 缩放（保持宽高比）
            w, h = img.size
            if max(w, h) > MAX_DIMENSION:
                scale = MAX_DIMENSION / max(w, h)
                img = img.resize(
                    (int(w * scale), int(h * scale)),
                    Image.LANCZOS,
                )

            save_kwargs: dict = {"optimize": True}
            if ext in (".jpg", ".jpeg"):
                save_kwargs["quality"] = self.quality
                save_kwargs["progressive"] = True
            elif ext == ".webp":
                save_kwargs["quality"] = self.quality
            elif ext == ".png":
                save_kwargs["compress_level"] = max(1, min(9, (100 - self.quality) // 10))

            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, **save_kwargs)

        return orig_size, dest.stat().st_size

    def upload_file(self, local_path: Path) -> str:
        """
        上传图片到七牛。
        返回 CDN 公网 URL。
        """
        if self.dry_run or not self.auth:
            raise RuntimeError("Dry run mode or auth not initialized")

        key = self._qiniu_key(local_path.name)
        token = self.auth.upload_token(self.config["bucket"], key, expires=3600)

        ret, info = qiniu.put_file_v2(token, key, str(local_path))
        if info.status_code != 200:
            raise RuntimeError(f"upload failed (HTTP {info.status_code}): {info.text_body}")

        return f"{self.config['domain']}/{key}"

    def process_image(self, local_path: Path, output_dir: Path) -> dict:
        """
        处理单张图片（压缩 + 上传）。
        
        Args:
            local_path: 本地图片路径
            output_dir: 压缩输出目录
        
        Returns:
            {
                "original_path": str,
                "compressed_path": str,
                "original_size": int,
                "compressed_size": int,
                "saved_pct": float,
                "cdn_url": str (如果上传成功),
                "error": str (如果失败)
            }
        """
        result = {
            "original_path": str(local_path),
            "compressed_path": None,
            "original_size": 0,
            "compressed_size": 0,
            "saved_pct": 0.0,
            "cdn_url": None,
            "error": None,
        }

        # 压缩
        try:
            dest = output_dir / local_path.name
            orig_bytes, comp_bytes = self.compress_image(local_path, dest)
            result["original_size"] = orig_bytes
            result["compressed_size"] = comp_bytes
            result["saved_pct"] = ((orig_bytes - comp_bytes) / orig_bytes * 100) if orig_bytes else 0
            result["compressed_path"] = str(dest)
        except Exception as e:
            result["error"] = f"Compress failed: {e}"
            return result

        # 上传
        if self.dry_run:
            return result

        try:
            cdn_url = self.upload_file(dest)
            result["cdn_url"] = cdn_url
        except Exception as e:
            result["error"] = f"Upload failed: {e}"

        return result


def process_post_images(
    post: dict,
    quality: int = 75,
    dry_run: bool = False,
    output_dir: Optional[Path] = None,
    workers: int = 3,
) -> dict:
    """
    处理单条微博的所有图片。
    
    Args:
        post: 爬虫返回的微博文档（应包含 local_images 字段）
        quality: 压缩质量
        dry_run: 仅压缩，不上传
        output_dir: 压缩输出目录（默认 SCRIPT_DIR/weibo_photos_compressed）
        workers: 上传并发数
    
    Returns:
        更新后的 post 文档，新增 processed_images 字段：
        {
            "cdn_urls": [...],  # 上传成功的 CDN URL 列表
            "local_compressed": [...],  # 压缩后的本地路径
            "errors": [...]  # 错误信息
        }
    """
    if output_dir is None:
        output_dir = SCRIPT_DIR / "weibo_photos_compressed"

    local_images = post.get("local_images", [])
    if not local_images:
        post["processed_images"] = {
            "cdn_urls": [],
            "local_compressed": [],
            "errors": [],
        }
        return post

    processor = ImageProcessor(quality=quality, dry_run=dry_run, workers=workers)
    results = []

    output_dir.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(processor.process_image, Path(img), output_dir): img
            for img in local_images
        }
        for future in as_completed(futures):
            results.append(future.result())

    # 整理结果
    cdn_urls = [r["cdn_url"] for r in results if r["cdn_url"]]
    local_compressed = [r["compressed_path"] for r in results if r["compressed_path"]]
    errors = [r["error"] for r in results if r["error"]]

    post["processed_images"] = {
        "cdn_urls": cdn_urls,
        "local_compressed": local_compressed,
        "errors": errors,
    }

    return post


def process_posts_batch(
    posts: list[dict],
    quality: int = 75,
    dry_run: bool = False,
    output_dir: Optional[Path] = None,
    workers: int = 3,
) -> list[dict]:
    """
    批量处理微博的图片。
    
    Args:
        posts: 微博列表
        quality: 压缩质量
        dry_run: 仅压缩，不上传
        output_dir: 压缩输出目录
        workers: 上传并发数
    
    Returns:
        处理后的 posts 列表
    """
    return [
        process_post_images(post, quality, dry_run, output_dir, workers)
        for post in posts
    ]


def print_process_summary(posts: list[dict]) -> None:
    """打印处理总结"""
    total_posts = len(posts)
    posts_with_images = sum(1 for p in posts if p.get("processed_images", {}).get("cdn_urls"))
    total_uploaded = sum(len(p.get("processed_images", {}).get("cdn_urls", [])) for p in posts)
    total_errors = sum(len(p.get("processed_images", {}).get("errors", [])) for p in posts)

    print(f"\n{'─'*50}")
    print(f"处理完成统计：")
    print(f"  总微博数: {total_posts}")
    print(f"  有图片的微博: {posts_with_images}")
    print(f"  成功上传图片: {total_uploaded}")
    print(f"  上传失败: {total_errors}")
    print(f"{'─'*50}")


if __name__ == "__main__":
    print("image_processor.py —— 图片压缩与上传集成")
    print("参考 data/scripts/compress_and_upload.py，在爬虫工作流中使用。")
