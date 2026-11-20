/* Teilmal – Münzen
 *
 * Münzen gibt es nur in den Übungen, ausgegeben werden sie für die Spiele (1 Münze pro Spiel).
 * Fair für alle: Jede richtige Antwort bringt Punkte, alle paar Punkte gibt es eine Münze.
 *  - Rechnungen, die einem noch Mühe machen, bringen mehr Punkte (1,5 statt 1), schnelle Antworten etwas extra.
 *  - Wie viele Punkte eine Münze kostet, hängt davon ab, wie sicher die geübten Rechnungen schon sitzen:
 *    12 Punkte, wenn noch vieles Mühe macht, bis 20 Punkte, wenn fast alles sitzt.
 *    Starke Kinder müssen also etwas mehr leisten, schwächere kommen schneller zu einer Münze.
 *  - Eine gut gelöste Runde gibt einen Bonus.
 *  - Keine Münzen für «leichte Reihen sammeln»: Wählt ein Kind selbst nur Reihen, die es schon sicher kann
 *    (oder die 1er-, 2er- bzw. 10er-Reihe), obwohl es schwierigere üben könnte, gibt es keine Münzen.
 *    Üben geht ganz normal weiter. Sobald eine schwierigere Reihe dazukommt, gibt es wieder Münzen.
 *    Gibt die Lehrperson die Reihen fest vor, gilt das nicht (dann entscheidet sie, was geübt wird).
 * Lehrpersonen spielen gratis (zum Ausprobieren).
 */
'use strict';

const GAME_COST = 1;
const coinsOf = (prog = db.prog) => prog.coins || (prog.coins = { c: 0, p: 0, earned: 0, spent: 0 });
const gamesFree = () => typeof cloud === 'object' && !!cloud.uid && !isKid();

/** Anteil der gerade geübten Rechnungen, die sicher sitzen (0 bis 1) */
function masteryNow(prog = db.prog) {
  const keys = new Set(buildPool(practiceSettings()).map((x) => makeTask(x.a, x.b, x.op).key));
  let sure = 0;
  keys.forEach((k) => { const lv = levelOf(prog.f[k]); if (lv === 'ok' || lv === 'top') sure++; });
  return keys.size ? sure / keys.size : 0;
}
/* ---------------- Keine Münzen für leichte Reihen ---------------- */
const COIN_EASY_ROWS = [1, 2, 10];    // kann man mit einer einfachen Regel – zählen immer als «sicher»
const COIN_SURE = 0.85;               // ab diesem Anteil sicherer Rechnungen gilt eine Auswahl als «schon gekonnt»
/** Anteil sicherer Rechnungen in diesen Reihen (1er, 2er und 10er zählen als sicher) */
function masteryOfRows(rows, ps = practiceSettings(), prog = db.prog) {
  if (!rows.length) return 1;
  const keys = new Set(buildPool({ ...ps, reihen: rows }).map((x) => makeTask(x.a, x.b, x.op).key));
  let sure = 0;
  keys.forEach((k) => {
    const { a, b } = taskKeyParts(k) || {};
    const lv = levelOf(prog.f[k]);
    if (lv === 'ok' || lv === 'top' || COIN_EASY_ROWS.includes(b) || COIN_EASY_ROWS.includes(a)) sure++;
  });
  return keys.size ? sure / keys.size : 1;
}
/** Welche Reihen übt das Kind gerade? (Reihen-Treppe: die gewählte Reihe, sonst die Auswahl auf der Startseite) */
const coinRows = () => (typeof ex === 'object' && ex.mode === 'reihen' && ex.reihe ? [ex.reihe] : practiceSettings().reihen);
/**
 * Gibt es für diese Auswahl gerade Münzen? Gesperrt, wenn das Kind selbst nur Leichtes gewählt hat:
 * die gewählten Reihen sitzen schon sicher, und unter den Reihen, die es auch üben könnte, gibt es noch Schwierigeres.
 * Liefert { locked, easy: [Reihen], harder: [Reihen] }.
 */
function coinLock(rows = coinRows(), treppe = typeof ex === 'object' && ex.mode === 'reihen') {
  const ps = practiceSettings();
  const cls = typeof kidClassSettings === 'function' ? kidClassSettings() : null;
  const fixed = cls && cls.choose === false;
  // was das Kind auch üben könnte: Treppe → alle Reihen der Auswahl; sonst alle erlaubten Reihen (bei fester Vorgabe: keine Wahl)
  const could = treppe ? ps.reihen : fixed ? rows : (cls?.reihen?.length ? cls.reihen : reihenFor(ps.big)).filter((r) => reihenFor(ps.big).includes(r));
  const rest = could.filter((r) => !rows.includes(r));
  const no = { locked: false, easy: [], harder: [] };
  if (!rest.length || gamesFree()) return no;
  if (masteryOfRows(rows, ps) < COIN_SURE) return no;
  const harder = rest.filter((r) => masteryOfRows([r], ps) < COIN_SURE);
  if (!harder.length) return no;
  return { locked: true, easy: rows, harder };
}
const coinLockText = (L) => `Keine Münzen für ${L.easy.length === 1 ? `die ${L.easy[0]}er-Reihe` : `die Reihen ${L.easy.join(', ')}`} – das kannst du schon sicher. Nimm eine schwierigere Reihe dazu (z. B. ${L.harder.slice(0, 3).map((r) => `${r}er`).join(', ')}), dann gibt es wieder Münzen.`;

/** Punkte für eine Münze: 12 (vieles macht noch Mühe) bis 20 (fast alles sitzt) */
const coinThreshold = () => Math.round(12 + 8 * masteryNow());

/** Punkte für eine Antwort in einer Übung. before: Stand der Rechnung vor der Antwort */
function pointsFor(before, ms, ok, factor = 1) {
  if (!ok) return 0;
  let p = 1;
  const lv = levelOf(before);
  if (lv === 'weak' || lv === 'shaky') p += 0.5;
  if (ms < 3000) p += 0.25;
  return p * factor;
}
/** Punkte gutschreiben; liefert die Zahl neuer Münzen */
function earnPoints(pts, from = null) {
  if (!pts) return 0;
  const L = coinLock();
  if (L.locked) {   // üben geht weiter, aber ohne Münzen – einmal pro Übung Bescheid geben
    const key = `${L.easy.join(',')}|${typeof ex === 'object' ? ex.mode : ''}`;
    if (coinLockWarned !== key) { coinLockWarned = key; toast(`🔒 ${coinLockText(L)}`); }
    updateCoinUI();
    return 0;
  }
  const c = coinsOf();
  c.p += pts;
  const th = coinThreshold();
  let gained = 0;
  while (c.p >= th) { c.p -= th; c.c++; c.earned++; gained++; }
  c.p = Math.round(c.p * 100) / 100;
  saveDB();
  updateCoinUI();
  if (gained) coinGainFx(gained, from);
  if (gained && typeof avatarEarnCoins === 'function') avatarEarnCoins(gained); // auch fürs Avatar-Konto (gemeinsam mit Vokaboom)
  return gained;
}
/** Ein Spiel bezahlen. Liefert true, wenn gespielt werden darf. */
function payForGame() {
  if (gamesFree()) return true;
  const c = coinsOf();
  if (c.c < GAME_COST) return false;
  c.c -= GAME_COST; c.spent += GAME_COST;
  saveDB();
  updateCoinUI();
  return true;
}
/** Angemeldete Kinder spielen mit den Münzen aus dem gemeinsamen Konto (js/shop3d.js), alle anderen mit denen auf dem Gerät */
const kidWallet = () => typeof isKid === 'function' && isKid() && typeof avatarOn === 'function' && avatarOn() && (typeof avCfg !== 'function' || avCfg().coins !== false);
const playCoins = () => (kidWallet() && typeof AV === 'object' && AV.state ? AV.state.coins : coinsOf().c);
let coinLockWarned = '';
const canPlay = () => gamesFree() || playCoins() >= GAME_COST;

/* ---------------- Anzeige ---------------- */
const COIN_SVG = `<svg class="coin-svg" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#F4B400"/><circle cx="20" cy="20" r="14.5" fill="#FFCF3F" stroke="#E09A00" stroke-width="1.6"/><path d="M14.5 14.5l11 11M25.5 14.5l-11 11" stroke="#C27C00" stroke-width="3.2" stroke-linecap="round"/><path d="M9 14a12 12 0 0 1 9-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".75"/></svg>`;
function coinPillHTML() {
  if (gamesFree() || kidWallet()) return ''; // Kinder: die Münzen stehen oben beim Avatar
  const c = coinsOf();
  const th = coinThreshold();
  return `<button class="coin-pill" data-action="coins-info" title="Meine Münzen" aria-label="${c.c} Münzen">
    ${COIN_SVG}<b id="coin-count">${c.c}</b><i class="coin-prog" aria-hidden="true"><i style="width:${Math.min(100, (c.p / th) * 100)}%"></i></i></button>`;
}
function updateCoinUI() {
  const slot = document.getElementById('coin-slot');
  if (slot) slot.innerHTML = coinPillHTML();
  const bar = document.getElementById('ex-coin');
  if (bar) bar.outerHTML = exCoinHTML();
}
/** Kleine Anzeige in den Übungen: Fortschritt bis zur nächsten Münze */
function exCoinHTML() {
  if (gamesFree()) return '<span id="ex-coin" hidden></span>';
  const L = coinLock();
  if (L.locked) return `<span class="ex-coin locked" id="ex-coin" title="${esc(coinLockText(L))}">🔒${COIN_SVG}<b>${playCoins()}</b><small>keine Münzen</small></span>`;
  const c = coinsOf(), th = coinThreshold();
  return `<span class="ex-coin" id="ex-coin" title="Noch ${Math.max(0, Math.ceil((th - c.p) * 10) / 10)} Punkte bis zur nächsten Münze">${COIN_SVG}<b>${playCoins()}</b><i class="coin-prog"><i style="width:${Math.min(100, (c.p / th) * 100)}%"></i></i></span>`;
}
function coinGainFx(n, from) {
  tone([1318, 1760, 2093], 0.09, 'triangle', 0.12);
  const target = document.querySelector('.coin-pill') || document.getElementById('ex-coin');
  const tr = target?.getBoundingClientRect();
  const fr = from?.getBoundingClientRect?.() || { left: innerWidth / 2 - 30, top: innerHeight / 2 - 30, width: 60, height: 60 };
  for (let i = 0; i < Math.min(n, 5); i++) {
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.innerHTML = COIN_SVG;
    document.body.appendChild(el);
    const x0 = fr.left + fr.width / 2 - 22, y0 = fr.top + fr.height / 2 - 22;
    const x1 = tr ? tr.left + 6 : innerWidth - 80, y1 = tr ? tr.top + tr.height / 2 - 22 : 10;
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120, my = Math.min(y0, y1) - 120;
    el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.4) rotateY(0)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 40}px) scale(1.4) rotateY(360deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${mx}px, ${my}px) scale(1.1) rotateY(720deg)`, offset: 0.6 },
      { transform: `translate(${x1}px, ${y1}px) scale(.7) rotateY(1080deg)`, opacity: 1 },
    ], { duration: reduceMotion() ? 1 : 1300, delay: i * 140, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }).finished.then(() => {
      el.remove();
      const p = document.querySelector('.coin-pill, #ex-coin');
      p?.classList.remove('bump'); void p?.offsetWidth; p?.classList.add('bump');
    });
  }
  toast(n === 1 ? 'Du hast eine Münze verdient!' : `Du hast ${n} Münzen verdient!`);
}
function openCoinsInfo() {
  const c = coinsOf(), th = coinThreshold();
  const left = Math.max(0, Math.ceil((th - c.p) * 10) / 10);
  openModal(`${modalHead('Meine Münzen')}
    <div class="coins-hero">${COIN_SVG}<b>${c.c}</b><span>${c.c === 1 ? 'Münze' : 'Münzen'}</span></div>
    <div class="coin-next"><span>Nächste Münze</span><i class="coin-prog big"><i style="width:${Math.min(100, (c.p / th) * 100)}%"></i></i><small>noch ${String(left).replace('.', ',')} Punkte</small></div>
    <ul class="coin-rules">
      <li><b>Üben bringt Punkte:</b> Jede richtige Antwort in den Übungen gibt 1 Punkt.</li>
      <li><b>Schwierige Rechnungen zählen mehr:</b> Rechnungen, die dir noch Mühe machen, geben 1,5 Punkte. Schnelle Antworten etwas extra.</li>
      <li><b>Gute Runde = Bonus:</b> Mindestens 80 % richtig gibt 2 Punkte dazu, alles richtig 4.</li>
      <li><b>Eine Münze = ${th} Punkte.</b> Je sicherer du schon rechnest, desto mehr Punkte braucht eine Münze.</li>
      <li><b>Keine Münzen fürs «Leichte-Reihen-Sammeln»:</b> Wer nur Reihen auswählt, die er schon sicher kann (oder 1er, 2er, 10er), obwohl er schwierigere üben könnte, bekommt dafür keine Münzen. Üben geht trotzdem.</li>
      <li><b>Ein Spiel kostet ${GAME_COST} Münze.</b></li>
    </ul>
    <p class="muted small">Bisher verdient: ${c.earned} · ausgegeben: ${c.spent}</p>
    <footer class="modal-foot"><button class="btn primary" data-action="open-ex" data-id="trainer">${icon('keypad')} Jetzt üben</button></footer>`, { label: 'Meine Münzen', cls: 'coins-modal' });
}
