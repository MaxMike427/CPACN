// Access Token management for local/remote modes

// Elements
const addLocalApiKeyBtn = document.getElementById('add-local-api-key-btn');
const addRemoteApiKeyBtn = document.getElementById('add-remote-api-key-btn');
const accessTokenModal = document.getElementById('access-token-modal');
const accessTokenModalTitle = document.getElementById('access-token-modal-title');
const accessTokenForm = document.getElementById('access-token-form');
const accessTokenInput = document.getElementById('access-token-input');
const accessTokenModalClose = document.getElementById('access-token-modal-close');
const accessTokenModalCancel = document.getElementById('access-token-modal-cancel');
const accessTokenModalGenerate = document.getElementById('access-token-modal-generate');
const accessTokenModalSave = document.getElementById('access-token-modal-save');
const ACCESS_TOKEN_USAGE_BASE_URL = 'http://154.217.234.98:8888';

// State
let accessTokenKeys = [];
let originalAccessTokenKeys = [];
let currentAccessTokenEditIndex = null;
let currentAccessTokenMode = null; // 'local' or 'remote'
let accessTokenUsageModalState = null;
const accessTokenUsageCopyStore = new Map();

function generateRandomAccessToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(63);

    if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }

    let token = 'sk-';
    for (let index = 0; index < bytes.length; index += 1) {
        token += chars[bytes[index] % chars.length];
    }
    return token;
}

function normalizeAccessTokenKeys(keys) {
    return (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || '').trim())
        .filter((key) => key.length > 0);
}

// Load Access Token keys
async function loadAccessTokenKeys() {
    try {
        accessTokenKeys = await configManager.getApiKeys('access-token');
        if (!Array.isArray(accessTokenKeys)) {
            accessTokenKeys = [];
        }
        accessTokenKeys = normalizeAccessTokenKeys(accessTokenKeys);
        originalAccessTokenKeys = JSON.parse(JSON.stringify(accessTokenKeys));
        renderAccessTokenKeys();
    } catch (error) {
        console.error('Error loading Access Token keys:', error);
        showError('Failed to load Access Token keys');
        renderAccessTokenKeys();
    }
}

function renderAccessTokenKeys() {
    const connectionType = localStorage.getItem('type') || 'local';
    const localSection = document.getElementById('local-api-keys-section');
    const remoteSection = document.getElementById('remote-api-keys-section');
    if (connectionType === 'local') {
        localSection.style.display = 'block';
        remoteSection.style.display = 'none';
        renderAccessTokenKeysList('local');
    } else {
        localSection.style.display = 'none';
        remoteSection.style.display = 'block';
        renderAccessTokenKeysList('remote');
    }
}

function renderAccessTokenKeysList(mode) {
    const listId = mode === 'local' ? 'local-api-keys-list' : 'remote-api-keys-list';
    const loadingId = mode === 'local' ? 'local-api-keys-loading' : 'remote-api-keys-loading';
    const loading = document.getElementById(loadingId);
    const list = document.getElementById(listId);
    if (!list) return;
    if (loading) loading.style.display = 'none';

    if (accessTokenKeys.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <div class="empty-state-text">No Access Tokens</div>
                <div class="empty-state-subtitle">Add your first access token to get started</div>
            </div>
        `;
        return;
    }

    list.innerHTML = '';
    accessTokenKeys.forEach((key, index) => {
        const keyItem = document.createElement('div');
        keyItem.className = 'api-key-item';
        keyItem.innerHTML = `
            <div class="api-key-info">
                <div class="api-key-value">${key}</div>
            </div>
            <div class="api-key-actions">
                <button class="api-key-btn use" onclick="showAccessTokenUsageModal(${index})">使用密钥</button>
                <button class="api-key-btn edit" onclick="editAccessTokenKey(${index})">Edit</button>
                <button class="api-key-btn delete" onclick="deleteAccessTokenKey(${index})">Delete</button>
            </div>
        `;
        list.appendChild(keyItem);
    });
}

function showAccessTokenModal(mode, editIndex = null) {
    currentAccessTokenMode = mode;
    currentAccessTokenEditIndex = editIndex;
    accessTokenModalTitle.textContent = editIndex !== null ? 'Edit Access Token' : 'Add Access Token';
    accessTokenInput.value = '';
    clearAccessTokenFormErrors();
    if (editIndex !== null) {
        accessTokenInput.value = accessTokenKeys[editIndex];
    }
    accessTokenModal.classList.add('show');
    accessTokenInput.focus();
}

function hideAccessTokenModal() {
    accessTokenModal.classList.remove('show');
    currentAccessTokenMode = null;
    currentAccessTokenEditIndex = null;
}

function saveAccessTokenKey() {
    const apiKey = accessTokenInput.value.trim();
    const currentTab = document.querySelector('.tab.active').getAttribute('data-tab');
    if (currentTab !== 'access-token') {
        showError('Please switch to Access Token tab to manage access tokens');
        return;
    }
    clearAccessTokenFormErrors();
    let hasErrors = false;
    if (!apiKey) {
        showAccessTokenFieldError(accessTokenInput, 'Please fill in this field');
        hasErrors = true;
    }
    if (!hasErrors) {
        const isDuplicate = accessTokenKeys.some((key, index) => index !== currentAccessTokenEditIndex && key === apiKey);
        if (isDuplicate) {
            showAccessTokenFieldError(accessTokenInput, 'This access token already exists');
            hasErrors = true;
        }
    }
    if (hasErrors) return;
    if (currentAccessTokenEditIndex !== null) {
        accessTokenKeys[currentAccessTokenEditIndex] = apiKey;
    } else {
        accessTokenKeys.push(apiKey);
    }
    renderAccessTokenKeys();
    hideAccessTokenModal();
}

function fillRandomAccessToken() {
    accessTokenInput.value = generateRandomAccessToken();
    clearAccessTokenFormErrors();
    accessTokenInput.focus();
}

function showAccessTokenFieldError(input, message) {
    input.classList.add('error');
    input.focus();
    showError(message);
}

function clearAccessTokenFormErrors() {
    accessTokenInput.classList.remove('error');
}

function editAccessTokenKey(index) {
    const connectionType = localStorage.getItem('type') || 'local';
    showAccessTokenModal(connectionType, index);
}

function deleteAccessTokenKey(index) {
    if (normalizeAccessTokenKeys(accessTokenKeys).length <= 1) {
        showError('至少保留一个访问令牌');
        return;
    }

    showConfirmDialog(
        'Confirm Delete',
        'Are you sure you want to delete this access token?\nThis action cannot be undone.',
        () => {
            accessTokenKeys.splice(index, 1);
            renderAccessTokenKeys();
        }
    );
}

function buildCodexConfig(token, { windows = false } = {}) {
    const codexBaseUrl = `${ACCESS_TOKEN_USAGE_BASE_URL.replace(/\/+$/, '')}/v1`;
    const lines = [
        'model_provider = "cliproxyapi"',
        'model = "gpt-5-codex"',
        'model_reasoning_effort = "high"',
        '',
        '[model_providers.cliproxyapi]',
        'name = "cliproxyapi"',
        `base_url = "${codexBaseUrl}"`,
        'wire_api = "responses"'
    ];

    return {
        intro: '按照 CLIProxyAPI 官方文档，将以下配置写入 Codex CLI 配置目录。',
        note: 'config.toml 中只保留与现有配置不冲突的模型和 provider 设置；API 密钥写入 auth.json。',
        pathLabel: windows ? '%userprofile%\\.codex\\config.toml' : '~/.codex/config.toml',
        configToml: lines.join('\n'),
        authPathLabel: windows ? '%userprofile%\\.codex\\auth.json' : '~/.codex/auth.json',
        authJson: JSON.stringify({ OPENAI_API_KEY: token }, null, 2),
        footer: windows
            ? '按 Win+R，输入 %userprofile%\\.codex 打开配置目录。如目录不存在，请先手动创建。'
            : '请确保配置目录存在。macOS/Linux 用户可运行 mkdir -p ~/.codex 创建目录。'
    };
}

function buildClaudeTemplate(token, platform) {
    const settingsPath = platform === 'macos'
        ? '~/.claude/settings.json'
        : '%userprofile%\\.claude\\settings.json';
    const env = {
        ANTHROPIC_BASE_URL: ACCESS_TOKEN_USAGE_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5-codex(high)',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5-codex(medium)',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-codex(low)'
    };
    const envJson = JSON.stringify({ env }, null, 2);

    let shellLabel = '';
    let shellContent = '';

    if (platform === 'macos') {
        shellLabel = 'Terminal';
        shellContent = Object.entries(env)
            .map(([key, value]) => `export ${key}="${value}"`)
            .join('\n');
    } else if (platform === 'windows-cmd') {
        shellLabel = 'Command Prompt';
        shellContent = Object.entries(env)
            .map(([key, value]) => `set ${key}=${value}`)
            .join('\n');
    } else {
        shellLabel = 'PowerShell';
        shellContent = Object.entries(env)
            .map(([key, value]) => `$env:${key}="${value}"`)
            .join('\n');
    }

    return {
        intro: '启动 CLIProxyAPI 服务后，按 Claude Code 官方接入方式设置以下环境变量。',
        shellLabel,
        shellContent,
        vscodePath: settingsPath,
        vscodeLabel: 'Claude Code settings.json',
        vscodeContent: envJson,
        footer: 'Claude Code 2.x 使用 ANTHROPIC_DEFAULT_*_MODEL 选择模型；如使用 1.x，请改用 ANTHROPIC_MODEL 与 ANTHROPIC_SMALL_FAST_MODEL。'
    };
}

function buildOpenCodeTemplate(token) {
    const content = {
        $schema: 'https://opencode.ai/config.json',
        provider: {
            openai: {
                options: {
                    baseURL: `${ACCESS_TOKEN_USAGE_BASE_URL.replace(/\/+$/, '')}/v1`,
                    apiKey: token
                }
            }
        },
        model: 'gpt-5.3-codex'
    };

    return {
        intro: '启动 CLIProxyAPI 服务后，按照 OpenCode 官方接入方式编辑配置文件。',
        pathLabel: '~/.config/opencode/opencode.json',
        content: JSON.stringify(content, null, 2)
    };
}

function createCopyId(content) {
    const copyId = `usage-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    accessTokenUsageCopyStore.set(copyId, content);
    return copyId;
}

function renderUsageCopyButton(content) {
    const copyId = createCopyId(content);
    return `<button type="button" class="copy-btn usage-copy-btn" data-copy-id="${copyId}">复制</button>`;
}

function renderUsageCodeBlock(pathLabel, content, extraClass = '') {
    return `
        <div class="usage-code-block ${extraClass}">
            <div class="usage-code-header">
                <span class="usage-file-path">${pathLabel}</span>
                ${renderUsageCopyButton(content)}
            </div>
            <pre class="usage-code-pre"><code>${escapeHtml(content)}</code></pre>
        </div>
    `;
}

function getAccessTokenUsageTabs() {
    return [
        { id: 'codex', label: 'Codex CLI' },
        { id: 'claude', label: 'Claude Code' },
        { id: 'opencode', label: 'OpenCode' }
    ];
}

function renderAccessTokenUsageTabs() {
    return getAccessTokenUsageTabs().map((tab) => `
        <button type="button" class="usage-tab ${accessTokenUsageModalState.activeTab === tab.id ? 'active' : ''}" data-usage-tab="${tab.id}">
            ${tab.label}
        </button>
    `).join('');
}

function renderAccessTokenUsagePlatformTabs(tabId) {
    const platformOptions = tabId === 'claude'
        ? [
            { id: 'macos', label: 'macOS / Linux' },
            { id: 'windows-cmd', label: 'Windows CMD' },
            { id: 'powershell', label: 'PowerShell' }
        ]
        : [
            { id: 'macos', label: 'macOS / Linux' },
            { id: 'windows', label: 'Windows' }
        ];

    const activePlatform = accessTokenUsageModalState.platforms[tabId];
    return platformOptions.map((platform) => `
        <button type="button" class="usage-platform-tab ${activePlatform === platform.id ? 'active' : ''}" data-usage-platform="${tabId}:${platform.id}">
            ${platform.label}
        </button>
    `).join('');
}

function renderAccessTokenUsageContent() {
    const token = accessTokenUsageModalState.token;
    const activeTab = accessTokenUsageModalState.activeTab;

    if (activeTab === 'codex') {
        const activePlatform = accessTokenUsageModalState.platforms[activeTab];
        const template = buildCodexConfig(token, {
            windows: activePlatform === 'windows'
        });

        return `
            <div class="usage-intro">${template.intro}</div>
            <div class="usage-platform-tabs">${renderAccessTokenUsagePlatformTabs(activeTab)}</div>
            <div class="usage-note warning">${template.note}</div>
            ${renderUsageCodeBlock(template.pathLabel, template.configToml)}
            ${renderUsageCodeBlock(template.authPathLabel, template.authJson)}
            <div class="usage-note info">${template.footer}</div>
        `;
    }

    if (activeTab === 'claude') {
        const activePlatform = accessTokenUsageModalState.platforms.claude;
        const template = buildClaudeTemplate(token, activePlatform);

        return `
            <div class="usage-intro">${template.intro}</div>
            <div class="usage-platform-tabs">${renderAccessTokenUsagePlatformTabs(activeTab)}</div>
            <div class="usage-section-title">${template.shellLabel}</div>
            ${renderUsageCodeBlock(template.shellLabel, template.shellContent)}
            <div class="usage-section-title">${template.vscodeLabel}</div>
            ${renderUsageCodeBlock(template.vscodePath, template.vscodeContent)}
            <div class="usage-note info">${template.footer}</div>
        `;
    }

    const template = buildOpenCodeTemplate(token);
    return `
        <div class="usage-note warning">${template.intro}</div>
        ${renderUsageCodeBlock(template.pathLabel, template.content)}
    `;
}

function bindAccessTokenUsageEvents() {
    document.querySelectorAll('[data-usage-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            accessTokenUsageModalState.activeTab = button.dataset.usageTab;
            renderAccessTokenUsageModal();
        });
    });

    document.querySelectorAll('[data-usage-platform]').forEach((button) => {
        button.addEventListener('click', () => {
            const [tabId, platformId] = button.dataset.usagePlatform.split(':');
            accessTokenUsageModalState.platforms[tabId] = platformId;
            renderAccessTokenUsageModal();
        });
    });

    document.querySelectorAll('.usage-copy-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const content = accessTokenUsageCopyStore.get(button.dataset.copyId) || '';
            try {
                await navigator.clipboard.writeText(content);
                showSuccessMessage('已复制到剪贴板');
            } catch (error) {
                console.error('Failed to copy usage snippet:', error);
                showError('复制失败');
            }
        });
    });
}

function renderAccessTokenUsageModal() {
    const modal = document.getElementById('access-token-usage-modal');
    if (!modal || !accessTokenUsageModalState) {
        return;
    }

    accessTokenUsageCopyStore.clear();
    modal.innerHTML = `
        <div class="modal-content access-token-usage-modal-content">
            <div class="modal-header access-token-usage-modal-header">
                <h3 class="modal-title">使用 API 密钥</h3>
                <button class="modal-close" id="access-token-usage-close">&times;</button>
            </div>
            <div class="modal-body access-token-usage-modal-body">
                <div class="usage-tabs">${renderAccessTokenUsageTabs()}</div>
                <div class="usage-content">${renderAccessTokenUsageContent()}</div>
            </div>
            <div class="form-actions access-token-usage-actions">
                <button type="button" class="btn-cancel" id="access-token-usage-close-btn">关闭</button>
            </div>
        </div>
    `;

    modal.querySelector('#access-token-usage-close')?.addEventListener('click', hideAccessTokenUsageModal);
    modal.querySelector('#access-token-usage-close-btn')?.addEventListener('click', hideAccessTokenUsageModal);
    bindAccessTokenUsageEvents();
}

function ensureAccessTokenUsageModal() {
    let modal = document.getElementById('access-token-usage-modal');
    if (modal) {
        return modal;
    }

    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'access-token-usage-modal';
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            hideAccessTokenUsageModal();
        }
    });
    document.body.appendChild(modal);
    return modal;
}

function showAccessTokenUsageModal(index) {
    const token = accessTokenKeys[index];
    if (!token) {
        showError('未找到可用访问令牌');
        return;
    }

    accessTokenUsageModalState = {
        token,
        activeTab: 'codex',
        platforms: {
            codex: 'windows',
            claude: 'windows-cmd'
        }
    };

    const modal = ensureAccessTokenUsageModal();
    renderAccessTokenUsageModal();
    modal.classList.add('show');
}

function hideAccessTokenUsageModal() {
    document.getElementById('access-token-usage-modal')?.classList.remove('show');
    accessTokenUsageModalState = null;
    accessTokenUsageCopyStore.clear();
}

// Wire modal events
accessTokenModalClose.addEventListener('click', hideAccessTokenModal);
accessTokenModalCancel.addEventListener('click', hideAccessTokenModal);
accessTokenModalGenerate.addEventListener('click', (e) => {
    e.preventDefault();
    fillRandomAccessToken();
});
accessTokenForm.addEventListener('submit', (e) => { e.preventDefault(); saveAccessTokenKey(); });
accessTokenModalSave.addEventListener('click', (e) => { e.preventDefault(); saveAccessTokenKey(); });
accessTokenModal.addEventListener('click', (e) => { if (e.target === accessTokenModal) hideAccessTokenModal(); });

// Clear errors when user types
accessTokenInput.addEventListener('input', () => { if (accessTokenInput.classList.contains('error')) accessTokenInput.classList.remove('error'); });

// Buttons
addLocalApiKeyBtn.addEventListener('click', () => showAccessTokenModal('local'));
addRemoteApiKeyBtn.addEventListener('click', () => showAccessTokenModal('remote'));

window.normalizeAccessTokenKeys = normalizeAccessTokenKeys;
window.showAccessTokenUsageModal = showAccessTokenUsageModal;

function normalizeUsageBaseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) {
        return '';
    }

    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

    try {
        const url = new URL(withProtocol);
        const normalizedPath = url.pathname
            .replace(/\/management\.html$/i, '')
            .replace(/\/v0\/management\/?$/i, '')
            .replace(/\/+$/, '');
        return `${url.origin}${normalizedPath}`;
    } catch (error) {
        console.error('Failed to normalize usage base URL:', error);
        return raw.replace(/\/+$/, '');
    }
}

function joinUsageBaseUrl(baseUrl, suffix) {
    return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(suffix || '').replace(/^\/+/, '')}`;
}

async function resolveAccessTokenUsageBaseUrl() {
    const connectionType = localStorage.getItem('type') || 'local';

    if (connectionType === 'local') {
        if (window.__TAURI__?.core?.invoke) {
            try {
                const runtimeInfo = await window.__TAURI__.core.invoke('get_local_runtime_info');
                const runtimeUrl = runtimeInfo?.managementUrl || runtimeInfo?.url;
                if (runtimeUrl) {
                    return normalizeUsageBaseUrl(runtimeUrl);
                }
                if (runtimeInfo?.port) {
                    return `http://127.0.0.1:${runtimeInfo.port}`;
                }
            } catch (error) {
                console.error('Failed to resolve local usage base URL:', error);
            }
        }

        const config = await configManager.getConfig();
        return `http://127.0.0.1:${config.port || 8080}`;
    }

    configManager.refreshConnection();
    const baseUrl = localStorage.getItem('base-url') || configManager.baseUrl;
    const normalized = normalizeUsageBaseUrl(baseUrl);
    if (!normalized) {
        throw new Error('未找到当前服务地址');
    }
    return normalized;
}

function buildCodexConfig(token, baseUrl, { windows = false } = {}) {
    const codexBaseUrl = joinUsageBaseUrl(baseUrl, 'v1');
    const lines = [
        'model_provider = "cliproxyapi"',
        'model = "gpt-5-codex"',
        'model_reasoning_effort = "high"',
        '',
        '[model_providers.cliproxyapi]',
        'name = "cliproxyapi"',
        `base_url = "${codexBaseUrl}"`,
        'wire_api = "responses"'
    ];

    return {
        intro: '按照 CLIProxyAPI 官方文档，将以下配置写入 Codex CLI 配置目录。',
        note: 'config.toml 中只保留与现有配置不冲突的模型和 provider 设置；API 密钥写入 auth.json。',
        pathLabel: windows ? '%userprofile%\\.codex\\config.toml' : '~/.codex/config.toml',
        configToml: lines.join('\n'),
        authPathLabel: windows ? '%userprofile%\\.codex\\auth.json' : '~/.codex/auth.json',
        authJson: JSON.stringify({ OPENAI_API_KEY: token }, null, 2),
        footer: windows
            ? '按 Win+R，输入 %userprofile%\\.codex 打开配置目录。如目录不存在，请先手动创建。'
            : '请确保配置目录存在。macOS/Linux 用户可运行 mkdir -p ~/.codex 创建目录。'
    };
}

function buildClaudeTemplate(token, baseUrl, platform) {
    const settingsPath = platform === 'macos'
        ? '~/.claude/settings.json'
        : '%userprofile%\\.claude\\settings.json';
    const env = {
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5-codex(high)',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5-codex(medium)',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-codex(low)'
    };
    const envJson = JSON.stringify({ env }, null, 2);

    let shellLabel = '';
    let shellContent = '';

    if (platform === 'macos') {
        shellLabel = 'Terminal';
        shellContent = Object.entries(env)
            .map(([key, value]) => `export ${key}="${value}"`)
            .join('\n');
    } else if (platform === 'windows-cmd') {
        shellLabel = 'Command Prompt';
        shellContent = Object.entries(env)
            .map(([key, value]) => `set ${key}=${value}`)
            .join('\n');
    } else {
        shellLabel = 'PowerShell';
        shellContent = Object.entries(env)
            .map(([key, value]) => `$env:${key}="${value}"`)
            .join('\n');
    }

    return {
        intro: '启动 CLIProxyAPI 服务后，按 Claude Code 官方接入方式设置以下环境变量。',
        shellLabel,
        shellContent,
        vscodePath: settingsPath,
        vscodeLabel: 'Claude Code settings.json',
        vscodeContent: envJson,
        footer: 'Claude Code 2.x 使用 ANTHROPIC_DEFAULT_*_MODEL 选择模型；如使用 1.x，请改用 ANTHROPIC_MODEL 与 ANTHROPIC_SMALL_FAST_MODEL。'
    };
}

function buildOpenCodeTemplate(token, baseUrl) {
    const content = {
        $schema: 'https://opencode.ai/config.json',
        provider: {
            openai: {
                options: {
                    baseURL: joinUsageBaseUrl(baseUrl, 'v1'),
                    apiKey: token
                }
            }
        },
        model: 'gpt-5.3-codex'
    };

    return {
        intro: '启动 CLIProxyAPI 服务后，按照 OpenCode 官方接入方式编辑配置文件。',
        pathLabel: '~/.config/opencode/opencode.json',
        content: JSON.stringify(content, null, 2)
    };
}

function renderUsageCopyButton(content) {
    const copyId = createCopyId(content);
    return `<button type="button" class="copy-btn usage-copy-btn" data-copy-id="${copyId}">复制</button>`;
}

function renderAccessTokenUsageContent() {
    const token = accessTokenUsageModalState.token;
    const baseUrl = accessTokenUsageModalState.baseUrl;
    const activeTab = accessTokenUsageModalState.activeTab;

    if (activeTab === 'codex') {
        const activePlatform = accessTokenUsageModalState.platforms[activeTab];
        const template = buildCodexConfig(token, baseUrl, {
            windows: activePlatform === 'windows'
        });

        return `
            <div class="usage-intro">${template.intro}</div>
            <div class="usage-platform-tabs">${renderAccessTokenUsagePlatformTabs(activeTab)}</div>
            <div class="usage-note warning">${template.note}</div>
            ${renderUsageCodeBlock(template.pathLabel, template.configToml)}
            ${renderUsageCodeBlock(template.authPathLabel, template.authJson)}
            <div class="usage-note info">${template.footer}</div>
        `;
    }

    if (activeTab === 'claude') {
        const activePlatform = accessTokenUsageModalState.platforms.claude;
        const template = buildClaudeTemplate(token, baseUrl, activePlatform);

        return `
            <div class="usage-intro">${template.intro}</div>
            <div class="usage-platform-tabs">${renderAccessTokenUsagePlatformTabs(activeTab)}</div>
            <div class="usage-section-title">${template.shellLabel}</div>
            ${renderUsageCodeBlock(template.shellLabel, template.shellContent)}
            <div class="usage-section-title">${template.vscodeLabel}</div>
            ${renderUsageCodeBlock(template.vscodePath, template.vscodeContent)}
            <div class="usage-note info">${template.footer}</div>
        `;
    }

    const template = buildOpenCodeTemplate(token, baseUrl);
    return `
        <div class="usage-note warning">${template.intro}</div>
        ${renderUsageCodeBlock(template.pathLabel, template.content)}
    `;
}

function bindAccessTokenUsageEvents() {
    document.querySelectorAll('[data-usage-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            accessTokenUsageModalState.activeTab = button.dataset.usageTab;
            renderAccessTokenUsageModal();
        });
    });

    document.querySelectorAll('[data-usage-platform]').forEach((button) => {
        button.addEventListener('click', () => {
            const [tabId, platformId] = button.dataset.usagePlatform.split(':');
            accessTokenUsageModalState.platforms[tabId] = platformId;
            renderAccessTokenUsageModal();
        });
    });

    document.querySelectorAll('.usage-copy-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const content = accessTokenUsageCopyStore.get(button.dataset.copyId) || '';
            try {
                await navigator.clipboard.writeText(content);
                showSuccessMessage('已复制到剪贴板');
            } catch (error) {
                console.error('Failed to copy usage snippet:', error);
                showError('复制失败');
            }
        });
    });
}

function renderAccessTokenUsageModal() {
    const modal = document.getElementById('access-token-usage-modal');
    if (!modal || !accessTokenUsageModalState) {
        return;
    }

    accessTokenUsageCopyStore.clear();
    modal.innerHTML = `
        <div class="modal-content access-token-usage-modal-content">
            <div class="modal-header access-token-usage-modal-header">
                <h3 class="modal-title">使用 API 密钥</h3>
                <button class="modal-close" id="access-token-usage-close">&times;</button>
            </div>
            <div class="modal-body access-token-usage-modal-body">
                <div class="usage-tabs">${renderAccessTokenUsageTabs()}</div>
                <div class="usage-content">${renderAccessTokenUsageContent()}</div>
            </div>
            <div class="form-actions access-token-usage-actions">
                <button type="button" class="btn-cancel" id="access-token-usage-close-btn">关闭</button>
            </div>
        </div>
    `;

    modal.querySelector('#access-token-usage-close')?.addEventListener('click', hideAccessTokenUsageModal);
    modal.querySelector('#access-token-usage-close-btn')?.addEventListener('click', hideAccessTokenUsageModal);
    bindAccessTokenUsageEvents();
}

async function showAccessTokenUsageModal(index) {
    const token = accessTokenKeys[index];
    if (!token) {
        showError('未找到可用访问令牌');
        return;
    }

    try {
        const baseUrl = await resolveAccessTokenUsageBaseUrl();
        accessTokenUsageModalState = {
            token,
            baseUrl,
            activeTab: 'codex',
            platforms: {
                codex: 'windows',
                    claude: 'windows-cmd'
            }
        };

        const modal = ensureAccessTokenUsageModal();
        renderAccessTokenUsageModal();
        modal.classList.add('show');
    } catch (error) {
        console.error('Failed to open access token usage modal:', error);
        showError(error?.message || '无法读取当前服务地址');
    }
}

window.showAccessTokenUsageModal = showAccessTokenUsageModal;

