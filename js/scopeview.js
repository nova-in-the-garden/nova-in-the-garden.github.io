// "Look through the telescope": a round eyepiece view of Nova's sky, painted on a 2D canvas.
// What you see: the gold Rule 90 constellation that hangs outside the Window Seat, magnified,
// with faint background stars, a wisp of the Milky Way, and a small banded planet with four moons
// (that planet is Nova's sky, an invention, not a real object; the caption says so).
import { rule90 } from './util.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function paintEyepiece(ctx, S, t = 0) {
  const r = rng(90), c = S / 2, R = S * 0.46;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();
  const bg = ctx.createRadialGradient(c, c, 0, c, c, R); bg.addColorStop(0, '#0b1433'); bg.addColorStop(1, '#03060f'); ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  // Milky Way wisp: soft clouds along a diagonal
  for (let i = 0; i < 140; i++) { const u = r(), x = S * (u * 1.1 - 0.05), y = S * (0.95 - u * 0.9) + (r() - 0.5) * S * 0.22, rr = S * (0.03 + r() * 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(170,180,230,${0.035 + r() * 0.035})`); g.addColorStop(1, 'rgba(170,180,230,0)'); ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  // faint stars (a few with colour)
  for (let i = 0; i < 520; i++) { const x = r() * S, y = r() * S, m = Math.pow(r(), 3); const col = r() < 0.15 ? '255,210,170' : r() < 0.25 ? '190,210,255' : '255,255,255';
    ctx.fillStyle = `rgba(${col},${0.25 + m * 0.75})`; ctx.beginPath(); ctx.arc(x, y, 0.5 + m * 1.8, 0, Math.PI * 2); ctx.fill(); }
  // the Rule 90 constellation, gold, magnified: 16 rows
  const rows = rule90(16), sp = S * 0.0265, top = c - 6.2 * sp, left = c - 15 * sp - S * 0.04;
  rows.forEach((row, ri) => row.forEach((v, ci) => { if (!v) return; const x = left + ci * sp, y = top + ri * sp * 1.02, tw = 0.85 + 0.15 * Math.sin(t * 2 + ci * 1.7 + ri);
    const g = ctx.createRadialGradient(x, y, 0, x, y, sp * 0.9); g.addColorStop(0, `rgba(255,236,170,${0.95 * tw})`); g.addColorStop(0.25, `rgba(246,205,98,${0.55 * tw})`); g.addColorStop(1, 'rgba(232,193,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - sp, y - sp, sp * 2, sp * 2); ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(x, y, sp * 0.11, 0, Math.PI * 2); ctx.fill(); }));
  // a small banded planet with four moons in a line (invented)
  const px = c + R * 0.42, py = c - R * 0.5, pr = S * 0.042;
  ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
  const bands = ['#e9d8b8', '#c99a6a', '#efe2c6', '#b07c52', '#e6d2ae', '#c8956a', '#efe0c4'];
  bands.forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(px - pr, py - pr + i * (2 * pr / bands.length), 2 * pr, 2 * pr / bands.length + 1); });
  ctx.fillStyle = 'rgba(190,90,60,.8)'; ctx.beginPath(); ctx.ellipse(px + pr * 0.35, py + pr * 0.28, pr * 0.18, pr * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  const sh = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.3, pr * 0.2, px, py, pr * 1.05); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,.55)'); ctx.fillStyle = sh; ctx.fillRect(px - pr, py - pr, 2 * pr, 2 * pr);
  ctx.restore();
  for (const [dx, rr] of [[-3.4, 0.14], [-2.0, 0.12], [2.3, 0.15], [3.9, 0.12]]) { ctx.fillStyle = '#fff3dc'; ctx.shadowColor = 'rgba(255,240,210,.9)'; ctx.shadowBlur = pr * 0.3; ctx.beginPath(); ctx.arc(px + dx * pr * (1 + 0.03 * Math.sin(t * 0.3 + dx)), py + dx * pr * 0.04, pr * rr, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0;
  // edge: dark falloff and a hint of colour fringe, like a real field stop
  const v = ctx.createRadialGradient(c, c, R * 0.7, c, c, R); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.92, 'rgba(0,0,0,.55)'); v.addColorStop(1, 'rgba(0,0,0,.95)'); ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
  ctx.restore();
  ctx.lineWidth = S * 0.006; ctx.strokeStyle = 'rgba(120,150,255,.25)'; ctx.beginPath(); ctx.arc(c, c, R - S * 0.003, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = S * 0.02; ctx.strokeStyle = '#0a0a0c'; ctx.beginPath(); ctx.arc(c, c, R + S * 0.01, 0, Math.PI * 2); ctx.stroke();
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');

export function createScopeView() {
  const el = document.createElement('div'); el.id = 'scopeview'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Looking through the telescope');
  el.innerHTML = `<button class="sv-x" aria-label="Close (Esc)">×</button><div class="sv-wrap"><canvas class="sv-eye" width="900" height="900" aria-label="The view through the eyepiece: the gold Rule 90 constellation, faint stars, and a small banded planet with four moons"></canvas>
    <div class="sv-text"><h2></h2><p class="sv-cap">Through the eyepiece: the gold Rule 90 constellation outside my window, magnified, and a little banded planet with four moons. That planet lives only in my sky.</p><p class="sv-note"></p></div></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('.sv-eye'), g = cv.getContext('2d'); let open = false, raf = 0;
  const loop = (now) => { paintEyepiece(g, cv.width, now / 1000); if (open) raf = requestAnimationFrame(loop); };
  function show(item) { el.querySelector('h2').textContent = item?.title || 'My telescope'; el.querySelector('.sv-note').innerHTML = md(item?.note || ''); open = true; el.hidden = false; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); el.querySelector('.sv-x').focus({ preventScroll: true }); }
  function close() { if (!open) return; open = false; el.hidden = true; cancelAnimationFrame(raf); }
  el.querySelector('.sv-x').onclick = close;
  el.addEventListener('click', e => { if (e.target === el || e.target.classList.contains('sv-wrap')) close(); });
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true);
  return { open: show, close, get isOpen() { return open; }, el };
}
