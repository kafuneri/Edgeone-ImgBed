# EdgeOne ImgBed (v1.5.0)

> 基于 **腾讯云 EdgeOne Makers (Pages)** 打造的极简、高可用、双态归档个人博客图床。  
> 具备 **类云盘管理**、**WebP/AVIF 客户端压缩**、**预签名直传**、**SHA-256 秒传去重**、**待删除队列与撤销** 及 **GitHub Actions 零 404 静态归档**，真正实现 **0 运维、0 超额账单**。

---

## 🌟 核心特性

- **双态生命周期（零 404 平滑过渡）**：
  - **暂存态（Staging in Blob）**：新上传文件写入 EdgeOne Blob，毫秒级生效，支持在管理界面新建目录、移动、重命名、批量操作与删除。
  - **已归档态（Archived in Git）**：GitHub Actions 每 3 天定时（或通过后台「立即归档」按钮手动触发）从 Blob 拉取新文件提交到仓库 `public/img/` 并更新 `manifest.json`。为彻底消除全球 CDN 节点同步空窗期，**本次归档的新文件会保留 Blob 副本至下一次 Action 运行时再自动释放**。
- **待删除队列与撤销**：
  - 支持对已归档静态文件点击「删除」（标记为 `Pending Del` / 待删除）或批量标记；在下次归档 Action 运行前可随时「撤销删除」，下次 Action 运行时自动从仓库删除并更新索引。
- **多格式支持与客户端压缩**：
  - 支持常见图片（WebP / PNG / JPG / GIF / AVIF / JXL / SVG / ICO）、视频（MP4 / MKV）、音频（MP3 / M4A）、文本/脚本（TXT / SH）与压缩包（ZIP）。
  - 浏览器端 Canvas / WebAssembly（AVIF）自动压缩，配合 `/api/upload/presign` 预签名直传绕过边缘函数请求体限制（单文件上限 25 MiB）；在上传工作台取消勾选「智能压缩」时直接原文件直传，不再强制转码。
- **SHA-256 秒传去重 & 访客只读图库**：
  - 上传前可选比对已归档文件 SHA-256，命中重复内容直接复用原外链。
  - 配置 `PUBLIC_GALLERY_DIRS` 后，可通过 `/gallery.html` 向访客开放指定目录的只读画廊（零 Blob 读开销）。
- **最小权限外链鉴权**：
  - 支持配置独立 `API_TOKEN` 用于 PicGo / curl 上传与列表查询，与管理员密码 `ADMIN_PASSWORD` 权限隔离（外链 Token 无权删除文件或触发归档）。

---

## 📁 目录结构

```text
Edgeone-ImgBed/
├── edge-functions/              # EdgeOne 边缘函数目录
│   ├── _utils/                  # 鉴权、Blob、路径校验、Manifest 工具库
│   ├── api/
│   │   ├── archive/             # 手动触发归档、待删除队列管理
│   │   ├── auth/                # 登录、登出、会话校验
│   │   ├── blob/                # 暂存文件的移动、重命名与删除
│   │   ├── upload/presign.js    # POST /api/upload/presign 预签名直传
│   │   ├── upload.js            # POST /api/upload 单步直传 (<=950KB)
│   │   ├── files.js             # GET /api/files 合并视图（静态+Blob+待删除）
│   │   ├── folders.js           # POST/DELETE /api/folders 目录管理
│   │   └── gallery.js           # GET /api/gallery 访客只读图库接口
│   └── img/[[path]].js          # GET/HEAD /img/* 静态未命中时的 Blob 回退服务
├── public/                      # 静态托管根目录
│   ├── index.html               # 管理后台单页
│   ├── gallery.html             # 访客只读图库页
│   ├── assets/                  # 前端样式、脚本与多语言字典 (zh / en)
│   ├── _meta/manifest.json      # 已归档静态文件索引
│   └── img/                     # 已归档静态文件目录
├── scripts/
│   ├── archive-from-blob.mjs    # GitHub Actions 归档、待删除清理与旧 Blob 释放
│   └── generate-manifest.mjs    # 本地扫描生成 manifest.json
├── .github/workflows/
│   └── archive-blob.yml         # 每 3 天定时自动归档工作流
├── edgeone.json                 # EdgeOne 部署与缓存头配置
└── package.json
```

---

## ⚙️ 环境变量配置

### 1. EdgeOne Makers 控制台（环境变量）

| 变量名 | 必填 | 默认值 / 说明 |
| :--- | :---: | :--- |
| `ADMIN_PASSWORD` | 是 | 管理员登录密码（本地默认 `admin123456`） |
| `SESSION_SECRET` | 是 | 32 位以上随机字符串，用于 HMAC-SHA256 签名 Cookie |
| `API_TOKEN` | 否 | 外链专用令牌（多个逗号分隔），仅允许上传与列表查询 |
| `BLOB_STORE_NAME` | 否 | Blob 存储名称，默认 `blog-images` |
| `PUBLIC_BASE_URL` | 否 | 自定义公开域名（如 `https://img.example.com`），未填则自动取请求域名 |
| `GITHUB_TOKEN` | 否 | 仅需 `Actions: Read and write` 权限，与 `GITHUB_REPO` 配合启用后台「立即归档」 |
| `GITHUB_REPO` | 否 | 目标 GitHub 仓库（格式 `owner/repo`，无硬编码默认值，使用「立即归档」时必填） |
| `GITHUB_WORKFLOW` | 否 | 归档工作流文件名，默认 `archive-blob.yml` |
| `GITHUB_BRANCH` | 否 | 触发工作流的分支名，默认 `main` |
| `PUBLIC_GALLERY_DIRS` | 否 | 开放给 `/gallery.html` 的目录列表（逗号分隔，如 `wallpapers,photos`） |

### 2. GitHub 仓库（Actions Secrets & Variables）

在 GitHub 仓库 **Settings -> Secrets and variables -> Actions** 中配置：
- **Secrets**：`EO_API_TOKEN`（EdgeOne 控制台生成的 API Token）
- **Variables**：`EO_PROJECT_ID`（EdgeOne 项目 ID，如 `makers-xxxx`）

---

## 🛠️ curl 上传示例

```bash
# 使用 API_TOKEN 或 ADMIN_PASSWORD 单步直传（<= 950 KB）
curl -X POST "https://<你的域名>/api/upload?dir=blog/2026&name=cover.webp" \
  -H "Authorization: Bearer <API_TOKEN 或 ADMIN_PASSWORD>" \
  -F "file=@./my-image.png"
```

---

## 🧪 本地开发与测试

```bash
npm install
npm run build   # 扫描 public/img 生成 manifest.json
npm test        # 运行单元测试 (node --test)
edgeone makers dev
```
