/* Einmaleins – 3D-Spiele (three.js, MIT-Lizenz, liegt in js/vendor)
 *
 * Elfmeter aus der Sicht des Balls, Meteoriten aus dem Cockpit der Rakete, Frosch-Hüpfen aus den Augen des Froschs.
 * Die Zahlen sind HTML-Schilder, die jedes Bild an die richtige Stelle im Raum gesetzt werden: gut lesbar und
 * gut antippbar. Gibt es kein WebGL (sehr alte Geräte), laufen die bisherigen 2D-Versionen.
 */
'use strict';

let THREE = null;
let threeLoading = null;
function loadThree() {
  if (THREE) return Promise.resolve(THREE);
  if (!threeLoading) {
    threeLoading = import(new URL('js/vendor/three.module.min.js', document.baseURI).href)
      .then((m) => { THREE = m; return m; })
      .catch((e) => { threeLoading = null; throw e; });
  }
  return threeLoading;
}
const webglOK = (() => {
  let ok = null;
  return () => {
    if (ok != null) return ok;
    try { const c = document.createElement('canvas'); ok = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { ok = false; }
    return ok;
  };
})();

/* ---------------- Gemeinsame Bühne ---------------- */
const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
function createStage(host, { fov = 55, near = 0.05, far = 600, shadows = false, clear = 0x000000 } = {}) {
  const T = THREE;
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(clear);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; }
  renderer.domElement.className = 'g3-canvas';
  host.appendChild(renderer.domElement);
  const overlay = document.createElement('div');
  overlay.className = 'g3-labels';
  host.appendChild(overlay);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(fov, 1, near, far);
  const st = {
    T, renderer, scene, camera, overlay, host, labels: new Set(), frameFns: new Set(), tweens: new Set(),
    shakeAmt: 0, raf: 0, last: performance.now(), time: 0, w: 1, h: 1, disposed: false,
  };
  const v = new T.Vector3();
  function resize() {
    const r = host.getBoundingClientRect();
    st.w = Math.max(1, r.width); st.h = Math.max(1, r.height);
    renderer.setSize(st.w, st.h, false);
    camera.aspect = st.w / st.h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  /** Schild an einer Stelle im Raum. pos(): Vector3. Grösse wächst, je näher es ist. */
  st.addLabel = (el, pos, { base = 1, min = 0.45, max = 1.6, dist = 6 } = {}) => {
    const L = { el, pos, base, min, max, dist };
    overlay.appendChild(el);
    st.labels.add(L);
    return L;
  };
  st.removeLabel = (L) => { if (!L) return; L.el.remove(); st.labels.delete(L); };
  st.onFrame = (fn) => { st.frameFns.add(fn); return () => st.frameFns.delete(fn); };
  /** Einfache Animation: fn(t 0..1, e) während ms; liefert ein Promise */
  st.tween = (ms, fn, easing = ease.inOut) => new Promise((resolve) => {
    const tw = { t0: st.time, ms: reduceMotion() ? 1 : ms, fn, easing, resolve };
    st.tweens.add(tw);
  });
  st.shake = (a) => { st.shakeAmt = Math.max(st.shakeAmt, a); };
  st.project = (p) => {
    v.copy(p).project(camera);
    return { x: (v.x + 1) / 2 * st.w, y: (1 - v.y) / 2 * st.h, z: v.z };
  };
  const camShake = new T.Vector3();
  function frame(now) {
    if (st.disposed) return;
    const dt = Math.min(0.05, (now - st.last) / 1000);
    st.last = now; st.time += dt * 1000;
    for (const tw of [...st.tweens]) {
      const t = clamp((st.time - tw.t0) / tw.ms, 0, 1);
      tw.fn(t, tw.easing(t));
      if (t >= 1) { st.tweens.delete(tw); tw.resolve(); }
    }
    for (const fn of st.frameFns) fn(dt, st.time / 1000);
    camera.position.sub(camShake);
    if (st.shakeAmt > 0.001) {
      camShake.set((Math.random() - 0.5) * st.shakeAmt, (Math.random() - 0.5) * st.shakeAmt, 0);
      st.shakeAmt *= Math.pow(0.02, dt);
    } else camShake.set(0, 0, 0);
    camera.position.add(camShake);
    renderer.render(scene, camera);
    for (const L of st.labels) {
      const p = typeof L.pos === 'function' ? L.pos() : L.pos;
      if (!p) { L.el.style.display = 'none'; continue; }
      const q = st.project(p);
      const d = camera.position.distanceTo(p);
      if (q.z > 1 || q.z < -1) { L.el.style.display = 'none'; continue; }
      L.el.style.display = '';
      const sc = clamp((L.dist / Math.max(0.1, d)) * L.base, L.min, L.max);
      L.el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      L.el.style.zIndex = String(1000 - Math.round(d * 10));
    }
    st.raf = requestAnimationFrame(frame);
  }
  st.raf = requestAnimationFrame(frame);
  st.dispose = () => {
    st.disposed = true;
    cancelAnimationFrame(st.raf);
    ro.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => { Object.values(m).forEach((x) => x?.isTexture && x.dispose()); m.dispose(); });
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
    overlay.remove();
  };
  return st;
}
function canvasTex(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, inner); r.addColorStop(1, outer);
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
}
/** Funken/Explosion: Partikel, die auseinanderfliegen und verblassen */
function burst(st, pos, { n = 90, colors = [0xffc233, 0xff6b4a, 0xffffff], speed = 4, life = 0.9, size = 0.18, gravity = -3, spread = 1 } = {}) {
  const T = THREE;
  const geo = new T.BufferGeometry();
  const p = new Float32Array(n * 3), vel = [], col = new Float32Array(n * 3);
  const cc = colors.map((c) => new T.Color(c));
  for (let i = 0; i < n; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    const dir = new T.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8) * spread);
    vel.push(dir);
    const c = cc[i % cc.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new T.BufferAttribute(p, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  const mat = new T.PointsMaterial({ size, map: st.dot || (st.dot = glowTex()), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const pts = new T.Points(geo, mat);
  st.scene.add(pts);
  let age = 0;
  const off = st.onFrame((dt) => {
    age += dt;
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      vel[i].y += gravity * dt;
      a[i * 3] += vel[i].x * dt; a[i * 3 + 1] += vel[i].y * dt; a[i * 3 + 2] += vel[i].z * dt;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - age / life);
    if (age >= life) { off(); st.scene.remove(pts); geo.dispose(); mat.dispose(); }
  });
}
/** Grosses Wort mitten im Bild (TOR!, GEHALTEN! …) */
function bigWord(host, html, cls = '') {
  const el = document.createElement('div');
  el.className = `g3-word ${cls}`;
  el.innerHTML = html;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
function g3Label(html, cls, data = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `g3-tag ${cls}`;
  b.innerHTML = html;
  Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v; });
  return b;
}
/** Kurzes Rauschen (Jubel, Wind, Platschen) */
function noise(dur = 0.8, { freq = 1200, q = 0.6, gain = 0.12, sweep = 0 } = {}) {
  if (!db.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), audioCtx.currentTime + dur);
    const g = audioCtx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(audioCtx.destination);
    src.start();
  } catch { /* */ }
}

/* =========================================================
   ⚽ Elfmeter 3D – aus der Sicht des Balls
   ========================================================= */
async function startElfmeter3D() {
  const T = await loadThree();
  const lvl = db.settings.elfLevel === 2 ? 2 : 1;
  Object.assign(game, { picker: gamePicker(), shots: 0, goals: 0, max: 10, level: lvl, hist: [], locked: true });
  $('#view').innerHTML = gameShell('elfmeter', `
    <div class="g3 g3-elf" id="g3">
      <div class="g3-hud top"><div class="elf-board"><span class="eb-label">Schuss <b id="eshot">1</b>/10</span><span class="eb-task" id="etask"></span><span class="eb-label">Tore <b id="goals">0</b></span></div></div>
      <div class="g3-hud shots" id="shots">${'<i></i>'.repeat(10)}</div>
      ${lvl === 2 ? '<div class="g3-clock" id="sclock"><i></i></div>' : ''}
    </div>
    <p class="mode-hint">Tippe auf das Tor-Eck mit dem richtigen Ergebnis – der Ball fliegt los.${lvl === 2 ? ' Profi: 6 Sekunden pro Schuss.' : ''}</p>`);
  const host = $('#g3');
  const st = createStage(host, { fov: 40, shadows: true, clear: 0x7fb6e6 });
  game.stage3d = st;
  const { scene, camera } = st;
  scene.fog = new T.Fog(0x9cc8ef, 40, 120);
  // Licht: Abendsonne und Flutlicht
  scene.add(new T.HemisphereLight(0xdbeeff, 0x3f6b2a, 1.1));
  const sun = new T.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(-8, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -4, near: 1, far: 50 });
  scene.add(sun);
  // Himmel
  const sky = new T.Mesh(new T.SphereGeometry(200, 32, 16), new T.MeshBasicMaterial({ side: T.BackSide, map: canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2f6fc4'); gr.addColorStop(0.45, '#8cc4f2'); gr.addColorStop(0.55, '#f7d9a8'); gr.addColorStop(1, '#f7d9a8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }), fog: false }));
  scene.add(sky);
  // Rasen mit Mähstreifen
  const grass = canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3f9a45' : '#4aa851'; g.fillRect(0, (i * h) / 8, w, h / 8); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40},${90 + Math.random() * 70},${30 + Math.random() * 30},.35)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3); }
  }, { repeat: [6, 6] });
  const pitch = new T.Mesh(new T.PlaneGeometry(90, 90), new T.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.z = 20; pitch.receiveShadow = true;
  scene.add(pitch);
  // Linien
  const lineMat = new T.MeshBasicMaterial({ color: 0xf4f8f2 });
  const line = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new T.Mesh(new T.PlaneGeometry(len, 0.12), lineMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
    m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
    scene.add(m);
  };
  line(-30, 0, 30, 0); line(-9.16, 0, -9.16, 5.5); line(9.16, 0, 9.16, 5.5); line(-9.16, 5.5, 9.16, 5.5);
  line(-20.16, 0, -20.16, 16.5); line(20.16, 0, 20.16, 16.5); line(-20.16, 16.5, 20.16, 16.5);
  const arc = new T.Mesh(new T.RingGeometry(9.1, 9.22, 64, 1, Math.PI * 0.2, Math.PI * 0.6), lineMat);
  arc.rotation.x = -Math.PI / 2; arc.position.set(0, 0.006, 11); scene.add(arc);
  const spot = new T.Mesh(new T.CircleGeometry(0.13, 24), lineMat);
  spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.007, 11); scene.add(spot);
  // Tribüne mit Publikum
  const crowd = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#26334a'; g.fillRect(0, 0, w, h);
    const cols = ['#ff6b4a', '#ffc233', '#ffffff', '#0f766e', '#38bdf8', '#e11d48', '#a855f7', '#22c55e'];
    for (let row = 0; row < 14; row++) for (let i = 0; i < 120; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.beginPath(); g.arc(i * 8.6 + (row % 2) * 4 + Math.random() * 2, h - 10 - row * 17, 3.4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let row = 0; row < 14; row++) g.fillRect(0, h - 4 - row * 17, w, 2);
  });
  const stand = new T.Mesh(new T.CylinderGeometry(55, 48, 16, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76), new T.MeshStandardMaterial({ map: crowd, side: T.BackSide, roughness: 1 }));
  stand.position.set(0, 7, 18);
  scene.add(stand);
  const roof = new T.Mesh(new T.CylinderGeometry(56, 56, 1, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76), new T.MeshStandardMaterial({ color: 0xdfe6ee, side: T.DoubleSide }));
  roof.position.set(0, 15.5, 18); scene.add(roof);
  const lightMat = new T.SpriteMaterial({ map: glowTex('rgba(255,255,240,1)', 'rgba(255,255,200,0)'), blending: T.AdditiveBlending, depthWrite: false });
  [-40, -26, 26, 40].forEach((x) => { const sp = new T.Sprite(lightMat); sp.position.set(x, 24, -34); sp.scale.set(3.2, 3.2, 1); scene.add(sp); });
  // Werbebanden
  const ads = canvasTex(1024, 64, (g, w, h) => {
    const items = [['#0f766e', '1×1'], ['#ff6b4a', 'RECHNEN'], ['#2563eb', 'FAIR PLAY'], ['#ffc233', 'TOOOR'], ['#9333ea', '7·8=56']];
    items.forEach(([c, t], i) => { g.fillStyle = c; g.fillRect((i * w) / 5, 0, w / 5, h); g.fillStyle = '#fff'; g.font = 'bold 34px system-ui'; g.textAlign = 'center'; g.fillText(t, (i + 0.5) * (w / 5), 45); });
  }, { repeat: [3, 1] });
  const boards = new T.Mesh(new T.PlaneGeometry(70, 0.9), new T.MeshBasicMaterial({ map: ads }));
  boards.position.set(0, 0.45, -8.5); scene.add(boards);
  // Tor
  const GW = 7.32, GH = 2.44, GD = 2;
  const postMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
  const post = (x) => { const m = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, GH, 16), postMat); m.position.set(x, GH / 2, 0); m.castShadow = true; scene.add(m); };
  post(-GW / 2); post(GW / 2);
  const bar = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, GW + 0.12, 16), postMat);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, GH, 0); bar.castShadow = true; scene.add(bar);
  const netTex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo((i * w) / 8, 0); g.lineTo((i * w) / 8 - w / 16, h); g.stroke(); g.beginPath(); g.moveTo(0, (i * h) / 8); g.lineTo(w, (i * h) / 8); g.stroke(); }
  }, { repeat: [8, 3] });
  const netMat = new T.MeshStandardMaterial({ map: netTex, transparent: true, side: T.DoubleSide, alphaTest: 0.05, roughness: 1 });
  const backNet = new T.Mesh(new T.PlaneGeometry(GW, Math.hypot(GH, GD * 0.6), 30, 12), netMat);
  backNet.position.set(0, GH / 2, -GD * 0.7); backNet.rotation.x = -Math.atan2(GD * 0.6, GH);
  scene.add(backNet);
  const backBase = backNet.geometry.attributes.position.array.slice();
  [-1, 1].forEach((sgn) => {
    const side = new T.Mesh(new T.PlaneGeometry(GD, GH), netMat);
    side.rotation.y = Math.PI / 2; side.position.set((sgn * GW) / 2, GH / 2, -GD / 2); scene.add(side);
  });
  const top = new T.Mesh(new T.PlaneGeometry(GW, GD * 0.4), netMat);
  top.rotation.x = Math.PI / 2; top.position.set(0, GH, -GD * 0.2); scene.add(top);
  let netHit = null; // {x, y, t}
  st.onFrame((dt) => {
    const pos = backNet.geometry.attributes.position;
    if (!netHit) return;
    netHit.t += dt;
    const k = Math.exp(-netHit.t * 3) * Math.cos(netHit.t * 18) * 0.7;
    for (let i = 0; i < pos.count; i++) {
      const x = backBase[i * 3], y = backBase[i * 3 + 1];
      const d2 = (x - netHit.x) ** 2 + (y - (netHit.y - GH / 2)) ** 2;
      pos.array[i * 3 + 2] = backBase[i * 3 + 2] - k * Math.exp(-d2 * 0.9);
    }
    pos.needsUpdate = true;
    if (netHit.t > 2) { netHit = null; pos.array.set(backBase); pos.needsUpdate = true; }
  });
  // Torhüter aus einfachen Formen
  const keeper = new T.Group();
  const kMat = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const jersey = kMat(0xffb020), skin = kMat(0xf2c9a0), shorts = kMat(0x1f2937), glove = kMat(0x22c55e), sock = kMat(0xffb020);
  const torso = new T.Mesh(new T.CapsuleGeometry(0.24, 0.42, 6, 16), jersey); torso.position.y = 1.18; keeper.add(torso);
  const num = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), new T.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#7c4a00'; g.font = 'bold 54px system-ui'; g.textAlign = 'center'; g.fillText('1', 32, 52); }), transparent: true }));
  num.position.set(0, 1.25, 0.245); keeper.add(num);
  const hips = new T.Mesh(new T.CylinderGeometry(0.25, 0.23, 0.22, 16), shorts); hips.position.y = 0.82; keeper.add(hips);
  const head = new T.Mesh(new T.SphereGeometry(0.16, 20, 16), skin); head.position.y = 1.66; keeper.add(head);
  const hair = new T.Mesh(new T.SphereGeometry(0.165, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), kMat(0x5b3a1e)); hair.position.y = 1.68; keeper.add(hair);
  const limb = (mat, r, len) => { const g = new T.Group(); const m = new T.Mesh(new T.CapsuleGeometry(r, len, 4, 10), mat); m.position.y = -len / 2 - r; m.castShadow = true; g.add(m); return g; };
  const armL = limb(jersey, 0.07, 0.5), armR = limb(jersey, 0.07, 0.5);
  armL.position.set(-0.32, 1.42, 0); armR.position.set(0.32, 1.42, 0);
  [armL, armR].forEach((a) => { const gl = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), glove); gl.position.y = -0.72; a.add(gl); keeper.add(a); });
  const legL = limb(sock, 0.09, 0.55), legR = limb(sock, 0.09, 0.55);
  legL.position.set(-0.13, 0.78, 0); legR.position.set(0.13, 0.78, 0); keeper.add(legL, legR);
  keeper.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  keeper.scale.setScalar(1.12);
  keeper.position.set(0, 0, 0.35);
  scene.add(keeper);
  let keeperDive = null;
  st.onFrame((dt, t) => {
    if (keeperDive) return;
    keeper.position.x = Math.sin(t * 1.7) * 0.45;
    keeper.position.y = Math.abs(Math.sin(t * 3.4)) * 0.05;
    armL.rotation.z = -0.9 + Math.sin(t * 3.4) * 0.12; armR.rotation.z = 0.9 - Math.sin(t * 3.4) * 0.12;
    keeper.rotation.z = 0;
  });
  // Ball
  const ballTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2937';
    const pent = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); } g.closePath(); g.fill(); };
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) pent(i * (w / 6) + (row % 2) * (w / 12) + 20, 40 + row * 88, 28);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
  });
  const ball = new T.Mesh(new T.SphereGeometry(0.11, 32, 20), new T.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
  ball.castShadow = true;
  scene.add(ball);
  const START = { cam: new T.Vector3(0, 0.82, 13.3), look: new T.Vector3(0, 0.95, 0), ball: new T.Vector3(0, 0.11, 11) };
  const look = START.look.clone();
  function resetScene() {
    camera.position.copy(START.cam); look.copy(START.look); camera.lookAt(look);
    ball.position.copy(START.ball); ball.rotation.set(0, 0, 0); ball.visible = true;
    keeperDive = null; keeper.rotation.set(0, 0, 0);
  }
  resetScene();
  st.onFrame(() => camera.lookAt(look));
  // Ziele im Tor
  const SPOTS = lvl === 2
    ? [[-2.65, 1.85], [2.65, 1.85], [-2.65, 0.55], [2.65, 0.55]]
    : [[-2.55, 1.55], [0, 2.0], [2.55, 1.55]];
  const ringMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  const rings = SPOTS.map(([x, y]) => { const r = new T.Mesh(new T.RingGeometry(0.34, 0.42, 40), ringMat.clone()); r.position.set(x, y, -0.05); scene.add(r); return r; });
  st.onFrame((dt, t) => rings.forEach((r, i) => { r.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.06); }));
  let labels = [];
  function nextShot() {
    labels.forEach((L) => st.removeLabel(L)); labels = [];
    if (game.shots >= game.max) { elfEnd(); return; }
    resetScene();
    const t = game.picker.next();
    game.task = t;
    const opts = choicesFor(t, SPOTS.length);
    $('#etask').innerHTML = taskHTML(t, '<span class="slot">?</span>');
    $('#eshot').textContent = game.shots + 1;
    rings.forEach((r) => r.material.color.set(0xffffff));
    labels = opts.map((o, i) => {
      const el = g3Label(String(o), 'elf-tag', { action: 'g3-pick', i, v: o });
      return st.addLabel(el, new T.Vector3(SPOTS[i][0], SPOTS[i][1], 0), { dist: 12.5, base: 1, min: 0.7, max: 1.5 });
    });
    game.locked = false;
    t.shownAt = performance.now();
    if (game.level === 2) {
      const c = $('#sclock i');
      c.getAnimations().forEach((a) => a.cancel());
      c.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 6000, fill: 'forwards' });
      game.clockT = gLater(() => shoot(null), 6000);
    }
  }
  async function shoot(el) {
    if (game.locked) return;
    game.locked = true;
    clearTimeout(game.clockT);
    $('#sclock i')?.getAnimations().forEach((a) => a.pause());
    const t = game.task;
    const i = el ? +el.dataset.i : rand(SPOTS.length);
    const v = el ? el.dataset.v : '';
    const ok = recordAnswer(t, v, performance.now() - t.shownAt);
    const rightI = labels.findIndex((L) => Number(L.el.dataset.v) === t.answer);
    labels.forEach((L) => L.el.classList.add('fade'));
    el?.classList.remove('fade');
    const [tx, ty] = SPOTS[i];
    const target = new T.Vector3(tx, ty, ok ? -0.9 : 0.25);
    // Torhüter: hält bei falscher Antwort, springt sonst in eine andere Ecke
    const diveI = ok ? (SPOTS.length > 1 ? (i + 1 + rand(SPOTS.length - 1)) % SPOTS.length : i) : i;
    const [dx, dy] = SPOTS[diveI];
    keeperDive = true;
    const k0 = keeper.position.clone();
    const side = Math.abs(dx) < 1 ? 0 : Math.sign(dx); // Mitte: gerade hochspringen
    st.tween(520, (u, e) => {
      keeper.position.x = k0.x + (dx * 0.82 - k0.x) * e;
      keeper.position.y = side ? Math.max(0, Math.sin(u * Math.PI) * (dy > 1.2 ? 0.9 : 0.35)) + (dy - 1.2) * 0.2 * e : Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) * 0.7;
      keeper.rotation.z = -side * 1.25 * e;
      armL.rotation.z = -0.9 - 1.6 * e * (side > 0 ? 0.2 : 1.1); armR.rotation.z = 0.9 + 1.6 * e * (side < 0 ? 0.2 : 1.1);
    }, ease.out);
    sfx.kick();
    noise(0.25, { freq: 500, gain: 0.08 });
    const p0 = START.ball.clone();
    const ctrl = new T.Vector3(tx * 0.35 + (Math.random() - 0.5) * 1.5, Math.max(ty, 1.0) + 0.9, 5.5);
    const bez = (u) => p0.clone().multiplyScalar((1 - u) ** 2).add(ctrl.clone().multiplyScalar(2 * u * (1 - u))).add(target.clone().multiplyScalar(u * u));
    const cam0 = camera.position.clone(), look0 = look.clone();
    await st.tween(760, (u, e) => {
      const bp = bez(e);
      ball.position.copy(bp);
      ball.rotation.x -= 0.5; ball.rotation.y += 0.2;
      // Kamera fliegt hinter dem Ball her
      const behind = bp.clone().add(new T.Vector3(0, 0.38, 1.9));
      camera.position.lerpVectors(cam0, behind, Math.min(1, e * 0.92));
      look.lerpVectors(look0, new T.Vector3(tx * 0.6, ty * 0.8 + 0.3, -1), e);
    }, (x) => 1 - Math.pow(1 - x, 1.6));
    game.shots++;
    game.hist.push(ok);
    if (ok) {
      game.goals++;
      netHit = { x: tx, y: ty, t: 0 };
      st.shake(0.12);
      burst(st, target.clone().setZ(-0.2), { n: 140, colors: [0xffc233, 0xff6b4a, 0x38bdf8, 0x22c55e, 0xffffff], speed: 5, life: 1.4, size: 0.12, gravity: -2 });
      sfx.win(); noise(1.6, { freq: 900, q: 0.4, gain: 0.16 });
      bigWord(host, 'TOR!', 'good');
      host.classList.remove('flash'); void host.offsetWidth; host.classList.add('flash');
      st.tween(500, (u, e) => { ball.position.z = target.z - 0.5 * e; ball.position.y = ty * (1 - e) + 0.11 * e; });
    } else {
      sfx.bad(); noise(0.4, { freq: 300, gain: 0.08 });
      st.shake(0.05);
      bigWord(host, `${el ? 'Gehalten!' : 'Zu spät!'}<small>${esc(taskText(t, true))}</small>`, 'bad');
      st.tween(400, (u, e) => { ball.position.z = target.z + 0.6 * e; ball.position.y = Math.max(0.11, ty - ty * e); });
      if (rightI >= 0) { labels[rightI].el.classList.remove('fade'); labels[rightI].el.classList.add('right'); rings[rightI].material.color.set(0x22c55e); }
    }
    el?.classList.add(ok ? 'right' : 'wrong');
    $('#goals').textContent = game.goals;
    $$('#shots i').forEach((x, k) => { x.className = k < game.hist.length ? (game.hist[k] ? 'hit' : 'miss') : ''; });
    await sleep(ok ? 1300 : 2100);
    if (st.disposed) return;
    const camA = camera.position.clone(), lookA = look.clone();
    keeperDive = null;
    await st.tween(650, (u, e) => { camera.position.lerpVectors(camA, START.cam, e); look.lerpVectors(lookA, START.look, e); });
    if (!st.disposed) nextShot();
  }
  game.pick = shoot;
  setGameKeys((e) => { if (/^[1-4]$/.test(e.key)) { const L = labels[+e.key - 1]; if (L) shoot(L.el); } });
  nextShot();
}

/* =========================================================
   ☄️ Meteoriten 3D – aus dem Cockpit
   ========================================================= */
async function startMeteor3D() {
  const T = await loadThree();
  Object.assign(game, { picker: gamePicker(), lives: 3, score: 0, wave: [], task: null, over: false, streak: 0, recorded: false });
  $('#view').innerHTML = gameShell('meteor', `
    <div class="g3 g3-space" id="g3">
      <div class="cockpit" aria-hidden="true"><svg viewBox="0 0 1000 600" preserveAspectRatio="none"><path d="M0 0h1000v600H0z M60 40 Q500 -10 940 40 L990 470 Q500 420 10 470 Z" fill="#0b1226" fill-rule="evenodd" opacity=".92"/><path d="M60 40 Q500 -10 940 40 L990 470 Q500 420 10 470 Z" fill="none" stroke="#38bdf8" stroke-width="3" opacity=".6"/><path d="M500 6v26M0 470h1000" stroke="#38bdf8" stroke-width="2" opacity=".35"/></svg></div>
      <div class="g3-hud dash">
        <span class="lives" id="lives">${'<i class="on"></i>'.repeat(3)}</span>
        <span class="dash-task" id="mtask"></span>
        <span class="m-score">Treffer <b id="mscore">0</b></span>
      </div>
      <div class="crack" id="crack" aria-hidden="true"><svg viewBox="0 0 400 300"><path d="M200 150 L120 60 M200 150 L300 40 M200 150 L360 190 M200 150 L90 230 M200 150 L230 290 M120 60 L80 20 M300 40 L340 10 M360 190 L400 200 M90 230 L30 260 M150 105 L110 120 M260 95 L290 110 M280 170 L300 150" stroke="#fff" stroke-width="2.5" fill="none" opacity=".85"/></svg></div>
    </div>
    <p class="mode-hint">Tippe den Meteoriten mit dem richtigen Ergebnis an, bevor er die Rakete trifft.</p>`);
  const host = $('#g3');
  const st = createStage(host, { fov: 68, clear: 0x03040c });
  game.stage3d = st;
  const { scene, camera } = st;
  camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1);
  scene.fog = new T.FogExp2(0x03040c, 0.006);
  scene.add(new T.AmbientLight(0x6070a0, 0.8));
  const key = new T.DirectionalLight(0xffe2c0, 2.4); key.position.set(4, 3, 2); scene.add(key);
  const rim = new T.DirectionalLight(0x6aa8ff, 1.2); rim.position.set(-5, -2, -6); scene.add(rim);
  // Sterne, die vorbeiziehen
  const N = 1800;
  const sGeo = new T.BufferGeometry();
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 160, (Math.random() - 0.5) * 100, -Math.random() * 300], i * 3);
  sGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
  const stars = new T.Points(sGeo, new T.PointsMaterial({ size: 0.45, map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xdfe9ff }));
  scene.add(stars);
  // Lichtstreifen bei hoher Geschwindigkeit
  const L = 160;
  const lGeo = new T.BufferGeometry();
  const lp = new Float32Array(L * 6);
  const lineInit = (i) => { const x = (Math.random() - 0.5) * 60, y = (Math.random() - 0.5) * 40, z = -Math.random() * 200; lp.set([x, y, z, x, y, z - 4], i * 6); };
  for (let i = 0; i < L; i++) lineInit(i);
  lGeo.setAttribute('position', new T.BufferAttribute(lp, 3));
  const streaks = new T.LineSegments(lGeo, new T.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
  scene.add(streaks);
  // Nebel und Planet in der Ferne
  [[0x7c3aed, -90, 30, -280, 160], [0x0ea5e9, 110, -20, -300, 180], [0xdb2777, 20, 60, -260, 120]].forEach(([c, x, y, z, s]) => {
    const m = new T.Sprite(new T.SpriteMaterial({ map: glowTex(`rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},.55)`, 'rgba(0,0,0,0)'), blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x, y, z); m.scale.set(s, s, 1); scene.add(m);
  });
  const planet = new T.Mesh(new T.SphereGeometry(40, 48, 32), new T.MeshStandardMaterial({ roughness: 1, fog: false, map: canvasTex(512, 256, (g, w, h) => {
    for (let y = 0; y < h; y++) { const k = Math.sin(y * 0.09) * 0.5 + Math.sin(y * 0.031) * 0.5; g.fillStyle = `rgb(${190 + k * 40},${110 + k * 50},${70 + k * 30})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,240,220,.12)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 4 + Math.random() * 6, 0, 0, Math.PI * 2); g.fill(); }
  }) }));
  planet.position.set(-95, -45, -230); planet.rotation.z = 0.3;
  scene.add(planet);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex('rgba(255,170,110,.5)', 'rgba(255,120,60,0)'), blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.copy(planet.position); glow.scale.set(120, 120, 1); scene.add(glow);
  let speed = 18;
  st.onFrame((dt) => {
    const a = sGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { a[i * 3 + 2] += speed * dt; if (a[i * 3 + 2] > 2) a[i * 3 + 2] -= 300; }
    sGeo.attributes.position.needsUpdate = true;
    const b = lGeo.attributes.position.array;
    const len = 2 + speed * 0.25;
    for (let i = 0; i < L; i++) {
      b[i * 6 + 2] += speed * 2 * dt; b[i * 6 + 5] = b[i * 6 + 2] - len;
      if (b[i * 6 + 2] > 2) lineInit(i);
    }
    lGeo.attributes.position.needsUpdate = true;
    planet.rotation.y += dt * 0.02;
  });
  // Meteoriten: unregelmässige Felsbrocken
  function rockGeo() {
    const g = new T.IcosahedronGeometry(1.6, 2);
    const pos = g.attributes.position;
    const seed = Math.random() * 10;
    const tmp = new T.Vector3();
    const cache = new Map();
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i);
      const k = `${tmp.x.toFixed(3)},${tmp.y.toFixed(3)},${tmp.z.toFixed(3)}`;
      let f = cache.get(k);
      if (f == null) { f = 1 + 0.18 * Math.sin(tmp.x * 3 + seed) * Math.cos(tmp.y * 2.6 + seed) + 0.1 * Math.sin(tmp.z * 5 + seed * 2); cache.set(k, f); }
      tmp.multiplyScalar(f);
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    g.computeVertexNormals();
    return g;
  }
  const fire = glowTex('rgba(255,170,60,.9)', 'rgba(255,60,20,0)');
  function spawnWave() {
    if (game.over || st.disposed) return;
    game.wave.forEach((m) => removeMeteor(m));
    const t = game.picker.next();
    game.task = t; game.recorded = false;
    $('#mtask').innerHTML = taskHTML(t, '<span class="slot">?</span>');
    const n = game.score >= 12 ? 4 : 3;
    const opts = choicesFor(t, n);
    const dur = clamp(12 - game.score * 0.35, 5, 12);
    game.wave = opts.map((v, i) => {
      const mesh = new T.Mesh(rockGeo(), new T.MeshStandardMaterial({ color: new T.Color().setHSL(0.07 + Math.random() * 0.04, 0.25, 0.32 + Math.random() * 0.1), roughness: 0.95, flatShading: true, emissive: 0x000000 }));
      const halo = new T.Sprite(new T.SpriteMaterial({ map: fire, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      halo.scale.set(5.2, 5.2, 1); mesh.add(halo); halo.position.z = -0.8;
      // weit auseinander starten, damit sich die Zahlen nie überdecken
      const spread = n === 4 ? 8.5 : 10;
      const x0 = (i - (n - 1) / 2) * spread + (Math.random() - 0.5) * 2;
      const y0 = (i % 2 ? 4 : -2.5) + (Math.random() - 0.5) * 2.5;
      const z0 = -62 - Math.random() * 14;
      mesh.position.set(x0, y0, z0);
      mesh.userData = { spin: new T.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.6), x0, y0, z0 };
      scene.add(mesh);
      const el = g3Label(String(v), 'meteor-tag', { action: 'g3-pick', v });
      const lab = st.addLabel(el, () => mesh.position, { dist: 16, base: 1, min: 0.7, max: 1.55 });
      const m = { mesh, el, lab, val: v, correct: v === t.answer, dead: false, vz: (-z0 - 3) / dur };
      el.__m = m;
      return m;
    });
    t.shownAt = performance.now();
  }
  function removeMeteor(m) {
    m.dead = true;
    st.removeLabel(m.lab);
    scene.remove(m.mesh);
    m.mesh.geometry.dispose(); m.mesh.material.dispose();
  }
  st.onFrame((dt) => {
    if (game.over) return;
    for (const m of game.wave) {
      if (m.dead) continue;
      const u = m.mesh.userData;
      m.mesh.position.z += m.vz * dt;
      const prog = 1 - (m.mesh.position.z + 3) / (u.z0 + 3);
      m.mesh.position.x = u.x0 * (1 - 0.72 * prog);
      m.mesh.position.y = u.y0 * (1 - 0.72 * prog) - 0.4 * prog;
      m.mesh.rotation.x += u.spin.x * dt; m.mesh.rotation.y += u.spin.y * dt;
      if (m.correct && m.mesh.position.z > -3.2) { impact(m); break; }
      if (!m.correct && m.mesh.position.z > -2) removeMeteor(m);
    }
  });
  function laser(to) {
    [-1, 1].forEach((s) => {
      const from = camera.localToWorld(new T.Vector3(s * 1.1, -0.85, -1.2));
      const dir = to.clone().sub(from);
      const len = dir.length();
      const beam = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, len, 8, 1, true), new T.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      beam.position.copy(from).add(dir.clone().multiplyScalar(0.5));
      beam.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      scene.add(beam);
      st.tween(260, (u) => { beam.material.opacity = 1 - u; beam.scale.x = beam.scale.z = 1 + u * 2; }).then(() => { scene.remove(beam); beam.geometry.dispose(); beam.material.dispose(); });
    });
    sfx.zap();
  }
  function hit(el) {
    const m = el.__m;
    if (!m || m.dead || game.over) return;
    const t = game.task;
    if (m.correct) {
      if (!game.recorded) recordAnswer(t, m.val, performance.now() - t.shownAt);
      game.recorded = true;
      game.score++; game.streak++;
      laser(m.mesh.position.clone());
      const p = m.mesh.position.clone();
      setTimeout(() => {
        burst(st, p, { n: 160, colors: [0xffc233, 0xff6b4a, 0xffffff, 0xfff1a6], speed: 9, life: 1.1, size: 0.6, gravity: 0 });
        burst(st, p, { n: 40, colors: [0x8a6f5a, 0x5b4636], speed: 5, life: 1.4, size: 0.35, gravity: 0 });
        const fl = new T.PointLight(0xffaa55, 30, 30); fl.position.copy(p); scene.add(fl);
        st.tween(400, (u) => { fl.intensity = 30 * (1 - u); }).then(() => scene.remove(fl));
        sfx.boom();
        st.shake(0.08);
      }, 120);
      removeMeteor(m);
      game.wave.forEach((x) => { if (!x.dead) { x.el.classList.add('fade'); st.tween(350, (u) => { x.mesh.scale.setScalar(1 - u); }).then(() => !x.dead && removeMeteor(x)); x.dead = true; } });
      $('#mscore').textContent = game.score;
      speed = 18 + Math.min(60, game.score * 3);
      bigWord(host, `+1${game.streak >= 3 ? `<small>${game.streak}er-Serie!</small>` : ''}`, 'good small');
      gLater(spawnWave, 800);
    } else {
      if (!game.recorded) { recordAnswer(t, m.val, performance.now() - t.shownAt); game.recorded = true; }
      game.streak = 0;
      sfx.bad();
      el.classList.add('wrong');
      m.mesh.material.emissive.set(0xaa1111);
      laser(m.mesh.position.clone());
      const p0 = m.mesh.position.clone();
      st.tween(400, (u) => { m.mesh.position.x = p0.x + Math.sin(u * 30) * 0.3 * (1 - u); });
      const right = game.wave.find((x) => x.correct && !x.dead);
      right?.el.classList.add('hint');
      if (right) right.mesh.material.emissive.set(0x2a5a10);
    }
  }
  function impact(m) {
    const t = game.task;
    if (!game.recorded) { recordAnswer(t, '', performance.now() - t.shownAt); game.recorded = true; }
    removeMeteor(m);
    game.wave.forEach((x) => { if (!x.dead) removeMeteor(x); });
    game.lives--; game.streak = 0;
    sfx.boom(); noise(0.7, { freq: 200, gain: 0.2 });
    st.shake(0.5);
    host.classList.add('hit');
    $('#crack').classList.add('show');
    bigWord(host, `Treffer!<small>${esc(taskText(t, true))}</small>`, 'bad');
    setTimeout(() => { host.classList.remove('hit'); $('#crack')?.classList.remove('show'); }, 1500);
    $$('#lives i').forEach((el, i) => el.classList.toggle('on', i < game.lives));
    if (game.lives <= 0) { game.over = true; gLater(meteorEnd, 1500); return; }
    gLater(spawnWave, 1600);
  }
  game.pick = hit;
  gLater(spawnWave, 400);
}

/* =========================================================
   🐸 Frosch-Hüpfen 3D – aus den Augen des Froschs
   ========================================================= */
async function startFrog3D(opts = {}) {
  const T = await loadThree();
  const ps = practiceSettings();
  const r = opts.reihe || (ps.reihen.includes(game.frogReihe) ? game.frogReihe : weakestReihe());
  Object.assign(game, { frogReihe: r, k: 0, dir: opts.dir || 1, locked: true, roundErr: 0, reihenDone: game.reihenDone || 0 });
  $('#view').innerHTML = gameShell('frog', `
    <div class="g3 g3-pond" id="g3">
      <div class="g3-hud top"><div class="chain" id="chain"></div></div>
      <div class="frog-feet" aria-hidden="true"><i></i><i></i></div>
      <div class="g3-hud bottom"><span class="frog-now" id="frognow"></span></div>
    </div>
    <p class="mode-hint">Tippe auf die Seerose mit der nächsten Zahl der ${r}er-Reihe – der Frosch springt.</p>`);
  const host = $('#g3');
  const st = createStage(host, { fov: 62, clear: 0x9fd3ee });
  game.stage3d = st;
  const { scene, camera } = st;
  scene.fog = new T.Fog(0xbfe3f2, 18, 70);
  scene.add(new T.HemisphereLight(0xe6f6ff, 0x2f5a3a, 1.3));
  const sunL = new T.DirectionalLight(0xfff0cf, 2.1); sunL.position.set(10, 14, -8); scene.add(sunL);
  // Himmel mit Abendlicht
  const sky = new T.Mesh(new T.SphereGeometry(150, 32, 16), new T.MeshBasicMaterial({ side: T.BackSide, fog: false, map: canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa7e6'); gr.addColorStop(0.42, '#bfe3f7'); gr.addColorStop(0.5, '#ffe2b5'); gr.addColorStop(1, '#ffe2b5');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }) }));
  scene.add(sky);
  const sunS = new T.Sprite(new T.SpriteMaterial({ map: glowTex('rgba(255,244,200,1)', 'rgba(255,220,150,0)'), blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  sunS.position.set(30, 18, -110); sunS.scale.set(40, 40, 1); scene.add(sunS);
  // Wasser mit Wellen (eigener kleiner Shader)
  const water = new T.Mesh(new T.PlaneGeometry(160, 160, 140, 140), new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: { value: new T.Color(0xbfe3f2) }, uCam: { value: new T.Vector3() } },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0);
        float h = sin(w.x*0.7+uTime*1.3)*0.025 + sin(w.z*0.9-uTime*1.1)*0.02 + sin((w.x+w.z)*2.1+uTime*2.3)*0.008 - 0.06;
        w.y += h; vW = w.xyz; vH = h; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFogColor; uniform vec3 uCam; varying vec3 vW; varying float vH;
      void main(){ vec3 deep = vec3(0.06,0.32,0.36); vec3 shallow = vec3(0.25,0.62,0.6);
        float d = length(vW.xz - uCam.xz);
        vec3 c = mix(shallow, deep, clamp(d/26.0,0.0,1.0)) + (vH+0.06)*3.0;
        float spark = pow(max(0.0, sin(vW.x*3.1+uTime*1.7)*sin(vW.z*2.7-uTime*1.3)), 18.0);
        c += vec3(1.0,0.95,0.8)*spark*0.55;
        float sky = smoothstep(8.0, 60.0, d); c = mix(c, vec3(0.75,0.88,0.92), sky*0.55);
        float f = smoothstep(20.0, 70.0, d); gl_FragColor = vec4(mix(c, uFogColor, f), 1.0); }`,
  }));
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  st.onFrame((dt, t) => { water.material.uniforms.uTime.value = t; water.material.uniforms.uCam.value.copy(camera.position); water.position.x = camera.position.x; water.position.z = camera.position.z; });
  // Ufer: Bäume und Schilf im Kreis
  const treeMat = new T.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1, flatShading: true });
  const trunkMat = new T.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const shore = new T.Group();
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2, rr = 46 + Math.random() * 14;
    const tr = new T.Group();
    const h = 4 + Math.random() * 6;
    const cone = new T.Mesh(new T.ConeGeometry(1.6 + Math.random(), h, 7), treeMat); cone.position.y = h / 2 + 1; tr.add(cone);
    const tk = new T.Mesh(new T.CylinderGeometry(0.2, 0.3, 1.4, 6), trunkMat); tk.position.y = 0.6; tr.add(tk);
    tr.position.set(Math.cos(a) * rr, -0.2, Math.sin(a) * rr);
    shore.add(tr);
  }
  scene.add(shore);
  const reedMat = new T.MeshStandardMaterial({ color: 0x5a8f3a, roughness: 1 });
  const catMat = new T.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 1 });
  const reeds = new T.Group();
  scene.add(reeds);
  function addReeds(cx, cz) {
    for (let i = 0; i < 6; i++) {
      const g = new T.Group();
      const h = 0.9 + Math.random() * 1.1;
      const st1 = new T.Mesh(new T.CylinderGeometry(0.015, 0.025, h, 5), reedMat); st1.position.y = h / 2; g.add(st1);
      if (Math.random() < 0.5) { const c = new T.Mesh(new T.CapsuleGeometry(0.045, 0.22, 3, 6), catMat); c.position.y = h - 0.05; g.add(c); }
      g.position.set(cx + (Math.random() - 0.5) * 1.2, -0.05, cz + (Math.random() - 0.5) * 1.2);
      g.userData.ph = Math.random() * 6;
      reeds.add(g);
    }
  }
  st.onFrame((dt, t) => reeds.children.forEach((g) => { g.rotation.z = Math.sin(t * 1.4 + g.userData.ph) * 0.06; g.rotation.x = Math.cos(t * 1.1 + g.userData.ph) * 0.04; }));
  // Glühwürmchen / Pollen in der Luft
  const flyGeo = new T.BufferGeometry();
  const fp = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) fp.set([(Math.random() - 0.5) * 30, 0.3 + Math.random() * 3, -Math.random() * 30], i * 3);
  flyGeo.setAttribute('position', new T.BufferAttribute(fp, 3));
  const flies = new T.Points(flyGeo, new T.PointsMaterial({ size: 0.12, map: glowTex('rgba(255,250,200,1)'), color: 0xfff6b0, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  scene.add(flies);
  st.onFrame((dt, t) => { flies.position.x = camera.position.x; flies.position.z = camera.position.z; flies.rotation.y = t * 0.03; });
  // Seerosen
  const padTex = canvasTex(256, 256, (g, w, h) => {
    const r = g.createRadialGradient(128, 128, 10, 128, 128, 128); r.addColorStop(0, '#9be36f'); r.addColorStop(0.7, '#4fae3c'); r.addColorStop(1, '#3b8f2e');
    g.fillStyle = r; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,110,30,.55)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); g.stroke(); }
  });
  const padMat = new T.MeshStandardMaterial({ map: padTex, roughness: 0.6, side: T.DoubleSide });
  const petalMat = new T.MeshStandardMaterial({ color: 0xffb6d5, roughness: 0.5 });
  function makePad(rad = 0.62, flower = false) {
    const g = new T.Group();
    const m = new T.Mesh(new T.CircleGeometry(rad, 40, 0.25, Math.PI * 2 - 0.5), padMat);
    m.rotation.x = -Math.PI / 2; g.add(m);
    const rimM = new T.Mesh(new T.TorusGeometry(rad, 0.025, 6, 40, Math.PI * 2 - 0.5), new T.MeshStandardMaterial({ color: 0x2f7d26 }));
    rimM.rotation.x = -Math.PI / 2; rimM.rotation.z = 0.25; g.add(rimM);
    if (flower) {
      const f = new T.Group();
      for (let i = 0; i < 8; i++) { const p = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), petalMat); p.scale.set(0.6, 0.35, 1.6); const a = (i / 8) * Math.PI * 2; p.position.set(Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1); p.rotation.y = -a; p.rotation.x = 0.6; f.add(p); }
      const c = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), new T.MeshStandardMaterial({ color: 0xffd34d })); c.position.y = 0.12; f.add(c);
      f.position.set(rad * 0.45, 0, rad * 0.25); g.add(f);
    }
    g.position.y = 0.015;
    g.userData = { ph: Math.random() * 6, baseY: 0.015, dip: 0 };
    scene.add(g);
    return g;
  }
  st.onFrame((dt, t) => scene.children.forEach((o) => { if (o.userData?.ph != null && o.userData.baseY != null) { o.userData.dip *= Math.pow(0.02, dt); o.position.y = o.userData.baseY + Math.sin(t * 1.5 + o.userData.ph) * 0.012 - o.userData.dip; o.rotation.y += dt * 0.02; } }));
  // Wellenringe beim Landen
  function ripple(p, n = 3) {
    for (let i = 0; i < n; i++) {
      const ring = new T.Mesh(new T.RingGeometry(0.62, 0.66, 64), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z);
      scene.add(ring);
      setTimeout(() => st.tween(1400, (u) => { ring.scale.setScalar(1 + u * 2.2); ring.material.opacity = 0.3 * (1 - u); }, ease.out).then(() => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }), i * 180);
    }
  }
  // Zustand: Frosch sitzt auf „home“, vorne liegen die Seerosen zur Wahl
  const EYE = 0.34;
  let home = makePad(0.7, false);
  home.position.set(0, 0.015, 0);
  let heading = 0; // Blickrichtung (Winkel um y)
  const look = new T.Vector3();
  const setCam = (p, hd, pitch = -0.12) => {
    camera.position.set(p.x, p.y, p.z);
    look.set(p.x - Math.sin(hd) * 4, p.y + pitch * 4, p.z - Math.cos(hd) * 4);
    camera.lookAt(look);
  };
  setCam(new T.Vector3(0, EYE, 0.35), 0);
  addReeds(-3.2, -1.2); addReeds(3.6, -2); addReeds(-5.5, -4.5);
  // Schilf im Blickfächer vor dem Frosch (und weit hinten) wegräumen, damit es nie die Seerosen verdeckt
  function cullReeds() {
    const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    [...reeds.children].forEach((g) => {
      const dx = g.position.x - home.position.x, dz = g.position.z - home.position.z;
      const f = dx * fx + dz * fz, l = dx * rx + dz * rz;
      if ((f > -0.6 && f < 6 && Math.abs(l) < 0.75 * Math.max(f, 0) + 0.9) || f < -10) {
        reeds.remove(g);
        g.traverse((o) => o.geometry?.dispose());
      }
    });
  }
  let choices = [];
  function chainHTML() {
    const b = game.frogReihe, seen = [];
    for (let k = game.dir === 1 ? 1 : 10; game.dir === 1 ? k <= game.k : k >= game.k; k += game.dir) if (k >= 1 && k <= 10) seen.push(k * b);
    const done = game.k + game.dir < 1 || game.k + game.dir > 10;
    return `<span class="chain-title">${b}er-Reihe ${game.dir === 1 ? 'vorwärts' : 'rückwärts'}</span><span class="chain-nums">${seen.map((x) => `<b>${x}</b>`).join('')}${done ? '' : '<b class="q">?</b>'}</span>`;
  }
  function step() {
    const b = game.frogReihe;
    const nextK = game.k + game.dir;
    $('#chain').innerHTML = chainHTML();
    const cur = game.k >= 1 && game.k <= 10 ? game.k * b : (game.dir === 1 ? 0 : '');
    $('#frognow').innerHTML = cur !== '' ? `Du sitzt auf <b>${cur}</b>` : 'Los geht’s!';
    if (nextK < 1 || nextK > 10) { finish(); return; }
    const target = nextK * b;
    const cand = new Set([target]);
    for (const x of shuffle([target + 1, target - 1, target + 2, target - 2, target + b, target - b, target + 10, target - 10]).filter((x) => x > 0 && x !== target && x !== cur)) { if (cand.size >= 3) break; cand.add(x); }
    game.task = { ...makeTask(nextK, b, 'mul'), shownAt: performance.now() };
    const vals = shuffle([...cand]);
    const angles = [-0.62, 0, 0.62];
    choices = vals.map((v, i) => {
      const a = heading + angles[i] + (Math.random() - 0.5) * 0.12;
      const d = 2.6 + Math.random() * 0.9 + (i === 1 ? 0.5 : 0);
      const pad = makePad(0.55 + Math.random() * 0.12, Math.random() < 0.3);
      pad.position.set(home.position.x - Math.sin(a) * d, 0.015, home.position.z - Math.cos(a) * d);
      pad.scale.setScalar(0.01);
      st.tween(500, (u, e) => pad.scale.setScalar(Math.max(0.01, e)), ease.back);
      const el = g3Label(String(v), 'pad-tag', { action: 'g3-pick', v });
      const lab = st.addLabel(el, () => new T.Vector3(pad.position.x, pad.position.y + 0.42, pad.position.z), { dist: 3, base: 1, min: 0.6, max: 1.35 });
      const c = { pad, el, lab, val: v, a };
      el.__c = c;
      // Schilf nur seitlich (quer zur Blickrichtung), damit es nicht die Sicht versperrt
      if (i !== 1 && Math.random() < 0.6) {
        const side = -Math.sign(angles[i]) * (1.8 + Math.random() * 0.8);
        addReeds(pad.position.x + Math.cos(heading) * side - Math.sin(heading) * 0.6, pad.position.z - Math.sin(heading) * side - Math.cos(heading) * 0.6);
      }
      return c;
    });
    cullReeds();
    game.locked = false;
  }
  async function jump(el) {
    const c = el.__c;
    if (game.locked || !c) return;
    const t = game.task;
    if (c.val !== t.answer) {
      recordAnswer(t, c.val, performance.now() - t.shownAt);
      game.roundErr++;
      sfx.splash(); noise(0.5, { freq: 700, gain: 0.08, sweep: -500 });
      el.classList.add('wrong');
      st.removeLabel(c.lab);
      choices = choices.filter((x) => x !== c);
      ripple(c.pad.position, 2);
      burst(st, c.pad.position.clone().setY(0.1), { n: 50, colors: [0xffffff, 0xcdeffb], speed: 2.2, life: 0.8, size: 0.08, gravity: -6 });
      st.tween(700, (u) => { c.pad.position.y = 0.015 - u * 0.4; c.pad.rotation.z = u * 0.5; }).then(() => scene.remove(c.pad));
      return;
    }
    game.locked = true;
    choices.forEach((x) => { st.removeLabel(x.lab); });
    sfx.jump();
    host.classList.add('jumping');
    const p0 = camera.position.clone();
    const p1 = new T.Vector3(c.pad.position.x, EYE, c.pad.position.z + 0.0);
    const h0 = heading, h1 = c.a;
    await st.tween(720, (u, e) => {
      const p = p0.clone().lerp(p1, e);
      p.y = EYE + Math.sin(u * Math.PI) * 0.95;
      const hd = h0 + (h1 - h0) * e;
      setCam(p, hd, -0.12 - Math.sin(u * Math.PI) * 0.25 + (u > 0.6 ? (u - 0.6) * 0.4 : 0));
      camera.fov = 62 + Math.sin(u * Math.PI) * 8; camera.updateProjectionMatrix();
    }, (x) => x);
    host.classList.remove('jumping');
    heading = h1;
    c.pad.userData.dip = 0.08;
    st.shake(0.04);
    burst(st, c.pad.position.clone().setY(0.1), { n: 40, colors: [0xffffff, 0xd8f3ff], speed: 1.8, life: 0.7, size: 0.07, gravity: -5 });
    sfx.splash();
    // alte Seerosen versinken langsam
    const old = [home, ...choices.filter((x) => x !== c).map((x) => x.pad)];
    old.forEach((p) => st.tween(900, (u) => { p.position.y = 0.015 - u * 0.25; }).then(() => scene.remove(p)));
    home = c.pad;
    game.k += game.dir;
    game.done = (game.done || 0) + 1;
    step();
  }
  function finish() {
    game.reihenDone++;
    sfx.win();
    tone([196, 147], 0.18, 'square', 0.06); // Quaken
    const st3 = game.roundErr === 0 ? 3 : game.roundErr <= 2 ? 2 : 1;
    if (st3 === 3) confetti();
    burst(st, camera.position.clone().add(new T.Vector3(0, 0.5, -2)), { n: 120, colors: [0xfff6b0, 0xffc233, 0x9be36f], speed: 2.5, life: 1.8, size: 0.1, gravity: 0.5 });
    const { rec } = saveBest('frog', game.reihenDone);
    const b = game.frogReihe;
    const card = document.createElement('div');
    card.className = 'frog-done g3-card';
    card.innerHTML = `${stars(st3)}<h2>${b}er-Reihe ${game.dir === 1 ? 'vorwärts' : 'rückwärts'} geschafft!</h2>
      <p>${game.roundErr ? `${game.roundErr} ${game.roundErr === 1 ? 'Fehlsprung' : 'Fehlsprünge'}` : 'Ohne einen Fehlsprung!'}${rec ? ' · Neuer Rekord!' : ''}</p>
      <div class="row center">${game.dir === 1 ? `<button class="btn primary" data-action="frog-back">${icon('left')} Jetzt rückwärts</button>` : ''}
      <button class="btn ${game.dir === 1 ? 'secondary' : 'primary'}" data-action="game-again">Andere Reihe</button></div>`;
    host.appendChild(card);
  }
  game.pick = jump;
  game.frogBack = () => { host.querySelector('.g3-card')?.remove(); game.dir = -1; game.k = 11; game.roundErr = 0; step(); };
  setGameKeys((e) => { if (/^[1-3]$/.test(e.key) && choices[+e.key - 1]) jump(choices[+e.key - 1].el); });
  step();
}
