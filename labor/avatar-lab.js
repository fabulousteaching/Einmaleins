/* Teilmal – Avatar-Labor (Prototyp, Phase 3)
 * Eine Figur mit Auswahl von Gesicht, Frisur, Kleidung, Farben, Zubehör und Handgegenständen.
 * Drehen mit Ziehen, Zoomen mit zwei Fingern oder Mausrad. Noch ohne Shop und Münzen (kommt in Phase 5).
 * Gespeichert wird hier nur im Browser (localStorage).
 */
import * as T from '../js/vendor/three.module.min.js';

/* ---------------- Auswahl ---------------- */
const SKINS = [0xfce3d3, 0xf6cfb0, 0xe9b48c, 0xd59a6c, 0xb97a4f, 0x93593a, 0x6e4129, 0x4b2b1c];
const HAIRC = [0x7a4422, 0x3b2416, 0x231d2b, 0xe8c26a, 0xb4472b, 0xf28dbb, 0x8b5cf6, 0x4ed6b4, 0xb9b6c3];
const EYEC = [0x6b4423, 0x3b82f6, 0x16a34a, 0x64748b, 0x7c3aed, 0x0f766e];
const CLOTH = [0x2453d6, 0xe8478f, 0x14a39a, 0xffbe2e, 0xe2483d, 0x3daa5b, 0x26222e, 0xf8f4f6, 0x8b5cf6, 0xfbcfe8, 0xff6b4a];
const TRIM = [0xf5c518, 0xffffff, 0x8b5cf6, 0x22d3ee, 0xf472b6, 0x1f2430, 0xe2483d, 0x3daa5b];
const PANTS = [0x24232b, 0x3e63b5, 0x26305e, 0xb59b6a, 0xf9a8d4, 0x1e9a8e, 0x7c3aed];
const UNDER = [0xf4f4f6, 0x7c3aed, 0xfbcfe8, 0x1f2430, 0xffbe2e, 0x22d3ee];

const CATS = [
  { id: 'face', icon: '🙂', name: 'Gesicht', groups: [
    { key: 'skin', label: 'Hautfarbe', type: 'color', colors: SKINS },
    { key: 'face.eyes', label: 'Augen', type: 'choice', options: [['round', '👀 Rund'], ['wide', '😳 Gross'], ['sleepy', '😌 Verschlafen'], ['happy', '😊 Fröhlich']] },
    { key: 'face.eyeC', label: 'Augenfarbe', type: 'color', colors: EYEC },
    { key: 'face.mouth', label: 'Mund', type: 'choice', options: [['smile', '🙂 Lächeln'], ['grin', '😁 Grinsen'], ['calm', '😶 Ruhig'], ['smirk', '😏 Schief'], ['open', '😮 Offen']] },
    { label: 'Extras', type: 'toggles', options: [['face.blush', '🌸 Rote Wangen'], ['face.freckles', '✨ Sommersprossen'], ['face.lashes', '👁️ Wimpern']] },
  ] },
  { id: 'hair', icon: '💇', name: 'Haare', groups: [
    { key: 'hair.id', label: 'Frisur', type: 'choice', options: [['spiky', '⚡ Strubbel'], ['emo', '🌙 Seitenscheitel'], ['long', '🌊 Lang']] },
    { key: 'hair.c', label: 'Haarfarbe', type: 'color', colors: HAIRC },
    { key: 'hair.c2', label: 'Farbige Strähne', type: 'color', colors: [0x8b5cf6, 0x22d3ee, 0xf472b6, 0xfacc15, 0x3daa5b], when: (E) => E.hair.id === 'emo' },
  ] },
  { id: 'top', icon: '👕', name: 'Oberteil', groups: [
    { key: 'top.id', label: 'Oberteil', type: 'choice', options: [['tshirt', '👕 T-Shirt'], ['sport', '🧥 Sportjacke'], ['hoodie', '🖤 Hoodie'], ['pastel', '🩷 Flicken-Jacke']] },
    { key: 'top.c', label: 'Farbe', type: 'color', colors: CLOTH },
    { key: 'top.trim', label: 'Akzentfarbe', type: 'color', colors: TRIM },
    { key: 'top.under', label: 'Shirt darunter', type: 'color', colors: UNDER, when: (E) => E.top.id !== 'tshirt' },
  ] },
  { id: 'bottom', icon: '👖', name: 'Unten', groups: [
    { key: 'bottom.id', label: 'Hose oder Rock', type: 'choice', options: [['cargo', '👖 Cargohose'], ['skirt', '🎀 Karo-Rock']] },
    { key: 'bottom.c', label: 'Farbe', type: 'color', colors: PANTS },
    { key: 'bottom.trim', label: 'Akzentfarbe', type: 'color', colors: TRIM },
  ] },
  { id: 'shoes', icon: '👟', name: 'Schuhe', groups: [
    { key: 'shoes.c', label: 'Farbe', type: 'color', colors: CLOTH },
    { key: 'shoes.c2', label: 'Akzentfarbe', type: 'color', colors: TRIM },
    { label: 'Extras', type: 'toggles', options: [['shoes.paw', '🐾 Pfoten-Aufdruck']] },
  ] },
  { id: 'hat', icon: '🧢', name: 'Kopf', groups: [
    { key: 'hat.id', label: 'Kopfbedeckung', type: 'choice', options: [['none', '— Nichts'], ['cap', '🧢 Cap'], ['catbeanie', '🐱 Katzenmütze']] },
    { key: 'hat.c', label: 'Farbe', type: 'color', colors: CLOTH, when: (E) => E.hat.id !== 'none' },
  ] },
  { id: 'extra', icon: '🎧', name: 'Zubehör', groups: [
    { label: 'Zubehör (mehrere möglich)', type: 'toggles', options: [['neck.on', '🎧 Kopfhörer'], ['wrist.on', '⌚ Uhr'], ['back.on', '🎒 Rucksack'], ['bag.on', '🐾 Pfoten-Tasche'], ['bottom.chain', '⛓️ Kette']] },
    { key: 'extraC', label: 'Farbe Zubehör', type: 'color', colors: TRIM.concat([0x2453d6]) },
  ] },
  { id: 'hand', icon: '🪄', name: 'In der Hand', groups: [
    { key: 'hand', label: 'Gegenstand', type: 'choice', options: [['none', '— Nichts'], ['wand', '🪄 Zauberstab'], ['skateboard', '🛹 Skateboard']] },
  ] },
];
const DEFAULT = {
  skin: 0xe9b48c, face: { eyes: 'round', eyeC: 0x6b4423, mouth: 'grin', blush: false, freckles: true, lashes: false },
  hair: { id: 'spiky', c: 0x7a4422, c2: 0x8b5cf6 },
  top: { id: 'sport', c: 0x2453d6, trim: 0xf5c518, under: 0xf4f4f6 },
  bottom: { id: 'cargo', c: 0x24232b, trim: 0xf5c518, chain: false },
  shoes: { c: 0x2453d6, c2: 0xf5c518, paw: false },
  hat: { id: 'cap', c: 0x2453d6 },
  neck: { on: false }, wrist: { on: true }, back: { on: false }, bag: { on: false }, extraC: 0x2453d6,
  hand: 'none',
};
const KEY = 'teilmal.avatarLab.v1';
const clone = (o) => JSON.parse(JSON.stringify(o));
let E = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s ? merge(clone(DEFAULT), s) : clone(DEFAULT); } catch { return clone(DEFAULT); } })();
function merge(a, b) { for (const k in b) a[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k]; return a; }
const get = (k) => k.split('.').reduce((o, p) => o?.[p], E);
const set = (k, v) => { const ps = k.split('.'); let o = E; for (const p of ps.slice(0, -1)) o = o[p] ||= {}; o[ps.at(-1)] = v; };

/** Auswahl → Bauplan für die Figur */
function toLook(E) {
  const L = { skin: E.skin, face: { ...E.face }, hair: { ...E.hair }, top: { ...E.top }, bottom: { ...E.bottom }, shoes: { id: 'sneakers', ...E.shoes, paw: E.shoes.paw ? 0xf472b6 : null }, hand: E.hand };
  if (L.top.id === 'pastel') L.top.patches = [E.top.trim, 0x7dd3fc];
  if (L.top.id === 'tshirt') L.top.logoC = E.top.trim;
  if (L.bottom.id === 'skirt') L.bottom.warmers = [E.bottom.trim, vxShade(E.bottom.trim, 0.4)];
  if (E.hat.id !== 'none') L.hat = { id: E.hat.id, c: E.hat.c, c2: E.hat.id === 'cap' ? 0xf4f4f6 : 0xf9a8d4, c3: E.hat.id === 'cap' ? E.top.trim : 0x7dd3fc };
  if (E.neck.on) L.neck = { id: 'headphones', c: E.extraC };
  if (E.wrist.on) L.wrist = { id: 'watch', c: E.extraC, c2: 0x5eead4 };
  if (E.back.on) L.back = { id: 'backpack', c: E.extraC, c2: E.top.trim };
  if (E.bag.on) L.bag = { id: 'paw', c: 0xfbcfe8, c2: 0xf472b6 };
  return L;
}

/* ---------------- Bühne ---------------- */
const stage = document.getElementById('stage');
let renderer;
try {
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
} catch {
  document.getElementById('nogl').hidden = false;
  throw new Error('kein WebGL');
}
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
stage.prepend(renderer.domElement);
const scene = new T.Scene();
const cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
scene.add(new T.HemisphereLight(0xffffff, 0x8a6a3a, 1.45));
const key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(-2.5, 4.5, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
const fill = new T.DirectionalLight(0xfff1e0, 0.7); fill.position.set(3, 2, 2);
const rim = new T.DirectionalLight(0xffffff, 1.3); rim.position.set(0, 3, -4);
scene.add(key, fill, rim);
{
  const pm = new T.MeshStandardMaterial({ color: 0xf7c62a, roughness: 0.5 });
  const top = new T.Mesh(new T.CylinderGeometry(1.15, 1.2, 0.16, 8), pm); top.position.y = -0.08; top.receiveShadow = true; top.rotation.y = Math.PI / 8;
  const base = new T.Mesh(new T.CylinderGeometry(1.2, 1.32, 0.14, 8), new T.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.6 })); base.position.y = -0.23; base.rotation.y = Math.PI / 8;
  scene.add(top, base);
}
const view = { yaw: -0.35, zoom: 1, fit: 7.4, drag: null, pinch: null, pts: new Map() };
let fig = null, anim = 'idle', animUntil = 0, buildMs = 0;
function rebuild() {
  const t0 = performance.now();
  const next = vxFigure(T, toLook(E));
  buildMs = performance.now() - t0;
  if (fig) { scene.remove(fig.root); fig.dispose(); }
  fig = next; scene.add(fig.root); fig.setAnim(anim);
  try { localStorage.setItem(KEY, JSON.stringify(E)); } catch { /* */ }
}
let rebuildT = 0;
const rebuildSoon = () => { clearTimeout(rebuildT); rebuildT = setTimeout(rebuild, 20); };
/** Kamera-Abstand so, dass Figur und Sockel ganz ins Bild passen (Hoch- und Querformat) */
function size() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); cam.aspect = w / h; cam.fov = 30; cam.updateProjectionMatrix();
  const t = Math.tan((cam.fov * Math.PI) / 360);
  view.fit = Math.max(1.85 / t, 1.55 / (t * cam.aspect));
}
new ResizeObserver(size).observe(stage); size();

/* Drehen und Zoomen (Maus, Finger, zwei Finger) */
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  view.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId);
  if (view.pts.size === 1) view.drag = { x: e.clientX, yaw: view.yaw };
  if (view.pts.size === 2) { const [a, b] = [...view.pts.values()]; view.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom }; view.drag = null; }
});
el.addEventListener('pointermove', (e) => {
  if (!view.pts.has(e.pointerId)) return;
  view.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (view.pinch && view.pts.size === 2) { const [a, b] = [...view.pts.values()]; view.zoom = Math.min(1.4, Math.max(0.35, view.pinch.zoom * view.pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)))); }
  else if (view.drag) view.yaw = view.drag.yaw + (e.clientX - view.drag.x) * 0.012;
});
const up = (e) => { view.pts.delete(e.pointerId); if (view.pts.size < 2) view.pinch = null; if (!view.pts.size) view.drag = null; };
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
el.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.min(1.4, Math.max(0.35, view.zoom * (1 + e.deltaY * 0.0012))); }, { passive: false });
el.addEventListener('dblclick', () => playAnim('cheer', 1600));

/* Bewegungen */
const ANIMS = [['idle', 'Stehen'], ['wave', '👋 Winken'], ['cheer', '🙌 Jubeln'], ['dance', '💃 Tanzen'], ['hold', '✊ Halten'], ['present', '🏆 Zeigen']];
const animsEl = document.getElementById('anims');
function playAnim(a, ms = 0) { anim = a; animUntil = ms ? performance.now() + ms : 0; fig?.setAnim(a); renderAnims(); }
function renderAnims() { animsEl.innerHTML = ANIMS.map(([a, n]) => `<button class="${a === anim ? 'on' : ''}" data-a="${a}">${n}</button>`).join(''); }
animsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) playAnim(b.dataset.a, ['wave', 'cheer'].includes(b.dataset.a) ? 4000 : 0); });
renderAnims();

/* ---------------- Auswahl-Panel ---------------- */
let cat = 'face';
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
function renderPanel() {
  document.getElementById('tabs').innerHTML = CATS.map((c) => `<button role="tab" class="${c.id === cat ? 'on' : ''}" aria-selected="${c.id === cat}" data-cat="${c.id}"><span>${c.icon}</span><small>${c.name}</small></button>`).join('');
  const C = CATS.find((c) => c.id === cat);
  document.getElementById('opts').innerHTML = C.groups.filter((g) => !g.when || g.when(E)).map((g) => {
    let body = '';
    if (g.type === 'choice') body = `<div class="lab-chips">${g.options.map(([v, n]) => `<button class="lab-chip ${get(g.key) === v ? 'on' : ''}" data-k="${g.key}" data-v="${v}">${n}</button>`).join('')}</div>`;
    if (g.type === 'color') body = `<div class="lab-swatches">${g.colors.map((c) => `<button class="lab-sw ${get(g.key) === c ? 'on' : ''}" style="background:${hex(c)}" data-k="${g.key}" data-c="${c}" aria-label="Farbe ${hex(c)}"></button>`).join('')}</div>`;
    if (g.type === 'toggles') body = `<div class="lab-chips">${g.options.map(([k, n]) => `<button class="lab-chip ${get(k) ? 'on' : ''}" data-t="${k}" aria-pressed="${!!get(k)}">${n}</button>`).join('')}</div>`;
    return `<div class="lab-group"><h3>${g.label}</h3>${body}</div>`;
  }).join('');
}
document.getElementById('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; renderPanel(); } });
document.getElementById('opts').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v != null) set(b.dataset.k, b.dataset.v);
  else if (b.dataset.c != null) set(b.dataset.k, +b.dataset.c);
  else if (b.dataset.t) set(b.dataset.t, !get(b.dataset.t));
  // passende Bewegung zum Gegenstand
  if (b.dataset.k === 'hand') playAnim(b.dataset.v === 'none' ? 'idle' : 'present', 3000);
  renderPanel(); rebuildSoon();
});
const pick = (a) => a[Math.floor(Math.random() * a.length)];
document.getElementById('rnd').addEventListener('click', () => {
  E.skin = pick(SKINS);
  Object.assign(E.face, { eyes: pick(['round', 'wide', 'round', 'sleepy']), eyeC: pick(EYEC), mouth: pick(['smile', 'grin', 'calm', 'smirk']), blush: Math.random() < 0.5, freckles: Math.random() < 0.3, lashes: Math.random() < 0.5 });
  Object.assign(E.hair, { id: pick(['spiky', 'emo', 'long']), c: pick(HAIRC), c2: pick(TRIM) });
  Object.assign(E.top, { id: pick(['tshirt', 'sport', 'hoodie', 'pastel']), c: pick(CLOTH), trim: pick(TRIM), under: pick(UNDER) });
  Object.assign(E.bottom, { id: pick(['cargo', 'skirt']), c: pick(PANTS), trim: pick(TRIM), chain: Math.random() < 0.3 });
  Object.assign(E.shoes, { c: pick(CLOTH), c2: pick(TRIM), paw: Math.random() < 0.2 });
  E.hat.id = pick(['none', 'cap', 'catbeanie', 'none']); E.hat.c = pick(CLOTH);
  for (const k of ['neck', 'wrist', 'back', 'bag']) E[k].on = Math.random() < 0.3;
  E.extraC = pick(TRIM); E.hand = pick(['none', 'none', 'wand', 'skateboard']);
  renderPanel(); rebuild(); playAnim('cheer', 1800);
});
document.getElementById('reset').addEventListener('click', () => { E = clone(DEFAULT); renderPanel(); rebuild(); });
renderPanel();
rebuild();

/* ---------------- Schleife, Leistung ---------------- */
const perf = document.getElementById('perf');
let last = performance.now(), frames = 0, acc = 0;
window.LAB = { get fig() { return fig; }, view, E, playAnim, rebuild };
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (animUntil && now > animUntil) playAnim('idle');
  fig?.update(dt);
  if (fig) fig.root.rotation.y = view.yaw;
  const dist = view.fit * view.zoom, z = 1 - view.zoom;              // beim Zoomen zum Gesicht hin
  cam.position.set(0, 1.5 + z * 0.55, dist); cam.lookAt(0, 1.3 + z * 0.75, 0);
  renderer.render(scene, cam);
  frames++; acc += dt;
  if (acc > 1) { perf.textContent = `${Math.round(frames / acc)} Bilder/s · ${Math.round((fig?.tris() || 0) / 1000)}k Dreiecke · Aufbau ${Math.round(buildMs)} ms`; frames = 0; acc = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
