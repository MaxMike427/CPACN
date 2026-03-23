# EasyCLI Custom Windows Fork

[中文说明](README_CN.md)

This repository is a Windows-focused customized fork of EasyCLI. It keeps the Tauri desktop shell for CLIProxyAPI management and adds a Chinese control console, default local startup flow, WebUI entry, tutorial entry, network testing, and Windows installer shortcut creation.

Current fork version: `1.1.0`

## What This Fork Adds

- Chinese localization for the launcher, settings UI, runtime prompts, and tray menu.
- Default local runtime behavior on startup.
- Main control console opens on launch instead of opening the browser automatically.
- WebUI entry for the management center project.
- Tutorial entry that opens a local Markdown guide for AI agents and other integrations.
- Network test panel with IP, carrier, proxy, IP type, and risk information.
- Windows NSIS installer with desktop shortcut support.

## Acknowledgements

Special thanks to the upstream projects that made this customized build possible:

- [router-for-me/EasyCLI](https://github.com/router-for-me/EasyCLI)
- [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)
- [luispater/CLIProxyAPI](https://github.com/luispater/CLIProxyAPI)

This repository is a community customization and is not an official upstream release.

## Upstream Sync Status

Checked on `2026-03-23`.

- `router-for-me/EasyCLI`: latest upstream `main` is `9758f35` (`feat: Enhance Antigravity auth flow with local server handling and improved error management`, `2025-12-08`). No newer upstream EasyCLI code needed to be merged into this fork during this update.
- `router-for-me/Cli-Proxy-API-Management-Center`: latest upstream `main` is `2dcba439` and the latest fetched tag is `v1.7.15` (`2026-03-22`). Recent upstream changes are focused on styling, responsive layout, and visual configuration improvements.
- This fork does not vendor the management center frontend source directly. It keeps the existing WebUI entry and tutorial flow, and records the latest upstream status in this release.

## Core Features

- Tauri desktop GUI for Windows.
- Local and remote management modes.
- Automatic download and update of the CLIProxyAPI runtime.
- Default local service port `8080`.
- Remote management enabled by default.
- Default remote management key `12345678`.
- Access token and auth file management.
- OpenAI-compatible provider management.
- Local callback helpers for supported login flows.
- Tray-based quick actions for management center, main console, launcher, and exit.

## Project Structure

- `login.html` and `js/login.js`: launcher and local/remote mode entry.
- `settings.html` and `js/settings-*.js`: main control console.
- `css/`: desktop UI styles.
- `images/`: icons and image assets.
- `src-tauri/src/main.rs`: Tauri backend and native integration logic.
- `src-tauri/tauri.conf.json`: application and bundling configuration.
- `src-tauri/resources/`: bundled resources such as the AI agent access guide template.
- `src-tauri/windows/`: NSIS installer hook scripts.


## License

This repository follows the original project licensing terms. See [LICENSE](LICENSE).
