"""
utils.py —— 工具函数模块
直接复用 weibo.py 中的日期标准化、HTML清洗、字符串转整数等逻辑。
"""

import re
import sys
from datetime import datetime, timedelta

from loguru import logger

# 日期时间格式，与原项目保持一致
DTFORMAT = "%Y-%m-%dT%H:%M:%S"


def standardize_date(created_at: str) -> tuple[str, str]:
    """
    标准化微博发布时间。
    原始 created_at 可能是 "刚刚"、"3分钟前"、"2小时前"、"昨天 12:30"
    或标准 RFC 格式（如 'Mon Jan 01 00:00:00 +0800 2024'）。
    返回 (created_at_dt_str, full_created_at_str) 两个字符串。
    逻辑直接抽取自 weibo.py Weibo.standardize_date()。
    """
    if "刚刚" in created_at:
        ts = datetime.now()
    elif "分钟" in created_at:
        minute = created_at[: created_at.find("分钟")]
        ts = datetime.now() - timedelta(minutes=int(minute))
    elif "小时" in created_at:
        hour = created_at[: created_at.find("小时")]
        ts = datetime.now() - timedelta(hours=int(hour))
    elif "昨天" in created_at:
        ts = datetime.now() - timedelta(days=1)
    else:
        # 去掉 +0800，用 %c 解析 RFC 格式时间
        created_at = created_at.replace("+0800 ", "")
        ts = datetime.strptime(created_at, "%c")

    dt_str = ts.strftime(DTFORMAT)
    full_str = ts.strftime("%Y-%m-%d %H:%M:%S")
    return dt_str, full_str


def clean_html(text: str) -> str:
    """
    清洗 HTML 标签，保留纯文本。
    对于 @ 和 # 开头的片段，与相邻片段合并以避免多余换行。
    逻辑抽取自 weibo.py Weibo.parse_weibo() 中的 remove_html_tag 处理。
    """
    from lxml import etree

    # 空白文本特殊处理：添加 <hr> 使 lxml 不产生空文档
    selector = etree.HTML(f"{text}<hr>" if text.isspace() else text)
    if selector is None:
        # lxml 解析失败时降级为正则去标签
        return re.sub(r"<[^>]+>", "", text).strip()

    text_list = selector.xpath("//text()")
    # 将 @ # 开头的元素与前后合并，避免错误换行
    merged: list[str] = []
    for i, elem in enumerate(text_list):
        if merged and (merged[-1].startswith(("@", "#")) or elem.startswith(("@", "#"))):
            merged[-1] += elem
        else:
            merged.append(elem)
    return "\n".join(merged)


def standardize_info(weibo: dict) -> dict:
    """
    清除字典值中的零宽空格及编码乱码，与 weibo.py 保持一致。
    """
    for k, v in weibo.items():
        if not isinstance(v, (bool, int, list)):
            weibo[k] = (
                v.replace("\u200b", "")
                .encode(sys.stdout.encoding, "ignore")
                .decode(sys.stdout.encoding)
            )
    return weibo


def string_to_int(value) -> int:
    """
    将微博返回的"万+"、"万"、"亿"等字符串转为整数。
    直接抽取自 weibo.py Weibo.string_to_int()。
    """
    if isinstance(value, int):
        return value
    s = str(value)
    if s.endswith("万+"):
        s = s[:-2] + "0000"
    elif s.endswith("万"):
        s = str(float(s[:-1]) * 10000)
    elif s.endswith("亿"):
        s = str(float(s[:-1]) * 100000000)
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def parse_cookie_string(cookie_string: str) -> tuple[dict, dict]:
    """
    将浏览器复制的原始 Cookie 字符串解析为字典。
    优先提取核心 SUB 字段，保底则全量解析。
    逻辑来自 weibo.py Weibo.__init__() 中的 Cookie 清洗部分。
    """
    if not cookie_string:
        return {}, {}

    core: dict = {}
    backup: dict = {}

    if "SUB=" in cookie_string:
        # 提取核心 SUB
        m = re.search(r"SUB=(.*?)(;|$)", cookie_string)
        if m:
            core["SUB"] = m.group(1)
        # 提取备份指纹 _T_WM / XSRF-TOKEN
        m_twm = re.search(r"_T_WM=(.*?)(;|$)", cookie_string)
        if m_twm:
            backup["_T_WM"] = m_twm.group(1)
        m_xsrf = re.search(r"XSRF-TOKEN=(.*?)(;|$)", cookie_string)
        if m_xsrf:
            backup["XSRF-TOKEN"] = m_xsrf.group(1)

    # 保底全量解析
    if not core:
        for pair in cookie_string.split(";"):
            if "=" in pair:
                key, val = pair.split("=", 1)
                core[key.strip()] = val.strip()

    return core, backup
