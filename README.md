# openclaw-control-center-desktop

基于 Electron 的 OpenClaw Control Center 桌面端包装项目。

## 目标

- 自动同步上游仓库：`https://github.com/TianyiDataScience/openclaw-control-center`
- 上游代码更新后自动构建桌面应用
- 启动桌面端时，先检查本地 OpenClaw Gateway
- 在后台启动上游 Node UI 服务，并在 Electron 中加载 UI

## 目录说明

- `electron/` Electron 主进程代码
- `scripts/sync-upstream.cjs` 同步上游代码脚本
- `upstream/` 上游仓库子模块（git submodule）
- `.github/workflows/sync-and-build.yml` 自动同步与打包流水线

## 本地使用

1. 同步上游代码

```bash
npm run sync:upstream
```

如果你是第一次拉取本仓库，建议使用：

```bash
git clone --recurse-submodules https://github.com/hicoldcat/openclaw-control-center-desktop.git
```

2. 安装桌面端依赖

```bash
npm install
```

3. 启动桌面应用

```bash
npm start
```

桌面端启动流程：

1. 检测 `127.0.0.1:18789`（OpenClaw Gateway）是否可达
2. 在 `upstream/` 执行：
   - `npm install`
   - `cp .env.example .env`（若 `.env` 不存在）
   - `npm run build`
   - `npm run dev:ui`
3. 等待 UI 就绪后在 Electron 窗口加载

启动优化：

- 桌面端会缓存上次 upstream 引导状态
- 仅在依赖或源码发生变化时才重新执行 `npm install` / `npm run build`
- 无变化时直接启动 UI，明显减少二次启动耗时
- 如果检测到本地已有可用 UI 服务（`/healthz` 正常），则直接复用，不重复拉起 node 进程

窗口行为：

- 顶部栏使用自定义窗口控件（最小化/最大化/关闭）
- Windows/Linux 控件在右侧，macOS 控件在左侧，交互保持一致
- 点击关闭按钮后直接退出 app
- 关闭 desktop 时会结束由 desktop 拉起的 upstream node 进程，并强制释放对应端口
- 若上次异常退出留下了 desktop 拉起的 node 进程，desktop 下次启动时会自动清理它

端口分配策略：

- desktop 启动 upstream 时不再读取 `.env` 的 `UI_PORT`
- 每次启动自动寻找一个可用本地端口（从 `4310` 开始）并通过启动命令注入 `UI_PORT`

图标资源：

- Windows 打包图标：`assets/windows/icon.ico`
- macOS 打包图标：`assets/macos/icon.icns`
- Linux 打包图标：`assets/linux/icons/*`
- 运行时窗口/托盘图标会按平台自动选取对应目录下的最佳尺寸资源

## 环境变量

- `OPENCLAW_GATEWAY_HOST`：默认 `127.0.0.1`
- `OPENCLAW_GATEWAY_PORT`：默认 `18789`

## GitHub Actions 自动同步与打包

工作流：`.github/workflows/sync-and-build.yml`

- 每 30 分钟触发一次
- 支持在 Actions 页面手动触发（`Run workflow`）
- 每次推送到 `master/main` 会触发一次轻量健康检查（不打包）
- 自动同步 `upstream/` 子模块到上游最新 `main`，并在有变更时自动提交子模块指针
- 当满足打包条件时执行：
  - 上游 `npm ci` + `npm run build`
  - 在 `windows-latest` 和 `macos-latest` 分别执行桌面端 `npm run dist`
  - 汇总两个平台构建产物并挂到同一个 GitHub Release
  - 自动创建并发布 Release（含安装包）

### 手动触发说明

- `force_package=true`：无论上游是否有变更，都强制打包并发布一个新 Release
- `force_package=false`：仅当上游有变更时才打包并发布 Release

## 首次仓库配置

```bash
git init
git remote add origin https://github.com/hicoldcat/openclaw-control-center-desktop.git
git submodule update --init --recursive
```

## 常见问题

- `npm start` 提示缺少 upstream：先执行 `git submodule update --init --recursive`，再执行 `npm run sync:upstream`
- `npm start` 启动后立刻失败：确认 OpenClaw Gateway 在 `127.0.0.1:18789` 可达，或设置 `OPENCLAW_GATEWAY_HOST` / `OPENCLAW_GATEWAY_PORT`
