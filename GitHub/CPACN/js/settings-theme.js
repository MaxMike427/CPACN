const THEME_STORAGE_KEY = 'easycli-theme-mode';
const THEME_SEQUENCE = ['dark', 'light', 'auto'];
const themeModeBtn = document.getElementById('theme-mode-btn');
const themeMediaQuery = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function resolveThemeMode(mode) {
    if (mode === 'auto') {
        return themeMediaQuery?.matches ? 'dark' : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
}

function getStoredThemeMode() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
}

function updateThemeModeButton(mode) {
    if (!themeModeBtn) {
        return;
    }

    const labelMap = {
        dark: '深色',
        light: '浅色',
        auto: '自动'
    };

    themeModeBtn.textContent = labelMap[mode] || labelMap.dark;
    themeModeBtn.classList.remove('theme-mode-dark', 'theme-mode-light', 'theme-mode-auto');
    themeModeBtn.classList.add(`theme-mode-${mode}`);
}

function applyThemeMode(mode, persist = true) {
    const normalizedMode = THEME_SEQUENCE.includes(mode) ? mode : 'dark';
    const resolvedMode = resolveThemeMode(normalizedMode);

    document.documentElement.dataset.themeMode = normalizedMode;
    document.documentElement.dataset.themeResolved = resolvedMode;
    updateThemeModeButton(normalizedMode);

    if (persist) {
        localStorage.setItem(THEME_STORAGE_KEY, normalizedMode);
    }
}

function cycleThemeMode() {
    const currentMode = getStoredThemeMode();
    const currentIndex = THEME_SEQUENCE.indexOf(currentMode);
    const nextMode = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
    applyThemeMode(nextMode);
}

if (themeModeBtn) {
    themeModeBtn.addEventListener('click', cycleThemeMode);
}

if (themeMediaQuery?.addEventListener) {
    themeMediaQuery.addEventListener('change', () => {
        if (getStoredThemeMode() === 'auto') {
            applyThemeMode('auto', false);
        }
    });
} else if (themeMediaQuery?.addListener) {
    themeMediaQuery.addListener(() => {
        if (getStoredThemeMode() === 'auto') {
            applyThemeMode('auto', false);
        }
    });
}

applyThemeMode(getStoredThemeMode(), false);
