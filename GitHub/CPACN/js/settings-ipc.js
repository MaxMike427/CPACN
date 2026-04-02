if (window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen('cliproxyapi-restarted', (event) => {
        const data = event?.payload || {};
        console.log('CLIProxyAPI process restarted successfully:', data);
        // Restart keep-alive mechanism when process restarts
        if (window.configManager) {
            window.configManager.startKeepAlive().catch(error => {
                console.error('Error starting keep-alive on process restart:', error);
            });
        }
        if (typeof window.refreshWebuiPanel === 'function') {
            window.refreshWebuiPanel().catch(error => {
                console.error('Error refreshing WebUI panel after restart:', error);
            });
        }
        showSuccessMessage('CLIProxyAPI process restarted successfully!');
    });
}
