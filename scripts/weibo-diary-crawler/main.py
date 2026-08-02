"""
main.py —— 程序入口
组装 crawler / image_downloader / storage / scheduler 四个模块，
支持 --run-now CLI 参数立即执行一次爬取，随后进入定时调度循环。
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import yaml
from dotenv import load_dotenv
from loguru import logger

# 自动加载同目录下的 .env 文件
load_dotenv(Path(__file__).parent / ".env")

# ---- 日志初始化 ----
os.makedirs("logs", exist_ok=True)
logger.remove()
# 控制台：INFO 级别，彩色输出
logger.add(sys.stderr, level="INFO", colorize=True,
           format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")
# 文件：DEBUG 级别，按天滚动，保留 30 天
logger.add(
    "logs/diary_{time:YYYY-MM-DD}.log",
    level="DEBUG",
    rotation="00:00",
    retention="30 days",
    encoding="utf-8",
)


def load_config(config_path: str = "config.yaml") -> dict:
    """加载 YAML 配置文件"""
    if not os.path.isfile(config_path):
        logger.error("配置文件不存在：{}", config_path)
        sys.exit(1)
    with open(config_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    logger.info("配置文件加载成功：{}", config_path)
    return cfg


def run_crawl_job(cfg: dict, enable_pipeline: bool = True):
    """
    单次爬取任务。支持两种工作模式：
    
    1. 完整管道模式（enable_pipeline=True）：
       爬取 → 下载图片 → 压缩上传 → 生成 bits → 写入存储
    
    2. 原始模式（enable_pipeline=False）：
       爬取 → 下载图片 → 写入存储
    
    由 scheduler 每日定时调用，也可通过 --run-now 手动触发。
    """
    if enable_pipeline:
        # 使用完整管道
        from pipeline import run_full_pipeline
        run_full_pipeline(cfg)
    else:
        # 原始工作流（向后兼容）
        from crawler import DiaryWeiboCrawler
        from image_downloader import download_weibo_images
        from storage import create_storage

        logger.info("=" * 60)
        logger.info("爬取任务开始 {}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

        # 1. 爬取微博列表
        try:
            crawler = DiaryWeiboCrawler(cfg["weibo"])
            posts = crawler.fetch_latest()
        except Exception as e:
            logger.exception("爬取微博失败：{}", e)
            return

        if not posts:
            logger.warning("本次未获取到任何微博，任务结束")
            return

        logger.info("共获取 {} 条微博，开始下载图片", len(posts))

        # 2. 下载图片（复用 crawler 的 session 以保持 Cookie 状态）
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
                    session=crawler.session,   # 复用已鉴权的 session
                    timeout=img_timeout,
                    max_retries=img_max_retries,
                )
                post["local_images"] = local_paths
            else:
                post["local_images"] = []
                logger.debug("微博 {} 无图片，跳过下载", post["weibo_id"])

        # 3. 持久化存储（JSON 或 MongoDB，由 config.yaml storage.mode 决定）
        try:
            storage = create_storage(cfg)
            # 附加爬取时间戳
            crawled_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            for post in posts:
                post["crawled_at"] = crawled_at

            new_cnt, upd_cnt = storage.upsert_many(posts)
            storage.close()
            logger.info("存储写入完成：新增 {} 条，更新 {} 条", new_cnt, upd_cnt)
        except Exception as e:
            logger.exception("写入 MongoDB 失败：{}", e)

        logger.info("爬取任务结束 {}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="微博个人日记定时爬取系统")
    parser.add_argument(
        "--config", default="config.yaml", help="配置文件路径（默认 config.yaml）"
    )
    parser.add_argument(
        "--run-now", action="store_true", help="立即执行一次爬取，随后进入定时调度"
    )
    parser.add_argument(
        "--fetch-mode", choices=["count", "since_date"], default=None,
        help="爬取模式：count=最新N条，since_date=从指定日期起（覆盖 config.yaml）"
    )
    parser.add_argument(
        "--fetch-count", type=int, default=None,
        help="fetch_mode=count 时的抓取条数（覆盖 config.yaml）"
    )
    parser.add_argument(
        "--fetch-since-date", default=None,
        help="fetch_mode=since_date 时的起始日期 YYYY-MM-DD（覆盖 config.yaml）"
    )
    args = parser.parse_args()

    cfg = load_config(args.config)

    # CLI 参数覆盖 config.yaml 中的 weibo 爬取配置
    if args.fetch_mode is not None:
        cfg.setdefault("weibo", {})["fetch_mode"] = args.fetch_mode
    if args.fetch_count is not None:
        cfg.setdefault("weibo", {})["fetch_count"] = args.fetch_count
    if args.fetch_since_date is not None:
        cfg.setdefault("weibo", {})["fetch_since_date"] = args.fetch_since_date

    # 读取管道配置
    pipeline_cfg = cfg.get("pipeline", {})
    enable_pipeline = pipeline_cfg.get("enabled", True)

    # 将 cfg 绑定到任务函数
    def job():
        run_crawl_job(cfg, enable_pipeline=enable_pipeline)

    # --run-now：执行一次后直接退出（供 CI 调用）
    if args.run_now:
        job()
        return

    # 常驻模式：进入 APScheduler 定时循环（本地部署时使用）
    from scheduler import start_scheduler
    run_time = cfg.get("scheduler", {}).get("run_time", "23:30")
    start_scheduler(job_fn=job, run_time=run_time, run_now=False)


if __name__ == "__main__":
    main()
