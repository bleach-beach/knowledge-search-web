/**
 * planet-surface.js — 3D 线框星球 + hover 真实纹理星球
 * 
 * 未 hover 时：虚化线框球体，内部有经纬线网格，缓慢自转（3D深度旋转）
 * hover 时：平滑过渡到真实色彩球体，旋转适度加快
 */

// ===== Simplex-like 2D 噪声 =====
class SimplexNoise {
  constructor(seed = Math.random()) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed * 2147483647;
    if (s <= 0) s += 2147483646;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const a = this.perm[X] + Y;
    const b = this.perm[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(this.perm[a], xf, yf), this.grad(this.perm[b], xf - 1, yf), u),
      this.lerp(this.grad(this.perm[a + 1], xf, yf - 1), this.grad(this.perm[b + 1], xf - 1, yf - 1), u),
      v
    );
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 3;
    return (h < 2 ? x : -x) + (h === 0 || h === 2 ? y : -y);
  }

  fbm(x, y, octaves = 6, lacunarity = 2.0, gain = 0.5) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxVal += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return value / maxVal;
  }
}

// ===== 星球颜色方案 =====
const PLANET_SURFACE_SCHEMES = [
  {
    name: 'ocean',
    water: [30, 80, 180],
    land: [50, 140, 70],
    highland: [100, 170, 90],
    ice: [220, 235, 250],
    cloud: [255, 255, 255],
    atmosphere: [80, 160, 255],
    terrainScale: 3.0, terrainAmplitude: 0.6, cloudDensity: 0.35, hasClouds: true,
    highlightOffset: { x: 0.3, y: 0.3 },
  },
  {
    name: 'desert',
    water: [140, 100, 50],
    land: [210, 160, 80],
    highland: [230, 190, 120],
    ice: [200, 180, 150],
    cloud: [255, 240, 200],
    atmosphere: [255, 200, 100],
    terrainScale: 2.5, terrainAmplitude: 0.5, cloudDensity: 0.15, hasClouds: true,
    highlightOffset: { x: 0.35, y: 0.25 },
  },
  {
    name: 'volcanic',
    water: [40, 20, 15],
    land: [120, 40, 20],
    highland: [180, 60, 20],
    ice: [60, 30, 20],
    cloud: [255, 100, 30],
    atmosphere: [255, 80, 30],
    terrainScale: 3.5, terrainAmplitude: 0.7, cloudDensity: 0.4, hasClouds: true,
    highlightOffset: { x: 0.32, y: 0.35 },
  },
  {
    name: 'ice_giant',
    water: [60, 160, 200],
    land: [100, 200, 230],
    highland: [160, 225, 245],
    ice: [200, 235, 250],
    cloud: [255, 255, 255],
    atmosphere: [120, 200, 240],
    terrainScale: 1.8, terrainAmplitude: 0.3, cloudDensity: 0.5, hasClouds: true,
    highlightOffset: { x: 0.3, y: 0.3 },
  },
  {
    name: 'gas_giant',
    water: [160, 100, 50],
    land: [200, 140, 80],
    highland: [220, 170, 100],
    ice: [180, 130, 70],
    cloud: [255, 210, 150],
    atmosphere: [220, 160, 80],
    terrainScale: 1.5, terrainAmplitude: 0.25, cloudDensity: 0.6, hasClouds: true, bandEffect: true,
    highlightOffset: { x: 0.33, y: 0.33 },
  },
  {
    name: 'rocky',
    water: [80, 75, 70],
    land: [120, 115, 105],
    highland: [160, 155, 145],
    ice: [180, 175, 170],
    cloud: [200, 195, 190],
    atmosphere: [150, 145, 135],
    terrainScale: 2.0, terrainAmplitude: 0.65, cloudDensity: 0.05, hasClouds: false, craterDensity: 0.3,
    highlightOffset: { x: 0.35, y: 0.28 },
  },
  {
    name: 'emerald',
    water: [20, 120, 80],
    land: [30, 180, 100],
    highland: [80, 210, 130],
    ice: [180, 240, 220],
    cloud: [220, 255, 240],
    atmosphere: [50, 200, 130],
    terrainScale: 2.8, terrainAmplitude: 0.55, cloudDensity: 0.25, hasClouds: true,
    highlightOffset: { x: 0.3, y: 0.35 },
  },
  {
    name: 'amethyst',
    water: [80, 30, 100],
    land: [130, 60, 160],
    highland: [170, 100, 200],
    ice: [210, 170, 230],
    cloud: [240, 220, 255],
    atmosphere: [150, 80, 200],
    terrainScale: 2.3, terrainAmplitude: 0.5, cloudDensity: 0.3, hasClouds: true,
    highlightOffset: { x: 0.32, y: 0.28 },
  },
];

// ===== 工具函数 =====
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 生成星球表面纹理（用于 hover 后的真实球体）
 */
function generatePlanetTexture(width, height, scheme, seed, rotationOffset = 0) {
  const noise = new SimplexNoise(seed);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const u = (px / width) * 2 - 1;
      const v = (py / height) * 2 - 1;
      const dist = Math.sqrt(u * u + v * v);
      if (dist > 1.0) continue;

      const nz = Math.sqrt(Math.max(0, 1 - dist * dist));
      const lat = Math.asin(v);
      const lon = Math.atan2(u, nz) + rotationOffset;

      const scale = scheme.terrainScale;
      const amp = scheme.terrainAmplitude;
      let terrain = noise.fbm(
        Math.cos(lat) * Math.cos(lon) * scale,
        Math.sin(lat) * scale,
        6, 2.0, 0.5
      );

      if (scheme.bandEffect) {
        const band = Math.sin(lat * 12 + terrain * 2) * 0.3;
        terrain += band;
      }

      terrain = (terrain + 1) / 2;

      let r, g, b;
      const waterLevel = 0.35;
      const highlandLevel = 0.6;

      if (terrain < waterLevel) {
        const t = terrain / waterLevel;
        r = lerp(scheme.water[0], scheme.land[0], t);
        g = lerp(scheme.water[1], scheme.land[1], t);
        b = lerp(scheme.water[2], scheme.land[2], t);
      } else if (terrain < highlandLevel) {
        const t = (terrain - waterLevel) / (highlandLevel - waterLevel);
        r = lerp(scheme.land[0], scheme.highland[0], t);
        g = lerp(scheme.land[1], scheme.highland[1], t);
        b = lerp(scheme.land[2], scheme.highland[2], t);
      } else {
        const t = (terrain - highlandLevel) / (1 - highlandLevel);
        r = lerp(scheme.highland[0], scheme.ice[0], t);
        g = lerp(scheme.highland[1], scheme.ice[1], t);
        b = lerp(scheme.highland[2], scheme.ice[2], t);
      }

      if (scheme.craterDensity > 0) {
        const craterNoise = noise.fbm(
          Math.cos(lat) * Math.cos(lon) * 8,
          Math.sin(lat) * 8,
          3, 2.2, 0.4
        );
        if (craterNoise > 0.6) {
          const craterFactor = (craterNoise - 0.6) * 5;
          r = r * (1 - craterFactor * 0.3);
          g = g * (1 - craterFactor * 0.3);
          b = b * (1 - craterFactor * 0.3);
        }
      }

      if (scheme.hasClouds) {
        const cloudNoise = noise.fbm(
          Math.cos(lat) * Math.cos(lon) * 4 + 100,
          Math.sin(lat) * 4 + 100,
          5, 2.1, 0.45
        );
        const cloudFactor = smoothstep(scheme.cloudDensity, scheme.cloudDensity + 0.3, cloudNoise);
        if (cloudFactor > 0) {
          r = lerp(r, scheme.cloud[0], cloudFactor * 0.7);
          g = lerp(g, scheme.cloud[1], cloudFactor * 0.7);
          b = lerp(b, scheme.cloud[2], cloudFactor * 0.7);
        }
      }

      const lightDir = scheme.highlightOffset;
      const lightDot = u * lightDir.x + v * lightDir.y + nz * 0.6;
      const lightFactor = Math.max(0, Math.min(1, lightDot * 1.5));
      const ambient = 0.12;
      const diffuse = lightFactor * 0.8;
      const rim = Math.pow(1 - nz, 3) * 0.25;
      const brightness = ambient + diffuse + rim;
      r = clamp(r * brightness);
      g = clamp(g * brightness);
      b = clamp(b * brightness);

      const edgeFade = smoothstep(0.85, 1.0, dist);
      const finalAlpha = clamp((1 - edgeFade) * 255);

      const idx = (py * width + px) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = finalAlpha;
    }
  }

  return pixels;
}

// ===== 3D 线框球体渲染器（未 hover 状态）=====
class WireframeSphereRenderer {
  constructor(canvas, color, size = 100) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = color;       // [r, g, b]
    this.size = size;
    this.rotationY = 0;       // Y 轴旋转角度
    this.rotationX = 0.3;     // X 轴倾斜（让它看起来是3D倾斜的）
    this.rotationZ = 0;       // Z 轴微旋（增加立体感）
    this.baseSpeedY = 0.003;  // Y 轴基础旋转速度（很慢）
    this.currentSpeedY = this.baseSpeedY;
    this.hovering = false;
    this.dpr = window.devicePixelRatio || 1;
    this.latLines = 12;       // 纬线数量
    this.lonLines = 16;       // 经线数量
    this.blurAmount = 1.5;    // 虚化程度

    this.resizeCanvas();
  }

  resizeCanvas() {
    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
    this.canvas.style.width = this.size + 'px';
    this.canvas.style.height = this.size + 'px';
    this.ctx.scale(this.dpr, this.dpr);
  }

  setHovering(hovering) {
    this.hovering = hovering;
    this.currentSpeedY = hovering ? this.baseSpeedY * 2.2 : this.baseSpeedY;
  }

  update() {
    this.rotationY += this.currentSpeedY;
    // Z 轴微旋增加 3D 深度感
    this.rotationZ += this.currentSpeedY * 0.3;
  }

  /**
   * 3D 旋转矩阵变换
   * 绕 X 轴旋转
   */
  rotateX(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      point[0],
      point[1] * cos - point[2] * sin,
      point[1] * sin + point[2] * cos
    ];
  }

  /**
   * 3D 旋转矩阵变换
   * 绕 Y 轴旋转
   */
  rotateY(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      point[0] * cos + point[2] * sin,
      point[1],
      -point[0] * sin + point[2] * cos
    ];
  }

  /**
   * 3D 旋转矩阵变换
   * 绕 Z 轴旋转
   */
  rotateZ(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      point[0] * cos - point[1] * sin,
      point[0] * sin + point[1] * cos,
      point[2]
    ];
  }

  draw() {
    const ctx = this.ctx;
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - 2;

    ctx.clearRect(0, 0, s, s);

    // 虚化效果：先绘制到离屏 canvas 再模糊
    const offscreen = document.createElement('canvas');
    offscreen.width = s * this.dpr;
    offscreen.height = s * this.dpr;
    const offCtx = offscreen.getContext('2d');
    offCtx.scale(this.dpr, this.dpr);

    // 球体圆形裁剪
    offCtx.save();
    offCtx.beginPath();
    offCtx.arc(cx, cy, r, 0, Math.PI * 2);
    offCtx.clip();

    const rgb = this.color;
    const alpha = this.hovering ? 0.55 : 0.25;
    const lineWidth = this.hovering ? 1.2 : 0.8;
    const blur = this.hovering ? 0.5 : this.blurAmount;

    offCtx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    offCtx.lineWidth = lineWidth;
    offCtx.lineJoin = 'round';

    // 绘制纬线（水平环）
    for (let i = 0; i < this.latLines; i++) {
      const phi = (i / this.latLines) * Math.PI; // 0 ~ PI
      const points3D = [];
      const segments = 64;
      for (let j = 0; j <= segments; j++) {
        const theta = (j / segments) * Math.PI * 2;
        let p = [
          Math.cos(theta) * Math.sin(phi) * r,
          Math.cos(phi) * r,
          Math.sin(theta) * Math.sin(phi) * r
        ];
        p = this.rotateX(p, this.rotationX);
        p = this.rotateY(p, this.rotationY);
        p = this.rotateZ(p, this.rotationZ);
        points3D.push(p);
      }
      // 投影 + 按 Z 深度着色
      this.drawProjectedCurve(offCtx, points3D, cx, cy, r);
    }

    // 绘制经线（纵向线）
    for (let i = 0; i < this.lonLines; i++) {
      const theta = (i / this.lonLines) * Math.PI * 2;
      const points3D = [];
      const segments = 64;
      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * Math.PI;
        let p = [
          Math.cos(theta) * Math.sin(phi) * r,
          Math.cos(phi) * r,
          Math.sin(theta) * Math.sin(phi) * r
        ];
        p = this.rotateX(p, this.rotationX);
        p = this.rotateY(p, this.rotationY);
        p = this.rotateZ(p, this.rotationZ);
        points3D.push(p);
      }
      this.drawProjectedCurve(offCtx, points3D, cx, cy, r);
    }

    // 球体轮廓（最外层圆）
    offCtx.beginPath();
    offCtx.arc(cx, cy, r, 0, Math.PI * 2);
    offCtx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 1.5})`;
    offCtx.lineWidth = this.hovering ? 1.5 : 1.0;
    offCtx.stroke();

    offCtx.restore();

    // 应用高斯模糊（虚化效果）
    if (blur > 0) {
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(offscreen, 0, 0, s * this.dpr, s * this.dpr, 0, 0, s, s);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(offscreen, 0, 0, s * this.dpr, s * this.dpr, 0, 0, s, s);
    }

    // 叠加辉光
    if (this.hovering) {
      const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.3);
      glowGrad.addColorStop(0, 'transparent');
      glowGrad.addColorStop(0.8, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.05)`);
      glowGrad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.15)`);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, s, s);
    }
  }

  /**
   * 绘制 3D 投影曲线，根据 Z 深度调整透明度
   */
  drawProjectedCurve(ctx, points3D, cx, cy, r) {
    if (points3D.length < 2) return;

    // 将点分成前后两部分（以中心平面为界）
    const front = [];
    const back = [];
    for (const p of points3D) {
      if (p[2] >= 0) {
        front.push([p[0] + cx, p[1] + cy, p[2]]);
      } else {
        back.push([p[0] + cx, p[1] + cy, p[2]]);
      }
    }

    // 先画背面（更淡）
    if (back.length > 1) {
      ctx.beginPath();
      ctx.moveTo(back[0][0], back[0][1]);
      for (let i = 1; i < back.length; i++) {
        ctx.lineTo(back[i][0], back[i][1]);
      }
      ctx.strokeStyle = ctx.strokeStyle.replace(/[\d.]+\)$/, '0.15)');
      ctx.stroke();
    }

    // 再画正面（更亮）
    if (front.length > 1) {
      ctx.beginPath();
      ctx.moveTo(front[0][0], front[0][1]);
      for (let i = 1; i < front.length; i++) {
        ctx.lineTo(front[i][0], front[i][1]);
      }
      ctx.strokeStyle = ctx.strokeStyle.replace(/[\d.]+\)$/, '0.6)');
      ctx.stroke();
    }
  }
}

// ===== 星球渲染器（hover 后的真实纹理球体）=====
class PlanetTextureRenderer {
  constructor(canvas, schemeIndex, seed, size = 100) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.schemeIndex = schemeIndex;
    this.scheme = PLANET_SURFACE_SCHEMES[schemeIndex % PLANET_SURFACE_SCHEMES.length];
    this.seed = seed;
    this.size = size;
    this.rotation = 0;
    this.baseSpeed = 0.008;
    this.currentSpeed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    this.direction = Math.random() > 0.5 ? 1 : -1;
    this.hovering = false;
    this.textureCanvas = document.createElement('canvas');
    this.textureCanvas.width = size;
    this.textureCanvas.height = size;
    this.textureCtx = this.textureCanvas.getContext('2d');
    this.rotationOffset = Math.random() * Math.PI * 2;
    this.dpr = window.devicePixelRatio || 1;

    this.resizeCanvas();
    this.generateTexture();
  }

  resizeCanvas() {
    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
    this.canvas.style.width = this.size + 'px';
    this.canvas.style.height = this.size + 'px';
    this.ctx.scale(this.dpr, this.dpr);
  }

  generateTexture() {
    const pixels = generatePlanetTexture(
      this.size, this.size, this.scheme, this.seed, this.rotationOffset
    );
    const imageData = this.textureCtx.createImageData(this.size, this.size);
    imageData.data.set(pixels);
    this.textureCtx.putImageData(imageData, 0, 0);
  }

  setHovering(hovering) {
    this.hovering = hovering;
    this.targetSpeed = hovering ? this.baseSpeed * 2.2 : this.baseSpeed;
  }

  update() {
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.08;
    this.rotation += this.currentSpeed * this.direction;
    this.rotationOffset += this.currentSpeed * this.direction * 0.5;
  }

  draw() {
    const ctx = this.ctx;
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - 1;

    ctx.clearRect(0, 0, s, s);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // 旋转纹理
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotation);
    ctx.translate(-cx, -cy);
    ctx.drawImage(this.textureCanvas, 0, 0, s, s);
    ctx.restore();

    // 球面光泽
    const grad = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.05,
      cx, cy, r
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.03)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // 边缘辉光
    const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
    const atmosColor = this.scheme.atmosphere;
    rimGrad.addColorStop(0, 'transparent');
    rimGrad.addColorStop(0.85, `rgba(${atmosColor[0]}, ${atmosColor[1]}, ${atmosColor[2]}, 0.05)`);
    rimGrad.addColorStop(1, `rgba(${atmosColor[0]}, ${atmosColor[1]}, ${atmosColor[2]}, 0.25)`);
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, s, s);

    ctx.restore();
  }
}

// ===== 星球管理器 =====
const planetRenderers = [];

/**
 * 初始化所有星球的 canvas 渲染器
 */
function initPlanetRenderers(grid) {
  const cards = grid.querySelectorAll('.result-card');

  cards.forEach((card, index) => {
    const sphereEl = card.querySelector('.planet-sphere');
    if (!sphereEl) return;

    const size = 100;
    const canvas = document.createElement('canvas');
    canvas.className = 'planet-sphere-canvas';
    canvas.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2;
      pointer-events: none;
    `;

    // 颜色方案
    const schemeIndex = index % PLANET_SURFACE_SCHEMES.length;
    const seed = index * 137 + 42;
    const scheme = PLANET_SURFACE_SCHEMES[schemeIndex];
    const wireColor = scheme.atmosphere; // 线框用大气层颜色

    // 创建 wireframe 和 texture 两个渲染器
    const wireRenderer = new WireframeSphereRenderer(canvas, wireColor, size);
    const textureRenderer = new PlanetTextureRenderer(canvas, schemeIndex, seed, size);

    const renderer = {
      wireframe: wireRenderer,
      texture: textureRenderer,
      card: card,
      canvas: canvas,
      size: size,
      // 过渡状态：0 = 完全线框, 1 = 完全纹理
      transition: 0,
      targetTransition: 0,
    };
    planetRenderers.push(renderer);

    sphereEl.replaceWith(canvas);
  });
}

/**
 * 启动星球渲染循环
 */
function startPlanetAnimation() {
  function animate() {
    for (const renderer of planetRenderers) {
      // 平滑过渡线框 <-> 纹理
      const diff = renderer.targetTransition - renderer.transition;
      renderer.transition += diff * 0.06;

      // 更新两个渲染器
      renderer.wireframe.update();
      renderer.texture.update();

      // 绘制
      const s = renderer.size || 100;
      const ctx = renderer.canvas.getContext('2d');
      ctx.clearRect(0, 0, s, s);

      // 绘制线框（alpha 随 transition 降低）
      const wireAlpha = 1 - renderer.transition;
      if (wireAlpha > 0.01) {
        renderer.wireframe.draw();
        // 在 wireframe 上叠加半透明
        ctx.globalAlpha = wireAlpha;
        renderer.wireframe.draw();
        ctx.globalAlpha = 1;
      }

      // 绘制纹理（alpha 随 transition 升高）
      if (renderer.transition > 0.01) {
        renderer.texture.draw();
        ctx.globalAlpha = renderer.transition;
        renderer.texture.draw();
        ctx.globalAlpha = 1;
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

/**
 * 处理星球 hover 事件
 */
function initPlanetHover() {
  document.addEventListener('mouseover', (e) => {
    if (!window.isExploreModeActive?.()) return;
    const card = e.target.closest('.result-card');
    if (!card) return;
    const canvas = card.querySelector('.planet-sphere-canvas');
    if (!canvas) return;
    const r = planetRenderers.find(r => r.canvas === canvas);
    if (r) {
      r.targetTransition = 1;
      r.wireframe.setHovering(true);
      r.texture.setHovering(true);
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!window.isExploreModeActive?.()) return;
    const card = e.target.closest('.result-card');
    if (!card) return;
    const canvas = card.querySelector('.planet-sphere-canvas');
    if (!canvas) return;
    const r = planetRenderers.find(r => r.canvas === canvas);
    if (r) {
      r.targetTransition = 0;
      r.wireframe.setHovering(false);
      r.texture.setHovering(false);
    }
  }, true);
}

// ===== 导出 =====
window.PlanetRenderer = null; // 已废弃
window.initPlanetRenderers = initPlanetRenderers;
window.startPlanetAnimation = startPlanetAnimation;
window.initPlanetHover = initPlanetHover;
window.PLANET_SURFACE_SCHEMES = PLANET_SURFACE_SCHEMES;
