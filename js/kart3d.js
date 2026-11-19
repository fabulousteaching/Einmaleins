/* Teilmal – Turbo-Rennen (3D-Kartrennen, three.js)
 *
 * Drei Runden gegen fünf Computer-Fahrer. An mehreren Stellen teilt sich die Strecke in drei Spuren:
 * Auf jeder Spur schwebt ein ?-Würfel – wer durchfährt, trifft immer einen, und eine Rechnung erscheint.
 * Etwas weiter vorne teilt sich die Strecke wieder in drei Tore mit Ergebnissen: richtiges Tor = Turbo,
 * falsches Tor = kurz langsamer. Die Computer-Fahrer machen auch Fehler und bleiben in der Nähe (Gummiband),
 * damit das Rennen spannend bleibt. Alle Strecken sind gleich lang (faire Bestenliste: Zeit für 3 Runden).
 * Eigene Grafik und eigene Figuren (keine Vorlage aus anderen Spielen).
 */
'use strict';

const KART = {
  LAP: 1150, LAPS: 3, W: 14, BASE: 30,
  TURBO: 1.5, SLOW: 0.55, FX_MS: 1800,
  STATIONS: [170, 540, 910], ASK: 190, ZONE: 11,
  BOTS: 5,
};
const KART_TRACKS = [
  { id: 'circuit', name: 'Rennstrecke', emo: '🏁' },
  { id: 'beach', name: 'Strand', emo: '🏖️' },
  { id: 'forest', name: 'Wald', emo: '🌲' },
  { id: 'mars', name: 'Mars', emo: '🪐' },
  { id: 'snow', name: 'Schneeland', emo: '❄️' },
  { id: 'city', name: 'Neon-Stadt', emo: '🌃' },
];
const kartTrackId = () => (KART_TRACKS.some((t) => t.id === db.settings.kartTrack) ? db.settings.kartTrack : 'circuit');

/* Streckenformen (werden auf die Rundenlänge skaliert) */
const KART_SHAPES = {
  circuit: [[0, 0], [60, -5], [110, 10], [132, 50], [112, 92], [70, 96], [48, 70], [18, 80], [-20, 102], [-62, 90], [-82, 50], [-70, 10], [-40, -6]],
  beach: [[0, 0], [80, -12], [150, 0], [190, 40], [170, 82], [120, 86], [80, 70], [40, 92], [-10, 86], [-42, 50], [-30, 14]],
  forest: [[0, 0], [50, -22], [100, -10], [122, 30], [92, 62], [102, 102], [60, 132], [10, 112], [-20, 72], [-62, 52], [-50, 10]],
  mars: [[0, 0], [70, -32], [140, -10], [162, 50], [122, 100], [62, 90], [30, 122], [-30, 112], [-62, 62], [-40, 20]],
  snow: [[0, 0], [60, 10], [100, -22], [150, 0], [152, 60], [100, 80], [90, 122], [40, 132], [0, 92], [-40, 80], [-52, 30]],
  city: [[0, 0], [100, 0], [130, 10], [140, 40], [140, 100], [120, 122], [60, 122], [40, 100], [40, 70], [10, 60], [-20, 60], [-32, 30], [-20, 5]],
};

/* Themen: Himmel, Licht, Boden, Strasse, Randsteine, Kulisse */
const KART_THEMES = {
  circuit: { sky: ['#2b67bd', '#86bff0', '#e6f1fb'], fog: 0xbfd8ef, fogNear: 160, fogFar: 900, hemi: [0xdbeeff, 0x4f6b3a, 1.05], sun: 0xfff1d6, sunI: 2.5,
    ground: 'grass', road: 'asphalt', curb: ['#E53935', '#FFFFFF'], island: ['#FACC15', '#1F2937'], board: '#1E293B', props: ['stands', 'tires', 'trees', 'billboards'], clouds: true },
  beach: { sky: ['#2f7cc7', '#94d0f6', '#ffe9c4'], fog: 0xd9ebf3, fogNear: 160, fogFar: 950, hemi: [0xe6f4ff, 0x9a8156, 1.1], sun: 0xffe7c2, sunI: 2.6,
    ground: 'sand', road: 'asphaltLight', curb: ['#0EA5E9', '#FFFFFF'], island: ['#F97316', '#FFFFFF'], board: '#0E7490', props: ['palms', 'umbrellas', 'huts', 'rocks', 'sea'], clouds: true },
  forest: { sky: ['#3d76ab', '#a7c9df', '#e1ecdf'], fog: 0xa9c4a8, fogNear: 70, fogFar: 520, hemi: [0xd6ecd9, 0x2e4426, 1.0], sun: 0xfff0d0, sunI: 2.1,
    ground: 'forest', road: 'asphalt', curb: ['#FACC15', '#1F2937'], island: ['#84CC16', '#365314'], board: '#365314', props: ['pines', 'oaks', 'mushrooms', 'rocks'], clouds: true },
  mars: { sky: ['#2a1410', '#a14a28', '#e8a26b'], fog: 0xc7764a, fogNear: 120, fogFar: 760, hemi: [0xffd2b0, 0x5a2414, 0.95], sun: 0xffd2a8, sunI: 2.2,
    ground: 'mars', road: 'marsRoad', curb: ['#F97316', '#F5F5F4'], island: ['#F5F5F4', '#9A3412'], board: '#7C2D12', props: ['marsRocks', 'craters', 'domes'], moons: true },
  snow: { sky: ['#5189c6', '#b7d4ef', '#f3f7fc'], fog: 0xe3edf6, fogNear: 110, fogFar: 700, hemi: [0xeef6ff, 0x8fa6bf, 1.15], sun: 0xffffff, sunI: 2.2,
    ground: 'snow', road: 'ice', curb: ['#2563EB', '#FFFFFF'], island: ['#2563EB', '#FFFFFF'], board: '#1E3A8A', props: ['snowPines', 'snowmen', 'rocks'], snowfall: true, clouds: true },
  city: { night: true, sky: ['#04050d', '#171035', '#3a1d5a'], fog: 0x1a1236, fogNear: 120, fogFar: 760, hemi: [0x9d8fff, 0x2a2348, 1.5], sun: 0xc9c2ff, sunI: 1.3,
    ground: 'city', road: 'nightRoad', curb: ['#22D3EE', '#F0ABFC'], island: ['#F0ABFC', '#312E81'], board: '#312E81', props: ['towers', 'lamps'], stars: true },
};

const KART_RACERS = [
  { name: 'Du', color: 0xff5a36, helmet: 0xffffff },
  { name: 'Blitz', color: 0x2f7bf5, helmet: 0xfacc15 },
  { name: 'Komet', color: 0xf5c518, helmet: 0x1f2937 },
  { name: 'Rakete', color: 0x16a34a, helmet: 0xffffff },
  { name: 'Wirbel', color: 0x8b5cf6, helmet: 0xf472b6 },
  { name: 'Flitzer', color: 0x14b8a6, helmet: 0xf97316 },
];

/* ---------------- Texturen ---------------- */
function kartNoise(g, w, h, n, colors, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = size[0] + Math.random() * (size[1] - size[0]);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
function kartGroundTex(kind) {
  const R = { repeat: [220, 220] };
  return canvasTex(256, 256, (g, w, h) => {
    const base = { grass: '#4c9a46', sand: '#e6cf9c', forest: '#3d6b34', mars: '#b4552f', snow: '#eef3f8', city: '#191a24' }[kind];
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (kind === 'grass') kartNoise(g, w, h, 5000, ['rgba(40,110,40,.5)', 'rgba(110,170,70,.4)', 'rgba(30,80,30,.35)'], [1, 3]);
    if (kind === 'sand') kartNoise(g, w, h, 6000, ['rgba(200,170,110,.5)', 'rgba(255,240,210,.5)', 'rgba(170,140,90,.3)'], [1, 2]);
    if (kind === 'forest') { kartNoise(g, w, h, 4000, ['rgba(30,60,25,.6)', 'rgba(90,120,50,.45)', 'rgba(100,70,40,.4)'], [1, 4]); }
    if (kind === 'mars') { kartNoise(g, w, h, 6000, ['rgba(130,50,25,.55)', 'rgba(220,120,70,.45)', 'rgba(90,30,15,.4)'], [1, 3]); }
    if (kind === 'snow') kartNoise(g, w, h, 3000, ['rgba(200,215,235,.6)', 'rgba(255,255,255,.8)', 'rgba(180,200,225,.4)'], [1, 3]);
    if (kind === 'city') {
      g.strokeStyle = 'rgba(120,110,200,.18)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
      kartNoise(g, w, h, 1500, ['rgba(255,255,255,.04)', 'rgba(0,0,0,.25)'], [1, 3]);
    }
  }, R);
}
function kartRoadTex(kind) {
  return canvasTex(256, 512, (g, w, h) => {
    const base = { asphalt: '#3b3e44', asphaltLight: '#5a5d63', marsRoad: '#7a3a22', ice: '#a9c3d9', nightRoad: '#15151f' }[kind];
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    kartNoise(g, w, h, 9000, kind === 'ice' ? ['rgba(255,255,255,.35)', 'rgba(120,150,180,.3)'] : kind === 'marsRoad' ? ['rgba(160,80,45,.4)', 'rgba(60,20,10,.35)'] : ['rgba(255,255,255,.05)', 'rgba(0,0,0,.18)', 'rgba(120,120,130,.12)'], [1, 2]);
    // Fahrspuren: Randlinien und gestrichelte Spurlinien
    const line = kind === 'nightRoad' ? '#5eead4' : kind === 'ice' ? '#ffffff' : 'rgba(255,255,255,.9)';
    g.fillStyle = line;
    g.fillRect(w * 0.025, 0, w * 0.018, h); g.fillRect(w * 0.957, 0, w * 0.018, h);
    g.fillStyle = kind === 'nightRoad' ? '#f0abfc' : 'rgba(255,255,255,.75)';
    for (const u of [1 / 3, 2 / 3]) for (let y = 0; y < h; y += 128) g.fillRect(w * u - 3, y, 6, 64);
  }, { repeat: [1, 1] });
}
function kartStripeTex(a, b, n = 2) {
  return canvasTex(16, 64, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, (i * h) / n, w, h / n); } });
}
function kartCubeTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#22d3ee'); gr.addColorStop(0.5, '#a78bfa'); gr.addColorStop(1, '#f472b6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 16; g.strokeRect(10, 10, w - 20, h - 20);
    g.font = NUM_FONT(170); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = 'rgba(30,20,70,.75)'; g.strokeText('?', w / 2, h / 2 + 8);
    g.fillStyle = '#ffffff'; g.fillText('?', w / 2, h / 2 + 8);
  });
}
function kartBoardTex(text, col) {
  return canvasTex(320, 180, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = col; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    let fs = 118; g.font = NUM_FONT(fs);
    const tw = g.measureText(text).width; if (tw > w - 40) { fs = Math.floor((fs * (w - 40)) / tw); g.font = NUM_FONT(fs); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#10282C'; g.fillText(text, w / 2, h / 2 + fs * 0.05);
  });
}
function kartCheckerTex(nx = 8, ny = 2) {
  return canvasTex(256, 64, (g, w, h) => { for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect((x * w) / nx, (y * h) / ny, w / nx, h / ny); } });
}
function kartSignTex(text, bg, fg = '#fff', w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = NUM_FONT(Math.round(h * 0.55)); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

/* ---------------- Strecke ---------------- */
function kartBuildTrack(T, shape) {
  const raw = shape.map(([x, z]) => new T.Vector3(x, 0, z));
  const c0 = new T.CatmullRomCurve3(raw, true, 'centripetal');
  const k = KART.LAP / c0.getLength();
  const curve = new T.CatmullRomCurve3(raw.map((p) => p.clone().multiplyScalar(k)), true, 'centripetal');
  curve.arcLengthDivisions = 3000;
  const len = curve.getLength();
  const N = Math.round(len * 2);
  const P = new Float32Array(N * 2), F = new Float32Array(N * 2);
  const v = new T.Vector3(), tg = new T.Vector3();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    curve.getPointAt(u, v); curve.getTangentAt(u, tg);
    P[i * 2] = v.x; P[i * 2 + 1] = v.z;
    const l = Math.hypot(tg.x, tg.z) || 1;
    F[i * 2] = tg.x / l; F[i * 2 + 1] = tg.z / l;
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  }
  const tr = { N, P, F, len, box: { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 } };
  // grobe Stützpunkte für den Abstand zur Strecke (Kulisse nicht auf die Fahrbahn stellen)
  tr.coarse = [];
  for (let s = 0; s < len; s += 6) { const q = kartAt(tr, s); tr.coarse.push(q.x, q.z); }
  return tr;
}
/** Punkt auf der Strecke bei Strecke s (beliebig, wird auf eine Runde umgerechnet) */
function kartAt(tr, s, out = {}) {
  const L = tr.len;
  const u = ((((s % L) + L) % L) / L) * tr.N;
  const i0 = Math.floor(u) % tr.N, i1 = (i0 + 1) % tr.N, f = u - Math.floor(u);
  const P = tr.P, F = tr.F;
  out.x = P[i0 * 2] * (1 - f) + P[i1 * 2] * f;
  out.z = P[i0 * 2 + 1] * (1 - f) + P[i1 * 2 + 1] * f;
  let fx = F[i0 * 2] * (1 - f) + F[i1 * 2] * f, fz = F[i0 * 2 + 1] * (1 - f) + F[i1 * 2 + 1] * f;
  const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  out.fx = fx; out.fz = fz; out.rx = -fz; out.rz = fx; // r: rechts in Fahrtrichtung
  return out;
}
function kartDistToTrack(tr, x, z) {
  let best = 1e9;
  const c = tr.coarse;
  for (let i = 0; i < c.length; i += 2) { const dx = c[i] - x, dz = c[i + 1] - z; const d = dx * dx + dz * dz; if (d < best) best = d; }
  return Math.sqrt(best);
}
/** Band entlang der Strecke zwischen seitlich a und b (Fahrbahn, Randsteine) */
function kartRibbon(T, tr, a, b, y, step, vScale) {
  const n = Math.ceil(tr.len / step);
  const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), nor = new Float32Array((n + 1) * 6);
  const idx = [];
  const q = {};
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * tr.len;
    kartAt(tr, s, q);
    pos.set([q.x + q.rx * a, y, q.z + q.rz * a, q.x + q.rx * b, y, q.z + q.rz * b], i * 6);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    uv.set([0, s / vScale, 1, s / vScale], i * 4);
    if (i < n) { const A = i * 2, B = A + 1, C = A + 2, D = A + 3; idx.push(A, B, C, B, D, C); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------------- Kart ---------------- */
function kartModel(T, color, helmetColor) {
  const g = new T.Group();
  const paint = new T.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 });
  const dark = new T.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.2, roughness: 0.7 });
  const metal = new T.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 });
  const rubber = new T.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const body = new T.Group(); g.add(body);
  add(new T.BoxGeometry(1.25, 0.32, 2.2), paint, 0, 0.42, 0, 0, 0, 0, body);           // Wanne
  add(new T.BoxGeometry(0.95, 0.22, 0.9), paint, 0, 0.5, 1.15, -0.22, 0, 0, body);      // Nase
  add(new T.BoxGeometry(1.75, 0.16, 0.34), dark, 0, 0.3, 1.55, 0, 0, 0, body);          // Frontflügel
  add(new T.BoxGeometry(0.34, 0.3, 1.15), paint, 0.78, 0.4, -0.1, 0, 0, 0, body);       // Seitenkästen
  add(new T.BoxGeometry(0.34, 0.3, 1.15), paint, -0.78, 0.4, -0.1, 0, 0, 0, body);
  add(new T.BoxGeometry(1.7, 0.07, 0.42), paint, 0, 1.05, -1.12, 0, 0, 0, body);        // Heckflügel
  add(new T.BoxGeometry(0.07, 0.42, 0.2), dark, 0.55, 0.83, -1.1, 0, 0, 0, body);
  add(new T.BoxGeometry(0.07, 0.42, 0.2), dark, -0.55, 0.83, -1.1, 0, 0, 0, body);
  add(new T.BoxGeometry(0.8, 0.36, 0.5), dark, 0, 0.62, -0.85, 0, 0, 0, body);          // Motor
  const pipeG = new T.CylinderGeometry(0.09, 0.11, 0.5, 12);
  add(pipeG, metal, 0.24, 0.62, -1.22, Math.PI / 2, 0, 0, body);                         // Auspuff
  add(pipeG, metal, -0.24, 0.62, -1.22, Math.PI / 2, 0, 0, body);
  add(new T.BoxGeometry(0.7, 0.5, 0.12), dark, 0, 0.82, -0.42, -0.25, 0, 0, body);       // Sitz
  add(new T.TorusGeometry(0.2, 0.035, 8, 20), dark, 0, 0.92, 0.32, -1.05, 0, 0, body);   // Lenkrad
  // Fahrerin/Fahrer mit Helm
  const suit = new T.MeshStandardMaterial({ color: new T.Color(color).multiplyScalar(0.55), roughness: 0.6 });
  add(new T.CapsuleGeometry(0.27, 0.32, 6, 12), suit, 0, 1.0, -0.22, -0.15, 0, 0, body);
  const helmet = new T.MeshStandardMaterial({ color: helmetColor, metalness: 0.3, roughness: 0.25 });
  add(new T.SphereGeometry(0.3, 20, 16), helmet, 0, 1.42, -0.12, 0, 0, 0, body);
  add(new T.SphereGeometry(0.3, 20, 12, -1.1, 2.2, 1.0, 0.75), new T.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.1 }), 0, 1.42, -0.1, 0, 0, 0, body);
  add(new T.BoxGeometry(0.06, 0.08, 0.5), paint, 0, 1.73, -0.15, 0, 0, 0, body);        // Helmstreifen
  // Räder (vorne lenkbar)
  const wheelG = new T.CylinderGeometry(0.38, 0.38, 0.34, 20), rimG = new T.CylinderGeometry(0.2, 0.2, 0.36, 12);
  const wheels = [];
  for (const [x, z, front] of [[0.86, 0.85, 1], [-0.86, 0.85, 1], [0.9, -0.82, 0], [-0.9, -0.82, 0]]) {
    const steer = new T.Group(); steer.position.set(x, 0.38, z); g.add(steer);
    const spin = new T.Group(); steer.add(spin);
    add(wheelG, rubber, 0, 0, 0, 0, 0, Math.PI / 2, spin);
    add(rimG, metal, 0, 0, 0, 0, 0, Math.PI / 2, spin);
    wheels.push({ steer, spin, front });
  }
  // Turbo-Flammen
  const flameMat = new T.SpriteMaterial({ map: glowTex('rgba(255,240,180,1)', 'rgba(255,90,20,0)'), color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const flames = [0.24, -0.24].map((x) => { const s = new T.Sprite(flameMat); s.position.set(x, 0.62, -1.55); s.scale.set(0.01, 0.01, 1); g.add(s); return s; });
  return { g, body, wheels, flames, flameMat };
}

/* ---------------- Spiel ---------------- */
async function startKart3D() {
  const T = await loadThree();
  await loadNumFont();
  const tid = kartTrackId(), TH = KART_THEMES[tid];
  Object.assign(game, { picker: gamePicker(), over: false, cleanups: game.cleanups || [] });
  $('#view').innerHTML = gameShell('kart', `
    <div class="g3 g3-kart theme-${tid}" id="g3">
      <div class="kart-hud tl"><div class="kart-pos"><b id="kplace">–</b><small>/6</small></div><span class="kart-lap" id="klap">Runde 1/${KART.LAPS}</span><ol class="kart-rank" id="krank"></ol></div>
      <canvas class="kart-map" id="kmap" width="240" height="240" aria-hidden="true"></canvas>
      <div class="kart-time" id="ktime">0,0 s</div>
      <div class="kart-ask" id="kask" hidden><small id="kaskhint">Fahr durch das richtige Ergebnis</small><b id="ktask"></b><div class="kart-ans" id="kans"></div></div>
      <div class="kart-lines" id="klines"></div>
      <div class="kart-pad l" id="kpl" aria-hidden="true">◀</div><div class="kart-pad r" id="kpr" aria-hidden="true">▶</div>
      <div class="kart-count" id="kcount"></div>
    </div>
    <p class="mode-hint">Lenken: Pfeiltasten ← → (oder A/D) – auf dem Tablet links oder rechts aufs Bild tippen und halten.</p>`);
  const host = $('#g3');
  const st = createStage(host, { fov: 62, near: 0.6, far: 3200, shadows: true, clear: TH.fog });
  game.stage3d = st;
  const { scene, camera, renderer } = st;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  scene.fog = new T.Fog(TH.fog, TH.fogNear, TH.fogFar);
  const tr = kartBuildTrack(T, KART_SHAPES[tid]);
  const L = tr.len, W = KART.W, HW = W / 2, LANE = W / 3;
  const q = {}, q2 = {};

  /* Licht und Himmel */
  scene.add(new T.HemisphereLight(TH.hemi[0], TH.hemi[1], TH.hemi[2]));
  const sun = new T.DirectionalLight(TH.sun, TH.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  // Nachts: ein Licht fährt über dir mit (wie Strassenlampen), damit die Karts gut zu sehen sind
  const nightLight = TH.night ? new T.PointLight(0xfff1e0, 260, 40, 1.6) : null;
  if (nightLight) scene.add(nightLight);
  const sunDir = new T.Vector3(-0.45, 0.8, 0.35).normalize();
  const skyTex = canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, TH.sky[0]); gr.addColorStop(0.42, TH.sky[1]); gr.addColorStop(0.5, TH.sky[2]); gr.addColorStop(1, TH.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new T.Mesh(new T.SphereGeometry(2800, 32, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  // Umgebung für Spiegelungen (Karts glänzen)
  try {
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })));
    const sunBall = new T.Mesh(new T.SphereGeometry(1.2, 16, 8), new T.MeshBasicMaterial({ color: TH.night ? 0x8a7dff : 0xffffff }));
    sunBall.position.copy(sunDir).multiplyScalar(8); envScene.add(sunBall);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = TH.night ? 0.5 : 0.85;
    pm.dispose();
  } catch { /* ohne Spiegelungen */ }
  if (!TH.night) {
    const sunSprite = new T.Sprite(new T.SpriteMaterial({ map: glowTex('rgba(255,250,230,1)', 'rgba(255,230,180,0)'), fog: false, depthWrite: false, transparent: true }));
    sunSprite.position.copy(sunDir).multiplyScalar(2300); sunSprite.scale.set(520, 520, 1); scene.add(sunSprite);
  }
  if (TH.stars || TH.moons) {
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.3; p.set([Math.cos(a) * Math.cos(e) * 2600, Math.sin(e) * 2600, Math.sin(a) * Math.cos(e) * 2600], i * 3); }
    const gs = new T.BufferGeometry(); gs.setAttribute('position', new T.BufferAttribute(p, 3));
    scene.add(new T.Points(gs, new T.PointsMaterial({ color: 0xffffff, size: TH.moons ? 3 : 5, sizeAttenuation: false, fog: false, transparent: true, opacity: TH.moons ? 0.5 : 0.9 })));
  }
  if (TH.moons) {
    for (const [x, y, z, r, c] of [[-900, 700, -1700, 120, 0xd9c2a8], [1300, 420, -1500, 60, 0xbfa58c]]) {
      const m = new T.Mesh(new T.SphereGeometry(r, 24, 16), new T.MeshBasicMaterial({ color: c, fog: false }));
      m.position.set(x + tr.box.cx, y, z + tr.box.cz); scene.add(m);
    }
  }
  if (TH.clouds) {
    const cloudTex = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + Math.random() * (w - 80), y = 50 + Math.random() * 40, r = 22 + Math.random() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });
    const cm = new T.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, depthWrite: false, opacity: 0.9 });
    for (let i = 0; i < 26; i++) {
      const s = new T.Sprite(cm); const a = Math.random() * Math.PI * 2, d = 900 + Math.random() * 1300;
      s.position.set(tr.box.cx + Math.cos(a) * d, 240 + Math.random() * 380, tr.box.cz + Math.sin(a) * d);
      const sc = 380 + Math.random() * 420; s.scale.set(sc, sc / 2, 1); scene.add(s);
    }
  }

  /* Boden, Fahrbahn, Randsteine, Start und Ziel */
  const ground = new T.Mesh(new T.PlaneGeometry(5000, 5000), new T.MeshStandardMaterial({ map: kartGroundTex(TH.ground), roughness: 0.95, metalness: 0 }));
  // Boden etwas tiefer als die Fahrbahn: sonst flimmern die beiden auf Geräten mit ungenauem Tiefenpuffer
  ground.rotation.x = -Math.PI / 2; ground.position.set(tr.box.cx, -0.18, tr.box.cz); ground.receiveShadow = true;
  scene.add(ground);
  const roadTex = kartRoadTex(TH.road); roadTex.wrapT = T.RepeatWrapping; roadTex.wrapS = T.ClampToEdgeWrapping;
  const roadMat = new T.MeshStandardMaterial({ map: roadTex, roughness: TH.road === 'ice' ? 0.25 : 0.85, metalness: TH.road === 'ice' ? 0.15 : 0.02, side: T.DoubleSide });
  if (TH.road === 'nightRoad') { roadMat.emissive = new T.Color(0xffffff); roadMat.emissiveMap = roadTex; roadMat.emissiveIntensity = 0.35; }
  const road = new T.Mesh(kartRibbon(T, tr, -HW, HW, 0.04, 2, 16), roadMat);
  road.receiveShadow = true; scene.add(road);
  const curbTex = kartStripeTex(TH.curb[0], TH.curb[1]); curbTex.wrapT = T.RepeatWrapping;
  const curbMat = new T.MeshStandardMaterial({ map: curbTex, roughness: 0.6, side: T.DoubleSide });
  if (TH.night) { curbMat.emissive = new T.Color(0xffffff); curbMat.emissiveMap = curbTex; curbMat.emissiveIntensity = 0.8; }
  for (const [a, b] of [[HW, HW + 1.4], [-HW - 1.4, -HW]]) { const c = new T.Mesh(kartRibbon(T, tr, a, b, 0.08, 2, 4), curbMat); c.receiveShadow = true; scene.add(c); }
  // Startlinie und Torbogen
  kartAt(tr, 0, q);
  const yawAt = (o) => Math.atan2(o.fx, o.fz);
  const startLine = new T.Mesh(new T.PlaneGeometry(W, 2.2), new T.MeshStandardMaterial({ map: kartCheckerTex(14, 2), roughness: 0.7 }));
  startLine.rotation.set(-Math.PI / 2, 0, yawAt(q) + Math.PI); startLine.position.set(q.x, 0.12, q.z); scene.add(startLine);
  {
    const archMat = new T.MeshStandardMaterial({ color: TH.night ? 0x312e81 : 0xe5e7eb, metalness: 0.5, roughness: 0.35 });
    const arch = new T.Group(); arch.position.set(q.x, 0, q.z); arch.rotation.y = yawAt(q); scene.add(arch);
    for (const x of [HW + 2, -HW - 2]) { const p = new T.Mesh(new T.BoxGeometry(0.9, 7.5, 0.9), archMat); p.position.set(-x, 3.75, 0); p.castShadow = true; arch.add(p); }
    const ban = new T.Mesh(new T.BoxGeometry(W + 5, 1.8, 0.5), [archMat, archMat, archMat, archMat, new T.MeshStandardMaterial({ map: kartSignTex('TEILMAL · TURBO-RENNEN', '#FF6B4A') }), new T.MeshStandardMaterial({ map: kartSignTex('START · ZIEL', '#0F766E') })]);
    ban.position.set(0, 7.2, 0); ban.castShadow = true; arch.add(ban);
    const chk = new T.Mesh(new T.BoxGeometry(W + 5, 0.5, 0.52), new T.MeshStandardMaterial({ map: kartCheckerTex(24, 2) }));
    chk.position.set(0, 6.05, 0); arch.add(chk);
  }

  /* Weggabelungen: Inseln zwischen den Spuren, ?-Würfel und Antwort-Tore */
  const islandTex = kartStripeTex(TH.island[0], TH.island[1], 2); islandTex.wrapS = islandTex.wrapT = T.RepeatWrapping; islandTex.repeat.set(1, 3);
  const islandMat = new T.MeshStandardMaterial({ map: islandTex, roughness: 0.55 });
  const capMat = new T.MeshStandardMaterial({ color: TH.island[0], roughness: 0.5 });
  function buildIslands(sc) {
    for (const lat of [-LANE / 2, LANE / 2]) {
      const seg = 5, from = sc - KART.ZONE, len = (2 * KART.ZONE) / seg;
      for (let i = 0; i < seg; i++) {
        kartAt(tr, from + (i + 0.5) * len, q);
        const m = new T.Mesh(new T.BoxGeometry(0.7, 0.6, len + 0.06), islandMat);
        m.position.set(q.x + q.rx * lat, 0.3, q.z + q.rz * lat); m.rotation.y = yawAt(q); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      }
      for (const e of [from, sc + KART.ZONE]) {
        kartAt(tr, e, q);
        const c = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.6, 16), capMat);
        c.position.set(q.x + q.rx * lat, 0.3, q.z + q.rz * lat); c.castShadow = true; scene.add(c);
      }
    }
  }
  const cubeMat = new T.MeshStandardMaterial({ map: kartCubeTex(), emissive: 0x6d28d9, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.92 });
  const cubeGeo = new T.BoxGeometry(1.5, 1.5, 1.5);
  const glowMat = new T.SpriteMaterial({ map: glowTex('rgba(200,180,255,.9)', 'rgba(120,80,255,0)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const stations = KART.STATIONS.map((s0, k) => {
    buildIslands(s0); buildIslands(s0 + KART.ASK);
    // Würfel: einer pro Spur
    const cubes = [-1, 0, 1].map((lane) => {
      kartAt(tr, s0, q);
      const grp = new T.Group(); grp.position.set(q.x + q.rx * lane * LANE, 1.4, q.z + q.rz * lane * LANE);
      const m = new T.Mesh(cubeGeo, cubeMat); m.castShadow = true; grp.add(m);
      const gl = new T.Sprite(glowMat); gl.scale.set(3.4, 3.4, 1); grp.add(gl);
      scene.add(grp);
      return { grp, m, phase: Math.random() * 6, hiddenUntil: 0, base: grp.position.y };
    });
    // Tor mit drei Schildern
    const s1 = s0 + KART.ASK;
    kartAt(tr, s1, q);
    const gate = new T.Group(); gate.position.set(q.x, 0, q.z); gate.rotation.y = yawAt(q); scene.add(gate);
    const postMat = new T.MeshStandardMaterial({ color: TH.night ? 0x4338ca : 0xf1f5f9, metalness: 0.6, roughness: 0.3 });
    for (const x of [-HW - 0.3, -LANE / 2, LANE / 2, HW + 0.3]) { const p = new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 6.2, 12), postMat); p.position.set(-x, 3.1, 0); p.castShadow = true; gate.add(p); }
    const bar = new T.Mesh(new T.BoxGeometry(W + 1.2, 0.45, 0.45), postMat); bar.position.set(0, 6.1, 0); bar.castShadow = true; gate.add(bar);
    const boards = [-1, 0, 1].map((lane) => {
      const mat = new T.MeshStandardMaterial({ map: kartBoardTex('?', TH.board), roughness: 0.5, side: T.DoubleSide });
      if (TH.night) { mat.emissive = new T.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.6; }
      const b = new T.Mesh(new T.PlaneGeometry(4.0, 2.25), mat);
      b.position.set(-lane * LANE, 4.6, -0.3); b.rotation.y = Math.PI;
      gate.add(b);
      const frame = new T.Mesh(new T.BoxGeometry(4.25, 2.5, 0.12), new T.MeshStandardMaterial({ color: new T.Color(TH.board), roughness: 0.5 }));
      frame.position.set(-lane * LANE, 4.6, -0.22); gate.add(frame);
      return { mat, b, lane };
    });
    return { k, s0, s1, cubes, gate, boards, vals: null, correct: -1, label: [] };
  });

  /* Kulisse */
  const rnd = (a, b) => a + Math.random() * (b - a);
  function scatter(n, minD, maxD, avoid = HW + 6) {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 8; tries++) {
      const s = Math.random() * L, side = Math.random() < 0.5 ? -1 : 1, d = rnd(minD, maxD);
      kartAt(tr, s, q);
      const x = q.x + q.rx * side * (HW + d), z = q.z + q.rz * side * (HW + d);
      if (kartDistToTrack(tr, x, z) < avoid) continue;
      if (Math.hypot(x - kartAt(tr, 0, q2).x, z - q2.z) < 24) continue; // Start frei lassen
      out.push({ x, z, s, side, rot: Math.random() * Math.PI * 2, sc: 1 });
    }
    return out;
  }
  const dummy = new T.Object3D();
  function inst(geo, mat, list, f, { cast = true } = {}) {
    if (!list.length) return null;
    const m = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.sc); f?.(dummy, p); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  }
  const P = TH.props;
  const trunkMat = new T.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  if (P.includes('trees') || P.includes('pines') || P.includes('snowPines')) {
    const snowy = P.includes('snowPines');
    const list = scatter(P.includes('pines') || snowy ? 520 : 260, 9, 160).map((p) => ({ ...p, sc: rnd(0.8, 1.6) }));
    inst(new T.CylinderGeometry(0.35, 0.5, 3, 8), trunkMat, list, (o) => { o.position.y = 1.5 * o.scale.y; });
    const pineMat = new T.MeshStandardMaterial({ color: snowy ? 0x2f5a46 : 0x24552f, roughness: 0.85, flatShading: true });
    for (const [h, r, y] of [[4.2, 2.6, 4.2], [3.4, 2.0, 6.2], [2.6, 1.3, 7.9]]) {
      inst(new T.ConeGeometry(r, h, 9), pineMat, list, (o) => { o.position.y = y * o.scale.y; });
      if (snowy) inst(new T.ConeGeometry(r * 0.62, h * 0.42, 9), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), list, (o) => { o.position.y = (y + h * 0.3) * o.scale.y; }, { cast: false });
    }
  }
  if (P.includes('oaks')) {
    const list = scatter(220, 10, 150).map((p) => ({ ...p, sc: rnd(0.9, 1.5) }));
    inst(new T.CylinderGeometry(0.4, 0.6, 4, 8), trunkMat, list, (o) => { o.position.y = 2 * o.scale.y; });
    inst(new T.IcosahedronGeometry(3.2, 1), new T.MeshStandardMaterial({ color: 0x3f7d2c, roughness: 0.85, flatShading: true }), list, (o) => { o.position.y = 5.6 * o.scale.y; });
  }
  if (P.includes('mushrooms')) {
    const list = scatter(70, 4, 30, HW + 3).map((p) => ({ ...p, sc: rnd(0.6, 1.3) }));
    inst(new T.CylinderGeometry(0.25, 0.32, 0.9, 10), new T.MeshStandardMaterial({ color: 0xf5efe0 }), list, (o) => { o.position.y = 0.45 * o.scale.y; });
    const capTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#d7263d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h * 0.8, 3 + Math.random() * 5, 0, Math.PI * 2); g.fill(); } });
    inst(new T.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ map: capTex, roughness: 0.5 }), list, (o) => { o.position.y = 0.85 * o.scale.y; });
  }
  if (P.includes('rocks') || P.includes('marsRocks')) {
    const mars = P.includes('marsRocks');
    const list = scatter(mars ? 420 : 120, 5, 180, HW + 4).map((p) => ({ ...p, sc: rnd(0.5, mars ? 3.4 : 2.2) }));
    inst(new T.DodecahedronGeometry(1.2, 0), new T.MeshStandardMaterial({ color: mars ? 0x7c3a20 : TH.ground === 'snow' ? 0x7d8794 : 0x7b7f86, roughness: 0.95, flatShading: true }), list, (o) => { o.position.y = 0.4 * o.scale.y; o.rotation.x = Math.random(); o.scale.y *= 0.65; });
  }
  if (P.includes('craters')) {
    const list = scatter(40, 18, 200, HW + 14).map((p) => ({ ...p, sc: rnd(2, 6) }));
    inst(new T.CircleGeometry(2.2, 24), new T.MeshStandardMaterial({ color: 0x6b2a14, roughness: 1 }), list, (o) => { o.position.y = -0.1; o.rotation.set(-Math.PI / 2, 0, 0); }, { cast: false });
    inst(new T.TorusGeometry(2.3, 0.35, 6, 24), new T.MeshStandardMaterial({ color: 0x9a4220, roughness: 1, flatShading: true }), list, (o) => { o.position.y = 0.05; o.rotation.set(-Math.PI / 2, 0, 0); o.scale.z = 0.4; });
  }
  if (P.includes('domes')) {
    const list = scatter(12, 25, 110, HW + 20).map((p) => ({ ...p, sc: rnd(1, 1.8) }));
    inst(new T.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xf5f5f4, metalness: 0.3, roughness: 0.3 }), list);
    inst(new T.TorusGeometry(6, 0.25, 6, 32), new T.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.2 }), list, (o) => { o.position.y = 1.2 * o.scale.y; o.rotation.set(-Math.PI / 2, 0, 0); });
    inst(new T.CylinderGeometry(0.15, 0.15, 9, 6), new T.MeshStandardMaterial({ color: 0xd6d3d1, metalness: 0.7 }), list, (o) => { o.position.x += 7; o.position.y = 4.5; });
  }
  if (P.includes('palms')) {
    const list = scatter(170, 8, 120).map((p) => ({ ...p, sc: rnd(0.9, 1.4), lean: rnd(-0.25, 0.25) }));
    inst(new T.CylinderGeometry(0.28, 0.45, 9, 8), new T.MeshStandardMaterial({ color: 0x8b6b45, roughness: 0.95 }), list, (o, p) => { o.position.y = 4.5 * o.scale.y; o.rotation.z = p.lean; });
    const leafMat = new T.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 0.75, side: T.DoubleSide, flatShading: true });
    const leafG = new T.ConeGeometry(0.7, 5.2, 4); leafG.rotateZ(-Math.PI / 2); leafG.translate(2.5, 0, 0); leafG.scale(1, 0.25, 1);
    for (let a = 0; a < 7; a++) {
      inst(leafG, leafMat, list, (o, p) => { o.position.x += Math.sin(p.lean) * -9 * o.scale.y * 0.5; o.position.y = 9 * o.scale.y; o.rotation.set(0, p.rot + (a / 7) * Math.PI * 2, -0.35); });
    }
  }
  if (P.includes('umbrellas')) {
    const list = scatter(60, 6, 40, HW + 4);
    inst(new T.CylinderGeometry(0.06, 0.06, 2.6, 6), new T.MeshStandardMaterial({ color: 0xf5f5f5 }), list, (o) => { o.position.y = 1.3; });
    const umTex = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : ['#ef4444', '#0ea5e9', '#f59e0b'][i % 3]; g.fillRect((i * w) / 8, 0, w / 8, h); } });
    inst(new T.ConeGeometry(1.6, 0.7, 16, 1, true), new T.MeshStandardMaterial({ map: umTex, side: T.DoubleSide }), list, (o) => { o.position.y = 2.75; });
  }
  if (P.includes('huts')) {
    const list = scatter(14, 16, 70, HW + 12).map((p) => ({ ...p, sc: rnd(0.9, 1.3) }));
    inst(new T.BoxGeometry(5, 3, 4), new T.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.9 }), list, (o) => { o.position.y = 1.5 * o.scale.y; });
    inst(new T.ConeGeometry(4.2, 2.4, 4), new T.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.8, flatShading: true }), list, (o) => { o.position.y = 4.2 * o.scale.y; o.rotation.y += Math.PI / 4; });
  }
  if (P.includes('sea')) {
    const seaTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#1e88b8'; g.fillRect(0, 0, w, h); kartNoise(g, w, h, 2500, ['rgba(255,255,255,.18)', 'rgba(20,90,140,.35)', 'rgba(120,220,240,.25)'], [1, 5]); }, { repeat: [60, 60] });
    const sea = new T.Mesh(new T.PlaneGeometry(4000, 1600), new T.MeshStandardMaterial({ map: seaTex, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.95 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(tr.box.cx, 0.08, tr.box.maxZ + 70 + 800); scene.add(sea);
    st.onFrame((dt) => { seaTex.offset.x += dt * 0.01; seaTex.offset.y += dt * 0.006; });
  }
  if (P.includes('snowmen')) {
    const list = scatter(30, 5, 35, HW + 4);
    const snowMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    for (const [r, y] of [[1.1, 1.0], [0.8, 2.6], [0.55, 3.75]]) inst(new T.SphereGeometry(r, 16, 12), snowMat, list, (o) => { o.position.y = y; });
    inst(new T.ConeGeometry(0.12, 0.6, 8), new T.MeshStandardMaterial({ color: 0xf97316 }), list, (o, p) => { o.rotation.set(Math.PI / 2, 0, p.rot, 'YXZ'); o.rotation.set(Math.PI / 2, p.rot, 0, 'YXZ'); o.position.y = 3.75; o.position.x += Math.sin(p.rot) * 0.6; o.position.z += Math.cos(p.rot) * 0.6; });
    inst(new T.CylinderGeometry(0.4, 0.45, 0.6, 12), new T.MeshStandardMaterial({ color: 0x111827 }), list, (o) => { o.position.y = 4.4; });
  }
  if (P.includes('stands')) {
    const seatTex = canvasTex(256, 256, (g, w, h) => { for (let r = 0; r < 16; r++) { g.fillStyle = r % 2 ? '#334155' : '#475569'; g.fillRect(0, (r * h) / 16, w, h / 16); for (let i = 0; i < 40; i++) { g.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ffffff', '#f97316'][(Math.random() * 6) | 0]; g.fillRect(Math.random() * w, (r * h) / 16 + 3, 4, 7); } } });
    for (const sStand of [L - 58, 42]) {
      kartAt(tr, sStand, q);
      for (const side of [-1, 1]) {
        if (kartDistToTrack(tr, q.x + q.rx * side * (HW + 15), q.z + q.rz * side * (HW + 15)) < HW + 8) continue;
        if (kartDistToTrack(tr, q.x + q.rx * side * (HW + 15) + q.fx * 31, q.z + q.rz * side * (HW + 15) + q.fz * 31) < HW + 8) continue;
        if (kartDistToTrack(tr, q.x + q.rx * side * (HW + 15) - q.fx * 31, q.z + q.rz * side * (HW + 15) - q.fz * 31) < HW + 8) continue;
        const g = new T.Group(); g.position.set(q.x + q.rx * side * (HW + 9), 0, q.z + q.rz * side * (HW + 9)); g.rotation.y = yawAt(q) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        const s = new T.Mesh(new T.BoxGeometry(60, 9, 9), [new T.MeshStandardMaterial({ color: 0x64748b }), new T.MeshStandardMaterial({ color: 0x64748b }), new T.MeshStandardMaterial({ color: 0x94a3b8 }), new T.MeshStandardMaterial({ color: 0x64748b }), new T.MeshStandardMaterial({ map: seatTex }), new T.MeshStandardMaterial({ color: 0x64748b })]);
        s.position.y = 4.5; s.rotation.x = 0; s.castShadow = true; s.receiveShadow = true; g.add(s);
        const roof = new T.Mesh(new T.BoxGeometry(62, 0.5, 11), new T.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4 })); roof.position.set(0, 12, 0); roof.castShadow = true; g.add(roof);
        scene.add(g);
      }
    }
  }
  if (P.includes('tires')) {
    const list = [];
    for (let s = 0; s < L; s += 14) {
      kartAt(tr, s, q); kartAt(tr, s + 8, q2);
      const turn = q.fx * q2.fz - q.fz * q2.fx; // Kurve: Reifenstapel aussen
      if (Math.abs(turn) < 0.01) continue;
      const side = turn > 0 ? -1 : 1;
      for (let h = 0; h < 3; h++) list.push({ x: q.x + q.rx * side * (HW + 3.2), z: q.z + q.rz * side * (HW + 3.2), rot: 0, sc: 1, h });
    }
    inst(new T.TorusGeometry(0.55, 0.28, 8, 16), new T.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }), list, (o, p) => { o.position.y = 0.3 + p.h * 0.52; o.rotation.set(Math.PI / 2, 0, 0); });
  }
  if (P.includes('billboards')) {
    const ads = [['TEILMAL', '#FF6B4A'], ['1×1 TURBO', '#0F766E'], ['MAL & GETEILT', '#2563EB'], ['RECHNEN MACHT SCHNELL', '#7C3AED']];
    for (let i = 0; i < 8; i++) {
      kartAt(tr, (i + 0.5) * (L / 8), q);
      const side = i % 2 ? 1 : -1;
      const [txt, col] = ads[i % ads.length];
      const b = new T.Mesh(new T.BoxGeometry(12, 3, 0.3), [0, 0, 0, 0, 1, 1].map((x) => (x ? new T.MeshStandardMaterial({ map: kartSignTex(txt, col) }) : new T.MeshStandardMaterial({ color: 0x334155 }))));
      b.position.set(q.x + q.rx * side * (HW + 6), 3.2, q.z + q.rz * side * (HW + 6)); b.rotation.y = yawAt(q) + Math.PI + side * 0.6;
      b.castShadow = true; scene.add(b);
      for (const dx of [-4.5, 4.5]) { const p = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 2, 6), new T.MeshStandardMaterial({ color: 0x94a3b8 })); p.position.set(dx, -2.4, 0); b.add(p); }
    }
  }
  if (P.includes('towers')) {
    const winTex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#0b0b18'; g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { if (Math.random() < 0.55) { g.fillStyle = ['#fde68a', '#a5f3fc', '#f0abfc', '#ffffff'][(Math.random() * 4) | 0]; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 7, 8); } }
      g.globalAlpha = 1;
    }, { repeat: [2, 3] });
    const list = scatter(260, 14, 260, HW + 14).map((p) => ({ ...p, sc: 1, hgt: rnd(18, 110), wd: rnd(8, 18) }));
    inst(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9, roughness: 0.6 }), list, (o, p) => { o.scale.set(p.wd, p.hgt, p.wd); o.position.y = p.hgt / 2; });
  }
  if (P.includes('lamps')) {
    const list = [];
    for (let s = 0; s < L; s += 28) for (const side of [-1, 1]) { kartAt(tr, s + (side > 0 ? 14 : 0), q); list.push({ x: q.x + q.rx * side * (HW + 2.6), z: q.z + q.rz * side * (HW + 2.6), rot: 0, sc: 1 }); }
    inst(new T.CylinderGeometry(0.12, 0.16, 7, 6), new T.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 }), list, (o) => { o.position.y = 3.5; });
    const gm = new T.SpriteMaterial({ map: glowTex('rgba(240,171,252,1)', 'rgba(124,58,237,0)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    list.forEach((p, i) => { const s = new T.Sprite(gm); s.position.set(p.x, 7.2, p.z); s.scale.set(3, 3, 1); if (i % 2 === 0) s.material = gm; scene.add(s); });
  }
  if (TH.snowfall) {
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([rnd(-60, 60), rnd(0, 40), rnd(-60, 60)], i * 3);
    const gs = new T.BufferGeometry(); gs.setAttribute('position', new T.BufferAttribute(p, 3));
    const flakes = new T.Points(gs, new T.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(flakes);
    st.onFrame((dt) => {
      const a = gs.attributes.position.array;
      for (let i = 0; i < n; i++) { a[i * 3 + 1] -= dt * (3 + (i % 5)); a[i * 3] += Math.sin((st.time / 1000) + i) * dt * 0.6; if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 40; }
      gs.attributes.position.needsUpdate = true;
      flakes.position.set(camera.position.x, 0, camera.position.z);
    });
  }

  /* Fahrerinnen und Fahrer */
  const racers = KART_RACERS.map((r, i) => {
    const m = kartModel(T, r.color, r.helmet);
    scene.add(m.g);
    const row = Math.floor(i / 2), col = i % 2;
    return {
      i, name: r.name, color: r.color, bot: i > 0, m,
      p: -6 - row * 7 - (col ? 3.5 : 0), lat: col ? LANE * 0.55 : -LANE * 0.55, latV: 0, v: 0,
      fx: null, fxUntil: 0, zoneLane: null, wantLane: null, line: rnd(-HW + 2, HW - 2), phase: rnd(0, 6),
      skill: i > 0 ? rnd(0.965, 1.03) : 1, acc: i > 0 ? rnd(0.62, 0.86) : 1, finished: 0, lastLap: 0, seen: new Set(),
    };
  });
  // Startaufstellung: Du startest von Platz 4
  const me = racers[0];
  const grid = [[-6, -0.55], [-6, 0.55], [-13, -0.55], [-13, 0.55], [-20, -0.55], [-20, 0.55]];
  const order = [1, 2, 3, 0, 4, 5];
  order.forEach((ri, gi) => { racers[ri].p = grid[gi][0]; racers[ri].lat = grid[gi][1] * LANE; });

  /* Steuerung: Tasten und Tippen/Halten links oder rechts */
  const input = { left: false, right: false, ptr: new Map() };
  const steerOf = () => {
    let s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (const x of input.ptr.values()) s += x;
    return clamp(s, -1, 1);
  };
  const onKey = (e, down) => {
    const k = e.key;
    if (['ArrowLeft', 'a', 'A'].includes(k)) { input.left = down; e.preventDefault(); }
    if (['ArrowRight', 'd', 'D'].includes(k)) { input.right = down; e.preventDefault(); }
  };
  const kd = (e) => { if (ui.view === 'game' && !ui.modal) onKey(e, true); };
  const ku = (e) => onKey(e, false);
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  const ptrSide = (e) => { const r = host.getBoundingClientRect(); return e.clientX - r.left < r.width / 2 ? -1 : 1; };
  const pd = (e) => { input.ptr.set(e.pointerId, ptrSide(e)); host.setPointerCapture?.(e.pointerId); e.preventDefault(); };
  const pm = (e) => { if (input.ptr.has(e.pointerId)) input.ptr.set(e.pointerId, ptrSide(e)); };
  const pu = (e) => { input.ptr.delete(e.pointerId); };
  host.addEventListener('pointerdown', pd); host.addEventListener('pointermove', pm);
  host.addEventListener('pointerup', pu); host.addEventListener('pointercancel', pu); host.addEventListener('pointerleave', pu);
  // Motorgeräusch (leise, nur mit Tönen)
  let engine = null;
  function startEngine() {
    if (!db.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), o2 = audioCtx.createOscillator(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 520; g.gain.value = 0.0001;
      o.connect(f); o2.connect(f); f.connect(g).connect(audioCtx.destination);
      o.start(); o2.start();
      g.gain.exponentialRampToValueAtTime(0.022, audioCtx.currentTime + 0.4);
      engine = { o, o2, g, f };
    } catch { engine = null; }
  }
  function stopEngine() {
    if (!engine) return;
    try { engine.g.gain.cancelScheduledValues(audioCtx.currentTime); engine.g.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08); const e = engine; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch { /* */ } }, 400); } catch { /* */ }
    engine = null;
  }
  game.cleanups.push(() => {
    document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku);
    stopEngine();
  });

  /* Anzeige */
  const elPlace = $('#kplace'), elLap = $('#klap'), elRank = $('#krank'), elTime = $('#ktime'), elAsk = $('#kask'), elTask = $('#ktask'), elAns = $('#kans'), elHint = $('#kaskhint'), elLines = $('#klines'), elCount = $('#kcount');
  const map = $('#kmap'), mg = map.getContext('2d');
  const mapImg = document.createElement('canvas'); mapImg.width = map.width; mapImg.height = map.height;
  const mb = tr.box, msc = Math.min((map.width - 30) / (mb.maxX - mb.minX), (map.height - 30) / (mb.maxZ - mb.minZ));
  const mx = (x) => map.width / 2 + (x - mb.cx) * msc, my = (z) => map.height / 2 + (z - mb.cz) * msc;
  {
    const g = mapImg.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [w, c] of [[11, 'rgba(0,0,0,.35)'], [7, 'rgba(255,255,255,.9)']]) {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      for (let s = 0; s <= L; s += 6) { kartAt(tr, s, q); s === 0 ? g.moveTo(mx(q.x), my(q.z)) : g.lineTo(mx(q.x), my(q.z)); }
      g.closePath(); g.stroke();
    }
    kartAt(tr, 0, q); g.fillStyle = '#111'; g.fillRect(mx(q.x) - 5, my(q.z) - 5, 10, 10);
  }
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  function drawMap() {
    mg.clearRect(0, 0, map.width, map.height); mg.drawImage(mapImg, 0, 0);
    for (const r of [...racers].reverse()) {
      kartAt(tr, r.p, q);
      mg.fillStyle = hex(r.color); mg.strokeStyle = '#fff'; mg.lineWidth = r.bot ? 2 : 3;
      mg.beginPath(); mg.arc(mx(q.x + q.rx * r.lat), my(q.z + q.rz * r.lat), r.bot ? 6 : 9, 0, Math.PI * 2); mg.fill(); mg.stroke();
    }
  }
  const total = KART.LAPS * L;
  const placeOf = (r) => 1 + racers.filter((o) => o !== r && (o.finished ? (!r.finished || o.finished < r.finished) : !r.finished && o.p > r.p)).length;
  function hud() {
    const pl = placeOf(me);
    elPlace.textContent = `${pl}.`;
    const lap = clamp(Math.floor(Math.max(0, me.p) / L) + 1, 1, KART.LAPS);
    elLap.textContent = `Runde ${lap}/${KART.LAPS}`;
    const ranking = [...racers].sort((a, b) => placeOf(a) - placeOf(b));
    elRank.innerHTML = ranking.map((r) => `<li class="${r.bot ? '' : 'me'}"><i style="background:${hex(r.color)}"></i>${esc(r.name)}</li>`).join('');
  }

  /* Ablauf */
  const S = { phase: 'intro', t0: 0, raceT0: 0, ask: null, lastP: me.p, ok: 0, wrong: 0, wrongs: [], fovBoost: 0 };
  game.kart = S;
  S.dbg = { racers, stations, tr, me: () => me }; // für Tests
  const look = new T.Vector3();
  S.camLat = me.lat; S.camBack = 7.4; S.camY = 3.4;
  /** Kamera hinter dir, entlang der Strecke (in Kurven schaut sie mit) */
  function camTarget(out, outLook) {
    kartAt(tr, me.p - S.camBack, q);
    out.set(q.x + q.rx * S.camLat * 0.8, S.camY, q.z + q.rz * S.camLat * 0.8);
    kartAt(tr, me.p + 12, q2);
    outLook.set(q2.x + q2.rx * S.camLat * 0.5, 1.35, q2.z + q2.rz * S.camLat * 0.5);
  }
  const cDes = new T.Vector3(), lDes = new T.Vector3();
  // Kameraflug zum Start
  camTarget(cDes, lDes);
  camera.position.set(cDes.x + 60, 70, cDes.z + 40); look.copy(lDes);
  camera.lookAt(look);

  function placeKart(r, dt) {
    kartAt(tr, r.p, q);
    r.m.g.position.set(q.x + q.rx * r.lat, 0, q.z + q.rz * r.lat);
    const yaw = Math.atan2(q.fx, q.fz) - Math.atan2(r.latV, Math.max(6, r.v)) * 0.85;
    r.m.g.rotation.y = yaw;
    const spin = (r.v * dt) / 0.38;
    for (const w of r.m.wheels) { w.spin.rotation.x += spin; if (w.front) w.steer.rotation.y = clamp(-r.latV * 0.05, -0.4, 0.4); }
    r.m.body.rotation.z = clamp(r.latV * 0.012, -0.08, 0.08);
    r.m.body.position.y = r.fx === 'slow' ? Math.abs(Math.sin(st.time / 70)) * 0.06 : 0;
    const boost = r.fx === 'turbo';
    const fs = boost ? 0.9 + Math.random() * 0.5 : 0.01;
    r.m.flames.forEach((f) => f.scale.set(fs, fs, 1));
  }
  racers.forEach((r) => placeKart(r, 0));
  hud(); drawMap();

  function laneOf(lat) { return lat < -LANE / 2 ? 0 : lat > LANE / 2 ? 2 : 1; }
  const lapS = (p) => ((p % L) + L) % L;
  /** In einer Gabelung: Spur festhalten (Inseln dazwischen) */
  function zoneAt(p) {
    const s = lapS(p);
    for (const stn of stations) for (const c of [stn.s0, stn.s1]) if (Math.abs(s - c) <= KART.ZONE + 0.5) return c;
    return null;
  }
  function setFx(r, kind) { r.fx = kind; r.fxUntil = st.time + KART.FX_MS; }
  function smoke(r) {
    kartAt(tr, r.p - 1.4, q);
    burst(st, new T.Vector3(q.x + q.rx * r.lat, 0.8, q.z + q.rz * r.lat), { n: 18, colors: [0x9ca3af, 0xd1d5db, 0x6b7280], speed: 1.6, life: 0.9, size: 0.9, gravity: 1.2 });
  }
  function shatterCube(c) {
    const pos = c.grp.getWorldPosition(new T.Vector3());
    c.hiddenUntil = st.time + 2600; c.grp.visible = false;
    burst(st, pos, { n: 70, colors: [0x22d3ee, 0xa78bfa, 0xf472b6, 0xffffff], speed: 7, life: 0.8, size: 0.35, gravity: -6 });
    const shards = [];
    for (let i = 0; i < 14; i++) {
      const s = new T.Mesh(new T.BoxGeometry(rnd(0.15, 0.45), rnd(0.15, 0.45), 0.06), cubeMat);
      s.position.copy(pos); s.userData.v = new T.Vector3(rnd(-6, 6), rnd(2, 8), rnd(-6, 6)); s.userData.r = new T.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
      scene.add(s); shards.push(s);
    }
    let age = 0;
    const off = st.onFrame((dt) => {
      age += dt;
      shards.forEach((s) => { s.userData.v.y -= 16 * dt; s.position.addScaledVector(s.userData.v, dt); s.rotation.x += s.userData.r.x * dt; s.rotation.y += s.userData.r.y * dt; });
      if (age > 1) { off(); shards.forEach((s) => { scene.remove(s); s.geometry.dispose(); }); }
    });
    tone([1760, 2349, 3136], 0.06, 'triangle', 0.06); noise(0.2, { freq: 4200, gain: 0.05 });
  }
  function showAsk(stn) {
    const t = game.picker.next();
    const vals = choicesFor(t, 3);
    stn.vals = vals; stn.correct = vals.indexOf(t.answer); stn.task = t;
    S.ask = { stn, t, at: performance.now() };
    stn.boards.forEach((b, i) => { b.mat.map?.dispose(); b.mat.map = kartBoardTex(String(vals[i]), TH.board); if (b.mat.emissiveMap) b.mat.emissiveMap = b.mat.map; b.mat.needsUpdate = true; });
    elTask.innerHTML = taskHTML(t, '<span class="slot">?</span>');
    elAns.innerHTML = vals.map((v, i) => `<span class="ka" data-i="${i}"><small>${['◀', '▲', '▶'][i]}</small>${v}</span>`).join('');
    elHint.textContent = 'Fahr durch das richtige Ergebnis';
    elAsk.hidden = false; elAsk.className = 'kart-ask'; void elAsk.offsetWidth; elAsk.classList.add('pop');
    // Zahlen über den Toren, sobald sie nah sind
    stn.label.forEach((l) => st.removeLabel(l));
    stn.label = vals.map((v, i) => {
      const el = document.createElement('div'); el.className = 'kart-num'; el.textContent = v;
      const pos = new T.Vector3();
      return st.addLabel(el, () => {
        const d = lapS(stn.s1 - me.p);
        if (!S.ask || S.ask.stn !== stn || d > 70) return null;
        kartAt(tr, stn.s1, q2);
        return pos.set(q2.x + q2.rx * (i - 1) * LANE, 4.6, q2.z + q2.rz * (i - 1) * LANE);
      }, { base: 1, min: 0.55, max: 1.5, dist: 22 });
    });
  }
  function answer(stn, lane) {
    const a = S.ask; if (!a || a.stn !== stn) return;
    S.ask = null;
    const val = stn.vals[lane];
    const ok = recordAnswer(a.t, val, 3000);
    $$('#kans .ka').forEach((el, i) => el.classList.add(i === stn.correct ? 'right' : i === lane ? 'wrong' : 'fade'));
    stn.label.forEach((l, i) => l.el.classList.add(i === stn.correct ? 'right' : i === lane ? 'wrong' : 'fade'));
    if (ok) {
      S.ok++; setFx(me, 'turbo'); sfx.good(); tone([523, 784, 1047, 1568], 0.07, 'sawtooth', 0.05);
      elAsk.classList.add('ok'); elHint.textContent = 'Richtig – Turbo!';
      elTask.innerHTML = esc(taskText(a.t, true));
      bigWord(host, 'TURBO!', 'good kart-word');
      kartAt(tr, me.p + 2, q);
      burst(st, new T.Vector3(q.x + q.rx * me.lat, 1.5, q.z + q.rz * me.lat), { n: 60, colors: [0x22c55e, 0xbbf7d0, 0xffffff], speed: 6, life: 0.7, size: 0.3 });
    } else {
      S.wrong++; S.wrongs.push(a.t); setFx(me, 'slow'); sfx.bad(); smoke(me); st.shake(0.25);
      elAsk.classList.add('bad'); elHint.textContent = 'Schade – das war nicht richtig';
      elTask.innerHTML = esc(taskText(a.t, true));
    }
    const keep = stn;
    gLater(() => { if (!S.ask) elAsk.hidden = true; keep.label.forEach((l) => st.removeLabel(l)); keep.label = []; }, 1700);
  }
  function botStation(r, stn, isGate) {
    if (!isGate) return;
    // Computer-Fahrer: richtig mit ihrer Trefferquote, angepasst an den Abstand zu dir (bleibt spannend)
    const d = r.p - me.p;
    const acc = clamp(r.acc - (d > 25 ? 0.18 : 0) + (d < -25 ? 0.12 : 0), 0.35, 0.95);
    r.nextOk = Math.random() < acc;
  }

  /* Rennlogik pro Bild */
  const cPos = new T.Vector3();
  st.onFrame((dt) => {
    if (st.disposed) return;
    const now = st.time;
    // Würfel drehen, wieder auftauchen
    for (const stn of stations) for (const c of stn.cubes) {
      c.m.rotation.y += dt * 1.4; c.m.rotation.x = Math.sin(now / 900 + c.phase) * 0.25;
      c.grp.position.y = c.base + Math.sin(now / 500 + c.phase) * 0.18;
      if (!c.grp.visible && now > c.hiddenUntil) { c.grp.visible = true; c.grp.scale.setScalar(0.01); st.tween(300, (u, e) => c.grp.scale.setScalar(Math.max(0.01, e))); }
    }
    if (S.phase === 'intro') {
      camTarget(cDes, lDes);
      const u = clamp((now - S.t0) / 2600, 0, 1), e = ease.inOut(u);
      camera.position.lerp(cDes, 1 - Math.pow(0.0005, dt * (0.4 + e)));
      look.lerp(lDes, 1 - Math.pow(0.001, dt));
      camera.lookAt(look);
      if (u >= 1 && (camera.position.distanceTo(cDes) < 0.6 || now - S.t0 > 4200)) { S.phase = 'count'; countdown(); }
      return;
    }
    const racing = S.phase === 'race' || S.phase === 'done';
    const steer = S.phase === 'race' ? steerOf() : 0;
    $('#kpl')?.classList.toggle('on', steer < 0); $('#kpr')?.classList.toggle('on', steer > 0);
    for (const r of racers) {
      if (r.fx && now > r.fxUntil) r.fx = null;
      let target = 0;
      if (racing) {
        target = KART.BASE * r.skill * (r.fx === 'turbo' ? KART.TURBO : r.fx === 'slow' ? KART.SLOW : 1);
        if (r.bot) {
          // Gummiband: wer weit vorne ist, wird etwas langsamer – wer hinten ist, etwas schneller
          const d = r.p - me.p;
          target *= 1 - clamp(d / 70, -1, 1) * 0.09;
          if (r.finished) target *= 0.6;
        }
        if (r === me && S.phase === 'done') target *= 0.55;
        if (Math.abs(r.lat) > HW - 0.9) target *= 0.8; // auf dem Randstein
      }
      r.v += (target - r.v) * Math.min(1, dt * (target > r.v ? 1.3 : 2.4));
      // Lenken
      let latGoal;
      if (r.bot) {
        const s = lapS(r.p);
        let lane = null;
        for (const stn of stations) {
          for (const [c, gate] of [[stn.s0, false], [stn.s1, true]]) {
            const ahead = c - s;
            if (ahead > -KART.ZONE && ahead < 55) {
              if (r.wantFor !== `${stn.k}${gate}${Math.floor(r.p / L)}`) {
                r.wantFor = `${stn.k}${gate}${Math.floor(r.p / L)}`;
                botStation(r, stn, gate);
                if (gate) {
                  const right = stn.correct >= 0 && S.ask?.stn === stn ? stn.correct : Math.floor(Math.random() * 3);
                  const wrongs = [0, 1, 2].filter((x) => x !== right);
                  r.wantLane = r.nextOk ? right : wrongs[Math.floor(Math.random() * 2)];
                  r.gateRight = right;
                } else r.wantLane = Math.floor(Math.random() * 3);
              }
              lane = r.wantLane;
            }
          }
        }
        latGoal = lane != null ? (lane - 1) * LANE : clamp(r.line + Math.sin(now / 1700 + r.phase) * 2.2, -HW + 1.4, HW - 1.4);
        const want = clamp((latGoal - r.lat) * 2.2, -8, 8);
        r.latV += (want - r.latV) * Math.min(1, dt * 5);
      } else {
        r.latV += (steer * 11 - r.latV) * Math.min(1, dt * 7);
      }
      const prevP = r.p;
      r.p += r.v * dt;
      r.lat += r.latV * dt;
      // Gabelung: Spur festhalten
      const z = zoneAt(r.p);
      if (z != null) {
        if (r.zone !== z) { r.zone = z; r.zoneLane = laneOf(r.lat); }
        const lo = (r.zoneLane - 1) * LANE - LANE / 2 + 0.95, hi = (r.zoneLane - 1) * LANE + LANE / 2 - 0.95;
        if (r.lat < lo) { r.lat = lo; r.latV = Math.max(0, r.latV); }
        if (r.lat > hi) { r.lat = hi; r.latV = Math.min(0, r.latV); }
      } else r.zone = null;
      r.lat = clamp(r.lat, -HW - 0.2, HW + 0.2);
      // Stationen überquert?
      if (racing && !r.finished) {
        const a = lapS(prevP), b = lapS(r.p);
        const crossed = (c) => (prevP < r.p) && ((a <= c && b > c) || (a > b && (c >= a || c < b)));
        const lapNo = Math.floor(r.p / L);
        const once = (k) => (r.seen.has(k) ? false : (r.seen.add(k), true)); // jeder Würfel und jedes Tor nur einmal pro Runde
        for (const stn of stations) {
          if (crossed(stn.s0) && once(`${lapNo}:${stn.k}:c`)) {
            const lane = laneOf(r.lat);
            if (r === me) { shatterCube(stn.cubes[lane]); if (prevP >= -1) showAsk(stn); }
            else if (Math.abs(r.p - me.p) < 120) { const c = stn.cubes[lane]; if (c.grp.visible) burst(st, c.grp.getWorldPosition(cPos), { n: 16, colors: [0xa78bfa, 0xffffff], speed: 3, life: 0.4, size: 0.25 }); }
          }
          if (crossed(stn.s1) && once(`${lapNo}:${stn.k}:g`)) {
            const lane = laneOf(r.lat);
            if (r === me) answer(stn, lane);
            else {
              const ok = r.gateRight != null ? lane === r.gateRight : r.nextOk;
              setFx(r, ok ? 'turbo' : 'slow');
              if (!ok && Math.abs(r.p - me.p) < 80) smoke(r);
            }
          }
        }
        if (r.p >= total) { r.finished = now; if (r === me) finish(); }
      }
    }
    // Rempler: Karts fahren nicht ineinander. In einer Gabelung (feste Spur) hintereinander, sonst seitlich ausweichen.
    for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
      const A = racers[i], B = racers[j];
      const ds = B.p - A.p, dl = B.lat - A.lat;
      if (Math.abs(ds) >= 2.3 || Math.abs(dl) >= 1.7) continue;
      if (A.zone != null || B.zone != null) {
        const [front, back] = ds > 0 ? [B, A] : [A, B];
        back.p = front.p - 2.3; back.v = Math.min(back.v, front.v * 0.97);
      } else {
        const push = (1.7 - Math.abs(dl)) * 0.5 * (dl >= 0 ? 1 : -1);
        B.lat += push; A.lat -= push; B.latV += push * 4; A.latV -= push * 4;
        if (ds > 0) A.v *= 0.985; else B.v *= 0.985;
      }
      if ((A === me || B === me) && (!S.bumpT || now - S.bumpT > 400)) { S.bumpT = now; tone([110, 90], 0.06, 'square', 0.03); }
    }
    racers.forEach((r) => placeKart(r, dt));
    // Kamera: folgt dir genau (kein Nachhinken), weich nur seitlich, in der Höhe und beim Turbo
    S.camLat += (me.lat - S.camLat) * (1 - Math.pow(0.03, dt));
    S.camBack += ((me.fx === 'turbo' ? 8.4 : 7.4) - S.camBack) * (1 - Math.pow(0.05, dt));
    S.camY += ((me.fx === 'turbo' ? 3.1 : 3.4) - S.camY) * (1 - Math.pow(0.05, dt));
    camTarget(cDes, lDes);
    camera.position.copy(cDes);
    look.lerp(lDes, 1 - Math.pow(0.00001, dt));
    camera.lookAt(look);
    const fovGoal = 62 + (me.fx === 'turbo' ? 12 : me.fx === 'slow' ? -4 : 0) + (me.v / KART.BASE) * 2;
    camera.fov += (fovGoal - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    elLines.classList.toggle('on', me.fx === 'turbo');
    host.classList.toggle('slow', me.fx === 'slow');
    // Schatten folgen dir
    kartAt(tr, me.p, q);
    sun.target.position.set(q.x, 0, q.z); sun.position.set(q.x + sunDir.x * 60, sunDir.y * 60, q.z + sunDir.z * 60);
    if (nightLight) nightLight.position.set(q.x + q.rx * me.lat + q.fx * 3, 9, q.z + q.rz * me.lat + q.fz * 3);
    if (engine) { const f = 55 + me.v * 3.2 + (me.fx === 'turbo' ? 40 : 0); engine.o.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.05); engine.o2.frequency.setTargetAtTime(f * 0.5, audioCtx.currentTime, 0.05); }
    // Anzeige (nicht jedes Bild)
    S.hudT = (S.hudT || 0) + dt;
    if (S.hudT > 0.2) { S.hudT = 0; hud(); drawMap(); }
    if (S.phase === 'race') elTime.textContent = `${fmtSec(now - S.raceT0)} s`;
    if (S.ask) {
      const ln = laneOf(me.lat);
      $$('#kans .ka').forEach((el, i) => el.classList.toggle('here', i === ln));
    }
  });

  function countdown() {
    const steps = ['3', '2', '1', 'LOS!'];
    steps.forEach((t, i) => gLater(() => {
      elCount.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${t}</span>`;
      tone(i === 3 ? [880, 1320] : [440], i === 3 ? 0.18 : 0.12, 'square', 0.05);
      if (i === 3) { S.phase = 'race'; S.raceT0 = st.time; startEngine(); gLater(() => { elCount.innerHTML = ''; }, 700); }
    }, i * 850));
  }
  function finish() {
    if (S.phase === 'done') return;
    S.phase = 'done';
    const place = placeOf(me);
    const ms = Math.round(st.time - S.raceT0);
    stopEngine();
    elAsk.hidden = true;
    if (place <= 3) { sfx.win?.(); confetti(); }
    bigWord(host, `${place}. Platz!`, place <= 3 ? 'good' : '');
    gLater(() => { if (ui.view === 'game' && game.kart === S) showKartResult({ place, ms, ok: S.ok, wrong: S.wrong, wrongs: S.wrongs, track: tid }); }, 2600);
  }
  S.t0 = st.time;
}

/* ---------------- Ergebnis ---------------- */
function showKartResult(r) {
  stopGame();
  const board = boardOf('kart', 'speed');
  const key = localBestKey(board), old = db.prog.best[key];
  const rec = old == null || r.ms < old;
  if (rec) { db.prog.best[key] = r.ms; saveDB(); }
  const st = r.place === 1 ? 3 : r.place <= 3 ? 2 : 1;
  if (r.place <= 3 || rec) { sfx.win?.(); confetti(); }
  const medal = ['🥇', '🥈', '🥉'][r.place - 1] || '🏁';
  const tr = KART_TRACKS.find((t) => t.id === r.track);
  const wrongs = [...new Map(r.wrongs.map((t) => [t.key + t.op, t])).values()].slice(0, 8);
  $('#view').innerHTML = gameShell('kart', `<div class="run-result">
      <div class="result">
        <p class="run-mode-tag">${tr ? `${tr.emo} ${esc(tr.name)}` : ''} · 3 Runden · ${esc(OP_INFO[practiceSettings().op][0])}</p>
        ${stars(st)}<h2>${medal} ${r.place}. Platz!</h2>
        <p class="result-line">Zeit <b>${fmtSec(r.ms)} s</b> · ${r.ok} von ${r.ok + r.wrong} richtig${r.wrong ? '' : ' – ohne Fehler!'}</p>
        ${rec && old != null ? '<p class="pill good">Neue Bestzeit!</p>' : old != null ? `<p class="muted small">Deine Bestzeit: ${fmtSec(old)} s</p>` : ''}
        ${wrongs.length ? `<div class="mistakes"><p class="label">Merk dir</p><ul>${wrongs.map((t) => `<li><span class="m-task">${esc(taskText(t, true))}</span></li>`).join('')}</ul></div>` : ''}
        <div class="row center"><button class="btn primary big" data-action="game-again">${icon('flip')} Nochmals</button><button class="btn ghost big" data-action="home">Anderes Spiel</button></div>
      </div>
      <div class="board-card" id="board"><div class="board-head"><h3>${icon('trophy')} Bestenliste</h3></div><p class="muted"><span class="spinner"></span> wird geladen …</p></div>
    </div>`);
  fillBoard({ id: 'kart', mode: 'speed' }, board, r.ms);
}
