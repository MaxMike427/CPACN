(function () {
    const exactTranslations = Object.freeze({
        'EasyCLI Control Panel': 'EasyCLI 控制台',
        'Local': '本地',
        'Remote': '远程',
        'Run CLIProxyAPI server on your local machine.': '在本机运行 CLIProxyAPI 服务。',
        'Remote controller for a remote CLIProxyAPI server.': '连接并管理远程 CLIProxyAPI 服务。',
        'Remote URL:': '远程地址：',
        'Password:': '密码：',
        'Proxy Server (Optional):': '代理服务器（可选）：',
        'Support HTTP, HTTPS, and SOCKS5 proxy servers': '支持 HTTP、HTTPS 和 SOCKS5 代理服务器',
        'Connect': '连接',
        'Downloading CLIProxyAPI...': '正在下载 CLIProxyAPI...',
        'New Version Found': '发现新版本',
        'A new version is available. Do you want to update to the latest version?': '检测到新版本，是否立即更新到最新版？',
        'Update Later': '稍后更新',
        'Update Now': '立即更新',
        'Set Remote Management Password': '设置远程管理密码',
        'For security reasons, please set a password for the remote management feature.': '为了安全起见，请为远程管理功能设置密码。',
        'Confirm Password:': '确认密码：',
        'Please enter password': '请输入密码',
        'Please enter password again': '请再次输入密码',
        'Cancel': '取消',
        'Save': '保存',
        'Basic Setting': '基本设置',
        'Access Token': '访问令牌',
        'Authentication Files': '认证文件',
        'Third Party API Keys': '第三方 API 密钥',
        'OpenAI Compatibility': 'OpenAI 兼容配置',
        'Port': '端口',
        'Server port number (default: 8080)': '服务端口号（默认：8080）',
        'Allow Remote Management': '允许远程管理',
        'Allow remote management access from other hosts': '允许其他主机进行远程管理',
        'Start at Login': '开机自启',
        'Launch EasyCLI automatically when you log in': '登录系统时自动启动 EasyCLI',
        'Remote Management Secret Key': '远程管理密钥',
        'Secret key for remote management authentication': '用于远程管理身份验证的密钥',
        'Debug Mode': '调试模式',
        'Enable debug logging for troubleshooting': '启用调试日志，便于排查问题',
        'Proxy URL': '代理地址',
        'Configure proxy server URL (e.g., socks5://user:pass@127.0.0.1:1080/)': '配置代理服务器地址（例如 socks5://user:pass@127.0.0.1:1080/）',
        'Request Log': '请求日志',
        'Enable request logging for debugging': '启用请求日志，便于调试',
        'Request Retry': '请求重试',
        'Number of retry attempts for failed requests': '请求失败后的重试次数',
        'Switch Project on Quota Exceeded': '超额后切换项目',
        'Automatically switch to another project when quota is exceeded': '配额超限时自动切换到其他项目',
        'Switch Preview Model on Quota Exceeded': '超额后切换预览模型',
        'Automatically switch to preview model when quota is exceeded': '配额超限时自动切换到预览模型',
        'Loading access tokens...': '正在加载访问令牌...',
        'Loading authentication files...': '正在加载认证文件...',
        'Gemini API Keys': 'Gemini API 密钥',
        'Loading Gemini API keys...': '正在加载 Gemini API 密钥...',
        'Codex API Keys': 'Codex API 密钥',
        'Loading Codex API keys...': '正在加载 Codex API 密钥...',
        'Claude Code API Keys': 'Claude Code API 密钥',
        'Loading Claude API keys...': '正在加载 Claude API 密钥...',
        'OpenAI Compatibility Providers': 'OpenAI 兼容服务商',
        'Loading OpenAI compatibility providers...': '正在加载 OpenAI 兼容服务商...',
        'Confirm Delete': '确认删除',
        'Are you sure you want to delete this API key? This action cannot be undone.': '确认删除此 API 密钥吗？此操作无法撤销。',
        'Delete': '删除',
        'Add API Key': '添加 API 密钥',
        'API Key': 'API 密钥',
        'Base URL': '基础地址',
        'Proxy URL (optional)': '代理地址（可选）',
        'Optional proxy URL for API requests': 'API 请求使用的可选代理地址',
        'Excluded Models': '排除模型',
        'Comma-separated model IDs to exclude': '用逗号分隔要排除的模型 ID',
        'Headers (JSON)': '请求头（JSON）',
        'Optional request headers in JSON object format': '可选请求头，需为 JSON 对象格式',
        'Add Access Token': '添加访问令牌',
        'Add Provider': '添加服务商',
        'Provider Name': '服务商名称',
        'API Keys': 'API 密钥',
        'Models': '模型',
        'Enter API key and optional proxy URL per row': '每行填写一个 API 密钥和可选代理地址',
        'Enter model name and alias name. Leave empty if no custom models.': '每行填写模型名和别名；如无需自定义模型可留空',
        'Reset': '重置',
        'Apply': '应用',
        'New': '新建',
        'Download': '下载',
        'Select All': '全选',
        'Unselect All': '取消全选',
        'Local File': '本地文件',
        'Edit': '编辑',
        'Loading...': '加载中...',
        'No Access Tokens': '暂无访问令牌',
        'Add your first access token to get started': '添加第一个访问令牌后即可开始使用',
        'No Gemini API Keys': '暂无 Gemini API 密钥',
        'Add your first Gemini API key to get started': '添加第一个 Gemini API 密钥后即可开始使用',
        'No Codex API Keys': '暂无 Codex API 密钥',
        'Add your first Codex API key to get started': '添加第一个 Codex API 密钥后即可开始使用',
        'No Claude API Keys': '暂无 Claude API 密钥',
        'Add your first Claude API key to get started': '添加第一个 Claude API 密钥后即可开始使用',
        'No OpenAI Compatibility Providers': '暂无 OpenAI 兼容服务商',
        'Add your first provider to get started': '添加第一个服务商后即可开始使用',
        'No authentication files': '暂无认证文件',
        'Upload authentication files to manage them here': '上传认证文件后可在此处管理',
        'Gemini WEB Authentication': 'Gemini Web 认证',
        'Please enter your Gemini Web cookies:': '请输入 Gemini Web Cookie：',
        'Email:': '邮箱：',
        'Confirm': '确认',
        'Gemini CLI Authentication': 'Gemini CLI 认证',
        'Please enter Google Cloud Project ID (optional):': '请输入 Google Cloud Project ID（可选）：',
        'If no Project ID is entered, the default project will be used': '如不填写 Project ID，将使用默认项目',
        'Codex Authentication': 'Codex 认证',
        'Claude Code Authentication': 'Claude Code 认证',
        'Qwen Code Authentication': 'Qwen Code 认证',
        'Antigravity Authentication': 'Antigravity 认证',
        'iFlow Cookie Import': '导入 iFlow Cookie',
        'Paste your iFlow cookie to save it as an authentication file.': '粘贴 iFlow Cookie 以保存为认证文件。',
        'Cookie': 'Cookie',
        'Cookie is required and must not be empty.': 'Cookie 为必填项，不能为空。',
        'iFlow Authentication': 'iFlow 认证',
        'Vertex Credential Import': '导入 Vertex 凭据',
        'Upload a Google service account JSON and optional Vertex location.': '上传 Google 服务账号 JSON，并可选填写 Vertex 区域。',
        'Service Account JSON': '服务账号 JSON',
        'The file name must end with .json.': '文件名必须以 .json 结尾。',
        'Location': '区域',
        'Defaults to us-central1 when empty.': '留空时默认使用 us-central1。',
        'Import': '导入',
        'Open Link': '打开链接',
        'Copy Link': '复制链接',
        'Waiting for authentication to complete...': '正在等待认证完成...',
        'Checking version...': '正在检查版本...',
        'Download completed!': '下载完成！',
        'Checking...': '检查中...',
        'Connecting...': '连接中...',
        'Updating...': '更新中...',
        'Saving...': '保存中...',
        'Deleting...': '删除中...',
        'Downloading...': '下载中...',
        'Applying...': '应用中...',
        'Importing...': '导入中...',
        'Enter password': '请输入密码',
        'Enter secret key': '请输入密钥',
        'Enter proxy URL': '请输入代理地址',
        'Enter API key': '请输入 API 密钥',
        'Enter access token': '请输入访问令牌',
        'e.g., openrouter': '例如：openrouter',
        'Model name': '模型名称',
        'Alias name': '别名',
        'Enter Project ID (optional)': '请输入 Project ID（可选）',
        'Enter Secure-1PSID': '请输入 Secure-1PSID',
        'Enter Secure-1PSIDTS': '请输入 Secure-1PSIDTS',
        'Enter your email address': '请输入邮箱地址',
        'Paste iFlow cookie here': '请粘贴 iFlow Cookie'
    });

    const authNameTranslations = Object.freeze({
        'Gemini CLI': 'Gemini CLI',
        'Gemini Web': 'Gemini Web',
        'Codex': 'Codex',
        'Claude Code': 'Claude Code',
        'Qwen Code': 'Qwen Code',
        'Antigravity': 'Antigravity',
        'iFlow': 'iFlow',
        'Vertex': 'Vertex'
    });

    const tabNameTranslations = Object.freeze({
        'basic settings': '基本设置',
        'access token': '访问令牌',
        'third party api keys': '第三方 API 密钥',
        'openai compatibility': 'OpenAI 兼容配置',
        'settings': '设置'
    });

    function withOriginalWhitespace(original, translated) {
        const leading = original.match(/^\s*/)?.[0] || '';
        const trailing = original.match(/\s*$/)?.[0] || '';
        return `${leading}${translated}${trailing}`;
    }

    function translateNamedLabel(name) {
        if (!name) {
            return name;
        }
        return authNameTranslations[name] || name;
    }

    function translateTabName(name) {
        if (!name) {
            return name;
        }
        return tabNameTranslations[name.toLowerCase()] || name;
    }

    function translateTrimmedText(trimmed) {
        if (!trimmed) {
            return trimmed;
        }

        if (Object.prototype.hasOwnProperty.call(exactTranslations, trimmed)) {
            return exactTranslations[trimmed];
        }

        const dynamicRules = [
            [/^Current version: (.+)\nLatest version: (.+)\n\nDo you want to update to the latest version\?$/, (_, current, latest) => `当前版本：${current}\n最新版本：${latest}\n\n是否更新到最新版本？`],
            [/^CLIProxyAPI (.+) downloaded and extracted successfully!$/, (_, version) => `CLIProxyAPI ${version} 已成功下载并解压！`],
            [/^CLIProxyAPI (.+) is already the latest version!$/, (_, version) => `CLIProxyAPI ${version} 已经是最新版本！`],
            [/^Failed to update CLIProxyAPI: (.+)$/, (_, message) => `更新 CLIProxyAPI 失败：${message}`],
            [/^Error updating CLIProxyAPI: (.+)$/, (_, message) => `更新 CLIProxyAPI 时出错：${message}`],
            [/^Failed to set password: (.+)$/, (_, message) => `设置密码失败：${message}`],
            [/^Error setting password: (.+)$/, (_, message) => `设置密码时出错：${message}`],
            [/^Failed to check version: (.+)$/, (_, message) => `检查版本失败：${message}`],
            [/^Error checking version: (.+)$/, (_, message) => `检查版本时出错：${message}`],
            [/^Connection error: (.+)$/, (_, message) => `连接错误：${message}`],
            [/^Reason: (.+)$/, (_, message) => `原因：${message}`],
            [/^CLIProxyAPI process exited abnormally, exit code: (.+)$/, (_, code) => `CLIProxyAPI 进程异常退出，退出码：${code}`],
            [/^Base URL: (.+)$/, (_, value) => `基础地址：${value}`],
            [/^Proxy URL: (.+)$/, (_, value) => `代理地址：${value}`],
            [/^Excluded: (.+)$/, (_, value) => `排除模型：${value}`],
            [/^Headers: (.+)$/, (_, value) => `请求头：${value}`],
            [/^Type: (.+)$/, (_, value) => `类型：${value}`],
            [/^Modified: (.+)$/, (_, value) => `修改时间：${value}`],
            [/^Remote:$/, () => '远程：'],
            [/^Remote:\s*$/, () => '远程：'],
            [/^Failed to load Access Token keys$/, () => '加载访问令牌失败'],
            [/^Failed to load API keys$/, () => '加载 API 密钥失败'],
            [/^Failed to load Gemini API keys$/, () => '加载 Gemini API 密钥失败'],
            [/^Failed to load Codex API keys$/, () => '加载 Codex API 密钥失败'],
            [/^Failed to load Claude API keys$/, () => '加载 Claude API 密钥失败'],
            [/^Failed to load OpenAI providers$/, () => '加载 OpenAI 兼容服务商失败'],
            [/^Failed to load settings$/, () => '加载设置失败'],
            [/^Please switch to Access Token tab to manage access tokens$/, () => '请切换到“访问令牌”标签页后再管理访问令牌'],
            [/^Please switch to Third Party API Keys tab to manage keys$/, () => '请切换到“第三方 API 密钥”标签页后再管理密钥'],
            [/^Please switch to OpenAI Compatibility tab to manage providers$/, () => '请切换到“OpenAI 兼容配置”标签页后再管理服务商'],
            [/^Please fill in this field$/, () => '请填写此字段'],
            [/^Headers must be a JSON object$/, () => '请求头必须是 JSON 对象'],
            [/^Headers must be valid JSON$/, () => '请求头必须是合法的 JSON'],
            [/^Password must be set to use Local mode$/, () => '使用本地模式前必须先设置密码'],
            [/^Passwords do not match$/, () => '两次输入的密码不一致'],
            [/^Password must be at least 6 characters$/, () => '密码长度至少需要 6 位'],
            [/^CLIProxyAPI process start failed$/, () => 'CLIProxyAPI 进程启动失败'],
            [/^CLIProxyAPI process start error$/, () => 'CLIProxyAPI 进程启动出错'],
            [/^This feature requires Tauri environment$/, () => '此功能需要在 Tauri 环境中运行'],
            [/^Please enter a remote URL$/, () => '请输入远程地址'],
            [/^Password incorrect$/, () => '密码错误'],
            [/^Server address error$/, () => '服务器地址错误'],
            [/^Invalid proxy format\. Supported formats: (.+)$/, (_, formats) => `代理格式无效。支持的格式：${formats}`],
            [/^Network error$/, () => '网络错误'],
            [/^Auto-start enabled successfully$/, () => '已成功启用开机自启'],
            [/^Failed to enable auto-start$/, () => '启用开机自启失败'],
            [/^Auto-start disabled successfully$/, () => '已成功关闭开机自启'],
            [/^Failed to disable auto-start$/, () => '关闭开机自启失败'],
            [/^Failed to update auto-start setting$/, () => '更新开机自启设置失败'],
            [/^No changes to apply in (.+)$/, (_, tabName) => `${translateTabName(tabName)}没有需要应用的更改`],
            [/^Applied (\d+) (.+) setting\(s\) successfully$/, (_, count, tabName) => `已成功应用 ${count} 项${translateTabName(tabName)}设置`],
            [/^Failed to apply (\d+) setting\(s\)$/, (_, count) => `有 ${count} 项设置应用失败`],
            [/^(Basic Settings|Access Token|Third Party API Keys|OpenAI Compatibility) reset to server config$/, (_, tabName) => `${translateTabName(tabName)}已重置为服务器配置`],
            [/^Port configuration saved, restarting CLIProxyAPI process\.\.\.$/, () => '端口配置已保存，正在重启 CLIProxyAPI 进程...'],
            [/^CLIProxyAPI process restarted successfully!$/, () => 'CLIProxyAPI 进程已成功重启！'],
            [/^This access token already exists$/, () => '该访问令牌已存在'],
            [/^This API key already exists$/, () => '该 API 密钥已存在'],
            [/^This alias name already exists$/, () => '该别名已存在'],
            [/^This provider name already exists$/, () => '该服务商名称已存在'],
            [/^Are you sure you want to delete this Gemini API key\? This action cannot be undone\.$/, () => '确认删除此 Gemini API 密钥吗？此操作无法撤销。'],
            [/^Are you sure you want to delete this Codex API key\? This action cannot be undone\.$/, () => '确认删除此 Codex API 密钥吗？此操作无法撤销。'],
            [/^Are you sure you want to delete this Claude API key\? This action cannot be undone\.$/, () => '确认删除此 Claude API 密钥吗？此操作无法撤销。'],
            [/^Are you sure you want to delete this access token\?\nThis action cannot be undone\.$/, () => '确认删除此访问令牌吗？\n此操作无法撤销。'],
            [/^Are you sure you want to delete this OpenAI compatibility provider\? This action cannot be undone\.$/, () => '确认删除此 OpenAI 兼容服务商吗？此操作无法撤销。'],
            [/^Are you sure you want to delete (\d+) authentication (file|files)\?\nThis action cannot be undone\.$/, (_, count) => `确认删除 ${count} 个认证文件吗？\n此操作无法撤销。`],
            [/^Uploaded (\d+) file\(s\) successfully$/, (_, count) => `已成功上传 ${count} 个文件`],
            [/^Failed to upload (\d+) file\(s\): (.+)$/, (_, count, message) => `有 ${count} 个文件上传失败：${message}`],
            [/^Failed to upload (\d+) file\(s\)$/, (_, count) => `有 ${count} 个文件上传失败`],
            [/^Downloaded (\d+) file\(s\) successfully$/, (_, count) => `已成功下载 ${count} 个文件`],
            [/^Failed to download (\d+) file\(s\)$/, (_, count) => `有 ${count} 个文件下载失败`],
            [/^Deleted (\d+) file\(s\) successfully$/, (_, count) => `已成功删除 ${count} 个文件`],
            [/^Failed to delete (\d+) file\(s\)$/, (_, count) => `有 ${count} 个文件删除失败`],
            [/^Please select only JSON files\. Invalid files: (.+)$/, (_, files) => `只能选择 JSON 文件。无效文件：${files}`],
            [/^Failed to upload files$/, () => '上传文件失败'],
            [/^Failed to download files$/, () => '下载文件失败'],
            [/^Please enter email, Secure-1PSID and Secure-1PSIDTS$/, () => '请输入邮箱、Secure-1PSID 和 Secure-1PSIDTS'],
            [/^Gemini Web tokens saved successfully$/, () => 'Gemini Web 凭据已成功保存'],
            [/^Failed to save Gemini Web tokens: (.+)$/, (_, message) => `保存 Gemini Web 凭据失败：${message}`],
            [/^Link copied to clipboard$/, () => '链接已复制到剪贴板'],
            [/^Authentication link opened in browser$/, () => '认证链接已在浏览器中打开'],
            [/^Failed to copy link$/, () => '复制链接失败'],
            [/^Failed to copy link: (.+)$/, (_, message) => `复制链接失败：${message}`],
            [/^Failed to open link$/, () => '打开链接失败'],
            [/^Failed to open link: (.+)$/, (_, message) => `打开链接失败：${message}`],
            [/^Failed to start (.+) authentication flow: (.+)$/, (_, authType, message) => `启动 ${translateNamedLabel(authType)} 认证流程失败：${message}`],
            [/^(.+?) authentication completed!$/, (_, authType) => `${translateNamedLabel(authType)} 认证已完成！`],
            [/^(.+?) Authentication completed!$/, (_, authType) => `${translateNamedLabel(authType)} 认证已完成！`],
            [/^(.+?) Authentication failed: (.+)$/, (_, authType, message) => `${translateNamedLabel(authType)} 认证失败：${message}`],
            [/^Error occurred during (.+?) Authentication: (.+)$/, (_, authType, message) => `${translateNamedLabel(authType)} 认证过程中出错：${message}`],
            [/^Authentication timeout, please try again$/, () => '认证超时，请重试'],
            [/^Please enter iFlow cookie$/, () => '请输入 iFlow Cookie'],
            [/^Failed to save iFlow cookie$/, () => '保存 iFlow Cookie 失败'],
            [/^Failed to save iFlow cookie: (.+)$/, (_, message) => `保存 iFlow Cookie 失败：${message}`],
            [/^iFlow cookie saved$/, () => 'iFlow Cookie 已保存'],
            [/^iFlow cookie saved for (.+)$/, (_, email) => `已为 ${email} 保存 iFlow Cookie`],
            [/^Please select a service account JSON file$/, () => '请选择服务账号 JSON 文件'],
            [/^Service account file must be a \.json file$/, () => '服务账号文件必须是 .json 格式'],
            [/^Vertex credential imported$/, () => 'Vertex 凭据已导入'],
            [/^Vertex credential imported for (.+) \((.+)\)$/, (_, project, location) => `Vertex 凭据已导入：项目 ${project}，区域 ${location}`],
            [/^Vertex credential imported for (.+)$/, (_, project) => `Vertex 凭据已导入：项目 ${project}`],
            [/^Vertex credential imported \((.+)\)$/, (_, location) => `Vertex 凭据已导入：区域 ${location}`],
            [/^Failed to import Vertex credential$/, () => '导入 Vertex 凭据失败'],
            [/^Failed to import Vertex credential: (.+)$/, (_, message) => `导入 Vertex 凭据失败：${message}`],
            [/^No files to save$/, () => '没有可保存的文件'],
            [/^ZIP utility not loaded$/, () => 'ZIP 工具未加载'],
            [/^User cancelled save dialog$/, () => '用户取消了保存对话框'],
            [/^Cookie is required$/, () => 'Cookie 为必填项'],
            [/^No file selected$/, () => '未选择文件'],
            [/^Tauri environment required$/, () => '需要在 Tauri 环境中运行'],
            [/^Missing local management key\. Please restart CLIProxyAPI\.$/, () => '缺少本地管理密钥，请重启 CLIProxyAPI。'],
            [/^Config file missing$/, () => '配置文件缺失'],
            [/^Missing secret-key$/, () => '缺少 secret-key'],
            [/^Choose save directory$/, () => '选择保存目录']
        ];

        for (const [pattern, replacer] of dynamicRules) {
            if (pattern.test(trimmed)) {
                return trimmed.replace(pattern, replacer);
            }
        }

        return trimmed;
    }

    function translateMessage(message) {
        if (typeof message !== 'string') {
            return message;
        }

        const trimmed = message.trim();
        if (!trimmed) {
            return message;
        }

        const translated = translateTrimmedText(trimmed);
        return translated === trimmed ? message : withOriginalWhitespace(message, translated);
    }

    function shouldSkipElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return true;
        }
        const tagName = element.tagName?.toLowerCase();
        return tagName === 'script' || tagName === 'style';
    }

    function translateAttributes(element) {
        if (shouldSkipElement(element)) {
            return;
        }

        ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (value) {
                const translated = translateMessage(value);
                if (translated !== value) {
                    element.setAttribute(attribute, translated);
                }
            }
        });
    }

    function translateNode(node) {
        if (!node) {
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const original = node.nodeValue;
            const translated = translateMessage(original);
            if (translated !== original) {
                node.nodeValue = translated;
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) {
            return;
        }

        translateAttributes(node);
        Array.from(node.childNodes).forEach(translateNode);
    }

    function startTranslation() {
        document.documentElement.lang = 'zh-CN';
        document.title = translateMessage(document.title);
        translateNode(document.body);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'characterData') {
                    translateNode(mutation.target);
                    return;
                }

                if (mutation.type === 'attributes') {
                    translateAttributes(mutation.target);
                    return;
                }

                mutation.addedNodes.forEach(translateNode);
            });
        });

        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['placeholder', 'title', 'aria-label']
        });
    }

    window.translateMessage = translateMessage;
    window.translateTree = translateNode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTranslation, { once: true });
    } else {
        startTranslation();
    }
})();
