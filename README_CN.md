# EasyCLI Windows 定制版

[English README](README.md)

这是一个面向 Windows 的 EasyCLI 定制分支，保留了基于 Tauri 的 CLIProxyAPI 桌面控制能力，并加入了中文控制台、默认本地启动、WebUI 入口、接入教程、网络测试，以及安装后自动创建桌面快捷方式等功能。

当前定制版版本号：`1.0.5`

## 这个定制版增加了什么

- 启动器、设置页、运行时提示、托盘菜单全部汉化。
- 程序启动后默认本地运行。
- 启动时直接打开主控制台，不再自动打开浏览器管理中心。
- 新增 WebUI 入口，可跳转到管理中心页面。
- 新增接入教程入口，可打开本地 Markdown 教程。
- 新增网络测试页，可查看国家、运营商、是否代理、IP 类型、风险分数和风险类型。
- Windows NSIS 安装器支持自动创建桌面快捷方式。

## 感谢上游项目

这个定制版基于以下上游项目完成，感谢原作者和维护者：

- [router-for-me/EasyCLI](https://github.com/router-for-me/EasyCLI)
- [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)
- [luispater/CLIProxyAPI](https://github.com/luispater/CLIProxyAPI)

本仓库是社区定制版本，不代表上游官方发布。

## 核心功能

- 基于 Tauri 的 Windows 桌面图形界面。
- 支持本地模式和远程模式。
- 自动下载和更新 CLIProxyAPI 运行时。
- 默认本地服务端口为 `8080`。
- 默认开启远程管理。
- 默认远程管理密钥为 `12345678`。
- 支持访问令牌和认证文件管理。
- 支持 OpenAI 兼容提供商配置。
- 支持本地回调辅助登录流程。
- 支持托盘快捷操作：打开管理中心、打开主控制台、打开启动器、退出。

## 项目结构

- `login.html` 和 `js/login.js`：启动器与本地/远程入口。
- `settings.html` 和 `js/settings-*.js`：主控制台界面。
- `css/`：桌面界面样式。
- `images/`：图标与图片资源。
- `src-tauri/src/main.rs`：Tauri 后端与原生集成逻辑。
- `src-tauri/tauri.conf.json`：应用和打包配置。
- `src-tauri/resources/`：内置资源，例如 AI Agent 接入教程模板。
- `src-tauri/windows/`：Windows 安装器 Hook 脚本。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物位于 `src-tauri/target/release/`。

## 上传到 GitHub

上传源码即可，不要上传以下自动生成目录：

- `node_modules/`
- `dist-web/`
- `src-tauri/target/`
- `src-tauri/logs/`

我已经在当前目录下生成了一个 `GitHub/` 文件夹，里面放的是适合上传源码仓库的整理内容。

## 许可证

本项目遵循原项目许可证，请查看 [LICENSE](LICENSE)。
