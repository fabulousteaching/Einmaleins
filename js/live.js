/* Teilmal – Live in der Klasse: 1×1-Bingo
 *
 * Die Lehrperson startet am Beamer (nicht im Kinder-Login): Reihen, Kartengrösse und Tempo wählen, Code und QR-Code zeigen.
 * Kinder machen mit dem Code oder QR-Code mit (mit Kinder-Login: Name automatisch, sonst Vorname).
 * Jedes Kind bekommt eine eigene Bingo-Karte mit Ergebnissen aus den gewählten Reihen. Am Beamer erscheint eine Rechnung
 * nach der anderen («7 · 8»); wer das Ergebnis auf der Karte hat, markiert es. Eine volle Reihe (waagrecht, senkrecht
 * oder schräg) = BINGO. Der Beamer prüft, ob alle markierten Zahlen wirklich dran waren, und zeigt, welche noch nicht.
 * Verbindung: Supabase Realtime «Broadcast» (nichts wird gespeichert). Ohne Supabase: nur Fenster auf demselben Gerät.
 */
'use strict';

const LV = { role: '', code: '', ch: null, players: new Map(), timers: [], me: null, st: {}, cfg: null };
const lvLater = (fn, ms) => { const t = setTimeout(fn, ms); LV.timers.push(t); return t; };
const lvEvery = (fn, ms) => { const t = setInterval(fn, ms); LV.timers.push(t); return t; };
const liveLocal = () => !cloudConfigured() || !!window.__liveLocal;
const liveNewCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const liveJoinUrl = (code) => `${siteUrl()}#live=${code}`;

/** Kanal öffnen: Supabase Realtime, sonst BroadcastChannel (gleiches Gerät) */
async function liveChannel(code, onMsg) {
  if (liveLocal()) {
    const bc = new BroadcastChannel(`teilmal-live-${code}`);
    bc.onmessage = (e) => onMsg(e.data);
    return { send: (m) => bc.postMessage(m), close: () => bc.close() };
  }
  const c = await cloudClient();
  const ch = c.channel(`teilmal-live-${code}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 12000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error(status)); }
    });
  });
  return { send: (m) => ch.send({ type: 'broadcast', event: 'm', payload: m }), close: () => { try { c.removeChannel(ch); } catch { /* */ } } };
}
function liveStop() {
  LV.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  LV.timers = [];
  try { LV.ch?.close(); } catch { /* */ }
  Object.assign(LV, { role: '', code: '', ch: null, players: new Map(), me: null, st: {} });
}

/* ---------- Namen ohne Login: Beleidigungen werden nicht angenommen (wie in Vokaboom) ---------- */
const LIVE_BAD_PART = ['arschloch', 'arsch', 'hurensohn', 'hure', 'nutte', 'fotze', 'fick', 'ficker', 'wichs', 'wixx', 'wixer', 'schlampe', 'missgeburt', 'mistgeburt',
  'spast', 'spasti', 'mongo', 'behindert', 'schwuchtel', 'scheiss', 'scheis', 'kacke', 'kackbratze', 'pisser', 'pimmel', 'penis', 'vagina', 'titten', 'moese',
  'drecksau', 'sauhund', 'souhung', 'schafseckel', 'seckel', 'vollidiot', 'idiot', 'trottel', 'depp', 'bastard', 'hitler', 'neger', 'nigger', 'nigga',
  'kanake', 'zigeuner', 'tubel', 'gopfertami', 'huere', 'fudi', 'bitch', 'fuck', 'shit', 'asshole', 'cunt', 'whore', 'slut', 'retard', 'faggot', 'porn',
  'putain', 'merde', 'connard', 'connasse', 'salope', 'encule', 'batard', 'nique', 'couille', 'dumm', 'bloed', 'blod', 'doof', 'loser', 'penner'];
const LIVE_BAD_WORD = ['ass', 'sau', 'sex', 'dick', 'cock', 'pussy', 'fag', 'pd', 'con', 'conne', 'bite', 'kuh', 'affe', 'opfer', 'lappen', 'figg', 'gaggi', 'heil', 'schwanz', 'schwein', 'kot', 'nazi', 'nazis', 'pute'];
function liveNameNorm(name) {
  return String(name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, (c) => (c === '0' ? 'o' : 'a')).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
}
function liveNameProblem(name) {
  const n = String(name || '').trim();
  if (n.length < 2) return 'Bitte gib deinen Vornamen ein (mindestens 2 Buchstaben).';
  if (!/^[\p{L}][\p{L} .'-]{1,15}$/u.test(n)) return 'Bitte nur deinen Vornamen (Buchstaben).';
  const flat = liveNameNorm(n).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const words = liveNameNorm(n).split(/[^a-z]+/).filter(Boolean);
  if (LIVE_BAD_PART.some((w) => flat.includes(w.replace(/(.)\1+/g, '$1'))) || words.some((w) => LIVE_BAD_WORD.includes(w))) return 'Dieser Name geht nicht. Bitte nimm deinen richtigen Vornamen.';
  return '';
}

/* =========================================================
   Lehrperson: Warteraum, Einstellungen, Ziehen, Prüfen
   ========================================================= */
const mayHostLive = () => !isKid();
/** Alle Rechnungen der gewählten Reihen (a · b, beide Reihenfolgen) und die verschiedenen Ergebnisse */
function bingoPool(rows) {
  const tasks = [];
  for (const b of rows) for (let a = 1; a <= 10; a++) { tasks.push([a, b]); if (a !== b && !rows.includes(a)) tasks.push([b, a]); }
  const vals = [...new Set(tasks.map(([a, b]) => a * b))].sort((x, y) => x - y);
  return { tasks, vals };
}
const bingoCells = (size) => (size === 5 ? 24 : size * size); // 5×5: Mitte ist frei
function bingoProblem() {
  const c = LV.cfg;
  if (!c.rows.length) return 'Wähle mindestens eine Reihe.';
  const n = bingoPool(c.rows).vals.length;
  if (n < bingoCells(c.size) + 2) return `Für eine ${c.size}×${c.size}-Karte braucht es mehr verschiedene Ergebnisse (jetzt ${n}). Wähle mehr Reihen oder eine kleinere Karte.`;
  return '';
}
async function liveHost() {
  if (!mayHostLive()) return;
  liveStop();
  const saved = db.settings.bingoCfg || {};
  const big = !!saved.big;
  const rows = (saved.rows || practiceSettings().reihen).filter((r) => reihenFor(big).includes(r));
  Object.assign(LV, { role: 'host', code: liveNewCode(), players: new Map(), st: { phase: 'lobby', round: 0 },
    cfg: { big, rows: rows.length ? rows : [2, 3, 4, 5], size: [3, 4, 5].includes(saved.size) ? saved.size : 4, auto: saved.auto || 0, show: saved.show !== false } });
  go('live');
  try {
    LV.ch = await liveChannel(LV.code, hostMsg);
  } catch (e) {
    $('#view').innerHTML = `<section class="mode"><p class="banner bad">${icon('x')} Die Live-Verbindung hat nicht geklappt (${esc(e.message)}). Bist du online?</p>
      <button class="btn ghost" data-action="home">Zurück</button></section>`;
    return;
  }
  lvEvery(() => hostBroadcastState(), 2500);
  renderLive();
}
function bingoCfgSave() {
  const c = LV.cfg;
  db.settings.bingoCfg = { big: c.big, rows: c.rows, size: c.size, auto: c.auto, show: c.show };
  saveDB();
}
function hostBroadcastState() {
  if (LV.role !== 'host' || !LV.ch) return;
  const s = LV.st, last = s.called?.[s.called.length - 1];
  LV.ch.send({ t: 'state', phase: s.phase, round: s.round, size: LV.cfg.size, vals: s.vals || [], n: (s.called || []).length, task: LV.cfg.show && last ? { a: last.a, b: last.b } : null });
}
function hostMsg(m) {
  if (!m || LV.role !== 'host') return;
  if (m.t === 'join' && m.id) {
    if (!m.kid && liveNameProblem(m.name)) { LV.ch.send({ t: 'denied', id: m.id, reason: liveNameProblem(m.name) }); return; }
    if (!LV.players.has(m.id)) {
      LV.players.set(m.id, { name: String(m.name || 'Kind').slice(0, 24), a3: m.a3 && typeof m.a3 === 'object' && !Array.isArray(m.a3) && JSON.stringify(m.a3).length < 4000 ? m.a3 : null, av: m.av && typeof m.av === 'object' && typeof avFill === 'function' ? avFill(m.av) : null });
      if (LV.st.phase === 'lobby') { const pl = $('#live-players'); if (pl) pl.outerHTML = livePlayersHTML(); else renderLive(); liveRefreshStart(); }
      else renderLive();
    }
    hostBroadcastState();
  }
  if (m.t === 'bingo' && LV.st.phase === 'play') bingoClaim(m);
}
function liveRefreshStart() {
  const b = $('[data-action="bingo-start"]');
  if (b) b.disabled = !LV.players.size || !!bingoProblem();
}
function bingoStart() {
  const s = LV.st;
  if (bingoProblem() || !LV.players.size) return;
  bingoCfgSave();
  LV.timers.forEach((t) => clearInterval(t)); LV.timers = [];
  lvEvery(() => hostBroadcastState(), 2500);
  const pool = bingoPool(LV.cfg.rows);
  Object.assign(s, { phase: 'play', round: (s.round || 0) + 1, called: [], winners: [], claim: null, paused: false, vals: pool.vals, tasks: pool.tasks, reveal: false });
  if (LV.cfg.auto) lvEvery(() => { if (LV.st.phase === 'play' && !LV.st.paused) bingoCall(); }, LV.cfg.auto * 1000);
  LV.ch.send({ t: 'bingo-new', round: s.round, size: LV.cfg.size, vals: pool.vals });
  hostBroadcastState();
  renderLive();
}
/** Nächste Rechnung: ein Ergebnis, das noch nicht dran war, als zufällige Malrechnung */
function bingoCall() {
  const s = LV.st;
  if (s.phase !== 'play') return;
  const used = new Set(s.called.map((c) => c.p));
  const left = s.vals.filter((v) => !used.has(v));
  if (!left.length) { toast('Alle Ergebnisse waren schon dran.'); return; }
  const p = left[Math.floor(Math.random() * left.length)];
  const [a, b] = shuffle(s.tasks.filter(([x, y]) => x * y === p))[0];
  s.called.push({ a, b, p });
  s.reveal = false;
  LV.ch.send({ t: 'call', n: s.called.length, task: LV.cfg.show ? { a, b } : null });
  sfx.flip?.();
  renderLive();
}
function bingoClaim(m) {
  const s = LV.st;
  const p = LV.players.get(m.id) || { name: String(m.name || 'Kind') };
  const called = new Set(s.called.map((c) => c.p));
  const line = Array.isArray(m.line) ? m.line.map(Number).filter((x) => Number.isFinite(x)) : [];
  const nums = line.filter((x) => x > 0); // 0 = freies Feld in der Mitte
  const wrong = nums.filter((x) => !called.has(x));
  const ok = line.length >= LV.cfg.size && nums.length >= LV.cfg.size - 1 && !wrong.length;
  if (ok && !s.winners.includes(p.name)) s.winners.push(p.name);
  LV.ch.send({ t: 'bingo-result', id: m.id, name: p.name, ok, wrong });
  s.claim = { name: p.name, ok, wrong };
  if (ok) { sfx.win(); confetti(); } else sfx.bad();
  renderLive();
}

/* ---------- Bildschirm der Lehrperson ---------- */
function renderLive() {
  const v = $('#view');
  if (!v) return;
  if (LV.role === 'host') { v.innerHTML = bingoHostHTML(); return; }
  if (LV.role === 'player') { v.innerHTML = playerHTML(); return; }
  v.innerHTML = joinFormHTML(); bindJoinForm();
}
function lvFace(p, opts) {
  const flat = p.av && typeof avatarSVG === 'function' ? avatarSVG(p.av, opts) : '';
  return p.a3 && typeof w3HeadHTML === 'function' ? w3HeadHTML(p.a3, flat) : flat;
}
function livePlayersHTML() {
  const list = [...LV.players.values()];
  return `<div class="live-players" id="live-players">
      <h2>🔢 1×1-Bingo</h2>
      <p class="lead">${list.length} ${list.length === 1 ? 'Kind ist' : 'Kinder sind'} dabei</p>
      <div class="live-chips">${list.map((p) => `<span class="live-chip">${p.a3 || p.av ? `<span class="av-mini">${lvFace(p, { crop: 'head', bg: false })}</span>` : ''}${esc(p.name)}</span>`).join('') || '<span class="muted">Warte auf die ersten Kinder …</span>'}</div>
    </div>`;
}
function liveQR(url) {
  try {
    const q = qrcode(0, 'M'); q.addData(url, 'Byte'); q.make();
    const n = q.getModuleCount(), m = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${n + m * 2} ${n + m * 2}" role="img" aria-label="QR-Code zum Mitmachen"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#1E293B"/></svg>`;
  } catch { return ''; }
}
function bingoSetupHTML() {
  const c = LV.cfg, rows = reihenFor(c.big);
  const seg = (action, cur, list) => `<div class="seg">${list.map(([v, t]) => `<button type="button" class="seg-btn" data-action="${action}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`;
  const prob = bingoProblem();
  return `<div class="live-setup panel">
    <h3>${icon('sliders')} Einstellungen</h3>
    <div class="ls-row"><span class="label">Einmaleins</span>${seg('bg-big', c.big ? 1 : 0, [[0, 'Klein (1–10)'], [1, 'Gross (11–20)']])}</div>
    <div class="ls-row"><span class="label">Reihen</span><div class="bg-rows">${rows.map((r) => `<button type="button" class="bg-row" data-action="bg-row" data-v="${r}" aria-pressed="${c.rows.includes(r)}">${r}</button>`).join('')}
      <button type="button" class="link-btn" data-action="bg-rows-all">alle</button></div></div>
    <div class="ls-row"><span class="label">Karte</span>${seg('bg-size', c.size, [[3, '3 × 3'], [4, '4 × 4'], [5, '5 × 5 (Mitte frei)']])}</div>
    <div class="ls-row"><span class="label">Nächste Rechnung</span>${seg('bg-auto', c.auto, [[0, 'von Hand'], [10, 'alle 10 s'], [15, 'alle 15 s'], [20, 'alle 20 s'], [30, 'alle 30 s']])}</div>
    <div class="ls-row"><span class="label">Auf den Geräten</span>${seg('bg-show', c.show ? 1 : 0, [[1, 'Rechnung auch zeigen'], [0, 'nur am Beamer']])}</div>
    ${prob ? `<p class="banner bad small">${esc(prob)}</p>` : ''}
  </div>`;
}
function bingoHostHTML() {
  const s = LV.st, c = LV.cfg;
  if (s.phase === 'lobby') {
    const url = liveJoinUrl(LV.code);
    return `<section class="mode live-host">
      <div class="live-lobby">
        <div class="live-join-box">
          <p class="label">Mitmachen auf ${esc(location.host || 'Teilmal')}</p>
          <p class="live-code">${LV.code.split('').join(' ')}</p>
          <div class="live-qr">${liveQR(url)}</div>
          <p class="small muted">QR-Code scannen – oder in Teilmal «Live-Spiel beitreten» und den Code eingeben.</p>
        </div>
        ${livePlayersHTML()}
      </div>
      ${bingoSetupHTML()}
      <p class="center hint">Jedes Kind bekommt eine eigene Karte mit Ergebnissen aus den gewählten Reihen. Hier erscheint eine Rechnung nach der anderen – wer das Ergebnis auf der Karte hat, markiert es. Eine volle Reihe (waagrecht, senkrecht oder schräg) = BINGO!</p>
      <div class="row center"><button class="btn primary big" data-action="bingo-start" ${LV.players.size && !bingoProblem() ? '' : 'disabled'}>Bingo starten ${icon('right')}</button>
        <button class="btn ghost" data-action="live-close">Beenden</button></div>
    </section>`;
  }
  const n = s.called.length, last = s.called[n - 1];
  return `<section class="mode live-host bingo-host">
    <div class="bg-head"><span>Runde ${s.round} · Rechnung ${n}</span><span class="small muted">Code ${LV.code} · ${LV.players.size} ${LV.players.size === 1 ? 'Kind' : 'Kinder'}</span></div>
    ${s.claim ? `<div class="banner ${s.claim.ok ? 'good' : 'bad'} bingo-claim">${s.claim.ok ? '🎉' : icon('x')}<div><strong>${esc(s.claim.name)} ${s.claim.ok ? 'hat BINGO!' : 'hat noch kein Bingo.'}</strong>${s.claim.ok ? '' : ` Noch nicht dran: ${s.claim.wrong.join(', ')}`}</div></div>` : ''}
    <div class="bg-call ${last ? '' : 'idle'}">
      ${last ? `<div class="bg-task" aria-live="polite"><span>${last.a}</span><i>${SIGN()}</i><span>${last.b}</span><i>=</i><b class="${s.reveal ? 'shown' : ''}">${s.reveal ? last.p : '?'}</b></div>` : '<p class="bg-ready">Bereit? Die erste Rechnung kommt auf Knopfdruck.</p>'}
      <div class="row center">
        <button class="btn primary big" data-action="bingo-call">${icon('right')} ${n ? 'Nächste Rechnung' : 'Erste Rechnung'}</button>
        ${last && !s.reveal ? '<button class="btn secondary" data-action="bingo-reveal">Ergebnis zeigen</button>' : ''}
        ${c.auto ? `<button class="btn ghost" data-action="bingo-pause">${s.paused ? '▶ Weiter' : `⏸ Pause (alle ${c.auto} s)`}</button>` : ''}
      </div>
    </div>
    ${n > 1 ? `<details class="bg-list" open><summary>Schon dran (${n - 1})</summary><ol>${s.called.slice(0, -1).reverse().map((x) => `<li><span>${x.a} ${SIGN()} ${x.b}</span><b>${x.p}</b></li>`).join('')}</ol></details>` : ''}
    ${s.winners.length ? `<p class="bg-winners">🏆 Bingo: ${s.winners.map(esc).join(', ')}</p>` : ''}
    <div class="row center"><button class="btn ghost" data-action="bingo-start">${icon('shuffle')} Neue Runde (neue Karten)</button><button class="btn ghost" data-action="bingo-lobby">${icon('sliders')} Einstellungen</button><button class="btn ghost" data-action="live-close">Beenden</button></div>
  </section>`;
}

/* =========================================================
   Kinder: mitmachen
   ========================================================= */
function openJoin(code = '', fromQr = false) {
  liveStop();
  LV.role = '';
  LV.st = { code: (code || '').toUpperCase(), fromQr };
  if (fromQr && isKid() && LV.st.code.length === 5) { go('live'); liveJoin(LV.st.code, kidName()); return; }
  go('live');
}
function joinFormHTML() {
  let name = '';
  try { name = isKid() ? kidName() : (sessionStorage.getItem('teilmal.liveName') || ''); } catch { /* */ }
  const qr = LV.st.fromQr && /^[A-Z0-9]{5}$/.test(LV.st.code || '');
  return `<section class="mode live-join"><div class="test-card gate-card">
    <span class="gate-art" aria-hidden="true"><span class="emo">🔢</span></span>
    <h2>${qr ? '1×1-Bingo' : 'Live-Spiel beitreten'}</h2>
    <form id="join-form" class="auth-form" autocomplete="off">
      ${qr ? `<p class="join-qr-code">Spiel <strong>${esc(LV.st.code)}</strong></p><input id="join-code" type="hidden" value="${esc(LV.st.code)}">`
        : `<label class="field" for="join-code"><span class="label">Code (steht am Beamer)</span>
        <input id="join-code" class="join-code" type="text" maxlength="5" autocapitalize="characters" spellcheck="false" value="${esc(LV.st.code || '')}" placeholder="ABCDE"></label>`}
      ${isKid() ? `<p>Du machst mit als <strong>${esc(name)}</strong>.</p>` : `<label class="field" for="join-name"><span class="label">Dein Vorname</span>
        <input id="join-name" type="text" maxlength="16" value="${esc(name)}" placeholder="z. B. Lena" autocomplete="given-name"></label>`}
      <p class="form-error" id="join-error" role="alert"></p>
      <button class="btn primary big" type="submit" id="join-btn">Mitmachen ${icon('right')}</button>
    </form>
    <button class="btn ghost" data-action="home">Zurück</button>
  </div></section>`;
}
function bindJoinForm() {
  const f = $('#join-form');
  if (!f) return;
  setTimeout(() => (LV.st.code ? $('#join-name') : $('#join-code'))?.focus(), 60);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#join-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const name = isKid() ? kidName() : ($('#join-name')?.value || '').trim();
    const err = $('#join-error');
    if (code.length !== 5) { err.textContent = 'Der Code hat 5 Zeichen.'; return; }
    const bad = isKid() ? '' : liveNameProblem(name);
    if (bad) { err.textContent = bad; $('#join-name')?.focus(); return; }
    try { sessionStorage.setItem('teilmal.liveName', name); } catch { /* */ }
    $('#join-btn').disabled = true;
    await liveJoin(code, name);
  });
}
async function liveJoin(code, name) {
  liveStop();
  let id = '';
  try { id = sessionStorage.getItem('teilmal.liveId') || ''; } catch { /* */ }
  if (!id) { id = Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('teilmal.liveId', id); } catch { /* */ } }
  Object.assign(LV, { role: 'player', code, me: { id, name }, st: { phase: 'wait' } });
  try {
    LV.ch = await liveChannel(code, playerMsg);
  } catch (e) {
    LV.role = ''; LV.st = { code };
    renderLive();
    const err = $('#join-error'); if (err) err.textContent = 'Keine Verbindung. Bist du online?';
    return;
  }
  const av = typeof avMine === 'function' ? avMine() : null;
  const a3 = typeof w3LiveLook === 'function' ? w3LiveLook() : null;
  const hello = () => LV.ch?.send({ t: 'join', id, name, kid: isKid(), av, a3 });
  hello();
  lvEvery(() => { if (!LV.st.joined) hello(); }, 2000); // bis die Lehrperson antwortet
  renderLive();
}
function playerMsg(m) {
  if (!m || LV.role !== 'player') return;
  const s = LV.st;
  if (m.t === 'denied' && m.id === LV.me?.id) {
    const code = LV.code;
    liveStop(); LV.role = ''; LV.st = { code, fromQr: true };
    renderLive();
    const err = $('#join-error'); if (err) err.textContent = m.reason || 'Dieser Name geht nicht.';
    return;
  }
  if (m.t === 'state') {
    const first = !s.joined;
    s.joined = true;
    if (m.phase === 'play' && (!s.card || s.round !== m.round)) bingoNewCard(m.round, m.size, m.vals);
    if (m.phase === 'lobby' && s.phase !== 'wait') { s.phase = 'wait'; s.card = null; renderLive(); return; }
    if (m.phase === 'play' && s.phase !== 'bingo') { s.phase = 'bingo'; s.n = m.n; s.task = m.task; renderLive(); return; }
    if (first) renderLive();
    return;
  }
  if (m.t === 'bingo-new') { bingoNewCard(m.round, m.size, m.vals); s.phase = 'bingo'; s.n = 0; s.task = null; renderLive(); return; }
  if (m.t === 'lobby') { Object.assign(s, { phase: 'wait', card: null, result: null }); renderLive(); return; }
  if (m.t === 'call') {
    s.n = m.n; s.task = m.task;
    const el = $('#bg-now');
    if (el) { el.outerHTML = playerTaskHTML(); const t = $('#bg-now'); t?.classList.add('pop'); } else renderLive();
    tone([660], 0.06, 'sine', 0.04);
    return;
  }
  if (m.t === 'bingo-result' && m.id === LV.me.id) {
    s.result = m; s.wrongMarks = new Set(m.wrong || []);
    if (m.ok) { sfx.win(); confetti(); } else sfx.bad();
    renderLive();
  } else if (m.t === 'bingo-result' && m.ok) toast(`${m.name} hat BINGO! 🎉`);
}
/** Eigene Karte: zufällige Ergebnisse aus der Liste der Lehrperson (5×5: Mitte frei) */
function bingoNewCard(round, size, vals) {
  const s = LV.st;
  const n = bingoCells(size);
  const pick = shuffle((vals || []).slice()).slice(0, n).sort((a, b) => a - b);
  // leicht gemischt, aber grob aufsteigend lesbar: zeilenweise sortiert
  const card = shuffle(pick);
  if (size === 5) card.splice(12, 0, 0);
  Object.assign(s, { card, size, round, marked: new Set(size === 5 ? [12] : []), result: null, wrongMarks: new Set() });
}
function bingoLines(size) {
  const L = [];
  for (let r = 0; r < size; r++) L.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) L.push(Array.from({ length: size }, (_, r) => r * size + c));
  L.push(Array.from({ length: size }, (_, i) => i * size + i), Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return L;
}
function bingoLine() { const s = LV.st; return bingoLines(s.size).find((l) => l.every((i) => s.marked.has(i))) || null; }
function playerTaskHTML() {
  const s = LV.st;
  if (!s.task) return `<div class="bg-now muted" id="bg-now">${s.n ? `Rechnung ${s.n} – schau zum Beamer` : 'Gleich kommt die erste Rechnung …'}</div>`;
  return `<div class="bg-now" id="bg-now"><span class="bg-k">Rechnung ${s.n}</span><span class="bg-t">${s.task.a} ${SIGN()} ${s.task.b} = ?</span></div>`;
}
function playerHTML() {
  const s = LV.st;
  const head = `<p class="live-me">${esc(LV.me.name)} · Code ${LV.code}</p>`;
  if (s.phase !== 'bingo' || !s.card) return `<section class="mode live-play">${head}<div class="test-card center"><span class="spinner"></span><h2>Du bist dabei!</h2><p class="lead">Warte, bis deine Lehrperson das Bingo startet …</p></div></section>`;
  const line = bingoLine();
  return `<section class="mode live-play">${head}
    ${playerTaskHTML()}
    ${s.result ? `<div class="banner ${s.result.ok ? 'good' : 'bad'}">${s.result.ok ? '🎉' : icon('x')}<div><strong>${s.result.ok ? 'BINGO! Super gerechnet!' : 'Noch kein Bingo.'}</strong>${s.result.ok ? '' : ` Diese Zahlen waren noch nicht dran: ${s.result.wrong.join(', ')}. Rechne nochmals nach!`}</div></div>` : ''}
    <div class="bg-card" style="--n:${s.size}">${s.card.map((v, i) => (v === 0
      ? '<div class="bg-cell free on" aria-label="frei">★</div>'
      : `<button type="button" class="bg-cell ${s.marked.has(i) ? 'on' : ''} ${line && line.includes(i) ? 'line' : ''} ${s.wrongMarks?.has(v) && s.marked.has(i) ? 'wrong' : ''}" data-action="bingo-mark" data-i="${i}">${v}</button>`)).join('')}</div>
    <div class="row center"><button class="btn primary big bingo-btn" data-action="bingo-shout" ${line ? '' : 'disabled'}>BINGO!</button></div>
    <p class="hint center">Rechne und tippe das Ergebnis an, wenn es auf deiner Karte steht. Eine volle Reihe (waagrecht, senkrecht oder schräg) = BINGO.</p>
  </section>`;
}

/* ---------- Aktionen ---------- */
const liveActions = {
  'live-host': () => liveHost(),
  'live-join': () => openJoin(),
  'live-close': () => { liveStop(); go('home'); },
  'bg-big': (el) => { const c = LV.cfg; c.big = el.dataset.v === '1'; c.rows = c.rows.filter((r) => reihenFor(c.big).includes(r)); if (!c.rows.length) c.rows = c.big ? [11, 12, 13, 14, 15] : [2, 3, 4, 5]; renderLive(); },
  'bg-row': (el) => { const c = LV.cfg, r = +el.dataset.v; c.rows = c.rows.includes(r) ? c.rows.filter((x) => x !== r) : [...c.rows, r].sort((a, b) => a - b); renderLive(); },
  'bg-rows-all': () => { const c = LV.cfg; c.rows = [...reihenFor(c.big)]; renderLive(); },
  'bg-size': (el) => { LV.cfg.size = +el.dataset.v; renderLive(); },
  'bg-auto': (el) => { LV.cfg.auto = +el.dataset.v; renderLive(); },
  'bg-show': (el) => { LV.cfg.show = el.dataset.v === '1'; renderLive(); },
  'bingo-start': () => bingoStart(),
  'bingo-call': () => bingoCall(),
  'bingo-reveal': () => { LV.st.reveal = true; renderLive(); },
  'bingo-pause': () => { LV.st.paused = !LV.st.paused; renderLive(); },
  'bingo-lobby': () => {
    LV.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); LV.timers = [];
    LV.st = { phase: 'lobby', round: LV.st.round };
    LV.ch?.send({ t: 'lobby' });
    lvEvery(() => hostBroadcastState(), 2500);
    renderLive();
  },
  'bingo-mark': (el) => {
    const s = LV.st, i = +el.dataset.i;
    if (!s.card || s.card[i] === 0) return;
    if (s.marked.has(i)) s.marked.delete(i); else s.marked.add(i);
    s.result = null;
    tone([s.marked.has(i) ? 880 : 520], 0.04, 'sine', 0.04);
    renderLive();
  },
  'bingo-shout': () => {
    const s = LV.st, line = bingoLine();
    if (!line) return;
    LV.ch?.send({ t: 'bingo', id: LV.me.id, name: LV.me.name, line: line.map((i) => s.card[i]) });
  },
};

/** Über QR-Code: …#live=ABCDE */
function liveFromHash() {
  const m = location.hash.match(/^#live=([A-Za-z0-9]{5})$/);
  if (!m) return false;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* */ }
  openJoin(m[1], true);
  return true;
}
