// Tauri v2 backend for EasyCLI
// Ports core Electron main.js logic to Rust with a simpler API surface (KISS)

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use futures_util::StreamExt;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
#[cfg(not(target_os = "windows"))]
use std::os::unix::process::CommandExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::tray::TrayIcon;
use tauri::WindowEvent;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use thiserror::Error;
use tokio::time::sleep;

static PROCESS_PID: Lazy<Arc<Mutex<Option<u32>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));
static TRAY_ICON: Lazy<Arc<Mutex<Option<TrayIcon>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));
static CALLBACK_SERVERS: Lazy<Arc<Mutex<HashMap<u16, (Arc<AtomicBool>, thread::JoinHandle<()>)>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));
// Keep-alive mechanism for Local mode
static KEEP_ALIVE_HANDLE: Lazy<Arc<Mutex<Option<(Arc<AtomicBool>, thread::JoinHandle<()>)>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));
// Store the password used to start CLIProxyAPI for keep-alive authentication
static CLI_PROXY_PASSWORD: Lazy<Arc<Mutex<Option<String>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

#[derive(Error, Debug)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("Zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Other: {0}")]
    Other(String),
}

fn home_dir() -> Result<PathBuf, AppError> {
    home::home_dir().ok_or_else(|| AppError::Other("Failed to resolve home directory".into()))
}

fn app_dir() -> Result<PathBuf, AppError> {
    Ok(home_dir()?.join("cliproxyapi"))
}

fn config_path() -> Result<PathBuf, AppError> {
    Ok(app_dir()?.join("config.yaml"))
}

fn management_key_path() -> Result<PathBuf, AppError> {
    Ok(app_dir()?.join("remote-management.key"))
}

fn webui_version_path() -> Result<PathBuf, AppError> {
    Ok(app_dir()?.join("webui-version.txt"))
}

fn static_management_html_path() -> Result<PathBuf, AppError> {
    Ok(app_dir()?.join("static").join("management.html"))
}

fn ensure_yaml_mapping(value: &mut serde_yaml::Value) -> &mut serde_yaml::Mapping {
    if !value.is_mapping() {
        *value = serde_yaml::Value::Mapping(Default::default());
    }
    value
        .as_mapping_mut()
        .expect("yaml value must be a mapping")
}

fn get_or_insert_mapping<'a>(
    parent: &'a mut serde_yaml::Mapping,
    key: &str,
) -> &'a mut serde_yaml::Mapping {
    let entry = parent
        .entry(serde_yaml::Value::from(key))
        .or_insert_with(|| serde_yaml::Value::Mapping(Default::default()));
    if !entry.is_mapping() {
        *entry = serde_yaml::Value::Mapping(Default::default());
    }
    entry
        .as_mapping_mut()
        .expect("nested yaml value must be a mapping")
}

fn is_hashed_secret_key(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("$2")
        || trimmed.starts_with("$argon")
        || trimmed.starts_with("bcrypt:")
        || trimmed.starts_with("argon2:")
}

fn read_management_key_file() -> Result<Option<String>, AppError> {
    let path = management_key_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let key = fs::read_to_string(path)?.trim().to_string();
    if key.is_empty() {
        Ok(None)
    } else {
        Ok(Some(key))
    }
}

fn write_management_key_file(secret_key: &str) -> Result<(), AppError> {
    let dir = app_dir()?;
    fs::create_dir_all(&dir)?;
    fs::write(management_key_path()?, secret_key)?;
    Ok(())
}

fn resolve_management_key(
    remote_management: &serde_yaml::Mapping,
) -> Result<ManagementKeyState, AppError> {
    let config_secret = remote_management
        .get(&serde_yaml::Value::from("secret-key"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let stored_key = read_management_key_file()?;
    let effective_key = if let Some(secret) = config_secret.as_deref() {
        if !is_hashed_secret_key(secret) {
            secret.to_string()
        } else {
            stored_key
                .clone()
                .unwrap_or_else(|| DEFAULT_MANAGEMENT_SECRET_KEY.to_string())
        }
    } else {
        stored_key
            .clone()
            .unwrap_or_else(|| DEFAULT_MANAGEMENT_SECRET_KEY.to_string())
    };

    if stored_key.as_deref() != Some(effective_key.as_str()) {
        write_management_key_file(&effective_key)?;
    }

    Ok(ManagementKeyState {
        config_secret,
        stored_key,
        effective_key,
    })
}

fn load_local_config(
    version_path: Option<&Path>,
) -> Result<(PathBuf, serde_yaml::Value), AppError> {
    let dir = app_dir()?;
    fs::create_dir_all(&dir)?;
    let config = dir.join("config.yaml");

    if !config.exists() {
        if let Some(version_path) = version_path {
            let example = version_path.join("config.example.yaml");
            if example.exists() {
                fs::copy(example, &config)?;
            }
        }
    }

    if config.exists() {
        let content = fs::read_to_string(&config)?;
        let value = serde_yaml::from_str(&content)?;
        Ok((config, value))
    } else {
        Ok((config, serde_yaml::Value::Mapping(Default::default())))
    }
}

fn save_local_config(config_path: &Path, value: &serde_yaml::Value) -> Result<(), AppError> {
    let output = serde_yaml::to_string(value)?;
    fs::write(config_path, output)?;
    Ok(())
}

fn generate_access_token() -> String {
    let random_part: String = thread_rng()
        .sample_iter(&Alphanumeric)
        .take(63)
        .map(char::from)
        .collect();
    format!("sk-{}", random_part)
}

fn ensure_config_defaults(value: &mut serde_yaml::Value) -> Result<bool, AppError> {
    let root = ensure_yaml_mapping(value);
    let mut changed = false;

    let port_key = serde_yaml::Value::from("port");
    if root
        .get(&port_key)
        .and_then(|value| value.as_u64())
        .is_none()
    {
        root.insert(port_key, serde_yaml::Value::from(DEFAULT_SERVICE_PORT));
        changed = true;
    }

    let remote_management = get_or_insert_mapping(root, "remote-management");

    let allow_remote_key = serde_yaml::Value::from("allow-remote");
    if remote_management
        .get(&allow_remote_key)
        .and_then(|value| value.as_bool())
        .is_none()
    {
        remote_management.insert(allow_remote_key, serde_yaml::Value::from(true));
        changed = true;
    }

    let panel_repo_key = serde_yaml::Value::from("panel-github-repository");
    if remote_management
        .get(&panel_repo_key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        remote_management.insert(
            panel_repo_key,
            serde_yaml::Value::from(DEFAULT_PANEL_GITHUB_REPOSITORY),
        );
        changed = true;
    }

    let management_key = resolve_management_key(remote_management)?;
    let should_write_secret = match management_key.config_secret.as_deref() {
        None => true,
        Some(secret) if is_hashed_secret_key(secret) && management_key.stored_key.is_none() => true,
        _ => false,
    };

    if should_write_secret {
        remote_management.insert(
            serde_yaml::Value::from("secret-key"),
            serde_yaml::Value::from(management_key.effective_key),
        );
        changed = true;
    }

    let api_keys_key = serde_yaml::Value::from("api-keys");
    let has_valid_access_token = root
        .get(&api_keys_key)
        .and_then(|value| value.as_sequence())
        .map(|sequence| {
            sequence.iter().any(|item| {
                item.as_str()
                    .map(str::trim)
                    .map(|token| !token.is_empty())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);

    if !has_valid_access_token {
        root.insert(
            api_keys_key,
            serde_yaml::Value::Sequence(vec![serde_yaml::Value::from(generate_access_token())]),
        );
        changed = true;
    }

    Ok(changed)
}

fn ensure_current_config() -> Result<(), AppError> {
    if let Some((_version, path)) = current_local_info()? {
        ensure_config(&path)?;
    }
    Ok(())
}

fn current_management_key() -> Result<String, AppError> {
    let current_version_path = current_local_info()?.map(|(_version, path)| path);
    let (_config_path, mut config_value) = load_local_config(current_version_path.as_deref())?;
    let _ = ensure_config_defaults(&mut config_value)?;
    let root = ensure_yaml_mapping(&mut config_value);
    let remote_management = get_or_insert_mapping(root, "remote-management");
    let management_key = resolve_management_key(remote_management)?;
    Ok(management_key.effective_key)
}

fn prepare_launch_config(version_path: &Path) -> Result<(PathBuf, u16, String), AppError> {
    let (config_path, mut config_value) = load_local_config(Some(version_path))?;
    let _ = ensure_config_defaults(&mut config_value)?;

    let root = ensure_yaml_mapping(&mut config_value);
    let remote_management = get_or_insert_mapping(root, "remote-management");
    let management_key = resolve_management_key(remote_management)?;
    let password = management_key.effective_key;

    remote_management.insert(
        serde_yaml::Value::from("secret-key"),
        serde_yaml::Value::from(password.as_str()),
    );

    let configured_port = root
        .get(&serde_yaml::Value::from("port"))
        .and_then(|value| value.as_u64())
        .unwrap_or(DEFAULT_SERVICE_PORT as u64) as u16;
    let port = choose_available_local_service_port(configured_port)?;
    if port != configured_port {
        println!(
            "[CLIProxyAPI][PORT] Configured port {} is unavailable, switching local service to {}",
            configured_port, port
        );
        root.insert(
            serde_yaml::Value::from("port"),
            serde_yaml::Value::from(port),
        );
    }

    save_local_config(&config_path, &config_value)?;

    Ok((config_path, port, password))
}

fn open_external_target(target: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(target).spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(target).spawn()?;
    }

    Ok(())
}

fn local_management_url(port: u16) -> String {
    format!("http://127.0.0.1:{}/management.html", port)
}

fn current_local_service_port() -> u16 {
    read_config_yaml()
        .unwrap_or(json!({}))
        .get("port")
        .and_then(|value| value.as_u64())
        .unwrap_or(DEFAULT_SERVICE_PORT as u64) as u16
}

fn is_management_center_response(response: &str) -> bool {
    response.contains("CLI Proxy API Management Center")
        || response.contains("CPAMC")
        || response.contains("management.html")
}

fn is_local_port_available(port: u16) -> bool {
    TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], port)))
        .map(|listener| {
            drop(listener);
            true
        })
        .unwrap_or(false)
}

fn choose_available_local_service_port(preferred_port: u16) -> Result<u16, AppError> {
    let mut candidates = vec![preferred_port];
    if preferred_port != DEFAULT_SERVICE_PORT {
        candidates.push(DEFAULT_SERVICE_PORT);
    }

    for candidate in DEFAULT_SERVICE_PORT..(DEFAULT_SERVICE_PORT + 20) {
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }

    for candidate in 18080..18100 {
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }

    for candidate in candidates {
        if is_local_management_ui_ready_now(candidate, Duration::from_millis(900))
            || is_local_port_available(candidate)
        {
            return Ok(candidate);
        }
    }

    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn is_local_management_ui_ready_now(port: u16, timeout: Duration) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, timeout) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let request = format!(
        "GET /management.html HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        port
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut buffer = [0_u8; 512];
    let size = match stream.read(&mut buffer) {
        Ok(size) if size > 0 => size,
        _ => return false,
    };

    let response = String::from_utf8_lossy(&buffer[..size]);
    (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
        && is_management_center_response(&response)
}

fn attach_existing_local_service(
    app: &tauri::AppHandle,
    port: u16,
    password: &str,
) -> serde_json::Value {
    *CLI_PROXY_PASSWORD.lock() = Some(password.to_string());
    let _ = create_tray(app);
    let _ = start_keep_alive(port);
    json!({
        "success": true,
        "message": "existing local service attached",
        "password": password,
        "reused": true
    })
}

fn resolve_path(input: &str, base: Option<&Path>) -> PathBuf {
    if input.is_empty() {
        return PathBuf::new();
    }
    if input.starts_with('~') {
        if let Some(h) = home::home_dir() {
            if input == "~" {
                return h;
            }
            if input.starts_with("~/") {
                return h.join(&input[2..]);
            }
            return h.join(&input[1..]);
        }
    }
    let p = PathBuf::from(input);
    if p.is_absolute() {
        return p;
    }
    if let Some(base) = base {
        return base.join(p);
    }
    p
}

fn normalize_ip_candidate(candidate: &str) -> Option<String> {
    let trimmed = candidate
        .trim()
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']'));

    if trimmed.is_empty() {
        return None;
    }

    trimmed.parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

fn extract_first_valid_ip(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_hexdigit() || c == '.' || c == ':'))
        .find_map(normalize_ip_candidate)
}

fn extract_iping_public_ip(html: &str) -> Option<String> {
    for marker in ["id=\"ipt\"", "id='ipt'"] {
        if let Some(index) = html.find(marker) {
            let end = (index + 500).min(html.len());
            let snippet = &html[index..end];

            for value_marker in ["value=\"", "value='"] {
                if let Some(start) = snippet.find(value_marker) {
                    let after_value = &snippet[start + value_marker.len()..];
                    let terminator = if value_marker.ends_with('"') {
                        '"'
                    } else {
                        '\''
                    };

                    if let Some(end_index) = after_value.find(terminator) {
                        if let Some(ip) = normalize_ip_candidate(&after_value[..end_index]) {
                            return Some(ip);
                        }
                    }
                }
            }
        }
    }

    if let Some(index) = html.find("userip") {
        let end = (index + 300).min(html.len());
        if let Some(ip) = extract_first_valid_ip(&html[index..end]) {
            return Some(ip);
        }
    }

    extract_first_valid_ip(html)
}

fn optional_text_or_fallback(value: Option<String>, fallback: &str) -> String {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn json_value_to_display(value: Option<serde_json::Value>, fallback: &str) -> String {
    fn convert(value: &serde_json::Value) -> Option<String> {
        match value {
            serde_json::Value::Null => None,
            serde_json::Value::Bool(flag) => Some(if *flag { "是" } else { "否" }.to_string()),
            serde_json::Value::Number(number) => Some(number.to_string()),
            serde_json::Value::String(text) => {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            serde_json::Value::Array(items) => {
                let parts: Vec<String> = items.iter().filter_map(convert).collect();
                if parts.is_empty() {
                    None
                } else {
                    Some(parts.join("、"))
                }
            }
            serde_json::Value::Object(_) => serde_json::to_string(value).ok(),
        }
    }

    value
        .as_ref()
        .and_then(convert)
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct VersionInfo {
    tag_name: String,
    #[serde(default)]
    published_at: Option<String>,
    assets: Vec<Asset>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Asset {
    name: String,
    browser_download_url: String,
}

#[derive(Serialize)]
struct OpResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    needsUpdate: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isLatest: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    latestVersion: Option<String>,
}

const DEFAULT_SERVICE_PORT: u16 = 8080;
const DEFAULT_MANAGEMENT_SECRET_KEY: &str = "12345678";
const CLI_PROXY_API_RELEASE_API_URL: &str =
    "https://api.github.com/repos/router-for-me/CLIProxyAPI/releases/latest";
const MANAGEMENT_CENTER_RELEASE_API_URL: &str =
    "https://api.github.com/repos/router-for-me/Cli-Proxy-API-Management-Center/releases/latest";
const MANAGEMENT_CENTER_ASSET_NAME: &str = "management.html";
const DEFAULT_PANEL_GITHUB_REPOSITORY: &str =
    "https://github.com/router-for-me/Cli-Proxy-API-Management-Center";
const PROJECT_REPOSITORY_URL: &str = "https://github.com/MaxMike427/CPACN";
const BUNDLED_CLI_PROXY_API_VERSION: &str =
    include_str!("../resources/bundled/cliproxyapi-version.txt");
const BUNDLED_CLI_PROXY_API_ASSET_NAME: &str =
    include_str!("../resources/bundled/cliproxyapi-asset-name.txt");
const BUNDLED_CLI_PROXY_API_ARCHIVE_BYTES: &[u8] =
    include_bytes!("../resources/bundled/cliproxyapi-bundle.bin");
const BUNDLED_WEBUI_VERSION: &str = include_str!("../resources/bundled/webui-version.txt");
const BUNDLED_MANAGEMENT_HTML: &str = include_str!("../resources/bundled/management.html");
const COMPONENT_UPDATE_RISK_NOTICE: &str = "组件更新将直接从 GitHub 下载最新发布版本并覆盖当前本地组件。该更新未经当前定制版开发者逐项验证，可能带来配置兼容、页面行为变化、接口差异或启动失败等风险，请确认后再更新。";
const MANAGEMENT_CENTER_GUARD_SCRIPT: &str = r#"<script id="easycli-management-guard">(function(){try{const blocked=new Set(["oauth-excluded-models","oauth-model-alias"]);const blockedPathPattern=/\/model-definitions\/(oauth-excluded-models|oauth-model-alias)(?:[/?#]|$)/i;const buildPayload=()=>JSON.stringify({models:[]});const getUrl=value=>typeof value==="string"?value:value&&typeof value.url==="string"?value.url:"";const isBlockedUrl=value=>blockedPathPattern.test(getUrl(value));const normalizeHash=()=>{const raw=window.location.hash||"";const marker=raw.indexOf("?");if(marker===-1)return;const route=raw.slice(0,marker);if(!route.includes("/auth-files/oauth-excluded")&&!route.includes("/auth-files/oauth-model-alias"))return;const search=new URLSearchParams(raw.slice(marker+1));const provider=(search.get("provider")||"").trim().toLowerCase();if(!blocked.has(provider))return;search.delete("provider");const next=search.toString();const base=`${window.location.pathname}${window.location.search}`;history.replaceState(history.state,"",`${base}${route}${next?`?${next}`:""}`)};const dispatchEventSafe=(target,type,ctorName)=>{try{const EventCtor=window[ctorName]||window.Event;const event=new EventCtor(type);const handler=target[`on${type}`];if(typeof handler==="function")handler.call(target,event);target.dispatchEvent(event)}catch(_){}};normalizeHash();const originalFetch=typeof window.fetch==="function"?window.fetch.bind(window):null;if(originalFetch){window.fetch=function(input,init){if(isBlockedUrl(input)){return Promise.resolve(new Response(buildPayload(),{status:200,headers:{"Content-Type":"application/json"}}));}return originalFetch(input,init);};}const XHR=window.XMLHttpRequest;if(XHR&&XHR.prototype){const originalOpen=XHR.prototype.open;const originalSend=XHR.prototype.send;const originalSetRequestHeader=XHR.prototype.setRequestHeader;XHR.prototype.open=function(method,url){this.__easycliBlockedRequest=isBlockedUrl(url)?{url:getUrl(url),payload:buildPayload()}:null;if(this.__easycliBlockedRequest){return;}return originalOpen.apply(this,arguments);};XHR.prototype.setRequestHeader=function(){if(this.__easycliBlockedRequest){return;}return originalSetRequestHeader.apply(this,arguments);};XHR.prototype.send=function(){if(!this.__easycliBlockedRequest){return originalSend.apply(this,arguments);}const request=this.__easycliBlockedRequest;Object.defineProperties(this,{readyState:{configurable:true,get:()=>4},status:{configurable:true,get:()=>200},statusText:{configurable:true,get:()=>"OK"},responseURL:{configurable:true,get:()=>request.url},responseText:{configurable:true,get:()=>request.payload},response:{configurable:true,get:()=>request.payload}});this.getResponseHeader=name=>name&&String(name).toLowerCase()==="content-type"?"application/json":null;this.getAllResponseHeaders=()=>"content-type: application/json\r\n";setTimeout(()=>{dispatchEventSafe(this,"readystatechange","Event");dispatchEventSafe(this,"load","Event");dispatchEventSafe(this,"loadend","ProgressEvent");},0);};}}catch(_){}})();</script>"#;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ComponentUpdateRequest {
    #[serde(default)]
    proxy_url: Option<String>,
}

#[derive(Debug)]
struct ManagementKeyState {
    config_secret: Option<String>,
    stored_key: Option<String>,
    effective_key: String,
}

#[derive(Debug, Deserialize)]
struct IpingApiResponse {
    code: i32,
    #[serde(default)]
    data: Option<IpingApiData>,
    #[serde(default)]
    msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IpingApiData {
    ip: Option<String>,
    country: Option<String>,
    isp: Option<String>,
    #[serde(default)]
    is_proxy: Option<serde_json::Value>,
    #[serde(rename = "type", default)]
    ip_type: Option<serde_json::Value>,
    #[serde(default)]
    risk_score: Option<serde_json::Value>,
    #[serde(default)]
    risk_tag: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct NetworkTestResult {
    ip: String,
    country: String,
    isp: String,
    is_proxy: String,
    ip_type: String,
    risk_score: String,
    risk_type: String,
}

fn compare_versions(a: &str, b: &str) -> i32 {
    let pa: Vec<i32> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let pb: Vec<i32> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let va = *pa.get(i).unwrap_or(&0);
        let vb = *pb.get(i).unwrap_or(&0);
        if va > vb {
            return 1;
        }
        if va < vb {
            return -1;
        }
    }
    0
}

fn normalize_release_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn current_local_info() -> Result<Option<(String, PathBuf)>, AppError> {
    let dir = app_dir()?;
    let version_file = dir.join("version.txt");
    if !version_file.exists() {
        return Ok(None);
    }
    let ver = fs::read_to_string(&version_file)?.trim().to_string();
    let path = dir.join(&ver);
    if !path.exists() {
        return Ok(None);
    }
    if find_executable(&path).is_none() {
        return Ok(None);
    }
    Ok(Some((ver, path)))
}

fn current_webui_version() -> Result<Option<String>, AppError> {
    let path = webui_version_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let version = normalize_release_version(&fs::read_to_string(path)?);
    if version.is_empty() {
        return Ok(None);
    }

    Ok(Some(version))
}

fn bundled_cliproxyapi_version() -> Option<String> {
    let version = normalize_release_version(BUNDLED_CLI_PROXY_API_VERSION);
    let asset_name = BUNDLED_CLI_PROXY_API_ASSET_NAME.trim();
    if version.is_empty() || asset_name.is_empty() || BUNDLED_CLI_PROXY_API_ARCHIVE_BYTES.is_empty()
    {
        None
    } else {
        Some(version)
    }
}

fn bundled_cliproxyapi_asset_name() -> Option<String> {
    let asset_name = BUNDLED_CLI_PROXY_API_ASSET_NAME.trim();
    if asset_name.is_empty() {
        None
    } else {
        Some(asset_name.to_string())
    }
}

fn bundled_webui_version() -> Option<String> {
    let version = normalize_release_version(BUNDLED_WEBUI_VERSION);
    if version.is_empty() || BUNDLED_MANAGEMENT_HTML.trim().is_empty() {
        None
    } else {
        Some(version)
    }
}

fn install_management_center_html_bytes(
    html_bytes: &[u8],
    latest: &str,
) -> Result<PathBuf, AppError> {
    let html_path = static_management_html_path()?;
    if let Some(parent) = html_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&html_path, html_bytes)?;
    fs::write(webui_version_path()?, latest)?;
    let _ = patch_management_center_html();
    Ok(html_path)
}

fn install_bundled_management_center_if_needed() -> Result<(), AppError> {
    let Some(latest) = bundled_webui_version() else {
        return Ok(());
    };

    let html_exists = static_management_html_path()?.exists();
    let current = current_webui_version()?;
    let needs_install = !html_exists
        || current
            .as_deref()
            .map(|version| compare_versions(version, &latest) < 0)
            .unwrap_or(true);

    if needs_install {
        let _ = install_management_center_html_bytes(BUNDLED_MANAGEMENT_HTML.as_bytes(), &latest)?;
    } else {
        let _ = patch_management_center_html();
    }

    Ok(())
}

fn cleanup_old_runtime_dirs(dir: &Path, latest: &str) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    let dir_name = entry.file_name();
                    let dir_name_str = dir_name.to_string_lossy();
                    if dir_name_str
                        .chars()
                        .next()
                        .map(|character| character.is_ascii_digit())
                        .unwrap_or(false)
                        && dir_name_str != latest
                    {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
        }
    }
}

fn install_bundled_cliproxyapi_release(latest: &str) -> Result<PathBuf, AppError> {
    let asset_name = bundled_cliproxyapi_asset_name()
        .ok_or_else(|| AppError::Other("Bundled CLIProxyAPI asset metadata is missing".into()))?;
    let dir = app_dir()?;
    fs::create_dir_all(&dir)?;

    let extract_path = dir.join(latest);
    if extract_path.exists() {
        let _ = fs::remove_dir_all(&extract_path);
    }

    extract_archive_bytes(
        BUNDLED_CLI_PROXY_API_ARCHIVE_BYTES,
        &asset_name,
        &extract_path,
    )?;
    fs::write(dir.join("version.txt"), latest)?;
    cleanup_old_runtime_dirs(&dir, latest);
    ensure_config(&extract_path)?;

    Ok(extract_path)
}

fn upsert_management_center_guard_script(html: &str) -> String {
    let marker = r#"<script id="easycli-management-guard">"#;
    if let Some(start) = html.find(marker) {
        if let Some(relative_end) = html[start..].find("</script>") {
            let end = start + relative_end + "</script>".len();
            let mut updated = String::with_capacity(
                html.len() - (end - start) + MANAGEMENT_CENTER_GUARD_SCRIPT.len(),
            );
            updated.push_str(&html[..start]);
            updated.push_str(MANAGEMENT_CENTER_GUARD_SCRIPT);
            updated.push_str(&html[end..]);
            return updated;
        }
    }

    html.replacen(
        r#"<script type="module" crossorigin>"#,
        format!(
            "{}{}",
            MANAGEMENT_CENTER_GUARD_SCRIPT, r#"<script type="module" crossorigin>"#
        )
        .as_str(),
        1,
    )
}

fn ensure_config(version_path: &Path) -> Result<(), AppError> {
    let (config_path, mut config_value) = load_local_config(Some(version_path))?;
    let changed = ensure_config_defaults(&mut config_value)?;
    if changed {
        save_local_config(&config_path, &config_value)?;
    }
    let _ = patch_management_center_html();
    Ok(())
}

fn patch_management_center_html() -> Result<bool, AppError> {
    let html_path = static_management_html_path()?;
    if !html_path.exists() {
        return Ok(false);
    }

    let original = fs::read_to_string(&html_path)?;
    let mut patched = original.clone();

    patched = patched.replace(
        r#"const xt=(Re||(r!=="all"?String(r):"")).trim(),Nt=new URLSearchParams;xt&&Nt.set("provider",xt);"#,
        r#"const xt=(Re||(r!=="all"?String(r):"")).trim(),Nt=new URLSearchParams,Qe=xt.toLowerCase();xt&&Qe!=="oauth-excluded-models"&&Qe!=="oauth-model-alias"&&Nt.set("provider",xt);"#,
    );
    patched = patched.replace(
        r#"const W=S.useMemo(()=>a1(d),[d]),$="#,
        r#"const W=S.useMemo(()=>{const I=a1(d);return I==="oauth-excluded-models"||I==="oauth-model-alias"?"":I},[d]),$="#,
    );
    patched = patched.replace(
        r#"W=S.useMemo(()=>a1(d),[d]),$="#,
        r#"W=S.useMemo(()=>{const I=a1(d);return I==="oauth-excluded-models"||I==="oauth-model-alias"?"":I},[d]),$="#,
    );
    patched = patched.replace(
        r#"async getModelDefinitions(t){const e=String(t??"").trim().toLowerCase();if(!e)return[];const n=await Fe.get(`/model-definitions/${encodeURIComponent(e)}`),i=n.models??n.models;return Array.isArray(i)?i:[]}"#,
        r#"async getModelDefinitions(t){const e=String(t??"").trim().toLowerCase();if(!e||e==="oauth-excluded-models"||e==="oauth-model-alias")return[];const n=await Fe.get(`/model-definitions/${encodeURIComponent(e)}`),i=n.models??n.models;return Array.isArray(i)?i:[]}"#,
    );

    patched = upsert_management_center_guard_script(&patched);

    if patched == original {
        return Ok(false);
    }

    fs::write(&html_path, patched)?;
    Ok(true)
}

fn parse_proxy(proxy_url: &str, builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    if proxy_url.is_empty() {
        return builder;
    }

    // Parse proxy URL to extract protocol, host, port, and optional auth
    match parse_proxy_url(proxy_url) {
        Ok(proxy_config) => {
            let proxy_builder = match proxy_config.protocol.as_str() {
                "http" | "https" => {
                    let url = if proxy_config.username.is_some() && proxy_config.password.is_some()
                    {
                        format!(
                            "{}://{}:{}@{}:{}",
                            proxy_config.protocol,
                            proxy_config.username.unwrap(),
                            proxy_config.password.unwrap(),
                            proxy_config.host,
                            proxy_config.port
                        )
                    } else {
                        format!(
                            "{}://{}:{}",
                            proxy_config.protocol, proxy_config.host, proxy_config.port
                        )
                    };
                    reqwest::Proxy::all(&url)
                }
                "socks5" => {
                    let url = if proxy_config.username.is_some() && proxy_config.password.is_some()
                    {
                        format!(
                            "socks5://{}:{}@{}:{}",
                            proxy_config.username.unwrap(),
                            proxy_config.password.unwrap(),
                            proxy_config.host,
                            proxy_config.port
                        )
                    } else {
                        format!("socks5://{}:{}", proxy_config.host, proxy_config.port)
                    };
                    reqwest::Proxy::all(&url)
                }
                _ => {
                    // Fallback to original behavior for unsupported protocols
                    return match reqwest::Proxy::all(proxy_url) {
                        Ok(p) => builder.proxy(p),
                        Err(_) => builder,
                    };
                }
            };

            match proxy_builder {
                Ok(proxy) => builder.proxy(proxy),
                Err(_) => builder,
            }
        }
        Err(_) => {
            // Fallback to original behavior if parsing fails
            match reqwest::Proxy::all(proxy_url) {
                Ok(p) => builder.proxy(p),
                Err(_) => builder,
            }
        }
    }
}

#[derive(Debug)]
struct ProxyConfig {
    protocol: String,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_proxy_url() {
        // Test HTTP proxy without auth
        let result = parse_proxy_url("http://proxy.example.com:8080");
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.protocol, "http");
        assert_eq!(config.host, "proxy.example.com");
        assert_eq!(config.port, 8080);
        assert!(config.username.is_none());
        assert!(config.password.is_none());

        // Test HTTPS proxy with auth
        let result = parse_proxy_url("https://user:pass@proxy.example.com:3128");
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.protocol, "https");
        assert_eq!(config.host, "proxy.example.com");
        assert_eq!(config.port, 3128);
        assert_eq!(config.username, Some("user".to_string()));
        assert_eq!(config.password, Some("pass".to_string()));

        // Test SOCKS5 proxy without auth
        let result = parse_proxy_url("socks5://127.0.0.1:1080");
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.protocol, "socks5");
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 1080);
        assert!(config.username.is_none());
        assert!(config.password.is_none());

        // Test SOCKS5 proxy with auth
        let result = parse_proxy_url("socks5://myuser:mypass@192.168.1.1:1080");
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.protocol, "socks5");
        assert_eq!(config.host, "192.168.1.1");
        assert_eq!(config.port, 1080);
        assert_eq!(config.username, Some("myuser".to_string()));
        assert_eq!(config.password, Some("mypass".to_string()));

        // Test invalid formats
        assert!(parse_proxy_url("invalid").is_err());
        assert!(parse_proxy_url("ftp://proxy:8080").is_err());
        assert!(parse_proxy_url("http://proxy").is_err());
        assert!(parse_proxy_url("http://user@proxy:8080").is_err());
    }
}

fn parse_proxy_url(proxy_url: &str) -> Result<ProxyConfig, String> {
    // Remove any whitespace
    let url = proxy_url.trim();

    // Parse URL format: protocol://[user:pass@]host:port
    if let Some(colon_pos) = url.find("://") {
        let protocol = &url[..colon_pos].to_lowercase();
        let rest = &url[colon_pos + 3..];

        // Check if protocol is supported
        if !["http", "https", "socks5"].contains(&protocol.as_str()) {
            return Err(format!("Unsupported proxy protocol: {}", protocol));
        }

        // Parse host:port and optional auth
        let (host_port, username, password) = if let Some(at_pos) = rest.find('@') {
            // Has authentication: user:pass@host:port
            let auth_part = &rest[..at_pos];
            let host_port_part = &rest[at_pos + 1..];

            if let Some(colon_pos) = auth_part.find(':') {
                let user = &auth_part[..colon_pos];
                let pass = &auth_part[colon_pos + 1..];
                (
                    host_port_part,
                    Some(user.to_string()),
                    Some(pass.to_string()),
                )
            } else {
                return Err(
                    "Invalid proxy authentication format. Expected user:pass@host:port".to_string(),
                );
            }
        } else {
            // No authentication: host:port
            (rest, None, None)
        };

        // Parse host:port
        if let Some(colon_pos) = host_port.rfind(':') {
            let host = &host_port[..colon_pos];
            let port_str = &host_port[colon_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                Ok(ProxyConfig {
                    protocol: protocol.to_string(),
                    host: host.to_string(),
                    port,
                    username,
                    password,
                })
            } else {
                Err(format!("Invalid port number: {}", port_str))
            }
        } else {
            Err("Invalid proxy format. Expected protocol://host:port or protocol://user:pass@host:port".to_string())
        }
    } else {
        Err("Invalid proxy URL format. Expected protocol://host:port".to_string())
    }
}

async fn fetch_latest_release_from_api(
    proxy_url: String,
    api_url: &str,
) -> Result<VersionInfo, AppError> {
    let client = parse_proxy(&proxy_url, reqwest::Client::builder())
        .user_agent("EasyCLI")
        .build()?;
    let resp = client
        .get(api_url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?
        .error_for_status()?;
    Ok(resp.json::<VersionInfo>().await?)
}

async fn fetch_latest_release(proxy_url: String) -> Result<VersionInfo, AppError> {
    fetch_latest_release_from_api(proxy_url, CLI_PROXY_API_RELEASE_API_URL).await
}

async fn fetch_latest_management_center_release(
    proxy_url: String,
) -> Result<VersionInfo, AppError> {
    fetch_latest_release_from_api(proxy_url, MANAGEMENT_CENTER_RELEASE_API_URL).await
}

async fn download_management_center_release(
    proxy_url: &str,
    release: &VersionInfo,
    latest: &str,
) -> Result<PathBuf, AppError> {
    let asset = release
        .assets
        .iter()
        .find(|item| item.name.eq_ignore_ascii_case(MANAGEMENT_CENTER_ASSET_NAME))
        .ok_or_else(|| {
            AppError::Other(format!(
                "No suitable WebUI asset found: {}",
                MANAGEMENT_CENTER_ASSET_NAME
            ))
        })?;

    let client = parse_proxy(proxy_url, reqwest::Client::builder())
        .user_agent("EasyCLI")
        .build()?;
    let response = client
        .get(&asset.browser_download_url)
        .header("Accept", "application/octet-stream")
        .send()
        .await?
        .error_for_status()?;
    let bytes = response.bytes().await?;
    install_management_center_html_bytes(&bytes, latest)
}

fn platform_archive_filename(version: &str) -> Result<String, AppError> {
    let platform = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let filename = match (platform, arch) {
        ("macos", "aarch64") => format!("CLIProxyAPI_{}_darwin_arm64.tar.gz", version),
        ("macos", "x86_64") => format!("CLIProxyAPI_{}_darwin_amd64.tar.gz", version),
        ("linux", "x86_64") => format!("CLIProxyAPI_{}_linux_amd64.tar.gz", version),
        ("linux", "aarch64") => format!("CLIProxyAPI_{}_linux_arm64.tar.gz", version),
        ("windows", "x86_64") => format!("CLIProxyAPI_{}_windows_amd64.zip", version),
        ("windows", "aarch64") => format!("CLIProxyAPI_{}_windows_arm64.zip", version),
        _ => {
            return Err(AppError::Other(format!(
                "Unsupported platform: {} {}",
                platform, arch
            )))
        }
    };

    Ok(filename)
}

async fn download_and_install_cliproxyapi_release(
    proxy: &str,
    release: VersionInfo,
    latest: &str,
    progress_window: Option<&tauri::Window>,
) -> Result<PathBuf, AppError> {
    let dir = app_dir()?;
    fs::create_dir_all(&dir)?;

    let filename = platform_archive_filename(latest)?;
    let asset = release
        .assets
        .into_iter()
        .find(|item| item.name == filename)
        .ok_or_else(|| AppError::Other(format!("No suitable download file found: {}", filename)))?;

    let download_path = dir.join(&filename);
    if let Some(window) = progress_window {
        window
            .emit("download-status", json!({"status": "starting"}))
            .ok();
    }

    let client = parse_proxy(proxy, reqwest::Client::builder()).build()?;
    let response = client.get(&asset.browser_download_url).send().await?;
    if !response.status().is_success() {
        return Err(AppError::Other(format!(
            "Download failed, status: {}",
            response.status()
        )));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = fs::File::create(&download_path)?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        file.write_all(&bytes)?;
        downloaded += bytes.len() as u64;

        if let Some(window) = progress_window {
            let progress = if total > 0 {
                (downloaded as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            window
                .emit(
                    "download-progress",
                    json!({"progress": progress, "downloaded": downloaded, "total": total}),
                )
                .ok();
        }
    }

    let extract_path = dir.join(latest);
    if extract_path.exists() {
        let _ = fs::remove_dir_all(&extract_path);
    }

    if download_path
        .extension()
        .and_then(|extension| extension.to_str())
        == Some("zip")
    {
        extract_zip(&download_path, &extract_path)?;
    } else {
        extract_targz(&download_path, &extract_path)?;
    }

    fs::write(dir.join("version.txt"), latest)?;

    cleanup_old_runtime_dirs(&dir, latest);

    let _ = fs::remove_file(&download_path);
    ensure_config(&extract_path)?;

    if let Some(window) = progress_window {
        window
            .emit(
                "download-status",
                json!({"status": "completed", "version": latest}),
            )
            .ok();
    }

    Ok(extract_path)
}

async fn ensure_latest_local_installation(
    proxy_url: String,
) -> Result<(String, PathBuf), AppError> {
    let dir = app_dir()?;
    fs::create_dir_all(&dir)?;
    install_bundled_management_center_if_needed()?;

    if let Some((version, path)) = current_local_info()? {
        if let Some(bundled_version) = bundled_cliproxyapi_version() {
            if compare_versions(&version, &bundled_version) < 0 {
                let extract_path = install_bundled_cliproxyapi_release(&bundled_version)?;
                return Ok((bundled_version, extract_path));
            }
        }
        ensure_config(&path)?;
        return Ok((version, path));
    }

    if let Some(bundled_version) = bundled_cliproxyapi_version() {
        let extract_path = install_bundled_cliproxyapi_release(&bundled_version)?;
        return Ok((bundled_version, extract_path));
    }

    let release = fetch_latest_release(proxy_url.clone()).await?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let extract_path =
        download_and_install_cliproxyapi_release(&proxy_url, release, &latest, None).await?;
    Ok((latest, extract_path))
}

async fn wait_for_local_management_ui(port: u16, timeout: Duration) -> bool {
    let url = local_management_url(port);
    let deadline = std::time::Instant::now() + timeout;
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    while std::time::Instant::now() < deadline {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(body) = response.text().await {
                    if is_management_center_response(&body) {
                        return true;
                    }
                }
            }
        }

        sleep(Duration::from_millis(500)).await;
    }

    false
}

async fn ensure_local_management_center_ready(
    app: &tauri::AppHandle,
) -> Result<(u16, bool), String> {
    let _ = ensure_latest_local_installation(String::new())
        .await
        .map_err(|error| error.to_string())?;

    let port = current_local_service_port();
    let password = current_management_key().map_err(|error| error.to_string())?;

    if wait_for_local_management_ui(port, Duration::from_secs(2)).await {
        let _ = attach_existing_local_service(app, port, &password);
        let _ = patch_management_center_html();
        return Ok((port, true));
    }

    let result = start_cliproxyapi(app.clone())?;
    let runtime_port = current_local_service_port();
    if !wait_for_local_management_ui(runtime_port, Duration::from_secs(20)).await {
        return Err("本地服务启动超时".to_string());
    }

    let _ = patch_management_center_html();
    Ok((
        runtime_port,
        result
            .get("reused")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    ))
}

async fn open_local_management_center(app: tauri::AppHandle) -> Result<(), String> {
    let (port, _) = ensure_local_management_center_ready(&app).await?;
    open_external_target(&local_management_url(port)).map_err(|error| error.to_string())
}

async fn bootstrap_default_local_mode(app: tauri::AppHandle) -> Result<(), String> {
    let _ = create_tray(&app);

    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.hide();
    }

    let _ = ensure_local_management_center_ready(&app).await?;
    open_settings_window(app)
}

#[tauri::command]
async fn check_version_and_download(
    window: tauri::Window,
    proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let proxy = proxy_url.unwrap_or_default();
    let dir = app_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let local = current_local_info().map_err(|e| e.to_string())?;
    window
        .emit("download-status", json!({"status": "checking"}))
        .ok();

    if let Some((ver, path)) = local {
        ensure_config(&path).map_err(|e| e.to_string())?;
        match fetch_latest_release(proxy.clone()).await {
            Ok(release) => {
                let latest = release.tag_name.trim_start_matches('v').to_string();
                let cmp = compare_versions(&ver, &latest);
                if cmp >= 0 {
                    window
                        .emit(
                            "download-status",
                            json!({"status": "latest", "version": ver}),
                        )
                        .ok();
                    return Ok(json!(OpResult {
                        success: true,
                        error: None,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(ver),
                        needsUpdate: Some(false),
                        isLatest: Some(true),
                        latestVersion: None
                    }));
                } else {
                    window
                        .emit(
                            "download-status",
                            json!({"status": "update-available", "version": ver, "latest": latest}),
                        )
                        .ok();
                    return Ok(json!(OpResult {
                        success: true,
                        error: None,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(ver),
                        needsUpdate: Some(true),
                        isLatest: Some(false),
                        latestVersion: Some(latest)
                    }));
                }
            }
            Err(error) => {
                eprintln!(
                    "[STARTUP] release check failed, continuing with local runtime {}: {}",
                    ver, error
                );
                window
                    .emit(
                        "download-status",
                        json!({"status": "latest", "version": ver}),
                    )
                    .ok();
                return Ok(json!(OpResult {
                    success: true,
                    error: None,
                    path: Some(path.to_string_lossy().to_string()),
                    version: Some(ver),
                    needsUpdate: Some(false),
                    isLatest: Some(true),
                    latestVersion: None
                }));
            }
        }
    }

    let release = fetch_latest_release(proxy.clone())
        .await
        .map_err(|e| e.to_string())?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    // No local found
    Ok(json!(OpResult {
        success: true,
        error: None,
        path: None,
        version: None,
        needsUpdate: Some(true),
        isLatest: Some(false),
        latestVersion: Some(latest)
    }))
}

#[tauri::command]
async fn download_cliproxyapi(
    window: tauri::Window,
    proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let proxy = proxy_url.unwrap_or_default();
    let release = fetch_latest_release(proxy.clone())
        .await
        .map_err(|e| e.to_string())?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let extract_path =
        download_and_install_cliproxyapi_release(&proxy, release, &latest, Some(&window))
            .await
            .map_err(|e| e.to_string())?;

    Ok(json!(OpResult {
        success: true,
        error: None,
        path: Some(extract_path.to_string_lossy().to_string()),
        version: Some(latest),
        needsUpdate: None,
        isLatest: None,
        latestVersion: None
    }))
}

fn extract_zip_reader<R: Read + io::Seek>(reader: R, dest: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dest)?;
    let mut archive = zip::ZipArchive::new(reader)?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i)?;
        let outpath = dest.join(f.mangled_name());
        if f.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p)?;
            }
            let mut outfile = fs::File::create(&outpath)?;
            io::copy(&mut f, &mut outfile)?;
        }
    }
    Ok(())
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), AppError> {
    let file = fs::File::open(zip_path)?;
    extract_zip_reader(file, dest)
}

fn extract_targz_reader<R: Read>(reader: R, dest: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dest)?;
    let dec = flate2::read::GzDecoder::new(reader);
    let mut archive = tar::Archive::new(dec);
    archive.unpack(dest)?;
    Ok(())
}

fn extract_targz(tar_gz_path: &Path, dest: &Path) -> Result<(), AppError> {
    let tar_gz = fs::File::open(tar_gz_path)?;
    extract_targz_reader(tar_gz, dest)
}

fn extract_archive_bytes(
    archive_bytes: &[u8],
    asset_name: &str,
    dest: &Path,
) -> Result<(), AppError> {
    let lower_name = asset_name.to_ascii_lowercase();
    if lower_name.ends_with(".zip") {
        extract_zip_reader(Cursor::new(archive_bytes), dest)
    } else if lower_name.ends_with(".tar.gz") || lower_name.ends_with(".tgz") {
        extract_targz_reader(Cursor::new(archive_bytes), dest)
    } else {
        Err(AppError::Other(format!(
            "Unsupported bundled archive format: {}",
            asset_name
        )))
    }
}

#[tauri::command]
fn check_secret_key() -> Result<serde_json::Value, String> {
    ensure_current_config().map_err(|e| e.to_string())?;

    if let Some(secret_key) = read_management_key_file().map_err(|e| e.to_string())? {
        if !secret_key.trim().is_empty() {
            return Ok(json!({"needsPassword": false}));
        }
    }

    let config_path = config_path().map_err(|e| e.to_string())?;
    if !config_path.exists() {
        return Ok(json!({"needsPassword": true, "reason": "Config file missing"}));
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let value: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let rm = value
        .get("remote-management")
        .and_then(|v| v.as_mapping())
        .cloned();
    if let Some(map) = rm {
        if let Some(sk) = map.get(&serde_yaml::Value::from("secret-key")) {
            if sk.as_str().map(|s| !s.trim().is_empty()).unwrap_or(false) {
                return Ok(json!({"needsPassword": false}));
            }
        }
    }
    Ok(json!({"needsPassword": true, "reason": "Missing secret-key"}))
}

#[derive(Deserialize)]
struct UpdateSecretKeyArgs {
    secret_key: String,
}

#[tauri::command]
fn update_secret_key(args: UpdateSecretKeyArgs) -> Result<serde_json::Value, String> {
    let secret_key = args.secret_key;
    let current_version_path = current_local_info()
        .map_err(|e| e.to_string())?
        .map(|(_version, path)| path);
    let (config_path, mut config_value) =
        load_local_config(current_version_path.as_deref()).map_err(|e| e.to_string())?;
    let _ = ensure_config_defaults(&mut config_value).map_err(|e| e.to_string())?;

    let root = ensure_yaml_mapping(&mut config_value);
    let remote_management = get_or_insert_mapping(root, "remote-management");
    remote_management.insert(
        serde_yaml::Value::from("secret-key"),
        serde_yaml::Value::from(secret_key.as_str()),
    );

    save_local_config(&config_path, &config_value).map_err(|e| e.to_string())?;
    write_management_key_file(&secret_key).map_err(|e| e.to_string())?;
    Ok(json!({"success": true}))
}

#[tauri::command]
fn read_config_yaml() -> Result<serde_json::Value, String> {
    ensure_current_config().map_err(|e| e.to_string())?;

    let p = config_path().map_err(|e| e.to_string())?;
    if !p.exists() {
        return Ok(json!({}));
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut v: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    if ensure_config_defaults(&mut v).map_err(|e| e.to_string())? {
        save_local_config(&p, &v).map_err(|e| e.to_string())?;
    }
    let json_v = serde_json::to_value(v).map_err(|e| e.to_string())?;
    Ok(json_v)
}

#[tauri::command]
fn update_config_yaml(
    endpoint: String,
    value: serde_json::Value,
    is_delete: Option<bool>,
) -> Result<serde_json::Value, String> {
    ensure_current_config().map_err(|e| e.to_string())?;

    let p = config_path().map_err(|e| e.to_string())?;
    if !p.exists() {
        return Err("Configuration file does not exist".into());
    }
    let normalized_value = if endpoint == "api-keys" {
        if is_delete.unwrap_or(false) {
            return Err("At least one access token is required".into());
        }

        let normalized_keys: Vec<String> = value
            .as_array()
            .ok_or("Access tokens must be an array")?
            .iter()
            .filter_map(|item| item.as_str().map(str::trim))
            .filter(|token| !token.is_empty())
            .map(ToOwned::to_owned)
            .collect();

        if normalized_keys.is_empty() {
            return Err("At least one access token is required".into());
        }

        serde_json::Value::Array(
            normalized_keys
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        )
    } else {
        value.clone()
    };
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut conf: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let parts: Vec<&str> = endpoint.split('.').collect();
    // Descend mapping
    let mut current = conf.as_mapping_mut().ok_or("Invalid config structure")?;
    for (i, part) in parts.iter().enumerate() {
        let key = serde_yaml::Value::from(*part);
        if i == parts.len() - 1 {
            if is_delete.unwrap_or(false) {
                current.remove(&key);
            } else {
                current.insert(
                    key,
                    serde_yaml::to_value(&normalized_value).map_err(|e| e.to_string())?,
                );
            }
        } else {
            let entry = current
                .entry(key)
                .or_insert_with(|| serde_yaml::Value::Mapping(Default::default()));
            if let Some(map) = entry.as_mapping_mut() {
                current = map;
            } else {
                return Err("Invalid nested config path".into());
            }
        }
    }
    let out = serde_yaml::to_string(&conf).map_err(|e| e.to_string())?;
    fs::write(&p, out).map_err(|e| e.to_string())?;
    if endpoint == "remote-management.secret-key" && !is_delete.unwrap_or(false) {
        if let Some(secret_key) = normalized_value.as_str() {
            write_management_key_file(secret_key).map_err(|e| e.to_string())?;
        }
    }
    Ok(json!({"success": true}))
}

#[tauri::command]
fn read_local_auth_files() -> Result<serde_json::Value, String> {
    let dir = app_dir().map_err(|e| e.to_string())?;
    let p = dir.join("config.yaml");
    if !p.exists() {
        return Ok(json!([]));
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let conf: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let auth_dir = conf.get("auth-dir").and_then(|v| v.as_str()).unwrap_or("");
    if auth_dir.is_empty() {
        return Ok(json!([]));
    }
    let base = p.parent().unwrap();
    let ad = resolve_path(auth_dir, Some(base));
    if !ad.exists() {
        return Ok(json!([]));
    }
    let mut result = vec![];
    for entry in fs::read_dir(ad).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        let path = e.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                if name.to_lowercase().ends_with(".json") {
                    let meta = e.metadata().map_err(|e| e.to_string())?;
                    let mut file_type = "unknown".to_string();
                    if let Ok(mut f) = fs::File::open(&path) {
                        let mut s = String::new();
                        let _ = f.read_to_string(&mut s);
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                            if let Some(t) = v.get("type").and_then(|x| x.as_str()) {
                                file_type = t.to_string();
                            }
                        }
                    }
                    let mod_ms = meta
                        .modified()
                        .ok()
                        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    result.push(json!({
                        "name": name,
                        "size": meta.len(),
                        "modtime": mod_ms,
                        "type": file_type
                    }));
                }
            }
        }
    }
    Ok(json!(result))
}

#[derive(Deserialize)]
struct UploadFile {
    name: String,
    content: String,
}

#[tauri::command]
fn upload_local_auth_files(files: Vec<UploadFile>) -> Result<serde_json::Value, String> {
    let dir = app_dir().map_err(|e| e.to_string())?;
    let p = dir.join("config.yaml");
    if !p.exists() {
        return Err("Configuration file does not exist".into());
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let conf: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let auth_dir = conf
        .get("auth-dir")
        .and_then(|v| v.as_str())
        .ok_or("auth-dir not configured in config.yaml")?;
    let base = p.parent().unwrap();
    let ad = resolve_path(auth_dir, Some(base));
    fs::create_dir_all(&ad).map_err(|e| e.to_string())?;
    let mut success = 0usize;
    let mut errors = vec![];
    let mut error_count = 0usize;
    for f in files {
        let path = ad.join(&f.name);
        if path.exists() {
            errors.push(format!("{}: File already exists", f.name));
            error_count += 1;
            continue;
        }
        if let Err(e) = fs::write(&path, f.content.as_bytes()) {
            errors.push(format!("{}: {}", f.name, e));
            error_count += 1;
        } else {
            success += 1;
        }
    }
    Ok(
        json!({"success": success>0, "successCount": success, "errorCount": error_count, "errors": if errors.is_empty(){serde_json::Value::Null}else{json!(errors)} }),
    )
}

#[tauri::command]
fn delete_local_auth_files(filenames: Vec<String>) -> Result<serde_json::Value, String> {
    let dir = app_dir().map_err(|e| e.to_string())?;
    let p = dir.join("config.yaml");
    if !p.exists() {
        return Err("Configuration file does not exist".into());
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let conf: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let auth_dir = conf
        .get("auth-dir")
        .and_then(|v| v.as_str())
        .ok_or("auth-dir not configured in config.yaml")?;
    let base = p.parent().unwrap();
    let ad = resolve_path(auth_dir, Some(base));
    if !ad.exists() {
        return Err("Authentication file directory does not exist".into());
    }
    let mut success = 0usize;
    let mut error_count = 0usize;
    for name in filenames {
        let path = ad.join(&name);
        match fs::remove_file(&path) {
            Ok(_) => success += 1,
            Err(_) => error_count += 1,
        }
    }
    Ok(json!({"success": success>0, "successCount": success, "errorCount": error_count}))
}

#[tauri::command]
fn download_local_auth_files(filenames: Vec<String>) -> Result<serde_json::Value, String> {
    let dir = app_dir().map_err(|e| e.to_string())?;
    let p = dir.join("config.yaml");
    if !p.exists() {
        return Err("Configuration file does not exist".into());
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let conf: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let auth_dir = conf
        .get("auth-dir")
        .and_then(|v| v.as_str())
        .ok_or("auth-dir not configured in config.yaml")?;
    let base = p.parent().unwrap();
    let ad = resolve_path(auth_dir, Some(base));
    if !ad.exists() {
        return Err("Authentication file directory does not exist".into());
    }
    let mut files = vec![];
    let mut error_count = 0usize;
    for name in filenames {
        let path = ad.join(&name);
        match fs::read_to_string(&path) {
            Ok(c) => files.push(json!({"name": name, "content": c})),
            Err(_) => error_count += 1,
        }
    }
    Ok(json!({"success": !files.is_empty(), "files": files, "errorCount": error_count}))
}

fn find_executable(version_path: &Path) -> Option<PathBuf> {
    let mut exe = PathBuf::from("cli-proxy-api");
    if cfg!(target_os = "windows") {
        exe.set_extension("exe");
    }
    let path = version_path.join(exe);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

#[tauri::command]
fn start_cliproxyapi(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let known_password = current_management_key().map_err(|e| e.to_string())?;
    let port = current_local_service_port();

    // Check if already running by testing PID
    if let Some(pid) = *PROCESS_PID.lock() {
        #[cfg(target_os = "windows")]
        {
            let output = std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid)])
                .output();
            if let Ok(output) = output {
                if String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()) {
                    if is_local_management_ui_ready_now(port, Duration::from_millis(1200)) {
                        *CLI_PROXY_PASSWORD.lock() = Some(known_password.clone());
                        return Ok(attach_existing_local_service(&app, port, &known_password));
                    }
                    *PROCESS_PID.lock() = None;
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            unsafe {
                if libc::kill(pid as i32, 0) == 0 {
                    if is_local_management_ui_ready_now(port, Duration::from_millis(1200)) {
                        *CLI_PROXY_PASSWORD.lock() = Some(known_password.clone());
                        return Ok(attach_existing_local_service(&app, port, &known_password));
                    }
                    *PROCESS_PID.lock() = None;
                }
            }
        }
    }

    if is_local_management_ui_ready_now(port, Duration::from_millis(1200)) {
        return Ok(attach_existing_local_service(&app, port, &known_password));
    }

    let info = current_local_info().map_err(|e| e.to_string())?;
    let (_ver, path) = info.ok_or("Version file does not exist")?;
    let exec = find_executable(&path).ok_or("Executable file does not exist")?;
    let (config, runtime_port, password) =
        prepare_launch_config(&path).map_err(|e| e.to_string())?;

    // Store the password for keep-alive authentication
    *CLI_PROXY_PASSWORD.lock() = Some(password.clone());

    println!("[CLIProxyAPI][START] exec: {}", exec.to_string_lossy());
    println!(
        "[CLIProxyAPI][START] args: -config {} --password {}",
        config.to_string_lossy(),
        password
    );
    let mut cmd = std::process::Command::new(&exec);
    cmd.args([
        "-config",
        config.to_string_lossy().as_ref(),
        "--password",
        &password,
    ]);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000 | 0x00000008); // CREATE_NO_WINDOW | DETACHED_PROCESS
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix systems, use process_group to detach from parent
        unsafe {
            cmd.pre_exec(|| {
                // Create new process group (session leader)
                libc::setsid();
                Ok(())
            });
        }
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = cmd.spawn().map_err(|e| {
        eprintln!("[CLIProxyAPI][ERROR] failed to start process: {}", e);
        e.to_string()
    })?;
    // Don't track the child process - let it run independently
    // Store PID for restart functionality
    let pid = child.id();
    *PROCESS_PID.lock() = Some(pid);
    println!("[CLIProxyAPI][START] Detached process with PID: {}", pid);
    // Drop child handle to fully detach
    std::mem::drop(child);
    // Don't monitor - process is fully detached
    // Create tray icon when local process starts
    let _ = create_tray(&app);

    // Start keep-alive mechanism for Local mode
    let _ = start_keep_alive(runtime_port);

    Ok(json!({"success": true, "password": password}))
}

#[tauri::command]
fn restart_cliproxyapi(app: tauri::AppHandle) -> Result<(), String> {
    // Kill existing detached process if PID is stored
    if let Some(pid) = *PROCESS_PID.lock() {
        println!("[CLIProxyAPI][RESTART] Killing old process PID: {}", pid);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    // Start new using current version
    let info = current_local_info().map_err(|e| e.to_string())?;
    let (ver, path) = info.ok_or("Version file does not exist")?;
    let exec = find_executable(&path).ok_or("Executable file does not exist")?;
    let (config, runtime_port, password) =
        prepare_launch_config(&path).map_err(|e| e.to_string())?;

    // Store the password for keep-alive authentication
    *CLI_PROXY_PASSWORD.lock() = Some(password.clone());

    println!("[CLIProxyAPI][RESTART] exec: {}", exec.to_string_lossy());
    println!(
        "[CLIProxyAPI][RESTART] args: -config {} --password {}",
        config.to_string_lossy(),
        password
    );
    let mut cmd = std::process::Command::new(&exec);
    cmd.args([
        "-config",
        config.to_string_lossy().as_ref(),
        "--password",
        &password,
    ]);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000 | 0x00000008); // CREATE_NO_WINDOW | DETACHED_PROCESS
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix systems, use process_group to detach from parent
        unsafe {
            cmd.pre_exec(|| {
                // Create new process group (session leader)
                libc::setsid();
                Ok(())
            });
        }
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = cmd.spawn().map_err(|e| {
        eprintln!("[CLIProxyAPI][ERROR] failed to restart process: {}", e);
        e.to_string()
    })?;
    // Store PID and drop child handle to fully detach
    let pid = child.id();
    *PROCESS_PID.lock() = Some(pid);
    println!("[CLIProxyAPI][RESTART] Detached process with PID: {}", pid);
    std::mem::drop(child);

    // Start keep-alive mechanism for Local mode
    let _ = start_keep_alive(runtime_port);

    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.emit("cliproxyapi-restarted", json!({"version": ver}));
    }
    Ok(())
}

fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::TrayIconBuilder,
    };
    let mut guard = TRAY_ICON.lock();
    if guard.is_some() {
        return Ok(());
    }

    let open_management = MenuItemBuilder::with_id("open_management", "打开管理中心").build(app)?;
    let open_settings = MenuItemBuilder::with_id("open_settings", "打开主控台").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_management, &open_settings, &quit])
        .build()?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("EasyCLI")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_management" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_local_management_center(app_handle).await;
                });
            }
            "open_settings" => {
                let _ = open_settings_window(app.clone());
            }
            "quit" => {
                // Just exit app - CLIProxyAPI continues running
                let _ = TRAY_ICON.lock().take();
                println!("[CLIProxyAPI][INFO] Quitting app - CLIProxyAPI continues in background");
                let _ = app.exit(0);
            }
            _ => {}
        });
    // Platform-specific tray icon
    #[cfg(target_os = "linux")]
    {
        const ICON_PNG: &[u8] = include_bytes!("../../images/icon.png");
        if let Ok(img) = image::load_from_memory(ICON_PNG) {
            let rgba = img.into_rgba8();
            let (w, h) = rgba.dimensions();
            let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
            builder = builder.icon(icon);
        }
    }
    #[cfg(target_os = "windows")]
    {
        const ICON_ICO: &[u8] = include_bytes!("../../images/icon.ico");
        if let Ok(dir) = ico::IconDir::read(Cursor::new(ICON_ICO)) {
            if let Some(entry) = dir.entries().iter().max_by_key(|e| e.width()) {
                if let Ok(img) = entry.decode() {
                    let w = img.width();
                    let h = img.height();
                    let rgba = img.rgba_data().to_vec();
                    let icon = tauri::image::Image::new_owned(rgba, w, h);
                    builder = builder.icon(icon);
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        // Try decode ICNS and convert to PNG buffer; fallback to PNG if needed.
        const ICON_ICNS: &[u8] = include_bytes!("../../images/icon.icns");
        let mut set = false;
        if let Ok(fam) = icns::IconFamily::read(Cursor::new(ICON_ICNS)) {
            use icns::IconType;
            let prefs = [
                IconType::RGBA32_512x512,
                IconType::RGBA32_256x256,
                IconType::RGBA32_128x128,
                IconType::RGBA32_64x64,
                IconType::RGBA32_32x32,
                IconType::RGBA32_16x16,
            ];
            for ty in prefs.iter() {
                if let Ok(icon_img) = fam.get_icon_with_type(*ty) {
                    let mut png_buf: Vec<u8> = Vec::new();
                    if icon_img.write_png(&mut png_buf).is_ok() {
                        if let Ok(img) = image::load_from_memory(&png_buf) {
                            let rgba = img.into_rgba8();
                            let (w, h) = rgba.dimensions();
                            let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                            builder = builder.icon(icon);
                            set = true;
                            break;
                        }
                    }
                }
            }
        }
        if !set {
            const ICON_PNG: &[u8] = include_bytes!("../../images/icon.png");
            if let Ok(img) = image::load_from_memory(ICON_PNG) {
                let rgba = img.into_rgba8();
                let (w, h) = rgba.dimensions();
                let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                builder = builder.icon(icon);
            }
        }
    }
    let tray = builder.build(app)?;
    *guard = Some(tray);
    Ok(())
}

fn callback_path_for(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "/anthropic/callback",
        "codex" => "/codex/callback",
        "google" => "/google/callback",
        "iflow" => "/iflow/callback",
        "antigravity" => "/antigravity/callback",
        _ => "/callback",
    }
}

fn build_redirect_url(
    mode: &str,
    provider: &str,
    base_url: Option<String>,
    local_port: Option<u16>,
    query: &str,
) -> String {
    let cb = callback_path_for(provider);
    let base = if mode == "local" {
        let port = local_port.unwrap_or(DEFAULT_SERVICE_PORT);
        format!("http://127.0.0.1:{}{}", port, cb)
    } else {
        let bu = base_url.unwrap_or_else(|| format!("http://127.0.0.1:{}", DEFAULT_SERVICE_PORT));
        // ensure single slash
        if bu.ends_with('/') {
            format!("{}{}", bu, cb.trim_start_matches('/'))
        } else {
            format!("{}/{}", bu, cb.trim_start_matches('/'))
        }
    };
    if query.is_empty() {
        base
    } else {
        format!("{}?{}", base, query)
    }
}

fn run_callback_server(
    stop: Arc<AtomicBool>,
    listen_port: u16,
    mode: String,
    provider: String,
    base_url: Option<String>,
    local_port: Option<u16>,
) {
    let addr = format!("127.0.0.1:{}", listen_port);
    let listener = match std::net::TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[CALLBACK] failed to bind {}: {}", addr, e);
            return;
        }
    };
    if let Err(e) = listener.set_nonblocking(false) {
        eprintln!("[CALLBACK] set_nonblocking failed: {}", e);
    }
    println!("[CALLBACK] listening on {} for provider {}", addr, provider);
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                // read request line
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut req_line = String::new();
                if reader.read_line(&mut req_line).is_ok() {
                    let pathq = req_line.split_whitespace().nth(1).unwrap_or("/");
                    let query = pathq.splitn(2, '?').nth(1).unwrap_or("");
                    let loc =
                        build_redirect_url(&mode, &provider, base_url.clone(), local_port, query);
                    let resp = format!(
                        "HTTP/1.1 302 Found\r\nLocation: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        loc
                    );
                    let _ = stream.write_all(resp.as_bytes());
                }
                let _ = stream.flush();
                let _ = stream.shutdown(std::net::Shutdown::Both);
            }
            Err(e) => {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                eprintln!("[CALLBACK] accept error: {}", e);
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
    println!("[CALLBACK] server on {} stopped", addr);
}

#[tauri::command]
fn start_callback_server(
    provider: String,
    listen_port: u16,
    mode: String,
    base_url: Option<String>,
    local_port: Option<u16>,
) -> Result<serde_json::Value, String> {
    let mut map = CALLBACK_SERVERS.lock();
    if let Some((flag, handle)) = map.remove(&listen_port) {
        flag.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect(("127.0.0.1", listen_port));
        let _ = handle.join();
    }
    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();
    let handle = thread::spawn(move || {
        run_callback_server(
            stop_clone,
            listen_port,
            mode,
            provider,
            base_url,
            local_port,
        )
    });
    map.insert(listen_port, (stop, handle));
    Ok(json!({"success": true}))
}

#[tauri::command]
fn stop_callback_server(listen_port: u16) -> Result<serde_json::Value, String> {
    // Take the server handle out of the map so it won't be stopped twice
    let opt = CALLBACK_SERVERS.lock().remove(&listen_port);
    if let Some((flag, handle)) = opt {
        // Signal stop and nudge the listener, then detach-join in background
        flag.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect(("127.0.0.1", listen_port));
        std::thread::spawn(move || {
            let _ = handle.join();
        });
        Ok(json!({"success": true}))
    } else {
        Ok(json!({"success": false, "error": "not running"}))
    }
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    // If settings window already exists (predefined in config), just show and focus it
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        // Ensure Dock icon is visible while settings is open (macOS only)
        #[cfg(target_os = "macos")]
        {
            let _ = app.show();
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            let _ = app.set_dock_visibility(true);
        }
        // Also close login window shortly after (do not exit app)
        let app_cloned = app.clone();
        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(50)).await;
            if let Some(main) = app_cloned.get_webview_window("main") {
                let _ = main.hide();
            }
        });
        return Ok(());
    }

    // Otherwise create it and show
    let url = WebviewUrl::App("settings.html".into());
    let win = WebviewWindowBuilder::new(&app, "settings", url)
        .title("EasyCLI 控制台")
        .inner_size(930.0, 600.0)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.show();
    let _ = win.set_focus();
    // Ensure Dock icon is visible while settings is open (macOS only)
    #[cfg(target_os = "macos")]
    {
        let _ = app.show();
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        let _ = app.set_dock_visibility(true);
    }
    // Close the main (login) window shortly after to avoid hanging the invoke (do not exit app)
    let app_cloned = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(50)).await;
        if let Some(main) = app_cloned.get_webview_window("main") {
            let _ = main.hide();
        }
    });
    Ok(())
}

#[tauri::command]
fn get_local_runtime_info() -> Result<serde_json::Value, String> {
    let port = current_local_service_port();
    let password = CLI_PROXY_PASSWORD
        .lock()
        .clone()
        .or_else(|| current_management_key().ok())
        .unwrap_or_else(|| DEFAULT_MANAGEMENT_SECRET_KEY.to_string());

    Ok(json!({
        "mode": "local",
        "port": port,
        "password": password,
        "managementUrl": local_management_url(port),
    }))
}

#[tauri::command]
async fn ensure_local_webui_ready(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let (port, reused) = ensure_local_management_center_ready(&app).await?;
    let password = CLI_PROXY_PASSWORD
        .lock()
        .clone()
        .or_else(|| current_management_key().ok())
        .unwrap_or_else(|| DEFAULT_MANAGEMENT_SECRET_KEY.to_string());

    Ok(json!({
        "success": true,
        "port": port,
        "password": password,
        "url": local_management_url(port),
        "reused": reused,
    }))
}

#[tauri::command]
async fn restart_local_service_stack(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let _ = ensure_latest_local_installation(String::new())
        .await
        .map_err(|error| error.to_string())?;

    restart_cliproxyapi(app.clone())?;

    let port = current_local_service_port();
    if !wait_for_local_management_ui(port, Duration::from_secs(20)).await {
        return Err("本地服务重启超时".to_string());
    }

    let password = CLI_PROXY_PASSWORD
        .lock()
        .clone()
        .or_else(|| current_management_key().ok())
        .unwrap_or_else(|| DEFAULT_MANAGEMENT_SECRET_KEY.to_string());

    let _ = patch_management_center_html();

    Ok(json!({
        "success": true,
        "port": port,
        "password": password,
        "url": local_management_url(port),
    }))
}

#[tauri::command]
fn open_external_link(url: String) -> Result<serde_json::Value, String> {
    open_external_target(&url).map_err(|error| error.to_string())?;

    Ok(json!({
        "success": true,
        "url": url,
    }))
}

#[tauri::command]
async fn run_network_test() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("EasyCLI/2.0.0")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建网络测试请求失败: {}", e))?;

    let homepage = client
        .get("https://www.iping.cc/?language=zh&tab=1")
        .send()
        .await
        .map_err(|e| format!("获取 iping 页面失败: {}", e))?
        .error_for_status()
        .map_err(|e| format!("iping 页面返回异常状态: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取 iping 页面内容失败: {}", e))?;

    let detected_ip =
        extract_iping_public_ip(&homepage).ok_or_else(|| "无法识别当前公网 IP".to_string())?;

    let response = client
        .get("https://api.iping.cc/v1/query")
        .query(&[("ip", detected_ip.as_str()), ("language", "zh")])
        .send()
        .await
        .map_err(|e| format!("调用 iping API 失败: {}", e))?
        .error_for_status()
        .map_err(|e| format!("iping API 返回异常状态: {}", e))?
        .json::<IpingApiResponse>()
        .await
        .map_err(|e| format!("解析 iping API 响应失败: {}", e))?;

    if response.code != 200 {
        return Err(response
            .msg
            .unwrap_or_else(|| "iping API 未返回成功结果".to_string()));
    }

    let data = response
        .data
        .ok_or_else(|| "iping API 未返回网络测试数据".to_string())?;

    let result = NetworkTestResult {
        ip: optional_text_or_fallback(data.ip, &detected_ip),
        country: optional_text_or_fallback(data.country, "未知"),
        isp: optional_text_or_fallback(data.isp, "未知"),
        is_proxy: json_value_to_display(data.is_proxy, "未知"),
        ip_type: json_value_to_display(data.ip_type, "未知"),
        risk_score: json_value_to_display(data.risk_score, "未知"),
        risk_type: json_value_to_display(data.risk_tag, "无"),
    };

    Ok(json!({
        "success": true,
        "result": result
    }))
}

async fn build_component_update_status(proxy_url: String) -> Result<serde_json::Value, AppError> {
    let cli_release = fetch_latest_release(proxy_url.clone()).await?;
    let cli_latest = normalize_release_version(&cli_release.tag_name);
    let cli_current = current_local_info()?.map(|(version, _)| version);
    let cli_has_update = match cli_current.as_deref() {
        Some(current) if !current.is_empty() => compare_versions(current, &cli_latest) < 0,
        _ => true,
    };

    let webui_release = fetch_latest_management_center_release(proxy_url).await?;
    let webui_latest = normalize_release_version(&webui_release.tag_name);
    let webui_current = current_webui_version()?;
    let webui_installed = static_management_html_path()?.exists();
    let webui_has_update = match webui_current.as_deref() {
        Some(current) if !current.is_empty() => compare_versions(current, &webui_latest) < 0,
        _ => true,
    };
    let webui_note = if webui_current.is_none() {
        Some(if webui_installed {
            "当前 WebUI 版本未记录，建议更新以覆盖旧组件。"
        } else {
            "尚未检测到本地 WebUI 文件，更新时会一并下载。"
        })
    } else {
        None
    };

    Ok(json!({
        "success": true,
        "hasUpdates": cli_has_update || webui_has_update,
        "riskNotice": COMPONENT_UPDATE_RISK_NOTICE,
        "projectRepository": PROJECT_REPOSITORY_URL,
        "webuiRepository": DEFAULT_PANEL_GITHUB_REPOSITORY,
        "cliProxyApi": {
            "currentVersion": cli_current,
            "latestVersion": cli_latest,
            "latestTag": cli_release.tag_name,
            "publishedAt": cli_release.published_at,
            "hasUpdate": cli_has_update,
        },
        "webui": {
            "currentVersion": webui_current,
            "latestVersion": webui_latest,
            "latestTag": webui_release.tag_name,
            "publishedAt": webui_release.published_at,
            "hasUpdate": webui_has_update,
            "note": webui_note,
        }
    }))
}

#[tauri::command]
async fn check_component_updates(
    request: Option<ComponentUpdateRequest>,
) -> Result<serde_json::Value, String> {
    let proxy_url = request
        .and_then(|value| value.proxy_url)
        .unwrap_or_default();
    build_component_update_status(proxy_url)
        .await
        .map_err(|error| error.to_string())
}

fn relaunch_current_application() -> Result<(), AppError> {
    let exe = std::env::current_exe()?;
    let mut command = std::process::Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }
    command.spawn()?;
    Ok(())
}

#[tauri::command]
async fn update_components_and_restart(
    app: tauri::AppHandle,
    request: Option<ComponentUpdateRequest>,
) -> Result<serde_json::Value, String> {
    let proxy_url = request
        .and_then(|value| value.proxy_url)
        .unwrap_or_default();

    let cli_release = fetch_latest_release(proxy_url.clone())
        .await
        .map_err(|error| error.to_string())?;
    let cli_latest = normalize_release_version(&cli_release.tag_name);
    let cli_current = current_local_info().map_err(|error| error.to_string())?;
    let cli_should_update = match cli_current.as_ref().map(|(version, _)| version.as_str()) {
        Some(current) if !current.is_empty() => compare_versions(current, &cli_latest) < 0,
        _ => true,
    };

    if cli_should_update {
        let _ =
            download_and_install_cliproxyapi_release(&proxy_url, cli_release, &cli_latest, None)
                .await
                .map_err(|error| error.to_string())?;
    } else if let Some((_, path)) = cli_current {
        ensure_config(&path).map_err(|error| error.to_string())?;
    }

    let webui_release = fetch_latest_management_center_release(proxy_url.clone())
        .await
        .map_err(|error| error.to_string())?;
    let webui_latest = normalize_release_version(&webui_release.tag_name);
    let webui_current = current_webui_version().map_err(|error| error.to_string())?;
    let webui_should_update = match webui_current.as_deref() {
        Some(current) if !current.is_empty() => compare_versions(current, &webui_latest) < 0,
        _ => true,
    };

    if webui_should_update {
        let _ = download_management_center_release(&proxy_url, &webui_release, &webui_latest)
            .await
            .map_err(|error| error.to_string())?;
    } else {
        let _ = patch_management_center_html();
    }

    relaunch_current_application().map_err(|error| error.to_string())?;
    let app_to_exit = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(450)).await;
        app_to_exit.exit(0);
    });

    Ok(json!({
        "success": true,
        "cliProxyApiUpdated": cli_should_update,
        "webuiUpdated": webui_should_update,
        "projectRepository": PROJECT_REPOSITORY_URL,
        "webuiRepository": DEFAULT_PANEL_GITHUB_REPOSITORY,
    }))
}

// Auto-start functionality

#[cfg(target_os = "macos")]
fn get_launch_agent_path() -> Result<PathBuf, AppError> {
    let home = home_dir()?;
    Ok(home.join("Library/LaunchAgents/com.easycli.app.plist"))
}

#[cfg(target_os = "linux")]
fn get_autostart_path() -> Result<PathBuf, AppError> {
    let home = home_dir()?;
    Ok(home.join(".config/autostart/easycli.desktop"))
}

#[cfg(target_os = "macos")]
fn get_app_path() -> Result<String, AppError> {
    // Get the path to the current executable
    let exe = std::env::current_exe()?;

    // Navigate up from the executable to find the .app bundle
    // Typical path: /Applications/EasyCLI.app/Contents/MacOS/EasyCLI
    let mut path = exe.as_path();

    // Go up directories until we find the .app bundle
    while let Some(parent) = path.parent() {
        if let Some(file_name) = parent.file_name() {
            if file_name.to_string_lossy().ends_with(".app") {
                return Ok(parent.to_string_lossy().to_string());
            }
        }
        path = parent;
    }

    // Fallback: return the executable path
    Ok(exe.to_string_lossy().to_string())
}

#[cfg(target_os = "linux")]
fn get_app_path() -> Result<String, AppError> {
    let exe = std::env::current_exe()?;
    Ok(exe.to_string_lossy().to_string())
}

#[cfg(target_os = "windows")]
fn get_app_path() -> Result<String, AppError> {
    let exe = std::env::current_exe()?;
    Ok(exe.to_string_lossy().to_string())
}

#[tauri::command]
fn check_auto_start_enabled() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let plist_path = get_launch_agent_path().map_err(|e| e.to_string())?;
        Ok(json!({"enabled": plist_path.exists()}))
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_path = get_autostart_path().map_err(|e| e.to_string())?;
        Ok(json!({"enabled": desktop_path.exists()}))
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run");

        match run_key {
            Ok(key) => match key.get_value::<String, _>("EasyCLI") {
                Ok(_) => Ok(json!({"enabled": true})),
                Err(_) => Ok(json!({"enabled": false})),
            },
            Err(_) => Ok(json!({"enabled": false})),
        }
    }
}

#[tauri::command]
fn enable_auto_start() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let plist_path = get_launch_agent_path().map_err(|e| e.to_string())?;
        let app_path = get_app_path().map_err(|e| e.to_string())?;

        // Create LaunchAgents directory if it doesn't exist
        if let Some(parent) = plist_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Create plist content
        let plist_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.easycli.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>"#,
            app_path
        );

        fs::write(&plist_path, plist_content).map_err(|e| e.to_string())?;
        Ok(json!({"success": true}))
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_path = get_autostart_path().map_err(|e| e.to_string())?;
        let app_path = get_app_path().map_err(|e| e.to_string())?;

        // Create autostart directory if it doesn't exist
        if let Some(parent) = desktop_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Create .desktop file content
        let desktop_content = format!(
            r#"[Desktop Entry]
Type=Application
Name=EasyCLI
Exec={}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=EasyCLI - API Proxy Management Tool"#,
            app_path
        );

        fs::write(&desktop_path, desktop_content).map_err(|e| e.to_string())?;
        Ok(json!({"success": true}))
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let app_path = get_app_path().map_err(|e| e.to_string())?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu
            .open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_WRITE,
            )
            .map_err(|e| e.to_string())?;

        run_key
            .set_value("EasyCLI", &app_path)
            .map_err(|e| e.to_string())?;
        Ok(json!({"success": true}))
    }
}

#[tauri::command]
fn disable_auto_start() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let plist_path = get_launch_agent_path().map_err(|e| e.to_string())?;
        if plist_path.exists() {
            fs::remove_file(&plist_path).map_err(|e| e.to_string())?;
        }
        Ok(json!({"success": true}))
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_path = get_autostart_path().map_err(|e| e.to_string())?;
        if desktop_path.exists() {
            fs::remove_file(&desktop_path).map_err(|e| e.to_string())?;
        }
        Ok(json!({"success": true}))
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        );

        if let Ok(key) = run_key {
            let _ = key.delete_value("EasyCLI");
        }
        Ok(json!({"success": true}))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                sleep(Duration::from_millis(150)).await;

                if let Err(error) = bootstrap_default_local_mode(app_handle.clone()).await {
                    eprintln!("[STARTUP] auto local bootstrap failed: {}", error);
                    let _ = create_tray(&app_handle);
                    let _ = open_settings_window(app_handle);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let has_tray = TRAY_ICON.lock().is_some();
                if has_tray {
                    api.prevent_close();
                    let _ = window.hide();
                    if window.label() == "settings" {
                        #[cfg(target_os = "macos")]
                        {
                            let _ = window
                                .app_handle()
                                .set_activation_policy(tauri::ActivationPolicy::Accessory);
                            let _ = window.app_handle().set_dock_visibility(false);
                        }
                    }
                    println!(
                        "[CLIProxyAPI][INFO] {} window hidden - app remains in tray",
                        window.label()
                    );
                    return;
                }
                // No tray icon yet (e.g., app closed before starting CLIProxyAPI) - allow default shutdown.
                println!(
                    "[CLIProxyAPI][INFO] {} window closed before tray initialization - exiting app",
                    window.label()
                );
            }
        })
        // Note: Tauri v2 has no Builder::on_exit; we rely on tray Quit and OS termination to close child.
        .invoke_handler(tauri::generate_handler![
            check_version_and_download,
            download_cliproxyapi,
            check_secret_key,
            update_secret_key,
            read_config_yaml,
            update_config_yaml,
            read_local_auth_files,
            upload_local_auth_files,
            delete_local_auth_files,
            download_local_auth_files,
            restart_cliproxyapi,
            start_cliproxyapi,
            open_settings_window,
            open_external_link,
            get_local_runtime_info,
            ensure_local_webui_ready,
            restart_local_service_stack,
            run_network_test,
            check_component_updates,
            update_components_and_restart,
            start_callback_server,
            stop_callback_server,
            save_files_to_directory,
            start_keep_alive,
            stop_keep_alive,
            check_auto_start_enabled,
            enable_auto_start,
            disable_auto_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Deserialize)]
struct SaveFile {
    name: String,
    content: String,
}

#[tauri::command]
fn save_files_to_directory(files: Vec<SaveFile>) -> Result<serde_json::Value, String> {
    if files.is_empty() {
        return Ok(json!({"success": false, "error": "No files to save"}));
    }
    // Show a system directory picker to choose the destination folder
    let folder = FileDialog::new()
        .set_title("选择保存目录")
        .pick_folder()
        .ok_or_else(|| "User cancelled directory selection".to_string())?;

    // Write each file into the chosen directory
    let mut success: usize = 0;
    let mut error_count: usize = 0;
    let mut errors: Vec<String> = Vec::new();
    for f in files {
        let path = folder.join(&f.name);
        match fs::write(&path, f.content.as_bytes()) {
            Ok(_) => success += 1,
            Err(e) => {
                error_count += 1;
                errors.push(format!("{}: {}", f.name, e));
            }
        }
    }

    Ok(json!({
        "success": success > 0,
        "successCount": success,
        "errorCount": error_count,
        "errors": if errors.is_empty() { serde_json::Value::Null } else { json!(errors) }
    }))
}

// Keep-alive mechanism functions

fn run_keep_alive_loop(stop: Arc<AtomicBool>, port: u16, password: String) {
    thread::spawn(move || {
        println!("[KEEP-ALIVE] Starting keep-alive loop for port {}", port);

        // Create a tokio runtime for async operations
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                println!("[KEEP-ALIVE] Failed to create tokio runtime: {}", e);
                return;
            }
        };

        while !stop.load(Ordering::SeqCst) {
            // Send keep-alive request
            let keep_alive_url = format!("http://127.0.0.1:{}/keep-alive", port);
            let password_clone = password.clone();

            let result = rt.block_on(async {
                println!("[KEEP-ALIVE] Sending request to: {}", keep_alive_url);
                println!(
                    "[KEEP-ALIVE] Using password: {}...",
                    &password_clone[..8.min(password_clone.len())]
                );
                reqwest::Client::new()
                    .get(&keep_alive_url)
                    .header("Authorization", format!("Bearer {}", &password_clone))
                    .header("Content-Type", "application/json")
                    .send()
                    .await
            });

            match result {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[KEEP-ALIVE] Request successful");
                    } else {
                        println!("[KEEP-ALIVE] Request failed: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[KEEP-ALIVE] Request error: {}", e);
                }
            }

            // Wait 5 seconds before next request
            for _ in 0..50 {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
        }

        println!("[KEEP-ALIVE] Keep-alive loop stopped");
    });
}

#[tauri::command]
fn start_keep_alive(port: u16) -> Result<serde_json::Value, String> {
    // Stop existing keep-alive if running
    stop_keep_alive_internal();

    // Get the stored password
    let password = CLI_PROXY_PASSWORD
        .lock()
        .clone()
        .ok_or("No CLIProxyAPI password available")?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();

    let handle = thread::spawn(move || {
        run_keep_alive_loop(stop_clone, port, password);
    });

    *KEEP_ALIVE_HANDLE.lock() = Some((stop, handle));

    println!("[KEEP-ALIVE] Started keep-alive for port {}", port);
    Ok(json!({"success": true}))
}

#[tauri::command]
fn stop_keep_alive() -> Result<serde_json::Value, String> {
    stop_keep_alive_internal();
    Ok(json!({"success": true}))
}

fn stop_keep_alive_internal() {
    if let Some((stop, handle)) = KEEP_ALIVE_HANDLE.lock().take() {
        println!("[KEEP-ALIVE] Stopping keep-alive mechanism");
        stop.store(true, Ordering::SeqCst);

        // Detach the handle to avoid blocking
        std::thread::spawn(move || {
            let _ = handle.join();
        });
    }
}
