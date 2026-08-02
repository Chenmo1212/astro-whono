"""
image_downloader.py —— 图片下载与去水印处理
核心下载逻辑直接抽取自 weibo.py Weibo.download_one_file()，
去水印策略参考原项目 get_pics() 中对 pic['large']['url'] 的使用，
并补充 /ori/ 路径尝试以获取更高清原图。
"""

import os
import re
from datetime import datetime
from time import sleep
from typing import Optional

import certifi
import requests
from loguru import logger
from requests.adapters import HTTPAdapter


# sinaimg.cn CDN 要求 Referer 为 weibo.com，且 sec-fetch-* 需符合图片加载场景
_DEFAULT_HEADERS = {
    "Referer": "https://weibo.com/",
    "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    "sec-ch-ua": '"Chromium";v="136", "Microsoft Edge";v="136", "Not.A/Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "image",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "cross-site",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
    ),
}

# 匹配所有低清/缩放路径规格（mw690/mw1200/mw2000 等），替换为 /large/
# large 为全尺寸高清原图；oslarge 虽无水印但经服务端重压缩，质量更低
_LOW_QUALITY_RE = re.compile(
    r"/(thumb150|bmiddle|small|thumbnail|wap360|mw\d+)/"
)


def get_original_pic_url(url: str) -> str:
    """
    将低清或缩放路径替换为 /large/（全尺寸高清）。
    Referer 已设为 weibo.com，sec-fetch-* 已设为图片加载场景，large 不会 403。
    """
    return _LOW_QUALITY_RE.sub("/large/", url)


def _detect_extension(content: bytes, url: str, content_type: str) -> str:
    """
    通过 Magic Number、Content-Type、URL 后缀三重判断文件类型。
    直接抽取自 weibo.py Weibo.download_one_file() 中的文件类型检测逻辑。
    """
    # Magic Number 优先
    if content.startswith(b"\xFF\xD8\xFF"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"

    # Content-Type 次之
    ct = content_type.lower()
    if "image/jpeg" in ct:
        return ".jpg"
    if "image/png" in ct:
        return ".png"
    if "image/gif" in ct:
        return ".gif"
    if "image/webp" in ct:
        return ".webp"
    if "video/mp4" in ct:
        return ".mp4"

    # URL 后缀兜底
    url_path = url.split("?")[0]
    ext = os.path.splitext(url_path)[1].lower()
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov"):
        return ext
    return ".jpg"


def download_image(
    url: str,
    save_dir: str,
    filename_base: str,
    session: Optional[requests.Session] = None,
    timeout: int = 30,
    max_retries: int = 3,
) -> Optional[str]:
    """
    下载单张图片到本地，返回保存的绝对路径；失败返回 None。
    逻辑直接抽取并简化自 weibo.py Weibo.download_one_file()。

    参数:
        url           : 图片 URL（建议已经过 get_original_pic_url 处理）
        save_dir      : 保存目录（不含文件名）
        filename_base : 文件名（不含扩展名）
        session       : 可复用的 requests.Session（传入 None 时自建）
        timeout       : 下载超时秒数
        max_retries   : 最大重试次数
    """
    os.makedirs(save_dir, exist_ok=True)

    # 构建带重试的 Session
    if session is None:
        session = requests.Session()
        adapter = HTTPAdapter(max_retries=3)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(url, headers=_DEFAULT_HEADERS, timeout=timeout, verify=certifi.where())
            resp.raise_for_status()

            content = resp.content
            content_type = resp.headers.get("Content-Type", "")
            ext = _detect_extension(content, url, content_type)

            # JPEG 完整性校验（抽取自原项目）
            if ext == ".jpg" and not content.endswith(b"\xff\xd9"):
                logger.debug("JPEG 不完整，重试 {}/{}", attempt, max_retries)
                continue
            # PNG 完整性校验
            if ext == ".png" and not content.endswith(b"IEND\xaeB`\x82"):
                logger.debug("PNG 不完整，重试 {}/{}", attempt, max_retries)
                continue

            file_path = os.path.join(save_dir, filename_base + ext)
            # 已存在则跳过（幂等）
            if os.path.isfile(file_path):
                logger.debug("图片已存在，跳过：{}", file_path)
                return file_path

            with open(file_path, "wb") as f:
                f.write(content)
            logger.info("图片下载成功：{}", file_path)
            return file_path

        except requests.RequestException as e:
            wait = 2 ** attempt
            logger.warning("图片下载失败（{}/{}），{}秒后重试：{}", attempt, max_retries, wait, e)
            sleep(wait)
        except Exception as e:
            logger.exception("图片下载过程中发生未知错误：{}", e)
            break

    logger.error("图片下载最终失败，已放弃：{}", url)
    return None


def download_weibo_images(
    weibo_id: str,
    created_at: str,
    pic_urls: list[str],
    save_root: str,
    session: Optional[requests.Session] = None,
    timeout: int = 30,
    max_retries: int = 3,
) -> list[str]:
    """
    下载一条微博的所有图片，目录结构为：
        {save_root}/{YYYY}/{YYYYMMDD}_01.jpg

    参数:
        weibo_id   : 微博唯一 ID（字符串）
        created_at : 微博发布时间字符串（格式 "YYYY-MM-DD HH:MM:SS" 或 "YYYY-MM-DDTHH:MM:SS"）
        pic_urls   : 原始图片 URL 列表
        save_root  : 图片保存根目录（对应 config.yaml 中 images.save_dir）

    返回: 成功下载的本地路径列表（与 pic_urls 一一对应，失败的位置为 None 已过滤）
    """
    if not pic_urls:
        return []

    # 解析日期，用于目录名和文件名前缀
    try:
        date_str = created_at[:10]  # 取 "YYYY-MM-DD" 部分
        datetime.strptime(date_str, "%Y-%m-%d")  # 验证格式
    except (ValueError, TypeError):
        date_str = datetime.now().strftime("%Y-%m-%d")

    year_str = date_str[:4]                    # "YYYY"
    date_compact = date_str.replace("-", "")   # "YYYYMMDD"
    save_dir = os.path.join(save_root, year_str)

    local_paths: list[str] = []
    for idx, raw_url in enumerate(pic_urls, start=1):
        # 去水印：优先获取 /large/ 原图
        url = get_original_pic_url(raw_url)
        filename_base = f"{date_compact}_{idx:02d}"   # e.g. "20230109_01"
        path = download_image(
            url=url,
            save_dir=save_dir,
            filename_base=filename_base,
            session=session,
            timeout=timeout,
            max_retries=max_retries,
        )
        if path:
            local_paths.append(path)
        else:
            logger.warning("微博 {} 第 {} 张图片下载失败，URL：{}", weibo_id, idx, url)

    logger.info("微博 {} 共下载图片 {}/{} 张", weibo_id, len(local_paths), len(pic_urls))
    return local_paths
