/* Einmaleins – Übungen: Trainer, Auswählen, Reihen-Treppe, Blitztest */
'use strict';

const EX_ART = {
  trainer: `<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="10" fill="currentColor" opacity=".16"/><g fill="currentColor"><rect x="12" y="12" width="7" height="7" rx="2"/><rect x="21" y="12" width="7" height="7" rx="2"/><rect x="30" y="12" width="7" height="7" rx="2"/><rect x="12" y="21" width="7" height="7" rx="2"/><rect x="21" y="21" width="7" height="7" rx="2"/><rect x="30" y="21" width="7" height="7" rx="2"/><rect x="12" y="30" width="7" height="7" rx="2"/><rect x="21" y="30" width="16" height="7" rx="2" opacity=".55"/></g></svg>`,
  choice: `<svg viewBox="0 0 48 48"><g fill="currentColor"><rect x="5" y="6" width="17" height="15" rx="5" opacity=".25"/><rect x="26" y="6" width="17" height="15" rx="5"/><rect x="5" y="25" width="17" height="15" rx="5" opacity=".25"/><rect x="26" y="25" width="17" height="15" rx="5" opacity=".25"/></g><path d="M30.5 14l3 3 6-6.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  inverse: `<svg viewBox="0 0 48 48"><rect x="6" y="8" width="36" height="32" rx="9" fill="currentColor" opacity=".16"/><circle cx="24" cy="15" r="3" fill="currentColor"/><circle cx="24" cy="33" r="3" fill="currentColor"/><rect x="12" y="22" width="24" height="4.5" rx="2.2" fill="currentColor"/></svg>`,
  reihen: `<svg viewBox="0 0 48 48"><path d="M5 42h9v-8h9v-8h9v-8h9V8" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="40" cy="5" r="3.5" fill="currentColor"/></svg>`,
  blitz: `<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="17" fill="currentColor" opacity=".16"/><path d="M26 6 14 28h9l-2 15 13-21h-9z" fill="currentColor"/></svg>`,
};
const EXERCISES = [
  { id: 'trainer', name: 'Trainer', desc: 'Ergebnis eintippen. Was Mühe macht, kommt wieder.', color: 'teal', art: EX_ART.trainer },
  { id: 'choice', name: 'Auswählen', desc: 'Aus vier Antworten die richtige antippen.', color: 'coral', art: EX_ART.choice },
  { id: 'reihen', name: 'Reihen-Treppe', desc: 'Eine Reihe hinauf und wieder hinunter.', color: 'purple', art: EX_ART.reihen },
  { id: 'blitz', name: 'Blitztest', desc: '20 Rechnungen auf Zeit. Schaffst du 3 Sterne?', color: 'sun', art: EX_ART.blitz, bestText: (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s` },
];
const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((x) => [x.id, x]));

/* ---------------- Zahlenfeld ---------------- */
const pad = { value: '', active: false, max: 3, onInput: null, onSubmit: null };
function numpadHTML() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return `<div class="numpad" role="group" aria-label="Zahlenfeld">${keys.map((k) => {
    if (k === 'del') return `<button type="button" class="pad-key del" data-action="pad" data-k="del" aria-label="Löschen">${icon('back')}</button>`;
    if (k === 'ok') return `<button type="button" class="pad-key ok" data-action="pad" data-k="ok" aria-label="Prüfen">OK</button>`;
    return `<button type="button" class="pad-key" data-action="pad" data-k="${k}">${k}</button>`;
  }).join('')}</div>`;
}
function padPress(k) {
  if (!pad.active) return;
  if (k === 'ok') { if (pad.value) pad.onSubmit?.(pad.value); return; }
  if (k === 'del') pad.value = pad.value.slice(0, -1);
  else if (/^\d$/.test(k) && pad.value.length < pad.max) pad.value = (pad.value === '0' ? '' : pad.value) + k;
  else return;
  sfx.tap();
  pad.onInput?.(pad.value);
}
document.addEventListener('keydown', (e) => {
  if (!pad.active || ui.modal || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches?.('input, textarea, select')) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); padPress(e.key); flashKey(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); padPress('del'); flashKey('del'); }
  else if (e.key === 'Enter') { e.preventDefault(); padPress('ok'); flashKey('ok'); }
});
function flashKey(k) {
  const b = $(`.pad-key[data-k="${k}"]`);
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
}

/* ---------------- Gemeinsamer Zustand ---------------- */
const ex = { mode: null, picker: null, total: 20, i: 0, right: 0, wrong: 0, task: null, phase: 'ask', mistakes: [], t0: 0, tick: null, timers: [], reihe: 7, step: 0, stage: 'up', order: [] };
const exLater = (fn, ms) => { const t = setTimeout(fn, ms); ex.timers.push(t); return t; };
function stopExercise() {
  ex.timers.forEach(clearTimeout); ex.timers = [];
  clearInterval(ex.tick); ex.tick = null;
  pad.active = false;
}
function openExercise(id) {
  if (!EXERCISE_BY_ID[id]) return;
  go('ex', { mode: id });
}

function renderExercise() {
  stopExercise();
  const m = ui.mode;
  Object.assign(ex, { mode: m, i: 0, right: 0, wrong: 0, mistakes: [], phase: 'ask', task: null, t0: performance.now() });
  if (m === 'reihen') { renderReihenStart(); return; }
  const ps = practiceSettings();
  ex.total = m === 'blitz' ? 20 : ps.roundLen; // Anzahl Rechnungen pro Runde legt die Lehrperson fest
  ex.picker = createPicker(buildPool(ps));
  const info = EXERCISE_BY_ID[m];
  $('#view').innerHTML = `<section class="mode ex-${m} c-${info.color}">
    <div class="mode-bar">
      <h1 class="mode-title">${esc(info.name)}</h1>
      <div class="mode-controls">
        ${m === 'blitz' ? `<span class="timer" id="timer">${icon('clock')} <b>0,0</b> s</span>` : ''}${exCoinHTML()}
      </div>
    </div>
    <div class="progress" aria-hidden="true"><div class="progress-fill" id="pfill" style="width:0%"></div></div>
    <div class="progress-label"><span id="plabel"></span><span class="tally"><b class="ok">${icon('check')}<span id="t-ok">0</span></b><b class="bad">${icon('x')}<span id="t-bad">0</span></b></span></div>
    <div id="stage" class="stage"></div>
    <p class="mode-hint keys">${m === 'choice' ? 'Tasten 1–4 wählen eine Antwort.' : 'Du kannst auch mit der Tastatur tippen. Enter = prüfen.'}</p>
  </section>`;
  if (m === 'blitz') {
    ex.t0 = performance.now();
    ex.tick = setInterval(() => { const el = $('#timer b'); if (el) el.textContent = ((performance.now() - ex.t0) / 1000).toFixed(1).replace('.', ','); }, 100);
  }
  nextExTask();
}

function updateExProgress() {
  const f = $('#pfill');
  if (f) f.style.width = `${(ex.i / ex.total) * 100}%`;
  const l = $('#plabel');
  if (l) l.textContent = ex.i < ex.total ? `Rechnung ${ex.i + 1} von ${ex.total}` : 'Fertig!';
  const o = $('#t-ok'), b = $('#t-bad');
  if (o) o.textContent = ex.right;
  if (b) b.textContent = ex.wrong;
}

function nextExTask() {
  if (ex.i >= ex.total) { finishExercise(); return; }
  ex.task = ex.picker.next();
  ex.phase = 'ask';
  updateExProgress();
  if (ex.mode === 'choice') renderChoiceTask(); else renderInputTask();
}

/* ---------------- Eintippen (Trainer, Geteilt & Lücken, Blitztest) ---------------- */
function renderInputTask() {
  const t = ex.task;
  $('#stage').innerHTML = `<div class="task-card" id="tcard">
      <div class="task" id="task">${taskHTML(t, '<span class="slot" id="slot"><span class="slot-val"></span></span>')}</div>
      <div class="feedback" id="fb" aria-live="polite"></div>
    </div>
    ${numpadHTML()}
    ${ex.mode !== 'blitz' ? `<div class="row center under-pad"><button class="btn small ghost" data-action="ex-hint">${icon('help')} Tipp</button></div>` : ''}`;
  pad.value = '';
  pad.max = 3;
  pad.active = true;
  pad.onInput = (v) => {
    const s = $('#slot .slot-val');
    if (s) s.textContent = v;
    $('#slot')?.classList.toggle('filled', !!v);
    if (ex.phase === 'ask' && db.settings.autoCheck && v.length >= String(t.answer).length) submitInput(v);
    if (ex.phase === 'fix' && Number(v) === t.answer) exLater(() => { ex.i++; nextExTask(); }, 450);
  };
  pad.onSubmit = (v) => {
    if (ex.phase === 'ask') submitInput(v);
    else if (ex.phase === 'fix') { ex.i++; nextExTask(); }
  };
}

function submitInput(v) {
  const t = ex.task;
  if (ex.phase !== 'ask') return;
  if (ex.mode === 'reihen') { ex.phase = 'done'; reiheAnswer(v); return; }
  const ms = performance.now() - t.shownAt;
  const before = statOf(t.key) ? { ...statOf(t.key) } : null;
  const ok = recordAnswer(t, v, ms);
  if (ok) earnPoints(pointsFor(before, ms, true), $('#tcard'));
  const card = $('#tcard'), fb = $('#fb');
  if (ok) {
    ex.right++;
    ex.phase = 'done';
    pad.active = false;
    sfx.good();
    card.classList.add('good');
    const fast = ms < 2500;
    if (ex.mode !== 'blitz') fb.innerHTML = `<span class="fb-good">${icon('check')} ${pick(fast ? ['Blitzschnell!', 'Super schnell!', 'Wow!', 'Genau!'] : ['Richtig!', 'Genau!', 'Stimmt!', 'Gut gemacht!'])}</span>`;
    updateExProgress();
    exLater(() => { ex.i++; nextExTask(); }, ex.mode === 'blitz' ? 260 : 650);
    return;
  }
  ex.wrong++;
  ex.mistakes.push({ t, given: v });
  sfx.bad();
  card.classList.add('bad');
  updateExProgress();
  if (ex.mode === 'blitz') {
    ex.phase = 'done';
    pad.active = false;
    fb.innerHTML = `<span class="fb-bad">${esc(taskText(t, true))}</span>`;
    exLater(() => { ex.i++; nextExTask(); }, 900);
    return;
  }
  // Falsch: Lösung und Rechenhilfe zeigen, dann das richtige Ergebnis abtippen
  ex.phase = 'fix';
  pad.value = '';
  exLater(() => {
    card.classList.remove('bad');
    card.classList.add('fixing');
    const s = $('#slot .slot-val'); if (s) s.textContent = '';
    $('#slot')?.classList.remove('filled');
  }, 600);
  fb.innerHTML = `<div class="fb-wrong">
      <p class="fb-sol"><span class="muted">Nicht ganz${v ? ` (${esc(v)})` : ''}.</span> Richtig ist <strong>${esc(taskText(t, true))}</strong></p>
      <div class="help-box">${dotFieldSVG(t.op === 'gapB' ? t.a : t.a, t.b, { size: 13 })}<p>${esc(strategyText(t))}</p></div>
      <p class="hint">Tippe das richtige Ergebnis ab – dann geht es weiter. Diese Rechnung kommt bald nochmals.</p>
      <button class="btn small ghost" data-action="ex-skip">Weiter ${icon('right')}</button>
    </div>`;
}
function showExHint() {
  const t = ex.task, fb = $('#fb');
  if (!t || !fb || ex.phase !== 'ask') return;
  fb.innerHTML = `<div class="help-box">${dotFieldSVG(t.a, t.b, { size: 13 })}<p>${esc(t.op === 'mul' ? strategyText(t).replace(/ = \d+\.$/, ' = …').replace(/: also \d+\.$/, '.').replace(/→ \d+\.$/, '…') : `Welche Zahl mal ${t.op === 'gapB' ? t.a : t.b} gibt ${t.p}? Zähle in der ${t.op === 'gapB' ? t.a : t.b}er-Reihe.`)}</p></div>`;
}

/* ---------------- Auswählen ---------------- */
function renderChoiceTask() {
  const t = ex.task;
  const opts = choicesFor(t, 4);
  pad.active = false;
  $('#stage').innerHTML = `<div class="task-card" id="tcard">
      <div class="task" id="task">${taskHTML(t, '<span class="slot" id="slot"><span class="slot-val">?</span></span>')}</div>
      <div class="feedback" id="fb" aria-live="polite"></div>
    </div>
    <div class="choices">${opts.map((o, i) => `<button class="choice" data-action="ex-choice" data-v="${o}"><small>${i + 1}</small>${o}</button>`).join('')}</div>`;
}
function exChoose(btn) {
  if (ex.phase !== 'ask') return;
  const t = ex.task;
  const v = btn.dataset.v;
  const ms = performance.now() - t.shownAt;
  const before = statOf(t.key) ? { ...statOf(t.key) } : null;
  const ok = recordAnswer(t, v, ms);
  if (ok) earnPoints(pointsFor(before, ms, true, 0.75), $('#tcard')); // Auswählen ist leichter
  ex.phase = 'done';
  $$('.choice').forEach((b) => { b.disabled = true; if (Number(b.dataset.v) === t.answer) b.classList.add('right'); });
  $('#slot .slot-val').textContent = t.answer;
  if (ok) {
    ex.right++; sfx.good(); $('#tcard').classList.add('good');
    btn.classList.add('right');
    updateExProgress();
    exLater(() => { ex.i++; nextExTask(); }, 700);
  } else {
    ex.wrong++; sfx.bad(); btn.classList.add('wrong'); $('#tcard').classList.add('bad');
    ex.mistakes.push({ t, given: v });
    updateExProgress();
    $('#fb').innerHTML = `<div class="fb-wrong"><div class="help-box">${dotFieldSVG(t.a, t.b, { size: 12 })}<p>${esc(strategyText(t))}</p></div>
      <button class="btn primary" data-action="ex-skip" autofocus>Weiter ${icon('right')}</button></div>`;
    $('#fb .btn')?.focus();
  }
}
document.addEventListener('keydown', (e) => {
  if (ui.view !== 'ex' || ui.modal) return;
  if (ex.mode === 'choice' && /^[1-4]$/.test(e.key) && ex.phase === 'ask') { const b = $$('.choice')[+e.key - 1]; if (b) exChoose(b); }
  else if (ex.mode === 'choice' && e.key === 'Enter' && ex.phase === 'done' && $('#fb [data-action="ex-skip"]')) { e.preventDefault(); ex.i++; nextExTask(); }
});

/* ---------------- Ergebnis ---------------- */
function finishExercise() {
  stopExercise();
  updateExProgress();
  const m = ex.mode, info = EXERCISE_BY_ID[m];
  const ms = performance.now() - ex.t0;
  const acc = ex.total ? ex.right / ex.total : 0;
  let st = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : acc >= 0.5 ? 1 : 0;
  let extra = '';
  if (m === 'blitz') {
    const per = ms / ex.total;
    st = ex.wrong === 0 && per <= 3000 ? 3 : ex.wrong <= 1 && per <= 5000 ? 2 : ex.wrong <= 3 ? 1 : 0;
    const key = 'ex:blitz';
    const old = db.prog.best[key];
    const rec = ex.wrong <= 1 && (old == null || ms < old);
    if (rec) { db.prog.best[key] = Math.round(ms); saveDB(); }
    extra = `<p class="result-big">${icon('clock')} ${(ms / 1000).toFixed(1).replace('.', ',')} Sekunden</p>${rec ? '<p class="pill good">Neue Bestzeit!</p>' : old != null ? `<p class="muted">Bestzeit: ${(old / 1000).toFixed(1).replace('.', ',')} s (mit höchstens 1 Fehler)</p>` : '<p class="muted small">Bestzeit zählt mit höchstens 1 Fehler.</p>'}`;
  } else {
    const key = `ex:${m}`;
    db.prog.best[key] = Math.max(db.prog.best[key] || 0, st);
    saveDB();
  }
  if (st >= 2) { sfx.win(); confetti(); }
  // Bonus für eine gute Runde: ab 80 % richtig 2 Punkte, alles richtig 4 Punkte
  const bonus = ex.total >= 10 ? (ex.right === ex.total ? 4 : acc >= 0.8 ? 2 : 0) : 0;
  if (bonus) setTimeout(() => earnPoints(bonus, $('.result h2')), 700);
  const titles = ['Weiter üben!', 'Gut gemacht!', 'Sehr gut!', 'Hervorragend!'];
  const host = m === 'reihen' ? $('.reihe-layout') : $('#stage');
  host.innerHTML = `<div class="result">
    ${stars(st)}
    <h2>${titles[st]}</h2>
    <p class="result-line">${ex.right} von ${ex.total} richtig.</p>
    ${extra}
    ${bonus && !gamesFree() ? `<p class="pill good bonus-pill">${COIN_SVG} +${bonus} Bonuspunkte für eine gute Runde</p>` : ''}
    ${ex.mistakes.length ? `<div class="mistakes"><p class="label">Diese Rechnungen kommen bald wieder</p><ul>${[...new Map(ex.mistakes.map((x) => [x.t.key + x.t.op, x])).values()].map((x) => `<li><span class="m-task">${esc(taskText(x.t, true))}</span>${x.given ? `<span class="m-given">du: ${esc(x.given)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    <div class="row center">
      <button class="btn primary big" data-action="ex-again">${icon('flip')} Nochmals</button>
      <button class="btn ghost big" data-action="home">Andere Übung</button>
    </div>
  </div>`;
  $('.mode-hint')?.remove();
}

/* ---------------- Reihen-Treppe ---------------- */
function weakestReihe() {
  const ps = practiceSettings();
  let best = ps.reihen[0], worst = -1;
  for (const b of ps.reihen) {
    let d = 0;
    for (let a = 1; a <= 10; a++) d += difficulty(db.prog.f[`${a}x${b}`]) + (db.prog.f[`${a}x${b}`] ? 0 : 0.15);
    if (b === 1 || b === 10) d *= 0.5;
    if (d > worst) { worst = d; best = b; }
  }
  return best;
}
function renderReihenStart() {
  const ps = practiceSettings();
  if (!ps.reihen.includes(ex.reihe)) ex.reihe = weakestReihe();
  const info = EXERCISE_BY_ID.reihen;
  $('#view').innerHTML = `<section class="mode ex-reihen c-${info.color}">
    <div class="mode-bar"><h1 class="mode-title">${info.name}</h1></div>
    <div class="panel reihen-start">
      <h2>Welche Reihe?</h2>
      <div class="reihen">${ps.reihen.map((r) => `<button type="button" class="reihe r${r}" data-action="reihe-pick" data-r="${r}" aria-pressed="${ex.reihe === r}"><b>${r}</b><small>er</small></button>`).join('')}</div>
      <p class="hint">Vorgeschlagen ist die Reihe, die dir am meisten Mühe macht. Zuerst gehst du die Treppe hinauf (1 ${SIGN()} ${ex.reihe}, 2 ${SIGN()} ${ex.reihe} …), dann wieder hinunter (10 ${SIGN()} ${ex.reihe}, 9 ${SIGN()} ${ex.reihe} …). Für jede Stufe hast du 3 Versuche.</p>
      <button class="btn primary big" data-action="reihe-go">${icon('play')} Los</button>
    </div>
  </section>`;
}
function startReihe() {
  stopExercise();
  Object.assign(ex, { mode: 'reihen', step: 0, stage: 'up', right: 0, wrong: 0, mistakes: [], i: 0, total: 20, tries: 0, t0: performance.now() });
  const b = ex.reihe;
  $('#view').innerHTML = `<section class="mode ex-reihen c-purple">
    <div class="mode-bar"><h1 class="mode-title">${b}er-Reihe</h1>
      <span class="stage-pill" id="rstage">Treppe hinauf</span></div>
    <div class="progress" aria-hidden="true"><div class="progress-fill" id="pfill" style="width:0%"></div></div>
    <div class="progress-label"><span id="plabel"></span><span class="tally"><b class="ok">${icon('check')}<span id="t-ok">0</span></b><b class="bad">${icon('x')}<span id="t-bad">0</span></b></span></div>
    <div class="reihe-layout">
      <div class="stairs" id="stairs" aria-hidden="true"><span class="st-sun"></span><span class="st-hill h1"></span><span class="st-hill h2"></span>${REIHEN_KLEIN.map((a) => `<div class="stair" data-a="${a}" style="--a:${a}"><span class="st-q">${a}${SIGN()}${b}</span><b class="st-v"></b></div>`).join('')}<span class="climber" id="climber">${SQUIRREL_SVG}</span></div>
      <div class="reihe-input"><div id="stage" class="stage"></div></div>
    </div>
  </section>`;
  moveClimber(0, false);
  nextReiheTask();
}
/** Hinauf: 1·b bis 10·b (das Eichhörnchen springt auf die gelöste Stufe).
 *  Hinunter: 10·b bis 1·b (es steht auf der Stufe und springt nach dem Lösen eine Stufe tiefer). */
function nextReiheTask() {
  const b = ex.reihe;
  if (ex.i >= 20) { finishExercise(); return; }
  const a = ex.stage === 'up' ? ex.i + 1 : 20 - ex.i;
  ex.task = { ...makeTask(a, b, 'mul'), shownAt: performance.now() };
  ex.phase = 'ask';
  ex.tries = 0;
  updateExProgress();
  $('#rstage').textContent = ex.stage === 'up' ? 'Treppe hinauf' : 'Treppe hinunter';
  $$('.stair').forEach((s) => s.classList.toggle('cur', +s.dataset.a === a));
  renderInputTask();
  $('.under-pad')?.remove();
  $('#fb').innerHTML = triesHTML(0);
}
const REIHE_TRIES = 3;
function triesHTML(used) {
  return `<span class="tries" aria-label="${REIHE_TRIES - used} Versuche">${Array.from({ length: REIHE_TRIES }, (_, i) => `<i class="${i < used ? 'used' : ''}"></i>`).join('')}</span>`;
}
/** Kurz rot aufleuchten und wieder in die normale Farbe verblassen */
function flashBad(el) {
  if (!el) return;
  el.classList.toggle('flash-bad', false); void el.offsetWidth; el.classList.add('flash-bad');
}
function reiheAnswer(v) {
  const t = ex.task;
  const ok = Number(v) === t.answer;
  const ms = performance.now() - t.shownAt;
  const first = ex.tries === 0;
  const before = statOf(t.key) ? { ...statOf(t.key) } : null;
  // Die Treppe ist leichter als freies Rechnen (immer ± die Reihe): fürs Gedächtnis zählen nur Fehler
  // beim ersten Versuch; Punkte gibt es nur, wenn es auf Anhieb stimmt.
  if (first && !ok) recordAnswer(t, v, ms);
  const st = $(`.stair[data-a="${t.a}"]`);
  const card = $('#tcard');
  if (ok) {
    if (first) { ex.right++; earnPoints(pointsFor(before, ms, true, 0.5), card); }
    sfx.jump();
    pad.active = false;
    card?.classList.add('good');
    $('#fb').innerHTML = `<span class="fb-good">${icon('check')} ${first ? pick(['Richtig!', 'Genau!', 'Super!', 'Hopp!']) : 'Jetzt stimmt’s!'}</span>`;
    reiheStep(t, st, false);
    return;
  }
  ex.tries++;
  sfx.bad();
  if (first) { ex.wrong++; ex.mistakes.push({ t, given: v }); }
  updateExProgress();
  flashBad(card); flashBad(st);
  pad.active = false;
  if (ex.tries < REIHE_TRIES) {
    // Nochmals versuchen: Eingabe leeren
    const left = REIHE_TRIES - ex.tries;
    $('#fb').innerHTML = `${triesHTML(ex.tries)}<span class="fb-retry">Nochmals! ${left === 1 ? 'Noch 1 Versuch.' : `Noch ${left} Versuche.`}</span>`;
    exLater(() => {
      pad.value = '';
      const s = $('#slot .slot-val'); if (s) s.textContent = '';
      $('#slot')?.classList.toggle('filled', false);
      ex.phase = 'ask'; pad.active = true;
    }, 420);
    return;
  }
  // Dreimal falsch: Lösung zeigen und trotzdem weiter zur nächsten Stufe
  const s = $('#slot .slot-val'); if (s) s.textContent = t.answer;
  $('#slot')?.classList.add('filled', 'solved');
  $('#fb').innerHTML = `<span class="fb-bad">${esc(taskText(t, true))}</span>`;
  exLater(() => reiheStep(t, st, true), 1600);
}
/** Stufe abschliessen und das Eichhörnchen springen lassen */
function reiheStep(t, st, bad) {
  if (st) { st.classList.add('done'); st.classList.toggle('was-bad', bad); st.querySelector('.st-v').textContent = t.answer; }
  moveClimber(ex.stage === 'up' ? t.a : t.a - 1);
  updateExProgress();
  exLater(() => {
    ex.i++;
    if (ex.i === 10) {
      // oben angekommen: umdrehen und wieder hinunter
      ex.stage = 'down';
      $$('.stair').forEach((x) => { x.classList.toggle('done', false); x.classList.toggle('was-bad', false); x.querySelector('.st-v').textContent = ''; });
      $('#climber')?.classList.add('flip');
    }
    nextReiheTask();
  }, 700);
}
/* Eichhörnchen: schaut nach rechts, springt mit Beinbewegung von Stufe zu Stufe */
const SQUIRREL_SVG = `<svg viewBox="0 0 120 100" aria-hidden="true"><defs><linearGradient id="sqf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8873F"/><stop offset="1" stop-color="#B9581F"/></linearGradient></defs>
<g class="sq-tail"><path d="M48 70C20 76 6 52 14 30C21 12 45 9 51 24C55 35 46 43 38 38" fill="none" stroke="#C4642A" stroke-width="22" stroke-linecap="round"/><path d="M47 66C26 69 15 51 21 34C26 21 42 19 45 28" fill="none" stroke="#EE9C5E" stroke-width="8" stroke-linecap="round" opacity=".8"/></g>
<g class="sq-leg-back"><path d="M58 76q-3 9-13 11" fill="none" stroke="#A04C1B" stroke-width="9" stroke-linecap="round"/><ellipse cx="42" cy="88" rx="9" ry="4.2" fill="#8A3F15"/></g>
<ellipse class="sq-body" cx="68" cy="66" rx="23" ry="17" fill="url(#sqf)" transform="rotate(-14 68 66)"/>
<ellipse cx="78" cy="71" rx="10" ry="10" fill="#F6D7B0"/>
<g class="sq-leg-front"><path d="M83 75q3 7 10 9" fill="none" stroke="#A04C1B" stroke-width="6.5" stroke-linecap="round"/><ellipse cx="95" cy="85" rx="5.5" ry="3.2" fill="#8A3F15"/></g>
<g class="sq-head"><path d="M79 36l1-15 10 11z" fill="#B9581F"/><path d="M81 33l1-8 5 6z" fill="#F2B8A0"/><circle cx="89" cy="46" r="15.5" fill="url(#sqf)"/><circle cx="97" cy="52" r="7" fill="#F6D7B0"/><circle cx="93" cy="42.5" r="3.4" fill="#1F1A17"/><circle cx="94.2" cy="41.3" r="1.1" fill="#fff"/><circle cx="104.5" cy="48" r="2.6" fill="#3B2314"/><path d="M98 55q3 2 6-1" fill="none" stroke="#7A3A16" stroke-width="1.4" stroke-linecap="round"/></g>
<g class="sq-acorn"><ellipse cx="96" cy="68" rx="5" ry="6" fill="#B07A3A"/><path d="M90.5 64.5q5.5-5 11 0z" fill="#6B4423"/></g></svg>`;
/** Wo steht das Eichhörnchen auf Stufe a (0 = am Boden davor)? */
function climberPos(a) {
  const stairs = $('#stairs'), c = $('#climber');
  if (!stairs || !c) return null;
  const st = $(`.stair[data-a="${Math.max(1, a)}"]`);
  const w = c.offsetWidth;
  if (!a) return { left: st.offsetLeft - w * 0.95, bottom: 12 };
  return { left: st.offsetLeft + st.offsetWidth / 2 - w * 0.55, bottom: stairs.clientHeight - st.offsetTop - 4 };
}
function moveClimber(a, jump = true) {
  const c = $('#climber');
  const to = climberPos(a);
  if (!c || !to) return;
  const from = { left: parseFloat(c.style.left) || to.left, bottom: parseFloat(c.style.bottom) || to.bottom };
  c.style.left = `${to.left}px`; c.style.bottom = `${to.bottom}px`;
  c.dataset.a = a;
  if (!jump || reduceMotion()) return;
  const dx = to.left - from.left;
  c.classList.toggle('flip', dx < -4);
  const room = ($("#stairs")?.clientHeight || 999) - c.offsetHeight - 6;
  const apex = Math.max(Math.max(from.bottom, to.bottom) + 18, Math.min(room, Math.max(from.bottom, to.bottom) + 46 + Math.min(60, Math.abs(dx) * 0.15)));
  c.getAnimations().forEach((x) => x.cancel());
  c.classList.remove('landing'); c.classList.add('jumping');
  c.animate([
    { left: `${from.left}px`, bottom: `${from.bottom}px` },
    { left: `${from.left + dx * 0.12}px`, bottom: `${from.bottom - 4}px`, offset: 0.12 },
    { left: `${from.left + dx * 0.5}px`, bottom: `${apex}px`, offset: 0.5, easing: 'ease-in' },
    { left: `${to.left}px`, bottom: `${to.bottom}px` },
  ], { duration: 620, easing: 'ease-out' }).finished.then(() => {
    c.classList.remove('jumping'); void c.offsetWidth; c.classList.add('landing');
    setTimeout(() => c.classList.remove('landing'), 260);
  }).catch(() => {});
}
window.addEventListener('resize', () => { const c = $('#climber'); if (c) moveClimber(+c.dataset.a || 0, false); });
