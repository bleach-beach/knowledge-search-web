/**
 * navigation-butler.js — AI 女管家（导航模式）
 *
 * 星际争霸科技风格：
 * - 六边形头像，青色辉光，脉冲动画
 * - 点击头像切换打开/关闭聊天面板
 * - 关闭按钮仅隐藏面板，不关闭导航模式
 * - 支持多轮对话 + 知识库搜索上下文
 * - 导航模式叠加在普通模式/宇宙飞船探索模式之上
 * - 头像支持后台自定义配置
 */

// ===== 状态 =====
let isNavigationMode = false;
let isChatOpen = false;        // 面板是否打开
let chatHistory = [];          // 多轮对话历史
let isChatting = false;
let avatarVisible = true;      // 头像是否可见

// ===== 配置（支持后台自定义） =====
const BUTLER_CONFIG = {
  // apiBase 统一使用后端基础URL（不含/api前缀），所有API路径使用完整路径
  apiBase: window.NEXUS_API_BASE
    || localStorage.getItem('nexus-butler-api')
    || 'http://localhost:8000',
  // 优先使用后台上传的 base64 图片，否则使用 URL 配置，最后 fallback 到默认图片
  avatarImage: window.NEXUS_AVATAR_IMAGE
    || localStorage.getItem('nexus-butler-avatar-base64')
    || '',
  avatarSize: 64,
  maxHistory: 10,
  topK: 5,
};

// ===== 初始化 =====
function initNavigationButler() {
  createButlerAvatar();
  createChatPanel();
  bindButlerEvents();
  // 页面加载后从后端获取最新头像配置
  setTimeout(refreshButlerAvatar, 1000);
  // 恢复状态
  const saved = localStorage.getItem('nexus-navigation-mode');
  if (saved === '1') {
    isNavigationMode = true;
    document.body.classList.add('navigation-mode');
    const savedOpen = localStorage.getItem('nexus-chat-open');
    if (savedOpen === '1') {
      isChatOpen = true;
    }
  }
  // 恢复头像可见性
  const avatarHidden = localStorage.getItem('nexus-avatar-hidden');
  if (avatarHidden === '1') {
    avatarVisible = false;
    document.getElementById('butler-avatar').style.display = 'none';
  }
}

// ===== 创建AI女管家头像 =====
// 内联默认 SVG 头像（当没有自定义头像时显示）
const DEFAULT_AVATAR_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="defGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="100%" stop-color="#0060ff"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#defGrad)" opacity="0.15"/>
  <circle cx="32" cy="26" r="10" fill="none" stroke="#00f0ff" stroke-width="2"/>
  <path d="M18 52 Q18 40, 32 40 Q46 40, 46 52" fill="none" stroke="#00f0ff" stroke-width="2"/>
  <circle cx="32" cy="26" r="4" fill="#00f0ff" opacity="0.6"/>
</svg>`;

function createButlerAvatar() {
  const avatar = document.createElement('div');
  avatar.className = 'butler-avatar';
  avatar.id = 'butler-avatar';
  avatar.title = 'NEXUS 智能管家 — 点击对话';
  
  // 确定初始头像源：优先使用后端返回的完整URL，否则使用内联SVG
  let initialSrc = '';
  const savedBase64 = localStorage.getItem('nexus-butler-avatar-base64');
  const savedUrl = localStorage.getItem('nexus-butler-avatar-url');
  if (savedBase64) {
    initialSrc = savedBase64;
  } else if (savedUrl) {
    initialSrc = resolveAvatarUrl(savedUrl);
  }
  
  const imgHtml = initialSrc
    ? `<img src="${initialSrc}" alt="NEXUS AI" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="handleButlerAvatarError(this)" id="butler-avatar-img"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0a1628,#0d2240);" id="butler-avatar-fallback">${DEFAULT_AVATAR_SVG}</div>`;
  
  avatar.innerHTML = `
    <!-- 外层六边形辉光 -->
    <div class="butler-hex-glow"></div>
    <!-- 六边形边框 -->
    <div class="butler-hex-border"></div>
    <!-- 头像背景（使用自定义图片） -->
    <div class="butler-avatar-bg" style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); overflow: hidden;">
      ${imgHtml}
    </div>
    <!-- 扫描线 -->
    <div class="butler-scanline"></div>
    <!-- 状态指示灯 -->
    <div class="butler-status-dot"></div>
    <!-- 脉冲环 -->
    <div class="butler-pulse-ring"></div>
    <!-- 标签 -->
    <div class="butler-label">NEXUS AI</div>
  `;
  document.body.appendChild(avatar);
}

// ===== 将相对头像URL转为绝对URL =====
function resolveAvatarUrl(url) {
  if (!url) return '';
  // 已经是完整URL
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // 相对路径，拼上后端基础URL
  const base = BUTLER_CONFIG.apiBase || 'http://localhost:8000';
  // 确保 base 不以 / 结尾，url 以 / 开头
  const cleanBase = base.replace(/\/$/, '');
  const cleanUrl = url.startsWith('/') ? url : '/' + url;
  return cleanBase + cleanUrl;
}

// ===== 头像加载失败处理（保留渐变背景 + 显示SVG） =====
function handleButlerAvatarError(imgEl) {
  imgEl.style.display = 'none';
  const parent = imgEl.parentElement;
  // 设置渐变背景（不再清除）
  parent.style.background = 'linear-gradient(135deg, #0a1628 0%, #0d2240 50%, #0a1628 100%)';
  // 插入默认SVG
  const fallback = document.createElement('div');
  fallback.id = 'butler-avatar-fallback';
  fallback.innerHTML = DEFAULT_AVATAR_SVG;
  fallback.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
  parent.appendChild(fallback);
}

// ===== 动态刷新头像（从后端获取最新配置） =====
async function refreshButlerAvatar() {
  const apiBase = BUTLER_CONFIG.apiBase.replace(/\/api$/, ''); // e.g. http://localhost:8000
  try {
    const res = await fetch(`${apiBase}/api/admin/ai-assistant?t=${Date.now()}`);
    if (!res.ok) {
      console.warn('[butler] 获取AI管家配置失败，使用本地缓存');
      return;
    }
    const config = await res.json();
    const avatarUrl = config.avatar_url || '';
    const nickname = config.nickname || 'NEXUS';

    // 更新 localStorage（存储原始相对路径，由 resolveAvatarUrl 处理）
    if (avatarUrl) {
      localStorage.setItem('nexus-butler-avatar-url', avatarUrl);
    }

    // 更新头像图片（添加时间戳防止浏览器缓存）
    const avatarImg = document.getElementById('butler-avatar-img');
    if (avatarImg && avatarUrl) {
      const fullUrl = resolveAvatarUrl(avatarUrl);
      const cacheBustedUrl = fullUrl.includes('?') ? `${fullUrl}&t=${Date.now()}` : `${fullUrl}?t=${Date.now()}`;
      avatarImg.src = cacheBustedUrl;
      BUTLER_CONFIG.avatarImage = cacheBustedUrl;
      
      // 移除可能存在的 fallback SVG（如果之前是 fallback 状态）
      const existingFallback = document.getElementById('butler-avatar-fallback');
      if (existingFallback) {
        existingFallback.remove();
      }
      avatarImg.style.display = 'block';
    } else if (!avatarUrl) {
      // 后端没有头像，显示默认SVG
      const avatarImg = document.getElementById('butler-avatar-img');
      if (avatarImg) avatarImg.style.display = 'none';
      let fallback = document.getElementById('butler-avatar-fallback');
      if (!fallback) {
        const bgDiv = document.querySelector('.butler-avatar-bg');
        if (bgDiv) {
          fallback = document.createElement('div');
          fallback.id = 'butler-avatar-fallback';
          fallback.innerHTML = DEFAULT_AVATAR_SVG;
          fallback.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0a1628,#0d2240);';
          bgDiv.appendChild(fallback);
        }
      }
    }

    // 更新昵称标签
    const label = document.querySelector('.butler-label');
    if (label) label.textContent = nickname + ' AI';

    // 更新面板标题
    const panelTitle = document.querySelector('.butler-panel-title span');
    if (panelTitle) panelTitle.textContent = nickname + ' 智能管家';

    console.log('[butler] 头像已刷新:', avatarUrl || '(无头像，显示默认SVG)');

  } catch (err) {
    console.warn('[butler] 刷新头像失败:', err.message);
  }
}

// 暴露全局刷新函数
window.refreshButlerAvatar = refreshButlerAvatar;

// ===== 创建聊天面板 =====
function createChatPanel() {
  const panel = document.createElement('div');
  panel.className = 'butler-chat-panel';
  panel.id = 'butler-chat-panel';
  panel.style.display = 'none';  // 初始隐藏
  panel.innerHTML = `
    <!-- 面板头部 -->
    <div class="butler-panel-header">
      <div class="butler-panel-title">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <circle cx="12" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <path d="M6 20 Q6 14, 12 14 Q18 14, 18 20" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>NEXUS 智能管家</span>
      </div>
      <div class="butler-panel-actions">
        <button class="butler-btn-close" id="butler-close-btn" title="关闭">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="butler-messages" id="butler-messages">
      <!-- 欢迎消息 -->
      <div class="butler-message butler-message-ai">
        <div class="butler-msg-avatar">
          <svg viewBox="0 0 32 32" width="24" height="24">
            <circle cx="16" cy="16" r="12" fill="none" stroke="#00f0ff" stroke-width="1.5"/>
            <circle cx="16" cy="16" r="4" fill="#00f0ff" opacity="0.8"/>
          </svg>
        </div>
        <div class="butler-msg-content">
          <div class="butler-msg-bubble">
            <div class="butler-msg-text">
              👋 你好！我是 NEXUS 智能管家。<br/>
              我可以基于你的知识库回答问题，也可以进行通用对话。<br/>
              试试问我问题吧！
            </div>
          </div>
          <div class="butler-msg-time"></div>
        </div>
      </div>
    </div>

    <!-- 思考动画（加载中） -->
    <div class="butler-thinking" id="butler-thinking" style="display:none;">
      <div class="butler-thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="butler-thinking-text">AI 正在思考...</span>
    </div>

    <!-- 输入区域 -->
    <div class="butler-input-area" id="butler-input-area">
      <div class="butler-input-wrapper">
        <input
          type="text"
          class="butler-input"
          id="butler-input"
          placeholder="输入你的问题..."
          autocomplete="off"
        />
        <button class="butler-send-btn" id="butler-send-btn" title="发送">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div class="butler-input-hint">
        Enter 发送 · 支持多轮对话 · 自动搜索知识库
      </div>
    </div>
  `;
  document.body.appendChild(panel);
}

// ===== 绑定事件 =====
function bindButlerEvents() {
  const avatar = document.getElementById('butler-avatar');
  const closeBtn = document.getElementById('butler-close-btn');
  const input = document.getElementById('butler-input');
  const sendBtn = document.getElementById('butler-send-btn');

  // 点击头像：切换导航模式 + 打开/关闭聊天面板
  // 注意：如果头像被拖拽了，click 会被 initDraggableButler 中的捕获阶段阻止
  avatar.addEventListener('click', () => {
    // 如果头像被隐藏，点击恢复
    if (!avatarVisible) {
      avatarVisible = true;
      avatar.style.display = '';
      localStorage.setItem('nexus-avatar-hidden', '0');
      return;
    }
    // 切换导航模式
    isNavigationMode = !isNavigationMode;
    document.body.classList.toggle('navigation-mode', isNavigationMode);
    localStorage.setItem('nexus-navigation-mode', isNavigationMode ? '1' : '0');
    // 切换聊天面板
    toggleChat();
  }, { passive: false });

  // 关闭按钮：仅关闭面板，不关闭导航模式和头像
  closeBtn.addEventListener('click', () => {
    isChatOpen = false;
    document.getElementById('butler-chat-panel').style.display = 'none';
    avatar.classList.remove('active');
    localStorage.setItem('nexus-chat-open', '0');
  });

  // 发送消息
  const send = () => {
    const text = input.value.trim();
    if (!text || isChatting) return;
    sendMessage(text);
    input.value = '';
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

// ===== 切换聊天面板 =====
function toggleChat() {
  isChatOpen = !isChatOpen;
  const panel = document.getElementById('butler-chat-panel');
  const avatar = document.getElementById('butler-avatar');
  if (panel && avatar) {
    if (isChatOpen) {
      // 打开面板
      panel.style.display = 'flex';
      // 使用 requestAnimationFrame 确保 display:flex 生效后添加 open class
      requestAnimationFrame(() => {
        panel.classList.add('open');
      });
      avatar.classList.add('active');
      localStorage.setItem('nexus-chat-open', '1');
      document.getElementById('butler-input')?.focus();
      scrollMessagesToBottom();
    } else {
      // 关闭面板
      panel.classList.remove('open');
      avatar.classList.remove('active');
      localStorage.setItem('nexus-chat-open', '0');
      // 动画结束后完全隐藏
      setTimeout(() => {
        if (!isChatOpen) {
          panel.style.display = 'none';
        }
      }, 350);
    }
  }
}

// ===== 发送消息 =====
async function sendMessage(question) {
  const messagesEl = document.getElementById('butler-messages');
  const thinkingEl = document.getElementById('butler-thinking');

  // 添加用户消息
  appendUserMessage(question);

  // 更新对话历史
  chatHistory.push({ role: 'user', content: question });

  // 显示思考动画
  thinkingEl.style.display = 'flex';
  scrollMessagesToBottom();
  isChatting = true;

  try {
    const payload = {
      question: question,
      history: chatHistory.slice(-BUTLER_CONFIG.maxHistory),
      search_context: true,
      top_k: BUTLER_CONFIG.topK,
    };

    const response = await fetch(`${BUTLER_CONFIG.apiBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    thinkingEl.style.display = 'none';

    appendAIMessage(data.answer, data.sources, data.has_search, data.elapsed_ms);

    chatHistory.push({ role: 'assistant', content: data.answer });

  } catch (error) {
    thinkingEl.style.display = 'none';
    appendAIMessage(
      `⚠️ 请求失败：${error.message}。请确保后端服务正在运行（默认端口 8000）。`,
      [],
      false,
      0
    );
  } finally {
    isChatting = false;
    scrollMessagesToBottom();
    document.getElementById('butler-input')?.focus();
  }
}

// ===== 添加用户消息到UI =====
function appendUserMessage(text) {
  const messagesEl = document.getElementById('butler-messages');
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const msgEl = document.createElement('div');
  msgEl.className = 'butler-message butler-message-user';
  msgEl.innerHTML = `
    <div class="butler-msg-content">
      <div class="butler-msg-bubble">
        <div class="butler-msg-text">${escapeHtml(text)}</div>
      </div>
      <div class="butler-msg-time">${time}</div>
    </div>
  `;
  messagesEl.appendChild(msgEl);
}

// ===== 添加AI消息到UI =====
function appendAIMessage(text, sources, hasSearch, elapsedMs) {
  const messagesEl = document.getElementById('butler-messages');
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  let sourcesHtml = '';
  if (sources && sources.length > 0) {
    sourcesHtml = `<div class="butler-sources">
      <div class="butler-sources-title">📚 参考来源（${sources.length} 条）</div>
      ${sources.slice(0, 5).map(s =>
        `<div class="butler-source-item">${escapeHtml(s.title)} <span class="butler-source-score">${(s.score * 100).toFixed(0)}%</span></div>`
      ).join('')}
    </div>`;
  } else if (hasSearch) {
    sourcesHtml = `<div class="butler-sources">
      <div class="butler-sources-hint">知识库中未找到相关内容，基于通用知识回答</div>
    </div>`;
  }

  const elapsedStr = elapsedMs > 0 ? `（${elapsedMs}ms）` : '';

  const msgEl = document.createElement('div');
  msgEl.className = 'butler-message butler-message-ai';
  msgEl.innerHTML = `
    <div class="butler-msg-avatar">
      <svg viewBox="0 0 32 32" width="24" height="24">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#00f0ff" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="4" fill="#00f0ff" opacity="0.8"/>
      </svg>
    </div>
    <div class="butler-msg-content">
      <div class="butler-msg-bubble">
        <div class="butler-msg-text">${formatMessage(text)}${elapsedStr}</div>
      </div>
      ${sourcesHtml}
      <div class="butler-msg-time">${time}</div>
    </div>
  `;
  messagesEl.appendChild(msgEl);
}

// ===== 格式化消息（简单Markdown） =====
function formatMessage(text) {
  text = escapeHtml(text);
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/`(.*?)`/g, '<code>$1</code>');
  text = text.replace(/\n/g, '<br/>');
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  text = text.replace(/(\d+)\. (.+)$/gm, '<li>$2</li>');
  return text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollMessagesToBottom() {
  const messagesEl = document.getElementById('butler-messages');
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// ===== 暴露全局API =====
window.isNavigationModeActive = () => isNavigationMode;
window.initNavigationButler = initNavigationButler;
window.toggleButlerChat = toggleChat;
window.BUTLER_CONFIG = BUTLER_CONFIG;

// ===== 页面加载后自动初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initNavigationButler();
    // 在 DOM 元素创建后延迟初始化拖拽功能
    setTimeout(initDraggableButler, 100);
  }, 500);
});

// ===== 拖拽功能：头像 + 聊天面板（移动距离阈值防冲突 + 状态类管理） =====
function initDraggableButler() {
  const avatar = document.getElementById('butler-avatar');
  const panel = document.getElementById('butler-chat-panel');
  if (!avatar || !panel) {
    console.warn('[butler] 拖拽初始化失败：butler-avatar 或 butler-chat-panel 不存在');
    return;
  }
  console.log('[butler] 拖拽功能已激活 ✅');

  // ---- 共享状态 ----
  const DRAG_THRESHOLD = 5; // 移动超过 5px 才判定为拖拽，否则视为点击
  let wasDragged = false;   // 是否发生了拖拽动作

  // ---- 头像拖拽 ----
  let avatarDragging = false;
  let avatarStartX, avatarStartY, avatarOriginX, avatarOriginY;

  // 恢复头像位置
  const savedAvatarPos = localStorage.getItem('nexus-avatar-position');
  if (savedAvatarPos) {
    const pos = JSON.parse(savedAvatarPos);
    avatar.style.bottom = 'auto';
    avatar.style.right = 'auto';
    avatar.style.top = pos.top + 'px';
    avatar.style.left = pos.left + 'px';
  }

  avatar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.butler-btn-close')) return;
    if (e.target.closest('.butler-resize-handle')) return;
    avatarDragging = true;
    wasDragged = false;
    avatarStartX = e.clientX;
    avatarStartY = e.clientY;
    const rect = avatar.getBoundingClientRect();
    avatarOriginX = rect.left;
    avatarOriginY = rect.top;
    avatar.style.transition = 'none';
    avatar.style.zIndex = '99999';
    e.preventDefault();
    e.stopPropagation();
  });

  // ---- 聊天面板拖拽（通过头部） ----
  let panelDragging = false;
  let panelStartX, panelStartY, panelOriginX, panelOriginY;

  // 恢复面板位置
  const savedPanelPos = localStorage.getItem('nexus-chat-panel-position');
  if (savedPanelPos) {
    const pos = JSON.parse(savedPanelPos);
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
  }

  const panelHeader = panel.querySelector('.butler-panel-header');
  if (panelHeader) {
    panelHeader.style.cursor = 'move';
    panelHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('.butler-panel-actions button')) return;
      if (e.target.closest('.butler-resize-handle')) return;
      panelDragging = true;
      wasDragged = false;
      panelStartX = e.clientX;
      panelStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      panelOriginX = rect.left;
      panelOriginY = rect.top;
      panel.style.transition = 'none';
      panel.style.zIndex = '99997';
      panel.classList.add('dragging');
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // ---- 聊天面板缩放（右下角拖拽） ----
  let panelResizing = false;
  let resizeStartX, resizeStartY, resizeStartW, resizeStartH;

  // 创建缩放手柄
  let resizeHandle = panel.querySelector('.butler-resize-handle');
  if (!resizeHandle) {
    resizeHandle = document.createElement('div');
    resizeHandle.className = 'butler-resize-handle';
    panel.appendChild(resizeHandle);
  }

  resizeHandle.addEventListener('mousedown', (e) => {
    panelResizing = true;
    wasDragged = false;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = panel.offsetWidth;
    resizeStartH = panel.offsetHeight;
    panel.style.transition = 'none';
    panel.classList.add('resizing');
    e.preventDefault();
    e.stopPropagation();
  });

  // ---- 全局鼠标移动 ----
  function handleGlobalMouseMove(e) {
    const dx = e.clientX;
    const dy = e.clientY;

    // 头像拖拽
    if (avatarDragging) {
      const adx = dx - avatarStartX;
      const ady = dy - avatarStartY;
      if (Math.abs(adx) > DRAG_THRESHOLD || Math.abs(ady) > DRAG_THRESHOLD) {
        wasDragged = true;
      }
      avatar.style.left = (avatarOriginX + adx) + 'px';
      avatar.style.top = (avatarOriginY + ady) + 'px';
      avatar.style.bottom = 'auto';
      avatar.style.right = 'auto';
    }

    // 面板拖拽
    if (panelDragging) {
      const pdx = dx - panelStartX;
      const pdy = dy - panelStartY;
      if (Math.abs(pdx) > DRAG_THRESHOLD || Math.abs(pdy) > DRAG_THRESHOLD) {
        wasDragged = true;
      }
      panel.style.left = (panelOriginX + pdx) + 'px';
      panel.style.top = (panelOriginY + pdy) + 'px';
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
    }

    // 面板缩放
    if (panelResizing) {
      const rdx = dx - resizeStartX;
      const rdy = dy - resizeStartY;
      if (Math.abs(rdx) > DRAG_THRESHOLD || Math.abs(rdy) > DRAG_THRESHOLD) {
        wasDragged = true;
      }
      const newW = Math.max(300, resizeStartW + rdx);
      const newH = Math.max(250, resizeStartH + rdy);
      panel.style.width = newW + 'px';
      panel.style.maxHeight = newH + 'px';
    }
  }

  // ---- 全局鼠标抬起 ----
  function handleGlobalMouseUp(e) {
    // 头像拖拽结束
    if (avatarDragging) {
      avatarDragging = false;
      avatar.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      avatar.style.zIndex = '9999';
      // 保存头像位置
      const rect = avatar.getBoundingClientRect();
      localStorage.setItem('nexus-avatar-position', JSON.stringify({
        top: rect.top,
        left: rect.left
      }));
    }

    // 面板拖拽结束
    if (panelDragging) {
      panelDragging = false;
      panel.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      panel.style.zIndex = '9998';
      panel.classList.remove('dragging');
      // 保存面板位置
      const rect = panel.getBoundingClientRect();
      localStorage.setItem('nexus-chat-panel-position', JSON.stringify({
        top: rect.top,
        left: rect.left
      }));
    }

    // 面板缩放结束
    if (panelResizing) {
      panelResizing = false;
      panel.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      panel.classList.remove('resizing');
      // 保存面板尺寸
      localStorage.setItem('nexus-chat-panel-size', JSON.stringify({
        width: panel.offsetWidth,
        maxHeight: panel.offsetHeight
      }));
    }

    // 如果 avatar 被拖拽了，阻止后续的 click 事件
    if (wasDragged && avatarDragging === false) {
      // 拖拽结束后清除标志
      wasDragged = false;
    }
  }

  // 使用捕获阶段监听 mousedown，确保优先于 main.js 的 click 处理
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);

  // ---- 防止拖拽时触发 click ----
  // 在 mousedown 和 mouseup 之间记录时间戳和距离
  const avatarMouseDownTime = { value: 0 };
  const avatarMousePos = { x: 0, y: 0 };

  avatar.addEventListener('mousedown', () => {
    avatarMouseDownTime.value = Date.now();
    avatarMousePos.x = null; // 重置
  }, true);

  avatar.addEventListener('mouseup', (e) => {
    if (wasDragged) {
      // 拖拽发生了，阻止 click
      e.stopImmediatePropagation();
      e.preventDefault();
      wasDragged = false;
    }
  }, true);
}

// ===== 恢复面板尺寸 =====
(function restorePanelSize() {
  const panel = document.getElementById('butler-chat-panel');
  if (!panel) return;
  const savedSize = localStorage.getItem('nexus-chat-panel-size');
  if (savedSize) {
    const size = JSON.parse(savedSize);
    panel.style.width = size.width + 'px';
    panel.style.maxHeight = size.maxHeight + 'px';
  }
})();
