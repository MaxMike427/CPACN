# EasyCLI Windows 定制版

[English README](README.md)

这是一个面向 Windows 的 EasyCLI 定制分支。它保留了基于 Tauri 的桌面外壳，同时把最新的本地运行核心和 WebUI 直接打包进安装包，并加入了适合本地管理 CLIProxyAPI 的中文主控制台。

当前定制版版本号：`1.2.0`

当前内置上游组件：

- `CLIProxyAPI v6.9.8`
- `Cli-Proxy-API-Management-Center v1.7.28`

## 定制版亮点

- 主控制台、运行时提示、托盘菜单全部汉化。
- 已移除启动台，只保留主控制台和浏览器 WebUI。
- 默认本地启动，程序打开时进入主控制台，不再自动打开浏览器。
- 内置 `WebUI 与教程`、`网络测试`、`组件更新`、`项目地址` 等标签页。
- 本地核心缺失或异常时可自动修复并重新启动服务。
- 基础设置里的端口说明改为显示当前实际运行端口，不再固定写死 `8080`。
- 本地状态栏旁边新增 `重启服务` 按钮。
- 当 `8080` 或 `8081` 被其他程序占用时，会自动切换到可用端口并同步刷新界面。
- Windows NSIS 安装包支持自动创建桌面快捷方式。
- 默认开启远程管理，默认远程管理密钥为 `12345678`。

## 完整更新记录

### `1.2.0`

- 修复 `打开 WebUI 失败` 的链路，改为由后端统一执行外部浏览器打开。
- 在主控制台底部本地状态区域新增 `重启服务` 按钮。
- 新增完整的本地服务栈重启命令：自动检查本地核心、修复缺失文件、重启 CLIProxyAPI、等待 WebUI 就绪，并把最新端口和地址刷新回界面。
- 修复“空版本目录被误判为已安装”的问题，现在会检查核心可执行文件是否真实存在。
- 将端口说明从 `默认：8080` 改成显示当前真实运行端口。
- 打开本地 WebUI 失败时，会自动尝试重启本地服务后再次打开。
- 改善端口冲突场景下的恢复能力，避免被其他程序长期占用 `8080` / `8081` 后 WebUI 打不开。

### `1.1.1`

- 将最新 CLIProxyAPI 和 WebUI 直接内置进安装包。
- 首次安装后优先使用安装包内置组件，不再强依赖联网下载。
- 保留本地定制补丁，并继续叠加到内置 WebUI 上。

### `1.1.0`

- 新增 `组件更新` 和 `项目地址` 标签页。
- 新增基于 GitHub Release 的 CLIProxyAPI / WebUI 组件更新能力，并在更新前显示风险确认弹窗。
- 针对 `oauth-excluded-models` 和相关伪 provider 加入本地补丁，避免 `unknown channel` 报错。

### `1.0.x`

- 将 GUI 界面汉化。
- 新增 WebUI 浏览器入口和 AI Agent 接入教程入口。
- 新增基于 `iping` 的网络测试面板。
- 改为默认本地启动，正常启动时不再强制先手动选择本地或远程。
- 新增中文 NSIS 安装包和桌面快捷方式。

## 当前运行逻辑

- 程序默认按本地模式启动。
- 打开程序时默认显示主控制台。
- 浏览器 WebUI 只会在用户点击后打开。
- 如果 `8080` 或 `8081` 已被其他程序占用，EasyCLI 会自动切换到可用端口，并把界面里的端口和 WebUI 地址同步更新。
- 基础设置页始终显示当前实际运行端口。

## 内置功能

- `WebUI 与教程`：打开管理中心和本地 Markdown 接入教程。
- `网络测试`：显示 IP、国家、运营商、是否代理、IP 类型、风险分数、风险类型。
- `组件更新`：检查 CLIProxyAPI 和 WebUI 的 GitHub 最新版本，并在确认后下载、覆盖、重启。
- `项目地址`：用默认浏览器打开当前定制版项目仓库。
- `访问令牌`、`认证文件`、`第三方 API Keys`、`OpenAI 兼容`：用于管理本地配置和认证资源。

## 感谢上游项目

这个定制版基于以下上游项目完成，感谢原作者和维护者：

- [router-for-me/EasyCLI](https://github.com/router-for-me/EasyCLI)
- [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)

本仓库为社区定制版本，不代表上游官方发布。

## 上游同步状态

检查时间：`2026-04-02`

- `router-for-me/EasyCLI`：当前桌面外壳基线仍然跟随上游 `main` 的 `9758f35`。
- `router-for-me/CLIProxyAPI`：当前定制版安装包内置 `v6.9.8`。
- `router-for-me/Cli-Proxy-API-Management-Center`：当前定制版安装包内置 `v1.7.28`。

## 项目结构

- `settings.html` 和 `js/settings-*.js`：主控制台界面。
- `css/`：桌面界面样式。
- `images/`：图标与图片资源。
- `src-tauri/src/main.rs`：Tauri 后端、运行核心管理和原生集成逻辑。
- `src-tauri/resources/`：内置运行资源、WebUI 和 AI Agent 教程模板。
- `src-tauri/windows/`：NSIS 安装器 Hook 脚本。
- `GitHub/CPACN/`：适合直接上传 GitHub 的源码快照，不包含构建产物。

## 许可说明

本项目遵循原项目许可协议，请查看 [LICENSE](LICENSE)。
