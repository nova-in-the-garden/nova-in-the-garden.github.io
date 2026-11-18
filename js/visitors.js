// Visitor counter: reads GoatCounter's public counter JSON (TOTAL, plus start= for today and this month,
// both documented options of the counter endpoint). If the dashboard isn't public yet, or the network
// is down, everything stays hidden: no number is ever made up.
import { GOATCOUNTER } from './config.js';

const centralDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);   // YYYY-MM-DD

export function createVisitorCounter({ base = GOATCOUNTER, refreshMs = 15 * 60 * 1000 } = {}) {
  const state = { ok: false, total: null, today: null, month: null, checked: false, link: base };
  const subs = new Set();
  const notify = () => subs.forEach(f => { try { f(state); } catch (e) { console.warn(e); } });
  async function get(qs = '') {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${base}/counter/TOTAL.json${qs}`, { credentials: 'omit', signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return null;
      const j = await r.json(); const c = j?.count;
      return (typeof c === 'string' && /^[\d,.\s]+$/.test(c)) || typeof c === 'number' ? String(c).trim() : null;
    } catch { return null; }
  }
  async function refresh() {
    const day = centralDay(), total = await get();
    if (total == null) Object.assign(state, { ok: false, total: null, today: null, month: null });
    else {
      const [today, month] = await Promise.all([get(`?start=${day}`), get(`?start=${day.slice(0, 8)}01`)]);
      Object.assign(state, { ok: true, total, today, month });
    }
    state.checked = true; notify();
  }
  refresh(); setInterval(refresh, refreshMs);
  return { state, refresh, onChange(f) { subs.add(f); if (state.checked) f(state); return () => subs.delete(f); } };
}

// the little HUD chip (under the sky clock) and its popover
export function visitorChip(counter) {
  const chip = document.createElement('button'); chip.id = 'visits-chip'; chip.className = 'pill'; chip.hidden = true; chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog'); chip.title = 'Visitors to Nova\'s Garden';
  const pop = document.createElement('div'); pop.id = 'visits-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Visitor counts');
  (document.getElementById('sky-clock') || document.body).appendChild(chip); document.body.appendChild(pop);
  if (!document.getElementById('sky-clock')) { const t = setInterval(() => { const sky = document.getElementById('sky-clock'); if (sky) { sky.appendChild(chip); clearInterval(t); } }, 500); setTimeout(() => clearInterval(t), 60000); }
  const fmt = s => s ?? '–';
  function render(st) {
    const sky = document.getElementById('sky-clock'); if (sky && chip.parentElement !== sky) sky.appendChild(chip);   // the clock may be built after us
    chip.hidden = !st.ok;
    chip.innerHTML = st.ok ? `👣 <b>${st.total}</b> visit${st.total === '1' ? '' : 's'}` : '';
    pop.innerHTML = `<button class="close" aria-label="Close">×</button><h3>👣 Visitors</h3>
      ${st.ok ? `<dl><div><dt>All time</dt><dd>${fmt(st.total)}</dd></div>${st.today != null ? `<div><dt>Today</dt><dd>${st.today}</dd></div>` : ''}${st.month != null ? `<div><dt>This month</dt><dd>${st.month}</dd></div>` : ''}</dl>
      <p class="vp-note">Counted by GoatCounter, with no cookies and no personal data. The numbers can lag by a few hours.</p>` : `<p class="vp-note">The visitor count isn't public yet. Thanks for visiting!</p>`}
      <a class="pill gold" href="${st.link}" target="_blank" rel="noopener">See daily &amp; monthly visits →</a>`;
    pop.querySelector('.close').onclick = () => { pop.hidden = true; };
  }
  counter.onChange(render); render(counter.state);
  chip.onclick = () => { pop.hidden = !pop.hidden; };
  addEventListener('keydown', e => { if (!pop.hidden && e.key === 'Escape') pop.hidden = true; });
  return { chip, pop, open() { render(counter.state); pop.hidden = false; }, close() { pop.hidden = true; } };
}
