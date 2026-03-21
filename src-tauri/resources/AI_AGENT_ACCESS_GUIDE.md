# EasyCLI WebUI / Management API 接入说明（AI Agent 版）

这份文档面向脚本、自动化工具和 AI agent，目标是让你能最快接入当前这台 EasyCLI 所管理的 CLIProxyAPI 服务。

## 1. 默认环境

- 本地服务地址：`http://127.0.0.1:8080`
- WebUI 地址：`http://127.0.0.1:8080/management.html`
- 管理 API 基础地址：`http://127.0.0.1:8080/v0/management`
- 远程管理：默认已开启
- 默认远程管理密钥：`12345678`
- WebUI 项目来源：<https://github.com/router-for-me/Cli-Proxy-API-Management-Center>

如果当前 EasyCLI 连接的是远程服务，把 `127.0.0.1:8080` 替换成实际远程地址即可。

## 2. 鉴权规则

推荐优先使用下面这组请求头：

```http
Authorization: Bearer 12345678
Content-Type: application/json
```

EasyCLI 本地模式也兼容下面这个头：

```http
X-Management-Key: 12345678
```

简单理解：

- 通用/远程调用：优先用 `Authorization: Bearer <MANAGEMENT_KEY>`
- EasyCLI 本地配套调用：`X-Management-Key` 也可用

## 3. 最小接入流程

建议 AI agent 按下面顺序工作：

1. 先探活 `GET /v0/management/config`，确认服务和管理密钥都正确。
2. 如果要打开图形界面，直接访问 `/management.html`。
3. 如果要修改配置，优先操作具体管理接口，不要盲猜 YAML 结构。
4. 如果要走 OAuth 登录流程，先获取 `*-auth-url`，再轮询 `get-auth-status`。
5. 如果返回 `401`，先检查管理密钥；如果返回 `403`，通常是远程管理未开启。

## 4. 最常用的几个接口

### 4.1 读取完整配置

```bash
curl -H "Authorization: Bearer 12345678" \
  http://127.0.0.1:8080/v0/management/config
```

用途：

- 连接探活
- 获取当前端口、代理地址、认证目录、各类 provider 配置

### 4.2 打开 WebUI

直接用浏览器访问：

```text
http://127.0.0.1:8080/management.html
```

### 4.3 读取或更新某个配置项

示例：读取 `api-keys`

```bash
curl -H "Authorization: Bearer 12345678" \
  http://127.0.0.1:8080/v0/management/api-keys
```

示例：更新 `api-keys`

```bash
curl -X PUT \
  -H "Authorization: Bearer 12345678" \
  -H "Content-Type: application/json" \
  -d '["demo-key-1","demo-key-2"]' \
  http://127.0.0.1:8080/v0/management/api-keys
```

### 4.4 读取认证文件列表

```bash
curl -H "Authorization: Bearer 12345678" \
  http://127.0.0.1:8080/v0/management/auth-files
```

### 4.5 iFlow Cookie 直接导入

```bash
curl -X POST \
  -H "Authorization: Bearer 12345678" \
  -H "Content-Type: application/json" \
  -d '{"cookie":"<YOUR_IFLOW_COOKIE>"}' \
  http://127.0.0.1:8080/v0/management/iflow-auth-url
```

### 4.6 OAuth / 登录流程

先获取登录地址：

```bash
curl -H "Authorization: Bearer 12345678" \
  http://127.0.0.1:8080/v0/management/codex-auth-url
```

服务通常会返回：

```json
{
  "status": "ok",
  "url": "https://...",
  "state": "codex-..."
}
```

然后轮询状态：

```bash
curl -H "Authorization: Bearer 12345678" \
  "http://127.0.0.1:8080/v0/management/get-auth-status?state=codex-..."
```

可能返回：

- `{"status":"wait"}`：继续轮询
- `{"status":"ok"}`：已成功
- `{"status":"error","error":"..."}`：流程失败

## 5. JavaScript 示例

```js
const baseUrl = 'http://127.0.0.1:8080';
const managementKey = '12345678';

async function getConfig() {
  const response = await fetch(`${baseUrl}/v0/management/config`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function getAuthFiles() {
  const response = await fetch(`${baseUrl}/v0/management/auth-files`, {
    headers: {
      Authorization: `Bearer ${managementKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}
```

## 6. 注意事项

- `remote-management.allow-remote` 和 `remote-management.secret-key` 属于配置文件级别设置，不建议通过管理 API 动态猜测修改。
- 当前 EasyCLI 本地模式已经默认帮你设置：
  - `port: 8080`
  - `remote-management.allow-remote: true`
  - `remote-management.secret-key: 12345678`
- WebUI 和 Management API 共用同一个服务端口。
- 如果你在浏览器里能打开 `/management.html`，通常说明 WebUI 资源已可用。
- 如果接口返回 `401`，优先检查密钥；返回 `403`，优先检查远程管理是否开启；返回 `404`，优先检查路径是否写成了 `/v0/management/...`。

## 7. 推荐的 Agent 行为

如果你在写自动化代理，推荐这样约束自己：

1. 不要假设端口，先读配置。
2. 不要假设鉴权方式，优先 `Authorization: Bearer`。
3. 先读后写，写入前保留服务端当前值。
4. OAuth 流程必须处理 `wait / ok / error` 三种状态。
5. 需要浏览器界面时，直接跳 `/management.html`，不要自己重做一套面板。

## 8. 参考

- Management API 说明：<https://help.router-for.me/management/api.html>
- WebUI 项目：<https://github.com/router-for-me/Cli-Proxy-API-Management-Center>
