// Full-screen picture viewer: prev/next, zoom (click, wheel, pinch, + / -), pan, swipe, Esc/× to close.
// openLightbox(items, index) — items: { src, texture?, title, by?, date?, note?, credit?, link?, pixel? }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const linkify = s => esc(s).replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

let el, img, stage, items = [], idx = 0, onCloseCb = null, lastFocus = null;
const z = { s: 1, x: 0, y: 0 };
const ptrs = new Map(); let gesture = null;

function build() {
  el = document.createElement('div'); el.id = 'gallery'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Picture viewer');
  el.innerHTML = `<div class="lb-stage"><img class="lb-img" alt="" draggable="false"></div>
    <button class="lb-btn lb-x" aria-label="Close (Esc)">×</button>
    <button class="lb-btn lb-prev" aria-label="Previous picture">‹</button><button class="lb-btn lb-next" aria-label="Next picture">›</button>
    <div class="lb-tools"><button class="lb-btn lb-zout" aria-label="Zoom out">−</button><button class="lb-btn lb-zin" aria-label="Zoom in">+</button><button class="lb-btn lb-info" aria-label="Show or hide the caption">i</button></div>
    <div class="lb-cap"><div class="lb-head"><h3></h3><span class="lb-count"></span></div><p class="lb-meta"></p><p class="lb-note"></p></div>`;
  document.body.appendChild(el);
  img = el.querySelector('.lb-img'); stage = el.querySelector('.lb-stage');
  el.querySelector('.lb-x').onclick = close;
  el.querySelector('.lb-prev').onclick = () => go(-1); el.querySelector('.lb-next').onclick = () => go(1);
  el.querySelector('.lb-zin').onclick = () => zoomAt(z.s * 1.6, 0, 0); el.querySelector('.lb-zout').onclick = () => zoomAt(z.s / 1.6, 0, 0);
  el.querySelector('.lb-info').onclick = () => el.classList.toggle('nocap');
  // keyboard (capture, so the 3D world never sees these while the viewer is open)
  addEventListener('keydown', e => {
    if (el.hidden) return;
    const k = e.key; let used = true;
    if (k === 'Escape') close(); else if (k === 'ArrowRight') go(1); else if (k === 'ArrowLeft') go(-1);
    else if (k === '+' || k === '=') zoomAt(z.s * 1.6, 0, 0); else if (k === '-' || k === '_') zoomAt(z.s / 1.6, 0, 0); else if (k === '0') reset();
    else if (e.target.closest?.('#gallery')) used = false; else used = !['Tab'].includes(k);
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  stage.addEventListener('wheel', e => { e.preventDefault(); const p = rel(e); zoomAt(z.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  stage.addEventListener('pointerdown', down); stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', e => e.preventDefault());
  img.addEventListener('load', () => { img.classList.remove('loading'); });
}
const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };
function apply(anim) {
  // keep the picture on screen
  const r = stage.getBoundingClientRect(), w = img.offsetWidth * z.s, h = img.offsetHeight * z.s;
  const mx = Math.max(0, (w - r.width) / 2 + 40), my = Math.max(0, (h - r.height) / 2 + 40);
  if (z.s <= 1.001) { z.s = 1; z.x = 0; z.y = 0; } else { z.x = Math.max(-mx, Math.min(mx, z.x)); z.y = Math.max(-my, Math.min(my, z.y)); }
  img.style.transition = anim ? 'transform .18s ease-out' : 'none';
  img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  el.classList.toggle('zoomed', z.s > 1);
}
function zoomAt(s, px, py, anim = true) {
  s = Math.max(1, Math.min(8, s)); const k = s / z.s;
  z.x = px - (px - z.x) * k; z.y = py - (py - z.y) * k; z.s = s; apply(anim);
}
function reset() { z.s = 1; z.x = 0; z.y = 0; apply(true); }
function down(e) {
  try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gesture = { kind: 'tap', x0: e.clientX, y0: e.clientY, zx: z.x, zy: z.y, t: performance.now(), moved: 0 };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: z.s, mid: rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }), zx: z.x, zy: z.y }; }
}
function move(e) {
  if (!ptrs.has(e.pointerId) || !gesture) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.kind === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    const s = Math.max(1, Math.min(8, gesture.s0 * d / Math.max(20, gesture.d0))); const k = s / gesture.s0, m = gesture.mid;
    z.s = s; z.x = m.x - (m.x - gesture.zx) * k; z.y = m.y - (m.y - gesture.zy) * k; apply(false); return;
  }
  const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0; gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
  if (z.s > 1) { z.x = gesture.zx + dx; z.y = gesture.zy + dy; apply(false); }
  else if (gesture.moved > 6) img.style.transform = `translate(${dx * 0.6}px, 0)`;   // swipe preview
}
function up(e) {
  const g = gesture; ptrs.delete(e.pointerId);
  if (!g) return;
  if (g.kind === 'pinch') { if (ptrs.size === 0) gesture = null; apply(true); return; }
  gesture = null;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  if (z.s <= 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) return go(dx < 0 ? 1 : -1);
  if (z.s <= 1 && dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5 && e.pointerType !== 'mouse') return close();   // swipe down closes on phones
  if (g.moved < 8 && performance.now() - g.t < 500) {        // tap / click: zoom in there, or back out
    const ir = img.getBoundingClientRect(); const onImg = e.clientX >= ir.left && e.clientX <= ir.right && e.clientY >= ir.top && e.clientY <= ir.bottom; const p = rel(e);
    if (z.s > 1) reset(); else if (onImg) zoomAt(2.5, p.x, p.y); else close();
    return;
  }
  apply(true);
}
function show() {
  const it = items[idx]; if (!it) return;
  z.s = 1; z.x = 0; z.y = 0; apply(false);
  img.classList.toggle('pixel', !!it.pixel);
  img.alt = it.title || '';
  if (it.texture && it.texture !== it.src) { img.classList.add('loading'); img.src = it.texture; const hi = new Image(); hi.onload = () => { if (items[idx] === it) { img.src = it.src; img.classList.remove('loading'); } }; hi.src = it.src; }
  else img.src = it.src;
  el.querySelector('h3').textContent = it.title || '';
  el.querySelector('.lb-count').textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
  const meta = [it.by, fmtDate(it.date), it.credit].filter(Boolean).map(esc).join(' · ') + (it.link ? ` · <a href="${esc(it.link)}" target="_blank" rel="noopener">source</a>` : '');
  el.querySelector('.lb-meta').innerHTML = meta;
  el.querySelector('.lb-note').innerHTML = linkify(it.note || '');
  el.querySelector('.lb-note').hidden = !it.note;
  el.querySelectorAll('.lb-prev,.lb-next').forEach(b => b.hidden = items.length < 2);
  for (const d of [-1, 1]) { const n = items[(idx + d + items.length) % items.length]; if (n && n !== it) { const p = new Image(); p.src = n.texture || n.src; } }
}
function go(d) { if (items.length < 2) return; idx = (idx + d + items.length) % items.length; show(); }
export function openLightbox(list, start = 0, { onClose } = {}) {
  if (!el) build();
  items = list.filter(x => x && x.src); if (!items.length) return;
  idx = Math.max(0, Math.min(items.length - 1, start)); onCloseCb = onClose || null;
  lastFocus = document.activeElement;
  el.hidden = false; document.body.classList.add('lb-open'); el.classList.remove('nocap');
  show(); el.querySelector('.lb-x').focus({ preventScroll: true });
}
export function closeLightbox() { close(); }
function close() {
  if (!el || el.hidden) return;
  el.hidden = true; document.body.classList.remove('lb-open'); img.removeAttribute('src'); ptrs.clear(); gesture = null;
  try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
  const cb = onCloseCb; onCloseCb = null; cb?.();
}
export const lightboxState = () => ({ open: !!el && !el.hidden, index: idx, count: items.length, zoom: +z.s.toFixed(2), title: items[idx]?.title || '', src: el && !el.hidden ? img.currentSrc || img.src : '' });
