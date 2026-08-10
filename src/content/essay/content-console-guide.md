---
title: Content Console 使用指南
description: 说明 astro-whono 本地 Content Console 在开发环境下的内容类型、列表查找、图片上传、编辑预览与下载删除等能力。
badge: 指南
date: 2026-06-13
updatedAt: 2026-08-10
tags: [ "Content Console", "指南" ]
draft: false
---

astro-whono 提供一个本地 Content Console，用于在开发环境中管理站点的写作内容。

Content Console 的入口是 `/admin/content/`。它覆盖随笔、絮语、小记、关于四类内容的浏览、查找、编辑与预览，并支持新建草稿、下载源文件与删除，便于在不直接手写 frontmatter 的情况下维护内容。

:::note[开发环境]
`/admin/content/` 及其编辑页仅在开发环境可操作。生产环境访问时只显示本地开发提示，不加载内容数据与编辑器；`/api/admin/content/*` 仅服务本地后台，不作为公开 API。
:::

## 本地启动与入口

本地开发时，可通过以下命令启动项目：

```bash
npm install
npm run dev
```

默认情况下，开发服务器会运行在 `http://localhost:4321/`。启动后可直接访问：

```text
http://localhost:4321/admin/content/
```

如果本地修改了开发端口，请将 `4321` 替换为实际端口。

Content Console 直接读取 `src/content/**` 下的源文件，不依赖数据库。新建、保存与删除都会落到仓库内的内容文件，图片上传的存储位置则由本地文件或可选的 S3 兼容存储配置决定。

## 图片上传与云存储

Admin Console 的图片上传默认写入本地文件。需要使用对象存储时，可在本地开发环境启用 AWS S3、Cloudflare R2、MinIO 等 S3 兼容服务。

启用后，随笔 / 小记正文图片和絮语配图会上传到配置的存储桶（bucket），并将 `https://` 公开地址写入内容。已有本地图片不会自动迁移。Images Console（`/admin/images/`）可以浏览、复制 URL 和删除云端图片；删除仅限当前应用管理的图片目录。

### R2、MinIO 或其他自定义 endpoint

在项目根目录的 `.env.local` 中填写：

```dotenv
ASTRO_WHONO_IMAGE_STORAGE=s3
ASTRO_WHONO_S3_ENDPOINT=https://your-s3-endpoint
ASTRO_WHONO_S3_REGION=auto
ASTRO_WHONO_S3_BUCKET=your-bucket
ASTRO_WHONO_S3_ACCESS_KEY_ID=your-access-key
ASTRO_WHONO_S3_SECRET_ACCESS_KEY=your-secret-key
ASTRO_WHONO_S3_PUBLIC_BASE_URL=https://your-cdn-domain
# 可选：ASTRO_WHONO_S3_PREFIX=blog
# 可选：ASTRO_WHONO_S3_FORCE_PATH_STYLE=true（自定义 endpoint 默认 true）
# 可选：ASTRO_WHONO_S3_SESSION_TOKEN=temporary-session-token
```

`ASTRO_WHONO_S3_ENDPOINT` 是对象存储服务的访问地址，`ASTRO_WHONO_S3_PUBLIC_BASE_URL` 是写入内容的公开图片地址，两者可以不同。公开地址必须是有效的 `https://` URL。自定义 endpoint 默认使用 `region=auto` 和 path-style；如服务有特殊要求，可显式设置 `ASTRO_WHONO_S3_FORCE_PATH_STYLE`。

### AWS 原生 S3

原生 AWS S3 不设置 `ASTRO_WHONO_S3_ENDPOINT`，并填写 bucket 的实际 region，不能使用 `auto`：

```dotenv
ASTRO_WHONO_IMAGE_STORAGE=s3
ASTRO_WHONO_S3_REGION=us-east-1
ASTRO_WHONO_S3_BUCKET=your-bucket
ASTRO_WHONO_S3_ACCESS_KEY_ID=your-access-key
ASTRO_WHONO_S3_SECRET_ACCESS_KEY=your-secret-key
ASTRO_WHONO_S3_PUBLIC_BASE_URL=https://your-cdn-domain
# 可选：ASTRO_WHONO_S3_PREFIX=blog
# 可选：ASTRO_WHONO_S3_SESSION_TOKEN=temporary-session-token
```

`.env.local` 默认被 Git 忽略；不要把 access key、secret access key 或 session token 提交到仓库。

## 内容类型与能力

Content Console 统一管理四类内容，但它们的能力并不相同：

| 内容 | 目录 | 新建 | 编辑 | 删除 | 列表筛选 |
| :--- | :--- | :---: | :---: | :---: | :---: |
| 随笔 | `src/content/essay/` | 支持 | 支持 | 支持 | 支持 |
| 絮语 | `src/content/bits/` | 支持 | 支持 | 支持 | 支持 |
| 小记 | `src/content/memo/index.md` | — | 支持 | — | — |
| 关于 | `src/content/about/index.md` | — | 支持 | — | — |

随笔与絮语是多条内容，可在控制台新建草稿、逐条编辑与删除，列表也提供筛选与分页。小记与关于是固定单页内容，只能编辑现有正文，不支持新建或删除。

## 浏览、筛选与搜索

打开 `/admin/content/` 时，默认按随笔、絮语、小记、关于分组展示内容概览。顶部工具栏提供以下能力：

- 搜索：按标题、标签或 slug 跨内容查找
- 范围：在「全部内容」与单类内容之间切换
- 状态：全部状态 / 已发布 / 仅草稿
- 排序：最近更新 / 标题 A-Z
- 年份：按内容年份过滤

状态、排序、年份筛选与分页仅对随笔、絮语生效；小记与关于是固定单页，不暴露这些筛选项。列表中，草稿标记为 `[draft]`，关闭归档的随笔标记为 `[archive off]`。

每一项都提供「编辑」按钮，以及「更多」菜单中的修改信息、前台查看、下载与删除操作。

## 新建与编辑

### 随笔

在随笔分组点击「新建文章」，填写标题等基础信息后会生成一篇草稿，并跳转到编辑页。

随笔编辑页提供：

- 基于 CodeMirror 的正文编辑区，内置多种语法高亮主题与行号选项
- 编辑 / 预览布局切换，预览由服务端渲染
- frontmatter 信息面板：发布日期、更新日期、标签、草稿与归档等字段
- 目录与 Markdown 语法两个辅助侧栏
- 工具栏：常用 Markdown、数学公式、emoji、图片与画廊
- 正文图片上传：默认保存到当前内容的附件目录；启用云存储后写入配置的存储桶，并插入返回的 `https://` 地址

### 絮语

在絮语分组点击「新建动态」，选择发布时间后会生成一条草稿并跳转到编辑页。

絮语编辑页是独立工作台，可编辑正文、基础信息与配图（`images`）行，支持图片上传，并提供实时卡片预览，所见与 `/bits/` 列表中的卡片一致。

### 小记与关于

小记与关于是固定单页内容，编辑页只处理正文：

- 小记：编辑 `src/content/memo/index.md` 正文，支持插入正文图片、页面预览与正文目录
- 关于：编辑 `src/content/about/index.md` 正文，预览中的友链与 FAQ 会按公开页样式渲染；联系链接位置用 `::contact-links` 占位控制

小记与关于的页面主副标题不在这里维护，统一在 Theme Console 调整。

## 批量操作

勾选列表中的内容后，可通过「批量操作」执行：

- 发布 / 改草稿：批量切换 `draft` 状态
- 下载：把所选内容的源文件打包成 zip 下载
- 删除：批量删除所选内容，源文件移入回收站（删除前会确认）

批量操作的范围是当前列表中已勾选的内容；可以先用筛选或搜索缩小范围，再批量处理。

## 下载与删除

- 下载：在该条的「更多」菜单点「下载源文件」，得到对应的 Markdown 文件
- 删除：在该条的「更多」菜单中删除，源文件会被移入回收站，而不是直接抹除；删除前会确认

下载与删除作用于源文件本身。删除仅随笔、絮语支持，小记与关于不提供删除。

## 内容字段与写作约定

Content Console 与直接编辑 `src/content/**` 共用同一套字段规则。这里列出日常写作最常用的部分；完整的排版示例见 [Markdown 排版指南](https://astro.whono.me/archive/markdown-guide/)。

### 随笔

```yaml
title: My Post
date: 2026-01-01
draft: false
archive: true
# slug: my-post
# publishedAt: 2026-01-01T12:00:00+08:00
# updatedAt: 2026-01-02
```

`title` 和 `date` 是必填字段；`tags`、`description`、`cover`、`badge` 等字段按需填写。`date` 可写 `YYYY-MM-DD` 或带时区的 ISO 8601 时间；需要保留具体发布时间时再填写 `publishedAt`，`updatedAt` 不能早于 `date`。不填写 `slug` 时由源文件路径派生（例如 `2024/my-post` 会变成 `2024-my-post`），自定义值需使用小写 kebab-case；最终 slug 不能使用 `page`、`tag` 或 `rss.xml`，也不能与其他随笔重复。

`draft: true` 的随笔只在本地开发中显示，生产列表、RSS 和 sitemap 会过滤。`archive: false` 只会将文章移出 `/archive/` 聚合与归档 RSS，文章仍可从 `/essay/` 和详情路由访问。

### 絮语（bits）

```yaml
date: 2026-01-01T12:00:00+08:00
tags: [阅读]
images:
  - src: bits/demo-01.webp
    width: 800
    height: 600
    alt: 示例图片
# author:
#   name: Alice
#   avatar: author/alice.webp
```

`title`、`tags`、`images` 和 `author` 都是可选字段。`images[].src` 可填写 `public/**` 下的相对图片路径（填写时去掉 `public/`，例如 `bits/demo-01.webp`）或 `https://` 远程地址；本地相对路径不能使用 `http`、`..`、查询串或片段。`width` / `height` 为正整数时可减少布局跳动，`alt` 用于图片说明。头像同样只填写 `public/**` 下的相对路径，例如 `author/avatar.webp`。当前 `/bits/` 不生成详情页，通常不需要填写 `slug`。

### 小记与关于

小记和关于都是固定单页：小记源文件为 `src/content/memo/index.md`，不应标记为草稿；关于源文件为 `src/content/about/index.md`，正文中的友链、FAQ 和联系链接使用对应 directive。两者的页面标题和副标题在 Theme Console 中维护。

### 图片、摘要与正文

- 随笔 / 小记正文图片默认保存到当前内容的附件目录；絮语本地配图保存到 `public/bits/`。Admin Console 启用云存储后，新上传图片改写入配置的 bucket，并将 `https://` 地址写入内容，已有本地图片不会自动迁移。
- 列表摘要默认由正文清洗后截断；可用 `<!-- more -->` 指定截断位置。`description` 只用于 SEO 和 Open Graph 的 meta description，不改变列表摘要。
- Callout、Figure、Gallery、公式、代码块等写法与示例统一见 [Markdown 排版指南](https://astro.whono.me/archive/markdown-guide/)。

新建的随笔和絮语默认是草稿；保存后先在本地预览，确认内容、图片和 frontmatter 后再发布。

---

## 写在最后 

:::info[为什么会做一个本地后台]
Content Console 是整个后台里最复杂、投入时间最多的部分。既然都在本地写作、都要启动开发服务器，直接编辑 Markdown 也能完成，可能会有朋友疑惑为什么还要做这样一套后台？

- astro-whono 面向的用户不一定熟悉前端。直接编辑源文件需要记住 frontmatter 字段、目录结构和写作约定，后台把这些收进表单与按钮，降低上手门槛。
- 写作时更关心最终的排版效果。编辑页内置服务端预览，正文、卡片与关于页都能在保存前看到接近前台的呈现，不必来回切到浏览器确认。
- 常用的内容格式（Callout、图片、画廊、公式、emoji 等）可以从工具栏直接插入，省去手写标记和查阅文档。
- 小记、关于这类固定单页，过去只能改源文件；现在可以在后台原位编辑正文并预览，更方便。

Content Console 的目标不是替代命令行或编辑器，而是让没有代码基础的人也能顺手维护自己的内容。当然最好的方案还是做成真正的 CMS ，但那是另一个量级的工作了，也不在近期计划内。
:::

### 🔜当前进度与后续计划

Content Console 最初设想的功能目前基本实现，Admin 后台后续也会以维护和细节优化为主，暂时没有继续叠加新功能的计划。如果你在使用中有合适的想法或建议，也欢迎提出。

:::tip[后续计划]
评论功能在计划之内，目前初步考虑接入 Waline。随笔（essay）的接入相对直接；絮语（bits）是短动态类型的页面，还需要重新设计评论系统在这种页面下的样式与适配方式。因此评论模块虽然已经列入计划，正式上线可能还需要一些时间。
:::

---

以上内容覆盖了 Content Console 当前的内容管理入口与常用操作。使用中如果遇到内容异常、保存问题，或对功能有想法和建议，都欢迎提交 Issue。
