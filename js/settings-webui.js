const WEBUI_REPO_URL = 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center';
const PROJECT_REPO_URL = 'https://github.com/MaxMike427/CPACN';
const DEFAULT_LOCAL_WEBUI_PORT = 8080;
const NETWORK_TEST_DEFAULT_STATUS = '点击按钮开始检测当前公网出口。';
const COMPONENT_UPDATE_DEFAULT_STATUS = '点击按钮检查 Cli-Proxy-API 和 WebUI 组件更新。';

const componentUpdateState = {
    lastResult: null,
    checking: false,
    updating: false
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getConfigManagerInstance() {
    if (window.configManager) {
        return window.configManager;
    }
    if (window.configManagerInstance) {
        return window.configManagerInstance;
    }
    if (typeof configManager !== 'undefined') {
        return configManager;
    }
    throw new Error('配置管理器不可用');
}

function normalizeManagementBaseUrl(input) {
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
        console.error('Failed to normalize management base URL:', error);
        return raw.replace(/\/+$/, '');
    }
}

function syncSidebarLabels() {
    const labelMap = {
        basic: '基础设置',
        webui: 'WebUI 与教程',
        'network-test': '网络测试',
        'component-update': '组件更新',
        'project-link': '项目地址',
        'access-token': '访问令牌',
        auth: '认证文件',
        api: '第三方 API Keys',
        openai: 'OpenAI 兼容'
    };

    const title = document.querySelector('.sidebar-title');
    if (title) {
        title.textContent = 'EasyCLI 控制台';
    }

    Object.entries(labelMap).forEach(([tabId, label]) => {
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tab) {
            tab.textContent = label;
        }
    });
}

function ensureUtilityTabs() {
    const tabsContainer = document.querySelector('.tabs-container');
    const mainContent = document.querySelector('.main-content');
    const accessTokenTab = document.querySelector('.tab[data-tab="access-token"]');
    const accessTokenContent = document.getElementById('access-token-content');

    if (!tabsContainer || !mainContent) {
        return;
    }

    const definitions = [
        { id: 'network-test', label: '网络测试', panelId: 'network-test-panel' },
        { id: 'component-update', label: '组件更新', panelId: 'component-update-panel' },
        { id: 'project-link', label: '项目地址', panelId: 'project-link-panel' }
    ];

    definitions.forEach((definition) => {
        if (!document.querySelector(`.tab[data-tab="${definition.id}"]`)) {
            const tab = document.createElement('button');
            tab.className = 'tab';
            tab.dataset.tab = definition.id;
            tab.textContent = definition.label;

            if (accessTokenTab) {
                tabsContainer.insertBefore(tab, accessTokenTab);
            } else {
                tabsContainer.appendChild(tab);
            }
        }

        if (!document.getElementById(`${definition.id}-content`)) {
            const content = document.createElement('div');
            content.className = 'tab-content';
            content.id = `${definition.id}-content`;
            content.innerHTML = `<div class="webui-panel" id="${definition.panelId}"></div>`;

            if (accessTokenContent) {
                mainContent.insertBefore(content, accessTokenContent);
            } else {
                mainContent.appendChild(content);
            }
        }
    });

    renderNetworkTestPanel();
    renderComponentUpdatePanel();
    renderProjectLinkPanel();
    ensureComponentUpdateModal();
    syncSidebarLabels();
}

function renderNetworkTestPanel() {
    const panel = document.getElementById('network-test-panel');
    if (!panel || panel.dataset.rendered === 'true') {
        return;
    }

    panel.dataset.rendered = 'true';
    panel.innerHTML = `
        <div class="webui-card">
            <div class="webui-card-header">
                <div>
                    <h3 class="webui-card-title">网络测试</h3>
                    <p class="webui-card-description">调用 iping API 检测当前公网出口，显示国家、运营商、代理特征和风险信息。</p>
                </div>
                <span class="webui-badge warning">检测</span>
            </div>
            <div class="network-test-actions">
                <button class="webui-action-btn primary" id="run-network-test-btn">开始网络测试</button>
                <span class="network-test-status" id="network-test-status">${NETWORK_TEST_DEFAULT_STATUS}</span>
            </div>
            <div class="network-test-grid">
                <div class="network-test-item">
                    <span class="network-test-label">当前 IP</span>
                    <span class="network-test-value" id="network-test-ip">-</span>
                </div>
                <div class="network-test-item">
                    <span class="network-test-label">国家</span>
                    <span class="network-test-value" id="network-test-country">-</span>
                </div>
                <div class="network-test-item">
                    <span class="network-test-label">运营商</span>
                    <span class="network-test-value" id="network-test-isp">-</span>
                </div>
                <div class="network-test-item">
                    <span class="network-test-label">是否是代理</span>
                    <span class="network-test-value" id="network-test-proxy">-</span>
                </div>
                <div class="network-test-item">
                    <span class="network-test-label">IP 类型</span>
                    <span class="network-test-value" id="network-test-type">-</span>
                </div>
                <div class="network-test-item">
                    <span class="network-test-label">风险分数</span>
                    <span class="network-test-value" id="network-test-risk-score">-</span>
                </div>
                <div class="network-test-item full-width">
                    <span class="network-test-label">风险类型</span>
                    <span class="network-test-value" id="network-test-risk-type">-</span>
                </div>
            </div>
        </div>
    `;
}

function renderComponentUpdatePanel() {
    const panel = document.getElementById('component-update-panel');
    if (!panel || panel.dataset.rendered === 'true') {
        return;
    }

    panel.dataset.rendered = 'true';
    panel.innerHTML = `
        <div class="webui-card">
            <div class="webui-card-header">
                <div>
                    <h3 class="webui-card-title">组件更新</h3>
                    <p class="webui-card-description">检查 Cli-Proxy-API 与 WebUI 的 GitHub 最新发布版本，并在确认后自动下载、覆盖和重启应用。</p>
                </div>
                <span class="webui-badge warning">更新</span>
            </div>
            <div class="component-update-actions">
                <button class="webui-action-btn primary" id="check-component-update-btn">检查组件更新</button>
                <span class="component-update-status" id="component-update-status">${COMPONENT_UPDATE_DEFAULT_STATUS}</span>
            </div>
        </div>

        <div class="component-update-grid">
            <div class="webui-card component-update-card">
                <div class="component-update-card-title">Cli-Proxy-API</div>
                <div class="component-update-row">
                    <span class="component-update-label">当前版本</span>
                    <span class="component-update-value" id="component-cli-current">未检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">最新版本</span>
                    <span class="component-update-value" id="component-cli-latest">未检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">检查结果</span>
                    <span class="component-update-value" id="component-cli-result">等待检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">发布时间</span>
                    <span class="component-update-value" id="component-cli-published">-</span>
                </div>
            </div>

            <div class="webui-card component-update-card">
                <div class="component-update-card-title">WebUI</div>
                <div class="component-update-row">
                    <span class="component-update-label">当前版本</span>
                    <span class="component-update-value" id="component-webui-current">未检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">最新版本</span>
                    <span class="component-update-value" id="component-webui-latest">未检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">检查结果</span>
                    <span class="component-update-value" id="component-webui-result">等待检查</span>
                </div>
                <div class="component-update-row">
                    <span class="component-update-label">发布时间</span>
                    <span class="component-update-value" id="component-webui-published">-</span>
                </div>
                <div class="component-update-note" id="component-webui-note"></div>
            </div>
        </div>

        <div class="webui-card">
            <div class="webui-card-header">
                <div>
                    <h3 class="webui-card-title">更新风险提示</h3>
                    <p class="webui-card-description">组件更新直接来自 GitHub 发布版本，不经过当前定制版的逐项验收。</p>
                </div>
            </div>
            <ul class="component-risk-list">
                <li>可能引入新的配置字段或旧配置兼容性变化。</li>
                <li>WebUI 页面结构和交互行为可能发生变化。</li>
                <li>如上游发布存在异常，可能导致启动失败或部分功能不可用。</li>
                <li>更新完成后应用会自动重启，并重新拉起本地组件。</li>
            </ul>
        </div>
    `;
}

function renderProjectLinkPanel() {
    const panel = document.getElementById('project-link-panel');
    if (!panel || panel.dataset.rendered === 'true') {
        return;
    }

    panel.dataset.rendered = 'true';
    panel.innerHTML = `
        <div class="webui-card">
            <div class="webui-card-header">
                <div>
                    <h3 class="webui-card-title">项目地址</h3>
                    <p class="webui-card-description">点击下面的按钮，使用系统默认浏览器访问当前定制版项目地址。</p>
                </div>
                <span class="webui-badge subtle">仓库</span>
            </div>
            <div class="webui-meta">
                <div class="webui-meta-item">
                    <span class="webui-meta-label">GitHub 地址</span>
                    <code class="webui-link" id="project-link-url">${PROJECT_REPO_URL}</code>
                </div>
            </div>
            <div class="webui-actions">
                <button class="webui-action-btn primary" id="open-project-link-btn">打开项目地址</button>
            </div>
        </div>
    `;
}

function ensureComponentUpdateModal() {
    if (document.getElementById('component-update-modal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'component-update-modal';
    modal.innerHTML = `
        <div class="modal-content component-update-modal-content">
            <div class="modal-header">
                <h3 class="modal-title">检测到组件更新</h3>
                <button class="modal-close" id="component-update-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="component-update-modal-summary" id="component-update-modal-summary"></div>
                <div class="component-update-modal-risk" id="component-update-modal-risk"></div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" id="component-update-cancel-btn">暂不更新</button>
                <button type="button" class="btn-primary" id="component-update-confirm-btn">立即更新</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document
        .getElementById('component-update-modal-close')
        ?.addEventListener('click', closeComponentUpdateModal);
    document
        .getElementById('component-update-cancel-btn')
        ?.addEventListener('click', closeComponentUpdateModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeComponentUpdateModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('show')) {
            closeComponentUpdateModal();
        }
    });
}

function closeComponentUpdateModal() {
    document.getElementById('component-update-modal')?.classList.remove('show');
}

function showComponentUpdateModal(result) {
    ensureComponentUpdateModal();

    const modal = document.getElementById('component-update-modal');
    const summary = document.getElementById('component-update-modal-summary');
    const risk = document.getElementById('component-update-modal-risk');

    if (!modal || !summary || !risk) {
        return;
    }

    const items = [];
    if (result?.cliProxyApi?.hasUpdate) {
        items.push(`
            <li>
                <strong>Cli-Proxy-API</strong>
                <span>${escapeHtml(formatVersionDisplay(result.cliProxyApi.currentVersion))} -> ${escapeHtml(formatVersionDisplay(result.cliProxyApi.latestVersion))}</span>
            </li>
        `);
    }
    if (result?.webui?.hasUpdate) {
        items.push(`
            <li>
                <strong>WebUI</strong>
                <span>${escapeHtml(formatVersionDisplay(result.webui.currentVersion))} -> ${escapeHtml(formatVersionDisplay(result.webui.latestVersion))}</span>
            </li>
        `);
    }

    summary.innerHTML = `
        <div class="component-update-summary-title">以下组件检测到更新：</div>
        <ul class="component-update-summary-list">
            ${items.join('')}
        </ul>
    `;

    risk.innerHTML = `
        <div class="component-update-summary-title">更新前请确认：</div>
        <p>${escapeHtml(result?.riskNotice || '组件更新直接来自 GitHub 发布版本，更新前请确认风险。')}</p>
        <p>选择“立即更新”后，EasyCLI 会下载最新组件、覆盖本地文件并自动重启应用。</p>
    `;

    modal.classList.add('show');
}

function formatPublishedAt(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString('zh-CN', { hour12: false });
}

function formatVersionDisplay(value) {
    if (!value) {
        return '未记录';
    }
    return String(value);
}

function formatComponentResult(hasUpdate) {
    return hasUpdate ? '发现更新' : '已是最新';
}

function getLocalProxyUrl() {
    return localStorage.getItem('proxy-url') || '';
}

async function invokeTauri(command, args = {}) {
    if (!window.__TAURI__?.core?.invoke) {
        throw new Error('当前环境不支持该操作');
    }
    return window.__TAURI__.core.invoke(command, args);
}

async function openExternalUrl(url) {
    if (window.__TAURI__?.shell?.open) {
        await window.__TAURI__.shell.open(url);
        return;
    }

    window.open(url, '_blank', 'noopener');
}

function bindButtonOnce(id, handler) {
    const element = document.getElementById(id);
    if (!element || element.dataset.boundClick === 'true') {
        return;
    }

    element.addEventListener('click', handler);
    element.dataset.boundClick = 'true';
}

function setTextById(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function getCurrentWebuiUrlText() {
    return document.getElementById('webui-url-text');
}

function getAgentGuidePathText() {
    return document.getElementById('agent-guide-path-text');
}

async function getCurrentWebuiUrl() {
    const connectionType = localStorage.getItem('type') || 'local';
    const manager = getConfigManagerInstance();

    if (connectionType === 'local') {
        const config = await manager.getConfig();
        const port = config.port || DEFAULT_LOCAL_WEBUI_PORT;
        return `http://127.0.0.1:${port}/management.html`;
    }

    manager.refreshConnection();
    const remoteBaseUrl = normalizeManagementBaseUrl(
        localStorage.getItem('base-url') || manager.baseUrl
    );

    if (!remoteBaseUrl) {
        throw new Error('未找到远程地址，请先在登录页配置远程 URL。');
    }

    return `${remoteBaseUrl}/management.html`;
}

function getNetworkTestValueMap() {
    return {
        ip: document.getElementById('network-test-ip'),
        country: document.getElementById('network-test-country'),
        isp: document.getElementById('network-test-isp'),
        proxy: document.getElementById('network-test-proxy'),
        type: document.getElementById('network-test-type'),
        riskScore: document.getElementById('network-test-risk-score'),
        riskType: document.getElementById('network-test-risk-type')
    };
}

function setNetworkTestStatus(message, type = '') {
    const element = document.getElementById('network-test-status');
    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = 'network-test-status';
    if (type) {
        element.classList.add(type);
    }
}

function setNetworkTestLoading(isLoading) {
    const button = document.getElementById('run-network-test-btn');
    if (!button) {
        return;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? '检测中...' : '开始网络测试';
}

function updateNetworkTestResult(result = {}) {
    const valueMap = {
        ip: result.ip || '-',
        country: result.country || '-',
        isp: result.isp || '-',
        proxy: result.is_proxy || '-',
        type: result.ip_type || '-',
        riskScore: result.risk_score || '-',
        riskType: result.risk_type || '-'
    };

    Object.entries(getNetworkTestValueMap()).forEach(([key, element]) => {
        if (element) {
            element.textContent = valueMap[key];
        }
    });
}

function setComponentUpdateStatus(message, type = '') {
    const element = document.getElementById('component-update-status');
    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = 'component-update-status';
    if (type) {
        element.classList.add(type);
    }
}

function setComponentUpdateLoading(isLoading) {
    const button = document.getElementById('check-component-update-btn');
    if (!button) {
        return;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? '检查中...' : '检查组件更新';
}

function setComponentUpdateActionLoading(isLoading) {
    const confirmButton = document.getElementById('component-update-confirm-btn');
    const cancelButton = document.getElementById('component-update-cancel-btn');
    const closeButton = document.getElementById('component-update-modal-close');

    if (confirmButton) {
        confirmButton.disabled = isLoading;
        confirmButton.textContent = isLoading ? '更新中...' : '立即更新';
    }
    if (cancelButton) {
        cancelButton.disabled = isLoading;
    }
    if (closeButton) {
        closeButton.disabled = isLoading;
    }
}

function updateComponentUpdateResult(result) {
    if (!result) {
        setTextById('component-cli-current', '未检查');
        setTextById('component-cli-latest', '未检查');
        setTextById('component-cli-result', '等待检查');
        setTextById('component-cli-published', '-');
        setTextById('component-webui-current', '未检查');
        setTextById('component-webui-latest', '未检查');
        setTextById('component-webui-result', '等待检查');
        setTextById('component-webui-published', '-');
        setTextById('component-webui-note', '');
        return;
    }

    setTextById('component-cli-current', formatVersionDisplay(result.cliProxyApi?.currentVersion));
    setTextById('component-cli-latest', formatVersionDisplay(result.cliProxyApi?.latestVersion));
    setTextById('component-cli-result', formatComponentResult(Boolean(result.cliProxyApi?.hasUpdate)));
    setTextById('component-cli-published', formatPublishedAt(result.cliProxyApi?.publishedAt));

    setTextById('component-webui-current', formatVersionDisplay(result.webui?.currentVersion));
    setTextById('component-webui-latest', formatVersionDisplay(result.webui?.latestVersion));
    setTextById('component-webui-result', formatComponentResult(Boolean(result.webui?.hasUpdate)));
    setTextById('component-webui-published', formatPublishedAt(result.webui?.publishedAt));
    setTextById('component-webui-note', result.webui?.note || '');
}

async function refreshWebuiPanel() {
    syncSidebarLabels();

    const webuiUrlText = getCurrentWebuiUrlText();
    if (webuiUrlText) {
        try {
            webuiUrlText.textContent = await getCurrentWebuiUrl();
        } catch (error) {
            console.error('Failed to resolve WebUI URL:', error);
            webuiUrlText.textContent = '未获取到可用地址';
        }
    }

    const agentGuidePathText = getAgentGuidePathText();
    if (agentGuidePathText && window.__TAURI__?.core?.invoke) {
        try {
            const result = await invokeTauri('get_agent_guide_path');
            agentGuidePathText.textContent = result.path || '未生成教程文件';
        } catch (error) {
            console.error('Failed to resolve agent guide path:', error);
            agentGuidePathText.textContent = '未生成教程文件';
        }
    }

    bindUtilityEvents();
}

async function refreshNetworkTestPanel() {
    ensureUtilityTabs();
    updateNetworkTestResult();
    setNetworkTestStatus(
        document.getElementById('network-test-status')?.textContent?.trim() || NETWORK_TEST_DEFAULT_STATUS
    );
    bindUtilityEvents();
}

async function refreshComponentUpdatePanel() {
    ensureUtilityTabs();
    updateComponentUpdateResult(componentUpdateState.lastResult);
    if (!componentUpdateState.lastResult && !componentUpdateState.checking) {
        setComponentUpdateStatus(COMPONENT_UPDATE_DEFAULT_STATUS);
    }
    bindUtilityEvents();
}

async function refreshProjectLinkPanel() {
    ensureUtilityTabs();
    setTextById('project-link-url', PROJECT_REPO_URL);
    bindUtilityEvents();
}

async function handleOpenWebui() {
    try {
        const webuiUrl = await getCurrentWebuiUrl();
        const urlText = getCurrentWebuiUrlText();
        if (urlText) {
            urlText.textContent = webuiUrl;
        }
        await openExternalUrl(webuiUrl);
        showSuccessMessage('已在浏览器中打开 WebUI');
    } catch (error) {
        console.error('Failed to open WebUI:', error);
        showError(error?.message || '打开 WebUI 失败');
    }
}

async function handleOpenWebuiRepo() {
    try {
        await openExternalUrl(WEBUI_REPO_URL);
        showSuccessMessage('已打开 WebUI 项目仓库');
    } catch (error) {
        console.error('Failed to open WebUI repository:', error);
        showError('打开 WebUI 项目仓库失败');
    }
}

async function handleOpenAgentGuide() {
    try {
        const result = await invokeTauri('open_agent_guide_path');
        if (result.path) {
            setTextById('agent-guide-path-text', result.path);
        }
        showSuccessMessage('已用资源管理器打开接入教程路径');
    } catch (error) {
        console.error('Failed to open agent guide path:', error);
        showError(error?.message || '打开接入教程路径失败');
    }
}

async function handleRunNetworkTest() {
    try {
        setNetworkTestLoading(true);
        setNetworkTestStatus('正在调用 iping API 检测当前公网出口...', 'loading');

        const response = await invokeTauri('run_network_test');
        updateNetworkTestResult(response?.result || {});
        setNetworkTestStatus('网络测试完成。', 'success');
        showSuccessMessage('网络测试完成');
    } catch (error) {
        console.error('Failed to run network test:', error);
        setNetworkTestStatus(error?.message || '网络测试失败', 'error');
        showError(error?.message || '网络测试失败');
    } finally {
        setNetworkTestLoading(false);
    }
}

async function handleCheckComponentUpdates() {
    try {
        componentUpdateState.checking = true;
        setComponentUpdateLoading(true);
        setComponentUpdateStatus('正在从 GitHub 检查组件更新...', 'loading');

        const result = await invokeTauri('check_component_updates', {
            request: { proxyUrl: getLocalProxyUrl() }
        });

        componentUpdateState.lastResult = result;
        updateComponentUpdateResult(result);

        if (result?.hasUpdates) {
            setComponentUpdateStatus('检测到可更新组件，请确认是否更新。', 'warning');
            showComponentUpdateModal(result);
        } else {
            setComponentUpdateStatus('当前组件已经是最新版本。', 'success');
            showSuccessMessage('当前组件已经是最新版本');
        }
    } catch (error) {
        console.error('Failed to check component updates:', error);
        setComponentUpdateStatus(error?.message || '检查组件更新失败', 'error');
        showError(error?.message || '检查组件更新失败');
    } finally {
        componentUpdateState.checking = false;
        setComponentUpdateLoading(false);
    }
}

async function handleConfirmComponentUpdate() {
    if (!componentUpdateState.lastResult || componentUpdateState.updating) {
        return;
    }

    try {
        componentUpdateState.updating = true;
        setComponentUpdateActionLoading(true);
        setComponentUpdateStatus('正在下载最新组件并准备重启应用...', 'loading');

        await invokeTauri('update_components_and_restart', {
            request: { proxyUrl: getLocalProxyUrl() }
        });
    } catch (error) {
        console.error('Failed to update components:', error);
        setComponentUpdateStatus(error?.message || '组件更新失败', 'error');
        showError(error?.message || '组件更新失败');
        setComponentUpdateActionLoading(false);
        componentUpdateState.updating = false;
    }
}

async function handleOpenProjectLink() {
    try {
        await openExternalUrl(PROJECT_REPO_URL);
        showSuccessMessage('已打开项目地址');
    } catch (error) {
        console.error('Failed to open project link:', error);
        showError('打开项目地址失败');
    }
}

function bindUtilityEvents() {
    bindButtonOnce('open-webui-btn', handleOpenWebui);
    bindButtonOnce('open-webui-repo-btn', handleOpenWebuiRepo);
    bindButtonOnce('open-agent-guide-btn', handleOpenAgentGuide);
    bindButtonOnce('run-network-test-btn', handleRunNetworkTest);
    bindButtonOnce('check-component-update-btn', handleCheckComponentUpdates);
    bindButtonOnce('component-update-confirm-btn', handleConfirmComponentUpdate);
    bindButtonOnce('open-project-link-btn', handleOpenProjectLink);
}

syncSidebarLabels();
ensureUtilityTabs();
updateNetworkTestResult();
updateComponentUpdateResult(null);
setNetworkTestStatus(NETWORK_TEST_DEFAULT_STATUS);
setComponentUpdateStatus(COMPONENT_UPDATE_DEFAULT_STATUS);
bindUtilityEvents();

window.refreshWebuiPanel = refreshWebuiPanel;
window.refreshNetworkTestPanel = refreshNetworkTestPanel;
window.refreshComponentUpdatePanel = refreshComponentUpdatePanel;
window.refreshProjectLinkPanel = refreshProjectLinkPanel;
