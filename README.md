# OpenClaw Control Center Desktop

基于 [OpenClaw Control Center](https://github.com/TianyiDataScience/openclaw-control-center) 项目包装的桌面客户端。

## 说明

本桌面端基于[OpenClaw Control Center](https://github.com/TianyiDataScience/openclaw-control-center) 项目能力进行封装，为小白用户提供一个开箱即用的桌面端入口，可以给 OpenClaw 提供一个本地控制中心，便捷的查看养虾数据和进度。

## 致谢

- 感谢 `TianyiDataScience/openclaw-control-center` 项目作者提供的核心能力与持续维护
- 本项目聚焦于桌面端体验封装，功能能力以原项目为基础

## 如何下载

- 打开仓库的 Releases 页面下载最新 Windows 安装包：
  - `https://github.com/hicoldcat/openclaw-control-center-desktop/releases`
- 下载后运行安装程序即可

## 如何使用

1. 启动 OpenClaw Gateway
2. 打开 `OpenClaw Control Center Desktop`
3. 等待桌面端自动拉起 UI 服务并加载页面
4. 通过右上角窗口按钮可最小化、最大化、关闭

## 常见问题

- 启动后提示 Gateway 不可达：确认 `127.0.0.1:18789` 是否可访问
- 启动较慢：首次启动会进行依赖准备和构建，后续通常更快
- 关闭后端口仍被占用：重新打开再关闭一次，或结束残留 `node` 进程
