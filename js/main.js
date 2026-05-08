/**
 * main.js — 页面初始化 + 宇宙探索模式
 */

// ===== 宇宙探索模式 =====
let isExploreMode = false;

// 飞船跟随鼠标
let shipX = window.innerWidth / 2;
let shipY = window.innerHeight / 2;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let mouseActive = false;
let mouseTimer = null;
let shipSpeed = 0;
let isSearching = false;
let targetRotation = 0;  // 目标旋转角度（朝向鼠标）
let currentRotation = 0; // 当前旋转角度（平滑插值）

// 尾迹粒子容器
let trailParticles = [];
const MAX_TRAIL = 60;

// ===== 推进粒子（飞船引擎尾部喷射） =====
let thrustParticles = [];
const MAX_THRUST = 40;

function toggleExploreMode() {
  isExploreMode = !isExploreMode;
  document.body.classList.toggle('explore-mode', isExploreMode);
  localStorage.setItem('nexus-explore-mode', isExploreMode ? '1' : '0');

  const toggleBtn = document.getElementById('mode-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = isExploreMode
      ? '<span class="stat-dot"></span> \ud83d\ude80 EXPLORE ON'
      : '<span class="stat-dot"></span> \ud83d\ude80 EXPLORE MODE';
  }

  if (window.particleSystem) {
    window.particleSystem.setExploreMode(isExploreMode);
  }

  if (window.lastSearchResults && window.lastSearchResults.length > 0) {
    const query = document.getElementById('search-input')?.value || '';
    renderResults(window.lastSearchResults, query, null);
  }

  if (isExploreMode) {
    startShipAnimation();
  }
}

function initExploreMode() {
  const saved = localStorage.getItem('nexus-explore-mode');
  if (saved === '1') {
    isExploreMode = true;
    document.body.classList.add('explore-mode');
    const toggleBtn = document.getElementById('mode-toggle');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<span class="stat-dot"></span> \ud83d\ude80 EXPLORE ON';
    }
  }

  const toggleBtn = document.getElementById('mode-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleExploreMode);
  }

  createLightStreams();

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseActive = true;

    if (mouseTimer) clearTimeout(mouseTimer);
    mouseTimer = setTimeout(() => {
      mouseActive = false;
    }, 2000);
  });

  if (isExploreMode) {
    startShipAnimation();
  }
}

// ===== 飞船动画循环 =====
let animFrameId = null;
let lastTrailTime = 0;
let lastThrustTime = 0;

function startShipAnimation() {
  if (animFrameId) return;
  animateShip();
}

function animateShip(timestamp) {
  const ship = document.getElementById('spaceship');
  const rotator = document.getElementById('ship-rotator');
  if (!ship || !isExploreMode) {
    animFrameId = null;
    return;
  }

  const lerpFactor = 0.03;
  const prevX = shipX;
  const prevY = shipY;

  if (mouseActive) {
    shipX += (mouseX - shipX) * lerpFactor;
    shipY += (mouseY - shipY) * lerpFactor;
  }

  shipSpeed = Math.sqrt((shipX - prevX) ** 2 + (shipY - prevY) ** 2);

  // 外层只负责位置
  ship.style.left = shipX + 'px';
  ship.style.top = shipY + 'px';

  // === \u57f9\u68481: \u8239\u5934\u671d\u5411\u9f20\u6807\u65b9\u5411\u65cb\u8f6c ===
  if (mouseActive && shipSpeed > 0.3) {
    const dx = mouseX - shipX;
    const dy = mouseY - shipY;
    targetRotation = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  } else if (!isSearching) {
    targetRotation = 0;
  }

  // \u5e73\u6ed1\u63d2\u503c\u65cb\u8f6c\uff08\u89d2\u5ea6\u77ed\u8def\u5f84\uff09
  let rotationDiff = targetRotation - currentRotation;
  while (rotationDiff > 180) rotationDiff -= 360;
  while (rotationDiff < -180) rotationDiff += 360;
  currentRotation += rotationDiff * 0.08;

  if (rotator) {
    rotator.style.transform = `rotate(${currentRotation}deg)`;
  }

  // === \u57f9\u68482: \u8239\u5c3e\u63a8\u8fdb\u7c92\u5b50 ===
  if (timestamp && timestamp - lastThrustTime > 30) {
    if (shipSpeed > 0.5 || isSearching) {
      createThrustParticle(shipX, shipY, currentRotation);
      lastThrustTime = timestamp;
    }
  }

  if (timestamp && timestamp - lastTrailTime > 50) {
    if (shipSpeed > 1 || isSearching) {
      createTrailParticle(shipX, shipY);
      lastTrailTime = timestamp;
    }
  }

  if (isSearching && timestamp && timestamp - lastTrailTime > 100) {
    createSearchLightStream();
    lastTrailTime = timestamp;
  }

  updateTrailParticles();
  updateThrustParticles();

  animFrameId = requestAnimationFrame(animateShip);
}

// ===== \u63a8\u8fdb\u7c92\u5b50\u2014\u5f15\u64ce\u5c3e\u90e8\u55b7\u5c04 =====
function createThrustParticle(x, y, rotation) {
  const overlay = document.getElementById('space-overlay');
  if (!overlay) return;

  if (thrustParticles.length >= MAX_THRUST) {
    const old = thrustParticles.shift();
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  // \u5f15\u64ce\u5c3e\u90e8\u4f4d\u7f6e\uff08\u8230\u8239\u9ed8\u8ba4\u5411\u4e0a\uff0c\u5c3e\u90e8\u5728\u4e0b\u65b935px\uff09
  const engineOffset = 35;
  const rad = (rotation - 90) * (Math.PI / 180);
  const engineX = x + Math.cos(rad) * engineOffset;
  const engineY = y + Math.sin(rad) * engineOffset;

  const particle = document.createElement('div');
  const size = 1.5 + Math.random() * 3;
  const hue = isSearching ? (180 + Math.random() * 60) : (170 + Math.random() * 40);
  const spread = 8 + Math.random() * 12;
  const offsetX = (Math.random() - 0.5) * spread;
  const offsetY = (Math.random() - 0.5) * spread;

  particle.className = 'thrust-particle';
  particle.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${engineX + offsetX}px;
    top: ${engineY + offsetY}px;
    background: hsl(${hue}, 100%, ${isSearching ? 80 : 65}%);
    border-radius: 50%;
    box-shadow: 0 0 ${size * 3}px hsl(${hue}, 100%, 50%), 0 0 ${size * 6}px hsl(${hue}, 100%, 40%);
    pointer-events: none;
    opacity: 0.9;
    z-index: 2;
  `;
  overlay.appendChild(particle);
  thrustParticles.push({ el: particle });

  requestAnimationFrame(() => {
    const life = isSearching ? 350 : 550;
    const drift = 12 + Math.random() * 18;
    const driftRad = rotation * (Math.PI / 180);
    particle.style.transition = `opacity ${life}ms ease, transform ${life}ms ease, left ${life}ms ease, top ${life}ms ease`;
    // \u7c92\u5b50\u5411\u5f15\u64ce\u53cd\u65b9\u5411\u6563\u5c04
    particle.style.left = (engineX + offsetX - Math.cos(driftRad) * drift) + 'px';
    particle.style.top = (engineY + offsetY - Math.sin(driftRad) * drift) + 'px';
    particle.style.opacity = '0';
    particle.style.transform = 'scale(0.1)';
  });

  setTimeout(() => {
    const idx = thrustParticles.findIndex(p => p.el === particle);
    if (idx >= 0) thrustParticles.splice(idx, 1);
    if (particle.parentNode) particle.parentNode.removeChild(particle);
  }, isSearching ? 400 : 650);
}

// ===== \u5c3e\u8ff9\u7c92\u5b50 =====
function createTrailParticle(x, y) {
  const overlay = document.getElementById('space-overlay');
  if (!overlay) return;

  if (trailParticles.length >= MAX_TRAIL) {
    const old = trailParticles.shift();
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  const particle = document.createElement('div');
  particle.className = 'trail-particle';
  const size = 2 + Math.random() * 4;
  const hue = isSearching ? (180 + Math.random() * 60) : (170 + Math.random() * 30);
  particle.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${x + (Math.random() - 0.5) * 30}px;
    top: ${y + (Math.random() - 0.5) * 30}px;
    background: hsl(${hue}, 100%, 70%);
    border-radius: 50%;
    box-shadow: 0 0 ${size * 2}px hsl(${hue}, 100%, 60%);
    pointer-events: none;
    opacity: 0.8;
    transition: opacity 0.8s ease, transform 0.8s ease;
    z-index: 2;
  `;
  overlay.appendChild(particle);
  trailParticles.push(particle);

  requestAnimationFrame(() => {
    particle.style.opacity = '0';
    particle.style.transform = `scale(${0.2 + Math.random() * 0.5})`;
  });

  setTimeout(() => {
    const idx = trailParticles.indexOf(particle);
    if (idx >= 0) trailParticles.splice(idx, 1);
    if (particle.parentNode) particle.parentNode.removeChild(particle);
  }, 800);
}

function updateTrailParticles() {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    if (!trailParticles[i].parentNode) trailParticles.splice(i, 1);
  }
}

function updateThrustParticles() {
  for (let i = thrustParticles.length - 1; i >= 0; i--) {
    if (!thrustParticles[i].el.parentNode) thrustParticles.splice(i, 1);
  }
}

// ===== \u6d41\u5149\u7c92\u5b50\u521d\u59cb\u5316 =====
function createLightStreams() {
  const container = document.getElementById('light-streams');
  if (!container) return;

  for (let i = 0; i < 5; i++) {
    const stream = document.createElement('div');
    stream.className = 'light-stream idle';
    stream.style.left = Math.random() * 100 + '%';
    stream.style.height = (60 + Math.random() * 100) + 'px';
    stream.style.opacity = '0';
    container.appendChild(stream);
  }
}

let searchStreamInterval = null;

function createSearchLightStream() {
  const container = document.getElementById('light-streams');
  if (!container) return;

  const stream = document.createElement('div');
  stream.className = 'light-stream';
  stream.style.left = Math.random() * 100 + '%';
  stream.style.height = (80 + Math.random() * 150) + 'px';
  stream.style.animationDuration = (0.6 + Math.random() * 0.8) + 's';
  stream.style.opacity = '0';
  container.appendChild(stream);

  setTimeout(() => {
    if (stream.parentNode) stream.parentNode.removeChild(stream);
  }, 1500);
}

function triggerSearchBoost() {
  isSearching = true;
  document.body.classList.add('searching');

  if (searchStreamInterval) clearInterval(searchStreamInterval);
  searchStreamInterval = setInterval(() => {
    createSearchLightStream();
  }, 120);

  if (window.particleSystem) {
    window.particleSystem.triggerBoost();
  }
}

function stopSearchBoost() {
  isSearching = false;
  document.body.classList.remove('searching');
  if (searchStreamInterval) {
    clearInterval(searchStreamInterval);
    searchStreamInterval = null;
  }
}

window.triggerSearchBoost = triggerSearchBoost;
window.stopSearchBoost = stopSearchBoost;
window.isExploreModeActive = () => isExploreMode;
// ===== 星球 hover 加速旋转 =====
document.addEventListener('mouseover', (e) => {
  if (!isExploreMode) return;
  const card = e.target.closest('.result-card');
  if (!card) return;
  const sphere = card.querySelector('.planet-sphere');
  if (sphere) {
    sphere.classList.add('planet-hovering');
  }
}, true);

document.addEventListener('mouseout', (e) => {
  if (!isExploreMode) return;
  const card = e.target.closest('.result-card');
  if (!card) return;
  const sphere = card.querySelector('.planet-sphere');
  if (sphere) {
    sphere.classList.remove('planet-hovering');
  }
}, true);

// ===== 星球差异化旋转速度 =====
// 给每个星球设置不同的旋转速度和方向
function applyPlanetRotationVariety() {
  const cards = document.querySelectorAll('.result-card');
  cards.forEach((card, index) => {
    const sphere = card.querySelector('.planet-sphere');
    if (!sphere) return;
    // 基础 8-18s 随机，奇数索引反向旋转
    const baseDuration = 8 + (index % 5) * 2;
    const direction = index % 2 === 0 ? 1 : -1;
    sphere.style.setProperty('--planet-rotate-duration', baseDuration + 's');
    if (direction === -1) {
      sphere.style.animationDirection = 'reverse';
    } else {
      sphere.style.animationDirection = 'normal';
    }
  });
}

// 在渲染结果后调用
const _origRenderResults = window.renderResults;
if (_origRenderResults) {
  window.renderResults = function (...args) {
    _origRenderResults.apply(this, args);
    setTimeout(applyPlanetRotationVariety, 100);
  };
}

// ===== 飞船开火功能 =====
// 配置：可通过 localStorage 控制开关
const FIRE_CONFIG = {
  get enabled() {
    const val = localStorage.getItem('nexus-ship-fire');
    return val !== 'false'; // 默认开启
  },
  set enabled(v) {
    localStorage.setItem('nexus-ship-fire', v ? 'true' : 'false');
  },
  bulletSpeed: 12,     // 子弹速度 (px/frame)
  bulletSize: 4,       // 子弹大小 (px)
  trailLength: 15,     // 拖尾长度
  gunOffsetX: 18,      // 枪口相对飞船中心的 X 偏移
  gunOffsetY: 5,       // 枪口相对飞船中心的 Y 偏移
};

let bullets = [];

function isClickableElement(el) {
  // 判断点击目标是否为交互元素
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  const interactiveTags = ['a', 'button', 'input', 'textarea', 'select', 'label'];
  if (interactiveTags.includes(tag)) return true;
  if (el.closest('.search-box, .quick-tags, .result-card, .detail-panel, .admin-panel, .hud-header, .spaceship')) return true;
  if (el.classList.contains('search-btn') || el.classList.contains('quick-tag')) return true;
  return false;
}

function fireBullets(targetX, targetY) {
  if (!FIRE_CONFIG.enabled || !isExploreMode) return;

  const ship = document.getElementById('spaceship');
  if (!ship) return;

  const shipRect = ship.getBoundingClientRect();
  const shipCenterX = shipRect.left + shipRect.width / 2;
  const shipCenterY = shipRect.top + shipRect.height / 2;

  // 计算朝向
  const dx = targetX - shipCenterX;
  const dy = targetY - shipCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return;

  const dirX = dx / distance;
  const dirY = dy / distance;

  // 左右各发射一颗子弹
  const gunLeftX = shipCenterX - FIRE_CONFIG.gunOffsetX;
  const gunLeftY = shipCenterY + FIRE_CONFIG.gunOffsetY;
  const gunRightX = shipCenterX + FIRE_CONFIG.gunOffsetX;
  const gunRightY = shipCenterY + FIRE_CONFIG.gunOffsetY;

  createBullet(gunLeftX, gunLeftY, dirX, dirY, '#00f0ff');
  createBullet(gunRightX, gunRightY, dirX, dirY, '#ff006e');

  // 开火后的小震动效果
  ship.style.transition = 'none';
  ship.style.transform = `translate(-52%, -52%) scale(0.97)`;
  setTimeout(() => {
    ship.style.transform = `translate(-48%, -48%) scale(1.03)`;
    setTimeout(() => {
      ship.style.transition = '';
      ship.style.transform = '';
    }, 50);
  }, 50);
}

function createBullet(startX, startY, dirX, dirY, color) {
  const bullet = document.createElement('div');
  bullet.className = 'ship-bullet';
  bullet.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    width: ${FIRE_CONFIG.bulletSize}px;
    height: ${FIRE_CONFIG.bulletSize}px;
    border-radius: 50%;
    background: ${color};
    box-shadow: 0 0 8px ${color}, 0 0 16px ${color}, 0 0 24px ${color};
    z-index: 9999;
    pointer-events: none;
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(bullet);

  const bulletData = {
    el: bullet,
    x: startX,
    y: startY,
    dirX,
    dirY,
    color,
    life: 0,
    maxLife: Math.ceil(2000 / 16), // ~2秒
    trail: [],
  };

  bullets.push(bulletData);
}

function animateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dirX * FIRE_CONFIG.bulletSpeed;
    b.y += b.dirY * FIRE_CONFIG.bulletSpeed;
    b.life++;

    // 更新位置
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';

    // 拖尾效果 — 创建粒子
    if (b.life % 2 === 0) {
      const trail = document.createElement('div');
      trail.style.cssText = `
        position: fixed;
        left: ${b.x}px;
        top: ${b.y}px;
        width: ${FIRE_CONFIG.bulletSize * 0.6}px;
        height: ${FIRE_CONFIG.bulletSize * 0.6}px;
        border-radius: 50%;
        background: ${b.color};
        opacity: 0.6;
        box-shadow: 0 0 6px ${b.color};
        z-index: 9998;
        pointer-events: none;
        transform: translate(-50%, -50%);
        transition: all 0.3s ease;
      `;
      document.body.appendChild(trail);
      setTimeout(() => {
        trail.style.opacity = '0';
        trail.style.transform = 'translate(-50%, -50%) scale(0.2)';
        setTimeout(() => trail.remove(), 300);
      }, 50);
    }

    // 移除超出屏幕或过期的子弹
    if (b.life > b.maxLife || b.x < -100 || b.x > window.innerWidth + 100 || b.y < -100 || b.y > window.innerHeight + 100) {
      b.el.remove();
      bullets.splice(i, 1);
    }
  }

  requestAnimationFrame(animateBullets);
}

// 启动子弹动画循环
requestAnimationFrame(animateBullets);

// 点击空白区域开火
document.addEventListener('click', (e) => {
  if (!isExploreMode) return;
  if (isClickableElement(e.target)) return;
  fireBullets(e.clientX, e.clientY);
});

function updateHUDStats() {
  const totalDocs = document.getElementById('total-docs');
  if (totalDocs) totalDocs.textContent = '12,847';
}

function updateTime() {
  const timeEl = document.getElementById('hud-time');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
}

// ===== 页面初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('[main.js] DOMContentLoaded fired');

  console.log('[diagnostic] window.openDetailPanel:', typeof window.openDetailPanel);
  console.log('[diagnostic] initSearch:', typeof initSearch);
  console.log('[diagnostic] initDetail:', typeof initDetail);

  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    const ps = new ParticleSystem3D('particle-canvas');
    window.particleSystem = ps;
  }

  initExploreMode();
  initSearch();
  initDetail();
  updateHUDStats();
  updateTime();
  setInterval(updateTime, 1000);

  // 初始化星球旋转差异
  setTimeout(applyPlanetRotationVariety, 500);

  setTimeout(() => {
    console.log('[diagnostic delayed] window.lastSearchResults:', window.lastSearchResults);
  }, 3000);
});

