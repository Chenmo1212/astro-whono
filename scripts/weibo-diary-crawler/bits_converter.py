"""
bits_converter.py —— 将爬虫数据转换为 bits 格式

将 MongoDB/JSON 中存储的微博数据转换为符合 src/content/bits/ 目录结构的 markdown 文件。
输出格式对标 convert_to_bits.py，但数据源来自爬虫数据而非导出的 markdown。

功能：
  - 解析爬虫数据中的 text_html（保留原始 HTML）
  - 提取和清洗 HTML 标签、emoji span、图片链接
  - 生成完整的 frontmatter（date, tags, images, draft）
  - 输出到 src/content/bits/bits-YYYY-MM-DD-HHMM.md

用法：
    from bits_converter import post_to_bits_markdown, write_bits_file
    
    # 将单条微博转换为 markdown 字符串
    md_content = post_to_bits_markdown(post, cdn_domain="https://cdn.chenmo1212.cn")
    
    # 将多条微博写入文件
    for post in posts:
        write_bits_file(post, cdn_domain="https://cdn.chenmo1212.cn", write=True)
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
import html

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "src" / "content" / "bits"

# ── Keyword → tag mapping ──────────────────────────────────────────────────────
# 正文中出现任意关键词时，自动追加对应 tag（大小写敏感）
# 格式：{ "tag名称": ["触发关键词", ...] }
KEYWORD_TAG_MAP: dict[str, list[str]] = {
    "元宝":     ["元宝", "景儿"],
    "健身":     ["健身", "撸铁", "跑步", "有氧", "力量训练"],
    "读书":     ["读书", "在读", "看书", "翻完了", "读完了"],
    "电影":     ["电影", "观影", "看了场", "影院"],
    "旅行":     ["旅行", "出发", "机票", "高铁", "入住"],
    "美食":     ["美食", "吃了", "好吃", "下馆子", "外卖"],
    "工作":     ["工作", "需求", "上线", "代码", "bug", "开会", "项目", "同事", "经理"],
    "生活":     ["室友", "房东", "朋友", "邻居", "同学", "聚餐", "串门", "闺蜜", "干饭"],
}

# ── Regex patterns ─────────────────────────────────────────────────────────────

# HTML hashtag anchor: <a href="...weibo..."><span>...</span></a>
HASHTAG_ANCHOR_RE = re.compile(r'<a\s[^>]*?data-hide[^>]*?>.*?</a>', re.DOTALL)

# Plain-text hashtag line like "#陈默的爱岛生活# 第N天" (2024+ posts have no HTML anchor)
PLAIN_HASHTAG_RE = re.compile(r'^#[^#\n]+#\s*', re.MULTILINE)

# Emoji span: <span class="url-icon"><img ... /></span>
EMOJI_SPAN_RE = re.compile(r'<span\s+class="url-icon">.*?</span>', re.DOTALL)

# HTML <img> in body (from local images after conversion)
BODY_IMG_RE = re.compile(r'<img\s+src="(\./images/([^"]+))"\s.*?/>', re.IGNORECASE)

# Any remaining HTML tag
HTML_TAG_RE = re.compile(r'<[^>]+>')

# 3+ consecutive blank lines → 1 blank line
MULTI_BLANK_RE = re.compile(r'\n{3,}')


def parse_datetime(created_at_str: str) -> tuple[str, str]:
    """
    解析爬虫返回的 created_at（格式 YYYY-MM-DDTHH:MM:SS）。
    返回 (iso_date_str, hhmm_suffix)
    
    Args:
        created_at_str: ISO 8601 格式的日期时间字符串，如 "2025-06-15T14:30:45"
    
    Returns:
        (iso_date_with_tz, hhmm) 其中 iso_date_with_tz="2025-06-15T14:30:45+08:00"
    """
    try:
        dt = datetime.fromisoformat(created_at_str)
        iso_str = dt.strftime("%Y-%m-%dT%H:%M:%S+08:00")
        hhmm = dt.strftime("%H%M")
        return iso_str, hhmm
    except (ValueError, TypeError):
        # 降级处理：使用当前时间
        now = datetime.now()
        iso_str = now.strftime("%Y-%m-%dT%H:%M:%S+08:00")
        hhmm = now.strftime("%H%M")
        return iso_str, hhmm


def extract_images_from_local_paths(local_images: list[str], year: str, cdn_prefix: str = "blog", cdn_domain: str = "") -> list[str]:
    """
    从本地图片路径列表生成 CDN URL 或相对路径。
    本地路径格式：/path/to/2025/20250615_01.jpg
    输出格式：blog/2025/20250615_01.jpg 或 https://cdn.../blog/2025/20250615_01.jpg
    
    Args:
        local_images: 本地图片路径列表（绝对路径或相对路径）
        year: 年份字符串，如 "2025"
        cdn_prefix: CDN 对象键前缀，默认 "blog"
        cdn_domain: CDN 域名前缀，如 "https://cdn.chenmo1212.cn"
    
    Returns:
        处理后的 CDN URL 或相对路径列表
    """
    images = []
    for local_path in local_images:
        # 从本地路径中提取文件名（如 20250615_01.jpg）
        filename = Path(local_path).name
        key = f"{cdn_prefix}/{year}/{filename}"
        src = f"{cdn_domain.rstrip('/')}/{key}" if cdn_domain else key
        images.append(src)
    return images


def clean_body(body: str) -> str:
    """
    清洗 HTML 标签，保留纯文本。
    逻辑参考 convert_to_bits.py 中的 clean_body()。
    """
    # 1. 移除 HTML 话题锚点（旧帖子的 <a data-hide>）
    body = HASHTAG_ANCHOR_RE.sub("", body)

    # 2. 移除 emoji span
    body = EMOJI_SPAN_RE.sub("", body)

    # 3. 移除 <img> 标签（已在 frontmatter 中处理）
    body = BODY_IMG_RE.sub("", body)

    # 3.5 将 <br /> / <br> 转为换行，保留段落结构
    body = re.sub(r'<br\s*/?>', '\n', body)

    # 4. 移除所有剩余的 HTML 标签
    body = HTML_TAG_RE.sub("", body)

    # 5. 解码 HTML 实体 (&gt; → > 等)
    body = html.unescape(body)

    # 6. 移除纯文本话题前缀 "#陈默的爱岛生活#"（2024+ 帖子无 HTML 锚点），保留后续内容如"第N天"
    body = PLAIN_HASHTAG_RE.sub("", body)

    # 7. 将 3+ 连续空行合并为单空行
    body = MULTI_BLANK_RE.sub("\n\n", body)

    # 8. 裁剪前后空白，然后确保末尾为单个换行
    body = body.strip()
    if body:
        body = "\n\n" + body + "\n"
    else:
        body = "\n"

    return body


def post_to_bits_markdown(
    post: dict,
    cdn_prefix: str = "blog",
    cdn_domain: str = "",
    fixed_tag: str = "陈默的爱岛生活",
) -> str:
    """
    将单条爬虫数据转换为 bits 格式的 markdown 内容。
    
    Args:
        post: 爬虫返回的微博文档，应包含：
              - weibo_id: 微博 ID
              - created_at: 发布时间（YYYY-MM-DDTHH:MM:SS）
              - text_html: 正文 HTML（如果有）
              - text: 正文纯文本（备用）
              - local_images: 本地图片路径列表
              - topics: 话题（如果有）
        cdn_prefix: CDN 前缀，默认 "blog"
        cdn_domain: CDN 域名，如 "https://cdn.chenmo1212.cn"
        fixed_tag: 固定标签，默认 "陈默的爱岛生活"
    
    Returns:
        完整的 markdown 内容（包含 frontmatter 和 body）
    """
    # 解析日期
    created_at = post.get("created_at", "")
    iso_date, _ = parse_datetime(created_at)
    year = created_at[:4] if created_at else datetime.now().strftime("%Y")
    
    # 提取话题作为标签
    topics_str = post.get("topics", "")
    tag_list = []
    if topics_str:
        tag_list = [t.strip() for t in topics_str.split(",") if t.strip()]
    
    # 仅当 topics 中已包含固定标签时才保留，不自动补充
    if fixed_tag in tag_list:
        # 确保固定标签排在首位
        tag_list.remove(fixed_tag)
        tag_list.insert(0, fixed_tag)

    # 使用 text_html 优先，降级到 text
    body_raw = post.get("text_html") or post.get("text", "")
    body_clean = clean_body(body_raw)

    # 根据关键词映射表自动追加 tag
    for tag, keywords in KEYWORD_TAG_MAP.items():
        if tag not in tag_list and any(kw in body_clean for kw in keywords):
            tag_list.append(tag)

    # 构建 tags 块（空列表用 [] 避免 YAML 解析为 null/object）
    if tag_list:
        tags_block = "tags:\n" + "\n".join(f"  - {t}" for t in tag_list)
    else:
        tags_block = "tags: []"

    # 优先使用步骤3实际上传后的 CDN URL，否则降级到本地路径推算
    cdn_urls = post.get("processed_images", {}).get("cdn_urls", [])
    if cdn_urls:
        images = cdn_urls
    else:
        local_images = post.get("local_images", [])
        images = extract_images_from_local_paths(local_images, year, cdn_prefix, cdn_domain)
    
    images_block = ""
    if images:
        lines = ["images:"]
        for src in images:
            lines.append(f"  - src: {src}")
        images_block = "\n" + "\n".join(lines)
    
    # 生成 frontmatter
    fm_lines = [
        "---",
        f"date: {iso_date}",
        tags_block,
        'draft: false',
    ]
    if images_block:
        fm_lines.append(images_block.strip())
    fm_lines.append("---")
    
    return "\n".join(fm_lines) + body_clean


def get_output_filename(post: dict) -> str:
    """
    根据微博信息生成输出文件名。
    格式：bits-YYYY-MM-DD-HHMM.md
    """
    created_at = post.get("created_at", "")
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at)
            return f"bits-{dt.strftime('%Y-%m-%d-%H%M')}.md"
        except (ValueError, TypeError):
            pass
    
    # 降级处理
    now = datetime.now()
    return f"bits-{now.strftime('%Y-%m-%d-%H%M')}.md"


def write_bits_file(
    post: dict,
    output_dir: Path = OUTPUT_DIR,
    cdn_prefix: str = "blog",
    cdn_domain: str = "",
    write: bool = True,
) -> str:
    """
    将单条微博转换为 bits markdown 文件并保存。
    
    Args:
        post: 爬虫返回的微博文档
        output_dir: 输出目录路径
        cdn_prefix: CDN 前缀
        cdn_domain: CDN 域名
        write: 如果 False，仅返回内容不写入文件
    
    Returns:
        生成的文件路径（如果 write=True）或内容预览
    """
    content = post_to_bits_markdown(post, cdn_prefix, cdn_domain)
    filename = get_output_filename(post)
    output_path = output_dir / filename
    
    if write:
        output_dir.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[OK] 已写入 bits 文件：{output_path}")
        return str(output_path)
    else:
        print(f"\n{'='*60}")
        print(f"微博 ID: {post.get('weibo_id')}")
        print(f"输出文件: {filename}")
        print("─" * 60)
        print(content[:500] + ("..." if len(content) > 500 else ""))
        return content


def _load_existing_weibo_ids(json_path: Path) -> set[str]:
    """
    从 posts.json 读取已持久化的 weibo_id 集合，用于去重判断。
    文件不存在或解析失败时返回空集合。
    """
    if not json_path.exists():
        return set()
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return {str(p["weibo_id"]) for p in data if p.get("weibo_id")}
    except (json.JSONDecodeError, OSError, KeyError):
        pass
    return set()


def batch_write_bits_files(
    posts: list[dict],
    output_dir: Path = OUTPUT_DIR,
    cdn_prefix: str = "blog",
    cdn_domain: str = "",
    write: bool = True,
) -> list[str]:
    """
    批量将微博转换为 bits 文件。
    
    Args:
        posts: 爬虫返回的微博列表（调用方负责去重）
        output_dir: 输出目录
        cdn_prefix: CDN 前缀
        cdn_domain: CDN 域名
        write: 是否实际写入文件
    
    Returns:
        生成的文件路径列表
    """
    results = []
    for post in posts:
        weibo_id = str(post.get("weibo_id", ""))
        try:
            output_path = write_bits_file(post, output_dir, cdn_prefix, cdn_domain, write)
            results.append(output_path)
        except Exception as e:
            print(f"[ERROR] 转换失败（weibo_id={weibo_id}）：{e}", file=sys.stderr)
    
    return results


if __name__ == "__main__":
    print("bits_converter.py —— 微博转 bits markdown")
    print("参考 data/scripts/convert_to_bits.py，直接在爬虫工作流中使用。")
