/* Teilmal – Umzug von der alten Adresse einmaleins.fabulousteaching.ch
 *
 * Die alte Adresse leitet hierher weiter (tools/alte-adresse/) und hängt den Übungsstand dieses Geräts
 * an die Adresse an (#…&umzug=…). Hier wird er übernommen, wenn es auf der neuen Adresse noch keinen gibt.
 * Läuft vor allen anderen Skripten; main.js startet die App erst, wenn window.TEILMAL_UMZUG fertig ist.
 * Danach merkt sich der Browser (Cookie auf fabulousteaching.ch), dass der Umzug geklappt hat:
 * Die alte Adresse schickt dann nichts mehr mit.
 */
window.TEILMAL_UMZUG = (function umzug() {
  const m = location.hash.match(/(?:^#|&)umzug=([^&]*)/);
  if (!m) return null;
  // Den Umzug sofort aus der Adresse nehmen, den Rest (z. B. #k=… vom Login-Kärtchen) behalten
  const rest = location.hash.slice(1).split('&').filter((x) => !x.startsWith('umzug=')).join('&');
  try { history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : '')); } catch { /* */ }

  // Ein Stand ohne geübte Rechnungen und ohne Münzen darf überschrieben werden
  const empty = (json) => {
    try {
      const p = JSON.parse(json || 'null')?.prog;
      return !p || (!(p.q > 0) && !(p.coins?.c > 0) && !Object.keys(p.f || {}).length);
    } catch { return true; }
  };
  const apply = (json) => {
    const data = JSON.parse(json);
    for (const [k, v] of Object.entries(data || {})) {
      if (!/^einmaleins\.(db|kid|kiddb)$/.test(k) || typeof v !== 'string') continue;
      const cur = localStorage.getItem(k);
      if (cur == null || (k !== 'einmaleins.kid' && empty(cur))) localStorage.setItem(k, v);
    }
    if (/(^|\.)fabulousteaching\.ch$/i.test(location.hostname)) {
      document.cookie = 'tm_umzug=1; domain=fabulousteaching.ch; path=/; max-age=31536000; secure; samesite=lax';
    }
  };
  const bytes = (b64) => {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };

  const raw = m[1];
  try {
    if (raw.startsWith('j.')) { apply(new TextDecoder().decode(bytes(raw.slice(2)))); return null; }
    if (raw.startsWith('z.') && typeof DecompressionStream === 'function') {
      const stream = new Blob([bytes(raw.slice(2))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text().then(apply).catch(() => { /* Übernahme fehlgeschlagen: mit dem Stand hier weiter */ });
    }
  } catch { /* Übernahme fehlgeschlagen: mit dem Stand hier weiter */ }
  return null;
})();
