/**
 * detail.js — 详情页（侧边抽屉面板）
 * 
 * 功能：
 * - 点击卡片打开详情面板
 * - 展示完整文档信息（标题/标签/摘要/正文/相关文档）
 * - 收藏功能（localStorage 持久化）
 * - ESC / 遮罩层关闭
 * - 相关文档点击切换
 * - 原文按钮：加载完整文档内容（Markdown → HTML）
 */

// API 配置（search.js 已声明，这里只使用）
// const API_BASE_URL = window.KB_API_BASE || 'http://localhost:8000';

// 配置 marked
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
  });
}

/**
 * Markdown → HTML 转换
 */
function markdownToHTML(md) {
  if (typeof marked !== 'undefined') {
    return marked.parse(md);
  }
  // fallback: 简单换行处理
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
}

/**
 * 通用 fallback 内容
 */
function generateGenericContent(item) {
  return `
    <h4>概述</h4>
    <p>${item.summary}</p>
    
    <h4>核心要点</h4>
    <ul>
      ${item.tags.map(tag => `<li>${tag} 相关最佳实践与技术方案</li>`).join('')}
    </ul>
    
    <h4>适用场景</h4>
    <p>本文档适用于 <strong>${item.category}</strong> 领域的技术选型、架构设计与工程实践参考。</p>
    
    <h4>延伸阅读</h4>
    <p>建议结合相关文档深入学习，关注官方文档和社区最新实践。</p>
  `;
}

/**
 * 查找相关文档
 */
function findRelatedDocuments(item, allItems) {
  return allItems
    .filter(i => i.id !== item.id && (
      i.category === item.category ||
      i.tags.some(t => item.tags.includes(t))
    ))
    .slice(0, 4);
}

/**
 * 通过 API 获取完整文档内容
 */
async function fetchFullDocument(file_path) {
  const contentEl = document.getElementById('detail-content');
  const sectionTitle = contentEl.closest('.detail-section').querySelector('.detail-section-title');
  
  contentEl.innerHTML = '<div class="loading" style="text-align:center;padding:2rem;"><div class="loading-ring" style="margin:0 auto;"></div><div class="loading-text">LOADING DOCUMENT...</div></div>';
  sectionTitle.textContent = '📄 完整原文';

  try {
    const res = await fetch(`${API_BASE_URL}/api/document/${encodeURIComponent(file_path)}`);
    const data = await res.json();

    if (data.error) {
      contentEl.innerHTML = `<p style="color: var(--danger);">❌ ${data.error}</p>`;
      return;
    }

    const sizeKB = (data.size_bytes / 1024).toFixed(1);
    sectionTitle.textContent = `📄 完整原文 (${sizeKB} KB)`;
    contentEl.innerHTML = markdownToHTML(data.content);

    // 更新按钮状态
    const externalBtn = document.getElementById('detail-external-btn');
    if (externalBtn) {
      externalBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
        已展开原文
      `;
      externalBtn.classList.remove('primary');
    }
  } catch (err) {
    contentEl.innerHTML = `<p style="color: var(--danger);">❌ 加载失败: ${err.message}</p>`;
  }
}

/**
 * 打开详情面板
 */
function openDetail(item, allItems) {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-overlay');

  // 填充数据
  document.getElementById('detail-title').textContent = item.title;
  document.getElementById('detail-category').textContent = item.category;
  document.getElementById('detail-category').className = `card-category ${item.categoryClass || ''}`;
  document.getElementById('detail-id').textContent = item.id;
  document.getElementById('detail-source').textContent = item.source;
  document.getElementById('detail-score').textContent = `${item.matchScore || item.score}%`;
  document.getElementById('detail-summary').textContent = item.summary;
  document.getElementById('detail-date').textContent = '2026-04-15';

  // 标签
  const tagsContainer = document.getElementById('detail-tags');
  tagsContainer.innerHTML = item.tags.map(tag =>
    `<span class="detail-tag">${tag}</span>`
  ).join('');

  // 正文内容 — 优先使用 full_text（后端已返回的完整内容）
  const contentEl = document.getElementById('detail-content');
  const sectionTitle = contentEl.closest('.detail-section').querySelector('.detail-section-title');
  sectionTitle.textContent = '文档内容';

  if (item.full_text && item.full_text.trim().length > 0) {
    contentEl.innerHTML = markdownToHTML(item.full_text);
  } else {
    contentEl.innerHTML = generateGenericContent(item);
  }

  // 相关文档
  const related = findRelatedDocuments(item, allItems);
  const relatedList = document.getElementById('related-list');
  if (related.length > 0) {
    relatedList.innerHTML = related.map(r => `
      <div class="related-item" data-id="${r.id}">
        <span class="related-item-icon"></span>
        <div class="related-item-info">
          <div class="related-item-title">${r.title}</div>
          <div class="related-item-cat">${r.category} · ${r.id}</div>
        </div>
        <span class="related-item-arrow">→</span>
      </div>
    `).join('');

    // 相关文档点击 → 切换详情
    relatedList.addEventListener('click', (e) => {
      const relatedItem = e.target.closest('.related-item');
      if (relatedItem) {
        const nextItem = allItems.find(i => i.id === relatedItem.dataset.id);
        if (nextItem) {
          document.querySelector('.detail-body').scrollTop = 0;
          openDetail(nextItem, allItems);
        }
      }
    });
  } else {
    relatedList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; opacity: 0.5;">暂无相关文档</p>';
  }

  // 收藏状态
  const bookmarkBtn = document.getElementById('detail-bookmark-btn');
  const bookmarks = JSON.parse(localStorage.getItem('nexus-bookmarks') || '[]');
  if (bookmarks.includes(item.id)) {
    bookmarkBtn.classList.add('bookmarked');
    bookmarkBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 3l14 9-7 5-7-5z" fill="currentColor"/>
      </svg>
      已收藏
    `;
  } else {
    bookmarkBtn.classList.remove('bookmarked');
    bookmarkBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 3l14 9-7 5-7-5z" fill="currentColor"/>
      </svg>
      收藏
    `;
  }

  // 原文按钮 — 重置状态
  const externalBtn = document.getElementById('detail-external-btn');
  if (externalBtn) {
    externalBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      原文
    `;
    externalBtn.classList.add('primary');
  }

  // 显示面板
  overlay.classList.add('active');
  panel.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * 关闭详情面板
 */
function closeDetail() {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-overlay');
  overlay.classList.remove('active');
  panel.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * 切换收藏
 */
function toggleBookmark(item) {
  const bookmarks = JSON.parse(localStorage.getItem('nexus-bookmarks') || '[]');
  const btn = document.getElementById('detail-bookmark-btn');

  if (bookmarks.includes(item.id)) {
    const index = bookmarks.indexOf(item.id);
    bookmarks.splice(index, 1);
    btn.classList.remove('bookmarked');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 3l14 9-7 5-7-5z" fill="currentColor"/>
      </svg>
      收藏
    `;
  } else {
    bookmarks.push(item.id);
    btn.classList.add('bookmarked');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 3l14 9-7 5-7-5z" fill="currentColor"/>
      </svg>
      已收藏
    `;
  }

  localStorage.setItem('nexus-bookmarks', JSON.stringify(bookmarks));
}

/**
 * 初始化详情面板
 */
function initDetail() {
  // 关闭按钮
  const closeBtn = document.getElementById('detail-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeDetail);

  // 遮罩层点击关闭
  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.addEventListener('click', closeDetail);

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  // 收藏按钮
  const bookmarkBtn = document.getElementById('detail-bookmark-btn');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', () => {
      const itemId = document.getElementById('detail-id').textContent;
      const item = window.lastSearchResults?.find(i => i.id === itemId);
      if (item) toggleBookmark(item);
    });
  }

  // 原文按钮 — 加载完整文档
  const externalBtn = document.getElementById('detail-external-btn');
  if (externalBtn) {
    externalBtn.addEventListener('click', () => {
      const itemId = document.getElementById('detail-id').textContent;
      const item = window.lastSearchResults?.find(i => i.id === itemId);

      if (item && item.file_path) {
        fetchFullDocument(item.file_path);
      } else {
        alert('无法获取文档路径');
      }
    });
  }
}

/**
 * 暴露 openDetail 给 search.js 调用
 */
if (typeof window !== 'undefined') {
  window.openDetailPanel = openDetail;
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initDetail, openDetail, closeDetail };
}
