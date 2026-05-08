/**
 * admin.js — 系统管理面板
 * 对接 /api/admin/config REST API
 */

// API 配置
const ADMIN_API_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/admin/config';

// ─── DOM 元素 ──────────────────────────────────────────

const adminPanel = document.getElementById('admin-panel');
const adminOverlay = document.getElementById('admin-overlay');
const adminToggle = document.getElementById('admin-toggle');
const adminCloseBtn = document.getElementById('admin-close-btn');
const adminSaveBtn = document.getElementById('admin-save-btn');
const adminResetBtn = document.getElementById('admin-reset-btn');
const adminToast = document.getElementById('admin-toast');

// ─── 面板打开/关闭 ──────────────────────────────────────

function openAdminPanel() {
    adminPanel.classList.add('active');
    adminOverlay.classList.add('active');
    loadAdminConfig();
}

function closeAdminPanel() {
    adminPanel.classList.remove('active');
    adminOverlay.classList.remove('active');
}

if (adminToggle) {
    adminToggle.addEventListener('click', openAdminPanel);
}

if (adminCloseBtn) {
    adminCloseBtn.addEventListener('click', closeAdminPanel);
}

if (adminOverlay) {
    adminOverlay.addEventListener('click', closeAdminPanel);
}

// ─── Toast 提示 ──────────────────────────────────────────

let toastTimer = null;

function showToast(message, isError = false) {
    if (!adminToast) return;
    adminToast.textContent = message;
    adminToast.className = 'admin-toast active' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        adminToast.className = 'admin-toast';
    }, 3000);
}

// ─── API 调用 ────────────────────────────────────────────

async function loadAdminConfig() {
    try {
        const res = await fetch(ADMIN_API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();
        populateForm(config);
    } catch (err) {
        console.error('[admin] 加载配置失败:', err);
        showToast('加载配置失败: ' + err.message, true);
    }
}

async function saveAdminConfig() {
    const config = collectForm();
    try {
        const res = await fetch(ADMIN_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(result.message || '配置已保存 ✓');

        // 同步更新搜索设置
        if (window.searchSettings) {
            window.searchSettings.summarize = config.search?.default_summarize ?? false;
            window.searchSettings.webSupplement = config.search?.default_web_supplement ?? false;
            window.searchSettings.dedupMode = config.search?.default_dedup_mode ?? 'file';
        }
    } catch (err) {
        console.error('[admin] 保存配置失败:', err);
        showToast('保存失败: ' + err.message, true);
    }
}

async function resetAdminConfig() {
    if (!confirm('确定重置所有配置为默认值？')) return;
    try {
        const res = await fetch(ADMIN_API_URL + '/reset', {
            method: 'POST',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(result.message || '配置已重置');
        loadAdminConfig();
    } catch (err) {
        console.error('[admin] 重置配置失败:', err);
        showToast('重置失败: ' + err.message, true);
    }
}

// ─── 表单填充/收集 ──────────────────────────────────────

function populateForm(config) {
    // LLM
    if (config.llm) {
        const backend = document.getElementById('admin-llm-backend');
        const model = document.getElementById('admin-llm-model');
        const baseUrl = document.getElementById('admin-llm-base-url');
        const apiKey = document.getElementById('admin-llm-api-key');

        if (backend) backend.value = config.llm.backend || '';
        if (model) model.value = config.llm.model || '';
        if (baseUrl) baseUrl.value = config.llm.base_url || '';
        if (apiKey) {
            // 如果返回的是脱敏值，不覆盖已有值
            const masked = config.llm.api_key || '';
            if (masked && masked.includes('****')) {
                // 保持输入框为空，提示用户手动输入
                if (!apiKey.dataset.hadValue) {
                    apiKey.placeholder = '已配置 (修改请填写新Key)';
                }
            } else {
                apiKey.value = masked;
            }
        }
    }

    // Search
    if (config.search) {
        const summarize = document.getElementById('admin-search-summarize');
        const webSupplement = document.getElementById('admin-search-web-supplement');
        const topK = document.getElementById('admin-search-top-k');
        const dedupMode = document.getElementById('admin-search-dedup-mode');

        if (summarize) summarize.checked = config.search.default_summarize ?? false;
        if (webSupplement) webSupplement.checked = config.search.default_web_supplement ?? false;
        if (topK) topK.value = config.search.default_top_k ?? 5;
        if (dedupMode) dedupMode.value = config.search.default_dedup_mode ?? 'file';
    }

    // Server
    if (config.server) {
        const cors = document.getElementById('admin-server-cors');
        if (cors) cors.value = config.server.cors_origins || '';
    }
}

function collectForm() {
    const config = {};

    // LLM
    const backend = document.getElementById('admin-llm-backend');
    const model = document.getElementById('admin-llm-model');
    const baseUrl = document.getElementById('admin-llm-base-url');
    const apiKey = document.getElementById('admin-llm-api-key');

    if (backend || model || baseUrl || apiKey) {
        config.llm = {};
        if (backend) config.llm.backend = backend.value;
        if (model) config.llm.model = model.value;
        if (baseUrl) config.llm.base_url = baseUrl.value;
        // 仅当用户输入了新值时才发送 API Key（避免发送脱敏值）
        if (apiKey && apiKey.value && !apiKey.value.includes('****')) {
            config.llm.api_key = apiKey.value;
        }
    }

    // Search
    const summarize = document.getElementById('admin-search-summarize');
    const webSupplement = document.getElementById('admin-search-web-supplement');
    const topK = document.getElementById('admin-search-top-k');
    const dedupMode = document.getElementById('admin-search-dedup-mode');

    config.search = {};
    if (summarize) config.search.default_summarize = summarize.checked;
    if (webSupplement) config.search.default_web_supplement = webSupplement.checked;
    if (topK) config.search.default_top_k = parseInt(topK.value) || 5;
    if (dedupMode) config.search.default_dedup_mode = dedupMode.value;

    // Server
    const cors = document.getElementById('admin-server-cors');
    if (cors && cors.value) {
        config.server = { cors_origins: cors.value };
    }

    return config;
}

// ─── 事件绑定 ────────────────────────────────────────────

if (adminSaveBtn) {
    adminSaveBtn.addEventListener('click', saveAdminConfig);
}

if (adminResetBtn) {
    adminResetBtn.addEventListener('click', resetAdminConfig);
}

// ─── 初始化：加载默认配置到 searchSettings ──────────────

async function initAdminDefaults() {
    try {
        const res = await fetch(ADMIN_API_URL);
        if (!res.ok) return;
        const config = await res.json();

        if (window.searchSettings) {
            if (config.search?.default_summarize !== undefined) {
                window.searchSettings.summarize = config.search.default_summarize;
            }
            if (config.search?.default_web_supplement !== undefined) {
                window.searchSettings.webSupplement = config.search.default_web_supplement;
            }
            if (config.search?.default_dedup_mode !== undefined) {
                window.searchSettings.dedupMode = config.search.default_dedup_mode;
            }
        }
    } catch (err) {
        console.warn('[admin] 初始化默认配置失败（使用代码默认值）:', err);
    }
}

// 页面加载后自动获取默认配置
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDefaults);
} else {
    initAdminDefaults();
}
