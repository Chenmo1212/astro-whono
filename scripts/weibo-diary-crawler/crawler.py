"""
crawler.py —— 微博爬取核心逻辑
从 weibo.py 中抽取以下方法并精简为个人日记专用版本：
  - Cookie 处理 + Session 预热         ← Weibo.__init__()
  - get_weibo_json()                   ← Weibo.get_weibo_json()
  - get_long_weibo()                   ← Weibo.get_long_weibo()
  - get_pics()                         ← Weibo.get_pics()
  - parse_weibo()                      ← Weibo.parse_weibo()
  - get_one_weibo()                    ← Weibo.get_one_weibo()
  - get_one_page()                     ← Weibo.get_one_page()（简化版，仅取前N条）
  - fetch_latest()                     ← 对外统一入口
"""

import json
import re
from datetime import datetime
from time import sleep
from typing import Optional

import certifi
import requests
from lxml import etree
from loguru import logger
from requests.adapters import HTTPAdapter
from requests.exceptions import RequestException

from utils import (
    DTFORMAT,
    clean_html,
    standardize_date,
    standardize_info,
    string_to_int,
    parse_cookie_string,
)


class DiaryWeiboCrawler:
    """
    个人微博日记爬取器。
    只爬取自己账号最新 N 条原创微博，不爬评论/转发。
    Session、请求头、Cookie 处理全部对应 weibo.py Weibo.__init__() 逻辑。
    """

    # 复用原项目的请求头（直接抄自 weibo.py）
    _HEADERS = {
        "Referer": "https://m.weibo.cn/",
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "cache-control": "max-age=0",
        "priority": "u=0, i",
        "sec-ch-ua": '"Chromium";v="136", "Microsoft Edge";v="136", "Not.A/Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
        ),
    }

    def __init__(self, cfg: dict):
        """
        初始化爬取器。
        cfg 对应 config.yaml 中的 weibo 节点：
          - cookie        : 原始 Cookie 字符串
          - uid           : 自己的微博数字 UID
          - fetch_count   : 每次爬取最新几条（默认 5）
          - page_weibo_count : 每页请求条数（默认 10）
        """
        self.uid = str(cfg["uid"])
        self.fetch_count = int(cfg.get("fetch_count", 5))
        self.page_weibo_count = int(cfg.get("page_weibo_count", 10))

        cookie_str = cfg.get("cookie", "")
        # ---- Cookie 解析（直接复用 weibo.py 逻辑）----
        core_cookies, backup_cookies = parse_cookie_string(cookie_str)

        self.session = requests.Session()
        self.session.cookies.update(core_cookies)

        # Session 预热：让服务器下发最新指纹（同 weibo.py Weibo.__init__()）
        try:
            self.session.get("https://m.weibo.cn", headers=self._HEADERS, timeout=10)
            logger.info("Session 预热成功")
        except Exception as e:
            logger.warning("Session 预热失败（{}），启用备份 Cookie", e)
            self.session.cookies.update(backup_cookies)

        adapter = HTTPAdapter(max_retries=5)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    # ------------------------------------------------------------------ #
    #   以下方法一一对应 weibo.py 中的同名方法，逻辑保持一致，仅去掉      #
    #   与本模块无关的部分（只爬转发、评论、视频、LLM 分析等）             #
    # ------------------------------------------------------------------ #

    def _get_weibo_json(self, page: int) -> dict:
        """
        获取指定页的微博 JSON 数据。
        对应 weibo.py Weibo.get_weibo_json()，保留指数退避重试逻辑。
        """
        url = "https://m.weibo.cn/api/container/getIndex?"
        params = {
            "containerid": f"230413{self.uid}",
            "page": page,
            "count": self.page_weibo_count,
        }
        max_retries = 5
        backoff_factor = 5

        for attempt in range(1, max_retries + 1):
            try:
                resp = self.session.get(
                    url, params=params, headers=self._HEADERS, timeout=10, verify=certifi.where()
                )
                resp.raise_for_status()
                js = resp.json()
                if "data" in js:
                    logger.info("成功获取第 {} 页数据", page)
                    return js
                else:
                    logger.warning("第 {} 页返回数据无 data 字段，可能触发验证码", page)
                    return {}
            except RequestException as e:
                wait = backoff_factor * (2 ** attempt)
                logger.warning("请求失败（{}/{}），{}秒后重试：{}", attempt, max_retries, wait, e)
                sleep(wait)
            except ValueError as e:
                wait = backoff_factor * (2 ** attempt)
                logger.warning("JSON 解析失败（{}/{}），{}秒后重试：{}", attempt, max_retries, wait, e)
                sleep(wait)

        logger.error("超过最大重试次数，跳过第 {} 页", page)
        return {}

    def _get_long_weibo(self, weibo_id: str) -> Optional[dict]:
        """
        获取长微博完整内容。
        对应 weibo.py Weibo.get_long_weibo()，逻辑完全一致。
        """
        url = f"https://m.weibo.cn/detail/{weibo_id}"
        for _ in range(5):
            sleep(1.0)
            try:
                html = self.session.get(url, headers=self._HEADERS, verify=certifi.where()).text
                html = html[html.find('"status":'):]
                html = html[: html.rfind('"call"')]
                html = html[: html.rfind(",")]
                html = "{" + html + "}"
                js = json.loads(html, strict=False)
                weibo_info = js.get("status")
                if weibo_info:
                    return self._parse_weibo(weibo_info)
            except Exception as e:
                logger.debug("获取长微博失败，将使用摘要版本：{}", e)
        return None

    def _get_pics(self, weibo_info: dict) -> list[str]:
        """
        获取微博原始图片 URL 列表。
        对应 weibo.py Weibo.get_pics()，直接取 pic['large']['url']（即去水印原图）。
        """
        if weibo_info.get("pics"):
            return [
                pic["large"]["url"]
                for pic in weibo_info["pics"]
                if isinstance(pic, dict) and pic.get("large")
            ]
        return []

    def _get_location(self, selector) -> str:
        """获取微博发布位置，对应 weibo.py Weibo.get_location()"""
        location_icon = "timeline_card_small_location_default.png"
        span_list = selector.xpath("//span")
        for i, span in enumerate(span_list):
            if span.xpath("img/@src"):
                if location_icon in span.xpath("img/@src")[0]:
                    return span_list[i + 1].xpath("string(.)")
        return ""

    def _get_topics(self, selector) -> str:
        """获取话题，对应 weibo.py Weibo.get_topics()"""
        span_list = selector.xpath("//span[@class='surl-text']")
        topics = []
        for span in span_list:
            text = span.xpath("string(.)")
            if len(text) > 2 and text[0] == "#" and text[-1] == "#":
                topics.append(text[1:-1])
        return ",".join(topics)

    def _parse_weibo(self, weibo_info: dict) -> dict:
        """
        解析单条微博 JSON 为结构化字典。
        对应 weibo.py Weibo.parse_weibo()，仅保留日记需要的字段，
        去掉 LLM 分析、转发微博等无关逻辑。
        """
        text_body = weibo_info.get("text", "")
        selector = etree.HTML(
            f"{text_body}<hr>" if (text_body and text_body.isspace()) else text_body
        )

        weibo = {
            "user_id": weibo_info["user"]["id"] if weibo_info.get("user") else "",
            "screen_name": weibo_info["user"]["screen_name"] if weibo_info.get("user") else "",
            "id": int(weibo_info["id"]),
            "bid": weibo_info.get("bid", ""),
            # 清洗后的纯文本（对应原项目 remove_html_tag=1 分支）
            "text": clean_html(text_body) if selector is not None else re.sub(r"<[^>]+>", "", text_body),
            # 保留原始 HTML 备用
            "text_html": text_body,
            # 图片 URL 列表（large 原图，已去水印）
            "pics": self._get_pics(weibo_info),
            "location": self._get_location(selector) if selector is not None else "",
            "topics": self._get_topics(selector) if selector is not None else "",
            "created_at": weibo_info.get("created_at", ""),
            "source": weibo_info.get("source", ""),
            "attitudes_count": string_to_int(weibo_info.get("attitudes_count", 0)),
            "comments_count": string_to_int(weibo_info.get("comments_count", 0)),
            "reposts_count": string_to_int(weibo_info.get("reposts_count", 0)),
        }
        return standardize_info(weibo)

    def _get_one_weibo(self, card: dict) -> Optional[dict]:
        """
        从单张 card 中提取并处理一条微博。
        对应 weibo.py Weibo.get_one_weibo()：处理长微博、标准化时间。
        """
        try:
            weibo_info = card["mblog"]
            weibo_id = weibo_info["id"]
            # 判断是否为长微博（原项目逻辑）
            is_long = (
                True if weibo_info.get("pic_num", 0) > 9 else weibo_info.get("isLongText", False)
            )
            # 跳过转发微博，只保留原创
            if weibo_info.get("retweeted_status"):
                return None

            weibo = self._get_long_weibo(weibo_id) if is_long else None
            if not weibo:
                weibo = self._parse_weibo(weibo_info)

            # 标准化时间（对应 weibo.py standardize_date 调用）
            dt_str, full_str = standardize_date(weibo_info["created_at"])
            weibo["created_at"] = dt_str
            weibo["full_created_at"] = full_str
            return weibo
        except Exception as e:
            logger.exception("解析单条微博失败：{}", e)
            return None

    def fetch_latest(self) -> list[dict]:
        """
        爬取自己账号最新 fetch_count 条原创微博，返回结构化列表。
        对应 weibo.py Weibo.get_one_page() 简化版：
          - 只爬第 1 页
          - 按顺序取前 fetch_count 条原创（card_type=9 且无 retweeted_status）
          - 不做 since_date 过滤（调用方通过 MongoDB 幂等写入自行去重）

        返回字段说明：
          weibo_id      : 微博唯一 ID（字符串）
          created_at    : 发布时间（YYYY-MM-DDTHH:MM:SS）
          full_created_at: 发布时间（YYYY-MM-DD HH:MM:SS）
          text          : 正文纯文本
          text_html     : 正文原始 HTML
          pics          : 图片原始 URL 列表（large 原图）
          local_images  : 下载后的本地路径列表（由 main.py 在下载后写入）
        """
        logger.info("开始爬取 UID={} 的最新微博（目标条数: {}）", self.uid, self.fetch_count)
        results: list[dict] = []

        page = 1
        while len(results) < self.fetch_count:
            js = self._get_weibo_json(page)
            if not js or not js.get("ok"):
                logger.warning("第 {} 页数据为空或请求失败，停止翻页", page)
                break

            cards = js.get("data", {}).get("cards", [])
            if not cards:
                break

            for card in cards:
                if len(results) >= self.fetch_count:
                    break
                # card_type=11 是分组卡片，需展开
                if card.get("card_type") == 11:
                    group = card.get("card_group", [])
                    card = group[0] if group else card
                # card_type=9 才是微博正文卡片（原项目逻辑）
                if card.get("card_type") != 9:
                    continue
                wb = self._get_one_weibo(card)
                if wb is None:
                    continue
                # 为与 MongoDB 文档对齐，统一使用 weibo_id 字段名
                wb["weibo_id"] = str(wb.pop("id"))
                wb.setdefault("local_images", [])
                results.append(wb)
                logger.info(
                    "已获取微博 weibo_id={} created_at={}",
                    wb["weibo_id"],
                    wb["created_at"],
                )

            # 当页不足则停止翻页（避免无意义请求）
            if len(cards) < self.page_weibo_count:
                break
            page += 1
            sleep(2)  # 翻页间隔，避免过快被限制

        logger.info("爬取完成，共获取 {} 条微博", len(results))
        return results
