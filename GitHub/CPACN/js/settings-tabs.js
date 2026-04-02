// Tab switching and initial content loading per tab

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
        const tabId = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        const targetContent = document.getElementById(`${tabId}-content`);
        if (targetContent) targetContent.classList.add('active');

        if (tabId === 'auth') {
            loadAuthFiles();
        }
        if (tabId === 'access-token') {
            await loadAccessTokenKeys();
        }
        if (tabId === 'api') {
            await loadAllApiKeys();
        }
        if (tabId === 'openai') {
            await loadOpenaiProviders();
        }
        if (tabId === 'webui' && typeof refreshWebuiPanel === 'function') {
            await refreshWebuiPanel();
        }
        if (tabId === 'network-test' && typeof refreshNetworkTestPanel === 'function') {
            await refreshNetworkTestPanel();
        }
        if (tabId === 'component-update' && typeof refreshComponentUpdatePanel === 'function') {
            await refreshComponentUpdatePanel();
        }
        if (tabId === 'project-link' && typeof refreshProjectLinkPanel === 'function') {
            await refreshProjectLinkPanel();
        }

        updateActionButtons();
    });
});

