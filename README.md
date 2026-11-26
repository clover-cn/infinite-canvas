<p align="center">
  <img src="packages/workbench/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/github/stars/basketikun/infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/basketikun/infinite-canvas/tags"><img src="https://img.shields.io/github/v/tag/basketikun/infinite-canvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
<a href="https://trendshift.io/repositories/50077?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-50077" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/50077" alt="basketikun%2Finfinite-canvas | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="apps/docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="apps/docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="apps/docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="apps/docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="apps/docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="apps/docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="apps/docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="apps/cli/README.md">CLI 本地版</a> · <a href="agent-plugins/infinite-canvas">Codex / ZCode 插件</a>
</p>

无限画布是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种本地存储格式都可能直接调整，欢迎关注后续更新。
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：使用你配置的模型渠道，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- MCP 画布工具：CLI 本地版向 Codex、Claude Code 等外部 Agent 开放画布操作；右侧聊天使用渠道文本模型直接调用同一套工具。
- Codex App 插件：安装后会自动注册 MCP 并启动本地版画布。
- 插件系统内置插件市场，可一键安装、更新和管理插件，也支持上传插件包。开发自己的工作台页面、导航、布局或画布节点，可从[最小插件模板](plugins/template/)开始。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，灵活适配各类中转站与自建服务。
- 提示词库：内置 7 个开源提示词来源并支持自定义标准 JSON 来源，由浏览器直连拉取并缓存在本地。

完整功能说明见 [功能介绍](apps/docs/content/docs/overview/features.mdx)。

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 快速开始

项目提供两种运行方式：

- **CLI 本地版（推荐）**：功能完整，作品和渠道凭据保存在本机目录，支持插件命令行管理，并可通过 MCP 让 Codex、Claude Code 等 AI 助手操作画布。
- **纯 Web 版**：纯静态站点，数据保存在浏览器，不支持外部 AI 助手连接，适合部署静态站点或做二次开发。
- **桌面版**：用 Electron 窗口打开 CLI 本地版，功能与 CLI 相同，适合自行构建后分发。项目不提供桌面版安装包，需要自己构建。

### 本地启动

> CLI 本地版仅适用于个人在本机使用，请不要部署到服务器或开放给他人访问。本地版没有登录保护，开放后任何能访问的人都可以查看作品、使用你的模型密钥，并在这台电脑上运行代码。需要多人访问请二次开发或者部署纯 Web 版。

需要 Node.js 22 或更高版本：

```bash
npx -y @basketikun/infinite-canvas@latest serve --open
```

启动后打开终端显示的地址（默认 `http://localhost:17371`），作品默认保存在 `~/.infinite-canvas/workspace`，可用 `--data-dir` 指定其他目录。连接 AI 助手请在页面「设置 → Agent配置」中复制 MCP 配置。

### 本地开发

```bash
git clone git@github.com:basketikun/infinite-canvas.git
cd infinite-canvas
pnpm install --frozen-lockfile
pnpm dev --open
```

默认启动 CLI 本地工作台，支持源码热更新，无需先构建。桌面版使用 `pnpm dev:desktop`，与 CLI 共用工作区和插件；纯 Web 使用 `pnpm dev:web`。CLI 选项与数据目录见 [本地开发文档](apps/docs/content/docs/development/local-development.mdx)。

### 构建桌面版

```bash
pnpm install --frozen-lockfile
pnpm build:desktop
```

会为当前系统和架构打包应用到 `apps/desktop/dist/`，与 CLI 共用 `~/.infinite-canvas/workspace` 工作区。签名、安装程序和自动更新需要自行处理，详见 [桌面版说明](apps/desktop/README.md)。

### Docker 运行（纯 Web 版）

```bash
git clone git@github.com:basketikun/infinite-canvas.git
cd infinite-canvas
docker compose up -d
```

运行后默认端口3000，可访问 `http://localhost:3000`。

首次打开后进入右上角配置，填入自己的 OpenAI 兼容 `Base URL` 和 `API Key`。

如果默认的OpenAI接口调用方式与您的API不同，可自定义生图/视频脚本调用。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【开源无限画布(2群)】：https://qm.qq.com/q/HRt2kUnYiG

## 开源协议

本项目使用 [MIT License](LICENSE)。任何人都可以免费使用、复制、修改、分发、再授权和商业使用本项目，也可以用于闭源产品。

## Star History

<a href="https://www.star-history.com/?repos=basketikun%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>
