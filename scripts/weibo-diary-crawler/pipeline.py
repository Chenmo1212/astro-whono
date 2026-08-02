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

from crawler import DiaryWeiboCrawler
from image_downloader import download_weibo_images
from image_processor import process_post_images, print_process_summary
from bits_converter import batch_write_bits_files
from storage import create_storage


def run_full_pipeline(
    cfg: dict,
    cdn_domain: str = "",
    cdn_prefix: str = "blog",
    image_quality: int = 75,
    image_dry_run: bool = False,
    bits_write: bool = True,
    bits_output_dir = None,
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
        
        from pathlib import Path
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
                privacy_results = check_and_apply_privacy(
                    file_paths=output_paths,
                    api_key=api_key,
                    model=privacy_cfg.get("model", "deepseek-chat"),
                    timeout=int(privacy_cfg.get("timeout", 60)),
                    apply=privacy_cfg.get("apply", True),
                )
                flagged = [r for r in privacy_results if r["sensitive"] and not r["error"]]
                errors  = [r for r in privacy_results if r["error"]]
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

    logger.info("=" * 70)
    logger.info("✓ 完整管道执行完成")
    logger.info("=" * 70)

    return posts


if __name__ == "__main__":
    print("pipeline.py —— 完整爬取处理管道")
    print("在 main.py 中集成使用，将爬虫工作流自动化。")
