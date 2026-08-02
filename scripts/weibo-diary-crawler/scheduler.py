"""
scheduler.py —— APScheduler 定时任务模块
使用 APScheduler 的 BlockingScheduler 实现每日定时爬取。
首次启动时立即执行一次，随后按 config.yaml 中指定的时间每天运行。
"""

from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger


def build_scheduler(job_fn, run_time: str = "23:30") -> BlockingScheduler:
    """
    构建调度器，将 job_fn 注册为每日定时任务。

    参数:
        job_fn   : 无参可调用对象，爬取任务的主函数
        run_time : "HH:MM" 格式的每日执行时间，来自 config.yaml scheduler.run_time
    返回:
        配置完成但尚未启动的 BlockingScheduler 实例
    """
    try:
        hour, minute = run_time.strip().split(":")
        int(hour), int(minute)  # 格式校验
    except (ValueError, AttributeError):
        logger.warning("run_time 格式不正确（应为 HH:MM），使用默认值 23:30")
        hour, minute = "23", "30"

    scheduler = BlockingScheduler(timezone="Asia/Shanghai")

    trigger = CronTrigger(hour=int(hour), minute=int(minute), timezone="Asia/Shanghai")
    scheduler.add_job(
        job_fn,
        trigger=trigger,
        id="daily_weibo_crawl",
        name="每日微博日记爬取",
        replace_existing=True,
        misfire_grace_time=300,   # 允许最多延迟 5 分钟触发
        coalesce=True,            # 错过多次时只补跑一次
    )

    logger.info("定时任务已注册：每天 {}:{} 执行", hour, minute)
    return scheduler


def start_scheduler(job_fn, run_time: str = "23:30", run_now: bool = False):
    """
    启动调度器主入口。

    参数:
        job_fn   : 爬取任务函数
        run_time : 每日执行时间（HH:MM）
        run_now  : 若为 True，则在进入调度循环前立即执行一次
    """
    if run_now:
        logger.info("--run-now 参数已指定，立即执行一次爬取")
        try:
            job_fn()
        except Exception as e:
            logger.exception("立即执行爬取任务失败：{}", e)

    scheduler = build_scheduler(job_fn, run_time)
    logger.info("调度器启动，等待下次执行时间 {}（按 Ctrl+C 退出）", run_time)
    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("收到中断信号，调度器已停止")
    except Exception as e:
        logger.exception("调度器异常退出：{}", e)
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)
