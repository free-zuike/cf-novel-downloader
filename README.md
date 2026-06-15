# Novel Downloader (弦-书籍下载器 Web版)

开源的小说下载Web应用。基于 Node.js + Express + React + TypeScript 构建。

## 功能特性

- 多书源支持（可扩展）
- 小说搜索
- 章节浏览
- TXT 格式导出
- EPUB 格式导出
- 下载进度追踪
- RESTful API

## 快速开始

### 安装依赖

```bash
npm install
```

或手动安装各子包：

```bash
cd server && npm install && cd ..
cd web && npm install && cd ..
```

### 构建前端

```bash
cd web && npm run build
```

### 启动服务器

```bash
cd server && npm run build && npm start
```

访问 `http://localhost:3000` 即可使用。

### 开发模式

同时启动后端和前端（前端端口5173，后端端口3000）：

```bash
# 终端1 - 后端
cd server && npm run dev

# 终端2 - 前端
cd web && npm run dev
```

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sources` | 获取可用书源列表 |
| POST | `/api/search` | 搜索小说 `{ source, keyword }` |
| POST | `/api/novel` | 获取小说信息和章节列表 `{ source, novelId }` |
| POST | `/api/chapter` | 获取章节内容 `{ source, novelId, chapterId }` |
| POST | `/api/download` | 下载整本小说 `{ source, novelId, format }` |

## 扩展书源

在 `server/src/sources/` 目录下新建书源类，继承 `BaseSource` 并实现接口方法即可。

## 技术栈

- **后端**: Node.js + Express + TypeScript + Cheerio
- **前端**: React + Vite + TypeScript
- **导出**: TXT / EPUB

## 免责声明

本项目仅供学习交流使用，请支持正版。
