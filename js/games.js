/* Einmaleins – Spiele. Alle holen ihre Rechnungen aus demselben Gedächtnis wie die Übungen:
   Schwierige Rechnungen kommen auch hier in Abständen wieder, und die Antworten zählen mit.

   Spielmodi (Elfmeter, Meteoriten, Frosch, Stimmt das?; Memory nur Speed):
   - Countdown: in 60 Sekunden möglichst viele richtige Antworten
   - Survive:   3 Leben, so lange wie möglich durchhalten
   - Speed:     20 richtige so schnell wie möglich; jede falsche verlangt eine Rechnung mehr
   Am Ende: Ergebnis und Bestenliste der Klasse (Top 10, bestes Ergebnis pro Kind, eigener Rang). */
'use strict';

const GAMES = [
  { id: 'elfmeter', name: 'Elfmeter', desc: 'Schiess den Ball durch die richtige Zahl ins Tor!', color: 'green', art: '<span class="emo">⚽</span>', three: true, modes: ['countdown', 'survive', 'speed'],
    howto: 'Im Tor schweben Zahlen. Tippe auf das richtige Ergebnis – der Ball fliegt durch die Zahl ins Netz, die Zahl zerbricht. Bei einer falschen Zahl geht der Schuss daneben.' },
  { id: 'meteor', name: 'Meteoriten', desc: 'Im Cockpit: Schiess den richtigen Meteoriten ab.', color: 'night', art: '<span class="emo">☄️</span>', three: true, modes: ['countdown', 'survive', 'speed'],
    howto: 'Du sitzt im Cockpit deiner Rakete. Meteoriten mit Zahlen rasen auf dich zu. Tippe den mit dem richtigen Ergebnis an, bevor er dich trifft.' },
  { id: 'frog', name: 'Frosch-Hüpfen', desc: 'Hüpf über den Teich – hin und zurück.', color: 'lime', art: '<span class="emo">🐸</span>', three: true, modes: ['countdown', 'survive', 'speed'],
    howto: 'Der Frosch hüpft über den Teich. Tippe auf die Seerose mit dem richtigen Ergebnis – und hopp! Am Ufer springt er auf einen Stein und kehrt um. Falsche Seerosen versinken.' },
  { id: 'truefalse', name: 'Stimmt das?', desc: 'Richtig oder falsch? Wisch dich durch.', color: 'sun', art: '<span class="emo">✅</span>', modes: ['countdown', 'survive', 'speed'],
    howto: 'Stimmt die Rechnung oder nicht? Wische nach rechts (stimmt) oder links (stimmt nicht). Ist eine Rechnung falsch, siehst du danach immer die richtige.' },
  { id: 'memory', name: 'Memory', desc: 'Finde so schnell wie möglich alle Paare.', color: 'pink', art: '<span class="emo">🃏</span>', modes: ['speed'],
    howto: 'Alle Karten liegen offen. Tippe eine Rechnung und dann ihr Ergebnis an – so schnell wie möglich. Ein falsches Paar kostet 3 Sekunden.' },
  { id: 'duel', name: 'Duell zu zweit', desc: 'Zwei Kinder, ein Tablet: Wer ist schneller?', color: 'coral', art: '<span class="emo">⚔️</span>', modes: [],
    howto: 'Legt das Tablet zwischen euch. Wer zuerst das richtige Ergebnis antippt, bekommt den Punkt. Falsch getippt = kurz gesperrt.' },
];
const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));

const game = { id: null, timers: [], raf: 0, picker: null, keyHandler: null };
const gLater = (fn, ms) => { const t = setTimeout(fn, ms); game.timers.push(t); return t; };
function stopGame() {
  game.timers.forEach(clearTimeout); game.timers = [];
  cancelAnimationFrame(game.raf); game.raf = 0;
  clearInterval(game.tick); game.tick = null;
  clearInterval(game.runTimer); game.runTimer = null;
  if (game.keyHandler) { document.removeEventListener('keydown', game.keyHandler); game.keyHandler = null; }
  if (game.stage3d) { game.stage3d.dispose(); game.stage3d = null; }
  game.pick = null; game.pickVal = null; game.over = true; game.run = null;
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

/* =========================================================
   Spielmodi: gemeinsame Runde (Zeit, Leben, Fortschritt)
   ========================================================= */
const RUN = { ms: 60000, goal: 20, lives: 3 };
const HEART_SVG = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2 10.6 20C5.4 15.3 2 12.2 2 8.4 2 5.3 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.3 22 8.4c0 3.8-3.4 6.9-8.6 11.6z"/></svg>';
const GAME_MODES = {
  countdown: { name: 'Countdown', icon: () => icon('clock'), short: '60 Sekunden',
    desc: () => 'Möglichst viele richtige Antworten in 60 Sekunden. Extrazeit gibt es nicht.' },
  survive: { name: 'Survive', icon: () => HEART_SVG, short: '3 Leben',
    desc: (id) => `3 Leben – halte so lange wie möglich durch. Jede falsche Antwort kostet ein Leben. Alle 5 richtigen kommt ein neues Level, und du hast 10 % weniger Zeit pro Rechnung.${id === 'meteor' ? ' Beim letzten Leben fliegt ab und zu ein Ufo vorbei: Triffst du es, gibt es ein Extraleben.' : ''}` },
  speed: { name: 'Speed', icon: () => icon('bolt'), short: '20 richtige',
    desc: (id) => (id === 'memory' ? 'Finde alle Paare so schnell wie möglich. Ein falsches Paar kostet 3 Sekunden.' : '20 richtige Antworten – so schnell wie möglich. Jede falsche verlangt eine Rechnung mehr.') },
};
const modesOf = (id) => GAME_BY_ID[id]?.modes || [];
function gameModeOf(id) {
  const list = modesOf(id), m = db.settings.gm?.[id];
  return list.includes(m) ? m : list[0];
}
const boardOf = (id, mode) => `${id}:${mode}:${practiceSettings().op}`;
const fmtSec = (ms, d = 1) => (ms / 1000).toFixed(d).replace('.', ',');
const fmtScore = (v, lower) => (lower ? `${fmtSec(v)} s` : String(v));
const runOn = () => !!(game.run && !game.run.done);

function runStart(id, { goal = RUN.goal, onEnd = null } = {}) {
  clearInterval(game.runTimer);
  const mode = gameModeOf(id);
  game.run = { id, mode, goal, ok: 0, wrong: 0, lives: RUN.lives, maxLives: RUN.lives, t0: performance.now(), end: 0, pausedAt: 0, done: false, penalty: 0, streak: 0, best: 0, wrongs: [], onEnd };
  game.runTimer = setInterval(runTick, 100);
  return game.run;
}
function runElapsed() {
  const r = game.run;
  if (!r) return 0;
  const now = r.end || r.pausedAt || performance.now();
  return now - r.t0 + r.penalty;
}
const runLeft = () => Math.max(0, RUN.ms - runElapsed());
/** Uhr kurz anhalten (z. B. während die richtige Lösung gezeigt wird) */
function runPause(on) {
  const r = game.run;
  if (!r || r.done) return;
  if (on && !r.pausedAt) r.pausedAt = performance.now();
  else if (!on && r.pausedAt) { r.t0 += performance.now() - r.pausedAt; r.pausedAt = 0; }
}
function runTick() {
  if (!runOn()) return;
  if (game.run.mode === 'countdown' && runLeft() <= 0) { runFinish('time'); return; }
  runHud();
}
/** Anzeige: Leben (Survive), Zeit (Countdown/Speed) und richtige Antworten */
function runHudHTML(cls = '') {
  const r = game.run;
  if (!r) return '';
  const m = r.mode;
  return `<div class="run-hud ${cls} m-${m}">
    ${m === 'survive' ? `<span class="run-lives" data-run="lives" aria-label="Leben">${HEART_SVG.repeat(r.maxLives)}</span><span class="run-level" data-run="levelbox">Level <b data-run="level">1</b><em class="run-levelup" data-run="levelup">schneller!</em></span>` : ''}
    ${m === 'countdown' ? `<span class="run-clock"><span class="run-bar"><i data-run="bar"></i></span><b data-run="time">${RUN.ms / 1000}</b><small>s</small></span>` : ''}
    ${m === 'speed' ? `<span class="run-clock">${icon('clock')}<b data-run="time">0,0</b><small>s</small></span>` : ''}
    <span class="run-ok" data-run="okbox">${icon('check')}<b data-run="ok">0</b>${m === 'speed' ? `<small>/${r.goal}</small>` : ''}</span>
  </div>`;
}
function runHud() {
  const r = game.run;
  if (!r) return;
  $$('[data-run="ok"]').forEach((el) => { el.textContent = r.ok; });
  if (r.mode === 'countdown') {
    const left = runLeft();
    $$('[data-run="time"]').forEach((el) => { el.textContent = Math.ceil(left / 1000); });
    $$('[data-run="bar"]').forEach((el) => { el.style.transform = `scaleX(${left / RUN.ms})`; el.parentNode.classList.toggle('low', left < 10000); });
  } else if (r.mode === 'speed') $$('[data-run="time"]').forEach((el) => { el.textContent = fmtSec(runElapsed()); });
  $$('[data-run="lives"]').forEach((el) => [...el.children].forEach((h, i) => h.classList.toggle('off', i >= r.lives)));
  $$('[data-run="level"]').forEach((el) => { el.textContent = surviveLevel(); });
  game.onRunHud?.(r);
}
const runPop = (sel, cls) => $$(sel).forEach((el) => { el.classList.toggle(cls, false); void el.offsetWidth; el.classList.add(cls); });
/** Richtige Antwort (auf Anhieb). Liefert true, wenn die Runde damit fertig ist (Speed: Ziel erreicht). */
function runRight() {
  const r = game.run;
  if (!runOn()) return true;
  r.ok++; r.streak++; r.best = Math.max(r.best, r.streak);
  runHud();
  runPop('[data-run="okbox"]', 'pop');
  if (r.mode === 'speed' && r.ok >= r.goal) { runFinish('done'); return true; }
  // Survive: alle 5 richtigen ein neues Level – ab jetzt bleibt etwas weniger Zeit
  if (r.mode === 'survive' && r.ok % SURVIVE.step === 0) {
    runPop('[data-run="levelbox"]', 'up');
    tone([660, 880, 1175], 0.07, 'triangle', 0.07);
  }
  return false;
}
/** Falsche Antwort oder zu spät. Survive: kostet ein Leben. Liefert true, wenn die Runde damit fertig ist. */
function runWrong(t = null) {
  const r = game.run;
  if (!runOn()) return true;
  r.wrong++; r.streak = 0;
  if (t) r.wrongs.push(t);
  if (r.mode === 'survive') {
    r.lives--;
    $$('[data-run="lives"]').forEach((el) => { const h = el.children[r.lives]; if (h) { h.classList.toggle('lost', false); void h.getBoundingClientRect(); h.classList.add('lost'); } });
    runHud();
    if (r.lives <= 0) { runFinish('lives'); return true; }
  } else {
    runHud();
    runPop('[data-run="okbox"]', 'miss');
  }
  return false;
}
function runGainLife() {
  const r = game.run;
  if (!runOn()) return;
  r.lives = Math.min(r.maxLives, r.lives + 1);
  runHud();
  $$('[data-run="lives"]').forEach((el) => { const h = el.children[r.lives - 1]; if (h) { h.classList.toggle('gain', false); void h.getBoundingClientRect(); h.classList.add('gain'); } });
}
/* Survive: Alle 5 richtigen Antworten kommt ein neues Level, und die Zeit pro Rechnung wird 10 % kürzer.
   Es gibt keine feste Untergrenze ausser der Zeit, die man mindestens zum Lesen und Tippen braucht –
   so geht auch eine sehr gute Runde nach ein paar Minuten zu Ende. */
const SURVIVE = { step: 5, factor: 0.9 };
const surviveLevel = () => Math.floor((game.run?.ok || 0) / SURVIVE.step) + 1;
/** Zeit für eine Rechnung im aktuellen Level (start: Level 1, min: kürzest mögliche Zeit) */
const surviveMs = (start, min) => Math.max(min, start * SURVIVE.factor ** (surviveLevel() - 1));
function taskClock(el, ms, onTimeout) {
  if (!el) return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, fill: 'forwards' });
  clearTimeout(game.taskT);
  game.taskT = gLater(onTimeout, ms);
}
function taskClockStop(el) {
  clearTimeout(game.taskT);
  el?.getAnimations().forEach((a) => a.pause());
}
function runFinish(why) {
  const r = game.run;
  if (!runOn()) return;
  runPause(false);
  r.done = true; r.end = performance.now(); r.why = why;
  clearInterval(game.runTimer);
  game.over = true;
  try { r.onEnd?.(why); } catch (e) { console.warn(e); }
  if (why === 'time') { sfx.bad(); tone([880, 660, 440], 0.12, 'triangle', 0.08); }
  setTimeout(() => { if (game.run === r && ui.view === 'game') showRunResult(r); }, why === 'time' ? 500 : 1000);
}

/* ---------------- Ergebnis und Bestenliste ---------------- */
// Sterne: [1, 2, 3 Sterne]; Speed in Sekunden (weniger ist besser)
const STAR_LIMITS = {
  countdown: { elfmeter: [6, 11, 16], meteor: [6, 11, 16], frog: [6, 11, 16], truefalse: [12, 22, 32] },
  survive: { elfmeter: [6, 12, 20], meteor: [6, 12, 20], frog: [6, 12, 20], truefalse: [10, 20, 35] },
  speed: { elfmeter: [140, 100, 75], meteor: [140, 100, 70], frog: [150, 110, 80], truefalse: [90, 60, 40], memory: [80, 50, 32] },
};
function runStars(r, score) {
  const l = STAR_LIMITS[r.mode]?.[r.id];
  if (!l) return 1;
  if (r.mode === 'speed') { const s = score / 1000; return s <= l[2] ? 3 : s <= l[1] ? 2 : s <= l[0] ? 1 : 0; }
  return score >= l[2] ? 3 : score >= l[1] ? 2 : score >= l[0] ? 1 : 0;
}
const localBestKey = (board) => `b:${board}`;
/** Persönlicher Rekord für die Kachel und die Startkarte (aktuelle Aufgabenart, gewählter Modus) */
function gameBestText(id) {
  const mode = gameModeOf(id);
  if (!mode) return null;
  const v = db.prog.best[localBestKey(boardOf(id, mode))];
  if (v == null) return null;
  return `${GAME_MODES[mode].name}: ${mode === 'speed' ? `${fmtSec(v)} s` : `${v} richtig`}`;
}
function showRunResult(r) {
  stopGame();
  const lower = r.mode === 'speed';
  const score = lower ? Math.round(r.end - r.t0 + r.penalty) : r.ok;
  const board = boardOf(r.id, r.mode);
  const key = localBestKey(board), old = db.prog.best[key];
  const valid = lower ? r.ok >= r.goal : score > 0;
  const rec = valid && (old == null || (lower ? score < old : score > old));
  if (rec) { db.prog.best[key] = score; saveDB(); }
  const st = runStars(r, score);
  if (st >= 2 || rec) { sfx.win(); confetti(); }
  const title = { time: 'Zeit ist um!', lives: 'Keine Leben mehr!', done: r.id === 'memory' ? 'Alle Paare gefunden!' : 'Geschafft!' }[r.why] || 'Fertig!';
  const line = lower
    ? `${r.id === 'memory' ? `${r.goal} Paare` : `${r.goal} richtige`} in <b>${fmtSec(score)} s</b>${r.wrong ? ` · ${r.wrong} falsch` : ' · ohne Fehler'}`
    : `<b>${r.ok}</b> ${r.ok === 1 ? 'richtige Antwort' : 'richtige Antworten'}${r.mode === 'countdown' ? ' in 60 Sekunden' : ''}${r.mode === 'survive' ? ` · <b>Level ${Math.floor(r.ok / SURVIVE.step) + 1}</b> erreicht` : ''}${r.wrong ? ` · ${r.wrong} falsch` : ''}`;
  const wrongs = [...new Map(r.wrongs.map((t) => [t.key + t.op, t])).values()].slice(0, 8);
  $('#view').innerHTML = gameShell(r.id, `<div class="run-result">
      <div class="result">
        <p class="run-mode-tag">${GAME_MODES[r.mode].icon()} ${GAME_MODES[r.mode].name} · ${esc(OP_INFO[practiceSettings().op][0])}</p>
        ${stars(st)}<h2>${title}</h2><p class="result-line">${line}</p>
        ${rec && old != null ? '<p class="pill good">Neuer persönlicher Rekord!</p>' : old != null ? `<p class="muted small">Dein Rekord: ${fmtScore(old, lower)}</p>` : ''}
        ${r.best >= 5 ? `<p class="muted small">Längste Serie: ${r.best} richtige hintereinander</p>` : ''}
        ${wrongs.length ? `<div class="mistakes"><p class="label">Merk dir</p><ul>${wrongs.map((t) => `<li><span class="m-task">${esc(taskText(t, true))}</span></li>`).join('')}</ul></div>` : ''}
        <div class="row center"><button class="btn primary big" data-action="game-again">${icon('flip')} Nochmals</button><button class="btn ghost big" data-action="home">Anderes Spiel</button></div>
      </div>
      <div class="board-card" id="board"><div class="board-head"><h3>${icon('trophy')} Bestenliste</h3></div><p class="muted"><span class="spinner"></span> wird geladen …</p></div>
    </div>`);
  fillBoard(r, board, valid ? score : null);
}
function boardHeadHTML(id, mode, op) {
  return `<div class="board-head"><h3>${icon('trophy')} Bestenliste</h3><span class="muted small">${esc(GAME_BY_ID[id].name)} · ${GAME_MODES[mode].name} · ${esc(OP_INFO[op][0])}</span></div>`;
}
async function fillBoard(r, board, score) {
  const el = $('#board');
  if (!el) return;
  const head = boardHeadHTML(r.id, r.mode, practiceSettings().op);
  if (!isKid() || !kid.token) {
    el.innerHTML = `${head}<p class="muted">${cloud.uid ? 'Die Bestenliste ist für die Kinder deiner Klassen. Du findest sie in der Klassenübersicht.' : 'Mit dem Login deiner Klasse siehst du hier die Bestenliste deiner Klasse.'}</p>`;
    return;
  }
  try {
    const c = await cloudClient();
    const { data, error } = await c.rpc('einmaleins_score', { p_token: kid.token, p_board: board, p_score: score });
    if (error) throw error;
    if ($('#board') === el) el.innerHTML = head + boardListHTML(data, { kid: true });
  } catch (e) {
    console.warn('Bestenliste', e);
    if ($('#board') === el) el.innerHTML = `${head}<p class="muted">Die Bestenliste ist gerade nicht erreichbar.</p>`;
  }
}
/** Top 10 der Klasse (bestes Ergebnis pro Kind); dazu der eigene Rang, auch wenn man nicht unter den ersten 10 ist */
function boardListHTML(data, { kid: forKid = false } = {}) {
  const lower = !!data?.lower;
  const top = data?.top || [];
  if (!top.length) return `<p class="muted">${forKid ? 'Noch keine Einträge – sei die oder der Erste!' : 'Noch keine Einträge.'}</p>`;
  const medal = (n) => (n <= 3 ? `<span class="b-medal m${n}">${n}</span>` : `<span class="b-rank">${n}</span>`);
  const rows = top.map((x) => `<li class="${x.me ? 'me' : ''}">${medal(x.rank)}<span class="b-name">${esc(x.name)}${x.me ? ' <em>(du)</em>' : ''}</span><span class="b-score">${fmtScore(x.score, lower)}</span></li>`).join('');
  const me = data.me;
  const meRow = forKid && me && me.rank > 10 ? `<li class="me sep"><span class="b-rank">${me.rank}</span><span class="b-name">Du</span><span class="b-score">${fmtScore(me.score, lower)}</span></li>` : '';
  const meLine = forKid ? (me ? `<p class="board-me">Dein Rang: <b>${me.rank}</b> von ${data.total}</p>` : '<p class="board-me muted">Du bist noch nicht auf der Liste.</p>') : '';
  return `<ol class="board-list">${rows}${meRow}</ol>${meLine}<p class="muted small">${esc(data.class || '')} · ${data.total} ${data.total === 1 ? 'Kind' : 'Kinder'} mit Ergebnis</p>`;
}

/* ---------------- Startkarte: Modus, Aufgabenart und Münze ---------------- */
function gateOptionsHTML(id) {
  const seg = (action, cur, list) => `<div class="seg">${list.map(([v, t]) => `<button class="seg-btn" data-action="${action}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`;
  if (id === 'duel') return seg('duel-goal', db.settings.duelGoal || 10, [[5, 'bis 5'], [10, 'bis 10'], [15, 'bis 15']]);
  return '';
}
function gateModesHTML(id) {
  const list = modesOf(id);
  if (!list.length) return '';
  const cur = gameModeOf(id);
  const best = gameBestText(id);
  const pick = list.length > 1 ? `<div class="mode-pick" role="radiogroup" aria-label="Spielmodus">${list.map((m) => `<button type="button" class="mode-btn m-${m}" data-action="game-mode" data-mode="${m}" role="radio" aria-checked="${m === cur}"><span class="mode-ic" aria-hidden="true">${GAME_MODES[m].icon()}</span><b>${GAME_MODES[m].name}</b><small>${GAME_MODES[m].short}</small></button>`).join('')}</div>`
    : `<p class="mode-one"><span class="mode-ic" aria-hidden="true">${GAME_MODES[cur].icon()}</span><b>${GAME_MODES[cur].name}</b></p>`;
  return `${pick}<p class="mode-desc">${esc(GAME_MODES[cur].desc(id))}${best ? ` <span class="mode-best">${icon('trophy')} Dein Rekord: ${esc(best.split(': ')[1])}</span>` : ''}</p>`;
}
/** Was gerechnet wird: Reihen in Kurzform */
function gateReihenText() {
  const ps = practiceSettings();
  const all = reihenFor(ps.big);
  const r = ps.reihen;
  const list = r.length === all.length ? `alle Reihen (1–${ps.big ? 20 : 10})` : r.length === 1 ? `${r[0]}er-Reihe` : `Reihen ${r.join(', ')}`;
  return `${ps.big ? 'Grosses' : 'Kleines'} Einmaleins · ${list}`;
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
      ${gateModesHTML(g.id)}
      ${opPickHTML('game-op', 'gate-ops')}
      <p class="gate-reihen-text muted small">${esc(gateReihenText())}</p>
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
  game.onRunHud = null;
  if (START_3D[id] && webglOK()) {
    $('#view').innerHTML = `<section class="mode game gate"><div class="gate-card"><span class="spinner big"></span><p>Die 3D-Welt wird geladen …</p></div></section>`;
    try { await START_3D[id](); return; } catch (e) { console.warn('3D nicht möglich, 2D-Version', e); stopGame(); game.over = false; }
  }
  START_2D[id]?.();
}

/* =========================================================
   ⚽ Elfmeter (2D-Version, wenn kein WebGL da ist)
   ========================================================= */
const BALL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#1F2937" stroke-width="2"/><path d="M20 12l7 5-2.7 8h-8.6L13 17z" fill="#1F2937"/><path d="M20 12V3.5M27 17l8-3M24.3 25l5 7M15.7 25l-5 7M13 17l-8-3" stroke="#1F2937" stroke-width="2"/></svg>`;
function startElfmeter() {
  Object.assign(game, { picker: gamePicker(), locked: false });
  const r = runStart('elfmeter');
  $('#view').innerHTML = gameShell('elfmeter', `
    ${runHudHTML('bar-hud')}
    <div class="pitch" id="pitch">
      <div class="task-board" id="eboard"></div>
      <div class="goal" id="goal"><div class="net"></div><div class="targets" id="targets"></div></div>
      <div class="spot"></div>
      <div class="ball" id="ball">${BALL_SVG}</div>
      ${r.mode === 'survive' ? '<div class="shot-clock" id="sclock"><i></i></div>' : ''}
      <div class="pitch-msg" id="pmsg"></div>
    </div>
    <p class="mode-hint">Tippe auf das Tor-Eck mit dem richtigen Ergebnis.</p>`,
  '');
  setGameKeys((e) => { if (/^[1-3]$/.test(e.key)) { const b = $$('.target')[+e.key - 1]; if (b) elfShoot(b); } });
  elfNext();
}
function elfNext() {
  if (!runOn()) return;
  const t = game.picker.next();
  game.task = t; game.locked = false;
  t.shownAt = performance.now();
  $('#eboard').innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
  $('#targets').innerHTML = choicesFor(t, 3).map((o, i) => `<button class="target z${i}" data-action="elf-shoot" data-v="${o}" data-z="${i}">${o}</button>`).join('');
  const ball = $('#ball');
  ball.getAnimations().forEach((a) => a.cancel());
  ball.className = 'ball';
  $('#goal').classList.remove('shake');
  $('#pmsg').className = 'pitch-msg';
  if (game.run.mode === 'survive') taskClock($('#sclock i'), surviveMs(7000, 1800), () => elfShoot(null));
}
function elfShoot(btn) {
  if (game.locked || !runOn()) return;
  game.locked = true;
  taskClockStop($('#sclock i'));
  const t = game.task;
  const v = btn ? btn.dataset.v : '';
  const ok = recordAnswer(t, v, performance.now() - t.shownAt);
  const targets = $$('.target');
  const right = targets.find((b) => Number(b.dataset.v) === t.answer);
  const ball = $('#ball'), goal = $('#goal');
  const aim = btn || targets[rand(targets.length)];
  const br = ball.getBoundingClientRect(), ar = aim.getBoundingClientRect(), gr = goal.getBoundingClientRect();
  let dx = ar.left + ar.width / 2 - (br.left + br.width / 2), dy = ar.top + ar.height / 2 - (br.top + br.height / 2);
  // Falsch: Mitte → an die Latte, links/rechts → an den Pfosten
  const zone = +(aim.dataset.z ?? 1);
  const miss = ok ? null : zone === 1 ? 'bar' : 'post';
  if (miss === 'bar') dy = gr.top - (br.top + br.height / 2) + 4;
  if (miss === 'post') dx = (zone === 0 ? gr.left + 4 : gr.right - 4) - (br.left + br.width / 2);
  sfx.kick();
  const anim = !reduceMotion();
  const fly = ball.animate([{ transform: 'translate(-50%, 0) scale(1) rotate(0)' }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.5) rotate(540deg)` }], { duration: anim ? 560 : 1, easing: 'cubic-bezier(.2,.75,.35,1)', fill: 'forwards' });
  if (miss && anim) fly.finished.then(() => { // Abpraller zurück ins Feld
    ball.animate([{ transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.5) rotate(540deg)` }, { transform: `translate(calc(-50% + ${dx * (miss === 'post' ? 1.35 : 0.6)}px), ${dy * 0.35}px) scale(.8) rotate(760deg)` }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
    tone([1568, 2093, 1760], 0.09, 'triangle', 0.09);
  }).catch(() => {});
  gLater(() => {
    const msg = $('#pmsg');
    let ended;
    if (ok) {
      sfx.win();
      $('#goal').classList.add('shake');
      msg.innerHTML = 'TOR!';
      msg.className = 'pitch-msg show good';
      ended = runRight();
    } else {
      sfx.bad();
      msg.innerHTML = `${!btn ? 'Zu spät!' : miss === 'bar' ? 'Latte!' : 'Pfosten!'}<small>${esc(taskText(t, true))}</small>`;
      msg.className = 'pitch-msg show bad';
      right?.classList.add('right');
      ended = runWrong(t);
    }
    btn?.classList.add(ok ? 'right' : 'wrong');
    if (!ended) gLater(elfNext, ok ? 650 : 1300);
  }, anim ? 560 : 50);
}

/* =========================================================
   ☄️ Meteoriten (2D-Version)
   ========================================================= */
const ROCKET_SVG = `<svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 4c12 10 16 26 14 44H18C16 30 20 14 32 4z" fill="#E5E7EB"/><path d="M32 4c6 5 10 12 12 20H20c2-8 6-15 12-20z" fill="#FF6B4A"/><circle cx="32" cy="34" r="6" fill="#38BDF8" stroke="#0E7490" stroke-width="2.5"/><path d="M18 40 6 56l12-2zM46 40l12 16-12-2z" fill="#FF6B4A"/><path d="M22 48h20l-3 8H25z" fill="#9CA3AF"/><path class="flame" d="M26 56h12l-6 18z" fill="#FFC233"/></svg>`;
function startMeteor() {
  Object.assign(game, { picker: gamePicker(), wave: [], task: null, over: false, recorded: false, last: 0, alienT: 0 });
  runStart('meteor');
  $('#view').innerHTML = gameShell('meteor', `
    <div class="space" id="space">
      <div class="stars-bg"></div>
      <div class="hud">${runHudHTML('dark')}</div>
      <div class="ship-wrap"><div class="ship-task" id="mtask"></div><div class="ship" id="ship">${ROCKET_SVG}</div></div>
      <div class="ground"></div>
    </div>
    <p class="mode-hint">Tippe den Meteoriten mit dem richtigen Ergebnis an, bevor er auf dem Boden landet.</p>`);
  gLater(meteorWave, 500);
  game.last = performance.now();
  game.raf = requestAnimationFrame(meteorLoop);
}
function meteorWave() {
  if (!runOn()) return;
  const space = $('#space');
  if (!space) return;
  game.wave.forEach((m) => m.el.remove());
  const t = game.picker.next();
  game.task = t; game.recorded = false;
  $('#mtask').innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
  const n = game.run.ok >= 12 ? 4 : 3;
  const opts = choicesFor(t, n);
  const W = space.clientWidth, H = space.clientHeight;
  const lane = W / n;
  const dur = game.run.mode === 'survive' ? surviveMs(9000, 2000) / 1000 : clamp(11 - game.run.ok * 0.35, 4.2, 11); // Sekunden bis zum Boden
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
  if (!space || !runOn()) return;
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
  if (!runOn()) return;
  const m = game.wave.find((x) => x.el === el);
  if (!m || m.dead) return;
  const t = game.task;
  if (!game.recorded) { recordAnswer(t, m.correct ? m.val : m.val, performance.now() - t.shownAt); game.recorded = true; }
  laser(m);
  if (m.correct) {
    m.dead = true;
    sfx.zap();
    el.classList.add('boom');
    game.wave.forEach((x) => { if (x !== m) { x.dead = true; x.el.classList.add('gone'); } });
    if (!runRight()) gLater(meteorWave, 650);
  } else {
    el.classList.add('wrong');
    game.wave.find((x) => x.correct)?.el.classList.add('hint');
    meteorMiss(m, false);
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
  const t = game.task;
  if (!game.recorded) { recordAnswer(t, '', performance.now() - t.shownAt); game.recorded = true; }
  m.el.classList.add('landed');
  meteorMiss(m, true);
}
/** Meteorit gelandet (crash) oder falschen angetippt: zählt als falsch (Survive: ein Leben weniger) */
function meteorMiss(m, crash) {
  const t = game.task;
  m.dead = true;
  if (crash) sfx.boom(); else sfx.bad();
  game.wave.forEach((x) => { if (!x.dead) { x.dead = true; if (crash || !x.correct) x.el.classList.add('gone'); } });
  const space = $('#space');
  space.classList.add('hit');
  const note = document.createElement('div');
  note.className = 'meteor-note';
  note.textContent = taskText(t, true);
  space.appendChild(note);
  setTimeout(() => { space.classList.remove('hit'); note.remove(); }, 1600);
  if (runWrong(t)) return;
  if (game.run.mode === 'survive' && game.run.lives === 1) meteorAlienSchedule(2600 + Math.random() * 1500);
  gLater(meteorWave, crash ? 1500 : 1700);
}
/* Ufo (nur Survive): kommt beim letzten Leben und ist schwer zu treffen; Treffer = Extraleben */
function meteorAlienSchedule(ms) {
  clearTimeout(game.alienT);
  game.alienT = gLater(() => {
    if (!runOn() || game.run.lives !== 1) return;
    meteorAlien();
    meteorAlienSchedule(7000 + Math.random() * 4000);
  }, ms);
}
function meteorAlien() {
  const space = $('#space');
  if (!space || space.querySelector('.alien')) return;
  const el = document.createElement('button');
  el.className = 'alien';
  el.dataset.action = 'meteor-alien';
  el.setAttribute('aria-label', 'Ufo');
  el.textContent = '🛸';
  space.appendChild(el);
  const W = space.clientWidth, H = space.clientHeight;
  const ltr = Math.random() < 0.5;
  const y0 = 30 + Math.random() * H * 0.4;
  const frames = Array.from({ length: 9 }, (_, i) => {
    const u = i / 8;
    const x = ltr ? -50 + (W + 100) * u : W + 50 - (W + 100) * u;
    return { transform: `translate(${x}px, ${y0 + Math.sin(u * Math.PI * 4) * 40}px) rotate(${Math.sin(u * Math.PI * 4) * 14}deg)` };
  });
  el.animate(frames, { duration: 2300 + Math.random() * 700, easing: 'linear', fill: 'forwards' }).finished.then(() => { if (!el.classList.contains('boom')) el.remove(); }).catch(() => {});
  tone([520, 780, 520, 780, 1040], 0.07, 'sine', 0.05);
}
function meteorAlienHit(el) {
  if (!runOn() || el.classList.contains('boom')) return;
  el.getAnimations().forEach((a) => a.pause());
  el.classList.add('boom');
  setTimeout(() => el.remove(), 520);
  runGainLife();
  clearTimeout(game.alienT);
  sfx.win();
  tone([660, 880, 1175, 1568], 0.09, 'triangle', 0.08);
  const note = document.createElement('div');
  note.className = 'meteor-note good';
  note.textContent = '+1 Leben – Extraleben!';
  $('#space')?.appendChild(note);
  setTimeout(() => note.remove(), 1400);
}

/* =========================================================
   🐸 Frosch-Hüpfen (2D-Version)
   ========================================================= */
function startFrog() {
  Object.assign(game, { picker: gamePicker(), tries: 0, locked: false });
  const r = runStart('frog');
  $('#view').innerHTML = gameShell('frog', `
    <div class="frog-top"><div class="frog-task" id="ftask"></div>${runHudHTML()}</div>
    ${r.mode === 'survive' ? '<div class="shot-clock frog-clock" id="fclock"><i></i></div>' : ''}
    <div class="pond" id="pond">
      <div class="ripples" id="ripples"></div>
      <div class="pads" id="pads"></div>
      <div class="home-pad" id="homepad"><span class="frog" id="frog">🐸</span></div>
    </div>
    <p class="mode-hint">Tippe auf die Seerose mit dem richtigen Ergebnis – der Frosch hüpft hinüber.</p>`,
  '');
  frogStep();
}
function frogStep() {
  if (!runOn()) return;
  const t = game.picker.next();
  game.task = { ...t, shownAt: performance.now() };
  game.tries = 0;
  game.locked = false;
  $('#ftask').innerHTML = `<span class="task small">${taskHTML(t)}</span>`;
  $('#pads').innerHTML = choicesFor(t, 3).map((v, i) => `<button class="lily p${i} grow" style="--d:${i * 70}ms" data-action="frog-jump" data-v="${v}"><span>${v}</span></button>`).join('');
  if (game.run.mode === 'survive') taskClock($('#fclock i'), surviveMs(8000, 2200), () => frogTimeout());
}
function frogTimeout() {
  if (!runOn() || game.locked) return;
  game.locked = true;
  const t = game.task;
  if (game.tries === 0) recordAnswer(t, '', performance.now() - t.shownAt);
  sfx.splash();
  $$('#pads .lily').forEach((b) => { b.disabled = true; b.classList.add(Number(b.dataset.v) === t.answer ? 'right' : 'sink'); });
  if (!runWrong(t)) gLater(frogStep, 1200);
}
function frogJump(btn) {
  if (game.locked || btn.disabled || !runOn()) return;
  const t = game.task;
  const v = Number(btn.dataset.v);
  const first = game.tries === 0;
  game.tries++;
  if (first) recordAnswer(t, v, performance.now() - t.shownAt);
  if (v !== t.answer) {
    sfx.splash();
    btn.classList.add('sink');
    btn.disabled = true;
    if (first) runWrong(t);
    else if (game.run.mode === 'survive') runWrong(t);
    return;
  }
  taskClockStop($('#fclock i'));
  game.locked = true;
  sfx.jump();
  const frog = $('#frog'), home = $('#homepad');
  const fr = frog.getBoundingClientRect(), br = btn.getBoundingClientRect(), hr = home.getBoundingClientRect();
  const dx = br.left + br.width / 2 - (fr.left + fr.width / 2), dy = br.top + br.height / 2 - (fr.top + fr.height / 2);
  btn.classList.add('right');
  $$('#pads .lily').forEach((b) => { if (b !== btn) { b.disabled = true; b.classList.add('sink'); } });
  const fast = reduceMotion();
  frog.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.35)` }, { transform: `translate(${dx}px, ${dy}px) scale(1)` }], { duration: fast ? 1 : 520, easing: 'ease-in-out', fill: 'forwards' });
  const ended = first ? runRight() : false;
  if (ended) return;
  // Nachrutschen: Die neue Seerose wird zum neuen Platz des Froschs, davor tauchen neue Seerosen auf
  gLater(() => {
    const mx = hr.left + hr.width / 2 - (br.left + br.width / 2), my = hr.top + hr.height / 2 - (br.top + br.height / 2);
    const opt = { duration: fast ? 1 : 480, easing: 'ease-in-out', fill: 'forwards' };
    btn.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${mx}px, ${my}px)` }], opt);
    frog.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx + mx}px, ${dy + my}px)` }], opt);
    home.animate([{ transform: 'translateX(-50%)', opacity: 1 }, { transform: `translate(-50%, ${hr.height}px)`, opacity: 0 }], opt);
    $('#ripples')?.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: `0 ${-my}px` }], opt);
    gLater(() => {
      [frog, home].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
      frogStep();
    }, fast ? 20 : 500);
  }, fast ? 20 : 560);
}

/* =========================================================
   🃏 Memory (nur Speed: alle Karten offen, so schnell wie möglich)
   ========================================================= */
const MEM_PAIRS = 8, MEM_PENALTY = 3000;
function startMemory() {
  const picker = gamePicker();
  const pairs = [], answers = new Set(), facts = new Set();
  for (let i = 0; i < 160 && pairs.length < MEM_PAIRS; i++) {
    const t = picker.next();
    if (answers.has(t.answer) || facts.has(t.fact)) continue;
    answers.add(t.answer); facts.add(t.fact); pairs.push(t);
  }
  const cards = shuffle(pairs.flatMap((t, i) => [{ id: i, kind: 'task', t }, { id: i, kind: 'res', t }]));
  Object.assign(game, { pairs, cards, sel: null, combo: 0, locked: false, lastFound: performance.now() });
  runStart('memory', { goal: pairs.length });
  $('#view').innerHTML = gameShell('memory', `
    <div class="mem-bar">${runHudHTML()}<span class="mem-combo" id="memcombo"></span><span class="mem-pen" id="mempen"></span></div>
    <div class="mem-grid open n${cards.length}" id="memgrid">${cards.map((c, i) => `<button class="mem-card ${c.kind} deal" style="--d:${i * 35}ms" data-action="mem-flip" data-i="${i}" aria-label="${c.kind === 'task' ? taskText(c.t) : c.t.answer}"><span class="mc-in"><span class="mc-back" aria-hidden="true">${BRAND_SVG('mcb' + i)}</span><span class="mc-face ${c.kind === 'task' && c.t.op.startsWith('gap') ? 'long' : ''}">${c.kind === 'task' ? memTaskFace(c.t) : c.t.answer}</span></span></button>`).join('')}</div>
    <p class="mode-hint">Tippe eine Rechnung und dann ihr Ergebnis an. Ein falsches Paar kostet 3 Sekunden.</p>`,
  '');
}
/** Vorderseite einer Rechnungs-Karte: 7 · 8, 56 : 8 oder ▢ · 8 = 56 */
function memTaskFace(t) {
  const S = `<em>${SIGN()}</em>`, gap = '<i class="mc-gap">▢</i>';
  if (t.op === 'div') return `${t.p}<em>:</em>${t.b}`;
  if (t.op === 'gapA') return `${gap}${S}${t.b}<em>=</em>${t.p}`;
  if (t.op === 'gapB') return `${t.a}${S}${gap}<em>=</em>${t.p}`;
  return `${t.a}${S}${t.b}`;
}
function memFlip(btn) {
  if (game.locked || !runOn()) return;
  const i = +btn.dataset.i, c = game.cards[i];
  if (c.done) return;
  if (game.sel === i) { btn.classList.remove('sel'); game.sel = null; return; }
  sfx.flip();
  btn.classList.add('sel');
  if (game.sel == null) { game.sel = i; return; }
  const j = game.sel, d = game.cards[j], other = $(`.mem-card[data-i="${j}"]`);
  game.sel = null;
  if (d.kind === c.kind) { other.classList.remove('sel'); game.sel = i; return; } // zwei Rechnungen: neue Wahl
  const match = c.id === d.id;
  const task = c.kind === 'task' ? c.t : d.t, val = c.kind === 'res' ? c.t.answer : d.t.answer;
  recordAnswer(task, val, performance.now() - game.lastFound);
  if (match) {
    c.done = d.done = true;
    game.combo++;
    game.lastFound = performance.now();
    sfx.good();
    [btn, other].forEach((b) => { b.classList.remove('sel'); b.classList.add('done'); sparkle(b); });
    const cb = $('#memcombo');
    if (cb && game.combo >= 2) { cb.textContent = `${game.combo}er-Kombo!`; cb.classList.remove('show'); void cb.offsetWidth; cb.classList.add('show'); tone([660 + game.combo * 80], 0.08, 'triangle', 0.08); }
    runRight();
  } else {
    game.combo = 0;
    sfx.bad();
    game.locked = true;
    game.run.penalty += MEM_PENALTY;
    const pen = $('#mempen');
    if (pen) { pen.textContent = '+3 s'; pen.classList.remove('show'); void pen.offsetWidth; pen.classList.add('show'); }
    runWrong(task);
    [btn, other].forEach((b) => b.classList.add('nope'));
    gLater(() => { [btn, other].forEach((b) => b.classList.remove('nope', 'sel')); game.locked = false; }, 550);
  }
}

/* =========================================================
   ✅ Stimmt das?
   ========================================================= */
function startTrueFalse() {
  Object.assign(game, { picker: gamePicker(), stmt: null, over: false });
  const r = runStart('truefalse');
  $('#view').innerHTML = gameShell('truefalse', `
    ${runHudHTML('bar-hud')}
    ${r.mode === 'survive' ? '<div class="shot-clock tf-clock" id="tfclock"><i></i></div>' : ''}
    <div class="tf-deck" id="tfdeck"></div>
    <div class="tf-btns">
      <button class="tf-btn no" data-action="tf-answer" data-v="0">${icon('x')}<span>Stimmt nicht</span></button>
      <button class="tf-btn yes" data-action="tf-answer" data-v="1">${icon('check')}<span>Stimmt</span></button>
    </div>
    <p class="mode-hint">Wische die Karte nach rechts (stimmt) oder links (stimmt nicht) – oder tippe auf die Knöpfe. Pfeiltasten gehen auch.</p>`);
  setGameKeys((e) => { if (e.key === 'ArrowLeft') tfAnswer(false); if (e.key === 'ArrowRight') tfAnswer(true); });
  tfNext();
}
function tfNext() {
  if (!runOn()) return;
  const t = game.picker.next();
  const truth = Math.random() < 0.5;
  const shown = truth ? t.answer : distractors(t, 1)[0];
  game.stmt = { t, shown, truth: shown === t.answer };
  game.locked = false;
  t.shownAt = performance.now();
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
  if (game.run.mode === 'survive') taskClock($('#tfclock i'), surviveMs(6000, 1300), () => tfAnswer(null));
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
/** says: true (stimmt), false (stimmt nicht) oder null (zu spät, nur Survive) */
function tfAnswer(says) {
  if (game.locked || !runOn() || !game.stmt) return;
  game.locked = true;
  taskClockStop($('#tfclock i'));
  const { t, shown, truth } = game.stmt;
  const ok = says === truth;
  // fürs Gedächtnis: richtig erkannt = gewusst; „stimmt“ bei falschem Ergebnis = diese Verwechslung
  recordAnswer(t, ok ? t.answer : (says ? shown : ''), performance.now() - t.shownAt);
  const card = game.card;
  const leave = (delay) => gLater(() => {
    card.classList.add(says === false ? 'out-no' : 'out-yes');
    card.style.transform = '';
    setTimeout(() => card.remove(), 450);
    runPause(false);
    tfNext();
  }, delay);
  let ended;
  if (ok) {
    sfx.good();
    card.classList.add('good');
    tfFloat('+1', 'good');
    ended = runRight();
  } else {
    sfx.bad();
    card.classList.add('bad');
    if (says === null) tfFloat('Zu spät!', 'bad');
    ended = runWrong(t);
  }
  if (ended) return;
  // Ist die Rechnung falsch, zeigen wir immer die richtige – auch wenn das Kind es richtig erkannt hat.
  // Solange die Lösung steht, ist die Uhr angehalten.
  if (!truth || !ok) {
    runPause(true);
    const note = card.querySelector('.tf-note');
    note.innerHTML = truth
      ? `<span class="tf-sol">Stimmt doch: <b>${esc(taskText(t, true))}</b></span>`
      : `<span class="tf-sol">${ok ? 'Gut erkannt!' : 'Leider falsch.'} Richtig ist <b>${esc(taskText(t, true))}</b></span>`;
    card.querySelector('.num.shown')?.classList.add(truth ? 'is-true' : 'strike');
    leave(ok ? 1150 : 1800);
  } else leave(170);
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
