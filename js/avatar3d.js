/* Teilmal – 3D-Avatar (Voxel-Baukasten, rund geglättet)
 *
 * Gebaut wird die Figur wie mit Klötzchen: Kleidung, Frisuren und Gegenstände sind kleine 3D-Pixelbilder (Voxel),
 * alles im Code – keine Modelldateien, keine fremden Assets, kein Download, keine Lizenzfragen.
 * Danach wird daraus eine glatte, runde Oberfläche gerechnet (Surface Nets + Glättung); das Gesicht wird
 * als Bild aufgelegt (Augen, Brauen, Mund) und wechselt mit der Bewegung (Mimik, Blinzeln).
 * Körperteile sind starr (Kopf, Körper, Arme, Beine) und drehen sich um ihre Gelenke –
 * darum braucht es kein Skelett, und es läuft auch auf älteren Tablets flüssig.
 * Benutzt nur three.js (bereits im Projekt, MIT-Lizenz).
 *
 * Masse in Voxeln (1 Voxel = VOX.S Meter). Der Ursprung der Figur ist zwischen den Füssen auf dem Boden.
 *   Beine 5×13×6 (mit Schuhen), Körper 10×11×6, Arme 4×11×6, Kopf 12×12×12. Vorne ist +z.
 * Kleidung liegt in Schichten: Körper (Haut) → Hose → Schuhe → Oberteil → Gurt/Tasche → Hals → Rücken → Kopf.
 */
'use strict';

// Gebaut wird zuerst grob (1 Voxel = 6 cm), dann jedes Voxel in 2×2×2 feine Voxel geteilt (3 cm) für Gesicht und Verzierungen.
const VOX = { S: 0.03, LEG: 13, HIP: 13, NECK: 24, SHOULDER: 23, ARM_X: 7, smooth: true, round: 14 };

/* ---------------- Voxel-Menge ---------------- */
const vxK = (x, y, z) => ((x + 256) * 512 + (y + 256)) * 512 + (z + 256);
class VoxSet {
  constructor() { this.m = new Map(); this.tag = null; }
  set(x, y, z, c, mat = 0, tag = this.tag) { this.m.set(vxK(x, y, z), { x, y, z, c, mat, tag }); return this; }
  setIfEmpty(x, y, z, c, mat = 0, tag = this.tag) { if (!this.has(x, y, z)) this.set(x, y, z, c, mat, tag); return this; }
  get(x, y, z) { return this.m.get(vxK(x, y, z)); }
  has(x, y, z) { return this.m.has(vxK(x, y, z)); }
  del(x, y, z) { this.m.delete(vxK(x, y, z)); return this; }
  /** Quader füllen (Grenzen eingeschlossen). c: Farbe oder fn(x,y,z) → Farbe/null */
  box(x0, y0, z0, x1, y1, z1, c, mat = 0) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const cc = typeof c === 'function' ? c(x, y, z) : c;
      if (cc != null) this.set(x, y, z, cc, mat);
    }
    return this;
  }
  /** vorhandene Voxel umfärben: fn(v) → neue Farbe oder null (lassen) */
  paint(fn) { for (const v of this.m.values()) { const r = fn(v); if (r != null) { v.c = r; if (this.tag) v.tag = this.tag; } } return this; }
  recolor(x, y, z, c, mat) { const v = this.get(x, y, z); if (v) { v.c = c; if (mat != null) v.mat = mat; if (this.tag) v.tag = this.tag; } return this; }
  filter(fn) { for (const [k, v] of this.m) if (!fn(v)) this.m.delete(k); return this; }
}

/* ---------------- Hilfen ---------------- */
function vxRand(x, y, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul((s | 0) + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Farbe heller (amt > 0) oder dunkler (amt < 0) */
function vxShade(hex, amt) {
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255);
}
/** zwei Farben mischen (t = 0: a, t = 1: b) */
function vxMix(a, b, t) {
  const m = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
/** gerade Linie aus Voxeln (Gurte, Ketten) */
function vxLine(set, a, b, c, mat = 0) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    set.set(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), typeof c === 'function' ? c(i) : c, mat);
  }
}
/** kleines Pixelbild auf eine senkrechte Fläche (rows: oben → unten, '.' = leer, Buchstaben = Farben aus pal) */
function vxSprite(set, rows, pal, x0, y0, z, mat = 0) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch] != null) set.set(x0 + i, y0 - j, z, pal[ch], mat); }));
}
/** Ring um einen Quader (für Bündchen, Uhren, Stulpen): Schicht im Abstand d auf Höhe y */
function vxRing(set, x0, z0, x1, z1, y, d, colorFn, mat = 0) {
  for (let x = x0 - d; x <= x1 + d; x++) for (let z = z0 - d; z <= z1 + d; z++) {
    if (x > x0 - d && x < x1 + d && z > z0 - d && z < z1 + d) continue;
    const c = colorFn(x, y, z);
    if (c != null) set.set(x, y, z, c, mat);
  }
}
/** Schale um einen Quader (eine Schicht aussen herum, optional oben) */
function vxShell(set, x0, y0, z0, x1, y1, z1, colorFn, { top = false, mat = 0 } = {}) {
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = y0; y <= y1 + (top ? 1 : 0); y++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    const inX = x >= x0 && x <= x1, inZ = z >= z0 && z <= z1;
    if (inX && inZ && y <= y1) continue;
    if (y > y1 && !(inX && inZ)) continue;
    const c = colorFn(x, y, z);
    if (c != null) set.set(x, y, z, c, mat);
  }
}
/** Haarbüschel: Klumpen, der in Richtung d dünner wird */
function vxSpike(set, p, d, len, r0, colors, seed, avoid) {
  const dl = Math.hypot(d[0], d[1], d[2]) || 1;
  const u = [d[0] / dl, d[1] / dl, d[2] / dl];
  const base = colors[Math.floor(vxRand(p[0], p[1], p[2], seed) * colors.length)];
  for (let k = 0; k < len; k++) {
    const r = Math.max(0, Math.round(r0 * (1 - k / len)));
    const c = [Math.round(p[0] + u[0] * k * 1.1), Math.round(p[1] + u[1] * k * 1.1), Math.round(p[2] + u[2] * k * 1.1)];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let l = -r; l <= r; l++) {
      if (Math.abs(i) + Math.abs(j) + Math.abs(l) > r + (r > 1 ? 1 : 0)) continue;
      const x = c[0] + i, y = c[1] + j, z = c[2] + l;
      if (avoid && avoid(x, y, z)) continue;
      set.set(x, y, z, k >= len - 1 ? vxShade(base, 0.12) : base);
    }
  }
}

/* ---------------- Mesh: nur sichtbare Flächen, Ecken-Verschattung (AO) und Pixel-Schattierung ---------------- */
function vxGeometry(T, set, { ao = 0.14, noise = 0.025, seed = 0 } = {}) {
  const S = VOX.S;
  const per = new Map();
  const col = new T.Color();
  const has = (p) => set.has(p[0], p[1], p[2]);
  for (const v of set.m.values()) {
    let g = per.get(v.mat);
    if (!g) { g = { pos: [], nor: [], col: [] }; per.set(v.mat, g); }
    col.setHex(v.c);
    const glow = v.mat === 2;
    // wie gemalt: oben ein Hauch heller, unten dunkler, Kanten etwas dunkler
    let pk = 1;
    if (!glow) {
      pk = 1 + (vxRand(v.x, v.y, v.z, seed) - 0.5) * 2 * noise;
      if (!set.has(v.x, v.y + 1, v.z)) pk *= 1.08;
      if (!set.has(v.x, v.y - 1, v.z)) pk *= 0.88;
      const open = (set.has(v.x + 1, v.y, v.z) ? 0 : 1) + (set.has(v.x - 1, v.y, v.z) ? 0 : 1) + (set.has(v.x, v.y, v.z + 1) ? 0 : 1) + (set.has(v.x, v.y, v.z - 1) ? 0 : 1);
      if (open >= 2) pk *= 0.95;
    }
    for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
      const n = [0, 0, 0]; n[a] = s;
      const front = [v.x + n[0], v.y + n[1], v.z + n[2]];
      if (has(front)) continue;
      const u = (a + 1) % 3, w = (a + 2) % 3;
      const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
      const vs = corners.map(([du, dw]) => {
        const p = [v.x, v.y, v.z];
        p[a] += s > 0 ? 1 : 0; p[u] += du; p[w] += dw;
        const o1 = front.slice(); o1[u] += du ? 1 : -1;
        const o2 = front.slice(); o2[w] += dw ? 1 : -1;
        const o3 = o1.slice(); o3[w] += dw ? 1 : -1;
        const s1 = has(o1) ? 1 : 0, s2 = has(o2) ? 1 : 0, s3 = has(o3) ? 1 : 0;
        const occ = s1 && s2 ? 3 : s1 + s2 + s3;
        return { p, k: (glow ? 1 : 1 - occ * ao) * pk };
      });
      const order = vs[0].k + vs[2].k < vs[1].k + vs[3].k ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      for (const i of order) {
        const q = vs[i];
        g.pos.push(q.p[0] * S, q.p[1] * S, q.p[2] * S);
        g.nor.push(n[0], n[1], n[2]);
        g.col.push(col.r * q.k, col.g * q.k, col.b * q.k);
      }
    }
  }
  const pos = [], nor = [], cl = [];
  const geo = new T.BufferGeometry();
  let start = 0;
  for (const mat of [...per.keys()].sort()) {
    const g = per.get(mat);
    for (let i = 0; i < g.pos.length; i++) { pos.push(g.pos[i]); nor.push(g.nor[i]); cl.push(g.col[i]); }
    const count = g.pos.length / 3;
    geo.addGroup(start, count, mat);
    start += count;
  }
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(cl, 3));
  geo.computeBoundingSphere();
  return geo;
}
/**
 * Glatte Oberfläche aus den Voxeln («Surface Nets» + Taubin-Glättung): gleiche Teile, aber rund statt eckig.
 * Jede sichtbare Voxel-Fläche wird zu einem Viereck; dessen Ecken liegen in den Nachbarzellen und werden geglättet.
 * decal: optional { test(v, a, s) → bool, uv(x, y, z) → [u, v] } – sammelt Flächen für ein aufgelegtes Bild (Gesicht).
 */
function vxSmoothGeometry(T, set, { iter = VOX.round, ao = 0, noise = 0, seed = 0, decal = null } = {}) {
  const S = VOX.S;
  const vid = new Map(), P = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cellVertex = (cx, cy, cz) => {
    const k = vxK(cx, cy, cz);
    let i = vid.get(k);
    if (i != null) return i;
    const occ = [];
    for (let d = 0; d < 8; d++) occ[d] = set.has(cx + (d & 1), cy + ((d >> 1) & 1), cz + ((d >> 2) & 1));
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) if (occ[a] !== occ[b]) {
      sx += ((a & 1) + (b & 1)) / 2; sy += (((a >> 1) & 1) + ((b >> 1) & 1)) / 2; sz += (((a >> 2) & 1) + ((b >> 2) & 1)) / 2; n++;
    }
    i = P.length / 3;
    P.push(cx + 0.5 + sx / n, cy + 0.5 + sy / n, cz + 0.5 + sz / n);
    vid.set(k, i);
    return i;
  };
  const quads = []; // [i0,i1,i2,i3, mat, r,g,b ×4 (AO je Ecke), decal?]
  const col = new T.Color();
  const has = (p) => set.has(p[0], p[1], p[2]);
  for (const v of set.m.values()) {
    col.setHex(v.c);
    const glow = v.mat === 2;
    const pk = glow || !noise ? 1 : 1 + (vxRand(v.x, v.y, v.z, seed) - 0.5) * 2 * noise;
    const dec = !!(decal && decal.test(v));
    for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
      const n = [0, 0, 0]; n[a] = s;
      const front = [v.x + n[0], v.y + n[1], v.z + n[2]];
      if (has(front)) continue;
      const u = (a + 1) % 3, w = (a + 2) % 3;
      const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
      const q = { idx: [], k: [], mat: v.mat, c: [col.r, col.g, col.b], dec };
      for (const [du, dw] of corners) {
        const c = [v.x, v.y, v.z];
        c[a] = s > 0 ? v[['x', 'y', 'z'][a]] : v[['x', 'y', 'z'][a]] - 1;
        c[u] = c[u] - 1 + du; c[w] = c[w] - 1 + dw;
        q.idx.push(cellVertex(c[0], c[1], c[2]));
        const o1 = front.slice(); o1[u] += du ? 1 : -1;
        const o2 = front.slice(); o2[w] += dw ? 1 : -1;
        const o3 = o1.slice(); o3[w] += dw ? 1 : -1;
        const s1 = has(o1) ? 1 : 0, s2 = has(o2) ? 1 : 0, s3 = has(o3) ? 1 : 0;
        q.k.push((glow || !ao ? 1 : 1 - (s1 && s2 ? 3 : s1 + s2 + s3) * ao) * pk);
      }
      quads.push(q);
    }
  }
  // Nachbarn für die Glättung
  const nv = P.length / 3;
  const nb = Array.from({ length: nv }, () => new Set());
  for (const q of quads) for (let i = 0; i < 4; i++) { const a = q.idx[i], b = q.idx[(i + 1) % 4]; nb[a].add(b); nb[b].add(a); }
  const step = (lam) => {
    const out = new Float32Array(P.length);
    for (let i = 0; i < nv; i++) {
      let x = 0, y = 0, z = 0, n = 0;
      for (const j of nb[i]) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; n++; }
      if (!n) { out[i * 3] = P[i * 3]; out[i * 3 + 1] = P[i * 3 + 1]; out[i * 3 + 2] = P[i * 3 + 2]; continue; }
      out[i * 3] = P[i * 3] + lam * (x / n - P[i * 3]);
      out[i * 3 + 1] = P[i * 3 + 1] + lam * (y / n - P[i * 3 + 1]);
      out[i * 3 + 2] = P[i * 3 + 2] + lam * (z / n - P[i * 3 + 2]);
    }
    for (let i = 0; i < P.length; i++) P[i] = out[i];
  };
  for (let t = 0; t < iter; t++) { step(0.55); step(-0.58); } // Taubin: rund, ohne zu schrumpfen
  // weiche Normalen
  const N = new Float32Array(P.length);
  const pv = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  for (const q of quads) {
    const [a, b, c, d] = q.idx.map(pv);
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of q.idx) { N[i * 3] += n[0]; N[i * 3 + 1] += n[1]; N[i * 3 + 2] += n[2]; }
    if (q.dec) { const l = Math.hypot(n[0], n[1], n[2]) || 1; q.dec = n[2] / l > 0.35; } // Gesichtsbild nur auf Flächen, die nach vorne zeigen
  }
  for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  // Dreiecke je Material
  const per = new Map();
  const dPos = [], dNor = [], dUv = [];
  for (const q of quads) {
    let g = per.get(q.mat);
    if (!g) { g = { pos: [], nor: [], col: [] }; per.set(q.mat, g); }
    const order = q.k[0] + q.k[2] < q.k[1] + q.k[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    for (const t of order) {
      const i = q.idx[t];
      g.pos.push(P[i * 3] * S, P[i * 3 + 1] * S, P[i * 3 + 2] * S);
      g.nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      g.col.push(q.c[0] * q.k[t], q.c[1] * q.k[t], q.c[2] * q.k[t]);
      if (q.dec) { dPos.push(P[i * 3] * S, P[i * 3 + 1] * S, P[i * 3 + 2] * S); dNor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); dUv.push(...decal.uv(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); }
    }
  }
  const pos = [], nor = [], cl = [];
  const geo = new T.BufferGeometry();
  let start = 0;
  for (const mat of [...per.keys()].sort()) {
    const g = per.get(mat);
    for (let i = 0; i < g.pos.length; i++) { pos.push(g.pos[i]); nor.push(g.nor[i]); cl.push(g.col[i]); }
    geo.addGroup(start, g.pos.length / 3, mat);
    start += g.pos.length / 3;
  }
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(cl, 3));
  geo.computeBoundingSphere();
  let decalGeo = null;
  if (dPos.length) {
    decalGeo = new T.BufferGeometry();
    decalGeo.setAttribute('position', new T.Float32BufferAttribute(dPos, 3));
    decalGeo.setAttribute('normal', new T.Float32BufferAttribute(dNor, 3));
    decalGeo.setAttribute('uv', new T.Float32BufferAttribute(dUv, 2));
  }
  return { geo, decalGeo };
}
/** Materialien: 0 matt (Stoff, Haut), 1 glänzend (Kunststoff), 2 leuchtend, 3 Metall */
let VX_MATS = null;
function vxMaterials(T) {
  if (VX_MATS && VX_MATS.T === T) return VX_MATS.list;
  const list = [
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }),
    new T.MeshBasicMaterial({ vertexColors: true }),
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.9 }),
  ];
  VX_MATS = { T, list };
  return list;
}
function vxMesh(T, set, opts = {}) {
  let geo, decalGeo = null;
  if (VOX.smooth) ({ geo, decalGeo } = vxSmoothGeometry(T, set, opts)); else geo = vxGeometry(T, set, opts);
  const m = new T.Mesh(geo, vxMaterials(T));
  m.castShadow = true; m.receiveShadow = true;
  if (decalGeo && opts.decalMat) { const d = new T.Mesh(decalGeo, opts.decalMat); d.renderOrder = 2; m.add(d); }
  return m;
}

/* ---------------- Körper ---------------- */
// Kopf: x -6..5, y 0..11, z -6..5. Körper: x -5..4, y 0..10, z -3..2.
// Arme (lokal, Gelenk an der Schulter): x -2..1, y -10..0, z -3..2 (aussen: rechter Arm +x, linker Arm -x).
// Beine (lokal, Gelenk an der Hüfte): rechts x 0..4, links x -5..-1, y -13..-1, z -3..2.
const VX_HEAD = { x0: -6, x1: 5, y0: 0, y1: 11, z0: -6, z1: 5 };
const vxInHead = (x, y, z) => x >= VX_HEAD.x0 && x <= VX_HEAD.x1 && y >= VX_HEAD.y0 && y <= VX_HEAD.y1 && z >= VX_HEAD.z0 && z <= VX_HEAD.z1;

function vxBody(look) {
  const P = { head: new VoxSet(), torso: new VoxSet(), armR: new VoxSet(), armL: new VoxSet(), legR: new VoxSet(), legL: new VoxSet() };
  const skin = look.skin;
  vxTagAll(P, 'skin');
  P.head.box(-6, 0, -6, 5, 11, 5, skin);
  P.torso.box(-5, 0, -3, 4, 10, 2, skin);
  P.armR.box(-2, -10, -3, 1, 0, 2, skin);
  P.armL.box(-2, -10, -3, 1, 0, 2, skin);
  P.legR.box(0, -VOX.LEG, -3, 4, -1, 2, skin);
  P.legL.box(-5, -VOX.LEG, -3, -1, -1, 2, skin);
  // Gesicht: kommt fein aufgelöst in vxFace()
  // Hände etwas dunkler als die Arme (Handfläche)
  for (const arm of [P.armR, P.armL]) arm.paint((v) => (v.y === -10 ? vxShade(skin, -0.06) : null));
  vxTagAll(P, null);
  return P;
}

/* ---------------- Frisuren ---------------- */
/** Haar-Schale um den Kopf. side/back/front.ok(...) → true = dort Haar */
function vxHairShell(head, palette, { top = 2, side, back, front, seed = 3, accent = null }) {
  const H = VX_HEAD;
  const [base, dark, light] = palette;
  const shade = (x, y, z) => {
    if (accent && accent.where(x, y, z)) return vxRand(x, 0, z, seed) < 0.3 ? vxShade(accent.c, -0.18) : accent.c;
    const r = y > H.y1 ? vxRand(x, 0, z, seed) : vxRand(x, Math.floor((y + 40) / 4), z, seed); // Strähnen
    return r < 0.22 ? dark : r > 0.84 ? light : base;
  };
  for (let x = H.x0 - 2; x <= H.x1 + 2; x++) for (let y = H.y0 - 10; y <= H.y1 + top; y++) for (let z = H.z0 - 2; z <= H.z1 + 2; z++) {
    const dx = Math.max(H.x0 - x, x - H.x1, 0), dy = Math.max(y - H.y1, 0), dz = Math.max(H.z0 - z, z - H.z1, 0);
    if (!dx && !dy && !dz) continue;
    if (y < H.y0 && !(z < H.z0) && !dx) continue;
    const isSide = dx > 0, isBack = z < H.z0, isFront = z > H.z1, isTop = dy > 0;
    if (isTop && (dy > top || dx > 1 || dz > 1)) continue;
    if (isSide && (dx > (side.thick || 1) || !side.ok(z, y, x))) continue;
    if (isBack && (dz > (back.thick || 2) || !back.ok(x, y))) continue;
    if (isFront && (dz > 1 || !front.ok(x, y))) continue;
    if (isSide && isBack && !(back.ok(x, y) && side.ok(z, y, x))) continue;
    head.set(x, y, z, shade(x, y, z));
  }
}
const VX_HAIR = {
  /** Strubbelkopf mit dicken Büscheln */
  spiky(head, o) {
    const pal = [o.c, vxShade(o.c, -0.25), vxShade(o.c, 0.18)];
    const jag = [1, 0, 2, 1, 0, 1, 2, 0, 1, 2, 0, 1, 1, 0, 2, 1];
    vxHairShell(head, pal, {
      side: { ok: (z, y) => y >= (z > 2 ? 7 : 5) },
      back: { ok: (x, y) => y >= 3 },
      front: { ok: (x, y) => y >= 8 + jag[(x + 8) & 15] },
    });
    const avoid = vxInHead;
    for (const [p, d, len, r] of [
      [[-4, 13, 2], [-0.6, 1, 0.5], 5, 2], [[0, 13, 3], [0.1, 1, 0.6], 6, 2], [[4, 13, 1], [0.7, 1, 0.3], 5, 2],
      [[-2, 13, -2], [-0.3, 1, -0.6], 5, 2], [[3, 13, -3], [0.5, 1, -0.7], 5, 2], [[-6, 12, -4], [-0.8, 0.6, -0.6], 4, 2],
      [[6, 12, -5], [0.8, 0.5, -0.6], 4, 1], [[-8, 9, 1], [-1, 0.3, 0.2], 3, 1], [[7, 9, 2], [1, 0.4, 0.2], 3, 1],
      [[-4, 10, 7], [-0.3, -1, 0.5], 3, 1], [[0, 10, 7], [0.1, -1, 0.6], 3, 1], [[3, 10, 7], [0.4, -1, 0.5], 3, 1],
    ]) vxSpike(head, p, d, len, r, pal, 5, avoid);
  },
  /** Seitenscheitel mit langem Pony und farbiger Strähne */
  emo(head, o) {
    const pal = [o.c, vxShade(o.c, -0.35), vxShade(o.c, 0.2)];
    const accent = { c: o.c2 || 0x8b5cf6, where: (x, y, z) => (x >= 1 && x <= 2) && (z > 0 || y > VX_HEAD.y1) };
    vxHairShell(head, pal, {
      accent,
      side: { ok: (z, y, x) => y >= (x < 0 ? 4 : 6) },
      back: { ok: (x, y) => y >= 2 },
      front: { ok: (x, y) => (x < 1 ? y >= 7 - (x <= -5 ? 2 : 0) : y >= 9 + ((x * 7) % 2)) },
      seed: 9,
    });
    const avoid = vxInHead;
    for (const [p, d, len, r] of [
      [[-3, 13, 2], [-0.8, 0.8, 0.6], 5, 2], [[1, 13, 1], [0.4, 1, 0.4], 5, 2], [[-2, 13, -3], [-0.4, 1, -0.7], 5, 2],
      [[4, 13, -2], [0.8, 0.8, -0.4], 4, 2], [[-7, 10, 2], [-1, -0.2, 0.4], 3, 1], [[-5, 9, 7], [-0.3, -1, 0.3], 3, 1],
    ]) vxSpike(head, p, d, len, r, pal, 11, avoid);
    for (const [p, d] of [[[2, 13, 2], [0.3, 1, 0.6]], [[1, 10, 7], [0.2, -1, 0.4]]]) vxSpike(head, p, d, 4, 1, [accent.c], 12, avoid);
  },
  /** Lang, mit Strähnen vorne über den Schultern */
  long(head, o) {
    const pal = [o.c, vxShade(o.c, -0.2), vxShade(o.c, 0.2)];
    vxHairShell(head, pal, {
      side: { ok: (z, y) => y >= (z > 3 ? 5 : -5), thick: 2 },
      back: { ok: (x, y) => y >= -8, thick: 2 },
      front: { ok: (x, y) => y >= 8 + (Math.abs(x + 0.5) > 4.5 ? -3 : (x & 1)) },
      seed: 13,
    });
    const avoid = vxInHead;
    for (const [p, d, len, r] of [[[-3, 13, 1], [-0.4, 1, 0.4], 3, 2], [[2, 13, 0], [0.4, 1, 0.2], 3, 2], [[-1, 13, -4], [0, 1, -0.5], 3, 2]]) vxSpike(head, p, d, len, r, pal, 15, avoid);
    // Strähnen vorne über den Schultern
    for (const x of [-8, -7, 6, 7]) for (let y = -6; y <= 6; y++) for (const z of [3, 4]) head.set(x, y, z, vxRand(x, Math.floor(y / 3), z, 17) < 0.25 ? pal[1] : pal[0]);
  },
};

/* ---------------- Oberteile ---------------- */
const VX_LOGOS = {
  smile: ['.XXXX.', 'X.XX.X', 'XXXXXX', 'X.XX.X', '.X..X.'],
  heart: ['XX.XX', 'XXXXX', '.XXX.', '..X..'],
  bolt: ['..XX', '.XX.', 'XXXX', '.XX.', 'XX..'],
};
/**
 * Jacke über einem Shirt. o: { c, trim, under, logo, logoC, open (Breite der Öffnung), hood, collar, strings,
 *   strap, buckle, pockets, patch, stripes, checker, patches: [Farben], cuff, hem }
 */
function vxJacket(P, o) {
  const T = P.torso, base = o.c, trim = o.trim ?? vxShade(base, 0.3), dark = vxShade(base, -0.32);
  const open = o.open ?? 2, ox0 = -open / 2, ox1 = open / 2 - 1;
  // Shirt darunter
  T.paint((v) => (v.y >= 2 ? o.under : null));
  if (o.logo) vxSprite(T, VX_LOGOS[o.logo], { X: o.logoC }, -Math.floor(VX_LOGOS[o.logo][0].length / 2), 8, 2);
  const patch = (x, y, z) => {
    if (o.patches) { const r = vxRand(Math.floor((x + 21) / 4), Math.floor((y + 21) / 4), Math.floor((z + 21) / 4), 41); if (r < 0.1) return o.patches[Math.floor(r * 100) % o.patches.length]; }
    return null;
  };
  // Körper-Schale
  vxShell(T, -5, 0, -3, 4, 10, 2, (x, y, z) => {
    const front = z === 3, side = x === -6 || x === 5;
    if (front && x >= ox0 && x <= ox1) return null;                                // offen
    if (front && (x === ox0 - 1 || x === ox1 + 1)) return o.zip ? ((y & 1) ? o.zip : vxShade(o.zip, -0.3)) : trim; // Reissverschluss
    if (y === 0) return o.hem ?? dark;                                               // Saum
    if (y === 1 && o.hemTrim) return o.hemTrim;
    if (o.sidePanel && side && y <= 7) return o.sidePanel;                           // Seitenteile
    if (o.checker && side && y >= 3 && y <= 7) return ((y + z) & 1) ? o.checker : dark;
    return patch(x, y, z) ?? base;
  }, { top: true });
  // Kapuze hinten, Kragen vorne
  if (o.hood) {
    T.box(-4, 4, -5, 3, 10, -5, (x, y) => (y === 10 || x === -4 || x === 3 ? vxShade(o.hood, -0.12) : o.hood));
    T.box(-3, 5, -6, 2, 9, -6, (x, y) => (y === 9 ? vxShade(o.hood, -0.12) : o.hood));
  }
  if (o.collar) {
    for (const [a, b] of [[-5, ox0 - 1], [ox1 + 1, 4]]) T.box(a, 9, 4, b, 10, 4, (x, y) => (y === 9 ? vxShade(o.collar, -0.1) : o.collar));
    T.box(-5, 10, 3, 4, 11, 3, (x) => (x >= ox0 && x <= ox1 ? null : o.collar));
  }
  if (o.strings) for (const x of [ox0, ox1]) T.box(x, 5, 4, x, 9, 4, (xx, y) => (y === 5 ? vxShade(o.strings, -0.2) : o.strings));
  // Taschen mit Klappe und Knopf
  if (o.pockets !== false) {
    for (const [a, b] of [[-5, ox0 - 2], [ox1 + 2, 4]]) {
      if (b - a < 1) continue;
      T.box(a, 2, 4, b, 3, 4, vxShade(base, -0.12));
      T.box(a, 4, 4, b, 4, 4, dark);
      T.set(Math.round((a + b) / 2), 4, 5, trim, 1);
    }
  }
  if (o.patch) { T.box(ox1 + 2, 7, 4, ox1 + 3, 8, 4, o.patch); T.set(ox1 + 3, 7, 4, dark); }
  // Umhängegurt mit Schnalle
  if (o.strap) {
    vxLine(T, [4, 10, 5], [-5, 1, 5], o.strap);
    T.box(-1, 5, 6, 0, 6, 6, o.buckle ?? trim, 3);
  }
  // Ärmel
  for (const [arm, out] of [[P.armR, 1], [P.armL, -1]]) {
    vxShell(arm, -2, -7, -3, 1, 0, 2, (x, y, z) => {
      if (y === -7) return o.cuff ?? dark;
      if (o.stripes && (y === -4 || y === -3)) return y === -4 ? o.stripes : dark;
      if (o.checker && y >= -6 && y <= -2 && (x * out) > 1) return ((y + z) & 1) ? o.checker : dark;
      return patch(x * 3, y, z) ?? base;
    }, { top: true });
    if (o.armPatch) { const xo = out > 0 ? 3 : -4; arm.box(xo, -3, -1, xo, -1, 0, o.armPatch); }
  }
}
const VX_TOPS = {
  /** T-Shirt mit Aufdruck (gratis) */
  tshirt(P, o) {
    P.torso.paint((v) => (v.y >= 2 ? o.c : null));
    for (const arm of [P.armR, P.armL]) arm.paint((v) => (v.y >= -3 ? o.c : null));
    for (const arm of [P.armR, P.armL]) vxRing(arm, -2, -3, 1, 2, -3, 1, () => vxShade(o.c, -0.15));
    P.torso.box(-2, 10, 3, 1, 10, 3, vxShade(o.c, -0.15)); // Kragen
    vxSprite(P.torso, VX_LOGOS[o.logo || 'smile'], { X: o.logoC ?? 0xffffff }, -3, 8, 3);
  },
  /** sportliche Jacke mit Streifen, Kapuze und Umhängegurt */
  sport(P, o) {
    vxJacket(P, { c: o.c, trim: o.trim, under: o.under ?? 0xf4f4f6, open: 2, hood: o.under ?? 0xf4f4f6, collar: o.under ?? 0xf4f4f6, strap: 0x1f2430, buckle: o.trim,
      zip: o.trim, sidePanel: o.trim, stripes: o.trim, cuff: 0x1f2430, hem: 0x1f2430, hemTrim: o.trim, patch: o.trim, armPatch: o.trim });
  },
  /** offener Hoodie mit Karo-Flicken über einem Shirt mit Logo */
  hoodie(P, o) {
    vxJacket(P, { c: o.c, trim: o.trim, under: o.under, logo: 'smile', logoC: 0xffffff, open: 4, hood: o.c, strings: o.trim, checker: o.trim,
      cuff: vxShade(o.c, -0.3), pockets: true });
  },
  /** helle Jacke mit bunten Flicken */
  pastel(P, o) {
    vxJacket(P, { c: o.c, trim: o.trim, under: o.under, logo: 'heart', logoC: o.trim, open: 4, hood: o.c, collar: o.c, patches: o.patches,
      cuff: o.trim, hem: o.trim, pockets: true });
  },
};

/* ---------------- Hosen und Röcke ---------------- */
const VX_BOTTOMS = {
  /** Cargohose: Knieschoner, Seitentaschen, Gürtel mit Schnalle, Bündchen */
  cargo(P, o) {
    const c = o.c, dark = vxShade(c, -0.25), trim = o.trim;
    for (const [leg, side] of [[P.legR, 1], [P.legL, -1]]) {
      const x0 = side > 0 ? 0 : -5, x1 = x0 + 4;
      leg.paint((v) => (v.y >= -8 ? (v.x === x0 + 2 && v.z === 2 && v.y > -6 ? vxShade(c, 0.08) : c) : null));
      leg.box(x0 + 1, -6, 3, x1 - 1, -5, 3, (x, y) => (y === -5 ? dark : trim ?? dark));         // Knieschoner
      const xo = side > 0 ? 5 : -6;
      leg.box(xo, -5, -2, xo, -3, 1, vxShade(c, -0.12)); leg.box(xo, -2, -2, xo, -2, 1, dark); // Seitentasche + Klappe
      if (trim) leg.set(xo, -2, 0, trim, 1);
      vxRing(leg, x0, -3, x1, 2, -8, 1, () => dark);                                            // Bündchen
    }
    P.torso.paint((v) => (v.y <= 1 ? (v.y === 1 ? 0x1f2430 : c) : null));                      // Gürtel
    P.torso.box(-1, 1, 3, 0, 1, 3, trim ?? 0xc9ced8, 3);
    if (trim) P.legR.box(4, -3, 3, 4, -1, 3, trim);                                            // Band an der Hüfte
    if (o.chain) { vxLine(P.torso, [-4, 1, 3], [-6, -2, 1], (i) => (i & 1 ? 0xd7dbe3 : 0x9ca3af), 3); vxLine(P.torso, [-6, -2, 1], [-6, 0, -2], (i) => (i & 1 ? 0xd7dbe3 : 0x9ca3af), 3); }
  },
  /** Faltenrock mit Karomuster und Stulpen */
  skirt(P, o) {
    const c = o.c, line = o.trim ?? 0xffffff, dark = vxShade(c, -0.18);
    const plaid = (x, y, z) => { const lx = ((x + z + 40) % 4 === 0), ly = ((y + 40) % 3 === 0); return lx && ly ? dark : lx || ly ? line : ((x + z) & 1 ? c : vxShade(c, -0.06)); };
    P.torso.tag = 'skirt';
    P.torso.paint((v) => (v.y <= 1 ? plaid(v.x, v.y, v.z) : null));
    for (let y = -5; y <= 1; y++) {
      const out = y <= -3 ? 2 : y <= -1 ? 1 : 0;
      for (let d = 1; d <= out + (y <= 1 ? 1 : 0); d++) vxRing(P.torso, -5, -3, 4, 2, y, d, (x, yy, z) => plaid(x, yy, z));
    }
    for (const [leg, side] of [[P.legR, 1], [P.legL, -1]]) {
      const x0 = side > 0 ? 0 : -5, x1 = x0 + 4;
      if (o.warmers) for (let y = -8; y <= -5; y++) vxRing(leg, x0, -3, x1, 2, y, 1, (x, yy, z) => ((yy & 1) ? o.warmers[0] : o.warmers[1]));
    }
  },
};

/* ---------------- Schuhe ---------------- */
const VX_SHOES = {
  /** hohe Turnschuhe mit dicker Sohle, Schnürung, Zunge und Fersenlasche */
  sneakers(P, o) {
    const c = o.c, c2 = o.c2, white = 0xf4f4f6, b = -VOX.LEG;
    for (const [leg, x0, x1] of [[P.legR, 0, 5], [P.legL, -6, -1]]) {
      leg.filter((v) => v.y > b + 4);
      leg.box(x0, b, -4, x1, b, 5, white, 1);                                                    // Sohle
      leg.box(x0, b + 1, -4, x1, b + 1, 5, (x, y, z) => (z >= 4 ? white : x === x0 || x === x1 || z === -4 ? c2 : c), 1);
      leg.box(x0, b + 2, -3, x1, b + 2, 4, (x, y, z) => (z === 4 ? white : c), 1);
      const xm = Math.round((x0 + x1) / 2);
      leg.box(x0, b + 3, -3, x1, b + 4, 3, (x, y, z) => {
        if (z === 3 && (x === xm - 1 || x === xm)) return (y & 1) ? white : vxShade(c, -0.25); // Schnürung
        return c;
      }, 1);
      leg.box(xm - 1, b + 5, 2, xm, b + 5, 3, c2, 1);                                            // Zunge
      leg.box(xm - 1, b + 3, -4, xm, b + 5, -4, c2, 1);                                          // Fersenlasche
      const xo = x0 === 0 ? x1 + 1 : x0 - 1;
      leg.set(xo, b + 2, -1, c2, 1).set(xo, b + 3, 0, c2, 1).set(xo, b + 2, 1, c2, 1);             // Seitenlogo
      if (o.paw) { leg.box(xm - 1, b + 2, 4, xm, b + 2, 4, o.paw, 1); leg.set(xm - 2, b + 2, 5, o.paw, 1).set(xm + 1, b + 2, 5, o.paw, 1); }
    }
  },
};

/* ---------------- Kopfbedeckungen ---------------- */
const VX_HATS = {
  /** Cap mit Schild und Front-Logo */
  cap(head, o) {
    const H = VX_HEAD, c = o.c, c2 = o.c2, c3 = o.c3;
    head.filter((v) => v.y <= H.y1 - 2 || vxInHead(v.x, v.y, v.z));
    head.box(H.x0 - 1, H.y1 - 1, H.z0 - 1, H.x1 + 1, H.y1 + 2, H.z1 + 1, (x, y, z) => {
      const edge = x === H.x0 - 1 || x === H.x1 + 1 || z === H.z0 - 1 || z === H.z1 + 1;
      if (y === H.y1 + 2 && edge) return null;
      if (y === H.y1 - 1 && !edge) return null;
      if (z >= 3 && y >= H.y1 - 1) return (x === -1 || x === 0) && y === H.y1 + 1 && z === H.z1 + 1 ? c : c2;
      return ((x + 40) % 4 === 0 && y > H.y1) ? vxShade(c, -0.15) : c;                      // Nähte
    });
    head.box(-5, H.y1 - 1, H.z1 + 2, 4, H.y1 - 1, H.z1 + 5, (x, y, z) => (z === H.z1 + 5 ? vxShade(c3, -0.15) : c3), 1); // Schild
    head.box(-1, H.y1 + 3, -1, 0, H.y1 + 3, 0, c3, 1);                                       // Knopf
  },
  /** Mütze mit Katzenohren */
  catbeanie(head, o) {
    const H = VX_HEAD, c = o.c, pink = o.c2, spots = o.c3;
    head.filter((v) => v.y <= H.y1 - 2 || vxInHead(v.x, v.y, v.z));
    head.box(H.x0 - 1, H.y1 - 2, H.z0 - 1, H.x1 + 1, H.y1 + 2, H.z1 + 1, (x, y, z) => {
      const ex = x === H.x0 - 1 || x === H.x1 + 1, ez = z === H.z0 - 1 || z === H.z1 + 1;
      if (y === H.y1 + 2 && (ex || ez)) return null;
      if (y >= H.y1 + 1 && ex && ez) return null;
      if (y <= H.y1 - 1 && !(ex || ez)) return null;
      if (y === H.y1 - 2) return vxShade(c, -0.08);                                          // Umschlag
      const r = vxRand(Math.floor((x + 21) / 3), Math.floor((y + 21) / 3), Math.floor((z + 21) / 3), 51);
      return r < 0.1 ? spots : r < 0.18 ? pink : c;
    });
    vxRing(head, H.x0 - 1, H.z0 - 1, H.x1 + 1, H.z1 + 1, H.y1 - 2, 1, () => vxShade(c, -0.1));
    for (const cx of [-4, 3]) for (let k = 0; k < 3; k++) {
      const r = 2 - k;
      head.box(cx - r, H.y1 + 3 + k, -1, cx + r, H.y1 + 3 + k, 0, c);
      if (k < 2) head.box(cx - Math.max(0, r - 1), H.y1 + 3 + k, 1, cx + Math.max(0, r - 1), H.y1 + 3 + k, 1, pink);
    }
  },
};

/* ---------------- Hals, Rücken, Handgelenk, Tasche ---------------- */
const VX_NECK = {
  /** Kopfhörer um den Hals */
  headphones(T, o) {
    const c = o.c, d = 0x1f2430;
    T.box(-5, 10, -5, 4, 11, -4, d);
    for (const x0 of [-7, 4]) {
      T.box(x0, 7, 3, x0 + 2, 10, 4, (x, y, z) => (z === 4 && x === x0 + 1 && (y === 8 || y === 9) ? vxShade(c, 0.35) : c), 1);
      T.box(x0, 7, 2, x0 + 2, 10, 2, d);
      T.box(x0 + (x0 < 0 ? 0 : 2), 10, -4, x0 + (x0 < 0 ? 0 : 2), 11, 1, d);
    }
  },
};
const VX_BACK = {
  /** Rucksack mit Fronttasche und Trägern */
  backpack(T, o) {
    const c = o.c, dark = vxShade(c, -0.25), trim = o.c2;
    T.box(-4, 1, -7, 3, 9, -5, (x, y) => (y === 9 ? dark : c));
    T.box(-3, 2, -8, 2, 5, -8, (x, y) => (y === 5 ? dark : vxShade(c, 0.06)));
    T.set(-1, 5, -9, trim, 1).set(0, 5, -9, trim, 1);
    for (const x of [-4, 3]) { T.box(x, 2, 4, x, 10, 4, dark); T.set(x, 4, 5, trim, 3); }
  },
};
const VX_WRIST = {
  /** Uhr am linken Handgelenk */
  watch(P, o) {
    vxRing(P.armL, -2, -3, 1, 2, -8, 1, () => o.c);
    P.armL.box(-4, -8, -1, -4, -8, 0, o.c2 ?? 0x5eead4, 2);
    P.armL.set(-4, -8, -2, o.c, 1).set(-4, -8, 1, o.c, 1);
  },
};
const VX_BAGS = {
  /** Umhängetasche mit Pfote */
  paw(T, o) {
    vxLine(T, [4, 10, 4], [-3, 2, 4], o.c2);
    T.box(-7, -3, 3, -3, 1, 4, (x, y) => (y === 1 ? vxShade(o.c, -0.12) : o.c));
    vxSprite(T, ['X.X', '.X.', 'XXX'], { X: o.c2 }, -6, 0, 5);
  },
};
/** Handgegenstände: eigene Voxel-Menge, Griff bei (0,0,0) */
const VX_HAND = {
  wand: { rx: Math.PI / 2, build() {
    const s = new VoxSet();
    s.box(0, -2, 0, 0, 9, 0, (x, y) => (y < 1 ? 0x3b2a1a : y === 8 ? 0xffd84d : 0x6b4423));
    const star = 0xffd84d;
    s.box(-2, 11, 0, 2, 11, 0, star, 2); s.box(0, 9, 0, 0, 13, 0, star, 2); s.box(-1, 10, 0, 1, 12, 0, star, 2);
    s.set(0, 11, 1, 0xfff6b0, 2).set(0, 11, -1, 0xfff6b0, 2);
    return s;
  } },
  skateboard: { ry: -Math.PI / 2, x: 2.5, build() {
    const s = new VoxSet();
    s.box(-3, -8, 0, 2, 8, 0, (x, y) => (Math.abs(y) > 6 && (x === -3 || x === 2) ? null : y > -2 && y < 2 ? 0x22d3ee : (y & 1) && Math.abs(y) < 6 ? 0xf9a8d4 : 0xf472b6), 1);
    for (const y of [-6, 5]) for (const x of [-3, 2]) s.box(x, y, -2, x, y + 1, -1, 0xf4f4f6, 1);
    for (const y of [-6, 5]) s.box(-2, y, -1, 1, y + 1, -1, 0x9ca3af, 3);
    return s;
  } },
};

/* ---------------- Fein aufgelöst: Gesicht und Verzierungen ---------------- */
const vxTagAll = (P, tag) => { for (const k of ['head', 'torso', 'armR', 'armL', 'legR', 'legL']) P[k].tag = tag; };
/** jedes grobe Voxel in 2×2×2 feine teilen */
function vxUpscale(set) {
  const out = new VoxSet();
  for (const v of set.m.values()) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) out.set(v.x * 2 + dx, v.y * 2 + dy, v.z * 2 + dz, v.c, v.mat, v.tag);
  return out;
}
/** Gesicht (fein): Kopf x -12..11, y 0..23, Vorderseite z = 11. Hier nur die Form (Nase, Ohren);
 *  Augen, Brauen, Mund und Wangen werden als Bild gezeichnet (vxFaceTexture) und auf die runde Gesichtsfläche gelegt. */
function vxFace(head, look) {
  const skin = look.skin;
  // Nase: kleine Wölbung
  for (const x of [-1, 0]) for (const y of [8, 9]) head.set(x, y, 12, skin, 0, 'face');
  head.set(-1, 8, 13, skin, 0, 'face').set(0, 8, 13, skin, 0, 'face');
  // Ohren (nur wo kein Haar ist)
  for (const x of [-13, 12]) for (let y = 7; y <= 11; y++) for (let z = -2; z <= 1; z++) head.setIfEmpty(x, y, z, skin, 0, 'face');
}
/** Gesicht als Bild: Augen mit Iris und Glanz, Brauen, Mund, Wangen, Sommersprossen. 1 feine Einheit = 512/24 px */
function vxFaceCanvas(look, over = {}) {
  const f = { ...(look.face || {}), ...over }, N = 512, U = N / 24;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const X = (x) => (x + 12) * U, Y = (y) => (24 - y) * U;
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  const skin = look.skin, iris = f.eyeC ?? 0x6b4423, ink = '#241c2c';
  const brow = hex(f.browC ?? vxShade(look.hair?.c ?? 0x3b2a1a, -0.35));
  g.lineCap = 'round'; g.lineJoin = 'round';
  // Wangen
  if (f.blush) for (const cx of [-8.6, 8.6]) {
    const gr = g.createRadialGradient(X(cx), Y(6.3), 0, X(cx), Y(6.3), 2.2 * U);
    gr.addColorStop(0, 'rgba(255,110,140,.42)'); gr.addColorStop(1, 'rgba(255,110,140,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X(cx), Y(6.3), 2.2 * U, 0, Math.PI * 2); g.fill();
  }
  if (f.freckles) { g.fillStyle = hex(vxShade(skin, -0.32)); for (const [x, y] of [[-9.6, 7.8], [-8.2, 7.2], [-9, 6.4], [-7.4, 6.6], [8.6, 7.8], [7.4, 7.2], [9.2, 6.6], [8.2, 6.2]]) { g.beginPath(); g.arc(X(x), Y(y), 0.24 * U, 0, Math.PI * 2); g.fill(); } }
  // Augen
  const style = f.eyes || 'round';
  for (const [cx, side] of [[-6, -1], [6, 1]]) {
    const cy = 11.9, rx = 2.05, ry = style === 'wide' ? 2.5 : 2.25;
    if (style === 'happy') {
      g.strokeStyle = ink; g.lineWidth = 0.55 * U;
      g.beginPath(); g.moveTo(X(cx - 1.7), Y(cy - 0.6)); g.quadraticCurveTo(X(cx), Y(cy + 1.9), X(cx + 1.7), Y(cy - 0.6)); g.stroke();
    } else if (style === 'closed') {                                   // blinzeln
      g.strokeStyle = ink; g.lineWidth = 0.5 * U;
      g.beginPath(); g.moveTo(X(cx - 1.9), Y(cy + 0.3)); g.quadraticCurveTo(X(cx), Y(cy - 1.1), X(cx + 1.9), Y(cy + 0.3)); g.stroke();
      if (f.lashes) { g.lineWidth = 0.3 * U; g.beginPath(); g.moveTo(X(cx + side * 1.8), Y(cy + 0.2)); g.lineTo(X(cx + side * 2.5), Y(cy + 0.6)); g.stroke(); }
    } else {
      g.save();
      g.beginPath(); g.ellipse(X(cx), Y(cy), rx * U, ry * U, 0, 0, Math.PI * 2); g.clip();
      // Weiss mit leichtem Schatten oben
      const sg = g.createLinearGradient(0, Y(cy + ry), 0, Y(cy - ry)); sg.addColorStop(0, '#e7e2ea'); sg.addColorStop(0.35, '#fbf8f4'); sg.addColorStop(1, '#ffffff');
      g.fillStyle = sg; g.fillRect(X(cx - rx), Y(cy + ry), 2 * rx * U, 2 * ry * U);
      // Iris mit Verlauf und dunklem Rand
      const ix = cx + side * -0.15, iy = cy - 0.15, ir = 1.55;
      const ig = g.createRadialGradient(X(ix), Y(iy - 0.4), 0.2 * U, X(ix), Y(iy), ir * U);
      ig.addColorStop(0, hex(vxShade(iris, 0.45))); ig.addColorStop(0.6, hex(iris)); ig.addColorStop(1, hex(vxShade(iris, -0.45)));
      g.fillStyle = ig; g.beginPath(); g.arc(X(ix), Y(iy), ir * U, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#120d16'; g.beginPath(); g.arc(X(ix), Y(iy), 0.72 * U, 0, Math.PI * 2); g.fill();
      // Glanzpunkte
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X(ix - 0.6), Y(iy + 0.65), 0.46 * U, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.8; g.beginPath(); g.arc(X(ix + 0.55), Y(iy - 0.55), 0.2 * U, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      // Lid (verschlafen: tiefer)
      if (style === 'sleepy') { g.fillStyle = hex(vxShade(skin, -0.04)); g.fillRect(X(cx - rx), Y(cy + ry), 2 * rx * U, 1.9 * U); }
      g.restore();
      // Oberlid-Linie und Wimpern
      g.strokeStyle = ink; g.lineWidth = 0.42 * U;
      const top = style === 'sleepy' ? cy + ry - 1.9 : cy + ry * 0.55;
      g.beginPath();
      if (style === 'sleepy') { g.moveTo(X(cx - rx), Y(top)); g.lineTo(X(cx + rx), Y(top)); }
      else g.ellipse(X(cx), Y(cy), rx * U, ry * U, 0, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
      if (f.lashes) {
        const ox = cx + side * rx * 0.92, oy = cy + 0.55;
        g.lineWidth = 0.3 * U; g.beginPath(); g.moveTo(X(ox), Y(oy)); g.lineTo(X(ox + side * 0.75), Y(oy + 0.75)); g.stroke();
        g.beginPath(); g.moveTo(X(ox - side * 0.35), Y(oy + 0.9)); g.lineTo(X(ox + side * 0.15), Y(oy + 1.6)); g.stroke();
      }
    }
    // Braue
    g.strokeStyle = brow; g.lineWidth = 0.6 * U;
    g.beginPath(); g.moveTo(X(cx - 1.9), Y(15.2)); g.quadraticCurveTo(X(cx + side * 0.2), Y(16.3), X(cx + 1.9), Y(15.3)); g.stroke();
  }
  // Mund: gefüllte Formen statt Striche – in der Mitte voller, an den Enden fein; mit Grübchen und Unterlippe
  const mouth = f.mouth || 'smile', red = '#7b2b3a', inner = '#5a1a28', tongue = '#ef7b8b', lipHi = 'rgba(255,170,180,.45)';
  const dimple = (x, y, s) => { g.strokeStyle = hex(vxShade(skin, -0.22)); g.lineWidth = 0.22 * U; g.beginPath(); g.moveTo(X(x), Y(y + 0.35)); g.quadraticCurveTo(X(x + s * 0.35), Y(y), X(x), Y(y - 0.35)); g.stroke(); };
  const crescent = (x0, y0, x1, y1, lo, hi) => {        // Bogen zwischen zwei Mundwinkeln: unten lo, oben hi (Kontrollpunkte)
    g.fillStyle = red; g.beginPath(); g.moveTo(X(x0), Y(y0));
    g.quadraticCurveTo(X((x0 + x1) / 2), Y(lo), X(x1), Y(y1));
    g.quadraticCurveTo(X((x0 + x1) / 2), Y(hi), X(x0), Y(y0)); g.closePath(); g.fill();
  };
  const openMouth = (w, top, depth, teeth, tg) => {     // offener Mund: oben fast gerade, unten rund
    const path = () => { g.beginPath(); g.moveTo(X(-w), Y(top)); g.quadraticCurveTo(X(0), Y(top - 0.35), X(w), Y(top));
      g.quadraticCurveTo(X(w * 0.9), Y(top - depth * 0.95), X(0), Y(top - depth)); g.quadraticCurveTo(X(-w * 0.9), Y(top - depth * 0.95), X(-w), Y(top)); g.closePath(); };
    g.save();
    path(); g.fillStyle = inner; g.fill(); g.clip();
    if (teeth) { g.fillStyle = '#ffffff'; g.fillRect(X(-w), Y(top + 0.2), 2 * w * U, (teeth + 0.2) * U); }
    if (tg) { g.fillStyle = tongue; g.beginPath(); g.ellipse(X(0), Y(top - depth + 0.25), w * 0.62 * U, depth * 0.42 * U, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    path(); g.strokeStyle = red; g.lineWidth = 0.28 * U; g.stroke();
    g.fillStyle = lipHi; g.beginPath(); g.ellipse(X(0), Y(top - depth - 0.45), w * 0.45 * U, 0.22 * U, 0, 0, Math.PI * 2); g.fill();
  };
  if (mouth === 'grin') { openMouth(2.6, 5.3, 2.4, 0.75, true); dimple(-3.0, 5.3, -1); dimple(3.0, 5.3, 1); }
  else if (mouth === 'open') openMouth(1.8, 5.0, 2.1, 0.45, true);
  else if (mouth === 'laugh') { openMouth(2.9, 5.6, 3.3, 0.8, true); dimple(-3.3, 5.6, -1); dimple(3.3, 5.6, 1); }
  else if (mouth === 'o') { g.fillStyle = inner; g.beginPath(); g.ellipse(X(0), Y(3.9), 0.85 * U, 1.05 * U, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = red; g.lineWidth = 0.28 * U; g.stroke(); g.fillStyle = tongue; g.beginPath(); g.ellipse(X(0), Y(3.3), 0.5 * U, 0.3 * U, 0, 0, Math.PI * 2); g.fill(); }
  else if (mouth === 'calm') { crescent(-1.7, 4.3, 1.7, 4.3, 3.35, 3.95); g.fillStyle = lipHi; g.beginPath(); g.ellipse(X(0), Y(3.05), 0.8 * U, 0.2 * U, 0, 0, Math.PI * 2); g.fill(); }
  else if (mouth === 'smirk') { crescent(-1.9, 4.0, 2.3, 5.1, 3.0, 3.8); dimple(2.75, 5.1, 1); }
  else { crescent(-2.4, 5.0, 2.4, 5.0, 2.35, 3.55); dimple(-2.85, 5.05, -1); dimple(2.85, 5.05, 1); g.fillStyle = lipHi; g.beginPath(); g.ellipse(X(0), Y(2.55), 0.9 * U, 0.22 * U, 0, 0, Math.PI * 2); g.fill(); }
  return cv;
}
/** feine Oberflächen: Haarsträhnen, Stoff, Strick */
function vxFineTextures(F, look) {
  for (const set of Object.values(F)) for (const v of set.m.values()) {
    if (VOX.smooth) continue; // glatt: keine Pixel-Muster
    if (v.tag === 'hair') {
      const t = (v.x * 3 + v.z * 5 + 400) % 4 === 0 ? -0.13 : (v.x + 2 * v.z + 400) % 7 === 0 ? 0.1 : 0;
      if (t) v.c = vxShade(v.c, t);
    } else if (v.tag === 'top' || v.tag === 'bottom') {
      if (((v.x + v.y + v.z) & 1) === 0) v.c = vxShade(v.c, -0.03);
    } else if (v.tag === 'knit') {
      if ((v.x + v.z) & 1) v.c = vxShade(v.c, -0.08);
    }
  }
}
/** gestrichelte Naht auf einer Fläche: Punkte (x,y,z) wenn vorhanden aufhellen */
function vxStitch(set, pts, amt = 0.28) { pts.forEach(([x, y, z], i) => { if (!(i & 1)) { const v = set.get(x, y, z); if (v) v.c = vxShade(v.c, amt); } }); }
const vxRange = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
/** «×»-Zeichen 4×4 (Teilmal) */
function vxTimes(set, x0, y0, z, c, mat = 0) { for (const [dx, dy] of [[0, 3], [3, 3], [1, 2], [2, 2], [1, 1], [2, 1], [0, 0], [3, 0]]) set.set(x0 + dx, y0 + dy, z, c, mat); }

const VX_DETAIL = {
  sport(F, o) {
    const T = F.torso, dark = vxShade(o.c, -0.32), white = 0xf4f4f6;
    // Reissverschluss-Zähne (Kanten bei grob x -2 und 1 → fein -4..-3 und 2..3, Vorderseite z 7)
    for (const a of [-4, 2]) for (let y = 2; y <= 21; y++) { T.recolor(a, y, 7, (y & 1) ? o.trim : dark); T.recolor(a + 1, y, 7, (y & 1) ? dark : o.trim); }
    T.set(-3, 17, 8, 0xd7dbe3, 3).set(-3, 16, 8, 0xd7dbe3, 3).set(-3, 15, 8, 0x9ca3af, 3);    // Zipper
    // Nähte über dem Saum und an den Taschen
    vxStitch(T, vxRange(-12, 11).map((x) => [x, 4, 7]));
    for (const [a, b] of [[-10, -5], [4, 9]]) vxStitch(T, vxRange(a, b).map((x) => [x, 7, 9]), 0.22);
    // Abzeichen mit «×»
    vxTimes(T, 4, 14, 9, dark);
    // Ärmel: feine weisse Paspel zwischen den Streifen
    for (const arm of [F.armR, F.armL]) arm.paint((v) => (v.tag === 'top' && v.y === -6 && (v.x < -4 || v.x > 3 || v.z < -6 || v.z > 5) ? white : null));
  },
  hoodie(F, o) {
    const T = F.torso;
    for (const x of [-4, 2]) T.set(x, 9, 9, 0xd7dbe3, 3).set(x, 8, 9, 0xd7dbe3, 3);             // Bändel-Enden aus Metall
    for (const set of [F.armR, F.armL, T]) set.paint((v) => (v.tag === 'top' && (v.y === -14 || v.y === -13 || v.y === 0 || v.y === 1) && (v.x & 1) ? vxShade(v.c, -0.12) : null)); // Rippbündchen
  },
  pastel(F, o) {
    const T = F.torso;
    for (const y of [16, 11, 6]) for (const x of [-7, 6]) T.set(x, y, 8, o.trim, 1);           // Knöpfe
  },
  cargo(F, o) {
    for (const [leg, side] of [[F.legR, 1], [F.legL, -1]]) {
      const x0 = side > 0 ? 0 : -10;
      vxStitch(leg, vxRange(x0 + 2, x0 + 7).map((x) => [x, -9, 7]));                           // Knieschoner-Naht
      vxStitch(leg, vxRange(x0 + 2, x0 + 7).map((x) => [x, -12, 7]));
      const xs = side > 0 ? 11 : -12;
      vxStitch(leg, vxRange(-10, -5).map((y) => [xs, y, -3]), 0.2);                            // Tasche
    }
    F.torso.set(-1, 2, 8, 0x4b5563, 3).set(0, 2, 8, 0x4b5563, 3);                              // Schnalle
  },
  skirt(F, o) {
    const line = o.trim ?? 0xffffff, dark = vxShade(o.c, -0.2);
    F.torso.paint((v) => {
      if (v.tag !== 'skirt') return null;
      const lx = (v.x + v.z + 400) % 6 === 0, ly = (v.y + 400) % 5 === 0;
      return lx && ly ? dark : lx || ly ? line : ((v.x + v.z) >> 1) & 1 ? o.c : vxShade(o.c, -0.07);
    });
  },
  sneakers(F, o) {
    const b = -VOX.LEG * 2, white = 0xf4f4f6;
    for (const [leg, x0] of [[F.legR, 0], [F.legL, -12]]) {
      const xm = (x0 === 0 ? 3 : -3) * 2;                                                       // grob xm → fein
      // Schnürsenkel über Kreuz (4×4 auf der Vorderseite z 7)
      const rows = ['W..W', '.WW.', 'W..W', '.WW.'];
      rows.forEach((r, j) => [...r].forEach((ch, i) => leg.recolor(xm - 2 + i, b + 9 - j, 7, ch === 'W' ? white : vxShade(o.c, -0.3), 1)));
      // Sohlenprofil
      leg.paint((v) => (v.y === b && v.tag === 'shoes' && ((v.x + v.z) & 1) ? 0xb8bcc6 : null));
      // Naht an der Seite
      leg.paint((v) => (v.y === b + 5 && v.tag === 'shoes' && !(v.x & 1) && v.c === o.c ? vxShade(o.c, 0.3) : null));
    }
  },
  cap(F, o) {
    const H = F.head, z = 13;
    for (let x = -3; x <= 2; x++) for (let y = 22; y <= 26; y++) H.recolor(x, y, z, o.c2);
    vxTimes(H, -2, 22, z, o.c);
    vxStitch(H, vxRange(-10, 9).map((x) => [x, 21, 20]), 0.3);                                 // Naht am Schild
  },
  catbeanie(F, o) {
    F.head.paint((v) => (v.tag === 'hat' && (v.x + v.z) & 1 && v.y < 26 ? vxShade(v.c, -0.07) : null));
  },
  watch(F, o) {
    const A = F.armL;
    for (const [y, z] of [[-15, -2], [-15, 0], [-16, -1], [-16, 1]]) A.recolor(-8, y, z, vxShade(o.c2 ?? 0x5eead4, -0.55), 2); // Anzeige
    A.set(-7, -14, 2, 0xd7dbe3, 3);                                                            // Knopf
  },
  headphones(F, o) {
    const T = F.torso;
    for (const x0 of [-14, 8]) for (let x = x0; x <= x0 + 5; x++) for (let y = 14; y <= 21; y++) {
      const edge = x === x0 || x === x0 + 5 || y === 14 || y === 21, mid = x >= x0 + 2 && x <= x0 + 3 && y >= 16 && y <= 19;
      if (edge) T.recolor(x, y, 9, vxShade(o.c, 0.25)); else if (mid) T.recolor(x, y, 9, vxShade(o.c, -0.35));
    }
  },
};

/**
 * Abrunden: Voxel in einem Quader b entfernen, die ausserhalb einer «Superellipse» liegen (p = 2: Kugel, p gross: Würfel).
 * test(v): nur diese Voxel betreffen. flat: { bottom, top } – dort gerade lassen (Sohle, Hüfte).
 */
function vxCarve(set, b, p, { test = null, bottom = false, top = false } = {}) {
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2, cz = (b.z0 + b.z1 + 1) / 2;
  const hx = (b.x1 - b.x0 + 1) / 2, hy = (b.y1 - b.y0 + 1) / 2, hz = (b.z1 - b.z0 + 1) / 2;
  set.filter((v) => {
    if (v.x < b.x0 || v.x > b.x1 || v.y < b.y0 || v.y > b.y1 || v.z < b.z0 || v.z > b.z1) return true;
    if (test && !test(v)) return true;
    let yy = (v.y + 0.5 - cy) / hy;
    if ((bottom && yy < 0) || (top && yy > 0)) yy = 0;
    const r = Math.abs((v.x + 0.5 - cx) / hx) ** p + Math.abs(yy) ** p + Math.abs((v.z + 0.5 - cz) / hz) ** p;
    return r <= 1.02;
  });
}
/** die ganze Figur rund machen (feine Koordinaten) */
function vxRoundAll(F, look) {
  const body = (v) => v.tag !== 'neck' && v.tag !== 'bag' && v.tag !== 'back';
  // Kopf fast kugelig, Haare und Mützen folgen der Rundung
  vxCarve(F.head, { x0: -12, x1: 11, y0: 0, y1: 23, z0: -12, z1: 11 }, 3, { test: (v) => v.tag === 'skin' || v.tag === 'face' });
  vxCarve(F.head, { x0: -16, x1: 15, y0: 0, y1: 29, z0: -16, z1: 15 }, 2.8, { test: (v) => v.tag === 'hair' || v.tag === 'hat', bottom: true });
  // Körper samt Jacke, Arme, Beine, Schuhe: stark gerundete Kanten
  vxCarve(F.torso, { x0: -12, x1: 11, y0: 0, y1: 23, z0: -8, z1: 7 }, 3.2, { test: body, bottom: true });
  for (const arm of [F.armR, F.armL]) vxCarve(arm, { x0: -6, x1: 5, y0: -20, y1: 3, z0: -8, z1: 7 }, 3.2);
  for (const [leg, x0] of [[F.legR, 0], [F.legL, -12]]) {
    vxCarve(leg, { x0: x0 - 2, x1: x0 + 13, y0: -16, y1: -1, z0: -8, z1: 7 }, 3.4, { top: true, test: (v) => v.tag !== 'shoes' });
    vxCarve(leg, { x0, x1: x0 + 11, y0: -26, y1: -15, z0: -8, z1: 11 }, 2.8, { bottom: true, test: (v) => v.tag === 'shoes' });
  }
}

/* ---------------- Figur zusammenbauen ---------------- */
/**
 * look: { skin, face: { eyes, eyeC, lashes, blush, freckles, mouth }, hair: { id, c, c2 }, top: { id, c, trim, under, patches },
 *   bottom: { id, c, trim, chain, warmers }, shoes: { id, c, c2, paw }, hat: { id, c, c2, c3 }, neck: { id, c }, back: { id, c, c2 },
 *   wrist: { id, c, c2 }, bag: { id, c, c2 }, hand }
 * Liefert { root, parts, setAnim(name), update(dt), tris(), dispose() }
 */
function vxFigure(T, look) {
  const P = vxBody(look);
  const use = (reg, o, tag, ...args) => { if (o && reg[o.id]) { vxTagAll(P, tag); reg[o.id](...args, o); vxTagAll(P, null); } };
  use(VX_HAIR, look.hair, 'hair', P.head);
  use(VX_BOTTOMS, look.bottom, 'bottom', P);
  use(VX_SHOES, look.shoes, 'shoes', P);
  use(VX_TOPS, look.top, 'top', P);
  use(VX_WRIST, look.wrist, 'wrist', P);
  use(VX_BAGS, look.bag, 'bag', P.torso);
  use(VX_NECK, look.neck, 'neck', P.torso);
  use(VX_BACK, look.back, 'back', P.torso);
  use(VX_HATS, look.hat, 'hat', P.head);
  // fein aufteilen, dann Gesicht und Verzierungen
  const F = {};
  for (const k of ['head', 'torso', 'armR', 'armL', 'legR', 'legL']) F[k] = vxUpscale(P[k]);
  vxFineTextures(F, look);
  vxFace(F.head, look);
  for (const slot of ['hair', 'top', 'bottom', 'shoes', 'hat', 'neck', 'back', 'wrist', 'bag']) { const o = look[slot]; if (o && VX_DETAIL[o.id]) VX_DETAIL[o.id](F, o, look); }
  if (VOX.smooth) vxRoundAll(F, look);

  const S = VOX.S;
  const root = new T.Group();
  const body = new T.Group(); root.add(body);
  const mk = (set, x, y, z, parent = body, opts) => { const g = new T.Group(); g.position.set(x * 2 * S, y * 2 * S, z * 2 * S); g.add(vxMesh(T, set, opts)); parent.add(g); return g; };
  const G = {};
  G.torso = mk(F.torso, 0, VOX.HIP, 0);
  // Gesicht: Bild auf die Vorderseite des Kopfes (nur Haut, nicht Haare)
  const faces = new Map();
  const faceTex = (over) => {
    const k = `${over.mouth || ''}|${over.eyes || ''}`;
    if (!faces.has(k)) { const t = new T.CanvasTexture(vxFaceCanvas(look, over)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; faces.set(k, t); }
    return faces.get(k);
  };
  const decalMat = new T.MeshStandardMaterial({ map: faceTex({}), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = { test: (v) => (v.tag === 'skin' || v.tag === 'face') && v.z >= 2 && v.y >= 0, uv: (x, y) => [(x + 12) / 24, y / 24] };
  G.head = mk(F.head, 0, VOX.NECK - VOX.HIP, 0, G.torso, { decal, decalMat });
  G.armR = mk(F.armR, VOX.ARM_X, VOX.SHOULDER - VOX.HIP, 0, G.torso);
  G.armL = mk(F.armL, -VOX.ARM_X, VOX.SHOULDER - VOX.HIP, 0, G.torso);
  G.legR = mk(F.legR, 0, VOX.HIP, 0);
  G.legL = mk(F.legL, 0, VOX.HIP, 0);
  let item = null;
  if (VX_HAND[look.hand]) {
    const H = VX_HAND[look.hand];
    item = new T.Group(); item.add(vxMesh(T, vxUpscale(H.build())));
    item.position.set((H.x ?? -0.5) * 2 * S, -9.5 * 2 * S, 0.5 * 2 * S);
    item.rotation.set(H.rx || 0, H.ry || 0, H.rz || 0, 'YXZ');
    G.armR.add(item);
  }

  /* Animationen: Zielhaltung pro Bild, weich überblendet */
  const st = { anim: 'idle', t: 0, cur: {} };
  const poses = {
    idle: (t) => ({ by: Math.sin(t * 2.2) * 0.006, hx: Math.sin(t * 1.3) * 0.03, hy: Math.sin(t * 0.6) * 0.12, arx: Math.sin(t * 2.2) * 0.05, alx: -Math.sin(t * 2.2) * 0.05, arz: 0.04, alz: -0.04 }),
    wave: (t) => ({ hx: -0.05, hz: Math.sin(t * 3) * 0.06, arz: 2.75 + Math.sin(t * 11) * 0.28, alz: -0.06, alx: Math.sin(t * 2) * 0.05 }),
    cheer: (t) => ({ by: Math.abs(Math.sin(t * 6)) * 0.22, arz: 2.6 + Math.sin(t * 12) * 0.12, alz: -2.6 - Math.sin(t * 12) * 0.12, hx: -0.15, lrx: -Math.abs(Math.sin(t * 6)) * 0.3, llx: -Math.abs(Math.sin(t * 6)) * 0.3 }),
    dance: (t) => ({ by: Math.abs(Math.sin(t * 5)) * 0.07, tz: Math.sin(t * 5) * 0.12, ty: Math.sin(t * 2.5) * 0.25, arz: 1.2 + Math.sin(t * 5) * 0.9, alz: -1.2 + Math.sin(t * 5) * 0.9, arx: -0.4, alx: -0.4, hz: -Math.sin(t * 5) * 0.12, lrx: Math.max(0, Math.sin(t * 5)) * -0.5, llx: Math.max(0, -Math.sin(t * 5)) * -0.5 }),
    hold: (t) => ({ by: Math.sin(t * 2.2) * 0.006, arx: -0.95, arz: 0.05, alx: Math.sin(t * 2.2) * 0.05, hy: 0.15, hx: 0.08 }),
    present: (t) => ({ by: Math.sin(t * 3) * 0.01, arx: -1.7 + Math.sin(t * 3) * 0.06, arz: 0.45, alx: -0.2, alz: -0.15, hx: 0.08, hy: 0.28 }),
  };
  const keys = ['by', 'hx', 'hy', 'hz', 'tz', 'ty', 'arx', 'arz', 'alx', 'alz', 'lrx', 'llx'];
  function apply(p) {
    root.position.y = p.by; body.rotation.y = p.ty; G.torso.rotation.z = p.tz;
    G.head.rotation.set(p.hx, p.hy, p.hz);
    G.armR.rotation.set(p.arx, 0, p.arz); G.armL.rotation.set(p.alx, 0, p.alz);
    G.legR.rotation.x = p.lrx; G.legL.rotation.x = p.llx;
  }
  /* Mimik: Mund passend zur Bewegung, ab und zu blinzeln */
  const baseMouth = look.face?.mouth || 'smile';
  st.blink = 1.5 + Math.random() * 2;
  function expression(dt) {
    let over = {};
    if (st.anim === 'wave') over = { mouth: Math.floor(st.t * 5) % 3 ? 'open' : 'o' };          // «Hallo!» sagen
    else if (st.anim === 'cheer') over = { mouth: 'laugh', eyes: 'happy' };
    else if (st.anim === 'dance') over = { mouth: Math.floor(st.t * 2.5) % 2 ? 'grin' : 'laugh' };
    else if (st.anim === 'present') over = { mouth: 'open' };
    else if (st.anim === 'hold') over = { mouth: baseMouth === 'calm' ? 'smirk' : 'grin' };
    st.blink -= dt;
    if (st.blink < 0 && over.eyes !== 'happy') { over.eyes = 'closed'; if (st.blink < -0.13) st.blink = 2.2 + Math.random() * 3; }
    const tex = faceTex(over);
    if (decalMat.map !== tex) decalMat.map = tex;
  }
  function update(dt) {
    st.t += dt;
    expression(dt);
    const target = poses[st.anim](st.t);
    const k = 1 - Math.exp(-dt * 9);
    for (const key of keys) {
      const goal = target[key] || 0;
      st.cur[key] = st.cur[key] == null ? goal : st.cur[key] + (goal - st.cur[key]) * k;
    }
    apply(st.cur);
  }
  update(0.016);
  return {
    root, parts: G, item,
    setAnim(name) { if (poses[name]) { st.anim = name; st.t = 0; } },
    get anim() { return st.anim; },
    update,
    tris() { let n = 0; root.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count / 3; }); return n; },
    dispose() { root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); faces.forEach((t) => t.dispose()); decalMat.dispose(); },
  };
}
