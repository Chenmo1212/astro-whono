"""
pipeline.py —— 完整爬取 → 压缩 → 上传 → bits转换 的处理管道

将爬虫输出、图片处理、bits 转换串联成一个统一的工作流。

用法：
    from pipeline import run_full_pipeline
    
    cfg = load_config("config.yaml")
    posts = run_full_pipeline(cfg, cdn_domain="https://cdn.chenmo1212.cn")
"""

import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# 自动加载同目录下的 .env 文件
load_dotenv(Path(__file__).parent / ".env")

# pipeline.py 所在目录（scripts/weibo-diary-crawler/）
_SCRIPT_DIR = Path(__file__).resolve().parent

from crawler import DiaryWeiboCrawler
from image_downloader import download_weibo_images
from image_processor import process_post_images, print_process_summary
from bits_converter import batch_write_bits_files
from storage import create_storage


def _write_pipeline_summary(posts: list[dict], privacy_results: list[dict], summary_path: str) -> None:
    """
    将管道运行结果写入 JSON 摘要文件，供通知脚本读取。

    Args:
        posts: 处理后的微博列表
        privacy_results: 隐私检查结果列表（可为空）
        summary_path: 输出 JSON 文件路径
    """
    post_summaries = []
    for post in posts:
        processed = post.get("processed_images", {})
        cdn_urls = processed.get("cdn_urls", [])
        img_errors = processed.get("errors", [])

        # 是否被隐私检查标记为加密
        encrypted = False
        if privacy_results:
            filename = None
            created_at = post.get("created_at", "")
            if created_at:
                try:
                    from datetime import datetime as _dt
                    dt = _dt.fromisoformat(created_at)
                    filename = f"bits-{dt.strftime('%Y-%m-%d-%H%M')}.md"
                except (ValueError, TypeError):
                    pass
            if filename:
                for r in privacy_results:
                    if os.path.basename(r.get("path", "")) == filename and r.get("sensitive"):
                        encrypted = True
                        break

        post_summaries.append({
            "weibo_id":    str(post.get("weibo_id", "")),
            "created_at":  post.get("created_at", ""),
            "image_count": len(cdn_urls) if cdn_urls else len(post.get("local_images", [])),
            "img_errors":  len(img_errors),
            "encrypted":   encrypted,
        })

    summary = {
        "total":         len(posts),
        "encrypted":     sum(1 for p in post_summaries if p["encrypted"]),
        "total_images":  sum(p["image_count"] for p in post_summaries),
        "img_errors":    sum(p["img_errors"] for p in post_summaries),
        "posts":         post_summaries,
    }

    with open(summary_path, "w", encoding="utf-8") as f:
        import json as _json
        _json.dump(summary, f, ensure_ascii=False, indent=2)
    logger.info("✓ 管道摘要已写入：{}", summary_path)


def run_full_pipeline(
    cfg: dict,
    cdn_domain: str = "",
    cdn_prefix: str = "blog",
    image_quality: int = 75,
    image_dry_run: bool = False,
    bits_write: bool = True,
    bits_output_dir = None,
    summary_path: str = str(_SCRIPT_DIR / "pipeline_summary.json"),
) -> list[dict]:
    """
    完整处理管道：爬取 → 下载图片 → 压缩上传 → 生成 bits markdown → 隐私检查。
    
    Args:
        cfg: 配置字典（config.yaml 内容）
        cdn_domain: CDN 域名（如 https://cdn.chenmo1212.cn）
        cdn_prefix: CDN 前缀（默认 blog）
        image_quality: 图片压缩质量（1-100，默认 75）
        image_dry_run: 图片处理是否为干运行（仅压缩，不上传）
        bits_write: 是否实际写入 bits 文件
        bits_output_dir: bits 输出目录（默认 src/content/bits）
        summary_path: 管道摘要 JSON 输出路径（供通知脚本读取）
    
    Returns:
        处理后的完整微博列表
    """
    logger.info("=" * 70)
    logger.info("启动完整处理管道")
    logger.info("=" * 70)

    posts = []

    # ── 步骤1：爬取微博 ──
    try:
        logger.info("【步骤 1/4】爬取微博...")
        crawler = DiaryWeiboCrawler(cfg["weibo"])
        posts = crawler.fetch_latest()
        if not posts:
            logger.warning("未获取到任何微博，管道结束")
            return []
        logger.info("✓ 爬取完成：共获取 {} 条微博", len(posts))
    except Exception as e:
        logger.exception("爬取失败：{}", e)
        return []

    # ── 去重：过滤掉已在 posts.json 中存在的微博 ──
    try:
        from bits_converter import _load_existing_weibo_ids
        storage_cfg = cfg.get("storage", {}) if isinstance(cfg, dict) else {}
        if storage_cfg.get("mode", "json") == "json" and storage_cfg.get("json_path"):
            json_path = Path(storage_cfg["json_path"])
            existing_ids = _load_existing_weibo_ids(json_path)
            if existing_ids:
                before = len(posts)
                posts = [p for p in posts if str(p.get("weibo_id", "")) not in existing_ids]
                skipped = before - len(posts)
                if skipped:
                    logger.info("去重：跳过 {} 条已存在于 posts.json 的微博，剩余 {} 条待处理", skipped, len(posts))
            if not posts:
                logger.info("所有微博均已处理，管道结束")
                return []
    except Exception as e:
        logger.warning("去重检查失败，继续处理全部微博：{}", e)

    # ── 步骤2：下载和压缩图片 ──
    try:
        logger.info("【步骤 2/4】下载并压缩图片...")
        img_cfg = cfg.get("images", {})
        save_root = img_cfg.get("save_dir", "./images")
        img_timeout = int(img_cfg.get("timeout", 30))
        img_max_retries = int(img_cfg.get("max_retries", 3))

        for post in posts:
            pic_urls = post.get("pics", [])
            if pic_urls:
                local_paths = download_weibo_images(
                    weibo_id=post["weibo_id"],
                    created_at=post.get("full_created_at", post.get("created_at", "")),
                    pic_urls=pic_urls,
                    save_root=save_root,
                    session=crawler.session,
                    timeout=img_timeout,
                    max_retries=img_max_retries,
                )
                post["local_images"] = local_paths
            else:
                post["local_images"] = []
                logger.debug("微博 {} 无图片", post["weibo_id"])

        logger.info("✓ 图片下载完成")
    except Exception as e:
        logger.exception("图片下载失败：{}", e)
        # 不中断管道，继续处理无图片的微博

    # ── 步骤3：上传到 CDN ──
    try:
        logger.info("【步骤 3/4】上传图片到 CDN...")
        for post in posts:
            if post.get("local_images"):
                post = process_post_images(
                    post,
                    quality=image_quality,
                    dry_run=image_dry_run,
                )
                if post.get("processed_images", {}).get("cdn_urls"):
                    logger.info(
                        "微博 {} 上传成功：{} 张图片",
                        post["weibo_id"],
                        len(post["processed_images"]["cdn_urls"])
                    )
                if post.get("processed_images", {}).get("errors"):
                    logger.warning(
                        "微博 {} 上传出错：{}",
                        post["weibo_id"],
                        post["processed_images"]["errors"]
                    )

        print_process_summary(posts)
        logger.info("✓ 图片上传完成")
    except Exception as e:
        logger.exception("图片上传失败：{}", e)

    # ── 步骤4：生成 bits markdown ──
    output_paths = []
    try:
        logger.info("【步骤 4/5】生成 bits markdown 文件...")
        
        if bits_output_dir is None:
            from bits_converter import OUTPUT_DIR
            bits_output_dir = OUTPUT_DIR
        else:
            bits_output_dir = Path(bits_output_dir)
        
        output_paths = batch_write_bits_files(
            posts,
            output_dir=bits_output_dir,
            cdn_prefix=cdn_prefix,
            cdn_domain=cdn_domain,
            write=bits_write,
        )
        logger.info("✓ bits 文件生成完成：{} 个文件", len(output_paths))
    except Exception as e:
        logger.exception("bits 文件生成失败：{}", e)

    # ── 步骤5：隐私检查 ──
    pipeline_privacy_results: list[dict] = []
    privacy_cfg = cfg.get("privacy", {})
    privacy_enabled = privacy_cfg.get("enabled", False)
    if privacy_enabled and bits_write and output_paths:
        try:
            logger.info("【步骤 5/6】运行隐私敏感性检查...")
            from check_privacy import check_and_apply_privacy

            api_key = os.environ.get("DEEPSEEK_API_KEY", "")
            if not api_key:
                logger.warning(
                    "check_privacy: 未设置环境变量 DEEPSEEK_API_KEY，跳过隐私检查"
                )
            else:
                pipeline_privacy_results = check_and_apply_privacy(
                    file_paths=output_paths,
                    api_key=api_key,
                    model=privacy_cfg.get("model", "deepseek-chat"),
                    timeout=int(privacy_cfg.get("timeout", 60)),
                    apply=privacy_cfg.get("apply", True),
                )
                flagged = [r for r in pipeline_privacy_results if r["sensitive"] and not r["error"]]
                errors  = [r for r in pipeline_privacy_results if r["error"]]
                logger.info(
                    "✓ 隐私检查完成：{} 篇需加密，{} 篇出错",
                    len(flagged), len(errors),
                )
        except Exception as e:
            logger.exception("隐私检查失败：{}", e)
    elif privacy_enabled and not bits_write:
        logger.debug("check_privacy: bits_write=False，跳过隐私检查（无文件写入）")

    # ── 步骤6：写入存储 ──
    try:
        logger.info("【步骤 6/6】持久化存储...")
        storage = create_storage(cfg)
        crawled_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for post in posts:
            post["crawled_at"] = crawled_at

        new_cnt, upd_cnt = storage.upsert_many(posts)
        storage.close()
        logger.info("✓ 存储写入完成：新增 {} 条，更新 {} 条", new_cnt, upd_cnt)
    except Exception as e:
        logger.exception("存储写入失败：{}", e)

    # ── 写入管道摘要（供通知脚本读取）──
    try:
        _write_pipeline_summary(posts, pipeline_privacy_results, summary_path)
    except Exception as e:
        logger.warning("管道摘要写入失败（不影响结果）：{}", e)

    logger.info("=" * 70)
    logger.info("✓ 完整管道执行完成")
    logger.info("=" * 70)

    return posts


if __name__ == "__main__":
    print("pipeline.py —— 完整爬取处理管道")
    print("在 main.py 中集成使用，将爬虫工作流自动化。")
