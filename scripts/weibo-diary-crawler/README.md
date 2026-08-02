# 微博个人日记定时爬取系统

> 从父项目 `weibo-crawler` 中抽取核心爬取逻辑，专注于**每日定时爬取自己账号**的微博日记内容，并存入 MongoDB。

---

## 目录结构

```
weibo-diary-crawler/
├── config.yaml          # 配置文件（Cookie、UID、MongoDB、调度时间等）
├── main.py              # 程序入口，启动调度器
├── crawler.py           # 微博爬取核心（抽取自 weibo.py）
├── image_downloader.py  # 图片下载与去水印（抽取自 weibo.py）
├── storage.py           # MongoDB 幂等写入封装
├── scheduler.py         # APScheduler 定时任务
├── utils.py             # 工具函数：日期解析、HTML清洗等（抽取自 weibo.py）
├── requirements.txt     # 依赖列表
└── logs/                # 日志输出目录（自动创建）
```

---

## 快速开始

### 1. 安装依赖

```bash
cd weibo-diary-crawler
pip install -r requirements.txt
```

### 2. 获取微博 Cookie

1. 用 Chrome/Edge 打开 [https://m.weibo.cn](https://m.weibo.cn) 并登录你的账号
2. 按 `F12` 打开开发者工具，切换到 **Network（网络）** 面板
3. 刷新页面，在请求列表中找到任意一条 `m.weibo.cn` 的请求
4. 点击该请求，在右侧 **Headers → Request Headers** 中找到 `cookie` 字段
5. 复制完整的 Cookie 字符串（从 `SCF=...` 到末尾）

### 3. 获取自己的微博 UID

1. 打开 [https://weibo.com](https://weibo.com) 并登录，进入**个人主页**
2. 浏览器地址栏 URL 形如 `https://weibo.com/u/7796507396`，其中 `7796507396` 即为你的 UID
3. 也可以在个人主页 URL 中找到纯数字部分

### 4. 修改配置文件

编辑 `config.yaml`，填入你的 Cookie 和 UID：

```yaml
weibo:
  cookie: "SCF=Ag...（完整 Cookie 字符串）"
  uid: "7796507396"         # 替换为你自己的 UID
  fetch_count: 5            # 每次爬取最新几条
  page_weibo_count: 10      # 每页请求条数

mongodb:
  uri: "mongodb://localhost:27017"  # 可用环境变量 MONGO_URI 覆盖
  database: "weibo_diary"
  collection: "posts"

scheduler:
  run_time: "23:30"         # 每天自动爬取的时间

images:
  save_dir: "./images"      # 图片保存目录
```

也可以通过环境变量覆盖 MongoDB 连接串：

```bash
export MONGO_URI="mongodb://user:pass@host:27017"
```

### 5. 启动服务

**首次启动（立即执行一次 + 进入定时循环）：**

```bash
python main.py --run-now
```

**直接进入定时调度模式（不立即爬取）：**

> 注意：`main.py` 默认启动时也会执行一次，可根据需要修改 `main.py` 末尾的 `run_now` 参数。

```bash
python main.py
```

**指定自定义配置文件路径：**

```bash
python main.py --config /path/to/my_config.yaml --run-now
```


---

## ✨ 新增功能：完整处理管道

v2.0 版本新增了 **爬取 → 压缩 → 上传 → bits转换 → 存储** 的一站式处理管道。

### 新增模块

| 模块 | 功能 | 参考来源 |
|-----|------|--------|
| `bits_converter.py` | 微博转 bits markdown（符合 `src/content/bits/` 格式） | `../convert_to_bits.py` |
| `image_processor.py` | 图片自动压缩 + CDN 上传 | `../compress_and_upload.py` |
| `pipeline.py` | 完整处理管道编排 | — |

### 快速体验

编辑 `config.yaml`，启用管道：

```yaml
pipeline:
  enabled: true                              # ✓ 启用完整管道
  image_quality: 75                          # 图片压缩质量
  image_dry_run: false                       # 实际上传到七牛
  bits_write: true                           # 生成 bits 文件
  cdn_domain: "https://cdn.chenmo1212.cn"   # 你的 CDN 域名
```

启动爬虫：

```bash
python main.py --run-now
```

执行流程：
```
爬取微博 → 下载图片 → 压缩图片 → 上传 CDN → 生成 bits → 持久化存储
   ✓          ✓          ✓         ✓         ✓         ✓
```

### 输出示例

✓ **bits markdown 文件**（自动生成到 `src/content/bits/`）：
```
bits-2025-06-15-1430.md
---
date: 2025-06-15T14:30:45+08:00
tags:
  - 陈默的爱岛生活
draft: false
images:
  - src: https://cdn.chenmo1212.cn/blog/2025/20250615_01.jpg
---
正文内容（纯文本，已清洗 HTML）...
```

✓ **图片处理信息**（添加到 post 文档）：
```python
post['processed_images'] = {
    'cdn_urls': [
        'https://cdn.chenmo1212.cn/blog/2025/20250615_01.jpg',
        'https://cdn.chenmo1212.cn/blog/2025/20250615_02.jpg',
    ],
    'local_compressed': [...],
    'errors': []
}
```

### 更多文档

- 📖 **详细指南**：[PIPELINE_GUIDE.md](./PIPELINE_GUIDE.md)
- ⚡ **快速参考**：[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- 🎯 **使用演示**：`python demo.py`

---


---

## 数据说明

### MongoDB 文档字段

| 字段             | 类型     | 说明                                 |
|----------------|--------|--------------------------------------|
| `weibo_id`     | string | 微博唯一 ID（用作唯一索引）              |
| `created_at`   | string | 发布时间（`YYYY-MM-DDTHH:MM:SS`）      |
| `full_created_at` | string | 发布时间（`YYYY-MM-DD HH:MM:SS`）   |
| `text`         | string | 正文纯文本（已清洗 HTML）               |
| `text_html`    | string | 正文原始 HTML（备用）                   |
| `pics`         | list   | 图片原始 URL 列表（large 原图）          |
| `local_images` | list   | 图片本地保存路径列表                     |
| `crawled_at`   | string | 爬取时间戳                              |
| `source`       | string | 发布工具（如"iPhone 客户端"）            |
| `attitudes_count` | int | 点赞数                                |
| `comments_count` | int  | 评论数                                |

### 图片存储结构

```
images/
└── 2025-06-15/
    └── 5123456789012345/
        ├── 1.jpg
        ├── 2.jpg
        └── 3.jpg
```

---

## 日志

- 控制台：`INFO` 级别，实时输出
- 文件：`logs/diary_YYYY-MM-DD.log`，`DEBUG` 级别，按天滚动，保留 30 天

---

## 常见问题

**Q: 提示"MongoDB 连接失败"？**
A: 请确保本地 MongoDB 服务已启动：`mongod --dbpath /your/data/path`

**Q: 获取不到微博内容（data 字段为空）？**
A: Cookie 已过期，请重新从浏览器复制最新 Cookie 并更新 `config.yaml`

**Q: 图片下载失败？**
A: 网络波动或微博防爬限制，系统会自动重试 3 次并记录日志，不影响整体流程
