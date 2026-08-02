#!/usr/bin/env python3
"""
示例脚本：演示如何独立使用 bits_converter 和 image_processor

这个脚本展示了三种典型的使用场景：
1. 仅转换为 bits markdown（不处理图片）
2. 仅压缩上传图片（不生成 bits）
3. 完整管道（爬虫 → 压缩 → 上传 → bits）
"""

import sys
from pathlib import Path

# 确保能导入爬虫模块
sys.path.insert(0, str(Path(__file__).parent))


def demo_bits_conversion():
    """演示：独立使用 bits_converter"""
    from bits_converter import post_to_bits_markdown, write_bits_file
    
    print("\n" + "="*70)
    print("演示 1：仅转换为 bits markdown")
    print("="*70)
    
    # 模拟爬虫返回的数据
    sample_post = {
        "weibo_id": "1234567890",
        "created_at": "2025-06-15T14:30:45",
        "full_created_at": "2025-06-15 14:30:45",
        "text": "今天天气真好 #陈默的爱岛生活#",
        "text_html": '<p>今天天气真好</p><a href="#">#陈默的爱岛生活#</a>',
        "local_images": [
            "/path/to/2025/20250615_01.jpg",
            "/path/to/2025/20250615_02.jpg",
        ],
        "topics": "爱岛生活,天气",
    }
    
    # 转换为 bits markdown
    md_content = post_to_bits_markdown(
        sample_post,
        cdn_domain="https://cdn.chenmo1212.cn",
        cdn_prefix="blog"
    )
    
    print("\n生成的 markdown 内容（预览）：\n")
    print(md_content[:600])
    if len(md_content) > 600:
        print("...\n[内容已截断]")


def demo_image_processing():
    """演示：独立使用 image_processor"""
    from image_processor import ImageProcessor
    
    print("\n" + "="*70)
    print("演示 2：图片压缩处理（本地演示）")
    print("="*70)
    
    print("\n初始化图片处理器...")
    processor = ImageProcessor(quality=75, dry_run=True, workers=3)
    
    print("""
这个演示使用 dry_run=True，仅进行压缩不实际上传。
实际使用时，设置 dry_run=False 即可上传到七牛 CDN。

关键参数：
  - quality=75           : JPEG/WebP 压缩质量（1-100）
  - dry_run=True/False   : 仅压缩 vs 压缩+上传
  - workers=3            : 并发上传数

示例代码：
    
    from image_processor import process_post_images
    
    post = {...}  # 包含 local_images 字段
    post = process_post_images(
        post,
        quality=75,
        dry_run=False,  # 实际上传
        workers=3
    )
    
    # 查看上传结果
    print(post['processed_images']['cdn_urls'])
    print(post['processed_images']['errors'])
""")


def demo_full_pipeline():
    """演示：完整处理管道"""
    print("\n" + "="*70)
    print("演示 3：完整处理管道集成")
    print("="*70)
    
    print("""
完整管道工作流：
    爬取微博 → 下载图片 → 压缩图片 → 上传到 CDN → 生成 bits → 存储

使用方式：

    from pipeline import run_full_pipeline
    from main import load_config
    
    cfg = load_config("config.yaml")
    posts = run_full_pipeline(
        cfg,
        cdn_domain="https://cdn.chenmo1212.cn",
        cdn_prefix="blog",
        image_quality=75,
        image_dry_run=False,  # 实际上传
        bits_write=True       # 实际写入文件
    )

配置文件 config.yaml 中的 pipeline 节点控制管道行为：

    pipeline:
      enabled: true                 # 启用完整管道
      image_quality: 75             # 图片质量
      image_dry_run: false          # 仅压缩不上传
      bits_enabled: true            # 启用 bits 生成
      bits_write: true              # 实际写入文件
      cdn_prefix: "blog"            # CDN 前缀
      cdn_domain: "https://cdn..."  # CDN 域名

管道执行日志示例：

    [INFO] ========================================================================
    [INFO] 启动完整处理管道
    [INFO] ========================================================================
    [INFO] 【步骤 1/4】爬取微博...
    [INFO] ✓ 爬取完成：共获取 5 条微博
    [INFO] 【步骤 2/4】下载并压缩图片...
    [INFO] ✓ 图片下载完成
    [INFO] 【步骤 3/4】上传图片到 CDN...
    [INFO] ✓ 图片上传完成
    [INFO] 【步骤 4/4】生成 bits markdown 文件...
    [INFO] ✓ bits 文件生成完成：5 个文件
    [INFO] ========================================================================
    [INFO] ✓ 完整管道执行完成
    [INFO] ========================================================================
""")


def demo_combined_workflow():
    """演示：组合使用各模块"""
    print("\n" + "="*70)
    print("演示 4：组合使用各模块（高级用法）")
    print("="*70)
    
    print("""
场景：已有爬虫数据，想自定义处理流程

示例代码：
    
    from crawler import DiaryWeiboCrawler
    from image_downloader import download_weibo_images
    from image_processor import process_post_images
    from bits_converter import write_bits_file
    from storage import create_storage
    
    cfg = load_config("config.yaml")
    
    # 1. 爬取
    crawler = DiaryWeiboCrawler(cfg["weibo"])
    posts = crawler.fetch_latest()
    
    # 2. 下载图片
    for post in posts:
        if post.get("pics"):
            post["local_images"] = download_weibo_images(...)
    
    # 3. 自定义处理：仅处理有图片的微博
    for post in posts:
        if post.get("local_images"):
            # 压缩上传
            post = process_post_images(post, quality=75)
            
            # 生成 bits
            if post.get("processed_images", {}).get("cdn_urls"):
                write_bits_file(post, write=True)
    
    # 4. 存储
    storage = create_storage(cfg)
    storage.upsert_many(posts)

这样可以灵活控制每一步的行为，而不受管道配置限制。
""")


if __name__ == "__main__":
    print("\n🎯 微博爬虫完整处理管道 —— 使用演示")
    print("="*70)
    
    try:
        demo_bits_conversion()
    except Exception as e:
        print(f"\n[演示 1] 出错：{e}")
    
    try:
        demo_image_processing()
    except Exception as e:
        print(f"\n[演示 2] 出错：{e}")
    
    try:
        demo_full_pipeline()
    except Exception as e:
        print(f"\n[演示 3] 出错：{e}")
    
    try:
        demo_combined_workflow()
    except Exception as e:
        print(f"\n[演示 4] 出错：{e}")
    
    print("\n" + "="*70)
    print("✓ 演示完成")
    print("\n详细文档请查看：")
    print("  - PIPELINE_GUIDE.md    （详细指南）")
    print("  - QUICK_REFERENCE.md   （快速参考）")
    print("="*70 + "\n")
