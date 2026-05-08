/**
 * particles.js — Three.js 3D 粒子系统
 * 风格：Active Theory (WebGL诗人) + Ash Thorp (赛博诗意)
 * 
 * 特性：
 * - 真正的 3D 粒子云，GPU 渲染
 * - 鼠标引力场：粒子被鼠标在 3D 空间中吸引
 * - 搜索框聚焦时粒子向中心汇聚
 * - 粒子颜色：青色 / 品红 / 蓝紫 / 琥珀
 * - 粒子连线（Shader 实现）
 * - 粒子脉动 + 旋转
 * - 支持 3000+ 粒子
 */

class ParticleSystem3D {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.canvas = document.getElementById(canvasId);
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0 };
    this.isSearchFocused = false;
    this.time = 0;

    // 配置
    this.config = {
      particleCount: 3000,
      spread: 40,           // 粒子分布范围
      mouseRadius: 8,       // 鼠标引力半径
      mouseForce: 0.04,     // 鼠标引力强度
      returnSpeed: 0.008,   // 返回原始位置速度
      baseSpeed: 0.002,     // 基础漂浮速度
      connectionDistance: 1.5,
      pulseSpeed: 1.5,
    };

    // 颜色
    this.colors = [
      new Float32Array([0, 0.94, 1]),       // cyan
      new Float32Array([1, 0, 0.43]),       // magenta
      new Float32Array([0.45, 0.035, 0.51]), // purple
      new Float32Array([1, 0.74, 0.04]),     // amber
    ];
    this.colorWeights = [0.45, 0.25, 0.2, 0.1];

    this.init();
  }

  init() {
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.createParticles();
    this.createConnections();
    this.bindEvents();
    this.animate();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
  }

  setupScene() {
    this.scene = new THREE.Scene();
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.z = 30;
  }

  createParticles() {
    const count = this.config.particleCount;
    const positions = new Float32Array(count * 3);
    const originalPositions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colorArray = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const alphas = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const spread = this.config.spread;

      // 3D 球体分布
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * spread;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      originalPositions[i3] = x;
      originalPositions[i3 + 1] = y;
      originalPositions[i3 + 2] = z;

      velocities[i3] = (Math.random() - 0.5) * this.config.baseSpeed;
      velocities[i3 + 1] = (Math.random() - 0.5) * this.config.baseSpeed;
      velocities[i3 + 2] = (Math.random() - 0.5) * this.config.baseSpeed * 0.5;

      // 颜色分配
      const rand = Math.random();
      let colorIndex = 0;
      let acc = 0;
      for (let c = 0; c < this.colorWeights.length; c++) {
        acc += this.colorWeights[c];
        if (rand < acc) { colorIndex = c; break; }
      }
      const color = this.colors[colorIndex];
      colorArray[i3] = color[0];
      colorArray[i3 + 1] = color[1];
      colorArray[i3 + 2] = color[2];

      sizes[i] = 0.5 + Math.random() * 2.0;
      phases[i] = Math.random() * Math.PI * 2;
      alphas[i] = 0.3 + Math.random() * 0.7;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    // 自定义 Shader 材质 — 粒子发光效果
    const vertexShader = `
      attribute float size;
      attribute float phase;
      attribute float alpha;
      attribute vec3 color;
      
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      
      void main() {
        vColor = color;
        // 脉动效果
        float pulse = 1.0 + 0.3 * sin(uTime * 1.5 + phase);
        vAlpha = alpha * pulse;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pulse * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      varying vec3 vColor;
      varying float vAlpha;
      
      void main() {
        // 圆形粒子 + 发光
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // 外发光
        float glow = exp(-dist * 4.0) * 0.6;
        // 核心亮点
        float core = smoothstep(0.15, 0.0, dist);
        
        float alpha = vAlpha * (glow + core * 0.8);
        vec3 finalColor = vColor + core * 0.3;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    // 保存引用用于更新
    this.positions = positions;
    this.originalPositions = originalPositions;
    this.velocities = velocities;
    this.count = count;
  }

  createConnections() {
    // 使用 LineSegments 绘制粒子连线
    // 由于 3000 粒子全量连线性能不可接受，我们限制连线数量
    const maxConnections = 2000;
    const connectionPositions = new Float32Array(maxConnections * 6); // 2 points per line * 3 coords
    const connectionColors = new Float32Array(maxConnections * 6);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(connectionPositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(connectionColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.scene.add(this.lines);

    this.maxConnections = maxConnections;
    this.connectionPositions = connectionPositions;
    this.connectionColors = connectionColors;
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      // NDC 坐标
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.ndcX = 0;
      this.mouse.ndcY = 0;
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('focus', () => { this.isSearchFocused = true; });
      searchInput.addEventListener('blur', () => { this.isSearchFocused = false; });
    }
  }

  update() {
    this.time += 0.016;
    const { mouseRadius, mouseForce, returnSpeed, baseSpeed } = this.config;

    // 鼠标在 3D 空间中的位置（通过射线投射到 z=0 平面）
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(this.mouse.ndcX, this.mouse.ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const mouse3D = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, mouse3D);

    // 搜索聚焦时的汇聚目标
    let attractTarget = null;
    if (this.isSearchFocused) {
      attractTarget = new THREE.Vector3(0, 0, 0);
    }

    const posAttr = this.particles.geometry.attributes.position;
    const velAttr = this.particles.geometry.attributes.velocity;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let px = this.positions[i3];
      let py = this.positions[i3 + 1];
      let pz = this.positions[i3 + 2];
      let vx = this.velocities[i3];
      let vy = this.velocities[i3 + 1];
      let vz = this.velocities[i3 + 2];

      // 基础漂浮
      px += vx;
      py += vy;
      pz += vz;

      // 鼠标引力场
      if (mouse3D) {
        const dx = mouse3D.x - px;
        const dy = mouse3D.y - py;
        const dz = mouse3D.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < mouseRadius && dist > 0.1) {
          const force = (1 - dist / mouseRadius) * mouseForce;
          vx += (dx / dist) * force;
          vy += (dy / dist) * force;
          vz += (dz / dist) * force * 0.3;
        }
      }

      // 搜索汇聚
      if (attractTarget) {
        const dx = attractTarget.x - px;
        const dy = attractTarget.y - py;
        const dz = attractTarget.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 1) {
          vx += dx * returnSpeed * 2;
          vy += dy * returnSpeed * 2;
          vz += dz * returnSpeed * 2;
        }
      }

      // 缓慢返回原始位置
      vx += (this.originalPositions[i3] - px) * returnSpeed;
      vy += (this.originalPositions[i3 + 1] - py) * returnSpeed;
      vz += (this.originalPositions[i3 + 2] - pz) * returnSpeed;

      // 速度阻尼
      vx *= 0.97;
      vy *= 0.97;
      vz *= 0.97;

      // 缓慢旋转
      const rotSpeed = 0.0001;
      const cosR = Math.cos(rotSpeed);
      const sinR = Math.sin(rotSpeed);
      const rx = px * cosR - pz * sinR;
      const rz = px * sinR + pz * cosR;
      px = rx;
      pz = rz;

      this.positions[i3] = px;
      this.positions[i3 + 1] = py;
      this.positions[i3 + 2] = pz;
      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;
    }

    posAttr.needsUpdate = true;
    velAttr.needsUpdate = true;

    // 更新连线（采样部分粒子以保持性能）
    this.updateConnections();

    // 更新 shader uniform
    this.particles.material.uniforms.uTime.value = this.time;

    // 缓慢旋转整个粒子系统
    this.particles.rotation.y = this.time * 0.02;
    this.particles.rotation.x = Math.sin(this.time * 0.01) * 0.05;
    this.lines.rotation.copy(this.particles.rotation);
  }

  updateConnections() {
    const { connectionDistance } = this.config;
    let connectionCount = 0;

    // 采样粒子（每 5 个粒子采样 1 个）
    const step = Math.max(1, Math.floor(this.count / 500));

    outer: for (let i = 0; i < this.count && connectionCount < this.maxConnections; i += step) {
      const i3 = i * 3;
      for (let j = i + step; j < this.count && connectionCount < this.maxConnections; j += step) {
        const j3 = j * 3;
        const dx = this.positions[i3] - this.positions[j3];
        const dy = this.positions[i3 + 1] - this.positions[j3 + 1];
        const dz = this.positions[i3 + 2] - this.positions[j3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < connectionDistance) {
          const lineIndex = connectionCount * 6;
          this.connectionPositions[lineIndex] = this.positions[i3];
          this.connectionPositions[lineIndex + 1] = this.positions[i3 + 1];
          this.connectionPositions[lineIndex + 2] = this.positions[i3 + 2];
          this.connectionPositions[lineIndex + 3] = this.positions[j3];
          this.connectionPositions[lineIndex + 4] = this.positions[j3 + 1];
          this.connectionPositions[lineIndex + 5] = this.positions[j3 + 2];

          const opacity = (1 - dist / connectionDistance) * 0.5;
          this.connectionColors[lineIndex] = 0;
          this.connectionColors[lineIndex + 1] = 0.94;
          this.connectionColors[lineIndex + 2] = 1;
          this.connectionColors[lineIndex + 3] = 0;
          this.connectionColors[lineIndex + 4] = 0.94;
          this.connectionColors[lineIndex + 5] = 1;

          connectionCount++;
        }
      }
    }

    // 清空未使用的连线
    for (let i = connectionCount * 6; i < this.maxConnections * 6; i++) {
      this.connectionPositions[i] = 0;
    }

    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, connectionCount * 2);
  }

  animate() {
    this.update();
    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  // ===== 宇宙探索模式 =====
  setExploreMode(active) {
    this.isExploreMode = active;
    if (active) {
      // 探索模式：粒子加速向外扩散，模拟超光速飞行
      this.config.baseSpeed = 0.008;
      this.config.mouseForce = 0.02;
      this.config.returnSpeed = 0.003;
    } else {
      // 恢复普通模式
      this.config.baseSpeed = 0.002;
      this.config.mouseForce = 0.04;
      this.config.returnSpeed = 0.008;
    }
  }

  triggerBoost() {
    if (!this.isExploreMode) return;
    this.boostTimer = 2.0; // 加速持续2秒
  }

  // ===== 宇宙探索模式 =====
  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }
    if (this.lines) {
      this.lines.geometry.dispose();
      this.lines.material.dispose();
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticleSystem3D;
}
