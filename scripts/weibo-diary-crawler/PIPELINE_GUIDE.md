# 微博爬虫完整处理管道 —— 使用指南

本文档介绍如何使用微博爬虫的完整处理管道，实现**爬取 → 图片压缩 → CDN 上传 → bits markdown 生成 → 持久化存储**的一站式工作流。

---

## 目录

1. [新增功能模块](#新增功能模块)
2. [快速开始](#快速开始)
3. [配置说明](#配置说明)
4. [使用示例](#使用示例)
5. [常见场景](#常见场景)

---

## 新增功能模块

本次更新引入了 4 个新模块，与现有爬虫无缝集成：

### 1. `bits_converter.py` — 微博转 bits markdown

**功能**：将爬虫数据转换为符合 `src/content/bits/` 目录结构的 markdown 文件。

**参考来源**：`data/scripts/convert_to_bits.py`

**关键函数**：
```python
from bits_converter import post_to_bits_markdown, write_bits_file, batch_write_bits_files

# 转换单条微博为 markdown 字符串
md_content = post_to_bits_markdown(post, cdn_domain="https://cdn.chenmo1212.cn")

# 写入单个 bits 文件
write_bits_file(post, write=True)

# 批量转换
batch_write_bits_files(posts, cdn_domain="https://cdn.chenmo1212.cn", write=True)
```

**输出格式**：
```
bits-YYYY-MM-DD-HHMM.md
---
date: YYYY-MM-DDTHH:MM:SS+08:00
tags:
  - 陈默的爱岛生活
  - 其他标签
draft: false
images:
  - src: blog/2025/20250615_01.jpg
  - src: https://cdn.chenmo1212.cn/blog/2025/20250615_02.jpg
---

正文内容（纯文本，已清洗 HTML）...
```

---

### 2. `image_processor.py` — 图片压缩与上传

**功能**：将下载的图片自动压缩，然后上传到七牛 CDN。

**参考来源**：`data/scripts/compress_and_upload.py`

**核心类**：
```python
from image_processor import ImageProcessor, process_post_images, process_posts_batch

# 初始化处理器
processor = ImageProcessor(quality=75, dry_run=False, workers=3)

# 处理单条微博的所有图片
post_with_urls = process_post_images(
    post,
    quality=75,
    dry_run=False,
    output_dir=Path("./weibo_photos_compressed")
)

# post 会新增 processed_images 字段：
# {
#     "cdn_urls": ["https://cdn.xxx/blog/2025/image.jpg", ...],
#     "local_compressed": ["/path/to/compressed/image.jpg", ...],
#     "errors": [...]  # 上传失败的错误信息
# }

# 批量处理
posts_with_urls = process_posts_batch(posts, quality=75, dry_run=False)
```

**特性**：
- 自动检测图片格式（JPEG/PNG/GIF/WebP）
- 缩放超过 1080px 的图片（保持宽高比）
- 支持并发上传（3 个 worker 默认）
- 自动处理七牛对象键（`blog/{year}/{filename}`）
- 干运行模式（仅压缩不上传，用于测试）

---

### 3. `pipeline.py` — 完整处理管道

**功能**：将爬虫、图片处理、bits 转换、存储写入串联成统一的工作流。

**核心函数**：
```python
from pipeline import run_full_pipeline

cfg = load_config("config.yaml")
posts = run_full_pipeline(
    cfg,
    cdn_domain="https://cdn.chenmo1212.cn",
    cdn_prefix="blog",
    image_quality=75,
    image_dry_run=False,
    bits_write=True,
)
```

**执行步骤**：
1. 爬取微博列表
2. 下载图片（保持 Cookie 状态）
3. 压缩图片
4. 上传到七牛 CDN
5. 生成 bits markdown 文件
6. 写入 MongoDB/JSON 存储

**日志输出**：
```
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
```

---

### 4. 更新 `main.py` — 集成管道

**改动**：
- 添加 `enable_pipeline` 参数，可切换管道模式
- 从 `config.yaml` 的 `pipeline` 节点读取配置
- 向后兼容原始工作流

---

## 快速开始

### 1. 更新依赖

```bash
cd weibo-diary-crawler
pip install -r requirements.txt
```

确保已安装：
- `Pillow` （图片处理）
- `qiniu` （七牛 SDK）

```bash
pip install Pillow qiniu
```

### 2. 配置文件

编辑 `config.yaml`，在最后添加管道配置：

```yaml
pipeline:
  enabled: true                    # 启用完整管道
  image_quality: 75                # 图片质量
  image_dry_run: false             # 关闭干运行，实际上传
  bits_enabled: true               # 启用 bits 生成
  bits_write: true                 # 实际写入文件
  cdn_prefix: "blog"               # CDN 前缀
  cdn_domain: "https://cdn.chenmo1212.cn"  # CDN 域名（可选）
```

### 3. 启动服务

```bash
# 立即执行一次 + 进入定时调度
python main.py --run-now

# 或直接进入定时调度
python main.py
```

---

## 配置说明

### `config.yaml` 的 `pipeline` 节点

| 配置项 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `enabled` | bool | `true` | 是否启用完整管道 |
| `image_quality` | int | `75` | 图片压缩质量（1-100） |
| `image_dry_run` | bool | `false` | 仅压缩不上传 |
| `bits_enabled` | bool | `true` | 是否生成 bits markdown |
| `bits_write` | bool | `true` | 是否实际写入文件 |
| `cdn_prefix` | str | `"blog"` | 七牛对象键前缀 |
| `cdn_domain` | str | `""` | CDN 域名（可选，留空则用相对路径） |

**示例配置**：

```yaml
# 生产环境 —— 完整管道，实际上传
pipeline:
  enabled: true
  image_quality: 75
  image_dry_run: false
  bits_write: true
  cdn_domain: "https://cdn.chenmo1212.cn"

# 测试环境 —— 管道干运行，仅压缩和生成本地 markdown
pipeline:
  enabled: true
  image_dry_run: true      # 不上传
  bits_write: false        # 仅生成内容到 stdout
  cdn_domain: ""           # 使用相对路径

# 关闭管道 —— 回到原始工作流
pipeline:
  enabled: false
```

---

## 使用示例

### 场景 1：本地调试

目标：在不上传 CDN 的情况下，验证爬虫 → 压缩 → bits 转换 的完整流程。

**配置**：
```yaml
pipeline:
  enabled: true
  image_dry_run: true      # 仅压缩，不上传
  bits_write: false        # 干运行：输出到 stdout
  cdn_domain: ""           # 使用本地相对路径
```

**执行**：
```bash
python main.py --run-now
```

**输出**：
```
[INFO] 【步骤 4/4】生成 bits markdown 文件...
============================================================
微博 ID: 1234567890
输出文件: bits-2025-06-15-1430.md
────────────────────────────────────────────────────────────
---
date: 2025-06-15T14:30:45+08:00
tags:
  - 陈默的爱岛生活
draft: false
images:
  - src: blog/2025/20250615_01.jpg
---

正文内容...
```

### 场景 2：生产部署

目标：完整工作流，爬取 → 压缩 → 上传 → bits → 存储。

**配置**：
```yaml
pipeline:
  enabled: true
  image_quality: 75
  image_dry_run: false
  bits_write: true
  cdn_domain: "https://cdn.chenmo1212.cn"
```

**执行**：
```bash
# 首次启动（验证 Cookie、上传凭证等）
python main.py --run-now

# 后续定时运行（自动每天 23:30 执行一次）
python main.py
```

### 场景 3：仅生成 bits，不处理图片

目标：已有本地图片，只需转换为 bits markdown。

**使用 bits_converter 独立**：
```python
from bits_converter import batch_write_bits_files
from storage import create_storage

# 从 MongoDB 或 JSON 读取已爬取的数据
storage = create_storage(cfg)
posts = storage.load_all_posts()  # 假设有这个方法

# 转换为 bits 文件
batch_write_bits_files(
    posts,
    cdn_domain="https://cdn.chenmo1212.cn",
    write=True
)
```

### 场景 4：仅压缩和上传图片

目标：已有爬虫数据和本地图片，只需压缩上传。

**使用 image_processor 独立**：
```python
from image_processor import process_posts_batch

# 假设 posts 已包含 local_images 字段
posts_with_urls = process_posts_batch(
    posts,
    quality=75,
    dry_run=False,
    workers=3
)

# 查看上传结果
for post in posts_with_urls:
    if post.get("processed_images", {}).get("cdn_urls"):
        print(f"微博 {post['weibo_id']} 上传成功：{post['processed_images']['cdn_urls']}")
    if post.get("processed_images", {}).get("errors"):
        print(f"微博 {post['weibo_id']} 出错：{post['processed_images']['errors']}")
```

---

## 常见场景

### Q1：如何禁用某个功能但保留其他的？

**禁用图片上传，仅做本地压缩和 bits 生成**：
```yaml
pipeline:
  enabled: true
  image_quality: 75
  image_dry_run: true      # 关键：仅压缩不上传
  bits_write: true
```

**禁用 bits 生成，仅做爬取和图片处理**：
```yaml
pipeline:
  enabled: true
  image_quality: 75
  image_dry_run: false
  bits_write: false        # 关键：不生成 bits 文件
```

### Q2：如何自定义 bits 输出目录？

在 `pipeline.py` 的 `run_full_pipeline()` 函数中传入 `bits_output_dir` 参数：

```python
from pipeline import run_full_pipeline

posts = run_full_pipeline(
    cfg,
    bits_output_dir=Path("./my_custom_bits_dir")
)
```

### Q3：如何处理上传失败后的重试？

已在 `image_processor.py` 中自动实现：
- 每张图片最多重试 3 次
- 指数退避延迟（1s, 2s, 4s, ...）
- 单张失败不影响其他图片处理

若需修改重试策略，编辑 `image_processor.py` 中的 `ImageProcessor.process_image()` 方法。

### Q4：如何查看 CDN URL？

在运行后，post 文档的 `processed_images.cdn_urls` 字段包含所有上传成功的 URL：

```python
post = {
    "weibo_id": "123456789",
    "local_images": [...],
    "processed_images": {
        "cdn_urls": [
            "https://cdn.chenmo1212.cn/blog/2025/20250615_01.jpg",
            "https://cdn.chenmo1212.cn/blog/2025/20250615_02.jpg",
        ],
        "local_compressed": [...],
        "errors": []
    }
}
```

bits markdown 中的 `images` 字段会自动包含这些 URL：

```markdown
---
images:
  - src: https://cdn.chenmo1212.cn/blog/2025/20250615_01.jpg
  - src: https://cdn.chenmo1212.cn/blog/2025/20250615_02.jpg
---
```

### Q5：如何在已有的爬虫数据上追溯生成 bits？

```python
from storage import create_storage
from bits_converter import batch_write_bits_files

cfg = load_config("config.yaml")
storage = create_storage(cfg)

# 从 MongoDB 读取所有微博
all_posts = storage._col.find({}) if hasattr(storage, '_col') else []

# 转换为 bits 文件
batch_write_bits_files(
    list(all_posts),
    cdn_domain="https://cdn.chenmo1212.cn",
    write=True
)
```

---

## 工作流总结

```
config.yaml 配置（pipeline 节点）
    ↓
main.py 读取配置，启动定时调度
    ↓
run_crawl_job() 被定时触发
    ↓
enable_pipeline=true → 调用 pipeline.run_full_pipeline()
    ↓
【步骤 1】crawler.fetch_latest() 爬取微博
    ↓
【步骤 2】image_downloader.download_weibo_images() 下载图片
    ↓
【步骤 3】image_processor.process_post_images() 压缩+上传
    ↓
【步骤 4】bits_converter.batch_write_bits_files() 生成 bits markdown
    ↓
【步骤 5】storage.upsert_many() 持久化到 MongoDB/JSON
    ↓
完成！posts 已在 src/content/bits/ 中生成，图片已在 CDN 中
```

---

## 故障排查

**问题**：bits 文件生成但无图片

**原因**：
1. 爬虫未获取到 `local_images` 字段
2. 图片压缩失败
3. 上传失败但未停止管道

**解决**：
```bash
# 查看日志
tail -f logs/diary_YYYY-MM-DD.log

# 检查 processed_images 字段中的 errors
python -c "
from storage import create_storage
import json
cfg = ...
storage = create_storage(cfg)
posts = storage.load_all_posts()
for p in posts:
    if p.get('processed_images', {}).get('errors'):
        print(f\"Post {p['weibo_id']}: {p['processed_images']['errors']}\")
"
```

**问题**：上传到七牛失败

**原因**：
1. 七牛凭证过期或配置错误
2. 网络连接问题

**解决**：
```bash
# 在本地测试七牛凭证
python -c "
import json
with open('src/data/settings/ui.json') as f:
    cfg = json.load(f)
    qiniu_cfg = cfg['imageProvider']['qiniu']
    print('Bucket:', qiniu_cfg['bucket'])
    print('Domain:', qiniu_cfg['domain'])
    print('Path:', qiniu_cfg['path'])
"

# 启用干运行模式（仅压缩不上传）
# 编辑 config.yaml: image_dry_run: true
```

---

更新日期：2025 年 6 月
作者：Bob 助手
参考：`convert_to_bits.py`、`compress_and_upload.py`
