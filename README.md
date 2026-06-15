# Novel Downloader (弦-书籍下载器 Web版)

开源的小说下载 Web 应用。基于 **Cloudflare Workers** + **Hono** + **D1 Database** + **R2 Storage** 构建。

## 功能特性

- 多书源支持（可扩展）
- 小说搜索
- 章节浏览（带缓存）
- **异步下载任务**（整书下载不超时）
- TXT 格式导出
- R2 预签名链接下载
- D1 数据库缓存（小说/章节）

## 架构

```
Cloudflare Workers (Hono)
├── D1 Database (任务状态、缓存)
├── R2 Storage (下载文件)
└── Static Assets (前端)
```

## 快速开始

### 前置要求

- Node.js >= 18
- Cloudflare 账号
- Wrangler CLI (`npm i -g wrangler`)

### 1. 初始化 D1 数据库

```bash
cd worker
npm install
npx wrangler d1 create novel-db  # 创建 D1 数据库，复制 database_id
# 编辑 wrangler.toml 中的 database_id
npx wrangler d1 execute novel-db --local --file=./schema.sql  # 初始化本地 schema
```

### 2. 初始化 R2 存储桶

在 Cloudflare Dashboard 创建 R2 存储桶 `novel-downloads`，并在 `wrangler.toml` 中配置。

### 3. 配置 wrangler.toml

```toml
[[d1_databases]]
binding = "DB"
database_name = "novel-db"
database_id = "你的_D1_DATABASE_ID"  # 替换为实际 ID

[[r2_buckets]]
binding = "FILES"
bucket_name = "novel-downloads"
```

### 4. 本地开发

```bash
cd worker
npm install
npx wrangler dev
```

访问 `http://localhost:8787`

### 5. 部署

```bash
cd worker
npx wrangler deploy
```

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/sources` | 获取可用书源列表 |
| POST | `/api/search` | 搜索小说 `{ source, keyword }` |
| POST | `/api/novel` | 获取小说信息和章节列表 `{ source, novelId }` |
| POST | `/api/chapter` | 获取章节内容 `{ source, novelId, chapterId }` |
| POST | `/api/download` | **创建异步下载任务** `{ source, novelId, format }` |
| GET | `/api/task/:taskId` | 查询任务状态 |
| GET | `/api/download/:taskId` | 下载已完成的任务文件 |
| GET | `/api/tasks` | 列出最近的任务 |

## 扩展书源

在 `src/sources/` 目录下新建书源类，继承 `BaseSource` 并实现接口方法即可。

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono + TypeScript
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2
- **前端**: React + Vite + TypeScript

## 免责声明

本项目仅供学习交流使用，请支持正版。
