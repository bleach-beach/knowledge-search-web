# NEXUS Knowledge Base — 技术架构文档

> **文档版本**：v1.0  
> **更新日期**：2026-04-19  
> **代码总量**：4,767 行（不含第三方库）  

---

## 一、系统概览

### 1.1 架构总览

```
┌────────────────────────────────────────────────────────────────┐
│                        浏览器（用户端）                          │
│                                                                │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │  index.html │  │ style.css   │  │  JavaScript Modules    │   │
│  │  (397 行)   │  │ (2,254 行)  │  │                       │   │
│  └──────┬──────┘  └─────────────┘  │  ┌──────────────────┐  │   │
│         │                          │  │ main.js (590 行)  │  │   │
│         │                          │  │  页面初始化/飞船   │  │   │
│         │                          │  └────────┬─────────┘  │   │
│         │                          │  ┌────────┴─────────┐  │   │
│         │                          │  │ particles.js      │  │   │
│         │                          │  │ (462 行)          │  │   │
│         │                          │  │  Three.js 3D 粒子 │  │   │
│         │                          │  └────────┬─────────┘  │   │
│         │                          │  ┌────────┴─────────┐  │   │
│         │                          │  │ search.js         │  │   │
│         │  DOM Tree ────────       │  │ (514 行)          │  │   │
│         │                          │  │  搜索/结果渲染     │  │   │
│         │                          │  └────────┬─────────┘  │   │
│         │                          │  ┌────────┴─────────┐  │   │
│         │                          │  │ detail.js         │  │   │
│         │                          │  │ (311 行)          │  │   │
│         │                          │  │  详情面板/收藏     │  │   │
│         │                          │  └────────┬─────────┘  │   │
│         │                          │  ┌────────┴─────────┐  │   │
│         │                          │  │ admin.js          │  │   │
│         │                          │  │ (239 行)          │  │   │
│         │                          │  │  管理面板/配置     │  │   │
│         │                          │  └──────────────────┘  │   │
│  └──────┴──────────────────────────┴───────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  CDN 依赖（按需加载）                                   │   │
│  │  Three.js r160    marked.js    Google Fonts            │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────┬─────────────────────────────────────┘
                           │ HTTP / REST API
                           ▼
┌────────────────────────────────────────────────────────────────┐
│              knowledge-search-tool-server（后端服务）            │
│                                                                │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │ /api/search │  │/api/doc/... │  │ /api/admin/config     │   │
│  │ POST        │  │ GET         │  │ GET/PUT/POST          │   │
│  └──────┬──────┘  └─────────────┘  └───────────────────────┘   │
│         │                                                       │
│  ┌──────┴──────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ 向量数据库   │  │  LLM 服务    │  │  配置文件存储          │  │
│  │ (文档索引)   │  │ (AI 总结)    │  │  (YAML/JSON)          │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 前端框架 | **无框架（Vanilla JS）** | 零构建依赖，快速部署，代码量可控（4,767 行） |
| 3D 渲染 | **Three.js r160** | WebGL 标准库，GPU 粒子渲染，3000+ 粒子 60fps |
| Markdown | **marked.js** | 轻量级，支持 GFM，CDN 可用 |
| CSS 特性 | **Houdini @property** | 注册自定义属性，支持渐变边框动画 |
| 字体 | **Google Fonts** | Orbitron（科幻标题）+ Rajdhani（正文）+ Share Tech Mono（代码） |
| 数据存储 | **localStorage** | 用户偏好、收藏列表，无需后端存储 |
| 后端服务 | **Python / FastAPI** | RESTful API，LLM 集成，向量搜索 |

---

## 二、前端模块架构

### 2.1 模块职责划分

```
js/
├── main.js          ← 页面初始化 + 宇宙探索模式（飞船/星球/开火）
├── particles.js     ← Three.js 3D 粒子系统
├── search.js        ← 搜索逻辑 + 结果渲染（卡片/星球）
├── detail.js        ← 详情面板（侧边抽屉）
└── admin.js         ← 系统管理面板
```

### 2.2 模块详细说明

#### 2.2.1 main.js — 页面初始化 + 宇宙探索模式（590 行）

**职责**：应用启动入口 + 飞船动画系统 + 星球交互 + 飞船开火

**核心模块**：

```
main.js
├── 宇宙探索模式
│   ├── toggleExploreMode()     — 切换探索模式开关
│   ├── initExploreMode()       — 初始化（读取 localStorage 状态）
│   ├── createLightStreams()    — 创建流光粒子层
│   └── 鼠标事件监听             — mousemove → 更新目标位置
│
├── 飞船动画系统
│   ├── animateShip(timestamp)  — requestAnimationFrame 主循环
│   │   ├── 位置插值（lerp 0.03）
│   │   ├── 船头朝向旋转（atan2 → 最短路径插值）
│   │   ├── 推进粒子生成
│   │   └── 尾迹粒子生成
│   ├── createThrustParticle()  — 引擎尾部喷射粒子
│   ├── updateThrustParticles() — 推进粒子生命周期管理
│   ├── createTrailParticle()   — 飞船尾迹粒子
│   ├── updateTrailParticles()  — 尾迹粒子生命周期管理
│   └── createSearchLightStream() — 搜索加速流光效果
│
├── 星球交互系统
│   ├── mouseover/mouseout 事件监听 — planet-hovering 类切换
│   ├── applyPlanetRotationVariety() — 差异化旋转速度/方向
│   └── renderResults 钩子          — 每次渲染后重新应用
│
├── 飞船开火系统
│   ├── isClickableElement()  — 判断点击目标是否可交互
│   ├── fireBullets()         — 计算弹道 + 创建子弹 + 震动反馈
│   ├── createBullet()        — 创建子弹 DOM 元素
│   └── animateBullets()      — requestAnimationFrame 子弹动画循环
│
├── HUD 更新
│   ├── updateHUDStats()      — 更新文档统计数字
│   └── updateTime()          — 实时时钟（setInterval 1s）
│
└── DOMContentLoaded 初始化
    ├── ParticleSystem3D 实例化
    ├── initExploreMode()
    ├── initSearch()
    ├── initDetail()
    └── 星球旋转初始化（setTimeout 500ms）
```

**对外暴露的 API**：

```javascript
window.triggerSearchBoost()   // 搜索开始时调用，触发飞船加速
window.stopSearchBoost()      // 搜索结束时调用，停止加速
window.isExploreModeActive()  // 返回当前是否处于探索模式
```

---

#### 2.2.2 particles.js — Three.js 3D 粒子系统（462 行）

**职责**：GPU 加速的 3D 粒子渲染 + 物理模拟

**类设计**：

```
ParticleSystem3D
├── 构造函数(canvasId)
│   ├── 配置对象（粒子数/分布范围/引力参数）
│   ├── 颜色数组（4 色 + 权重）
│   └── init()
│
├── 渲染管线
│   ├── setupRenderer()   — WebGLRenderer（alpha, high-performance）
│   ├── setupScene()      — THREE.Scene
│   └── setupCamera()     — PerspectiveCamera（60° FOV, z=30）
│
├── 粒子创建
│   ├── createParticles()
│   │   ├── BufferGeometry（3000 粒子）
│   │   │   ├── position（3D 球体分布）
│   │   │   ├── originalPosition（原始位置，用于回归）
│   │   │   ├── velocity（基础速度）
│   │   │   ├── color（4 色随机分配）
│   │   │   ├── size（0.5-2.5）
│   │   │   ├── phase（脉动相位）
│   │   │   └── alpha（透明度）
│   │   └── ShaderMaterial
│   │       ├── vertexShader — 脉动大小计算
│   │       └── fragmentShader — 圆形粒子 + 外发光 + 核心亮点
│   │
│   └── createConnections()
│       ├── LineSegments（最多 2000 条连线）
│       └── updateConnections() — 每帧更新近距离粒子连线
│
├── 物理模拟
│   └── update()
│       ├── 鼠标 3D 位置（射线投射到 z=0 平面）
│       ├── 基础漂浮（velocity 累加）
│       ├── 鼠标引力场（8 单位半径，力随距离衰减）
│       ├── 搜索汇聚（focus → 向原点吸引）
│       ├── 回归原始位置（弹簧力）
│       ├── 速度阻尼（0.97 衰减）
│       └── 整体旋转（Y 轴缓慢旋转 + X 轴正弦摆动）
│
├── 探索模式接口
│   ├── setExploreMode(active) — 调整粒子参数
│   └── triggerBoost()         — 2 秒加速
│
└── 动画循环
    └── animate() — requestAnimationFrame → update() → render()
```

**自定义 Shader**：

```glsl
// Vertex Shader — 粒子大小脉动
attribute float size;
attribute float phase;
attribute float alpha;
varying float vAlpha;
uniform float uTime;

void main() {
  float pulse = 1.0 + 0.3 * sin(uTime * 1.5 + phase);
  vAlpha = alpha * pulse;
  gl_PointSize = size * pulse * (200.0 / -mvPosition.z);
}

// Fragment Shader — 圆形粒子 + 发光
void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float glow = exp(-dist * 4.0) * 0.6;
  float core = smoothstep(0.15, 0.0, dist);
  gl_FragColor = vec4(vColor + core * 0.3, vAlpha * (glow + core * 0.8));
}
```

---

#### 2.2.3 search.js — 搜索逻辑 + 结果渲染（514 行）

**职责**：后端 API 调用 + 结果适配 + 双模式渲染

**核心流程**：

```
search.js
├── API 层
│   ├── searchAPI(query, options)
│   │   ├── AbortController 超时控制（默认 300s，LLM 总结需时较长）
│   │   ├── POST /api/search
│   │   │   ├── query
│   │   │   ├── top_k
│   │   │   ├── summarize
│   │   │   ├── web_supplement
│   │   │   └── dedup_mode
│   │   └── 错误处理（AbortError / HTTP Error）
│   │
│   └── adaptAPIToFrontend(apiResponse)
│       └── 后端格式 → 前端格式转换
│
├── 渲染层
│   ├── renderResults(results, query, apiResponse)
│   │   ├── 加载动画隐藏
│   │   ├── 停止搜索加速（window.stopSearchBoost）
│   │   ├── 空结果 → 空状态
│   │   ├── 普通模式 → 3D 卡片网格
│   │   ├── 探索模式 → renderPlanetCards()
│   │   ├── 缓存结果到 window.lastSearchResults
│   │   ├── initCardTiltAndClick() — 3D 倾斜 + 点击事件委托
│   │   └── renderSummary() — LLM 总结渲染
│   │
│   ├── renderPlanetCards(results, query)
│   │   ├── 8 色星球方案
│   │   ├── 随机光环（50% 概率）
│   │   ├── 星球球体 + 名称标签
│   │   └── hover 信息气泡（标题/摘要/标签/分类/匹配度）
│   │
│   └── renderSummary(summary, query)
│       ├── 创建/复用 #summary-container
│       ├── 判断 LLM 总结 vs fallback 摘要
│       ├── marked.parse(summary) — Markdown → HTML
│       └── 渲染到结果区下方
│
├── 交互层
│   ├── initCardTiltAndClick(results)
│   │   ├── 事件委托（grid 上绑定一次 click）
│   │   │   └── 点击卡片 → window.openDetailPanel()
│   │   └── 3D 倾斜（每张卡片 mousemove/mouseleave）
│   │
│   └── highlightMatches(text, query)
│       └── 正则替换关键词 → <span class="match">
│
├── 搜索入口
│   ├── performSearch(query)
│   │   ├── 加载动画
│   │   ├── 触发飞船加速
│   │   ├── searchAPI()
│   │   └── renderResults()
│   │
│   └── initSearch()
│       ├── 快捷标签渲染 + 点击事件
│       ├── 搜索按钮点击事件
│       ├── 回车键搜索
│       ├── 输入防抖搜索（500ms，2+ 字符）
│       └── 初始隐藏结果区
│
└── 配置
    ├── searchSettings（window 全局）
    └── API_BASE_URL（window.KB_API_BASE || localhost:8000）
```

**搜索设置数据结构**：

```javascript
let searchSettings = {
  dedupMode: 'file',      // 'file' | 'none'
  summarize: false,       // 是否启用 LLM 总结
  webSupplement: false,   // 是否联网补充
};
```

---

#### 2.2.4 detail.js — 详情面板（311 行）

**职责**：侧边抽屉详情展示 + Markdown 渲染 + 收藏

**核心流程**：

```
detail.js
├── openDetail(item, allItems)
│   ├── 填充元信息（标题/分类/ID/来源/匹配度/日期）
│   ├── 标签渲染
│   ├── 正文内容
│   │   ├── 优先 item.full_text → markdownToHTML()
│   │   └── fallback → generateGenericContent()
│   ├── 相关文档（同分类/同标签，最多 4 条）
│   │   └── 点击 → 切换详情（不关闭面板）
│   ├── 收藏状态（localStorage 'nexus-bookmarks'）
│   └── 面板显示（overlay + panel active + body overflow hidden）
│
├── closeDetail()
│   └── 移除 active 类 + 恢复滚动
│
├── toggleBookmark(item)
│   └── localStorage 增删 + UI 更新
│
├── fetchFullDocument(file_path)
│   ├── GET /api/document/{path}
│   ├── markdownToHTML()
│   └── 更新按钮状态
│
└── initDetail()
    ├── 关闭按钮 / 遮罩层 / ESC 键
    ├── 收藏按钮
    └── 原文按钮
```

**Markdown 渲染链**：

```
item.full_text (Markdown 字符串)
    │
    ▼
marked.parse() (GFM + breaks)
    │
    ▼
HTML 字符串 → detail-content.innerHTML
```

---

#### 2.2.5 admin.js — 系统管理面板（239 行）

**职责**：管理面板 UI + REST API 配置同步

**核心流程**：

```
admin.js
├── 面板控制
│   ├── openAdminPanel()  → 加载配置 + 显示面板
│   └── closeAdminPanel() → 隐藏面板
│
├── API 操作
│   ├── loadAdminConfig()
│   │   ├── GET /api/admin/config
│   │   └── populateForm(config)
│   │
│   ├── saveAdminConfig()
│   │   ├── collectForm() → 构建 config 对象
│   │   ├── PUT /api/admin/config
│   │   ├── showToast() 成功提示
│   │   └── 同步到 window.searchSettings
│   │
│   └── resetAdminConfig()
│       ├── POST /api/admin/config/reset
│       └── 重新加载
│
├── 表单处理
│   ├── populateForm(config)
│   │   ├── LLM 配置（backend/model/base_url/api_key）
│   │   │   └── API Key 脱敏处理（包含 **** 时不覆盖）
│   │   ├── 搜索配置（summarize/web_supplement/top_k/dedup_mode）
│   │   └── 服务器配置（cors_origins）
│   │
│   └── collectForm()
│       └── 仅当用户输入新值时才发送 API Key
│
└── 初始化
    └── initAdminDefaults()
        ├── 页面加载后自动获取后端配置
        └── 同步到 window.searchSettings
```

---

### 2.3 模块间依赖关系

```
                    ┌──────────────┐
                    │  index.html   │
                    │  (DOM 结构)    │
                    └──────┬───────┘
                           │ 按顺序加载
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────┐
    │ particles.js │ │search.js │ │detail.js │
    │ (Three.js)   │ │(API调用)  │ │(面板)     │
    └──────┬───────┘ └─────┬────┘ └─────┬────┘
           │               │            │
           │               │            │
           ▼               ▼            │
    ┌────────────────────────────────┐  │
    │          main.js               │  │
    │  (初始化入口 + 飞船 + 星球 + 开火)│  │
    └────────────────────────────────┘  │
              │         │               │
              │         │               │
              ▼         ▼               │
       window.     window.              │
    particleSystem  lastSearchResults   │
       .setExplore     .find() ────────┘
       Mode()
              │
              ▼
        admin.js
       (配置同步)
            │
            ▼
    window.searchSettings
    (被 search.js 使用)
```

**关键全局变量**：

```javascript
// main.js → particles.js
window.particleSystem       // ParticleSystem3D 实例
window.triggerSearchBoost() // 触发飞船加速
window.stopSearchBoost()    // 停止加速
window.isExploreModeActive()// 模式状态查询

// search.js → detail.js
window.lastSearchResults    // 最近搜索结果缓存
window.openDetailPanel()    // 打开详情面板（detail.js 暴露）

// admin.js → search.js
window.searchSettings       // 搜索配置（summarize/webSupplement/dedupMode）
```

---

## 三、CSS 架构

### 3.1 样式文件结构（2,254 行）

```
style.css
├── 基础重置 & 字体引入（Google Fonts）
├── CSS 变量定义（:root）
│   ├── 色彩变量（--deep-space, --cyan-glow, --magenta-glow...）
│   └── 玻璃效果变量（--glass-bg, --glass-border）
├── body 伪元素
│   ├── ::before — 深空星云背景（3 层 radial-gradient）
│   └── ::after  — CRT 扫描线（repeating-linear-gradient）
│
├── HUD 导航栏
│   ├── glassmorphism 毛玻璃
│   ├── 状态指示灯（脉冲动画）
│   └── 按钮悬停效果
│
├── 搜索区域
│   ├── 标题故障动画（::before/::after clip-path 抖动）
│   ├── 搜索框
│   │   ├── @property --angle（Houdini 注册）
│   │   ├── conic-gradient 旋转霓虹边框
│   │   └── 呼吸灯动画
│   ├── 快捷标签（幽灵边框）
│   └── 搜索按钮（SVG 图标 + 发光）
│
├── 加载动画
│   └── 双环旋转（正反方向）
│
├── 结果卡片（普通模式）
│   ├── glassmorphism + backdrop-filter
│   ├── 光追渐变（--mouse-x/y CSS 变量）
│   ├── 3D 倾斜（perspective + rotateX/Y）
│   ├── 入场动画（translateY + rotateX 从下方升起）
│   └── 悬浮效果（translateY + 边框发光）
│
├── 宇宙探索模式（body.explore-mode）
│   ├── 飞船系统
│   │   ├── .spaceship — 定位 + 缩放
│   │   ├── .ship-rotator — 旋转层
│   │   ├── .engine-flame — 引擎火焰动画
│   │   ├── .thrust-particle — 推进粒子
│   │   ├── .trail-particle — 尾迹粒子
│   │   └── .light-stream — 流光粒子
│   │
│   ├── 星球系统
│   │   ├── .result-card — 星球容器
│   │   ├── .planet-sphere — 球体
│   │   │   ├── 线框模式（conic-gradient 经线 + repeating-linear-gradient 纬线）
│   │   │   ├── planetWireframeRotate 动画（rotateX(15deg) rotateY(0→360deg)）
│   │   │   ├── .planet-hovering（旋转加速 4 倍）
│   │   │   └── hover 态（真实颜色渐变 + 发光）
│   │   ├── .has-ring::after — 倾斜光环
│   │   └── .planet-tooltip — hover 信息气泡
│   │
│   └── 飞船开火
│       └── .ship-bullet — 子弹样式（JS 动态创建）
│
├── 详情面板
│   ├── 侧边抽屉（transform: translateX(100%) → 0）
│   ├── 遮罩层（半透明黑色）
│   ├── 元信息网格
│   ├── 标签样式
│   ├── 收藏按钮
│   └── 相关文档列表
│
├── 管理面板
│   ├── 侧边抽屉
│   ├── 表单控件（select/input/checkbox/toggle-switch）
│   └── Toast 提示
│
└── 响应式布局
    └── @media (max-width: 768px)
```

### 3.2 CSS 动画清单

| 动画名称 | 用途 | 技术 |
|---------|------|------|
| `borderRotate` | 搜索框霓虹边框旋转 | `@property --angle` + `conic-gradient` |
| `pulse` | 状态指示灯脉冲 | `opacity` + `box-shadow` |
| `glitch` | 标题故障效果 | `clip-path` 分段裁剪 |
| `searchBoxGlow` | 搜索框呼吸灯 | `box-shadow` 脉冲 |
| `loadingSpin` | 加载双环旋转 | `rotateY` 正反方向 |
| `cardSlideIn` | 卡片入场 | `translateY` + `rotateX` + `opacity` |
| `planetWireframeRotate` | 星球 3D 自转 | `rotateX(15deg)` + `rotateY(0→360deg)` |
| `flameFlicker` | 引擎火焰闪烁 | `scaleY` + `opacity` |
| `float` | 飞船悬浮 | `translateY` 正弦摆动 |
| `panelSlide` | 面板滑入/滑出 | `translateX(100%) → 0` |

---

## 四、数据流

### 4.1 搜索数据流

```
用户输入关键词
    │
    ▼
search.js: performSearch(query)
    │
    ├──→ main.js: triggerSearchBoost()  [视觉反馈]
    │       └── 飞船加速 + 流光粒子
    │
    ▼
search.js: searchAPI(query, options)
    │
    ▼
┌─────────────────────────────────┐
│  POST /api/search               │
│  {                               │
│    query: "React 性能优化",       │
│    top_k: 10,                    │
│    summarize: true,              │
│    web_supplement: false,        │
│    dedup_mode: "file"            │
│  }                               │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  {                               │
│    results: [{                   │
│      id, title, summary,         │
│      category, tags, score,      │
│      file_path, full_text,       │
│      preview                     │
│    }],                           │
│    summary: "LLM 生成的总结",     │
│    elapsed_ms: 234,              │
│    deduped_count: 2              │
│  }                               │
└───────────────┬─────────────────┘
                │
                ▼
search.js: adaptAPIToFrontend()
    │  后端格式 → 前端格式
    ▼
search.js: renderResults()
    │
    ├──→ 普通模式: 3D 卡片网格
    │
    └──→ 探索模式: renderPlanetCards()
            │
            ├──→ main.js: applyPlanetRotationVariety()
            │       差异化旋转速度
            │
            └──→ initCardTiltAndClick()
                    3D 倾斜 + 点击事件委托
```

### 4.2 详情数据流

```
点击卡片/星球
    │
    ▼
search.js: 事件委托处理器
    │
    ├──→ window.lastSearchResults.find(id)
    │       查找完整数据
    │
    ▼
detail.js: openDetail(item, allItems)
    │
    ├──→ 填充 DOM 元素
    ├──→ markdownToHTML(item.full_text)
    ├──→ findRelatedDocuments()
    └──→ localStorage 读取收藏状态
```

### 4.3 配置数据流

```
点击 ⚙ SETTINGS
    │
    ▼
admin.js: loadAdminConfig()
    │
    ▼
┌───────────────────────────────┐
│  GET /api/admin/config        │
│  {                             │
│    llm: { backend, model,     │
│            base_url, api_key },│
│    search: { default_summarize,│
│              default_top_k },  │
│    server: { cors_origins }    │
│  }                             │
└───────────────┬───────────────┘
                │
                ▼
admin.js: populateForm()
    │
    ▼
用户修改表单
    │
    ▼
admin.js: saveAdminConfig()
    │
    ▼
┌───────────────────────────────┐
│  PUT /api/admin/config        │
│  { ... 修改后的配置 ... }       │
└───────────────┬───────────────┘
                │
                ▼
admin.js: 同步到 window.searchSettings
    │
    ▼
下次搜索时 searchAPI() 使用新配置
```

---

## 五、关键设计决策

### 5.1 为什么选择无框架？

| 考量 | 决策 |
|------|------|
| 代码量 | 4,767 行，完全可控 |
| 构建工具 | 零配置，直接部署静态文件 |
| 依赖管理 | 仅 3 个 CDN 依赖（Three.js/marked/Google Fonts） |
| 性能 | 无框架运行时开销，首屏加载快 |
| 维护 | 文件职责清晰，5 个 JS 模块 |

### 5.2 为什么选择 Three.js 而非 Canvas 2D？

| 维度 | Canvas 2D | Three.js WebGL |
|------|----------|----------------|
| 粒子数量 | ~200 | 3,000+ |
| 渲染方式 | CPU | GPU |
| 3D 效果 | 模拟 | 真正透视投影 |
| 粒子连线 | 简单直线 | BufferGeometry LineSegments |
| 自定义着色器 | 不支持 | 完整 GLSL 支持 |
| 鼠标交互 | 2D 坐标 | 射线投射到 3D 空间 |

### 5.3 为什么使用 localStorage 而非后端存储？

- **用户偏好**（探索模式开关、飞船开火开关）：纯前端状态，无需后端
- **收藏列表**：个人偏好数据，不需要同步
- **配置**：通过 REST API 存到后端（管理员操作）
- **搜索历史**：当前版本未实现（后续可加）

---

## 六、性能考量

### 6.1 粒子系统优化

| 优化项 | 实现 |
|--------|------|
| GPU 渲染 | Three.js WebGL + ShaderMaterial |
| BufferGeometry | 所有粒子数据预分配到 TypedArray |
| 连线限制 | 最多 2000 条 + 每 5 个粒子采样 1 个 |
| 像素比限制 | `Math.min(devicePixelRatio, 2)` |
| 粒子回归 | 弹簧力 + 速度阻尼，防止粒子飞散 |

### 6.2 DOM 操作优化

| 优化项 | 实现 |
|--------|------|
| 事件委托 | 卡片点击绑定到 grid 容器（只绑定一次） |
| 批量 DOM | 结果渲染使用模板字符串 + 一次 innerHTML |
| requestAnimationFrame | 飞船/子弹动画使用 RAF，非 setInterval |
| CSS 动画优先 | 星球旋转/面板滑动使用 CSS animation，非 JS |
| 防抖搜索 | 500ms 防抖，避免频繁 API 请求 |

### 6.3 内存管理

```javascript
// 粒子系统销毁
destroy() {
  cancelAnimationFrame(this.animationId);
  this.renderer.dispose();
  this.particles.geometry.dispose();
  this.particles.material.dispose();
  this.lines.geometry.dispose();
  this.lines.material.dispose();
}

// 尾迹粒子数量限制
const MAX_TRAIL = 60;
if (trailParticles.length >= MAX_TRAIL) {
  const old = trailParticles.shift();
  old.remove();
}
```

---

## 七、文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `index.html` | 397 | 页面结构 + SVG 飞船 + 3 个侧边面板 |
| `css/style.css` | 2,254 | 全部样式 + 动画 + 响应式 |
| `js/main.js` | 590 | 初始化 + 飞船系统 + 星球 + 开火 |
| `js/particles.js` | 462 | Three.js 3D 粒子系统 |
| `js/search.js` | 514 | 搜索 API + 结果渲染 |
| `js/detail.js` | 311 | 详情面板 + 收藏 |
| `js/admin.js` | 239 | 管理面板 + 配置同步 |
| `DESIGN.md` | 214 | 设计文档 |
| `PRODUCT.md` | 340 | 产品文档（本文档姊妹篇） |
| `ARCHITECTURE.md` | — | 架构文档（本文档） |
| **总计** | **4,767** | **代码行数（不含文档）** |

---

## 八、扩展路线图

### 8.1 前端扩展

| 优先级 | 功能 | 技术方案 |
|--------|------|---------|
| P0 | 搜索历史 | localStorage 存储 + 下拉列表 |
| P0 | 键盘快捷键 | `/` 聚焦搜索框, `Esc` 关闭面板, `↑↓` 导航 |
| P1 | 虚拟滚动 | 大量结果时使用 IntersectionObserver |
| P1 | 音效系统 | Web Audio API + 搜索/点击音效 |
| P2 | PWA | Service Worker + manifest.json |
| P2 | 主题切换 | CSS 变量动态替换 |
| P3 | 语音搜索 | Web Speech API |

### 8.2 后端扩展

| 优先级 | 功能 | 技术方案 |
|--------|------|---------|
| P0 | 分页加载 | cursor-based pagination |
| P1 | 搜索结果缓存 | Redis |
| P1 | 搜索建议 | 前缀匹配 + 热门查询 |
| P2 | 用户系统 | JWT 认证 + 个人收藏同步 |
| P3 | 实时搜索 | WebSocket 推送 LLM 总结进度 |
