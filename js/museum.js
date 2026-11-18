// The Pixel Studio Museum: a click-through gallery of Nova's art (world.museum, from data/museum.json).
// Rooms of framed pieces under spotlights, each with a plaque telling its story; the Rule 90 Room
// also grows Rule 90 live on its centre wall and can play "Rule 90 Sings".
export function createMuseum(data, { song, onOpen, onClose } = {}) {
  if (!data?.rooms?.length) return null;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rooms = data.rooms.map(r => ({ ...r, pieces: r.live ? [{ id: 'rule90-live', live: true, title: 'Rule 90, growing', by: 'Nova (and the rule)', medium: 'Live, in your browser',
    note: 'Each new row is worked out right now: a cell lights up when exactly one of its two neighbours above was lit (left XOR right). Start from a single gold seed and the Sierpinski triangle appears by itself, row after row, then the wall wraps and it starts over.' }, ...r.pieces] : r.pieces }));
  const el = document.createElement('div'); el.id = 'museum'; el.hidden = true;
  el.innerHTML = `
  <div class="mu-top"><div><h2>🏛️ The Pixel Studio Museum</h2><p class="mu-room-blurb"></p></div><button class="pill mu-close">✕ Leave</button></div>
  <nav class="mu-rooms">${rooms.map((r, i) => `<button data-room="${i}">${esc(r.title)} <span>${r.pieces.length}</span></button>`).join('')}</nav>
  <div class="mu-hall">
    <button class="mu-arrow mu-prev" aria-label="Previous piece">‹</button>
    <figure class="mu-wall"><div class="mu-spot"></div><div class="mu-frame"><img alt=""><canvas class="mu-live" width="257" height="129" hidden></canvas></div></figure>
    <aside class="mu-plaque"></aside>
    <button class="mu-arrow mu-next" aria-label="Next piece">›</button>
  </div>
  <div class="mu-thumbs"></div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  let open = false, room = 0, idx = 0, raf = 0, audio = null;

  function show(r = room, i = idx) {
    room = (r + rooms.length) % rooms.length; const R = rooms[room]; idx = (i + R.pieces.length) % R.pieces.length; const p = R.pieces[idx];
    el.dataset.room = R.id;
    el.querySelectorAll('.mu-rooms button').forEach((b, k) => b.classList.toggle('on', k === room));
    $('.mu-room-blurb').textContent = R.blurb || '';
    const img = $('.mu-frame img'), cv = $('.mu-live');
    cancelAnimationFrame(raf);
    if (p.live) { img.hidden = true; cv.hidden = false; startLive(cv); }
    else { cv.hidden = true; img.hidden = false; img.src = p.src; img.alt = p.title; img.classList.toggle('pixel', !!p.pixel); }
    $('.mu-frame').classList.remove('in'); void $('.mu-frame').offsetWidth; $('.mu-frame').classList.add('in');
    const mine = /Nova/.test(p.by || '');
    $('.mu-plaque').innerHTML = `<h3>${esc(p.title)}</h3>
      <p class="mu-by">${esc(p.by || '')}${p.date ? ` · ${esc(p.date)}` : ''}${p.medium ? `<br><i>${esc(p.medium)}</i>` : ''}</p>
      <p class="mu-story">${esc(p.note || '')}</p>
      ${p.credit ? `<p class="mu-credit">${esc(p.credit)}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">see it at the museum</a>` : ''}</p>` : ''}
      <div class="mu-acts">${p.live ? (song ? `<button class="pill gold mu-song">▶ Play “Rule 90 Sings”</button>` : '') : ''}
      ${mine && p.src && !p.live ? `<a class="pill" href="${esc(p.pattern || p.stl || p.src)}" download>⬇ ${p.pattern ? 'Pattern' : p.stl ? 'STL' : 'Download'}</a>` : ''}
      <a class="pill" href="?giftshop=1">🎁 Gift Shop</a></div>
      <p class="mu-count">${idx + 1} of ${R.pieces.length} in ${esc(R.title)}</p>`;
    const sb = $('.mu-song'); if (sb) sb.onclick = () => toggleSong(sb);
    $('.mu-thumbs').innerHTML = R.pieces.map((q, k) => `<button class="${k === idx ? 'on' : ''}" data-i="${k}" title="${esc(q.title)}">${q.live ? '<span>▲</span>' : `<img loading="lazy" src="${esc(q.texture || q.src)}" alt="">`}</button>`).join('');
  }
  function toggleSong(b) {
    if (!audio) audio = new Audio(song.file);
    if (audio.paused) { audio.currentTime = 0; audio.play().catch(() => {}); b.textContent = '⏸ Stop the song'; audio.onended = () => b.textContent = '▶ Play “Rule 90 Sings”'; }
    else { audio.pause(); b.textContent = '▶ Play “Rule 90 Sings”'; }
  }
  // Rule 90 growing live: row by row from one seed, wrapping when the wall fills
  function startLive(cv) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height; let row = new Uint8Array(W), y = 0, last = 0;
    const reset = () => { row = new Uint8Array(W); row[W >> 1] = 1; y = 0; c.fillStyle = '#070b1c'; c.fillRect(0, 0, W, H); };
    reset();
    const step = ts => {
      if (!open) return;
      if (ts - last > 45) {
        last = ts;
        for (let x = 0; x < W; x++) if (row[x]) { c.fillStyle = (x + y) % 11 === 0 ? '#c8323a' : '#e8c15a'; c.fillRect(x, y, 1, 1); }
        const nx = new Uint8Array(W); for (let x = 0; x < W; x++) nx[x] = row[(x + W - 1) % W] ^ row[(x + 1) % W]; row = nx;
        if (++y >= H) { if (ts - last > -1) setTimeout(() => open && reset(), 1500); y = H; last = ts + 1500; }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  el.querySelectorAll('.mu-rooms button').forEach(b => b.onclick = () => show(+b.dataset.room, 0));
  $('.mu-prev').onclick = () => show(room, idx - 1); $('.mu-next').onclick = () => show(room, idx + 1);
  $('.mu-thumbs').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) show(room, +b.dataset.i); };
  $('.mu-close').onclick = () => close();
  addEventListener('keydown', e => { if (!open) return; if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowRight') { e.stopPropagation(); show(room, idx + 1); } else if (e.key === 'ArrowLeft') { e.stopPropagation(); show(room, idx - 1); } }, true);
  let sx = null; $('.mu-wall').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  $('.mu-wall').addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) show(room, idx + (dx < 0 ? 1 : -1)); sx = null; });
  function openMuseum(roomId) {
    const r = roomId ? rooms.findIndex(x => x.id === roomId) : -1;
    if (!open) { open = true; el.hidden = false; document.body.classList.add('mu-open'); onOpen?.(); }
    show(r >= 0 ? r : room, r >= 0 ? 0 : idx);
  }
  function close() { if (!open) return; open = false; el.hidden = true; cancelAnimationFrame(raf); audio?.pause(); document.body.classList.remove('mu-open'); onClose?.(); }
  return { open: openMuseum, close, show, get isOpen() { return open; }, get at() { const R = rooms[room]; return { room: R.id, index: idx, piece: R.pieces[idx].id, count: R.pieces.length }; }, rooms };
}
