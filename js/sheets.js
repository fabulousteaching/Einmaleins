/* Einmaleins – Übungsblätter als PDF (A4), aus den individuellen Fehlern eines Kindes
 *
 * Kleines eigenes PDF-Programm ohne Zusatzbibliothek: Text (Helvetica), Linien, Rechtecke, Kreise.
 * Dieselben Zeichenbefehle ergeben auch die Vorschau als SVG. Masse in Millimetern, Ursprung oben links.
 */
'use strict';

/* ---------------- Schriftbreiten (Helvetica, 1/1000 em) ---------------- */
const HELV_W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELVB_W = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const HELV_X = { 'Ä': [667, 722], 'Ö': [778, 778], 'Ü': [722, 722], 'ä': [556, 556], 'ö': [556, 611], 'ü': [556, 611], 'ß': [611, 611], '×': [584, 584], '·': [278, 278], '÷': [584, 584], '–': [556, 556], '…': [1000, 1000], '°': [400, 400], '’': [222, 278], 'é': [556, 556], 'è': [556, 556], 'à': [556, 556], 'â': [556, 556], 'ç': [500, 556], '☐': [722, 722] };
const WIN_EXTRA = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
/** Text in WinAnsi-Zeichen umwandeln; was es dort nicht gibt, ohne Akzente oder als „?“ */
function winAnsi(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out += ch;
    else if (c >= 0xA0 && c <= 0xFF) out += ch;
    else if (WIN_EXTRA[ch]) out += String.fromCharCode(WIN_EXTRA[ch]);
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && base.codePointAt(0) < 256 ? base : '?';
    }
  }
  return out;
}
function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) w += (bold ? HELVB_W : HELV_W)[c - 32];
    else if (HELV_X[ch]) w += HELV_X[ch][bold ? 1 : 0];
    else w += 556;
  }
  return (w / 1000) * size * (25.4 / 72); // Schriftgrösse in pt → Breite in mm
}

/* ---------------- Dokument ---------------- */
class SheetDoc {
  constructor() { this.pages = []; this.page = null; this.addPage(); }
  addPage() { this.page = []; this.pages.push(this.page); return this; }
  text(x, y, str, { size = 11, bold = false, color = '#12262A', align = 'left' } = {}) {
    const w = textWidth(str, size, bold);
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.page.push({ t: 'text', x: x0, y, str: String(str), size, bold, color });
    return w;
  }
  rect(x, y, w, h, { r = 0, fill = null, stroke = null, lw = 0.3, dash = null } = {}) { this.page.push({ t: 'rect', x, y, w, h, r, fill, stroke, lw, dash }); }
  line(x1, y1, x2, y2, { color = '#12262A', lw = 0.3, dash = null } = {}) { this.page.push({ t: 'line', x1, y1, x2, y2, color, lw, dash }); }
  circle(cx, cy, r, { fill = null, stroke = null, lw = 0.3 } = {}) { this.page.push({ t: 'circle', cx, cy, r, fill, stroke, lw }); }
  poly(pts, { fill = null, stroke = null, lw = 0.3, close = true } = {}) { this.page.push({ t: 'poly', pts, fill, stroke, lw, close }); }
}
const PW = 210, PH = 297;
const MM = 72 / 25.4;
const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(' '); };
const f2 = (v) => (Math.round(v * 100) / 100).toString();

function opsToPDF(ops) {
  const out = [];
  const X = (mm) => f2(mm * MM), Y = (mm) => f2((PH - mm) * MM);
  const path = (o) => {
    if (o.t === 'rect') {
      const { x, y, w, h } = o, r = Math.min(o.r || 0, w / 2, h / 2);
      if (!r) return `${X(x)} ${Y(y + h)} ${f2(w * MM)} ${f2(h * MM)} re`;
      const k = r * 0.5523;
      return [`${X(x + r)} ${Y(y)} m`, `${X(x + w - r)} ${Y(y)} l`, `${X(x + w - r + k)} ${Y(y)} ${X(x + w)} ${Y(y + r - k)} ${X(x + w)} ${Y(y + r)} c`,
        `${X(x + w)} ${Y(y + h - r)} l`, `${X(x + w)} ${Y(y + h - r + k)} ${X(x + w - r + k)} ${Y(y + h)} ${X(x + w - r)} ${Y(y + h)} c`,
        `${X(x + r)} ${Y(y + h)} l`, `${X(x + r - k)} ${Y(y + h)} ${X(x)} ${Y(y + h - r + k)} ${X(x)} ${Y(y + h - r)} c`,
        `${X(x)} ${Y(y + r)} l`, `${X(x)} ${Y(y + r - k)} ${X(x + r - k)} ${Y(y)} ${X(x + r)} ${Y(y)} c`, 'h'].join(' ');
    }
    if (o.t === 'circle') {
      const { cx, cy, r } = o, k = r * 0.5523;
      return [`${X(cx + r)} ${Y(cy)} m`, `${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`, `${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c`,
        `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`, `${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c`, 'h'].join(' ');
    }
    if (o.t === 'poly') return o.pts.map(([x, y], i) => `${X(x)} ${Y(y)} ${i ? 'l' : 'm'}`).join(' ') + (o.close ? ' h' : '');
    return '';
  };
  for (const o of ops) {
    if (o.t === 'text') {
      const s = winAnsi(o.str).replace(/[\\()]/g, (c) => '\\' + c).replace(/[\x80-\xff]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'));
      out.push(`BT /${o.bold ? 'F2' : 'F1'} ${f2(o.size)} Tf ${hexRGB(o.color)} rg ${X(o.x)} ${Y(o.y)} Td (${s}) Tj ET`);
    } else if (o.t === 'line') {
      out.push(`q ${hexRGB(o.color)} RG ${f2(o.lw * MM)} w 1 J ${o.dash ? `[${o.dash.map((d) => f2(d * MM)).join(' ')}] 0 d` : ''} ${X(o.x1)} ${Y(o.y1)} m ${X(o.x2)} ${Y(o.y2)} l S Q`);
    } else {
      const p = path(o);
      const op = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
      out.push(`q ${o.fill ? hexRGB(o.fill) + ' rg' : ''} ${o.stroke ? hexRGB(o.stroke) + ' RG' : ''} ${f2((o.lw || 0.3) * MM)} w 1 j ${o.dash ? `[${o.dash.map((d) => f2(d * MM)).join(' ')}] 0 d` : ''} ${p} ${op} Q`);
    }
  }
  return out.join('\n');
}
function docToPDF(doc) {
  const enc = new TextEncoder();
  const chunks = [], offs = [];
  let len = 0;
  const push = (s) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); len += b.length; };
  const latin = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const obj = (id, body) => { offs[id] = len; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
  const W = f2(PW * MM), H = f2(PH * MM);
  const n = doc.pages.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${doc.pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`));
  obj(3, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  obj(4, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  doc.pages.forEach((ops, i) => {
    const id = 5 + 2 * i;
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`));
    const content = latin(opsToPDF(ops));
    obj(id + 1, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
  });
  const xref = len, count = 5 + 2 * n;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offs[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info << /Producer (Einmaleins) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
function pageToSVG(ops) {
  const parts = ops.map((o) => {
    const dash = o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : '';
    if (o.t === 'text') return `<text x="${f2(o.x)}" y="${f2(o.y)}" font-size="${f2(o.size * 25.4 / 72)}" font-weight="${o.bold ? 700 : 400}" fill="${o.color}">${esc(o.str)}</text>`;
    if (o.t === 'line') return `<line x1="${f2(o.x1)}" y1="${f2(o.y1)}" x2="${f2(o.x2)}" y2="${f2(o.y2)}" stroke="${o.color}" stroke-width="${o.lw}" stroke-linecap="round"${dash}/>`;
    const paint = `fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.lw || 0.3}"${dash}`;
    if (o.t === 'rect') return `<rect x="${f2(o.x)}" y="${f2(o.y)}" width="${f2(o.w)}" height="${f2(o.h)}" rx="${o.r || 0}" ${paint}/>`;
    if (o.t === 'circle') return `<circle cx="${f2(o.cx)}" cy="${f2(o.cy)}" r="${f2(o.r)}" ${paint}/>`;
    if (o.t === 'poly') return `<${o.close ? 'polygon' : 'polyline'} points="${o.pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ')}" ${paint} stroke-linejoin="round"/>`;
    return '';
  });
  return `<svg class="sheet-svg" viewBox="0 0 ${PW} ${PH}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif"><rect width="${PW}" height="${PH}" fill="#fff"/>${parts.join('')}</svg>`;
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Blatt';

/* ---------------- Aufgaben fürs Blatt auswählen ---------------- */
const SHEET_DEFAULTS = { n: 24, gaps: true, div: true, reihe: true, solutions: false };
const sheetOpts = () => ({ ...SHEET_DEFAULTS, ...(db.settings.sheet || {}) });

/** Rechnungen so ordnen, dass dieselbe Rechnung (oder Tauschaufgabe) nie direkt nebeneinander steht */
function spreadOut(list, keyOf) {
  const rest = shuffle(list), out = [];
  while (rest.length) {
    const lastK = out.length ? keyOf(out[out.length - 1]) : null, prevK = out.length > 1 ? keyOf(out[out.length - 2]) : null;
    let i = rest.findIndex((x) => keyOf(x) !== lastK && keyOf(x) !== prevK);
    if (i < 0) i = rest.findIndex((x) => keyOf(x) !== lastK);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}
/**
 * Wählt die Rechnungen eines Blatts.
 * Schwierige Rechnungen (laut Gedächtnis) kommen mehrmals in verschiedenen Formen vor,
 * dazu wackelige und zum Auffüllen andere Rechnungen aus den geübten Reihen.
 */
function planSheet(prog, reihen, opts) {
  const hard = hardestKeys(prog, 10);
  const focusFacts = [];
  const seenF = new Set();
  hard.forEach(({ key }) => {
    const k = taskKeyParts(key);
    if (!k) return;
    const f = `${Math.min(k.a, k.b)}x${Math.max(k.a, k.b)}`;
    if (seenF.has(f)) return;
    seenF.add(f);
    focusFacts.push({ a: k.a, b: k.b, f });
  });
  const focus = focusFacts.slice(0, 8);
  let rs = reihen?.length ? reihen : [...new Set(Object.keys(prog.f).map((k) => taskKeyParts(k)?.b).filter(Boolean))];
  if (!rs.length) rs = [...REIHEN_KLEIN];
  // Zum Auffüllen: Rechnungen aus den Reihen, ohne die ganz einfachen (mal 1), mal 10 nur selten
  let fillPool = [];
  const trivial = rs.every((b) => b === 1 || b === 10);
  for (const b of rs) for (let a = 1; a <= 10; a++) {
    if (!trivial && (a === 1 || b === 1)) continue;
    const lv = levelOf(prog.f[`${a}x${b}`]);
    let w = lv === 'shaky' ? 4 : lv === 'none' ? 2 : lv === 'ok' ? 1.5 : lv === 'top' ? 0.6 : 3;
    if (!trivial && (a === 10 || b === 10)) w *= 0.3;
    fillPool.push({ a, b, w });
  }
  if (!fillPool.length) fillPool = [{ a: 2, b: 2, w: 1 }];
  // 1 Rechne: Malrechnungen
  const mul = [];
  focus.forEach((x, i) => {
    mul.push({ a: x.a, b: x.b, op: 'mul' });
    if (x.a !== x.b) mul.push({ a: x.b, b: x.a, op: 'mul' });
    if (i < 3) mul.push({ a: x.a, b: x.b, op: 'mul' });
  });
  const mulN = opts.n;
  while (mul.length > Math.ceil(mulN * 0.6)) mul.pop();
  let guard = 0;
  while (mul.length < mulN && guard++ < 500) {
    const x = weightedPick(fillPool, (y) => y.w);
    const cnt = mul.filter((y) => y.a * y.b === x.a * x.b && Math.min(y.a, y.b) === Math.min(x.a, x.b)).length;
    if (cnt >= 2) continue;
    mul.push(Math.random() < 0.5 && x.a !== x.b ? { a: x.b, b: x.a, op: 'mul' } : { a: x.a, b: x.b, op: 'mul' });
  }
  const factKey = (t) => `${Math.min(t.a, t.b)}x${Math.max(t.a, t.b)}`;
  const sec1 = spreadOut(mul, factKey).map((t) => makeTask(t.a, t.b, t.op));
  // 2 Lücken und Geteilt
  let sec2 = [];
  if (opts.gaps || opts.div) {
    const kinds = [...(opts.gaps ? ['gapA', 'gapB'] : []), ...(opts.div ? ['div', 'div'] : [])];
    const base = [...focus.map((x) => ({ a: x.a, b: x.b })), ...shuffle(fillPool).slice(0, 12)];
    const used = new Set();
    for (const x of base) {
      if (sec2.length >= 12) break;
      const op = kinds[sec2.length % kinds.length];
      const t = makeTask(x.a, x.b, op);
      if (used.has(t.key + op)) continue;
      used.add(t.key + op);
      sec2.push(t);
    }
    sec2 = spreadOut(sec2, factKey);
  }
  // 3 Reihe: die schwierigste Reihe
  let reihe = null;
  if (opts.reihe) {
    let worst = -1;
    for (const b of rs) {
      if (b === 1 || b === 10) continue;
      let d = 0;
      for (let a = 1; a <= 10; a++) d += difficulty(prog.f[`${a}x${b}`]);
      focus.forEach((x) => { if (x.b === b || x.a === b) d += 0.6; });
      if (d > worst) { worst = d; reihe = b; }
    }
    if (reihe == null) reihe = rs.find((b) => b !== 1 && b !== 10) || rs[0];
  }
  const given = new Set();
  if (reihe) { given.add(1); given.add(1 + rand(3) + 3); given.add(10); }
  return { focus, sec1, sec2, reihe, given };
}

/* ---------------- Blatt zeichnen ---------------- */
const SC = { ink: '#12262A', ink2: '#44606A', ink3: '#8AA0A6', teal: '#0F766E', coral: '#FF6B4A', sun: '#FFC233', box: '#F2F7F6', line: '#C3D4D3', red: '#D9363E' };
function drawLogo(doc, x, y, s = 1) {
  doc.poly([[x + 1 * s, y + 4.5 * s], [x + 8.5 * s, y + 2.8 * s], [x + 10.3 * s, y + 12.3 * s], [x + 2.8 * s, y + 14 * s]], { fill: SC.coral });
  doc.rect(x + 3 * s, y + 1.5 * s, 9.4 * s, 11.6 * s, { r: 2.6 * s, fill: SC.teal });
  doc.line(x + 5.4 * s, y + 4.7 * s, x + 10 * s, y + 9.9 * s, { color: '#FFFFFF', lw: 1.3 * s });
  doc.line(x + 10 * s, y + 4.7 * s, x + 5.4 * s, y + 9.9 * s, { color: '#FFFFFF', lw: 1.3 * s });
  [[13.6, 0.4], [15.8, 0.4], [13.6, 2.6]].forEach(([dx, dy]) => doc.circle(x + dx * s, y + dy * s, 0.8 * s, { fill: SC.sun }));
}
function drawStar(doc, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  doc.poly(pts, { stroke: SC.ink3, lw: 0.35 });
}
function sectionTitle(doc, y, no, title, sub = '') {
  doc.circle(19, y - 1.5, 3.3, { fill: SC.teal });
  doc.text(19, y - 0.2, String(no), { size: 10, bold: true, color: '#FFFFFF', align: 'center' });
  const w = doc.text(25, y, title, { size: 12.5, bold: true });
  if (sub) doc.text(27 + w, y, sub, { size: 9, color: SC.ink2 });
}
/** Ein Feld „7 · 8 = [  ]“; bei Lücken steht das Kästchen an der Stelle der Lücke. Feste Spalten, damit alles untereinander steht. */
function drawTaskCell(doc, x, y, t, showAnswer) {
  const S = SIGN();
  const size = 13.5, boxW = 13, boxH = 8.4;
  const parts = t.op === 'div' ? [String(t.p), ':', String(t.b), '=', 'BOX']
    : t.op === 'gapA' ? ['BOX', S, String(t.b), '=', String(t.p)]
      : t.op === 'gapB' ? [String(t.a), S, 'BOX', '=', String(t.p)]
        : [String(t.a), S, String(t.b), '=', 'BOX'];
  const W = [9, 5, 6, 5.6, 14];
  let cx = x;
  parts.forEach((p, i) => {
    const w = p === 'BOX' ? boxW + 1.2 : W[i];
    if (p === 'BOX') {
      doc.rect(cx, y - 6.3, boxW, boxH, { r: 1.8, fill: SC.box, stroke: SC.line, lw: 0.35 });
      if (showAnswer) doc.text(cx + boxW / 2, y, String(t.answer), { size, bold: true, color: SC.red, align: 'center' });
    } else if (/\d/.test(p)) {
      if (i === 4 || (i === 2 && parts[0] !== 'BOX')) doc.text(cx + 0.4, y, p, { size, bold: true });
      else doc.text(cx + w - 1, y, p, { size, bold: true, align: 'right' });
    } else if (p === '=') doc.text(cx + 1.4, y, p, { size, color: SC.ink2 });
    else doc.text(cx + w / 2, y, p, { size, color: SC.ink2, align: 'center' });
    cx += w;
  });
}
/**
 * Zeichnet ein Übungsblatt auf eine neue Seite.
 * who: { name, cls }, plan: aus planSheet
 */
function drawSheet(doc, who, plan, opts, { showAnswer = false } = {}) {
  const d = new Date();
  const dateTxt = d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
  // Kopf
  drawLogo(doc, 16, 12, 1.15);
  doc.text(37, 19, 'Einmaleins', { size: 11, bold: true, color: SC.teal });
  doc.text(37, 27.5, showAnswer ? 'Lösungen' : 'Mein Übungsblatt', { size: 20, bold: true });
  const nm = who.name || '';
  doc.text(118, 18, 'Name', { size: 8.5, color: SC.ink3 });
  doc.line(130, 18.6, 194, 18.6, { color: SC.line, lw: 0.35 });
  if (nm) doc.text(132, 17.6, nm, { size: 12, bold: true });
  doc.text(118, 27, 'Datum', { size: 8.5, color: SC.ink3 });
  doc.line(130, 27.6, 194, 27.6, { color: SC.line, lw: 0.35 });
  if (who.cls) doc.text(194, 33, who.cls, { size: 8.5, color: SC.ink3, align: 'right' });
  if (showAnswer) doc.text(132, 26.6, dateTxt, { size: 10, color: SC.ink2 });
  doc.line(16, 37, 194, 37, { color: SC.teal, lw: 0.6 });
  // Schwerpunkt
  let y = 45;
  if (plan.focus.length) {
    doc.text(16, y, 'Diese Rechnungen üben wir heute besonders:', { size: 10, color: SC.ink2 });
    let x = 16; y += 3.5;
    plan.focus.forEach((f) => {
      const label = `${f.a} ${SIGN()} ${f.b}`;
      const w = textWidth(label, 11, true) + 7;
      if (x + w > 194) { x = 16; y += 9; }
      doc.rect(x, y, w, 7, { r: 3.5, fill: '#FFF0EB', stroke: SC.coral, lw: 0.4 });
      doc.text(x + w / 2, y + 5, label, { size: 11, bold: true, color: '#B8361C', align: 'center' });
      x += w + 2.5;
    });
    y += 15;
  } else {
    doc.text(16, y, 'Gemischte Rechnungen aus deinen Reihen. Viel Spass!', { size: 10, color: SC.ink2 });
    y += 9;
  }
  // Zeilenhöhe so wählen, dass das Blatt gut gefüllt ist
  const cols = 3, colW = 59;
  const rows = Math.ceil(plan.sec1.length / cols);
  const r2rows = plan.sec2.length ? Math.ceil(plan.sec2.length / 3) : 0;
  const fixed = 15 + (r2rows ? 15 : 0) + (plan.reihe ? 28 : 0);
  const rowH = clamp((256 - y - fixed) / (rows + r2rows), 9.4, 15);
  // 1 Rechne
  sectionTitle(doc, y, 1, 'Rechne.');
  y += 9;
  plan.sec1.forEach((t, i) => {
    const c = Math.floor(i / rows), r = i % rows;
    drawTaskCell(doc, 18 + c * colW, y + r * rowH + 5, t, showAnswer);
  });
  y += rows * rowH + 6;
  // 2 Lücken und Geteilt
  let no = 2;
  if (plan.sec2.length) {
    sectionTitle(doc, y, no++, opts.gaps && opts.div ? 'Lücken und Geteilt.' : opts.div ? 'Geteilt.' : 'Fülle die Lücken.', opts.gaps ? 'Welche Zahl passt ins Kästchen?' : '');
    y += 9;
    const r2 = Math.ceil(plan.sec2.length / 3);
    plan.sec2.forEach((t, i) => {
      const c = Math.floor(i / r2), r = i % r2;
      drawTaskCell(doc, 18 + c * colW, y + r * rowH + 5, t, showAnswer);
    });
    y += r2 * rowH + 6;
  }
  // 3 Reihe
  if (plan.reihe) {
    sectionTitle(doc, y, no++, `Schreibe die ${plan.reihe}er-Reihe.`);
    y += 6;
    const bw = 16.2;
    for (let k = 1; k <= 10; k++) {
      const x = 16 + (k - 1) * (bw + 1.6);
      const giv = plan.given.has(k);
      doc.rect(x, y, bw, 10, { r: 2, fill: giv ? '#E1F5F1' : SC.box, stroke: giv ? SC.teal : SC.line, lw: 0.35 });
      if (giv || showAnswer) doc.text(x + bw / 2, y + 7.1, String(k * plan.reihe), { size: 13, bold: true, color: giv ? SC.teal : SC.red, align: 'center' });
      doc.text(x + bw / 2, y + 14, `${k}${SIGN()}${plan.reihe}`, { size: 7, color: SC.ink3, align: 'center' });
    }
    y += 22;
  }
  // Fuss: Selbsteinschätzung
  const fy = Math.max(y + 4, 262);
  doc.rect(16, fy, 178, 17, { r: 4, fill: '#F7FAF9', stroke: SC.line, lw: 0.3 });
  const total = plan.sec1.length + plan.sec2.length + (plan.reihe ? 10 - plan.given.size : 0);
  doc.text(22, fy + 7, 'Zeit:  ______ Minuten', { size: 10, color: SC.ink2 });
  doc.text(22, fy + 13.2, `Richtig:  ______ von ${total}`, { size: 10, color: SC.ink2 });
  doc.text(118, fy + 7, 'So gut ging es:', { size: 10, color: SC.ink2 });
  [0, 1, 2].forEach((i) => drawStar(doc, 124 + i * 9, fy + 11.6, 3.4));
  doc.text(194, fy + 13.2, 'Ausmalen!', { size: 8, color: SC.ink3, align: 'right' });
  doc.text(105, 289, `Erstellt mit Einmaleins · ${dateTxt}`, { size: 7, color: SC.ink3, align: 'center' });
}

/** Ein ganzes Blatt (plus auf Wunsch Lösungen) für eine Person in ein Dokument */
function addSheetFor(doc, who, prog, reihen, opts, first = false) {
  const plan = planSheet(prog, reihen, opts);
  if (!first) doc.addPage();
  drawSheet(doc, who, plan, opts);
  if (opts.solutions) { doc.addPage(); drawSheet(doc, who, plan, opts, { showAnswer: true }); }
  return plan;
}

/* ---------------- Eigenes Blatt (ohne Login oder als Kind) ---------------- */
function openMySheet() {
  const o = sheetOpts();
  const who = isKid() ? { name: kidName(), cls: kid.cls } : { name: db.settings.sheetName || '', cls: '' };
  openModal(`${modalHead('Mein Übungsblatt')}
    <p class="muted">Das Blatt enthält vor allem die Rechnungen, die dir noch Mühe machen – in verschiedenen Formen. Ausdrucken und auf Papier üben.</p>
    <div class="sheet-dialog">
      <div class="sheet-form">
        ${isKid() ? '' : `<label class="field"><span class="label">Name auf dem Blatt</span><input type="text" id="sh-name" maxlength="40" value="${esc(who.name)}" placeholder="z. B. Lena"></label>`}
        ${sheetOptsHTML(o)}
        <div class="row"><button class="btn primary" data-action="my-sheet-pdf">${icon('down')} PDF herunterladen</button><button class="btn ghost" data-action="my-sheet-new">${icon('shuffle')} Neu mischen</button></div>
      </div>
      <div class="sheet-prev" id="sheet-prev"></div>
    </div>`, { label: 'Mein Übungsblatt', cls: 'wide' });
  bindSheetOpts(() => renderMySheetPreview());
  $('#sh-name')?.addEventListener('input', debounce(() => { db.settings.sheetName = $('#sh-name').value.trim(); saveDB(); renderMySheetPreview(); }, 300));
  renderMySheetPreview();
}
let mySheetDoc = null;
function renderMySheetPreview() {
  const o = sheetOpts();
  const who = isKid() ? { name: kidName(), cls: kid.cls } : { name: ($('#sh-name')?.value || '').trim(), cls: '' };
  mySheetDoc = new SheetDoc();
  addSheetFor(mySheetDoc, who, db.prog, practiceSettings().reihen, o, true);
  const box = $('#sheet-prev');
  if (box) box.innerHTML = pageToSVG(mySheetDoc.pages[0]);
}
function downloadMySheet() {
  if (!mySheetDoc) renderMySheetPreview();
  const who = isKid() ? kidName() : ($('#sh-name')?.value || '').trim();
  downloadBlob(docToPDF(mySheetDoc), `Einmaleins-Uebungsblatt${who ? '-' + fileSafe(who) : ''}.pdf`);
  toast('PDF heruntergeladen.');
}
function sheetOptsHTML(o) {
  return `<div class="sheet-opts">
    <div class="field"><span class="label">Malrechnungen</span><div class="seg small">${[18, 24, 30].map((n) => `<button type="button" class="seg-btn" data-sheet-n="${n}" aria-pressed="${o.n === n}">${n}</button>`).join('')}</div></div>
    <label class="switch small"><input type="checkbox" data-sheet="gaps" ${o.gaps ? 'checked' : ''}><span>Lückenaufgaben (▢ ${SIGN()} 8 = 56)</span></label>
    <label class="switch small"><input type="checkbox" data-sheet="div" ${o.div ? 'checked' : ''}><span>Geteilt-Aufgaben (56 : 8)</span></label>
    <label class="switch small"><input type="checkbox" data-sheet="reihe" ${o.reihe ? 'checked' : ''}><span>Reihe aufschreiben</span></label>
    <label class="switch small"><input type="checkbox" data-sheet="solutions" ${o.solutions ? 'checked' : ''}><span>Lösungsblatt anhängen</span></label>
  </div>`;
}
function bindSheetOpts(onChange) {
  $$('[data-sheet]').forEach((cb) => cb.addEventListener('change', () => {
    db.settings.sheet = { ...sheetOpts(), [cb.dataset.sheet]: cb.checked };
    saveDB(); onChange();
  }));
  $$('[data-sheet-n]').forEach((b) => b.addEventListener('click', () => {
    db.settings.sheet = { ...sheetOpts(), n: +b.dataset.sheetN };
    $$('[data-sheet-n]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    saveDB(); onChange();
  }));
}
