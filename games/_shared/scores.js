// Local high-score table for an arcade game (kept in this browser's localStorage).
// Entries: { i: 'ABC', s: score, l: level, d: 'YYYY-MM-DD' }, best first.
export function scoreTable(gameId, size = 8) {
  const key = `nova.arcade.${gameId}.scores`;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(key) || '[]').filter(e => e && typeof e.s === 'number').slice(0, size); } catch { list = []; }
  return {
    get list() { return list; },
    get best() { return list[0]?.s || 0; },
    qualifies(s) { return s > 0 && (list.length < size || s > list[list.length - 1].s); },
    add(initials, s, l) {
      const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const e = { i: String(initials).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'A'), s, l, d: day };
      list.push(e); list.sort((a, b) => b.s - a.s); list = list.slice(0, size);
      try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* private mode: keep it in memory */ }
      return list.indexOf(e);
    },
    clear() { list = []; try { localStorage.removeItem(key); } catch { } },
  };
}
