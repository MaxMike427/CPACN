// WebUI, guide, and network-test panel helpers

const WEBUI_REPO_URL = 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center';
const DEFAULT_LOCAL_WEBUI_PORT = 8080;
const NETWORK_TEST_CARD_ID = 'network-test-card';
const NETWORK_TEST_DEFAULT_STATUS = '点击按钮开始检测当前公网出口。';

function getErrorMessage(error, fallback) {
    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    if (error?.message && String(error.message).trim()) {
        return String(error.message);
    }

    return fallback;
}

function getTextBySelector(root, selector) {
    return root ? root.querySelector(selector) : null;
}

function setTextBySelector(root, selector, value) {
    const element = getTextBySelector(root, selector);
    if (element) {
        element.textContent = value;
    }
}

function syncSidebarTabLabels() {
    const labelMap = {
        basic: '基础设置',
        webui: 'WebUI 与教程',
        'access-token': '访问令牌',
        auth: '认证文件',
        api: '第三方 API 密钥',
        openai: 'OpenAI 兼容'
    };

    Object.entries(labelMap).forEach(([tabId, label]) => {
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tab) {
            tab.textContent = label;
        }
    });
}

function createNetworkTestCard() {
    const wrapper = document.createElement('div');
    wrapper.className = 'webui-card';
    wrapper.id = NETWORK_TEST_CARD_ID;
    wrapper.innerHTML = `
        <div class="webui-card-header">
            <div>
                <h3 class="webui-card-title">网络测试</h3>
                <p class="webui-card-description">调用 iping API 检查当前电脑的公网出口，快速查看国家、运营商、代理特征与风险信息。</p>
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
    `;
    return wrapper;
}

function ensureNetworkTestTab() {
    const tabsContainer = document.querySelector('.tabs-container');
    const webuiTab = document.querySelector('.tab[data-tab="webui"]');
    const accessTokenTab = document.querySelector('.tab[data-tab="access-token"]');

    if (tabsContainer && !document.querySelector('.tab[data-tab="network-test"]')) {
        const tab = document.createElement('button');
        tab.className = 'tab';
        tab.dataset.tab = 'network-test';
        tab.textContent = '网络测试';

        if (accessTokenTab) {
            tabsContainer.insertBefore(tab, accessTokenTab);
        } else if (webuiTab?.nextSibling) {
            tabsContainer.insertBefore(tab, webuiTab.nextSibling);
        } else {
            tabsContainer.appendChild(tab);
        }
    }

    const mainContent = document.querySelector('.main-content');
    const accessTokenContent = document.getElementById('access-token-content');
    let networkTestContent = document.getElementById('network-test-content');

    if (!networkTestContent && mainContent) {
        networkTestContent = document.createElement('div');
        networkTestContent.className = 'tab-content';
        networkTestContent.id = 'network-test-content';
        networkTestContent.innerHTML = '<div class="webui-panel" id="network-test-panel"></div>';

        if (accessTokenContent) {
            mainContent.insertBefore(networkTestContent, accessTokenContent);
        } else {
            mainContent.appendChild(networkTestContent);
        }
    }

    const panel = document.getElementById('network-test-panel');
    if (panel && !document.getElementById(NETWORK_TEST_CARD_ID)) {
        panel.appendChild(createNetworkTestCard());
    }
}

function syncWebuiPanelCopy() {
    const panel = document.querySelector('#webui-content .webui-panel');
    if (!panel) {
        return;
    }

    const cards = Array.from(panel.querySelectorAll('.webui-card'));
    const webuiCard = cards[0];
    const guideCard = cards[1];
    const checklistCard = cards.find((card) => card.querySelector('.webui-checklist'));

    if (webuiCard) {
        const metaItems = webuiCard.querySelectorAll('.webui-meta-item');
        const actionButtons = webuiCard.querySelectorAll('.webui-action-btn');

        setTextBySelector(webuiCard, '.webui-card-title', 'WebUI 浏览器入口');
        setTextBySelector(
            webuiCard,
            '.webui-card-description',
            '直接调用 CLI Proxy API Management Center，在浏览器中管理当前服务。'
        );
        setTextBySelector(webuiCard, '.webui-badge', '浏览器');

        if (metaItems[0]) {
            setTextBySelector(metaItems[0], '.webui-meta-label', '当前 WebUI 地址');
        }
        if (metaItems[1]) {
            setTextBySelector(metaItems[1], '.webui-meta-label', '默认控制台配置');
            setTextBySelector(
                metaItems[1],
                '.webui-meta-value',
                '端口 8080 / 开启远程管理 / 默认密钥 12345678'
            );
        }
        if (actionButtons[0]) {
            actionButtons[0].textContent = '打开 WebUI';
        }
        if (actionButtons[1]) {
            actionButtons[1].textContent = '查看项目仓库';
        }
    }

    if (guideCard) {
        setTextBySelector(guideCard, '.webui-card-title', '接入教程');
        setTextBySelector(
            guideCard,
            '.webui-card-description',
            '面向 AI agent 编写的 Markdown 接入文档，包含默认地址、鉴权头、常用接口与调用示例。'
        );
        setTextBySelector(guideCard, '.webui-badge', '文档');

        const metaItem = guideCard.querySelector('.webui-meta-item');
        if (metaItem) {
            setTextBySelector(metaItem, '.webui-meta-label', '教程文件路径');
        }

        const guideButton = document.getElementById('open-agent-guide-btn');
        if (guideButton) {
            guideButton.textContent = '用资源管理器打开路径';
        }
    }

    if (checklistCard) {
        setTextBySelector(checklistCard, '.webui-card-title', '接入要点');
        setTextBySelector(
            checklistCard,
            '.webui-card-description',
            '如果你要让脚本、代理或自动化工具接入当前服务，可以先按下面的顺序做。'
        );

        const checklist = checklistCard.querySelector('.webui-checklist');
        if (checklist) {
            checklist.innerHTML = `
                <li>先访问 <code>/management.html</code> 验证 WebUI 可用，再确认管理 API 地址是 <code>/v0/management</code>。</li>
                <li>优先使用 <code>Authorization: Bearer 12345678</code>，EasyCLI 本地模式也兼容 <code>X-Management-Key</code>。</li>
                <li>先读 <code>/config</code> 做连通性检查，再按需读写配置、认证文件和第三方凭证。</li>
                <li>远程管理属于配置文件项；EasyCLI 本地模式已经默认帮你开启并写入默认密钥。</li>
            `;
        }
    }
}

function getCurrentWebuiUrlText() {
    return document.getElementById('webui-url-text');
}

function getAgentGuidePathText() {
    return document.getElementById('agent-guide-path-text');
}

function getRunNetworkTestButton() {
    return document.getElementById('run-network-test-btn');
}

function getNetworkTestStatusText() {
    return document.getElementById('network-test-status');
}

function getNetworkTestValueElements() {
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

async function getCurrentWebuiUrl() {
    const connectionType = localStorage.getItem('type') || 'local';

    if (connectionType === 'local') {
        const config = await configManager.getConfig();
        const port = config.port || DEFAULT_LOCAL_WEBUI_PORT;
        return `http://127.0.0.1:${port}/management.html`;
    }

    configManager.refreshConnection();
    const remoteBaseUrl = normalizeManagementBaseUrl(
        localStorage.getItem('base-url') || configManager.baseUrl
    );

    if (!remoteBaseUrl) {
        throw new Error('未找到远程地址，请先在登录页配置远程 URL。');
    }

    return `${remoteBaseUrl}/management.html`;
}

async function openExternalUrl(url) {
    if (window.__TAURI__?.shell?.open) {
        await window.__TAURI__.shell.open(url);
        return;
    }

    window.open(url, '_blank', 'noopener');
}

function setNetworkTestStatus(message, type = '') {
    const statusText = getNetworkTestStatusText();
    if (!statusText) {
        return;
    }

    statusText.textContent = message;
    statusText.className = 'network-test-status';

    if (type) {
        statusText.classList.add(type);
    }
}

function setNetworkTestLoading(isLoading) {
    const button = getRunNetworkTestButton();
    if (!button) {
        return;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? '检测中...' : '开始网络测试';
}

function updateNetworkTestResult(result = {}) {
    const elements = getNetworkTestValueElements();
    const valueMap = {
        ip: result.ip || '-',
        country: result.country || '-',
        isp: result.isp || '-',
        proxy: result.is_proxy || '-',
        type: result.ip_type || '-',
        riskScore: result.risk_score || '-',
        riskType: result.risk_type || '-'
    };

    Object.entries(elements).forEach(([key, element]) => {
        if (element) {
            element.textContent = valueMap[key];
        }
    });
}

async function refreshWebuiPanel() {
    syncSidebarTabLabels();
    syncWebuiPanelCopy();

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
            const result = await window.__TAURI__.core.invoke('get_agent_guide_path');
            agentGuidePathText.textContent = result.path || '未生成教程文件';
        } catch (error) {
            console.error('Failed to resolve agent guide path:', error);
            agentGuidePathText.textContent = '未生成教程文件';
        }
    }
}

async function refreshNetworkTestPanel() {
    ensureNetworkTestTab();
    syncSidebarTabLabels();

    if (getNetworkTestStatusText() && !getNetworkTestStatusText().textContent.trim()) {
        setNetworkTestStatus(NETWORK_TEST_DEFAULT_STATUS);
    }
}

async function handleOpenWebui() {
    try {
        const webuiUrl = await getCurrentWebuiUrl();
        const webuiUrlText = getCurrentWebuiUrlText();
        if (webuiUrlText) {
            webuiUrlText.textContent = webuiUrl;
        }
        await openExternalUrl(webuiUrl);
        showSuccessMessage('已在浏览器中打开 WebUI');
    } catch (error) {
        console.error('Failed to open WebUI:', error);
        showError(getErrorMessage(error, '打开 WebUI 失败'));
    }
}

async function handleOpenWebuiRepo() {
    try {
        await openExternalUrl(WEBUI_REPO_URL);
        showSuccessMessage('已打开 WebUI 项目仓库');
    } catch (error) {
        console.error('Failed to open WebUI repository:', error);
        showError('打开项目仓库失败');
    }
}

async function handleOpenAgentGuide() {
    if (!window.__TAURI__?.core?.invoke) {
        showError('当前环境不支持打开教程路径');
        return;
    }

    try {
        const result = await window.__TAURI__.core.invoke('open_agent_guide_path');
        const agentGuidePathText = getAgentGuidePathText();
        if (agentGuidePathText && result.path) {
            agentGuidePathText.textContent = result.path;
        }
        showSuccessMessage('已用资源管理器打开接入教程路径');
    } catch (error) {
        console.error('Failed to open agent guide path:', error);
        showError(getErrorMessage(error, '打开接入教程路径失败'));
    }
}

async function handleRunNetworkTest() {
    if (!window.__TAURI__?.core?.invoke) {
        showError('当前环境不支持网络测试');
        return;
    }

    setNetworkTestLoading(true);
    setNetworkTestStatus('正在调用 iping API 检测当前公网出口...', 'loading');

    try {
        const response = await window.__TAURI__.core.invoke('run_network_test');
        const result = response?.result || {};

        updateNetworkTestResult(result);
        setNetworkTestStatus(`检测完成，当前出口 IP：${result.ip || '-'}`, 'success');
        showSuccessMessage('网络测试完成');
    } catch (error) {
        const message = getErrorMessage(error, '网络测试失败');
        console.error('Failed to run network test:', error);
        setNetworkTestStatus(message, 'error');
        showError(message);
    } finally {
        setNetworkTestLoading(false);
    }
}

function bindSettingsUtilityEvents() {
    document.getElementById('open-webui-btn')?.addEventListener('click', handleOpenWebui);
    document.getElementById('open-webui-repo-btn')?.addEventListener('click', handleOpenWebuiRepo);
    document
        .getElementById('open-agent-guide-btn')
        ?.addEventListener('click', handleOpenAgentGuide);
    getRunNetworkTestButton()?.addEventListener('click', handleRunNetworkTest);
}

syncSidebarTabLabels();
ensureNetworkTestTab();
syncWebuiPanelCopy();
updateNetworkTestResult();
setNetworkTestStatus(NETWORK_TEST_DEFAULT_STATUS);
bindSettingsUtilityEvents();

window.refreshWebuiPanel = refreshWebuiPanel;
window.refreshNetworkTestPanel = refreshNetworkTestPanel;
