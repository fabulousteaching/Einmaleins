/* Teilmal – weitere Spiele: Rechen-Labyrinth, Turmbau, Zahlen-Schlange, 1×1-Tafel-Puzzle
 *
 * Alle nutzen die gemeinsame Runde aus js/games.js (runStart, runRight, runWrong, Ergebnis mit Bestenliste)
 * und die gewählten Reihen und Aufgabenarten der Startseite (practiceSettings).
 */
'use strict';

/** Wie die Punkte im Ergebnis heissen (sonst «richtige Antworten») */
function g2Noun(id, n) {
  const W = { maze: ['richtiger Schritt', 'richtige Schritte'], tower: ['Block im Turm', 'Blöcke im Turm'], snake: ['richtige Zahl gefressen', 'richtige Zahlen gefressen'], puzzle: ['Teil', 'Teile'] }[id];
  return W ? W[n === 1 ? 0 : 1] : null;
}
const g2Pick = (a) => a[Math.floor(Math.random() * a.length)];
/** Reihen fürs Labyrinth und die Tafel (die 1er-Reihe wäre zu einfach: alles gehört dazu) */
function g2Rows() { const rs = practiceSettings().reihen.filter((r) => r > 1); return rs.length ? rs : [2]; }

/* =========================================================
   🧭 Rechen-Labyrinth: Weg zum Schatz – nur über Zahlen der Reihe
   ========================================================= */
const MZ = { W: 6, H: 7 };
const MZ_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function startMaze() {
  Object.assign(game, { mz: null, mzLock: false, mzOrder: shuffle(g2Rows()), mzN: 0, over: false });
  const r = runStart('maze');
  $('#view').innerHTML = gameShell('maze', `
    ${runHudHTML('bar-hud')}
    ${r.mode === 'survive' ? '<div class="shot-clock mz-clock" id="mzclock"><i></i></div>' : ''}
    <div class="mz-head" id="mzhead"></div>
    <div class="mz-wrap"><div class="mz-board" id="mzboard" style="--w:${MZ.W};--h:${MZ.H}"></div></div>
    <p class="mode-hint">Tippe auf ein Nachbarfeld (oder Pfeiltasten). Falsche Zahlen zerbrechen${r.mode === 'survive' ? ' und kosten ein Leben' : ''}.</p>`);
  const onResize = () => { if (game.mz) mzMove(...game.mz.pos, true); };
  window.addEventListener('resize', onResize);
  game.cleanups = [...(game.cleanups || []), () => window.removeEventListener('resize', onResize)];
  setGameKeys((e) => {
    const d = { ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowUp: [0, -1] }[e.key];
    if (!d || !game.mz) return;
    e.preventDefault();
    const [x, y] = game.mz.pos, nx = x + d[0], ny = y + d[1];
    if (nx >= 0 && ny >= 0 && nx < MZ.W && ny < MZ.H) mzStep(ny * MZ.W + nx);
  });
  mzNew();
}
/** Zufälliger Weg vom Start (links oben) zum Schatz (rechts unten), ohne ein Feld zweimal */
function mzWalk(W, H) {
  const key = (x, y) => y * W + x;
  const seen = new Set([0]), p = [[0, 0]];
  while (p.length < 40) {
    const [x, y] = p[p.length - 1];
    if (x === W - 1 && y === H - 1) return p.length >= 11 && p.length <= 15 ? p : null;
    const nb = MZ_DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && !seen.has(key(a, b)));
    if (!nb.length) return null;
    // leicht Richtung Schatz, aber mit Umwegen
    const w = nb.map(([a, b]) => (a > x || b > y ? 1.6 : 1));
    let t = Math.random() * w.reduce((s, v) => s + v, 0), pick = nb[0];
    for (let i = 0; i < nb.length; i++) { t -= w[i]; if (t <= 0) { pick = nb[i]; break; } }
    seen.add(key(pick[0], pick[1])); p.push(pick);
  }
  return null;
}
function mzNew() {
  const { W, H } = MZ;
  const r = game.mzOrder[game.mzN++ % game.mzOrder.length];
  let path = null;
  for (let i = 0; i < 2000 && !path; i++) path = mzWalk(W, H);
  if (!path) path = [...Array(W).keys()].map((x) => [x, 0]).concat([...Array(H - 1).keys()].map((y) => [W - 1, y + 1]));
  const cells = Array.from({ length: W * H }, () => ({ v: null, mult: false, kind: 'num' }));
  const at = (x, y) => cells[y * W + x];
  let ks = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ki = 0;
  const nextMult = () => { if (ki >= ks.length) { ks = shuffle(ks); ki = 0; } const k = ks[ki++]; return { v: r * k, k }; };
  path.forEach(([x, y], i) => {
    const c = at(x, y);
    if (i === 0) c.kind = 'start';
    else if (i === path.length - 1) c.kind = 'goal';
    else Object.assign(c, nextMult(), { mult: true });
  });
  // Sackgassen: ein paar Zahlen der Reihe, die nicht zum Schatz führen
  const onPath = new Set(path.map(([x, y]) => y * W + x));
  shuffle(path.slice(2, -2)).slice(0, 3).forEach(([x, y]) => {
    let cx = x, cy = y;
    for (let n = 0; n < 1 + Math.floor(Math.random() * 2); n++) {
      const nb = shuffle(MZ_DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && !onPath.has(b * W + a) && !at(a, b).mult));
      if (!nb.length) break;
      [cx, cy] = nb[0];
      Object.assign(at(cx, cy), nextMult(), { mult: true });
    }
  });
  // übrige Felder: Zahlen, die nicht zur Reihe gehören (nahe an Vielfachen oder aus anderen Reihen)
  const max = r * 10 + 4;
  const notMult = () => {
    for (let t = 0; t < 50; t++) {
      const v = Math.random() < 0.55 ? r * (1 + Math.floor(Math.random() * 10)) + g2Pick([-3, -2, -1, 1, 2, 3]) : (2 + Math.floor(Math.random() * 9)) * (2 + Math.floor(Math.random() * 9));
      if (v > 1 && v <= Math.max(max, 30) && v % r !== 0) return v;
    }
    return r + 1;
  };
  cells.forEach((c) => { if (c.kind === 'num' && !c.mult) c.v = notMult(); });
  game.mz = { r, cells, pos: [0, 0], solved: false };
  $('#mzhead').innerHTML = `<span class="mz-badge">${r}er-Reihe</span><span>Finde den Weg zum Schatz – tritt nur auf Zahlen der <b>${r}er-Reihe</b>!</span>`;
  const board = $('#mzboard');
  board.innerHTML = cells.map((c, i) => `<button type="button" class="mz-cell ${c.kind}" data-action="mz-step" data-i="${i}" aria-label="${c.kind === 'start' ? 'Start' : c.kind === 'goal' ? 'Schatz' : c.v}">${c.kind === 'start' ? '🚩' : c.kind === 'goal' ? '💎' : c.v}</button>`).join('')
    + '<span class="mz-me" id="mzme" aria-hidden="true">🦊</span>';
  board.classList.remove('done'); board.classList.add('in');
  setTimeout(() => board.classList.remove('in'), 450);
  at(0, 0).seen = true;
  board.children[0].classList.add('visited');
  mzMove(0, 0, true);
  game.mzLock = false;
  mzClock();
}
/** Mitte eines Feldes (in Pixeln innerhalb des Spielfelds) */
function mzCenter(x, y) {
  const el = $('#mzboard')?.children[y * MZ.W + x];
  return el ? [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2] : [0, 0];
}
function mzMove(x, y, now = false) {
  const me = $('#mzme');
  if (!me) return;
  if (now) me.style.transition = 'none';
  const [px, py] = mzCenter(x, y);
  me.style.left = `${px}px`; me.style.top = `${py}px`;
  if (now) { void me.offsetWidth; me.style.transition = ''; }
}
function mzClock() {
  if (game.run?.mode !== 'survive' || !runOn()) return;
  taskClock($('#mzclock i'), surviveMs(9000, 2600), () => { if (!runOn()) return; sfx.bad(); mzFloat(game.mz.pos, 'Zu langsam!', 'bad'); if (!runWrong()) mzClock(); });
}
function mzFloat([x, y], text, cls) {
  const b = $('#mzboard');
  if (!b) return;
  const f = document.createElement('span');
  f.className = `mz-float ${cls}`; f.innerHTML = text;
  const [px, py] = mzCenter(x, y);
  f.style.left = `${px}px`; f.style.top = `${py}px`;
  b.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}
function mzStep(i) {
  const m = game.mz;
  if (!m || game.mzLock || !runOn()) return;
  const x = i % MZ.W, y = Math.floor(i / MZ.W), [cx, cy] = m.pos;
  const el = $('#mzboard')?.children[i];
  if (!el) return;
  if (Math.abs(x - cx) + Math.abs(y - cy) !== 1) {
    if (x !== cx || y !== cy) { $('#mzme')?.classList.remove('nope'); void $('#mzme')?.offsetWidth; $('#mzme')?.classList.add('nope'); }
    return;
  }
  const c = m.cells[i];
  if (c.bad) return;
  if (c.kind === 'num' && !c.mult) { // falsche Zahl: zerbricht
    c.bad = true;
    el.classList.add('bad');
    sfx.bad();
    mzFloat([x, y], `${c.v} ist nicht in der ${m.r}er-Reihe`, 'bad');
    if (!runWrong()) mzClock();
    return;
  }
  m.pos = [x, y];
  mzMove(x, y);
  el.classList.add('visited');
  if (c.kind === 'num' && !c.seen) {
    c.seen = true;
    sfx.good();
    mzFloat([x, y], `${c.k} ${SIGN()} ${m.r} = <b>${c.v}</b>`, 'good');
    if (runRight()) return;
    mzClock();
  } else tone([520], 0.05, 'sine', 0.04);
  if (c.kind === 'goal') {
    game.mzLock = true;
    taskClockStop($('#mzclock i'));
    sfx.win();
    $('#mzboard').classList.add('done');
    sparkle(el, 18);
    mzFloat([x, y], 'Schatz gefunden!', 'good big');
    gLater(() => { if (runOn()) mzNew(); }, 1100);
  }
}

/* =========================================================
   🏗️ Turmbau: richtige Antwort → Block am Kran → im richtigen Moment loslassen
   ========================================================= */
const TW = { BH: 34, GROUND: 46, COLORS: ['#F97316', '#0EA5E9', '#22C55E', '#A855F7', '#EF4444', '#EAB308', '#14B8A6', '#EC4899'] };
function startTower() {
  Object.assign(game, { picker: gamePicker(), tw: { blocks: [{ x: 30, w: 40, label: 'Start' }], phase: 'ask', hang: null, t: null, swingT: 0, shift: 0 }, over: false });
  const r = runStart('tower');
  $('#view').innerHTML = gameShell('tower', `
    ${runHudHTML('bar-hud')}
    ${r.mode === 'survive' ? '<div class="shot-clock tw-clock" id="twclock"><i></i></div>' : ''}
    <div class="tw-stage" id="twstage">
      <div class="tw-world" id="twworld"><div class="tw-ground"></div></div>
      <div class="tw-crane" aria-hidden="true"><div class="tw-beam"></div><div class="tw-trolley" id="twtrolley"><i class="tw-rope"></i></div></div>
      <div class="tw-tip" id="twtip" hidden>Tippe, um den Block loszulassen!</div>
    </div>
    <div class="tw-ask" id="twask"></div>
    <p class="mode-hint">Richtige Antwort → ein Block hängt am Kran. Tippe ins Bild (oder Leertaste), um ihn fallen zu lassen. Was übersteht, fällt ab.</p>`);
  const stage = $('#twstage');
  stage.addEventListener('pointerdown', (e) => { if (game.tw?.phase === 'drop') { e.preventDefault(); twDrop(); } });
  setGameKeys((e) => {
    if ((e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') && game.tw?.phase === 'drop') { e.preventDefault(); twDrop(); return; }
    const n = Number(e.key);
    if (game.tw?.phase === 'ask' && n >= 1 && n <= 4) $$('#twask .tw-ans')[n - 1]?.click();
  });
  game.tw.blocks.forEach((b, i) => twBlockEl(b, i));
  twLoop();
  twAsk();
}
function twBlockEl(b, level) {
  const w = $('#twworld');
  if (!w) return null;
  const el = document.createElement('div');
  el.className = `tw-block${level === 0 ? ' base' : ''}`;
  el.style.cssText = `left:${b.x}%;width:${b.w}%;bottom:${TW.GROUND + level * TW.BH}px;--bc:${level === 0 ? '#64748b' : TW.COLORS[level % TW.COLORS.length]}`;
  el.innerHTML = `<span>${esc(b.label)}</span>`;
  w.appendChild(el);
  twFit(el, b.w);
  b.el = el;
  return el;
}
/** Schrift passt sich der Blockbreite an */
function twFit(el, wPct) {
  const W = $('#twstage')?.clientWidth || 400;
  el.style.fontSize = `${Math.max(8, Math.min(17, (W * wPct) / 100 / 7.5))}px`;
}
function twAsk() {
  const tw = game.tw;
  if (!runOn() || !tw) return;
  tw.phase = 'ask';
  $('#twtip').hidden = true;
  const t = game.picker.next();
  t.shownAt = performance.now();
  tw.t = t;
  const vals = choicesFor(t, 4);
  $('#twask').innerHTML = `<div class="task tw-task">${taskHTML(t, '<span class="slot">?</span>')}</div>
    <div class="tw-answers">${vals.map((v, i) => `<button type="button" class="tw-ans" data-action="tw-answer" data-v="${v}"><small>${i + 1}</small>${v}</button>`).join('')}</div>`;
  if (game.run.mode === 'survive') taskClock($('#twclock i'), surviveMs(8000, 2200), () => twAnswer(null));
}
function twAnswer(v) {
  const tw = game.tw;
  if (!tw || tw.phase !== 'ask' || !runOn()) return;
  taskClockStop($('#twclock i'));
  const t = tw.t, ok = v != null && Number(v) === t.answer;
  recordAnswer(t, v == null ? '' : v, performance.now() - t.shownAt);
  $$('#twask .tw-ans').forEach((b) => { b.disabled = true; if (Number(b.dataset.v) === t.answer) b.classList.add('right'); else if (b.dataset.v === String(v)) b.classList.add('wrong'); });
  if (!ok) {
    sfx.bad();
    tw.phase = 'wait';
    if (runWrong(t)) return;
    gLater(twAsk, 1300);
    return;
  }
  sfx.good();
  // Block erscheint am Kran: so breit wie der oberste Block des Turms
  const top = tw.blocks[tw.blocks.length - 1];
  const el = document.createElement('div');
  el.className = 'tw-block hang';
  el.style.cssText = `width:${top.w}%;--bc:${TW.COLORS[tw.blocks.length % TW.COLORS.length]}`;
  el.innerHTML = `<span>${esc(taskText(t, true))}</span>`;
  $('#twstage').appendChild(el);
  twFit(el, top.w);
  tw.hang = { el, w: top.w, label: taskText(t, true) };
  tw.phase = 'drop';
  $('#twtip').hidden = false;
}
function twLoop() {
  const tick = (now) => {
    const tw = game.tw;
    if (!tw || !$('#twstage')) return;
    game.raf = requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min(0.05, (now - (tw.last || now)) / 1000)); tw.last = now;
    tw.swingT += dt * Math.min(3.3, 1.5 + (tw.blocks.length - 1) * 0.11); // je höher der Turm, desto schneller
    const w = tw.hang ? tw.hang.w : 30;
    tw.hx = 50 + Math.sin(tw.swingT) * (50 - w / 2 - 1);
    const tr = $('#twtrolley');
    if (tr) tr.style.left = `${tw.hx}%`;
    if (tw.hang && tw.phase === 'drop') { tw.hang.el.style.left = `${tw.hx - w / 2}%`; tw.hang.el.style.top = '58px'; }
  };
  game.raf = requestAnimationFrame(tick);
}
function twDrop() {
  const tw = game.tw;
  if (!tw || tw.phase !== 'drop' || !tw.hang || !runOn()) return;
  tw.phase = 'fall';
  $('#twtip').hidden = true;
  const h = tw.hang, top = tw.blocks[tw.blocks.length - 1];
  const x = tw.hx - h.w / 2;
  const level = tw.blocks.length;
  const stage = $('#twstage'), H = stage.clientHeight;
  const landTop = H - (TW.GROUND + level * TW.BH + TW.BH) + tw.shift; // Oberkante beim Aufsetzen (im Bild)
  h.el.style.left = `${x}%`;
  h.el.style.transition = 'top .32s cubic-bezier(.5, 0, 1, 1)';
  void h.el.offsetWidth;
  const ov = Math.min(x + h.w, top.x + top.w) - Math.max(x, top.x);
  if (ov <= 0.5) { // daneben: fällt am Turm vorbei
    h.el.style.transition = 'top .7s cubic-bezier(.5, 0, 1, 1), transform .7s, opacity .7s';
    h.el.style.top = `${H + 40}px`; h.el.style.transform = `rotate(${x < top.x ? -35 : 35}deg)`; h.el.style.opacity = '0.3';
    tw.hang = null;
    setTimeout(() => h.el.remove(), 800);
    gLater(() => {
      sfx.bad();
      tone([300, 200], 0.12, 'sawtooth', 0.04);
      if (runWrong()) return;
      twAsk();
    }, 450);
    return;
  }
  h.el.style.top = `${landTop}px`;
  gLater(() => {
    const perfect = Math.abs(x - top.x) < 1.3;
    const nb = perfect ? { x: top.x, w: Math.min(46, top.w + 2.5), label: h.label } : { x: Math.max(x, top.x), w: ov, label: h.label };
    // überstehendes Stück fällt ab
    if (!perfect) {
      const cutL = x < top.x, cw = h.w - ov;
      const cut = document.createElement('div');
      cut.className = 'tw-block cut';
      cut.style.cssText = `left:${cutL ? x : top.x + top.w}%;width:${cw}%;top:${landTop}px;--bc:${getComputedStyle(h.el).getPropertyValue('--bc')}`;
      stage.appendChild(cut);
      requestAnimationFrame(() => { cut.style.top = `${H + 60}px`; cut.style.transform = `rotate(${cutL ? -50 : 50}deg)`; cut.style.opacity = '0'; });
      setTimeout(() => cut.remove(), 900);
    }
    h.el.remove();
    tw.hang = null;
    tw.blocks.push(nb);
    const el = twBlockEl(nb, tw.blocks.length - 1);
    el?.classList.add('land');
    if (perfect) { tone([880, 1320], 0.08, 'triangle', 0.06); twFloat('Perfekt!', el); sparkle(el, 12); } else tone([392], 0.06, 'square', 0.04);
    // Kamera: die Turmspitze bleibt im Bild
    const want = Math.max(0, TW.GROUND + tw.blocks.length * TW.BH - H * 0.55);
    if (want !== tw.shift) { tw.shift = want; $('#twworld').style.transform = `translateY(${want}px)`; }
    if (runRight()) return;
    gLater(twAsk, perfect ? 500 : 300);
  }, 330);
}
function twFloat(text, anchor) {
  const s = $('#twstage');
  if (!s || !anchor) return;
  const r = anchor.getBoundingClientRect(), R = s.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'mz-float good big';
  f.textContent = text;
  f.style.left = `${r.left - R.left + r.width / 2}px`; f.style.top = `${r.top - R.top}px`;
  s.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}

/* =========================================================
   🐍 Zahlen-Schlange: nur das richtige Ergebnis fressen
   Am Rand geht es auf der anderen Seite weiter. Falsche Zahl oder Biss in den eigenen Schwanz: Survive kostet ein Leben.
   ========================================================= */
function startSnake() {
  Object.assign(game, { picker: gamePicker(), sn: null, over: false });
  runStart('snake');
  $('#view').innerHTML = gameShell('snake', `
    ${runHudHTML('bar-hud')}
    <div class="sn-task task" id="sntask"></div>
    <div class="sn-stage" id="snstage"><canvas id="sncv"></canvas><div class="sn-go" id="sngo">Bereit?</div></div>
    <div class="sn-pad" aria-label="Steuerung">
      <button type="button" class="sn-dir up" data-action="sn-dir" data-d="0,-1" aria-label="nach oben">▲</button>
      <button type="button" class="sn-dir left" data-action="sn-dir" data-d="-1,0" aria-label="nach links">◀</button>
      <button type="button" class="sn-dir down" data-action="sn-dir" data-d="0,1" aria-label="nach unten">▼</button>
      <button type="button" class="sn-dir right" data-action="sn-dir" data-d="1,0" aria-label="nach rechts">▶</button>
    </div>
    <p class="mode-hint">Lenke mit den Pfeiltasten, durch Wischen oder mit den Knöpfen. Am Rand geht es auf der anderen Seite weiter.</p>`);
  const stage = $('#snstage'), cv = $('#sncv');
  const R = stage.getBoundingClientRect();
  const COLS = 14, ROWS = rnd2(Math.round((COLS * R.height) / Math.max(1, R.width)), 9, 15);
  const mid = Math.floor(ROWS / 2);
  game.sn = { COLS, ROWS, body: [[5, mid], [4, mid], [3, mid]], dir: [1, 0], queue: [], foods: [], acc: 0, last: 0, t: null, started: false, flash: 0, grow: 0 };
  snResize();
  const onResize = () => snResize();
  window.addEventListener('resize', onResize);
  game.cleanups = [...(game.cleanups || []), () => window.removeEventListener('resize', onResize)];
  setGameKeys((e) => {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key];
    if (d) { e.preventDefault(); snTurn(d); }
  });
  let sw = null;
  cv.addEventListener('pointerdown', (e) => { sw = [e.clientX, e.clientY]; });
  cv.addEventListener('pointermove', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw[0], dy = e.clientY - sw[1];
    if (Math.hypot(dx, dy) < 24) return;
    snTurn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    sw = [e.clientX, e.clientY];
  });
  const end = () => { sw = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.style.touchAction = 'none';
  snTask();
  gLater(() => { if (game.sn) { game.sn.started = true; const g = $('#sngo'); if (g) { g.textContent = 'Los!'; g.classList.add('out'); } } }, 1100);
  const loop = (now) => {
    const s = game.sn;
    if (!s || !$('#sncv')) return;
    game.raf = requestAnimationFrame(loop);
    const dt = Math.max(0, Math.min(0.1, (now - (s.last || now)) / 1000)); s.last = now;
    s.flash = Math.max(0, s.flash - dt);
    if (s.started && runOn()) {
      s.acc += dt * 1000;
      const stepMs = Math.max(105, 235 * 0.92 ** (surviveLevel() - 1));
      while (s.acc >= stepMs && runOn()) { s.acc -= stepMs; snStep(); }
    }
    snDraw(now);
  };
  game.raf = requestAnimationFrame(loop);
}
const rnd2 = (v, a, b) => Math.max(a, Math.min(b, v));
function snResize() {
  const s = game.sn, cv = $('#sncv'), st = $('#snstage');
  if (!s || !cv || !st) return;
  const W = st.clientWidth, cell = Math.floor(W / s.COLS);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  s.cell = cell;
  cv.width = s.COLS * cell * dpr; cv.height = s.ROWS * cell * dpr;
  cv.style.width = `${s.COLS * cell}px`; cv.style.height = `${s.ROWS * cell}px`;
  s.dpr = dpr;
  st.style.height = `${s.ROWS * cell}px`;
}
function snTurn(d) {
  const s = game.sn;
  if (!s || !runOn()) return;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return; // nicht umkehren
  if (s.queue.length < 2) s.queue.push(d);
  if (!s.started) { s.started = true; const g = $('#sngo'); if (g) { g.textContent = 'Los!'; g.classList.add('out'); } }
}
function snTask() {
  const s = game.sn;
  if (!s || !runOn()) return;
  const t = game.picker.next();
  t.shownAt = performance.now();
  s.t = t;
  $('#sntask').innerHTML = taskHTML(t, '<span class="slot">?</span>');
  // drei Zahlen aufs Feld, nicht direkt vor die Schlange
  const vals = shuffle([t.answer, ...distractors(t, 2)]);
  const head = s.body[0];
  const free = [];
  for (let x = 0; x < s.COLS; x++) for (let y = 0; y < s.ROWS; y++) {
    if (s.body.some(([a, b]) => a === x && b === y)) continue;
    const dx = Math.min(Math.abs(x - head[0]), s.COLS - Math.abs(x - head[0])), dy = Math.min(Math.abs(y - head[1]), s.ROWS - Math.abs(y - head[1]));
    if (dx + dy < 4) continue;
    if (x === 0 || y === 0 || x === s.COLS - 1 || y === s.ROWS - 1) continue;
    free.push([x, y]);
  }
  s.foods = [];
  for (const v of vals) {
    const opts = shuffle(free.filter(([x, y]) => s.foods.every((f) => Math.abs(f.x - x) + Math.abs(f.y - y) >= 3)));
    const p = opts[0] || free[0];
    if (p) s.foods.push({ x: p[0], y: p[1], v, ok: v === t.answer, born: performance.now() });
  }
}
function snStep() {
  const s = game.sn;
  if (s.queue.length) s.dir = s.queue.shift();
  const [hx, hy] = s.body[0];
  const nx = (hx + s.dir[0] + s.COLS) % s.COLS, ny = (hy + s.dir[1] + s.ROWS) % s.ROWS;
  // eigener Schwanz? (das letzte Stück rückt gerade weiter)
  const hit = s.body.findIndex(([a, b], i) => i < s.body.length - 1 && a === nx && b === ny);
  s.body.unshift([nx, ny]);
  if (s.grow > 0) s.grow--; else s.body.pop();
  if (hit > 0) {
    s.body = s.body.slice(0, Math.max(3, hit));
    s.flash = 0.5;
    sfx.bad();
    snFloat('Autsch!', 'bad');
    if (runWrong()) return;
  }
  const fi = s.foods.findIndex((f) => f.x === nx && f.y === ny);
  if (fi < 0) return;
  const f = s.foods[fi], t = s.t;
  recordAnswer(t, f.v, performance.now() - t.shownAt);
  if (f.ok) {
    sfx.good();
    s.grow += 1;
    snFloat(`${taskText(t, true)}`, 'good');
    if (runRight()) return;
    snTask();
  } else {
    s.foods.splice(fi, 1);
    s.flash = 0.5;
    sfx.bad();
    if (s.body.length > 3) s.body.pop();
    snFloat(`Nein: ${taskText(t, true)}`, 'bad');
    if (runWrong(t)) return;
  }
}
function snFloat(text, cls) {
  const st = $('#snstage'), s = game.sn;
  if (!st || !s) return;
  const [x, y] = s.body[0];
  const f = document.createElement('span');
  f.className = `mz-float ${cls}`; f.textContent = text;
  f.style.left = `${(x + 0.5) * s.cell}px`; f.style.top = `${(y + 0.2) * s.cell}px`;
  st.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}
function snDraw(now) {
  const s = game.sn, cv = $('#sncv');
  if (!s || !cv) return;
  const g = cv.getContext('2d'), c = s.cell;
  g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  // Wiese mit Schachbrett
  for (let x = 0; x < s.COLS; x++) for (let y = 0; y < s.ROWS; y++) { g.fillStyle = (x + y) % 2 ? '#a3e635' : '#bef264'; g.fillRect(x * c, y * c, c, c); }
  if (s.flash > 0) { g.fillStyle = `rgba(239, 68, 68, ${s.flash * 0.5})`; g.fillRect(0, 0, s.COLS * c, s.ROWS * c); }
  // Zahlen (alle gleich aussehend – lesen muss man selbst)
  for (const f of s.foods) {
    const k = Math.max(0.05, Math.min(1, (now - f.born) / 250)), bob = Math.sin(now / 300 + f.x) * c * 0.04;
    const cx = (f.x + 0.5) * c, cy = (f.y + 0.5) * c + bob, r = c * 0.62 * k;
    g.fillStyle = 'rgba(0, 0, 0, .18)'; g.beginPath(); g.ellipse(cx, (f.y + 0.92) * c, r * 0.8, r * 0.25, 0, 0, 7); g.fill();
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    gr.addColorStop(0, '#fff7ed'); gr.addColorStop(1, '#fb923c');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.lineWidth = 2; g.strokeStyle = '#c2410c'; g.stroke();
    g.fillStyle = '#431407'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(c * (String(f.v).length > 2 ? 0.48 : 0.6) * k)}px "Bricolage Grotesque", Lexend, system-ui, sans-serif`;
    g.fillText(String(f.v), cx, cy + c * 0.03);
  }
  // Schlange
  const n = s.body.length;
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = s.body[i], t = i / Math.max(1, n - 1);
    const pad = c * (0.08 + t * 0.1);
    g.fillStyle = i === 0 ? '#15803d' : `hsl(${142 - t * 20}, 70%, ${34 + t * 12}%)`;
    const rr = c * 0.32;
    g.beginPath(); g.roundRect ? g.roundRect(x * c + pad, y * c + pad, c - pad * 2, c - pad * 2, rr) : g.rect(x * c + pad, y * c + pad, c - pad * 2, c - pad * 2); g.fill();
    if (i === 0) { // Augen in Laufrichtung
      const [dx, dy] = s.dir, ex = (x + 0.5) * c + dx * c * 0.16, ey = (y + 0.5) * c + dy * c * 0.16;
      for (const sd of [-1, 1]) {
        const ox = ex + (dy !== 0 ? sd * c * 0.18 : 0), oy = ey + (dx !== 0 ? sd * c * 0.18 : 0);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ox, oy, c * 0.12, 0, 7); g.fill();
        g.fillStyle = '#111827'; g.beginPath(); g.arc(ox + dx * c * 0.04, oy + dy * c * 0.04, c * 0.06, 0, 7); g.fill();
      }
    }
  }
}

/* =========================================================
   🧩 1×1-Tafel-Puzzle: Teile mit Zahlen an die richtige Stelle der Einmaleins-Tafel legen
   ========================================================= */
const PZ_PENALTY = 3000;
function startPuzzle() {
  const rows = shuffle(g2Rows()).slice(0, 4).sort((a, b) => a - b);
  // Jede Zeile: Abschnitte – einige Zahlen stehen schon da, der Rest kommt als Teile (2 oder 3 Felder)
  const given = new Set(), pieces = [];
  rows.forEach((r, ri) => {
    let c = 1;
    while (c <= 10) {
      const left = 11 - c;
      if (Math.random() < 0.28 && left > 2) { const n = Math.random() < 0.6 ? 1 : 2; for (let k = 0; k < n; k++) given.add(`${ri}:${c + k}`); c += n; continue; }
      let n = left <= 3 ? left : Math.random() < 0.55 ? 2 : 3;
      if (left - n === 1) n = left >= 4 ? n + (n === 2 ? 1 : -1) : left; // kein einzelnes Feld am Ende
      if (n === 1) { given.add(`${ri}:${c}`); c++; continue; }
      pieces.push({ ri, c0: c, n, vals: Array.from({ length: n }, (_, k) => rows[ri] * (c + k)) });
      c += n;
    }
  });
  Object.assign(game, { pz: { rows, given, filled: new Set(), pieces: shuffle(pieces), sel: null }, over: false });
  runStart('puzzle', { goal: pieces.length });
  const cell = (ri, c) => {
    const k = `${ri}:${c}`, v = rows[ri] * c;
    return `<div class="pz-cell ${given.has(k) ? 'given' : 'empty'}" data-ri="${ri}" data-c="${c}">${given.has(k) ? v : ''}</div>`;
  };
  $('#view').innerHTML = gameShell('puzzle', `
    ${runHudHTML('bar-hud')}
    <div class="pz-wrap">
      <div class="pz-table" id="pztable" style="--cols:11">
        <div class="pz-h corner">${SIGN()}</div>${Array.from({ length: 10 }, (_, i) => `<div class="pz-h">${i + 1}</div>`).join('')}
        ${rows.map((r, ri) => `<div class="pz-h row">${r}</div>${Array.from({ length: 10 }, (_, i) => cell(ri, i + 1)).join('')}`).join('')}
      </div>
    </div>
    <div class="pz-tray" id="pztray">${game.pz.pieces.map((p, i) => `<div class="pz-piece" data-p="${i}" style="--n:${p.n}">${p.vals.map((v) => `<span>${v}</span>`).join('')}</div>`).join('')}</div>
    <p class="mode-hint">Zieh ein Teil an die richtige Stelle – oder tippe zuerst das Teil und dann das Feld, wo seine erste Zahl hingehört. Ein falscher Platz kostet 3 Sekunden.</p>`);
  pzBind();
}
function pzBind() {
  const tray = $('#pztray');
  let drag = null;
  tray.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.pz-piece');
    if (!el || el.classList.contains('placed') || !runOn()) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const p = game.pz.pieces[+el.dataset.p];
    const grab = Math.max(0, Math.min(p.n - 1, Math.floor(((e.clientX - r.left) / r.width) * p.n)));
    drag = { el, p, grab, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, ghost: null };
    el.setPointerCapture(e.pointerId);
  });
  tray.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      const tbl = $('#pztable .pz-cell.empty');
      const cw = tbl ? tbl.getBoundingClientRect().width : 40;
      const g = drag.el.cloneNode(true);
      g.classList.add('ghost'); g.style.setProperty('--cw', `${cw}px`);
      document.body.appendChild(g);
      drag.ghost = g; drag.cw = cw;
      drag.el.classList.add('lifted');
    }
    const g = drag.ghost;
    g.style.left = `${e.clientX - (drag.grab + 0.5) * drag.cw}px`; g.style.top = `${e.clientY - drag.cw * 0.8}px`;
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pz-cell');
    $$('.pz-cell.hover').forEach((c) => c.classList.remove('hover'));
    if (t && !t.classList.contains('given')) pzCells(t, drag.p, drag.grab).forEach((c) => c?.classList.add('hover'));
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    $$('.pz-cell.hover').forEach((c) => c.classList.remove('hover'));
    d.el.classList.remove('lifted');
    if (d.ghost) {
      d.ghost.remove();
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pz-cell');
      if (t) pzPlace(d.p, +d.el.dataset.p, +t.dataset.ri, +t.dataset.c - d.grab);
      return;
    }
    // nur getippt: auswählen
    $$('.pz-piece.sel').forEach((x) => x.classList.remove('sel'));
    if (game.pz.sel === +d.el.dataset.p) { game.pz.sel = null; return; }
    game.pz.sel = +d.el.dataset.p; d.el.classList.add('sel');
  };
  tray.addEventListener('pointerup', up); tray.addEventListener('pointercancel', up);
  $('#pztable').addEventListener('click', (e) => {
    const t = e.target.closest('.pz-cell');
    if (!t || game.pz.sel == null || !runOn()) return;
    const i = game.pz.sel;
    pzPlace(game.pz.pieces[i], i, +t.dataset.ri, +t.dataset.c);
  });
}
/** Felder, die ein Teil belegen würde, wenn das gegriffene Feld auf t liegt */
function pzCells(t, p, grab = 0) {
  const ri = +t.dataset.ri, c0 = +t.dataset.c - grab;
  return Array.from({ length: p.n }, (_, k) => $(`#pztable .pz-cell[data-ri="${ri}"][data-c="${c0 + k}"]`));
}
function pzPlace(p, idx, ri, c0) {
  const pz = game.pz, r = game.run;
  if (!runOn() || p.done) return;
  const cells = Array.from({ length: p.n }, (_, k) => $(`#pztable .pz-cell[data-ri="${ri}"][data-c="${c0 + k}"]`));
  const fits = cells.every((el, k) => el && el.classList.contains('empty') && !el.classList.contains('filled') && pz.rows[ri] * (c0 + k) === p.vals[k]);
  const pel = $(`#pztray .pz-piece[data-p="${idx}"]`);
  pel?.classList.remove('sel'); pz.sel = null;
  if (!fits) {
    sfx.bad();
    r.penalty += PZ_PENALTY;
    pel?.classList.remove('nope'); void pel?.offsetWidth; pel?.classList.add('nope');
    cells.forEach((el) => { if (el) { el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss'); setTimeout(() => el.classList.remove('miss'), 450); } });
    runWrong();
    return;
  }
  p.done = true;
  sfx.good();
  cells.forEach((el, k) => { el.textContent = p.vals[k]; el.classList.add('filled'); el.style.animationDelay = `${k * 60}ms`; });
  pel?.classList.add('placed');
  sparkle(cells[0], 8);
  runRight();
}
