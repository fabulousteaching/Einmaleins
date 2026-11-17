/* Einmaleins – Spiele. Alle holen ihre Rechnungen aus demselben Gedächtnis wie die Übungen:
   Schwierige Rechnungen kommen auch hier in Abständen wieder, und die Antworten zählen mit. */
'use strict';

const GAMES = [
  { id: 'elfmeter', name: 'Elfmeter', desc: 'Du bist der Ball: ab ins richtige Tor-Eck!', color: 'green', art: '<span class="emo">⚽</span>', bestText: (n) => `${n} Tore`, three: true,
    howto: 'Im Tor stehen Ergebnisse. Tippe auf das richtige – der Ball fliegt los, und du fliegst mit. Bei einer falschen Antwort hält der Torhüter. 10 Elfmeter.' },
  { id: 'meteor', name: 'Meteoriten', desc: 'Im Cockpit: Schiess den richtigen Meteoriten ab.', color: 'night', art: '<span class="emo">☄️</span>', bestText: (n) => `${n} Treffer`, three: true,
    howto: 'Du sitzt im Cockpit deiner Rakete. Meteoriten mit Zahlen rasen auf dich zu. Tippe den mit dem richtigen Ergebnis an, bevor er dich trifft. 3 Schutzschilde – es wird immer schneller.' },
  { id: 'frog', name: 'Frosch-Hüpfen', desc: 'Mit Froschaugen von Seerose zu Seerose.', color: 'lime', art: '<span class="emo">🐸</span>', bestText: (n) => `${n} Reihen`, three: true,
    howto: 'Du bist der Frosch. Tippe auf die Seerose mit der nächsten Zahl der Reihe – und spring! Falsche Seerosen versinken.' },
  { id: 'memory', name: 'Memory', desc: 'Finde zu jeder Rechnung das Ergebnis.', color: 'pink', art: '<span class="emo">🃏</span>', bestText: (ms) => `${Math.round(ms / 1000)} s`,
    howto: 'Tippe eine Rechnung und dann ihr Ergebnis an. Offen: alle Karten sichtbar. Verdeckt: wie das klassische Memory.' },
  { id: 'truefalse', name: 'Stimmt das?', desc: 'Richtig oder falsch? 60 Sekunden Blitzrunde.', color: 'sun', art: '<span class="emo">✅</span>', bestText: (n) => `${n} Punkte`,
    howto: 'Stimmt die Rechnung oder nicht? Du hast 60 Sekunden. Alle 5 richtigen hintereinander gibt es 3 Sekunden dazu. Ist eine Rechnung falsch, siehst du danach immer die richtige.' },
  { id: 'duel', name: 'Duell zu zweit', desc: 'Zwei Kinder, ein Tablet: Wer ist schneller?', color: 'coral', art: '<span class="emo">⚔️</span>',
    howto: 'Legt das Tablet zwischen euch. Wer zuerst das richtige Ergebnis antippt, bekommt den Punkt. Falsch getippt = kurz gesperrt.' },
];
const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));

const game = { id: null, timers: [], raf: 0, picker: null, keyHandler: null };
const gLater = (fn, ms) => { const t = setTimeout(fn, ms); game.timers.push(t); return t; };
function stopGame() {
  game.timers.forEach(clearTimeout); game.timers = [];
  cancelAnimationFrame(game.raf); game.raf = 0;
  clearInterval(game.tick); game.tick = null;
  if (game.keyHandler) { document.removeEventListener('keydown', game.keyHandler); game.keyHandler = null; }
  if (game.stage3d) { game.stage3d.dispose(); game.stage3d = null; }
  game.pick = null; game.frogBack = null; game.over = true;
}
function openGame(id) { if (GAME_BY_ID[id]) go('game', { game: id }); }
function gamePicker(kinds = null) {
  const ps = practiceSettings();
  return createPicker(buildPool(ps, kinds));
}
function setGameKeys(fn) {
  if (game.keyHandler) document.removeEventListener('keydown', game.keyHandler);
  game.keyHandler = (e) => { if (ui.view === 'game' && !ui.modal && !e.metaKey && !e.ctrlKey) fn(e); };
  document.addEventListener('keydown', game.keyHandler);
}
function saveBest(id, val, higherIsBetter = true) {
  const key = `game:${id}`, old = db.prog.best[key];
  const rec = old == null || (higherIsBetter ? val > old : val < old);
  if (rec) { db.prog.best[key] = val; saveDB(); }
  return { rec, old };
}
function gameResultHTML({ st, title, line, extra = '', again = 'game-again' }) {
  return `<div class="result">${stars(st)}<h2>${title}</h2><p class="result-line">${line}</p>${extra}
    <div class="row center"><button class="btn primary big" data-action="${again}">${icon('flip')} Nochmals</button><button class="btn ghost big" data-action="home">Anderes Spiel</button></div></div>`;
}
/** Funken um ein Element (z. B. gefundenes Memory-Paar) */
function sparkle(el, n = 10) {
  if (reduceMotion() || !el) return;
  const r = el.getBoundingClientRect();
  const cols = ['#FFC233', '#FF6B4A', '#22C55E', '#38BDF8', '#F472B6'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.background = cols[i % cols.length];
    document.body.appendChild(s);
    const a = (i / n) * Math.PI * 2, d = 40 + Math.random() * 40;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    s.animate([{ transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 }, { transform: `translate(${x + Math.cos(a) * d}px, ${y + Math.sin(a) * d}px) scale(.2)`, opacity: 0 }], { duration: 600, easing: 'ease-out' }).finished.then(() => s.remove());
  }
}
function gameShell(id, inner, controls = '') {
  const g = GAME_BY_ID[id];
  return `<section class="mode game game-${id} c-${g.color}">
    <div class="mode-bar"><h1 class="mode-title">${esc(g.name)}</h1><div class="mode-controls">${controls}</div></div>
    ${inner}
  </section>`;
}

/* ---------------- Startkarte: Einstellungen und Münze ---------------- */
function gateOptionsHTML(id) {
  const seg = (action, cur, list) => `<div class="seg">${list.map(([v, t]) => `<button class="seg-btn" data-action="${action}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`;
  if (id === 'elfmeter') return seg('elf-level', db.settings.elfLevel === 2 ? 2 : 1, [[1, 'Training (3 Ecken)'], [2, 'Profi (4 Ecken, mit Zeit)']]);
  if (id === 'memory') return seg('mem-mode', db.settings.memOpen !== false, [[true, 'Offen'], [false, 'Verdeckt']]);
  if (id === 'duel') return seg('duel-goal', db.settings.duelGoal || 10, [[5, 'bis 5'], [10, 'bis 10'], [15, 'bis 15']]);
  if (id === 'frog') {
    const ps = practiceSettings();
    if (!ps.reihen.includes(game.frogReihe)) game.frogReihe = weakestReihe();
    return `<div class="gate-reihen">${ps.reihen.map((r) => `<button class="reihe r${((r - 1) % 10) + 1} ${r > 10 ? 'gross' : ''}" data-action="frog-reihe" data-r="${r}" aria-pressed="${r === game.frogReihe}"><b>${r}</b><small>er</small></button>`).join('')}</div>`;
  }
  return '';
}
function renderGame() {
  stopGame();
  game.id = ui.game;
  game.over = false;
  const g = GAME_BY_ID[ui.game];
  if (!g) return;
  const c = coinsOf();
  const free = gamesFree(), can = canPlay();
  const opts = gateOptionsHTML(g.id);
  $('#view').innerHTML = `<section class="mode game gate c-${g.color}">
    <div class="gate-card">
      <span class="gate-art" aria-hidden="true">${g.art}</span>
      <h1>${esc(g.name)}</h1>
      <p class="gate-how">${esc(g.howto)}</p>
      ${opts ? `<div class="gate-opts">${opts}</div>` : ''}
      ${can ? `<button class="btn primary big gate-go" data-action="game-start">${icon('play')} ${free ? 'Spielen' : `Spielen für ${COIN_SVG} ${GAME_COST} Münze`}</button>
        <p class="muted small">${free ? 'Für Lehrpersonen gratis zum Ausprobieren.' : `Du hast ${c.c} ${c.c === 1 ? 'Münze' : 'Münzen'}.`}</p>`
    : `<div class="gate-need">${COIN_SVG}<p><b>Dir fehlt noch eine Münze.</b><br>Münzen verdienst du beim Üben: für jede richtige Antwort gibt es Punkte. ${coinThreshold()} Punkte = 1 Münze.</p></div>
        <button class="btn primary big" data-action="open-ex" data-id="trainer">${icon('keypad')} Zum Trainer</button>`}
      <button class="btn ghost" data-action="home">Zurück</button>
    </div>
  </section>`;
}
const START_2D = { elfmeter: () => startElfmeter(), meteor: () => startMeteor(), frog: () => startFrog(), memory: () => startMemory(), truefalse: () => startTrueFalse(), duel: () => startDuel() };
const START_3D = { elfmeter: () => startElfmeter3D(), meteor: () => startMeteor3D(), frog: () => startFrog3D() };
async function startGameNow() {
  if (!payForGame()) { renderGame(); return; }
  const id = ui.game;
  game.over = false;
  if (START_3D[id] && webglOK()) {
    $('#view').innerHTML = `<section class="mode game gate"><div class="gate-card"><span class="spinner big"></span><p>Die 3D-Welt wird geladen …</p></div></section>`;
    try { await START_3D[id](); return; } catch (e) { console.warn('3D nicht möglich, 2D-Version', e); stopGame(); game.over = false; }
  }
  START_2D[id]?.();
}

/* =========================================================
   ⚽ Elfmeter
   ========================================================= */
const KEEPER_SVG = `<svg viewBox="0 0 80 96" aria-hidden="true"><g class="kp-arms"><path d="M14 40 2 22" stroke="#FFB020" stroke-width="9" stroke-linecap="round"/><path d="M66 40l12-18" stroke="#FFB020" stroke-width="9" stroke-linecap="round"/><circle cx="3" cy="19" r="7" fill="#22C55E"/><circle cx="77" cy="19" r="7" fill="#22C55E"/></g><rect x="20" y="34" width="40" height="34" rx="12" fill="#FFB020"/><path d="M33 40h14v4H33z" fill="#fff" opacity=".7"/><text x="40" y="61" font-size="14" font-weight="800" text-anchor="middle" fill="#7C4A00" font-family="system-ui">1</text><rect x="23" y="64" width="34" height="14" rx="5" fill="#1F2937"/><path d="M28 78v14M52 78v14" stroke="#F2C9A0" stroke-width="7" stroke-linecap="round"/><circle cx="40" cy="22" r="13" fill="#F2C9A0"/><path d="M27 20c0-9 6-14 13-14s13 5 13 14c-4-4-8-5-13-5s-9 1-13 5z" fill="#5B3A1E"/><circle cx="35" cy="23" r="1.8" fill="#1F2937"/><circle cx="45" cy="23" r="1.8" fill="#1F2937"/><path d="M36 28q4 3 8 0" stroke="#1F2937" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const BALL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#1F2937" stroke-width="2"/><path d="M20 12l7 5-2.7 8h-8.6L13 17z" fill="#1F2937"/><path d="M20 12V3.5M27 17l8-3M24.3 25l5 7M15.7 25l-5 7M13 17l-8-3" stroke="#1F2937" stroke-width="2"/></svg>`;
function startElfmeter() {
  const lvl = db.settings.elfLevel === 2 ? 2 : 1;
  Object.assign(game, { picker: gamePicker(), shots: 0, goals: 0, max: 10, level: lvl, hist: [], locked: false });
  $('#view').innerHTML = gameShell('elfmeter', `
    <div class="scoreboard"><div class="shots" id="shots">${'<i></i>'.repeat(10)}</div><div class="score"><span>Tore</span><b id="goals">0</b></div></div>
    <div class="pitch" id="pitch">
      <div class="task-board" id="eboard"></div>
      <div class="goal ${lvl === 2 ? 'four' : ''}" id="goal"><div class="net"></div><div class="targets" id="targets"></div><div class="keeper" id="keeper">${KEEPER_SVG}</div></div>
      <div class="spot"></div>
      <div class="ball" id="ball">${BALL_SVG}</div>
      ${lvl === 2 ? '<div class="shot-clock" id="sclock"><i></i></div>' : ''}
      <div class="pitch-msg" id="pmsg"></div>
    </div>
    <p class="mode-hint">Tippe auf das Tor-Eck mit dem richtigen Ergebnis.${lvl === 2 ? ' Profi: Du hast 6 Sekunden pro Schuss.' : ''}</p>`,
  '');
  setGameKeys((e) => { if (/^[1-4]$/.test(e.key)) { const b = $$('.target')[+e.key - 1]; if (b) elfShoot(b); } });
  elfNext();
}
function elfNext() {
  if (game.shots >= game.max) { elfEnd(); return; }
  const t = game.picker.next();
  game.task = t; game.locked = false;
  const n = game.level === 2 ? 4 : 3;
  const opts = choicesFor(t, n);
  $('#eboard').innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
  $('#targets').innerHTML = opts.map((o, i) => `<button class="target z${i}" data-action="elf-shoot" data-v="${o}" data-z="${i}">${o}</button>`).join('');
  const ball = $('#ball'), keeper = $('#keeper');
  ball.getAnimations().forEach((a) => a.cancel());
  keeper.getAnimations().forEach((a) => a.cancel());
  ball.className = 'ball'; keeper.className = 'keeper';
  $('#goal').classList.remove('shake');
  $('#pmsg').className = 'pitch-msg';
  if (game.level === 2) {
    const c = $('#sclock i');
    c.getAnimations().forEach((a) => a.cancel());
    c.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 6000, fill: 'forwards' });
    game.clockT = gLater(() => elfShoot(null), 6000);
  }
}
function elfShoot(btn) {
  if (game.locked) return;
  game.locked = true;
  clearTimeout(game.clockT);
  $('#sclock i')?.getAnimations().forEach((a) => a.pause());
  const t = game.task;
  const v = btn ? btn.dataset.v : '';
  const ok = recordAnswer(t, v, performance.now() - t.shownAt);
  const targets = $$('.target');
  const right = targets.find((b) => Number(b.dataset.v) === t.answer);
  const pitch = $('#pitch').getBoundingClientRect();
  const ball = $('#ball'), keeper = $('#keeper');
  const aim = btn || targets[rand(targets.length)];
  const br = ball.getBoundingClientRect(), ar = aim.getBoundingClientRect();
  const dx = ar.left + ar.width / 2 - (br.left + br.width / 2), dy = ar.top + ar.height / 2 - (br.top + br.height / 2);
  sfx.kick();
  const anim = !reduceMotion();
  ball.animate([{ transform: 'translate(-50%, 0) scale(1) rotate(0)' }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.5) rotate(540deg)` }], { duration: anim ? 620 : 1, easing: 'cubic-bezier(.2,.75,.35,1)', fill: 'forwards' });
  // Torhüter: hält bei falscher Antwort, springt sonst in die falsche Ecke
  const kr = keeper.getBoundingClientRect();
  const others = targets.filter((b) => b !== aim);
  const diveTo = ok ? pick(others) : aim;
  const dr = diveTo.getBoundingClientRect();
  const kx = dr.left + dr.width / 2 - (kr.left + kr.width / 2);
  const ky = Math.min(0, dr.top + dr.height / 2 - (kr.top + kr.height * 0.35));
  const rot = Math.abs(kx) < 10 ? 0 : kx < 0 ? -62 : 62;
  keeper.animate([{ transform: 'translate(-50%, 0) rotate(0)' }, { transform: `translate(calc(-50% + ${kx}px), ${ky}px) rotate(${rot}deg)` }], { duration: anim ? 480 : 1, delay: anim ? 90 : 0, easing: 'cubic-bezier(.3,.9,.4,1)', fill: 'forwards' });
  game.shots++;
  game.hist.push(ok);
  gLater(() => {
    const msg = $('#pmsg');
    if (ok) {
      game.goals++;
      sfx.win();
      $('#goal').classList.add('shake');
      msg.innerHTML = 'TOR!';
      msg.className = 'pitch-msg show good';
    } else {
      sfx.bad();
      ball.classList.add('caught');
      msg.innerHTML = `${btn ? 'Gehalten!' : 'Zu spät!'}<small>${esc(taskText(t, true))}</small>`;
      msg.className = 'pitch-msg show bad';
      right?.classList.add('right');
    }
    btn?.classList.add(ok ? 'right' : 'wrong');
    $('#goals').textContent = game.goals;
    $$('#shots i').forEach((el, i) => { el.className = i < game.hist.length ? (game.hist[i] ? 'hit' : 'miss') : ''; });
    gLater(elfNext, ok ? 1300 : 2300);
  }, anim ? 600 : 50);
  void pitch;
}
function elfEnd() {
  const st = game.goals >= 9 ? 3 : game.goals >= 7 ? 2 : game.goals >= 5 ? 1 : 0;
  const { rec, old } = saveBest('elfmeter', game.goals);
  if (st >= 2) { sfx.win(); confetti(); }
  $('#view .game').innerHTML = gameResultHTML({
    st, title: ['Weiter trainieren!', 'Gut geschossen!', 'Starke Leistung!', 'Weltmeister!'][st],
    line: `${game.goals} von ${game.max} Elfmetern verwandelt.`,
    extra: rec && old != null ? '<p class="pill good">Neuer Rekord!</p>' : old != null ? `<p class="muted">Rekord: ${old} Tore</p>` : '',
  });
}

/* =========================================================
   ☄️ Meteoriten
   ========================================================= */
const ROCKET_SVG = `<svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 4c12 10 16 26 14 44H18C16 30 20 14 32 4z" fill="#E5E7EB"/><path d="M32 4c6 5 10 12 12 20H20c2-8 6-15 12-20z" fill="#FF6B4A"/><circle cx="32" cy="34" r="6" fill="#38BDF8" stroke="#0E7490" stroke-width="2.5"/><path d="M18 40 6 56l12-2zM46 40l12 16-12-2z" fill="#FF6B4A"/><path d="M22 48h20l-3 8H25z" fill="#9CA3AF"/><path class="flame" d="M26 56h12l-6 18z" fill="#FFC233"/></svg>`;
function startMeteor() {
  Object.assign(game, { picker: gamePicker(), lives: 3, score: 0, wave: [], task: null, over: false, streak: 0, recorded: false, last: 0 });
  $('#view').innerHTML = gameShell('meteor', `
    <div class="space" id="space">
      <div class="stars-bg"></div>
      <div class="hud"><span class="lives" id="lives">${'<i class="on">🛡️</i>'.repeat(3)}</span><span class="m-score">Treffer <b id="mscore">0</b></span></div>
      <div class="ship-wrap"><div class="ship-task" id="mtask"></div><div class="ship" id="ship">${ROCKET_SVG}</div></div>
      <div class="ground"></div>
    </div>
    <p class="mode-hint">Tippe den Meteoriten mit dem richtigen Ergebnis an, bevor er auf dem Boden landet.</p>`);
  gLater(meteorWave, 500);
  game.last = performance.now();
  game.raf = requestAnimationFrame(meteorLoop);
}
function meteorWave() {
  if (game.over) return;
  const space = $('#space');
  if (!space) return;
  game.wave.forEach((m) => m.el.remove());
  const t = game.picker.next();
  game.task = t; game.recorded = false;
  $('#mtask').innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
  const n = game.score >= 12 ? 4 : 3;
  const opts = choicesFor(t, n);
  const W = space.clientWidth, H = space.clientHeight;
  const lane = W / n;
  const dur = clamp(11 - game.score * 0.35, 4.2, 11); // Sekunden bis zum Boden
  game.wave = opts.map((v, i) => {
    const el = document.createElement('button');
    el.className = 'meteor';
    el.dataset.action = 'meteor-hit';
    el.dataset.v = v;
    el.innerHTML = `<span>${v}</span>`;
    el.style.setProperty('--rot', `${rand(360)}deg`);
    space.appendChild(el);
    const size = 78;
    const x = lane * i + (lane - size) / 2 + (Math.random() - 0.5) * Math.max(0, lane - size - 10);
    return { el, x, y: -size * 0.4 - rand(70), v: (H * 0.8) / dur * (0.9 + Math.random() * 0.25), val: v, correct: v === t.answer, dead: false, size };
  });
  game.wave.forEach((m) => { m.el.style.transform = `translate(${m.x}px, ${m.y}px)`; });
  game.task.shownAt = performance.now();
}
function meteorLoop(now) {
  const dt = Math.min(0.05, (now - game.last) / 1000);
  game.last = now;
  const space = $('#space');
  if (!space || game.over) return;
  const groundY = space.clientHeight - 150;
  for (const m of game.wave) {
    if (m.dead) continue;
    m.y += m.v * dt;
    m.el.style.transform = `translate(${m.x}px, ${m.y}px)`;
    if (m.y > groundY && m.correct) { meteorLand(m); break; }
    if (m.y > groundY + 40) { m.dead = true; m.el.classList.add('gone'); }
  }
  game.raf = requestAnimationFrame(meteorLoop);
}
function meteorHit(el) {
  if (game.over) return;
  const m = game.wave.find((x) => x.el === el);
  if (!m || m.dead) return;
  const t = game.task;
  if (m.correct) {
    if (!game.recorded) recordAnswer(t, m.val, performance.now() - t.shownAt);
    game.recorded = true;
    m.dead = true;
    game.score++; game.streak++;
    sfx.zap();
    laser(m);
    el.classList.add('boom');
    game.wave.forEach((x) => { if (x !== m) { x.dead = true; x.el.classList.add('gone'); } });
    $('#mscore').textContent = game.score;
    gLater(meteorWave, 650);
  } else {
    if (!game.recorded) { recordAnswer(t, m.val, performance.now() - t.shownAt); game.recorded = true; }
    sfx.bad();
    game.streak = 0;
    el.classList.add('wrong');
    m.dead = true;
    gLater(() => el.classList.add('gone'), 400);
    game.wave.find((x) => x.correct)?.el.classList.add('hint');
  }
}
function laser(m) {
  const space = $('#space'), ship = $('#ship');
  if (!space || !ship) return;
  const sr = space.getBoundingClientRect(), pr = ship.getBoundingClientRect();
  const x1 = pr.left + pr.width / 2 - sr.left, y1 = pr.top - sr.top;
  const x2 = m.x + m.size / 2, y2 = m.y + m.size / 2;
  const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  const l = document.createElement('i');
  l.className = 'laser';
  l.style.cssText = `left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${ang}deg)`;
  space.appendChild(l);
  setTimeout(() => l.remove(), 260);
  ship.style.setProperty('--tilt', `${clamp((x2 - x1) / 12, -20, 20)}deg`);
}
function meteorLand(m) {
  m.dead = true;
  const t = game.task;
  if (!game.recorded) { recordAnswer(t, '', performance.now() - t.shownAt); game.recorded = true; }
  game.lives--;
  game.streak = 0;
  sfx.boom();
  m.el.classList.add('landed');
  game.wave.forEach((x) => { if (!x.dead) { x.dead = true; x.el.classList.add('gone'); } });
  const space = $('#space');
  space.classList.add('hit');
  const note = document.createElement('div');
  note.className = 'meteor-note';
  note.textContent = taskText(t, true);
  space.appendChild(note);
  setTimeout(() => { space.classList.remove('hit'); note.remove(); }, 1600);
  $$('#lives i').forEach((el, i) => el.classList.toggle('on', i < game.lives));
  if (game.lives <= 0) { game.over = true; gLater(meteorEnd, 1300); return; }
  gLater(meteorWave, 1500);
}
function meteorEnd() {
  stopGame();
  const s = game.score;
  const st = s >= 30 ? 3 : s >= 18 ? 2 : s >= 8 ? 1 : 0;
  const { rec, old } = saveBest('meteor', s);
  if (st >= 2 || rec) { sfx.win(); confetti(); }
  $('#view .game').innerHTML = gameResultHTML({
    st, title: s >= 18 ? 'Die Erde ist gerettet!' : 'Gut gekämpft!',
    line: `${s} Meteoriten abgeschossen.`,
    extra: rec && old != null ? '<p class="pill good">Neuer Rekord!</p>' : old != null ? `<p class="muted">Rekord: ${old}</p>` : '',
  });
}

/* =========================================================
   🐸 Frosch-Hüpfen
   ========================================================= */
function startFrog() {
  const ps = practiceSettings();
  const r = ps.reihen.includes(game.frogReihe) ? game.frogReihe : weakestReihe();
  Object.assign(game, { frogReihe: r, k: 0, dir: 1, done: 0, errs: 0, locked: false, reihenDone: 0, roundErr: 0 });
  $('#view').innerHTML = gameShell('frog', `
    <div class="frog-top"><div class="chain" id="chain"></div></div>
    <div class="pond" id="pond">
      <div class="ripples"></div>
      <div class="pads" id="pads"></div>
      <div class="home-pad"><span class="pad-num" id="curnum">0</span><span class="frog" id="frog">🐸</span></div>
    </div>
    <p class="mode-hint">Hüpf auf die Seerose mit der nächsten Zahl der Reihe.</p>`,
  '');
  frogRound();
}
function frogRound() {
  game.k = game.dir === 1 ? 0 : 11; game.roundErr = 0;
  frogStep();
}
function frogStep() {
  const b = game.frogReihe;
  const nextK = game.k + game.dir;
  const cur = game.k >= 1 && game.k <= 10 ? game.k * b : (game.dir === 1 ? 0 : '');
  $('#curnum').textContent = cur;
  const seen = [];
  for (let k = game.dir === 1 ? 1 : 10; game.dir === 1 ? k <= game.k : k >= game.k; k += game.dir) if (k >= 1 && k <= 10) seen.push(k * b);
  const done = nextK < 1 || nextK > 10;
  $('#chain').innerHTML = `<span class="chain-title">${b}er-Reihe ${game.dir === 1 ? 'vorwärts' : 'rückwärts'}</span><span class="chain-nums">${seen.map((x) => `<b>${x}</b>`).join('')}${done ? '' : '<b class="q">?</b>'}</span>`;
  if (done) { frogReiheDone(); return; }
  const target = nextK * b;
  const cand = new Set([target]);
  const near = shuffle([target + 1, target - 1, target + 2, target - 2, target + b, target - b, target + 10, target - 10]).filter((x) => x > 0 && x !== target && x !== cur);
  for (const x of near) { if (cand.size >= 3) break; cand.add(x); }
  game.task = { ...makeTask(nextK, b, 'mul'), shownAt: performance.now() };
  game.locked = false;
  $('#pads').innerHTML = shuffle([...cand]).map((v, i) => `<button class="lily p${i}" data-action="frog-jump" data-v="${v}"><span>${v}</span></button>`).join('');
}
function frogJump(btn) {
  if (game.locked) return;
  const t = game.task;
  const v = Number(btn.dataset.v);
  if (v === t.answer) {
    game.locked = true;
    sfx.jump();
    const frog = $('#frog'), fr = frog.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const dx = br.left + br.width / 2 - (fr.left + fr.width / 2), dy = br.top + br.height / 2 - (fr.top + fr.height / 2);
    btn.classList.add('right');
    frog.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx / 2}px, ${dy / 2 - 60}px) scale(1.35)` }, { transform: `translate(${dx}px, ${dy}px) scale(1)` }], { duration: reduceMotion() ? 1 : 520, easing: 'ease-in-out', fill: 'forwards' });
    gLater(() => {
      frog.getAnimations().forEach((a) => a.cancel());
      game.k += game.dir;
      game.done++;
      frogStep();
    }, 600);
  } else {
    // Hüpfen in der Reihe ist leichter als freies Rechnen: nur Fehler zählen fürs Gedächtnis
    recordAnswer(t, v, performance.now() - t.shownAt);
    game.errs++; game.roundErr++;
    sfx.splash();
    btn.classList.add('sink');
    btn.disabled = true;
  }
}
function frogReiheDone() {
  game.reihenDone++;
  sfx.win();
  const st = game.roundErr === 0 ? 3 : game.roundErr <= 2 ? 2 : 1;
  if (st === 3) confetti();
  const { rec } = saveBest('frog', game.reihenDone);
  const b = game.frogReihe;
  const ps = practiceSettings();
  const nextR = ps.reihen[(ps.reihen.indexOf(b) + 1) % ps.reihen.length];
  $('#pads').innerHTML = `<div class="frog-done">${stars(st)}<h2>${b}er-Reihe ${game.dir === 1 ? 'vorwärts' : 'rückwärts'} geschafft!</h2>
    <p>${game.roundErr ? `${game.roundErr} ${game.roundErr === 1 ? 'Fehlsprung' : 'Fehlsprünge'}` : 'Ohne einen Fehlsprung!'}${rec ? ' · Neuer Rekord!' : ''}</p>
    <div class="row center">
      ${game.dir === 1 ? `<button class="btn primary" data-action="frog-back">${icon('left')} Jetzt rückwärts</button>` : ''}
      <button class="btn ${game.dir === 1 ? 'secondary' : 'primary'}" data-action="frog-reihe" data-r="${nextR}">${nextR}er-Reihe ${icon('right')}</button>
    </div></div>`;
}

/* =========================================================
   🃏 Memory
   ========================================================= */
function startMemory() {
  const open = db.settings.memOpen !== false;
  const picker = gamePicker({ mul: true });
  const pairs = [], prods = new Set(), facts = new Set();
  for (let i = 0; i < 80 && pairs.length < 6; i++) {
    const t = picker.next();
    if (prods.has(t.p) || facts.has(t.fact)) continue;
    prods.add(t.p); facts.add(t.fact); pairs.push(t);
  }
  const cards = shuffle(pairs.flatMap((t, i) => [{ id: i, kind: 'task', t }, { id: i, kind: 'res', t }]));
  Object.assign(game, { open, pairs, cards, sel: null, found: 0, moves: 0, errs: 0, combo: 0, t0: performance.now(), locked: false });
  $('#view').innerHTML = gameShell('memory', `
    <div class="mem-bar"><span>${icon('clock')} <b id="memt">0</b> s</span><span>Paare <b id="memf">0</b>/${pairs.length}</span>${open ? '' : '<span>Züge <b id="memm">0</b></span>'}<span class="mem-combo" id="memcombo"></span></div>
    <div class="mem-grid ${open ? 'open' : ''}" id="memgrid">${cards.map((c, i) => `<button class="mem-card ${c.kind} deal" style="--d:${i * 45}ms" data-action="mem-flip" data-i="${i}" aria-label="${open ? (c.kind === 'task' ? taskText({ ...c.t, op: 'mul' }) : c.t.p) : 'Karte'}"><span class="mc-in"><span class="mc-back" aria-hidden="true">${BRAND_SVG('mcb' + i)}</span><span class="mc-face">${c.kind === 'task' ? `${c.t.a}<em>${SIGN()}</em>${c.t.b}` : c.t.p}</span></span></button>`).join('')}</div>
    <p class="mode-hint">${open ? 'Tippe eine Rechnung und dann ihr Ergebnis an.' : 'Decke zwei Karten auf: Rechnung und Ergebnis gehören zusammen.'}</p>`,
  '');
  game.tick = setInterval(() => { const el = $('#memt'); if (el) el.textContent = Math.floor((performance.now() - game.t0) / 1000); }, 250);
  pairs.forEach((t) => { t.shownAt = performance.now(); });
}
function memFlip(btn) {
  if (game.locked) return;
  const i = +btn.dataset.i, c = game.cards[i];
  if (c.done || game.sel === i) { if (game.open && game.sel === i) { btn.classList.remove('sel'); game.sel = null; } return; }
  sfx.flip();
  if (!game.open) btn.classList.add('up');
  btn.classList.add('sel');
  if (game.sel == null) { game.sel = i; if (game.open) game.selAt = performance.now(); return; }
  const j = game.sel, d = game.cards[j], other = $(`.mem-card[data-i="${j}"]`);
  game.sel = null;
  if (game.open && d.kind === c.kind) { other.classList.remove('sel'); game.sel = i; return; } // zwei Rechnungen: neue Wahl
  game.moves++;
  if ($('#memm')) $('#memm').textContent = game.moves;
  const match = c.id === d.id && c.kind !== d.kind;
  if (game.open) {
    const task = c.kind === 'task' ? c.t : d.t, val = c.kind === 'res' ? c.t.p : d.t.p;
    recordAnswer({ ...task, op: 'mul', answer: task.p }, val, performance.now() - (game.lastFound || game.t0));
  }
  if (match) {
    c.done = d.done = true;
    game.found++;
    game.combo++;
    game.lastFound = performance.now();
    sfx.good();
    [btn, other].forEach((b) => { b.classList.remove('sel'); b.classList.add('done'); sparkle(b); });
    $('#memf').textContent = game.found;
    const cb = $('#memcombo');
    if (cb && game.combo >= 2) { cb.textContent = `${game.combo}er-Kombo!`; cb.classList.remove('show'); void cb.offsetWidth; cb.classList.add('show'); tone([660 + game.combo * 80], 0.08, 'triangle', 0.08); }
    if (game.found === game.pairs.length) gLater(memoryEnd, 700);
  } else {
    game.errs++;
    game.combo = 0;
    sfx.bad();
    game.locked = true;
    [btn, other].forEach((b) => b.classList.add('nope'));
    gLater(() => { [btn, other].forEach((b) => b.classList.remove('nope', 'sel', 'up')); game.locked = false; }, game.open ? 550 : 1000);
  }
}
function memoryEnd() {
  clearInterval(game.tick);
  const ms = Math.round(performance.now() - game.t0);
  const st = game.open ? (game.errs === 0 ? 3 : game.errs <= 2 ? 2 : 1) : (game.moves <= 9 ? 3 : game.moves <= 13 ? 2 : 1);
  const { rec, old } = game.open ? saveBest('memory', ms, false) : { rec: false, old: null };
  if (st >= 2) { sfx.win(); confetti(); }
  $('#view .game').innerHTML = gameResultHTML({
    st, title: 'Alle Paare gefunden!',
    line: `${Math.round(ms / 1000)} Sekunden${game.open ? `, ${game.errs} ${game.errs === 1 ? 'Fehler' : 'Fehler'}` : `, ${game.moves} Züge`}.`,
    extra: rec && old != null ? '<p class="pill good">Neue Bestzeit!</p>' : old != null ? `<p class="muted">Bestzeit (offen): ${Math.round(old / 1000)} s</p>` : '',
  });
}

/* =========================================================
   ✅ Stimmt das? (60 Sekunden)
   ========================================================= */
function startTrueFalse() {
  Object.assign(game, { picker: gamePicker(), score: 0, streak: 0, best: 0, left: 60000, last: performance.now(), paused: false, stmt: null, over: false, wrongs: [] });
  $('#view').innerHTML = gameShell('truefalse', `
    <div class="tf-top"><div class="tf-time"><i id="tfbar"></i></div><span class="tf-score">Punkte <b id="tfs">0</b></span></div>
    <div class="tf-streak" id="tfstreak" aria-label="Serie">${'<i></i>'.repeat(5)}<span id="tfbonus" class="tf-bonus"></span></div>
    <div class="tf-deck" id="tfdeck"></div>
    <div class="tf-btns">
      <button class="tf-btn no" data-action="tf-answer" data-v="0">${icon('x')}<span>Stimmt nicht</span></button>
      <button class="tf-btn yes" data-action="tf-answer" data-v="1">${icon('check')}<span>Stimmt</span></button>
    </div>
    <p class="mode-hint">Wische die Karte nach rechts (stimmt) oder links (stimmt nicht) – oder tippe auf die Knöpfe. Pfeiltasten gehen auch.</p>`);
  setGameKeys((e) => { if (e.key === 'ArrowLeft') tfAnswer(false); if (e.key === 'ArrowRight') tfAnswer(true); });
  tfNext();
  const loop = (now) => {
    if (game.over) return;
    const dt = Math.min(100, now - game.last); game.last = now;
    if (!game.paused) game.left -= dt;
    const bar = $('#tfbar');
    if (bar) { bar.style.transform = `scaleX(${clamp(game.left / 60000, 0, 1)})`; bar.classList.toggle('low', game.left < 10000); }
    if (game.left <= 0) { tfEnd(); return; }
    game.raf = requestAnimationFrame(loop);
  };
  game.raf = requestAnimationFrame(loop);
}
function tfNext() {
  if (game.over) return;
  const t = game.picker.next();
  const truth = Math.random() < 0.5;
  const shown = truth ? t.answer : distractors(t, 1)[0];
  game.stmt = { t, shown, truth: shown === t.answer };
  game.locked = false;
  const deck = $('#tfdeck');
  if (!deck) return;
  const card = document.createElement('div');
  card.className = 'tf-card task-card in';
  card.innerHTML = `<div class="task">${taskHTML(t, `<span class="num shown">${shown}</span>`)}</div><div class="tf-note"></div>`;
  deck.appendChild(card);
  game.card = card;
  // Wischen: Karte ziehen, beim Loslassen entscheidet die Richtung
  let x0 = null, dx = 0;
  card.addEventListener('pointerdown', (e) => { if (game.locked) return; x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.classList.add('drag'); });
  card.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    dx = e.clientX - x0;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.classList.toggle('lean-yes', dx > 40);
    card.classList.toggle('lean-no', dx < -40);
  });
  const up = () => {
    if (x0 == null) return;
    x0 = null;
    card.classList.remove('drag', 'lean-yes', 'lean-no');
    if (Math.abs(dx) > 70) tfAnswer(dx > 0);
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}
function tfFloat(text, cls) {
  const deck = $('#tfdeck');
  if (!deck) return;
  const f = document.createElement('span');
  f.className = `tf-float ${cls}`;
  f.textContent = text;
  deck.appendChild(f);
  setTimeout(() => f.remove(), 900);
}
function tfAnswer(says) {
  if (game.locked || game.over || !game.stmt) return;
  game.locked = true;
  const { t, shown, truth } = game.stmt;
  const ok = says === truth;
  // fürs Gedächtnis: richtig erkannt = gewusst; „stimmt“ bei falschem Ergebnis = diese Verwechslung
  recordAnswer(t, ok ? t.answer : (says ? shown : ''), performance.now() - t.shownAt);
  const card = game.card;
  const leave = (delay) => gLater(() => {
    card.classList.add(says ? 'out-yes' : 'out-no');
    card.style.transform = '';
    setTimeout(() => card.remove(), 450);
    tfNext();
  }, delay);
  if (ok) {
    game.score++; game.streak++; game.best = Math.max(game.best, game.streak);
    sfx.good();
    card.classList.add('good');
    tfFloat('+1', 'good');
    if (game.streak % 5 === 0) { game.left += 3000; const b = $('#tfbonus'); b.textContent = '+3 s'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); tone([880, 1175], 0.08, 'triangle', 0.1); }
    $('#tfs').textContent = game.score;
  } else {
    game.streak = 0;
    sfx.bad();
    game.wrongs.push(t);
    card.classList.add('bad');
  }
  const lit = game.streak % 5 || (game.streak ? 5 : 0);
  $$('#tfstreak i').forEach((el, i) => el.classList.toggle('on', i < lit));
  // Ist die Rechnung falsch, zeigen wir immer die richtige – auch wenn das Kind es richtig erkannt hat
  if (!truth || !ok) {
    game.paused = true;
    const note = card.querySelector('.tf-note');
    note.innerHTML = truth
      ? `<span class="tf-sol">Stimmt doch: <b>${esc(taskText(t, true))}</b></span>`
      : `<span class="tf-sol">${ok ? 'Gut erkannt!' : 'Leider falsch.'} Richtig ist <b>${esc(taskText(t, true))}</b></span>`;
    card.querySelector('.num.shown')?.classList.add(truth ? 'is-true' : 'strike');
    const wait = ok ? 1150 : 1800;
    gLater(() => { game.paused = false; }, wait);
    leave(wait);
  } else leave(170);
}
function tfEnd() {
  game.over = true;
  stopGame();
  const s = game.score;
  const st = s >= 30 ? 3 : s >= 20 ? 2 : s >= 10 ? 1 : 0;
  const { rec, old } = saveBest('truefalse', s);
  if (st >= 2 || rec) { sfx.win(); confetti(); }
  $('#view .game').innerHTML = gameResultHTML({
    st, title: 'Zeit ist um!', line: `${s} Punkte · längste Serie: ${game.best}`,
    extra: (rec && old != null ? '<p class="pill good">Neuer Rekord!</p>' : old != null ? `<p class="muted">Rekord: ${old}</p>` : '')
      + (game.wrongs.length ? `<div class="mistakes"><p class="label">Merk dir</p><ul>${[...new Map(game.wrongs.map((t) => [t.key + t.op, t])).values()].map((t) => `<li><span class="m-task">${esc(taskText(t, true))}</span></li>`).join('')}</ul></div>` : ''),
  });
}

/* =========================================================
   ⚔️ Duell zu zweit
   ========================================================= */
function startDuel() {
  const goal = db.settings.duelGoal || 10;
  Object.assign(game, { picker: gamePicker(), pts: [0, 0], goal, lock: [0, 0], task: null, over: false, roundDone: false });
  const half = (p) => `<div class="duel-half p${p}" id="dh${p}">
      <div class="dh-head"><span class="dh-name">${p === 0 ? 'Spieler Rot' : 'Spieler Blau'}</span><span class="dh-pts"><b id="dp${p}">0</b>/${goal}</span></div>
      <div class="dh-task" id="dt${p}"></div>
      <div class="dh-opts" id="do${p}"></div>
    </div>`;
  $('#view').innerHTML = gameShell('duel', `
    <div class="duel" id="duel">${half(0)}<div class="duel-mid"><span class="rope" aria-hidden="true"><i id="ropeknot"></i></span><span class="vs">VS</span></div>${half(1)}
      <div class="duel-count" id="duelcount"></div></div>
    <p class="mode-hint">Legt das Tablet zwischen euch. Wer zuerst richtig tippt, bekommt den Punkt. Falsch getippt = kurz gesperrt.</p>`,
  '');
  // Countdown 3 – 2 – 1 – Los!
  game.roundDone = true;
  const cd = $('#duelcount');
  ['3', '2', '1', 'Los!'].forEach((x, i) => gLater(() => {
    cd.textContent = x; cd.classList.remove('show'); void cd.offsetWidth; cd.classList.add('show');
    tone([i < 3 ? 520 : 880], 0.12, 'triangle', 0.1);
    if (i === 3) { gLater(() => { cd.textContent = ''; }, 500); duelNext(); }
  }, i * 650));
}
/** Seilziehen: Der Knoten wandert zum Kind, das vorne liegt */
function duelRope() {
  const k = $('#ropeknot');
  if (!k) return;
  const diff = (game.pts[1] - game.pts[0]) / game.goal;
  k.style.setProperty('--pos', `${50 + clamp(diff, -1, 1) * 45}%`);
}
function duelNext() {
  const t = game.picker.next();
  game.task = t; game.roundDone = false;
  const opts = choicesFor(t, 4);
  [0, 1].forEach((p) => {
    $(`#dt${p}`).innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
    $(`#do${p}`).innerHTML = shuffle(opts).map((o) => `<button class="choice" data-action="duel-tap" data-p="${p}" data-v="${o}">${o}</button>`).join('');
    $(`#dh${p}`).classList.remove('win', 'locked');
  });
}
function duelTap(btn) {
  const p = +btn.dataset.p, v = Number(btn.dataset.v);
  if (game.over || game.roundDone || game.lock[p] > performance.now()) return;
  const t = game.task;
  if (v === t.answer) {
    game.roundDone = true;
    game.pts[p]++;
    sfx.good();
    btn.classList.add('right');
    $(`#dh${p}`).classList.add('win');
    $(`#dp${p}`).textContent = game.pts[p];
    $(`#dp${p}`).classList.remove('pop'); void $(`#dp${p}`).offsetWidth; $(`#dp${p}`).classList.add('pop');
    sparkle(btn, 12);
    duelRope();
    $$(`#do${1 - p} .choice`).forEach((b) => { if (Number(b.dataset.v) === t.answer) b.classList.add('right'); });
    if (game.pts[p] >= game.goal) { game.over = true; gLater(() => duelEnd(p), 900); return; }
    gLater(duelNext, 1000);
  } else {
    sfx.bad();
    btn.classList.add('wrong');
    game.lock[p] = performance.now() + 1500;
    const h = $(`#dh${p}`);
    h.classList.add('locked');
    gLater(() => h.classList.remove('locked'), 1500);
  }
}
function duelEnd(p) {
  sfx.win(); confetti();
  $('#view .game').innerHTML = gameResultHTML({
    st: 3, title: `${p === 0 ? 'Rot' : 'Blau'} gewinnt!`,
    line: `${game.pts[0]} : ${game.pts[1]}`,
  });
}
