/* Teilmal – Karts im Stil der Avatare: weich gerundete Voxel, die eigene Figur am Steuer
 *
 * Braucht js/avatar3d.js (VoxSet, vxSmoothGeometry, vxFigure); beide werden erst für die 3D-Welt bzw. das Rennen geladen.
 * Formen (Karosserien): vier Grundformen für alle, dazu besondere Formen aus der Garage. Alle fahren gleich schnell –
 * die Fahrphysik im Rennen schaut sich die Form nie an.
 * Koordinaten: 1 Voxel = KV.U Meter; x quer (symmetrisch um 0), y hoch (0 = Boden), z längs (+z = vorne).
 */
'use strict';

const KV = { U: 0.05, UW: 0.035, DRIVER: 0.7 };
const KV_DARK = 0x23262e, KV_RUBBER = 0x1b1d22, KV_CHROME = 0xdfe6ee, KV_GOLD = 0xf5b400, KV_WHITE = 0xf8fafc, KV_SEAT = 0x1f2430;
const kvLerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

/* ---------------- Baukasten ---------------- */
function kvBuilder() {
  const s = new VoxSet();
  const pick = (c, x, y, z) => (typeof c === 'function' ? c(x, y, z) : c);
  const B = {
    s,
    put(x, y, z, c, mat = 0, tag = null) { const cc = pick(c, x, y, z); if (cc != null) s.set(x, y, z, cc, mat, tag); },
    /** Quader mit runden Kanten (Superellipse, p gross = eckiger) */
    rbox(x0, y0, z0, x1, y1, z1, c, { mat = 0, tag = null, p = 3, keep = null } = {}) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 + 0.5, hy = (y1 - y0) / 2 + 0.5, hz = (z1 - z0) / 2 + 0.5;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        if (Math.abs((x - cx) / hx) ** p + Math.abs((y - cy) / hy) ** p + Math.abs((z - cz) / hz) ** p > 1) continue;
        if (keep && !keep(x, y, z)) continue;
        B.put(x, y, z, c, mat, tag);
      }
    },
    /** Ellipsoid */
    ell(cx, cy, cz, rx, ry, rz, c, { mat = 0, tag = null, keep = null } = {}) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 > 1) continue;
        if (keep && !keep(x, y, z)) continue;
        B.put(x, y, z, c, mat, tag);
      }
    },
    /** Rohr entlang z (r darf von z abhängen) */
    tubeZ(z0, z1, cx, cy, r, c, { mat = 0, tag = null, sy = 1, keep = null } = {}) {
      for (let z = z0; z <= z1; z++) {
        const rr = typeof r === 'function' ? r(z) : r;
        if (rr <= 0) continue;
        for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) for (let y = Math.floor(cy - rr * sy); y <= Math.ceil(cy + rr * sy); y++) {
          if ((x - cx) ** 2 + ((y - cy) / sy) ** 2 > rr * rr) continue;
          if (keep && !keep(x, y, z)) continue;
          B.put(x, y, z, c, mat, tag);
        }
      }
    },
    /** dicke Stange von a nach b (Überrollbügel, Streben) */
    bar(a, b, r, c, { mat = 1, tag = null } = {}) {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2) || 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, pz = a[2] + (b[2] - a[2]) * t;
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) for (let z = Math.floor(pz - r); z <= Math.ceil(pz + r); z++) {
          if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 <= r * r + 0.3) B.put(x, y, z, c, mat, tag);
        }
      }
    },
    /** symmetrisch: f(sign) für links und rechts */
    both(f) { f(1); f(-1); },
    cut(fn) { s.filter((v) => !fn(v.x, v.y, v.z, v)); },
    /** Bild auf die Oberfläche: aus Richtung dir ('+x', '-x', '+y', '+z', '-z') das erste Voxel umfärben.
        f(du, dv) → Farbe oder [Farbe, Material] oder null; du nach rechts, dv nach oben (vom Betrachter aus) */
    stamp(dir, cu, cv, R, f, { tags = null } = {}) {
      const bb = kvBox(s);
      for (let du = -R; du <= R; du++) for (let dv = -R; dv <= R; dv++) {
        const r = f(du, dv);
        if (r == null) continue;
        const [c, mat] = Array.isArray(r) ? r : [r, null];
        let x, y, z, axis, from, to;
        if (dir === '+x' || dir === '-x') { z = dir === '+x' ? cu - du : cu + du; y = cv + dv; axis = 'x'; [from, to] = dir === '+x' ? [bb.x1, bb.x0] : [bb.x0, bb.x1]; }
        else if (dir === '+z' || dir === '-z') { x = dir === '+z' ? cu + du : cu - du; y = cv + dv; axis = 'z'; [from, to] = dir === '+z' ? [bb.z1, bb.z0] : [bb.z0, bb.z1]; }
        else { x = cu - du; z = cv + dv; axis = 'y'; [from, to] = [bb.y1, bb.y0]; }
        const st = from > to ? -1 : 1;
        for (let k = from; st > 0 ? k <= to : k >= to; k += st) {
          const v = axis === 'x' ? s.get(k, y, z) : axis === 'z' ? s.get(x, y, k) : s.get(x, k, z);
          if (!v) continue;
          if (!tags || tags.includes(v.tag)) { v.c = c; if (mat != null) v.mat = mat; }
          break;
        }
      }
    },
  };
  return B;
}
function kvBox(s, tag = null) {
  const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  for (const v of s.m.values()) {
    if (tag && v.tag !== tag) continue;
    b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y); b.z0 = Math.min(b.z0, v.z); b.z1 = Math.max(b.z1, v.z);
  }
  return b;
}
/** Startnummer als Scheibe mit Pixel-Ziffern */
function kvNumber(n, ring) {
  const d = String(Math.max(1, Math.min(99, n | 0))).split('').map((ch) => VX_DIGITS[ch]);
  const wTot = d.length * 3 + (d.length - 1);
  return (du, dv) => {
    const r = Math.hypot(du, dv);
    if (r > 5.6) return null;
    if (r > 4.7) return ring;
    const col = du + Math.floor(wTot / 2), row = 2 - dv;
    if (row >= 0 && row < 5 && col >= 0 && col < wTot) {
      const di = Math.floor(col / 4), cx = col % 4;
      if (cx < 3 && d[di] && d[di][row][cx] === 'X') return 0x111827;
    }
    return KV_WHITE;
  };
}

/* ---------------- Materialien ----------------
   0 Lack (je nach Lackart), 1 Kunststoff glänzend, 2 leuchtend, 3 Metall, 4 matt (Gummi, Holz, Stoff) */
const KV_MAT = { T: null };
function kvFinishMat(T, f) {
  const o = { vertexColors: true };
  switch (f) {
    case 'matte': return new T.MeshStandardMaterial({ ...o, roughness: 0.82, metalness: 0 });
    case 'metal': return new T.MeshPhysicalMaterial({ ...o, metalness: 0.7, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    case 'pearl': return new T.MeshPhysicalMaterial({ ...o, metalness: 0.15, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620] });
    case 'chrome': return new T.MeshPhysicalMaterial({ ...o, metalness: 1, roughness: 0.08, clearcoat: 1 });
    case 'glow': {
      const m = new T.MeshStandardMaterial({ ...o, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.42 });
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;'); };
      m.customProgramCacheKey = () => 'kv-glow';
      return m;
    }
    default: return new T.MeshPhysicalMaterial({ ...o, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  }
}
function kvMats(T, finish = 'gloss') {
  if (KV_MAT.T !== T) {
    Object.assign(KV_MAT, {
      T, fin: {},
      glossy: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }),
      glow: new T.MeshBasicMaterial({ vertexColors: true }),
      metal: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.95 }),
      matte: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    });
  }
  if (!KV_MAT.fin[finish]) KV_MAT.fin[finish] = [kvFinishMat(T, finish), KV_MAT.glossy, KV_MAT.glow, KV_MAT.metal, KV_MAT.matte];
  return KV_MAT.fin[finish];
}

/* ---------------- Muster (auf alle Lack-Voxel) ---------------- */
function kvPattern(s, L) {
  const pat = L.pattern;
  if (!pat || pat === 'none') return;
  const bb = kvBox(s, 'paint');
  if (bb.x0 > bb.x1) return;
  const P2 = L.paint2, Y = 0xffd34d;
  const xm = Math.max(Math.abs(bb.x0), Math.abs(bb.x1)) || 1, sz = bb.z1 - bb.z0 || 1, sy = bb.y1 - bb.y0 || 1, ymid = (bb.y0 + bb.y1) / 2;
  const zig = (z, per, amp) => { const t = (((z / per) % 1) + 1) % 1; return amp * (Math.abs(t - 0.5) * 4 - 1); };
  for (const v of s.m.values()) {
    if (v.tag !== 'paint') continue;
    const { x, y, z } = v, ax = Math.abs(x), a = (z - bb.z0) / sz, h = (y - bb.y0) / sy, side = ax >= xm * 0.72;
    let c = null;
    switch (pat) {
      case 'racing': if ((ax >= 2 && ax <= 4) || (side && y >= ymid - 1 && y <= ymid)) c = P2; break;
      case 'center': if (ax <= 2 || ax === 4 || (side && Math.round(ymid + sy * 0.25) === y)) c = P2; break;
      case 'duo': if (a > 0.6 - h * 0.15 + (side ? 0.04 : 0)) c = P2; break;
      case 'checker': if (a > 0.62 && (Math.floor((x + 99) / 3) + Math.floor((y + 99) / 3) + Math.floor((z + 99) / 3)) % 2) c = P2; break;
      case 'dots': {
        const q = (n, o) => (((n + o) % 8) + 8) % 8 - 3.5;
        const o = (Math.floor((z + 99) / 8) % 2) * 4;
        if (q(x, o) ** 2 + q(y, 0) ** 2 + q(z, 0) ** 2 <= 4.5) c = P2;
        break;
      }
      case 'stars': {
        const cx = Math.floor((x + 100) / 9), cy = Math.floor((y + 100) / 9), cz = Math.floor((z + 100) / 9);
        if (vxRand(cx, cy, cz, 5) < 0.7) {
          const ox = cx * 9 - 100 + 2 + Math.floor(vxRand(cx, cy, cz, 6) * 5), oy = cy * 9 - 100 + 2 + Math.floor(vxRand(cx, cy, cz, 7) * 5), oz = cz * 9 - 100 + 2 + Math.floor(vxRand(cx, cy, cz, 8) * 5);
          const dx = Math.abs(x - ox), dy = Math.abs(y - oy), dz = Math.abs(z - oz);
          if ((dx + dy + dz <= 1) || ((dx === 0) + (dy === 0) + (dz === 0) >= 2 && Math.max(dx, dy, dz) <= 2)) c = P2;
        }
        break;
      }
      case 'lightning':
        if ((!side && h > 0.4 && Math.abs(x - zig(z, 14, 4)) <= 1.2) || (side && Math.abs(y - ymid - zig(z, 12, sy * 0.25)) <= 1.2)) c = P2;
        break;
      case 'flames': {
        const len = side ? 0.3 + 0.22 * Math.abs(Math.sin(y * 0.7)) : 0.34 + 0.26 * Math.abs(Math.sin(x * 0.5));
        if (a > 1 - len) c = a > 1 - len * 0.42 ? Y : P2;
        break;
      }
      default: break;
    }
    if (c != null) v.c = c;
  }
}

/* ---------------- Räder ---------------- */
const KV_WHEELS = new Map();
function kvRimColor(style, t, ang) {
  const P2 = Math.PI * 2;
  const sec = (n) => { const w = P2 / n; return ((((ang % w) + w) % w) - w / 2) / w; };  // -0.5 … 0.5 innerhalb eines Sektors
  switch (style) {
    case 'star': case 'gold': {
      const silver = style === 'gold' ? [KV_GOLD, 3] : [0xd7dde5, 3];
      if (t < 0.24 || t > 0.86) return silver;
      return Math.abs(sec(5)) < 0.16 * (1.15 - t) + 0.04 ? silver : [0x2b2f38, 4];
    }
    case 'spoke': if (t > 0.86) return [0xe2e8f0, 3]; if (t < 0.18) return [0x94a3b8, 3]; return Math.abs(sec(12)) < 0.14 ? [0xcbd5e1, 3] : [0x334155, 4];
    case 'turbine': { if (t < 0.2) return [0xf97316, 1]; const f = ((((ang + t * 1.6) / P2) * 9) % 1 + 1) % 1; return f < 0.5 ? [0xe5e7eb, 3] : [0x4b5563, 4]; }
    case 'black': if (t < 0.18) return [0xef4444, 1]; if (t > 0.84) return [0x111827, 1]; return Math.abs(sec(6)) < 0.2 ? [0x1f2430, 1] : [0x0b0d12, 4];
    case 'neon': if (t > 0.76 && t < 0.94) return [0x22d3ee, 2]; if (t < 0.18) return [0xa5f3fc, 2]; return Math.abs(sec(3)) < 0.1 ? [0xf472b6, 2] : [0x0b1020, 4];
    default: { // klassisch: Scheibe mit fünf Löchern
      if (t < 0.2) return [0xf1f5f9, 3];
      if (t > 0.36 && t < 0.72 && Math.abs(sec(5)) < 0.17) return [0x334155, 4];
      return [0xc7ced8, 3];
    }
  }
}
/** Rad: Reifen mit Profil und runder Schulter, vertiefte Felge mit Muster. Achse = x. Je Stil und Grösse einmal gebaut. */
function kvWheelGeo(T, style, R, W, lite = false) {
  const key = `${style}|${R}|${W}|${lite ? 1 : 0}`;
  if (KV_WHEELS.has(key)) return KV_WHEELS.get(key);
  const u = lite ? KV.UW * 1.6 : KV.UW, r = R / u, hw = Math.max(2, Math.round(W / u / 2)), rim = r * 0.6, rc = r * 0.74;
  const s = new VoxSet();
  const wagon = style === 'wagon';
  for (let x = -hw; x <= hw; x++) for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let z = -Math.ceil(r); z <= Math.ceil(r); z++) {
    const d = Math.hypot(y, z);
    if (d > r) continue;
    const ax = Math.abs(x);
    if (d > rc) { const k = (d - rc) / (r - rc); if (ax > hw * Math.sqrt(Math.max(0, 1 - k * k * 0.85)) + 0.2) continue; }
    const ang = Math.atan2(y, z);
    if (d > rim) {
      if (wagon) { if (d > r - 2.2) s.set(x, y, z, d > r - 1.2 ? 0x3f2a1a : 0x8b5a2b, 4); else if (ax <= 1) s.set(x, y, z, 0x8b5a2b, 4); continue; }
      const tread = d > r - 2.2 && Math.floor(((ang / (Math.PI * 2)) * 30 + 30) + (x > 0 ? 0.5 : 0)) % 2;
      s.set(x, y, z, tread ? 0x30333b : KV_RUBBER, 4);
      continue;
    }
    if (wagon) {  // Speichenrad: zwischen den Speichen ist Luft
      const w = (Math.PI * 2) / 10, a = ((((ang % w) + w) % w) - w / 2) / w;
      if (d < r * 0.2) s.set(x, y, z, KV_GOLD, 3);
      else if (Math.abs(a) < 0.1 && ax <= 1) s.set(x, y, z, 0xa0703c, 4);
      continue;
    }
    if (ax > hw - 1) continue;                 // Felge etwas vertieft
    if (ax === hw - 1) { const [c, m] = kvRimColor(style, d / rim, ang); s.set(x, y, z, c, m); }
    else s.set(x, y, z, 0x15171c, 4);
  }
  const { geo } = vxSmoothGeometry(T, s, { iter: 3 });
  geo.translate(-0.5 * VOX.S, -0.5 * VOX.S, -0.5 * VOX.S);   // Mitte des Rads = Drehachse
  KV_WHEELS.set(key, geo);
  return geo;
}

/* ---------------- Spoiler und Auspuff (für alle Formen mit Halterung) ---------------- */
function kvWing(B, L, m) {
  if (!m) return;
  const P = L.paint, P2 = L.paint2, { y, z, w = 18 } = m;
  const plate = (yy, zz, half, depth, c) => B.rbox(-half, yy, zz - depth, half, yy + 1, zz + depth, c, { tag: c === P ? 'paint' : 'paint2', p: 4 });
  const ends = (yy, zz, half, h, depth, c, mat = 1) => B.both((sg) => B.rbox(sg > 0 ? half : -half - 1, yy - h, zz - depth, sg > 0 ? half + 1 : -half, yy + 2, zz + depth, c, { mat, p: 5 }));
  const struts = (yy, zz, from) => B.both((sg) => B.rbox(sg * 6 - 1, from, zz - 1, sg * 6 + 1, yy, zz + 1, KV_DARK, { mat: 1, p: 4 }));
  switch (L.wing) {
    case 'big': struts(y + 6, z, y - 6); plate(y + 6, z, w + 3, 6, P2); ends(y + 6, z, w + 3, 8, 7, P, 0); break;
    case 'double': struts(y + 5, z, y - 6); plate(y, z, w, 5, P); plate(y + 5, z - 2, w, 4, P2); ends(y + 5, z, w, 9, 6, KV_DARK); break;
    case 'duck': B.rbox(-w + 3, y - 6, z - 2, w - 3, y - 3, z + 4, P, { tag: 'paint', p: 3 }); B.rbox(-w + 3, y - 4, z - 4, w - 3, y - 3, z - 1, P2, { tag: 'paint2', p: 3 }); break;
    case 'fin':
      struts(y, z, y - 6); plate(y, z, w, 5, P); ends(y, z, w, 6, 6, KV_DARK);
      for (let k = 0; k <= 14; k++) { const top = Math.round(y + 2 + (k / 14) * 8); for (let yy = y - 6; yy <= top; yy++) B.put(0, yy, z + 16 - k, P2, 0, 'paint2'); }
      break;
    default: struts(y, z, y - 6); plate(y, z, w, 5, P); ends(y, z, w, 6, 6, KV_DARK); break;
  }
}
function kvPipes(B, L, pts) {
  const c = L.exhaust === 'gold' ? [KV_GOLD, 3] : L.exhaust === 'black' ? [0x111827, 1] : [KV_CHROME, 3];
  const list = [];
  for (const [x, y, z] of pts) {
    const xs = L.exhaust === 'quad' ? [x - Math.sign(x || 1) * 2, x + Math.sign(x || 1) * 2] : [x];
    for (const xx of xs) {
      B.tubeZ(z, z + 5, xx, y, 1.6, c[0], { mat: c[1] });
      B.cut((vx, vy, vz) => vz === z && (vx - xx) ** 2 + (vy - y) ** 2 < 1.1);   // Öffnung
      list.push([xx, y, z]);
    }
  }
  return list;
}

/* ---------------- Formen ----------------
   build(B, L) baut den Körper und liefert die Masse (in Voxeln):
   wheels [[x, z, r, vorne]], wheelW, seat { y, z } (Sitzfläche), wheel { y, z } (Lenkrad), pipes, wing, glow [breite, länge] */
const KART_BODIES = {
  formula: {
    build(B, L) {
      const P = L.paint;
      for (let z = -27; z <= 35; z++) {
        const w = z < 15 ? 9 : kvLerp(9, 3.5, (z - 15) / 20), top = z < -12 ? 13 : z < 15 ? 11 : kvLerp(11, 6.5, (z - 15) / 20), bot = 4;
        const cy = (top + bot) / 2, hy = (top - bot) / 2 + 0.5;
        for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) for (let y = bot; y <= Math.ceil(top); y++) {
          if (Math.abs(x / (w + 0.5)) ** 3 + Math.abs((y - cy) / hy) ** 3 <= 1) B.put(x, y, z, P, 0, 'paint');
        }
      }
      B.cut((x, y, z) => Math.abs(x) <= 6 && y >= 8 && z >= -13 && z <= 7);            // Cockpit
      B.rbox(-6, 5, -13, 6, 8, -1, KV_SEAT, { mat: 4, p: 4 });                          // Sitz
      B.rbox(-6, 8, -15, 6, 17, -12, KV_SEAT, { mat: 4, p: 3 });                        // Lehne
      B.both((sg) => B.rbox(sg > 0 ? 10 : -17, 5, -14, sg > 0 ? 17 : -10, 11, 10, P, { tag: 'paint', p: 3 }));   // Seitenkästen
      B.both((sg) => B.rbox(sg > 0 ? 11 : -16, 6, 9, sg > 0 ? 16 : -11, 10, 11, KV_DARK, { mat: 4, p: 4 }));     // Lufteinlass
      B.rbox(-4, 12, -26, 4, 17, -14, P, { tag: 'paint', p: 2.5 });                       // Lufthutze
      B.rbox(-3, 15, -16, 3, 17, -14, KV_DARK, { mat: 4, p: 4 });
      B.rbox(-8, 4, -33, 8, 12, -26, KV_DARK, { mat: 4, p: 3 });                          // Motor
      B.rbox(-21, 3, 32, 21, 4, 38, KV_DARK, { mat: 1, p: 5 });                           // Frontflügel
      B.both((sg) => B.rbox(sg > 0 ? 20 : -21, 3, 32, sg > 0 ? 21 : -20, 6, 38, KV_DARK, { mat: 1, p: 6 }));
      return { wheels: [[19, 21, 7.8, 1], [-19, 21, 7.8, 1], [20, -19, 8.4, 0], [-20, -19, 8.4, 0]], wheelW: 0.36, seat: { y: 8, z: -6 }, steer: { y: 15.5, z: 3 },
        pipes: [[4, 9, -38], [-4, 9, -38]], wing: { y: 22, z: -30 }, num: [['+x', 0, 8, 17], ['-x', 0, 8, 17], ['+y', 0, 27]], lights: { front: [99, 0], back: [-33, 9] }, glow: [2.8, 4.4] };
    },
  },
  kart: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      B.rbox(-11, 2, -26, 11, 3, 28, KV_DARK, { mat: 1, p: 6 });                             // Bodenplatte
      for (let z = 20; z <= 35; z++) {                                                      // Nase vorne
        const top = kvLerp(10, 5, (z - 20) / 15), w = kvLerp(11, 7, (z - 20) / 15);
        for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) for (let y = 3; y <= top; y++) if (Math.abs(x / (w + 0.5)) ** 3 + Math.abs((y - (3 + top) / 2) / ((top - 3) / 2 + 0.6)) ** 3 <= 1) B.put(x, y, z, P, 0, 'paint');
      }
      B.both((sg) => B.rbox(sg > 0 ? 11 : -16, 3, -15, sg > 0 ? 16 : -11, 8, 12, P, { tag: 'paint', p: 3 }));   // Seitenkästen
      B.rbox(-17, 3, -33, 17, 7, -28, P2, { tag: 'paint2', p: 3 });                        // Stossstange hinten
      B.rbox(-7, 4, -15, 7, 8, -1, P2, { tag: 'paint2', mat: 4, p: 3 });                   // Sitzschale
      B.rbox(-7, 8, -17, 7, 17, -13, P2, { tag: 'paint2', mat: 4, p: 3 });
      B.rbox(6, 4, -27, 13, 11, -18, KV_DARK, { mat: 4, p: 3 });                            // Motor
      B.tubeZ(-26, -19, 9.5, 12, 2, KV_CHROME, { mat: 3 });
      B.bar([0, 8, 18], [0, 13, 6], 0.9, KV_DARK);                                          // Lenksäule
      return { wheels: [[16, 21, 6.6, 1], [-16, 21, 6.6, 1], [17, -21, 7.2, 0], [-17, -21, 7.2, 0]], wheelW: 0.34, seat: { y: 7, z: -8 }, steer: { y: 14, z: 3 },
        pipes: [[10, 9, -34]], wing: { y: 20, z: -29, w: 16 }, num: [['+x', -2, 6], ['-x', -2, 6]], lights: { front: [99, 0], back: [-33, 5] }, glow: [2.6, 4.2] };
    },
  },
  buggy: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      B.rbox(-10, 5, -22, 10, 12, 22, P, { tag: 'paint', p: 2.6 });                         // Wanne
      for (let z = 18; z <= 33; z++) { const lo = kvLerp(6, 9, (z - 18) / 15), hi = kvLerp(12, 11, (z - 18) / 15); B.rbox(-9, Math.round(lo), z, 9, Math.round(hi), z, P, { tag: 'paint', p: 3 }); }
      B.cut((x, y, z) => Math.abs(x) <= 7 && y >= 9 && z >= -16 && z <= 10);
      B.rbox(-7, 6, -16, 7, 9, -3, KV_SEAT, { mat: 4, p: 4 });
      B.rbox(-7, 9, -18, 7, 18, -15, KV_SEAT, { mat: 4, p: 3 });
      for (const wz of [19, -18]) B.both((sg) => {                                           // Kotflügel
        for (let z = wz - 11; z <= wz + 11; z++) { const yy = Math.round(13 + Math.sqrt(Math.max(0, 121 - (z - wz) ** 2)) * 0.55); B.rbox(sg > 0 ? 14 : -23, yy, z, sg > 0 ? 23 : -14, yy + 1, z, P2, { tag: 'paint2', p: 6 }); }
      });
      const cage = (a, b) => B.bar(a, b, 1.1, KV_DARK);                                     // Überrollkäfig
      B.both((sg) => { cage([sg * 9, 11, -15], [sg * 8, 33, -14]); cage([sg * 9, 11, 9], [sg * 7, 30, 0]); cage([sg * 7, 30, 0], [sg * 8, 33, -14]); });
      cage([-8, 33, -14], [8, 33, -14]); cage([-7, 30, 0], [7, 30, 0]);
      for (let x = -8; x <= 8; x++) for (let y = 9; y <= 21; y++) { const d = Math.hypot(x, y - 15); if (d >= 3.5 && d <= 6.5) B.put(x, y, -24, KV_RUBBER, 4); if (d >= 3.5 && d <= 6.5) B.put(x, y, -25, KV_RUBBER, 4); if (d < 3.5) B.put(x, y, -24, 0xc7ced8, 3); }
      return { wheels: [[19, 19, 9.4, 1], [-19, 19, 9.4, 1], [19, -18, 9.6, 0], [-19, -18, 9.6, 0]], wheelW: 0.42, seat: { y: 9, z: -6 }, steer: { y: 17, z: 4 },
        pipes: [[5, 9, -27], [-5, 9, -27]], wing: { y: 35, z: -14, w: 12 }, num: [['+x', 0, 9], ['-x', 0, 9]], lights: { front: [33, 9], back: [-22, 9] }, glow: [2.8, 4.2] };
    },
  },
  bubble: {
    build(B, L) {
      const P = L.paint;
      B.ell(0, 12, 1, 15.5, 11, 30, P, { tag: 'paint', keep: (x, y) => y >= 4 });
      B.cut((x, y, z) => Math.abs(x) <= 10 && y >= 14 && z >= -17 && z <= 8);               // offenes Verdeck
      for (const wz of [18, -16]) B.cut((x, y, z) => Math.abs(x) > 8 && (y - 7) ** 2 + (z - wz) ** 2 < 82);   // Radkästen
      B.rbox(-9, 7, -17, 9, 13, -3, KV_SEAT, { mat: 4, p: 4 });
      B.rbox(-9, 13, -19, 9, 20, -16, KV_SEAT, { mat: 4, p: 3 });
      B.rbox(-10, 14, 8, 10, 20, 9, 0xbfe9ff, { mat: 1, p: 3, keep: (x, y) => (x / 10.5) ** 2 + ((y - 14) / 7) ** 2 <= 1 });   // Scheibe
      B.both((sg) => { B.ell(sg * 7, 12, 27.5, 3.4, 3.4, 2, KV_CHROME, { mat: 3 }); B.ell(sg * 7, 12, 28.6, 2.4, 2.4, 1.6, 0xfff4cc, { mat: 2 }); });   // runde Scheinwerfer
      B.stamp('+z', 0, 8, 7, (du, dv) => (Math.abs(dv + 0.12 * du * du / 3 - 0) <= 0.6 && Math.abs(du) <= 6 ? [KV_DARK, 4] : null));   // lächelnder Kühlergrill
      return { wheels: [[14, 18, 6.8, 1], [-14, 18, 6.8, 1], [14, -16, 6.8, 0], [-14, -16, 6.8, 0]], wheelW: 0.3, seat: { y: 13, z: -9 }, steer: { y: 20, z: 1 },
        pipes: [[6, 6, -31]], wing: { y: 24, z: -24, w: 13 }, num: [['+x', 0, 14], ['-x', 0, 14]], lights: { front: [99, 0], back: [-30, 12] }, glow: [2.6, 4.0], noFrontLights: true };
    },
  },
  rocket: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      B.tubeZ(-30, 24, 0, 12, 10, (x, y, z) => (z >= 16 && z <= 18 ? P2 : P), { tag: 'paint' });
      B.tubeZ(25, 44, 0, 12, (z) => 10 * (1 - ((z - 24) / 20) ** 1.7), (x, y, z) => (z >= 37 ? P2 : P), { tag: 'paint' });   // Nasenkegel
      B.cut((x, y, z) => Math.abs(x) <= 7 && y >= 16 && z >= -12 && z <= 5);
      B.rbox(-7, 9, -12, 7, 14, 2, KV_SEAT, { mat: 4, p: 4 });
      B.rbox(-7, 14, -14, 7, 22, -11, KV_SEAT, { mat: 4, p: 3 });
      B.both((sg) => { for (let z = -30; z <= -14; z++) { const len = Math.round(kvLerp(12, 3, (z + 30) / 16)); for (let k = 0; k <= len; k++) for (let y = 11; y <= 13; y++) B.put(sg * (9 + k), y - Math.round(k * 0.5), z, P2, 0, 'paint2'); } });   // Flossen
      for (let z = -30; z <= -16; z++) { const h = Math.round(kvLerp(12, 2, (z + 30) / 14)); for (let y = 21; y <= 21 + h; y++) for (let x = -1; x <= 1; x++) B.put(x, y, z, P2, 0, 'paint2'); }
      B.tubeZ(-37, -30, 0, 12, (z) => kvLerp(8.5, 6, (z + 37) / 7), KV_CHROME, { mat: 3 });  // Düse
      B.cut((x, y, z) => z <= -33 && (x * x + (y - 12) ** 2) < 25);
      B.tubeZ(-34, -33, 0, 12, 5, 0x1f2430, { mat: 4 });
      B.both((sg) => { B.stamp(sg > 0 ? '+x' : '-x', 14, 13, 4, (du, dv) => { const r = Math.hypot(du, dv); return r <= 2.2 ? [0x7dd3fc, 1] : r <= 3.6 ? [KV_CHROME, 3] : null; }); });   // Bullaugen
      B.rbox(-6, 16, 6, 6, 20, 7, 0xbfe9ff, { mat: 1, p: 3 });
      return { wheels: [[15, 20, 7, 1], [-15, 20, 7, 1], [15, -20, 7.2, 0], [-15, -20, 7.2, 0]], wheelW: 0.3, seat: { y: 14, z: -5 }, steer: { y: 21, z: 5 },
        pipes: null, flamePts: [[0, 12, -38]], bigFlame: 2.4, wing: null, num: [['+x', -6, 12], ['-x', -6, 12]], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.4, 4.6] };
    },
  },
  carriage: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      for (let z = -22; z <= 22; z++) {                                                      // Wagenkasten wie eine Schale
        const w = 13 * Math.sqrt(Math.max(0, 1 - (z / 23.5) ** 2)) + 1.5, top = Math.round(kvLerp(21, 14, (z + 22) / 44)), bot = Math.round(9 + Math.abs(z) / 8);
        for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) for (let y = bot; y <= top; y++) {
          const e = (Math.abs(x) / (w + 0.5)) ** 2.5 + ((top - y) / (top - bot + 4)) ** 2.5;
          if (e <= 1) B.put(x, y, z, y >= top - 0 ? KV_GOLD : P, y >= top ? 3 : 0, y >= top ? 'gold' : 'paint');
        }
      }
      B.cut((x, y, z) => { const w = 13 * Math.sqrt(Math.max(0, 1 - (z / 23.5) ** 2)) - 0.5; return Math.abs(x) < w && y >= 12 && Math.abs(z) < 21; });
      B.rbox(-10, 10, -19, 10, 14, -2, P2, { tag: 'paint2', mat: 4, p: 3 });                 // Samtpolster
      B.rbox(-11, 14, -24, 11, 31, -19, P, { tag: 'paint', p: 3 });                        // hohe Lehne
      B.rbox(-11, 29, -24, 11, 31, -19, KV_GOLD, { mat: 3, p: 3 });
      for (const x of [-8, 0, 8]) { B.rbox(x - 1, 31, -23, x + 1, x ? 34 : 36, -20, KV_GOLD, { mat: 3, p: 2 }); B.put(x, x ? 35 : 37, -21, 0xec4899, 2); }   // Krone
      B.both((sg) => {                                                                       // goldene Schnörkel und Laternen
        for (let t = 0; t < 26; t++) { const a = t / 4; B.stamp(sg > 0 ? '+x' : '-x', Math.round(-6 + Math.cos(a) * (2 + t * 0.25) * (sg > 0 ? -1 : 1)), Math.round(15 + Math.sin(a) * (1.5 + t * 0.12)), 0, () => [KV_GOLD, 3], { tags: ['paint'] }); }
        B.bar([sg * 12, 13, 19], [sg * 12, 23, 19], 0.8, KV_GOLD, { mat: 3 });
        B.rbox(sg * 12 - 2, 23, 17, sg * 12 + 2, 27, 21, 0xffe08a, { mat: 2, p: 3 });
        B.rbox(sg * 12 - 2, 28, 17, sg * 12 + 2, 28, 21, KV_GOLD, { mat: 3, p: 3 });
        B.bar([sg * 9, 9, 18], [sg * 15, 6, 20], 0.8, KV_GOLD, { mat: 3 }); B.bar([sg * 9, 9, -16], [sg * 16, 7, -18], 0.8, KV_GOLD, { mat: 3 });   // Federn
      });
      return { wheels: [[16, 20, 8, 1], [-16, 20, 8, 1], [17, -18, 11, 0], [-17, -18, 11, 0]], wheelW: 0.22, wheelStyle: 'wagon', seat: { y: 13, z: -11 }, steer: null,
        pipes: null, flamePts: [[6, 12, -24], [-6, 12, -24]], wing: null, num: [], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.8, 4.2] };
    },
  },
  shark: {
    build(B, L) {
      const P = L.paint, W = KV_WHITE;
      const r = (z) => 11.5 * Math.sin((Math.PI * (z + 36)) / 76) ** 0.55;
      B.tubeZ(-36, 39, 0, 13, r, (x, y, z) => (y < 10 ? W : P), { tag: 'paint', sy: 0.88 });
      for (const v of B.s.m.values()) if (v.c === W) v.tag = 'belly';
      B.cut((x, y, z) => Math.abs(x) <= 6 && y >= 18 && z >= -10 && z <= 6);
      B.rbox(-6, 11, -10, 6, 15, 3, KV_SEAT, { mat: 4, p: 4 });
      B.rbox(-6, 15, -12, 6, 22, -9, KV_SEAT, { mat: 4, p: 3 });
      for (let k = 0; k <= 13; k++) { const top = 23 + Math.round((13 - k) * 0.95); for (let y = 20; y <= top; y++) for (let x = -1; x <= 1; x++) B.put(x, y, -12 - k + Math.round((y - 20) * 0.45), P, 0, 'paint'); }   // Rückenflosse
      B.both((sg) => { for (let k = 0; k <= 8; k++) for (let z = 2 - k; z <= 8 - k; z++) B.put(sg * (11 + k), 9 - Math.round(k * 0.3), z, P, 0, 'paint'); });   // Brustflossen
      for (let k = 0; k <= 10; k++) for (let x = -1; x <= 1; x++) { B.put(x, 14 + k, -36 - Math.round(k * 0.5), P, 0, 'paint'); B.put(x, 14 - Math.round(k * 0.6), -36 - Math.round(k * 0.5), P, 0, 'paint'); }   // Schwanz
      B.stamp('+z', 0, 9, 7, (du, dv) => { const m = Math.abs(dv + 1 - 0.06 * du * du) <= 1.4 && Math.abs(du) <= 6; if (!m) return null; return Math.abs(dv + 1 - 0.06 * du * du) > 0.7 && (du + 99) % 2 ? [KV_WHITE, 1] : [0x7f1d1d, 4]; });   // Maul mit Zähnen
      B.both((sg) => B.stamp(sg > 0 ? '+x' : '-x', 28, 16, 2, (du, dv) => (du * du + dv * dv <= 2.5 ? (du === (sg > 0 ? -1 : 1) && dv === 1 ? [KV_WHITE, 1] : [0x111827, 1]) : null)));   // Augen
      B.both((sg) => { for (const zz of [18, 21, 24]) B.stamp(sg > 0 ? '+x' : '-x', zz, 13, 3, (du, dv) => (du === 0 && Math.abs(dv) <= 2 ? [vxShade(P, -0.35), 0] : null)); });   // Kiemen
      return { wheels: [[16, 21, 7.6, 1], [-16, 21, 7.6, 1], [16, -20, 7.8, 0], [-16, -20, 7.8, 0]], wheelW: 0.32, seat: { y: 15, z: -4 }, steer: { y: 22, z: 6 },
        pipes: [[6, 7, -31], [-6, 7, -31]], wing: null, num: [['+x', 4, 12], ['-x', 4, 12]], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.6, 4.6] };
    },
  },
  bathtub: {
    build(B, L) {
      const P = L.paint;
      B.rbox(-13, 5, -26, 13, 18, 24, P, { tag: 'paint', p: 4 });
      B.cut((x, y, z) => Math.abs(x) <= 10 && y >= 9 && z >= -23 && z <= 21);
      for (const v of B.s.m.values()) if ((Math.abs(v.x) <= 11 && v.y >= 8 && v.z >= -24 && v.z <= 22) || v.y >= 18) { v.c = KV_WHITE; v.mat = 1; v.tag = 'tub'; }
      B.rbox(-10, 9, -23, 10, 12, 21, 0x7dd3fc, { mat: 1, p: 6 });                          // Wasser
      for (const [x, z, rr] of [[-7, 14, 2.6], [7, 10, 2.2], [6, -18, 2.4], [-6, -16, 2], [0, 18, 1.8]]) B.ell(x, 13, z, rr, 1.6, rr, KV_WHITE, { mat: 1 });   // Schaum
      B.bar([0, 18, -25], [0, 26, -25], 1, KV_CHROME, { mat: 3 }); B.bar([0, 26, -25], [0, 26, -20], 1, KV_CHROME, { mat: 3 });   // Wasserhahn
      B.both((sg) => B.ell(sg * 3, 24, -24, 1.4, 1.4, 1.4, sg > 0 ? 0xef4444 : 0x3b82f6, { mat: 1 }));
      B.ell(8, 21, 19, 3.2, 2.6, 3.2, 0xfacc15, { mat: 1 }); B.ell(8, 25, 21, 2.2, 2.2, 2.2, 0xfacc15, { mat: 1 }); B.ell(8, 24.5, 23.5, 1.2, 0.8, 1.4, 0xf97316, { mat: 1 });   // Quietscheente
      B.put(9, 26, 22, 0x111827, 1); B.put(7, 26, 22, 0x111827, 1);
      B.both((sg) => { for (const z of [-21, 19]) B.ell(sg * 11, 3.5, z, 2.2, 2.6, 2.2, KV_GOLD, { mat: 3 }); });   // Löwenfüsse
      return { wheels: [[16, 17, 7, 1], [-16, 17, 7, 1], [16, -19, 7, 0], [-16, -19, 7, 0]], wheelW: 0.3, seat: { y: 11, z: -8 }, steer: { y: 20, z: 4 },
        pipes: null, flamePts: [[6, 10, -27], [-6, 10, -27]], wing: { y: 24, z: -27, w: 12 }, num: [['+x', 0, 12], ['-x', 0, 12]], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.8, 4.4] };
    },
  },
  ufo: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      B.ell(0, 11, 0, 25, 5, 25, (x, y) => (y < 10 ? vxShade(P, -0.35) : P), { tag: 'paint' });
      B.ell(0, 15, 0, 13, 6, 13, P2, { tag: 'paint2' });
      B.cut((x, y, z) => x * x + z * z < 80 && y >= 16);
      B.rbox(-7, 13, -8, 7, 16, 4, KV_SEAT, { mat: 4, p: 4 });
      const cols = [0x22d3ee, 0xf472b6, 0xfacc15];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, x = Math.round(Math.cos(a) * 24), z = Math.round(Math.sin(a) * 24); B.rbox(x - 1, 10, z - 1, x + 1, 12, z + 1, cols[i % 3], { mat: 2, p: 3 }); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.bar([Math.cos(a) * 8, 8, Math.sin(a) * 8], [Math.cos(a) * 11, 3, Math.sin(a) * 11], 1, KV_CHROME, { mat: 3 }); }   // Landebeine
      return { wheels: [[12, 12, 5.6, 1], [-12, 12, 5.6, 1], [12, -12, 5.6, 0], [-12, -12, 5.6, 0]], wheelW: 0.24, seat: { y: 15, z: -3 }, steer: { y: 22, z: 6 },
        pipes: null, flamePts: [[7, 11, -25], [-7, 11, -25]], wing: null, num: [], lights: { front: [99, 0], back: [-99, 0] }, glow: [3.4, 3.4], dome: { y: 17, r: 0.66 } };
    },
  },
  hotdog: {
    build(B, L) {
      const bun = (x, y) => (y > 16 ? 0xb8692c : 0xdc9a52), keepBun = (x, y, z) => !(Math.abs(x) < 4 && y > 11);
      B.tubeZ(-29, 29, 0, 11, (z) => 11 * Math.sqrt(Math.max(0, 1 - (z / 30) ** 4)), bun, { tag: 'bun', keep: keepBun });
      B.tubeZ(-36, 36, 0, 14, (z) => 5.2 * Math.sqrt(Math.max(0, 1 - (z / 37) ** 6)), 0xb5452b, { tag: 'sausage', mat: 1 });
      B.cut((x, y, z) => y >= 13 && z >= -15 && z <= 3 && Math.abs(x) <= 5);
      const zig = (z) => Math.round(2.5 * Math.sin(z * 0.55));
      for (let z = 5; z <= 33; z++) { B.put(zig(z), 19, z, 0xfacc15, 1); B.put(zig(z) + 1, 19, z, 0xfacc15, 1); }   // Senf
      for (let z = -33; z <= -17; z++) { B.put(-zig(z), 19, z, 0xdc2626, 1); B.put(-zig(z) + 1, 19, z, 0xdc2626, 1); }   // Ketchup
      B.rbox(-4, 9, -15, 4, 13, 1, KV_SEAT, { mat: 4, p: 4 });
      return { wheels: [[16, 20, 7, 1], [-16, 20, 7, 1], [16, -20, 7, 0], [-16, -20, 7, 0]], wheelW: 0.32, seat: { y: 13, z: -7 }, steer: { y: 21, z: 5 },
        pipes: [[6, 5, -30], [-6, 5, -30]], wing: { y: 26, z: -24, w: 12 }, num: [['+x', 8, 11], ['-x', 8, 11]], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.6, 4.6], fixed: true };
    },
  },
  duck: {
    build(B, L) {
      const P = L.paint;
      B.ell(0, 12, -3, 14, 10, 25, P, { tag: 'paint', keep: (x, y) => y >= 4 });
      B.ell(0, 18, -27, 7, 7, 5, P, { tag: 'paint' });                                     // Schwanz
      B.ell(0, 27, 18, 9.5, 9, 9, P, { tag: 'paint' });                                    // Kopf
      B.ell(0, 25, 27.5, 5.5, 2.4, 5, 0xf97316, { mat: 1 });                                 // Schnabel
      B.both((sg) => { B.ell(sg * 12.5, 13, -6, 2.6, 6, 11, vxShade(P, -0.12), { tag: 'paint' }); B.stamp(sg > 0 ? '+x' : '-x', 21, 29, 2, (du, dv) => (du * du + dv * dv <= 2.5 ? (dv === 1 && du === (sg > 0 ? -1 : 1) ? [KV_WHITE, 1] : [0x111827, 1]) : null)); });
      B.cut((x, y, z) => Math.abs(x) <= 8 && y >= 16 && z >= -15 && z <= 6);
      B.rbox(-8, 8, -15, 8, 16, 2, KV_SEAT, { mat: 4, p: 4 });
      return { wheels: [[15, 16, 7.4, 1], [-15, 16, 7.4, 1], [15, -20, 7.4, 0], [-15, -20, 7.4, 0]], wheelW: 0.32, seat: { y: 16, z: -6 }, steer: { y: 23, z: 4 },
        pipes: [[5, 6, -28], [-5, 6, -28]], wing: null, num: [['+x', -14, 14], ['-x', -14, 14]], lights: { front: [99, 0], back: [-99, 0] }, glow: [2.6, 4.4] };
    },
  },
  monster: {
    build(B, L) {
      const P = L.paint, P2 = L.paint2;
      B.rbox(-12, 12, -30, 12, 14, 30, KV_DARK, { mat: 1, p: 6 });                          // Rahmen
      B.rbox(-14, 15, 8, 14, 24, 33, P, { tag: 'paint', p: 3.5 });                         // Motorhaube
      B.rbox(-14, 15, -12, 14, 23, 9, P, { tag: 'paint', p: 4 });                          // Fahrerraum
      B.rbox(-14, 15, -32, 14, 22, -12, P, { tag: 'paint', p: 4 });                        // Ladefläche
      B.cut((x, y, z) => Math.abs(x) <= 11 && y >= 18 && ((z >= -10 && z <= 7) || (z >= -30 && z <= -14)));
      B.rbox(-11, 18, -10, 11, 21, 3, KV_SEAT, { mat: 4, p: 4 });
      B.both((sg) => { for (const wz of [21, -21]) for (let z = wz - 13; z <= wz + 13; z++) { const yy = Math.round(25 + Math.sqrt(Math.max(0, 169 - (z - wz) ** 2)) * 0.35); B.rbox(sg > 0 ? 15 : -26, yy, z, sg > 0 ? 26 : -15, yy + 1, z, P2, { tag: 'paint2', p: 6 }); } });
      const bar = (a, b) => B.bar(a, b, 1.2, KV_DARK);
      B.both((sg) => { bar([sg * 12, 22, -11], [sg * 11, 39, -11]); bar([sg * 12, 22, 7], [sg * 10, 36, 1]); bar([sg * 10, 36, 1], [sg * 11, 39, -11]); });
      bar([-11, 39, -11], [11, 39, -11]);
      for (let x = -8; x <= 8; x += 2) B.rbox(x, 40, -12, x + 1, 41, -10, 0xfff4cc, { mat: 2, p: 4 });   // Lichtleiste
      B.rbox(-12, 17, 33, 12, 21, 34, KV_CHROME, { mat: 3, p: 6 });
      return { wheels: [[22, 21, 12, 1], [-22, 21, 12, 1], [22, -21, 12, 0], [-22, -21, 12, 0]], wheelW: 0.5, seat: { y: 21, z: -5 }, steer: { y: 29, z: 4 },
        pipes: [[9, 20, -34], [-9, 20, -34]], wing: { y: 42, z: -12, w: 13 }, num: [['+x', 20, 19], ['-x', 20, 19]], lights: { front: [35, 19], back: [-33, 19] }, glow: [3.4, 4.8] };
    },
  },
};

/* ---------------- Fahrerin/Fahrer ---------------- */
/** Avatar-Look fürs Kart: ohne Gegenstand, Haustier, Rucksack und Effekt */
function kvDriverLook(look) {
  const d = { ...look };
  delete d.hand; delete d.pet; delete d.back; delete d.effect; delete d.bag;
  return d;
}
/** zufällige Figur für die Computer-Fahrer (nur Gratis-Teile) */
function kvBotLook(i) {
  const pick = (a, k) => a[Math.floor(vxRand(i, k, 3, 11) * a.length)];
  const skins = [0xfce3d3, 0xf2c9a5, 0xe9b48c, 0xd59a6c, 0xb97a4f, 0x93593a, 0x6e4129];
  const hairs = ['spiky', 'bob', 'ponytail', 'buzz', 'afro', 'wavy', 'pigtails', 'buns', 'long', 'bowl'];
  const hairC = [0x2b1d14, 0x7a4422, 0xe8c26a, 0xb4472b, 0x231d2b, 0xa0522d, 0xf3e3b5];
  const cloth = [0x2453d6, 0x14a39a, 0xffbe2e, 0xe2483d, 0x8b5cf6, 0x22c55e, 0xf97316, 0xe8478f];
  return {
    skin: pick(skins, 1), face: { eyes: pick(['round', 'happy', 'wide'], 2), eyeC: pick([0x6b4423, 0x3b82f6, 0x16a34a, 0x3b2416], 3), mouth: pick(['smile', 'grin'], 4), blush: vxRand(i, 5, 1) < 0.4 },
    hair: { id: pick(hairs, 6), c: pick(hairC, 7) }, top: { id: pick(['tshirt', 'hoodie', 'sweater'], 8), c: pick(cloth, 9), trim: 0xffffff, under: 0xf4f4f6 },
    bottom: { id: 'jeans', c: 0x3e63b5 }, shoes: { id: 'sneakers', c: 0xffffff, c2: pick(cloth, 10) },
  };
}

/* ---------------- Kart zusammenbauen ---------------- */
/**
 * look: Garage-Optik (body, paint, paint2, finish, pattern, rims, wing, exhaust, flames, glow, helmet, visor, num)
 * driver: Avatar-Bauplan (wie vxFigure) oder null (leerer Sitz)
 * Liefert { g, body, wheels, flames, glow, fig, tick(t), setSteer(s), setMood(m), look, dispose() }
 */
function kartVoxModel(T, look, driver = null, { lite = false, fig: figIn = null } = {}) {
  const L = { ...KART_LOOK0, body: 'formula', ...(look || {}) };
  const shape = KART_BODIES[L.body] || KART_BODIES.formula;
  const B = kvBuilder();
  const spec = shape.build(B, L);
  kvWing(B, L, spec.wing);
  const pipes = spec.pipes ? kvPipes(B, L, spec.pipes) : [];
  kvPattern(B.s, L);
  for (const [dir, cu, cv, R = 5] of spec.num || []) B.stamp(dir, cu, cv, 6, kvNumber(L.num, L.paint2 === L.paint ? KV_DARK : L.paint2));
  if (spec.lights) {
    const [zf, yf] = spec.lights.front, [zb, yb] = spec.lights.back;
    if (zf < 99) B.both((sg) => B.stamp('+z', sg * 4, yf, 2, (du, dv) => (du * du + dv * dv <= 2.5 ? [0xfff4cc, 2] : null)));
    if (zb > -99) B.both((sg) => B.stamp('-z', sg * 6, yb, 2, (du, dv) => (Math.abs(du) <= 2 && Math.abs(dv) <= 0 ? [0xff2a2a, 2] : null)));
  }
  const U = KV.U, k = U / VOX.S;
  const g = new T.Group();
  const body = new T.Group(); g.add(body);
  const own = [];
  // Computer-Fahrer (lite): halbe Auflösung – etwa ein Viertel der Dreiecke
  const { geo } = vxSmoothGeometry(T, lite ? kvDown(B.s) : B.s, { iter: lite ? 3 : spec.iter ?? 5 });
  own.push(geo);
  const mesh = new T.Mesh(geo, kvMats(T, L.finish));
  mesh.scale.setScalar(lite ? k * 2 : k); mesh.position.set(lite ? -U : -U / 2, 0, lite ? -U : -U / 2); mesh.castShadow = true; mesh.receiveShadow = true;
  body.add(mesh);
  // Glaskuppel (UFO)
  if (spec.dome) {
    const dm = new T.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false });
    const dome = new T.Mesh(new T.SphereGeometry(spec.dome.r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), dm); dome.position.y = spec.dome.y * U; dome.renderOrder = 3;
    own.push(dm, dome.geometry); body.add(dome);
  }
  // Lenkrad
  let steerWheel = null;
  if (spec.steer) {
    steerWheel = new T.Group(); steerWheel.position.set(0, spec.steer.y * U, spec.steer.z * U); steerWheel.rotation.x = -1.05;
    const sm = new T.Mesh(new T.TorusGeometry(0.15, 0.032, 10, 28), KV_MAT.glossy.clone()); sm.material.vertexColors = false; sm.material.color.set(0x1f2430); own.push(sm.geometry, sm.material);
    const hub = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.04, 12), sm.material); hub.rotation.x = Math.PI / 2; own.push(hub.geometry);
    steerWheel.add(sm, hub); body.add(steerWheel);
  }
  // Räder
  const wheels = [];
  for (const [x, z, r, front] of spec.wheels) {
    const R = r * U;
    const steer = new T.Group(); steer.position.set(x * U, R, z * U); g.add(steer);
    const spin = new T.Group(); steer.add(spin);
    const wm = new T.Mesh(kvWheelGeo(T, spec.wheelStyle || L.rims, Math.round(R * 100) / 100, spec.wheelW || 0.36, lite), kvMats(T, 'gloss'));
    wm.scale.setScalar((lite ? KV.UW * 1.6 : KV.UW) / VOX.S); wm.castShadow = true;
    if (x < 0) wm.rotation.y = Math.PI;   // Felge nach aussen
    spin.add(wm);
    wheels.push({ steer, spin, front: !!front, r: R });
  }
  // Fahrerin/Fahrer
  let fig = figIn;
  if ((driver || figIn) && typeof vxFigure === 'function') {
    try {
      if (!fig) fig = vxFigure(T, kvDriverLook(driver), { lite });
      fig.setAnim('drive');
      const seat = new T.Group();
      const s = KV.DRIVER;
      seat.position.set(0, spec.seat.y * U - VOX.HIP * 2 * VOX.S * s + 0.1 * s, spec.seat.z * U);
      seat.scale.setScalar(s);
      seat.add(fig.root); body.add(seat);
      fig.root.traverse((o) => { if (o.isMesh) o.castShadow = !lite; });
      for (let i = 0; i < 20; i++) fig.update(0.05);
    } catch (e) { console.warn('Figur im Kart', e); fig = null; }
  }
  // Turbo-Flammen
  const F = KART_FLAMES[L.flames] || KART_FLAMES.classic;
  const flameTex = glowTex(F[0], F[1]); own.push(flameTex);
  const flameMat = new T.SpriteMaterial({ map: flameTex, color: F[2], transparent: true, depthWrite: false, blending: T.AdditiveBlending }); own.push(flameMat);
  const big = spec.bigFlame || 1;
  const flames = (spec.flamePts || pipes.slice(0, 4)).map(([x, y, z]) => { const sp = new T.Sprite(flameMat); sp.position.set(x * U, y * U, (z - 2) * U); sp.scale.set(0.01, 0.01, 1); sp.userData.k = big; g.add(sp); return sp; });
  // Unterboden-Licht
  let glow = null;
  if (KART_GLOWS[L.glow]) {
    if (!KV_MAT.glowTex) KV_MAT.glowTex = glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const gm = new T.MeshBasicMaterial({ map: KV_MAT.glowTex, color: KART_GLOWS[L.glow], transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const [gw, gl] = spec.glow || [2.8, 4.4];
    glow = new T.Mesh(new T.PlaneGeometry(gw, gl), gm); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; glow.renderOrder = 2;
    own.push(gm, glow.geometry); g.add(glow);
  }
  const rainbow = L.flames === 'rainbow', glowRainbow = L.glow === 'rainbow';
  let steerNow = 0;
  return {
    g, body, wheels, flames, glow, fig, look: L, spec,
    tick(t, dt = 0.016) {
      if (rainbow) flameMat.color.setHSL((t * 0.6) % 1, 1, 0.6);
      if (glow) { glow.material.opacity = 0.7 + Math.sin(t * 3) * 0.15; if (glowRainbow) glow.material.color.setHSL((t * 0.25) % 1, 1, 0.55); }
      if (steerWheel) steerWheel.rotation.z = -steerNow * 0.9;
      fig?.update(dt);
    },
    setSteer(s) { steerNow = Math.max(-1, Math.min(1, s)); fig?.setSteer(steerNow); },
    setMood(m) { fig?.setMood(m); },
    voxel: true,
    dispose() { own.forEach((o) => o.dispose?.()); if (fig && fig !== figIn) fig.dispose(); else if (fig) fig.root.parent?.remove(fig.root); },
  };
}

/* ---------------- Kulisse im Stil der Avatare ----------------
   Bäume, Büsche, Steine, Hütten, Süssigkeiten … als weich gerundete Voxel. Je Art einmal gebaut und dann
   viele Male gezeigt (InstancedMesh). Grund in der Mitte bei y = 0; u = Kantenlänge eines Voxels in Metern. */
const KV_PROPS = new Map();
function kvPropMats(T) {
  kvMats(T);
  if (!KV_MAT.props) KV_MAT.props = [KV_MAT.matte, KV_MAT.glossy, KV_MAT.glow, KV_MAT.metal];
  return KV_MAT.props;
}
const kvJit = (c, x, y, z, amt = 0.08, seed = 1) => vxShade(c, (vxRand(x, y, z, seed) - 0.5) * 2 * amt);
const KV_PROP_DEFS = {
  pine: { u: 0.36, build(B, snow) {
    B.rbox(-1, 0, -1, 0, 4, 0, 0x6b4423, { mat: 0, p: 6 });
    const tiers = [[2, 8, 5.4], [6, 12, 4.2], [10, 16, 3]];
    for (const [y0, y1, r0] of tiers) for (let y = y0; y <= y1; y++) {
      const r = r0 * (1 - (y - y0) / (y1 - y0 + 1)) + 0.6;
      for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r); x++) for (let z = -Math.ceil(r) - 1; z <= Math.ceil(r); z++) if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= r * r) B.put(x, y, z, kvJit(0x2f6b3a, x, y, z, 0.12), 0);
    }
    for (const v of B.s.m.values()) { if (v.c === 0x6b4423) continue; if (!B.s.has(v.x, v.y + 1, v.z)) v.c = snow ? 0xf4f8fc : vxShade(v.c, 0.12); }
  } },
  oak: { u: 0.4, build(B, autumn) {
    B.rbox(-1, 0, -1, 0, 7, 0, 0x6b4423, { p: 6 });
    B.bar([0, 5, 0], [3, 8, 1], 0.7, 0x6b4423, { mat: 0 });
    const g = autumn ? [0xd97706, 0xb45309, 0xea580c] : [0x3f7d2c, 0x4d8a33, 0x5d9b3a];
    for (const [x, y, z, r] of [[0, 10, 0, 4.6], [3, 9, 1, 3.6], [-3, 9, -1, 3.4], [0, 9, 3, 3.4], [1, 12, -2, 3.2]]) B.ell(x, y, z, r, r * 0.85, r, (xx, yy, zz) => kvJit(g[Math.floor(vxRand(xx, yy, zz, 3) * 3)], xx, yy, zz, 0.06));
    for (const v of B.s.m.values()) if (v.c !== 0x6b4423 && !B.s.has(v.x, v.y + 1, v.z)) v.c = vxShade(v.c, 0.14);
  } },
  bush: { u: 0.3, build(B) {
    for (const [x, y, z, r] of [[0, 2, 0, 2.8], [2, 2, 1, 2.2], [-2, 2, -1, 2.1], [0, 4, 0, 2]]) B.ell(x, y, z, r, r * 0.9, r, (xx, yy, zz) => kvJit(0x3f8f3a, xx, yy, zz, 0.1));
    for (const [x, y, z] of [[2, 4, 3], [-3, 3, 1], [0, 5, 2]]) B.put(x, y, z, 0xf472b6, 1);
  } },
  mushroom: { u: 0.13, build(B) {
    B.rbox(-2, 0, -2, 2, 6, 2, 0xf5efe0, { p: 3 });
    B.ell(0, 7, 0, 6.5, 3.6, 6.5, (x, y, z) => ((x * 7 + z * 13 + y * 3) % 9 === 0 || vxRand(x, y, z, 4) < 0.12 ? 0xffffff : 0xd7263d), { mat: 1, keep: (x, y) => y >= 6 });
  } },
  cabin: { u: 0.32, build(B) {
    B.rbox(-9, 0, -7, 9, 9, 7, (x, y) => (y % 2 ? 0x8b5a2b : 0x7a4b22), { p: 8 });
    B.stamp('+z', 0, 3, 2, (du, dv) => (Math.abs(du) <= 1 && dv >= -3 && dv <= 1 ? 0x4a2c14 : null));
    B.both((sg) => B.stamp('+z', sg * 5, 5, 2, (du, dv) => (Math.abs(du) <= 1 && Math.abs(dv) <= 1 ? [0xffe08a, 2] : null)));
    for (let y = 10; y <= 16; y++) { const w = 16 - y; B.rbox(-w - 1, y, -8, w + 1, y, 8, 0x8f1d1d, { p: 8 }); }
    B.rbox(4, 12, -3, 6, 17, -1, 0x6b6b6b, { p: 6 });
  } },
  rock: { u: 0.3, build(B, mars) {
    const base = mars ? 0x8a3b1f : 0x7b7f86;
    B.ell(0, 2, 0, 4.2, 3.2, 3.6, (x, y, z) => kvJit(base, x, y, z, 0.12, 9), { keep: (x, y, z) => vxRand(x, y, z, 2) > 0.08 || Math.abs(x) < 3 });
    B.ell(2.5, 3.5, 1, 2.4, 2, 2.4, (x, y, z) => kvJit(base, x, y, z, 0.12, 9));
    for (const v of B.s.m.values()) if (!B.s.has(v.x, v.y + 1, v.z)) v.c = vxShade(v.c, 0.12);
  } },
  palm: { u: 0.3, build(B) {
    for (let y = 0; y <= 26; y++) { const x = Math.round(Math.sin(y / 16) * 3); B.rbox(x - 1, y, -1, x, y, 0, y % 3 ? 0x9b7a4f : 0x7c5d38, { p: 6 }); }
    const tx = Math.round(Math.sin(26 / 16) * 3);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      for (let k = 0; k <= 11; k++) { const x = tx + Math.cos(a) * k, z = Math.sin(a) * k, y = 27 + k * 0.5 - (k * k) * 0.09; B.ell(x, y, z, 1.3 - k * 0.05, 0.6, 1.3 - k * 0.05, kvJit(0x2f8f3a, Math.round(x), Math.round(y), Math.round(z), 0.1)); }
    }
    for (const [dx, dz] of [[1, 1], [-1, 1], [0, -1]]) B.ell(tx + dx, 25, dz, 1.1, 1.1, 1.1, 0x6b4423);
  } },
  umbrella: { u: 0.12, build(B) {
    B.rbox(0, 0, 0, 0, 20, 0, 0xf5f5f5, { p: 6 });
    const cols = [0xef4444, 0xffffff, 0x0ea5e9, 0xffffff, 0xf59e0b, 0xffffff];
    for (let x = -13; x <= 13; x++) for (let z = -13; z <= 13; z++) { const d = Math.hypot(x, z); if (d > 13) continue; const y = Math.round(24 - d * 0.32); const a = Math.atan2(z, x); B.put(x, y, z, cols[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 6], 0); }
  } },
  hut: { u: 0.32, build(B) {
    B.rbox(-7, 0, -6, 7, 8, 6, 0xf5e6c8, { p: 8 });
    B.stamp('+z', 0, 3, 2, (du, dv) => (Math.abs(du) <= 1 && dv >= -3 && dv <= 1 ? 0x0ea5e9 : null));
    for (let y = 9; y <= 14; y++) { const w = 14 - y + 1; B.rbox(-w - 1, y, -w, w + 1, y, w, (x, yy, z) => ((x + z + 99) % 4 < 2 ? 0xc2410c : 0xd97706), { p: 8 }); }
  } },
  snowman: { u: 0.12, build(B) {
    B.ell(0, 8, 0, 8.5, 8, 8.5, 0xffffff); B.ell(0, 20, 0, 6.5, 6, 6.5, 0xffffff); B.ell(0, 30, 0, 4.8, 4.6, 4.8, 0xffffff);
    B.rbox(-4, 34, -4, 4, 35, 4, 0x111827, { p: 2.5 }); B.rbox(-3, 35, -3, 3, 40, 3, 0x111827, { p: 4 });
    B.ell(0, 30, 5, 0.9, 0.9, 3, 0xf97316, { mat: 1 });
    B.both((sg) => B.put(sg * 2, 32, 4, 0x111827, 1));
    for (const y of [17, 21, 24]) B.stamp('+z', 0, y, 0, () => [0x111827, 1]);
    for (let a = 0; a < 26; a++) { const t = (a / 26) * Math.PI * 2; B.put(Math.round(Math.cos(t) * 5.5), 26, Math.round(Math.sin(t) * 5.5), 0xdc2626, 0); }
    B.both((sg) => B.bar([sg * 6, 21, 0], [sg * 12, 26, 0], 0.5, 0x6b4423, { mat: 0 }));
  } },
  igloo: { u: 0.3, build(B) {
    B.ell(0, 0, 0, 12, 10, 12, (x, y, z) => ((y % 4 === 0) || ((x + z + (Math.floor(y / 4) % 2) * 3) % 7 === 0) ? 0xc7d7ea : 0xf8fbff), { keep: (x, y, z) => y >= 0 && x * x + (y * 1.2) ** 2 + z * z > 64 });
    B.rbox(-3, 0, 9, 3, 5, 15, 0xf8fbff, { p: 3 }); B.cut((x, y, z) => Math.abs(x) <= 1 && y <= 3 && z >= 8);
  } },
  crystal: { u: 0.15, build(B) {
    for (const [x, z, h, r, lean] of [[0, 0, 22, 3, 0], [4, 2, 14, 2.2, 0.25], [-3, 3, 12, 2, -0.3], [1, -4, 10, 1.8, 0.2]]) {
      for (let y = 0; y <= h; y++) { const rr = y > h - r * 2 ? r * (h - y) / (r * 2) : r; const cx = x + y * lean; B.ell(cx, y, z, Math.max(0.5, rr), 0.6, Math.max(0.5, rr), y > h - 3 ? 0xe0f2fe : kvJit(0x7dd3fc, Math.round(cx), y, z, 0.1), { mat: y > h - 3 ? 2 : 1 }); }
    }
  } },
  lollipop: { u: 0.15, build(B, pink) {
    B.rbox(0, 0, 0, 0, 46, 0, 0xffffff, { p: 6 });
    const c2 = pink ? 0xf472b6 : 0x60a5fa;
    for (let x = -15; x <= 15; x++) for (let y = -15; y <= 15; y++) { const d = Math.hypot(x, y); if (d > 14.5) continue; const a = Math.atan2(y, x); const sw = (d / 3 + a / (Math.PI * 2) * 2 + 10) % 2 < 1; for (let z = -2; z <= 2; z++) if (Math.abs(z) < 2.5 - (d / 14.5) ** 4 * 1.5) B.put(x, 52 + y, z, sw ? c2 : 0xffffff, 1); }
  } },
  cane: { u: 0.13, build(B) {
    const col = (i) => (Math.floor(i / 3) % 2 ? 0xef4444 : 0xffffff);
    for (let y = 0; y <= 40; y++) B.ell(0, y, 0, 2, 0.6, 2, (x, yy, z) => col(yy + Math.round(Math.atan2(z, x) * 2)), { mat: 1 });
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI; const x = 6 - Math.cos(a) * 6, y = 40 + Math.sin(a) * 6; B.ell(x, y, 0, 2, 2, 2, col(41 + i), { mat: 1 }); }
  } },
  cupcake: { u: 0.15, build(B, k) {
    const wrap = [0xf472b6, 0x60a5fa, 0xa78bfa, 0xfacc15][k % 4], cream = [0xfef3c7, 0xfbcfe8, 0xe0e7ff, 0xffffff][k % 4];
    for (let y = 0; y <= 10; y++) { const r = 7 + y * 0.35; for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) { const d = Math.hypot(x, z); if (d <= r) B.put(x, y, z, Math.floor((Math.atan2(z, x) + 4) * 4) % 2 ? wrap : vxShade(wrap, 0.25), 0); } }
    for (const [y, r] of [[13, 9.5], [17, 7.5], [20.5, 5]]) B.ell(0, y, 0, r, 3.2, r, cream, { mat: 1 });
    B.ell(0, 25, 0, 2.2, 2.2, 2.2, 0xdc2626, { mat: 1 });
    for (let i = 0; i < 40; i++) { const a = vxRand(i, 1, 1, 3) * Math.PI * 2, r = 3 + vxRand(i, 2, 1, 3) * 6; B.stamp('+y', Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 0, () => [[0xef4444, 0x22c55e, 0x3b82f6, 0xfacc15][i % 4], 1]); }
  } },
  donut: { u: 0.12, build(B, k) {
    const ice = [0xf9a8d4, 0xfde68a, 0xc4b5fd, 0x92400e][k % 4];
    for (let x = -16; x <= 16; x++) for (let y = -6; y <= 6; y++) for (let z = -16; z <= 16; z++) { const d = Math.hypot(x, z) - 10; if (d * d + y * y > 36) continue; B.put(x, y + 6, z, y >= 1 ? ice : 0xd9a066, y >= 1 ? 1 : 0); }
    for (const v of B.s.m.values()) if (v.c === ice && !B.s.has(v.x, v.y + 1, v.z) && vxRand(v.x, v.y, v.z, 5) < 0.12) v.c = [0xffffff, 0xef4444, 0x22c55e, 0x3b82f6][Math.floor(vxRand(v.x, 1, v.z, 6) * 4)];
  } },
  gumdrop: { u: 0.15, build(B, k) {
    const c = [0xef4444, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316][k % 5];
    B.ell(0, 0, 0, 5, 6, 5, (x, y, z) => (vxRand(x, y, z, 7) < 0.1 ? vxShade(c, 0.5) : c), { mat: 1, keep: (x, y) => y >= 0 });
  } },
  surf: { u: 0.1, build(B, k) {
    const c = [0xf97316, 0x22d3ee, 0xf472b6, 0xfacc15][k % 4];
    for (let y = 0; y <= 24; y++) { const w = 3.5 * Math.sqrt(Math.max(0, 1 - ((y - 12) / 12.5) ** 2)); for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) if (Math.abs(x) <= w + 0.3) { B.put(x, y, 0, Math.abs(x) <= 0.5 ? 0xffffff : c, 1); B.put(x, y, 1, Math.abs(x) <= 0.5 ? 0xffffff : c, 1); } }
  } },
};
/** halbe Auflösung: je 2×2×2 Voxel werden zu einem (für viele gleiche Dinge – etwa ein Viertel der Dreiecke) */
function kvDown(set) {
  const cells = new Map();
  for (const v of set.m.values()) {
    const x = Math.floor(v.x / 2), y = Math.floor(v.y / 2), z = Math.floor(v.z / 2), k = vxK(x, y, z);
    let c = cells.get(k);
    if (!c) { c = { x, y, z, n: 0, cols: new Map() }; cells.set(k, c); }
    c.n++;
    const ck = `${v.c}|${v.mat}`; c.cols.set(ck, (c.cols.get(ck) || 0) + 1);
  }
  const out = new VoxSet();
  for (const c of cells.values()) {
    if (c.n < 3) continue;
    let best = null, bn = 0;
    for (const [ck, n] of c.cols) if (n > bn) { bn = n; best = ck; }
    const [col, mat] = best.split('|').map(Number);
    out.set(c.x, c.y, c.z, col, mat);
  }
  return out;
}
/** Geometrie einer Kulissen-Art (in Metern, Grund bei y = 0), mit Farben je Ecke. lod 1: halbe Auflösung */
function kvProp(T, kind, variant = 0, lod = 0) {
  const key = `${kind}|${variant}|${lod}`;
  if (KV_PROPS.has(key)) return KV_PROPS.get(key);
  const def = KV_PROP_DEFS[kind];
  const B = kvBuilder();
  def.build(B, variant);
  const set = lod ? kvDown(B.s) : B.s;
  const u = lod ? def.u * 2 : def.u;
  const { geo } = vxSmoothGeometry(T, set, { iter: lod ? 3 : def.iter ?? 4 });
  const k = u / VOX.S;
  geo.scale(k, k, k); geo.translate(-u / 2, 0, -u / 2);
  geo.computeBoundingSphere();
  KV_PROPS.set(key, geo);
  return geo;
}
