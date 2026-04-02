# EasyCLI Custom Windows Fork

[中文说明](README_CN.md)

This repository is a Windows-focused custom fork of EasyCLI. It keeps the Tauri desktop shell, bundles the latest local runtime and WebUI into the installer, and adds a Chinese control console tailored for local CLIProxyAPI management.

Current custom version: `1.2.0`

Bundled upstream components:

- `CLIProxyAPI v6.9.8`
- `Cli-Proxy-API-Management-Center v1.7.28`

## Highlights

- Full Chinese localization for the main control console, runtime prompts, and tray menu.
- Launcher removed. The app now keeps only the main control console and the browser WebUI.
- Default local startup flow. The app opens the main console on launch instead of auto-opening the browser.
- Built-in WebUI entry, tutorial entry, network test, component update, and project link tabs.
- Local service auto-repair and auto-restart when bundled runtime files are missing or invalid.
- Dynamic current port display in the Basic Settings page instead of a hardcoded `8080` label.
- One-click `Restart Service` button next to the local status indicator.
- Automatic port fallback when `8080` or `8081` is occupied by another process.
- Bundled Windows NSIS installer with desktop shortcut creation.
- Default remote management enabled with default secret key `12345678`.

## Full Custom Update Log

### `1.2.0`

- Fixed the `Open WebUI failed` path by moving external URL opening through the backend instead of relying on fragile frontend shell APIs.
- Added a `Restart Service` button beside the local status area in the control console.
- Added a full local service stack restart command that repairs local runtime files, restarts CLIProxyAPI, waits for WebUI readiness, and refreshes the UI port/address.
- Fixed runtime validation so an empty version directory is no longer treated as a valid installation.
- Changed the port description from `default: 8080` to the actual current runtime port shown in the UI.
- Improved local WebUI recovery so a failed open attempt triggers a local service restart and retries the browser launch.
- Improved handling for machines where other software occupies `8080` or `8081`.

### `1.1.1`

- Bundled the latest CLIProxyAPI runtime and WebUI directly into the installer.
- Switched startup to prefer bundled local components instead of relying on first-run online downloads.
- Kept custom patches on top of the bundled upstream WebUI.

### `1.1.0`

- Added `Component Update` and `Project Link` tabs.
- Added GitHub-based component update flow for CLIProxyAPI and WebUI with a risk confirmation dialog.
- Added local patching for `oauth-excluded-models` and related pseudo-provider requests in `management.html`.

### `1.0.x`

- Localized the GUI into Chinese.
- Added WebUI browser entry and AI agent tutorial entry.
- Added network test panel using `iping`.
- Added default local startup behavior and removed mandatory first-run local/remote selection from normal startup.
- Added Chinese NSIS packaging and desktop shortcut creation.

## Current Runtime Behavior

- The app starts in local mode by default.
- The main console opens on startup.
- The browser WebUI is opened only when requested by the user.
- If another process is already using `8080` or `8081`, EasyCLI will move the local service to an available port and update the UI to match.
- The Basic Settings page always shows the current active local port.

## Built-In Tools

- `WebUI & Tutorial`: opens the management center and the local Markdown integration guide.
- `Network Test`: shows IP, country, carrier, proxy status, IP type, risk score, and risk type.
- `Component Update`: checks GitHub releases for CLIProxyAPI and WebUI, then updates and restarts after confirmation.
- `Project Link`: opens the custom project repository in the default browser.
- `Access Token`, `Authentication Files`, `Third Party API Keys`, and `OpenAI Compatibility`: manage local configuration and auth assets.

## Acknowledgements

Special thanks to the upstream projects that made this custom build possible:

- [router-for-me/EasyCLI](https://github.com/router-for-me/EasyCLI)
- [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)

This repository is a community customization and is not an official upstream release.

## Upstream Sync Status

Checked on `2026-04-02`.

- `router-for-me/EasyCLI`: shell baseline still follows upstream `main` at commit `9758f35`.
- `router-for-me/CLIProxyAPI`: bundled into this build as `v6.9.8`.
- `router-for-me/Cli-Proxy-API-Management-Center`: bundled into this build as `v1.7.28`.

## Project Structure

- `settings.html` and `js/settings-*.js`: main control console.
- `css/`: desktop UI styles.
- `images/`: icons and image assets.
- `src-tauri/src/main.rs`: Tauri backend, runtime management, and native integration logic.
- `src-tauri/resources/`: bundled runtime resources, WebUI, and AI agent guide template.
- `src-tauri/windows/`: NSIS installer hook scripts.
- `GitHub/CPACN/`: GitHub-ready source snapshot without build artifacts.

## License

This repository follows the original project licensing terms. See [LICENSE](LICENSE).
