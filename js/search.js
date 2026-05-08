/**
 * search.js — 搜索逻辑 + 结果渲染
 * 对接 knowledge-search-tool-server REST API
 */

// API 配置
const API_BASE_URL = window.KB_API_BASE || 'http://localhost:8000';
// 搜索本身很快，但带 LLM 总结时可能需要 2-5 分钟
// 通过 API 动态获取超时时间
let API_TIMEOUT_MS = 300000;  // 默认 5 分钟（考虑 LLM 总结）

// 快捷标签
const QUICK_TAGS = ['React', 'TypeScript', '微服务', '数据库', 'Docker', 'AI', '安全', 'GraphQL'];

// 搜索设置（用户可配置）— 挂载到 window 供 admin.js 同步
let searchSettings = {
  dedupMode: 'file',  // 'file' | 'none'
  summarize: false,
  webSupplement: false,
};
window.searchSettings = searchSettings;

// 缓存搜索结果（用于详情面板）— 挂载到 window 供 detail.js 访问
let lastSearchResults = window.lastSearchResults = [];

/**
 * 调用后端搜索 API
 */
async function searchAPI(query, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // 明确判断 summarize/web_supplement：
  // - 如果 options 中显式传了 true/false，用 options 的值
  // - 否则用 searchSettings 中的值（已被 admin.js 异步同步为后端配置）
  const summarize = (options.summarize !== undefined) ? options.summarize : searchSettings.summarize;
  const webSupplement = (options.web_supplement !== undefined) ? options.web_supplement : searchSettings.webSupplement;
  const dedupMode = (options.dedup_mode !== undefined) ? options.dedup_mode : searchSettings.dedupMode;

  console.log(`[searchAPI] query="${query}" summarize=${summarize} webSupplement=${webSupplement} dedup=${dedupMode}`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        top_k: options.top_k || 5,
        summarize: summarize,
        web_supplement: webSupplement,
        dedup_mode: dedupMode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('搜索超时，请稍后重试');
    }
    throw error;
  }
}

/**
 * 将 API 响应转换为前端格式
 */
function adaptAPIToFrontend(apiResponse) {
  return apiResponse.results.map(item => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    category: item.category,
    categoryClass: getCategoryClass(item.category),
    tags: item.tags || [],
    source: item.source || item.file_path.split('/').pop(),
    score: Math.round((item.score || 0) * 100),
    matchScore: Math.round((item.score || 0) * 100),
    match_type: item.match_type || 'hybrid',
    preview: item.preview || item.summary,
    file_path: item.file_path,
    full_text: item.full_text || '',
  }));
}

/**
 * 根据分类名获取 CSS class
 */
function getCategoryClass(category) {
  const map = {
    'DevOps': '',
    '安全': 'amber',
    '架构': 'amber',
    'AI': 'amber',
    'ML': 'amber',
    '后端': 'magenta',
    '前端': '',
    '数据库': 'purple',
  };
  return map[category] || '';
}

/**
 * 高亮匹配关键词
 */
function highlightMatches(text, query) {
  if (!query) return text;
  const terms = query.split(/\s+/).filter(Boolean);
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<span class="match">$1</span>');
  }
  return result;
}

/**
 * 渲染搜索结果
 */
function renderResults(results, query, apiResponse) {
  const grid = document.getElementById('results-grid');
  const loading = document.getElementById('loading-container');
  const emptyState = document.getElementById('empty-state');
  const resultsSection = document.getElementById('results-section');
  const resultsCount = document.getElementById('results-count');

  // 隐藏加载
  loading.classList.remove('active');

  // 搜索完成，停止流光效果
  if (typeof window.stopSearchBoost === 'function') {
    window.stopSearchBoost();
  }

  if (results.length === 0) {
    resultsSection.style.display = 'block';
    grid.innerHTML = '';
    emptyState.classList.add('active');
    resultsCount.innerHTML = `搜索完成 · <span class="highlight">0</span> 条结果`;
    lastSearchResults = window.lastSearchResults = [];
    // 清除总结区域
    renderSummary(null, null);
    return;
  }

  emptyState.classList.remove('active');
  const elapsed = apiResponse ? apiResponse.elapsed_ms || 0 : 0;
  const dedupedCount = apiResponse ? (apiResponse.deduped_count || 0) : 0;
  let countText = `搜索完成 · <span class="highlight">${results.length}</span> 条结果 · 耗时 ${elapsed}ms`;
  if (dedupedCount > 0) {
    countText += ` · 去重 <span class="highlight">${dedupedCount}</span> 条`;
  }
  resultsCount.innerHTML = countText;

  // ===== 宇宙探索模式：星球渲染 =====
  const isExplore = typeof window.isExploreModeActive === 'function' && window.isExploreModeActive();

  if (isExplore) {
    grid.innerHTML = renderPlanetCards(results, query);
  } else {
    grid.innerHTML = results.map((item, index) => `
    <div class="result-card" data-item-id="${item.id}" style="animation-delay: ${index * 0.08}s; cursor: pointer;">
      <div class="card-header">
        <span class="card-category ${item.categoryClass}">${item.category}</span>
        <span class="card-id">${item.id}</span>
      </div>
      <h3 class="card-title">${highlightMatches(item.title, query)}</h3>
      <p class="card-summary">${highlightMatches(item.summary, query)}</p>
      <div class="card-tags">
        ${item.tags.map(tag => `<span class="card-tag">${tag}</span>`).join('')}
      </div>
      <div class="card-footer">
        <span class="card-source">
          <span class="source-dot"></span>
          ${item.source}
        </span>
        <span class="card-score">${item.matchScore}%</span>
      </div>
    </div>
  `).join('');
  }

  // 缓存结果供详情面板使用
  lastSearchResults = window.lastSearchResults = results;

  // 3D 倾斜效果 + 点击打开详情
  initCardTiltAndClick(results);

  // 渲染 LLM 总结
  if (apiResponse) {
    renderSummary(apiResponse.summary, apiResponse.query);
  }
}

/**
 * 渲染星球卡片（宇宙探索模式）
 */
function renderPlanetCards(results, query) {
  // 星球颜色方案
  const planetColors = [
    { light: '#4a9eff', mid: '#1a3a8a', dark: '#0a1530', glow: 'rgba(74, 158, 255, 0.4)' },   // 蓝
    { light: '#ff6b9d', mid: '#8a1a4a', dark: '#300a15', glow: 'rgba(255, 107, 157, 0.4)' },  // 粉
    { light: '#7bff6b', mid: '#1a8a2a', dark: '#0a3010', glow: 'rgba(123, 255, 107, 0.4)' },  // 绿
    { light: '#ffd76b', mid: '#8a6a1a', dark: '#30250a', glow: 'rgba(255, 215, 107, 0.4)' },  // 金
    { light: '#ff6bff', mid: '#8a1a8a', dark: '#300a30', glow: 'rgba(255, 107, 255, 0.4)' },  // 紫
    { light: '#6bffff', mid: '#1a8a8a', dark: '#0a3030', glow: 'rgba(107, 255, 255, 0.4)' },  // 青
    { light: '#ff9e6b', mid: '#8a4a1a', dark: '#301a0a', glow: 'rgba(255, 158, 107, 0.4)' },  // 橙
    { light: '#c76bff', mid: '#5a1a8a', dark: '#200a30', glow: 'rgba(199, 107, 255, 0.4)' },  // 薰衣草
  ];

  return results.map((item, index) => {
    const color = planetColors[index % planetColors.length];
    const hasRing = Math.random() > 0.5;
    const ringColor = color.glow;
    const summaryShort = item.summary ? item.summary.substring(0, 100) + (item.summary.length > 100 ? '...' : '') : '';
    const tagsHtml = item.tags.slice(0, 3).map(t => `<span style="display:inline-block;background:rgba(0,240,255,0.1);border:1px solid rgba(0,240,255,0.2);padding:2px 8px;border-radius:10px;font-size:0.7rem;margin:2px;color:var(--cyan-glow);">${t}</span>`).join('');

    return `
    <div class="result-card ${hasRing ? 'has-ring' : ''}" data-item-id="${item.id}" style="
      animation-delay: ${index * 0.12}s;
      cursor: pointer;
      position: relative;
      width: 160px;
      height: 160px;
      --planet-light: ${color.light};
      --planet-mid: ${color.mid};
      --planet-dark: ${color.dark};
      --planet-glow: ${color.glow};
      --ring-color: ${ringColor};
    ">
      <!-- 星球球体 — 默认线框旋转，hover显示真实颜色 -->
      <div class="planet-sphere"></div>
      <!-- 星球光环（::after 伪元素，has-ring 时显示） -->

      <!-- 星球名称 -->
      <span class="card-title" style="
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 0.8rem;
        font-family: 'Rajdhani', sans-serif;
        color: var(--text-primary);
        text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
        z-index: 5;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      ">${item.title}</span>

      <!-- Hover 信息气泡 -->
      <div class="planet-tooltip">
        <div class="planet-tooltip-title">${item.title}</div>
        <div class="planet-tooltip-summary">${summaryShort}</div>
        <div class="planet-tooltip-tags">${tagsHtml}</div>
        <div class="planet-tooltip-meta" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,240,255,0.1);">
          <span style="font-size:0.7rem;color:var(--text-secondary);">${item.category}</span>
          <span style="font-size:0.7rem;color:var(--cyan-glow);">匹配 ${item.matchScore}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * 渲染 LLM 总结区域
 */
function renderSummary(summary, query) {
  // 查找或创建总结容器
  let summaryContainer = document.getElementById('summary-container');
  const grid = document.getElementById('results-grid');

  if (!summaryContainer) {
    summaryContainer = document.createElement('div');
    summaryContainer.id = 'summary-container';
    summaryContainer.style.cssText = `
      margin-top: 2rem;
      background: rgba(0, 255, 255, 0.03);
      border: 1px solid rgba(0, 255, 255, 0.15);
      border-radius: 12px;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
    `;
    grid.after(summaryContainer);
  }

  if (!summary || summary.trim().length === 0) {
    summaryContainer.innerHTML = '';
    return;
  }

  // 判断是否为 fallback（纯文本摘要）
  const isFallback = summary.startsWith('## 搜索:');
  const methodLabel = isFallback ? '📝 摘要' : '🤖 AI 总结';
  const methodHint = isFallback
    ? '<span style="color: #ff9800; font-size: 0.75rem; margin-left: 0.5rem;">LLM 服务不可用，显示纯文本摘要（请在 ⚙ SETTINGS 中配置 LLM）</span>'
    : '<span style="color: #4caf50; font-size: 0.75rem; margin-left: 0.5rem;">由大模型生成</span>';

  // 使用 marked 渲染 Markdown
  const renderedContent = (typeof marked !== 'undefined')
    ? marked.parse(summary)
    : summary.replace(/\n/g, '<br>');

  summaryContainer.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
      <span style="font-size: 0.9rem; font-weight: 600; color: var(--accent, #00ffff);">${methodLabel}</span>
      ${methodHint}
    </div>
    <div style="font-size: 0.9rem; line-height: 1.7; color: var(--text-primary, #e0e0e0);">
      ${renderedContent}
    </div>
  `;
}

/**
 * 3D 卡片倾斜效果 + 点击打开详情
 * 
 * 点击：使用事件委托（只绑定一次到 grid 上）
 * 倾斜：每次渲染后绑定到新卡片
 */
let cardClickBound = false;  // 标记是否已绑定 grid 点击事件

function initCardTiltAndClick(results) {
  const grid = document.getElementById('results-grid');
  if (!grid) return;

  // 点击事件委托 — 只绑定一次
  if (!cardClickBound) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.result-card');
      if (!card) return;
      e.stopPropagation();

      const cardId = (card.dataset.itemId || '').trim();
      console.log(`[card click] cardId="${cardId}", lastSearchResults=${window.lastSearchResults ? window.lastSearchResults.length : 0}`);

      // 从 window.lastSearchResults 查找（最可靠的数据源）
      const items = window.lastSearchResults || [];
      const item = items.find(r => r.id === cardId);

      console.log(`[card click] item=${item ? item.title : 'NOT FOUND'}, openDetailPanel=${typeof window.openDetailPanel === 'function'}`);

      if (item && typeof window.openDetailPanel === 'function') {
        window.openDetailPanel(item, items);
      } else if (!item) {
        console.warn('[card click] item not found for id:', cardId, 'available ids:', items.map(r => r.id));
      } else {
        console.warn('[card click] window.openDetailPanel not available');
      }
    });
    cardClickBound = true;
    console.log('[initCardTiltAndClick] grid click delegate bound (one-time)');
  }

  // 3D 倾斜效果 — 每次渲染绑定到新卡片
  console.log(`[initCardTiltAndClick] binding tilt to ${document.querySelectorAll('.result-card').length} cards`);
  document.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      card.style.setProperty('--mouse-x', `${x}%`);
      card.style.setProperty('--mouse-y', `${y}%`);

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rotateX = ((e.clientY - centerY) / (rect.height / 2)) * -3;
      const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 3;

      card.style.transform = `translateY(-8px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(15px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/**
 * 显示错误状态
 */
function showError(message) {
  const grid = document.getElementById('results-grid');
  const loading = document.getElementById('loading-container');
  const emptyState = document.getElementById('empty-state');
  const resultsSection = document.getElementById('results-section');
  const resultsCount = document.getElementById('results-count');

  loading.classList.remove('active');
  resultsSection.style.display = 'block';
  grid.innerHTML = '';
  emptyState.classList.remove('active');

  // 显示错误卡片
  grid.innerHTML = `
    <div class="result-card" style="animation-delay: 0s; border-color: var(--danger);">
      <div class="card-header">
        <span class="card-category amber">错误</span>
      </div>
      <h3 class="card-title">搜索失败</h3>
      <p class="card-summary">${message}</p>
      <div class="card-tags">
        <span class="card-tag">请检查后端服务是否运行</span>
        <span class="card-tag">${API_BASE_URL}</span>
      </div>
    </div>
  `;
  resultsCount.innerHTML = `搜索失败`;
}

/**
 * 执行搜索（对接 API）
 */
async function performSearch(query) {
  const loading = document.getElementById('loading-container');
  const resultsSection = document.getElementById('results-section');
  const emptyState = document.getElementById('empty-state');

  if (!query || query.trim().length === 0) {
    resultsSection.style.display = 'none';
    return;
  }

 resultsSection.style.display = 'block';
  emptyState.classList.remove('active');
  loading.classList.add('active');

  // 宇宙探索模式：搜索加速飞行
  if (typeof window.triggerSearchBoost === 'function') {
    window.triggerSearchBoost();
  }

  try {
    const apiResponse = await searchAPI(query, { top_k: 10 });
    const results = adaptAPIToFrontend(apiResponse);
    renderResults(results, query, apiResponse);
  } catch (error) {
    console.error('搜索失败:', error);
    showError(error.message);
  }
}

/**
 * 初始化
 */
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const quickTagsContainer = document.getElementById('quick-tags');
  const resultsSection = document.getElementById('results-section');

  // 渲染快捷标签
  if (quickTagsContainer) {
    quickTagsContainer.innerHTML = QUICK_TAGS.map(tag => 
      `<span class="quick-tag" data-query="${tag}">${tag}</span>`
    ).join('');

    // 快捷标签点击
    quickTagsContainer.addEventListener('click', (e) => {
      const tag = e.target.closest('.quick-tag');
      if (tag) {
        searchInput.value = tag.dataset.query;
        searchInput.focus();
        performSearch(tag.dataset.query);
      }
    });
  }

  // 搜索按钮
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      performSearch(searchInput.value);
    });
  }

  // 回车搜索
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch(searchInput.value);
      }
    });

    // 实时搜索（防抖）
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (searchInput.value.trim().length >= 2) {
          performSearch(searchInput.value);
        }
      }, 500);  // 增加防抖时间，避免 API 频繁请求
    });
  }

  // 初始隐藏结果区
  if (resultsSection) {
    resultsSection.style.display = 'none';
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSearch };
}
