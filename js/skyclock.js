// The little sky clock: sun/moon icon, Central time, phase, sunrise/sunset,
// and (tap to open) a slider + phase buttons to preview any time of day.
import { REF, fmtTime } from './sun.js';

const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const ICON = { day: '☀️', golden: '🌤️', dawn: '🌅', dusk: '🌇' };
const hhmm = m => { const h = Math.floor(m / 60) % 24, mi = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };

export function setupSkyClock({ clock, onChange }) {
  const el = document.createElement('div'); el.id = 'sky-clock';
  el.innerHTML = `<button class="sky-main" aria-expanded="false" aria-controls="sky-more" title="Time of day in Nova's world (tap to preview other times)">
      <span class="ico" aria-hidden="true"></span><span class="tm"></span><span class="ph"></span><span class="rs"></span></button>
    <div id="sky-more" hidden>
      <p class="sky-tw"></p>
      <p class="sky-note">Nova's sky follows the real sun in US Central time. Drag to preview another hour.</p>
      <input type="range" min="0" max="1439" step="1" aria-label="Preview time of day (Central)">
      <div class="sky-row">
        <button data-p="dawn">Dawn</button><button data-p="day">Day</button><button data-p="golden">Golden</button><button data-p="dusk">Dusk</button><button data-p="night">Night</button>
        <button class="live" data-p="live">● Live</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const main = el.querySelector('.sky-main'), more = el.querySelector('#sky-more'), range = el.querySelector('input');
  const $ = s => el.querySelector(s);
  main.onclick = () => { more.hidden = !more.hidden; main.setAttribute('aria-expanded', String(!more.hidden)); };
  const setUrl = (k, v) => { const q = new URLSearchParams(location.search); q.delete('time'); q.delete('phase'); if (k) q.set(k, v); const s = q.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s.replace(/=(&|$)/g, '$1') : '') + location.hash); };
  range.oninput = () => { clock.set(+range.value); setUrl('time', hhmm(+range.value)); onChange?.(); };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const p = b.dataset.p;
    if (p === 'live') { clock.set(null); setUrl(); } else { clock.set(clock.phaseMinutes(p)); setUrl('phase', p); }
    onChange?.();
  });
  // stop the 3D scene from treating clicks/drags here as camera moves
  for (const ev of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
  let lastKey = '';
  return {
    el,
    update(st, clk) {
      const id = st.phase.id;
      const icon = id === 'night' ? MOONS[Math.round(st.moon.age * 8) % 8] : ICON[id];
      const key = [icon, fmtTime(st.date), st.phase.name, clk.live].join('|');
      if (key !== lastKey) {
        lastKey = key;
        $('.ico').textContent = icon;
        const dateBit = clk.dateOverride ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: REF.tz }).format(st.date) + ' · ' : '';
        $('.tm').textContent = `${dateBit}${fmtTime(st.date)} ${REF.tzLabel}`;
        $('.ph').textContent = (clk.live && !clk.dateOverride) ? st.phase.name : `${st.phase.name} · preview`;
        $('.rs').textContent = `↑ ${fmtTime(st.times.sunrise)} ↓ ${fmtTime(st.times.sunset)}`;
        $('.rs').title = `Sunrise ${fmtTime(st.times.sunrise)}, sunset ${fmtTime(st.times.sunset)} (civil twilight ${fmtTime(st.times.dawn)}–${fmtTime(st.times.dusk)}) ${REF.tzLabel}`;
        $('.sky-tw').textContent = `Sunrise ${fmtTime(st.times.sunrise)} · Sunset ${fmtTime(st.times.sunset)} · Twilight ${fmtTime(st.times.dawn)}–${fmtTime(st.times.dusk)} ${REF.tzLabel}`;
        el.classList.toggle('preview', !clk.live);
        el.dataset.phase = id;
        el.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', clk.live ? b.dataset.p === 'live' : false));
      }
      if (document.activeElement !== range) range.value = String(Math.round(clk.minutes));
    },
  };
}
