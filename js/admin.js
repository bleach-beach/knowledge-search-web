/**
 * admin.js — 系统管理面板
 * 对接 /api/admin/config REST API
 * 新增：知识库目录管理 + AI管家配置 + 头像上传 + 索引重建
 */

// API 配置
const ADMIN_API_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/admin/config';
const ADMIN_VAULTS_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/admin/vaults';
const ADMIN_AI_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/admin/ai-assistant';
const ADMIN_AVATAR_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/admin/avatar/upload';
const INDEX_REBUILD_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/index/rebuild-multi';
const INDEX_STATUS_URL = (window.KB_API_BASE || 'http://localhost:8000') + '/api/index/status';

// ─── DOM 元素 ──────────────────────────────────────────

const adminPanel = document.getElementById('admin-panel');
const adminOverlay = document.getElementById('admin-overlay');
const adminToggle = document.getElementById('admin-toggle');
const adminCloseBtn = document.getElementById('admin-close-btn');
const adminSaveBtn = document.getElementById('admin-save-btn');
const adminResetBtn = document.getElementById('admin-reset-btn');
const adminToast = document.getElementById('admin-toast');

// AI 女管家头像相关元素
const butlerAvatarInput = document.getElementById('admin-butler-avatar');
const butlerAvatarFile = document.getElementById('admin-butler-avatar-file');
const butlerAvatarPreview = document.getElementById('admin-avatar-preview');
const butlerApiInput = document.getElementById('admin-butler-api');

// 知识库管理元素
const vaultAddPath = document.getElementById('vault-add-path');
const vaultAddName = document.getElementById('vault-add-name');
const vaultAddBtn = document.getElementById('vault-add-btn');
const vaultList = document.getElementById('vault-list');
const vaultBuildBtn = document.getElementById('vault-build-btn');
const rebuildAllBtn = document.getElementById('rebuild-all-btn');
const indexStatusInfo = document.getElementById('index-status-info');

// ─── 面板打开/关闭 ──────────────────────────────────────

function openAdminPanel() {
    adminPanel.classList.add('active');
    adminOverlay.classList.add('active');
    loadAdminConfig();
    loadVaults();
    loadAIAssistantConfig();
    loadIndexStatus();
}

function closeAdminPanel() {
    adminPanel.classList.remove('active');
    adminOverlay.classList.remove('active');
    // 关闭管理面板时，刷新头像（如果头像已上传）
    if (typeof window.refreshButlerAvatar === 'function') {
        window.refreshButlerAvatar();
    }
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
            window.searchSettings.defaultTopK = config.search?.default_top_k ?? 10;
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
            const masked = config.llm.api_key || '';
            if (masked && masked.includes('****')) {
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

// ─── AI 女管家头像上传 ─────────────────────────────────

if (butlerAvatarFile) {
    butlerAvatarFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 预览
        const reader = new FileReader();
        reader.onload = (ev) => {
            const src = ev.target.result;
            if (butlerAvatarPreview) {
                butlerAvatarPreview.innerHTML = `<img src="${src}" style="max-width:120px;max-height:120px;border-radius:8px;border:1px solid rgba(0,240,255,0.3);box-shadow:0 0 10px rgba(0,240,255,0.2);">`;
            }
            localStorage.setItem('nexus-butler-avatar-base64', src);
            if (butlerAvatarInput) {
                butlerAvatarInput.value = '[本地图片]';
            }
        };
        reader.readAsDataURL(file);
    });
}

// ─── AI管家配置 ─────────────────────────────────────────

async function loadAIAssistantConfig() {
    try {
        const res = await fetch(ADMIN_AI_URL);
        if (!res.ok) {
            console.warn('[admin] 加载AI管家配置失败');
            return;
        }
        const config = await res.json();

        // 填充昵称
        const nicknameInput = document.getElementById('admin-butler-nickname');
        if (nicknameInput) nicknameInput.value = config.nickname || 'NEXUS';

        // 填充头像URL
        const avatarUrl = document.getElementById('admin-butler-avatar');
        if (avatarUrl) {
            avatarUrl.value = config.avatar_url || '';
        }

        // 填充system prompt
        const systemPrompt = document.getElementById('admin-butler-system-prompt');
        if (systemPrompt) systemPrompt.value = config.system_prompt || '';

        // 显示头像预览
        if (config.avatar_url && butlerAvatarPreview) {
            butlerAvatarPreview.innerHTML = `<img src="${config.avatar_url}" style="max-width:120px;max-height:120px;border-radius:8px;border:1px solid rgba(0,240,255,0.3);box-shadow:0 0 10px rgba(0,240,255,0.2);">`;
        }
    } catch (err) {
        console.warn('[admin] 加载AI管家配置失败:', err.message);
    }
}

async function saveAIAssistantConfig() {
    const nickname = document.getElementById('admin-butler-nickname')?.value || 'NEXUS';
    const systemPrompt = document.getElementById('admin-butler-system-prompt')?.value || '';
    const avatarUrl = document.getElementById('admin-butler-avatar')?.value || '';

    try {
        const res = await fetch(ADMIN_AI_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, system_prompt: systemPrompt, avatar_url: avatarUrl }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast('AI管家配置已保存 ✓');
    } catch (err) {
        console.error('[admin] 保存AI管家配置失败:', err);
        showToast('保存失败: ' + err.message, true);
    }
}

// 头像上传到后端
async function uploadAvatarToServer(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(ADMIN_AVATAR_URL, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast('头像上传成功 ✓');

        // 更新头像URL输入框和预览
        const avatarUrlInput = document.getElementById('admin-butler-avatar');
        if (avatarUrlInput) avatarUrlInput.value = result.avatar_url;

        if (butlerAvatarPreview) {
            butlerAvatarPreview.innerHTML = `<img src="${result.avatar_url}" style="max-width:120px;max-height:120px;border-radius:8px;border:1px solid rgba(0,240,255,0.3);box-shadow:0 0 10px rgba(0,240,255,0.2);">`;
        }

        // 同时保存到 localStorage 供 navigation-butler.js 使用
        localStorage.setItem('nexus-butler-avatar-base64', '');
        localStorage.setItem('nexus-butler-api', window.KB_API_BASE || 'http://localhost:8000');

        // 刷新前端头像显示（导航模式下的头像）
        if (typeof window.refreshButlerAvatar === 'function') {
            window.refreshButlerAvatar();
        }

    } catch (err) {
        console.error('[admin] 头像上传失败:', err);
        showToast('上传失败: ' + err.message, true);
    }
}

// ─── 知识库目录管理 ──────────────────────────────────────

async function loadVaults() {
    try {
        const res = await fetch(ADMIN_VAULTS_URL);
        if (!res.ok) {
            console.warn('[admin] 加载vaults失败');
            return;
        }
        const data = await res.json();
        renderVaultList(data.vaults || []);
    } catch (err) {
        console.warn('[admin] 加载vaults失败:', err.message);
    }
}

function renderVaultList(vaults) {
    if (!vaultList) return;

    if (!vaults || vaults.length === 0) {
        vaultList.innerHTML = '<div class="admin-empty-state">暂无知识库目录，请添加</div>';
        return;
    }

    vaultList.innerHTML = vaults.map(v => `
        <div class="vault-item" data-path="${v.path}">
            <div class="vault-info">
                <span class="vault-name">${v.name || v.path.split('/').pop()}</span>
                <span class="vault-path">${v.path}</span>
            </div>
            <div class="vault-actions">
                <label class="admin-toggle-switch vault-toggle">
                    <input type="checkbox" ${v.enabled !== false ? 'checked' : ''} onchange="toggleVaultEnabled('${v.path}', this.checked)">
                    <span class="admin-toggle-slider"></span>
                </label>
                <button class="vault-rebuild-btn" onclick="rebuildSingleVault('${v.path}')">重建</button>
                <button class="vault-remove-btn" onclick="removeVault('${v.path}')">移除</button>
            </div>
        </div>
    `).join('');
}

async function addVault() {
    const path = vaultAddPath?.value?.trim() || '';
    if (!path) {
        showToast('请输入目录路径', true);
        return;
    }

    // 检查目录是否存在
    try {
        const res = await fetch(ADMIN_VAULTS_URL + '/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name: vaultAddName?.value?.trim() }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const result = await res.json();
        showToast(result.message || '已添加');
        vaultAddPath.value = '';
        vaultAddName?.value && (vaultAddName.value = '');
        loadVaults();
    } catch (err) {
        showToast('添加失败: ' + err.message, true);
    }
}

async function removeVault(path) {
    if (!confirm(`确定移除知识库目录: ${path}？`)) return;

    try {
        const res = await fetch(ADMIN_VAULTS_URL + '/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const result = await res.json();
        showToast(result.message || '已移除');
        loadVaults();
        loadIndexStatus();
    } catch (err) {
        showToast('移除失败: ' + err.message, true);
    }
}

async function toggleVaultEnabled(path, enabled) {
    try {
        // 获取当前所有vaults
        const res = await fetch(ADMIN_VAULTS_URL);
        const data = await res.json();
        const vaults = (data.vaults || []).map(v =>
            v.path === path ? { ...v, enabled } : v
        );

        // 通过 admin config 更新 vaults
        await fetch(ADMIN_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vaults }),
        });
        showToast(enabled ? '已启用' : '已禁用');
    } catch (err) {
        showToast('操作失败: ' + err.message, true);
        loadVaults(); // 回滚
    }
}

// ─── 索引重建 ─────────────────────────────────────────────

async function rebuildAllVaults() {
    // 先确保 vaults 配置已加载
    let vaultPaths = [];
    try {
        const vaultRes = await fetch(ADMIN_VAULTS_URL);
        if (vaultRes.ok) {
            const vaultData = await vaultRes.json();
            const vaults = vaultData.vaults || [];
            vaultPaths = vaults.filter(v => v.enabled !== false).map(v => v.path);
        }
    } catch (e) {
        console.warn('[admin] 加载vaults配置失败，将尝试从后端默认配置重建');
    }

    if (vaultPaths.length === 0) {
        showToast('没有可用的知识库目录，请先添加目录', true);
        return;
    }

    if (!confirm(`确定重建 ${vaultPaths.length} 个知识库索引？这可能需要较长时间。`)) return;

    try {
        const res = await fetch(INDEX_REBUILD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault_paths: vaultPaths, force: true }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(result.message || '索引重建完成 ✓');
        loadIndexStatus();
    } catch (err) {
        showToast('重建失败: ' + err.message, true);
    }
}

async function rebuildSingleVault(path) {
    if (!confirm(`确定重建索引: ${path}？`)) return;

    try {
        const res = await fetch(INDEX_REBUILD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault_paths: [path], force: true }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(result.message || '索引重建完成 ✓');
        loadIndexStatus();
    } catch (err) {
        showToast('重建失败: ' + err.message, true);
    }
}

async function loadIndexStatus() {
    try {
        const res = await fetch(INDEX_STATUS_URL);
        if (!res.ok) {
            if (indexStatusInfo) indexStatusInfo.textContent = '索引状态加载中...';
            return;
        }
        const data = await res.json();
        if (indexStatusInfo) {
            indexStatusInfo.textContent = `共 ${data.total_files} 个文件，${data.total_chunks} 个文本块`;
        }
    } catch (err) {
        if (indexStatusInfo) indexStatusInfo.textContent = '索引状态加载失败';
    }
}

// ─── 初始化 ──────────────────────────────────────────────

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
            if (config.search?.default_top_k !== undefined) {
                window.searchSettings.defaultTopK = config.search.default_top_k;
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

// 暴露全局函数供 HTML onclick 调用
window.addVault = addVault;
window.removeVault = removeVault;
window.toggleVaultEnabled = toggleVaultEnabled;
window.rebuildSingleVault = rebuildSingleVault;
window.saveAIAssistantConfig = saveAIAssistantConfig;
window.uploadAvatarToServer = uploadAvatarToServer;
window.rebuildAllVaults = rebuildAllVaults;
