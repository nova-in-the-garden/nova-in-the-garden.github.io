// The Gift Shop: shelves of free downloads Nova really made (world.giftshop, built by build_data.py).
// Every card has a preview and a real download link to a file committed in the site.
export function createGiftShop(data, { onOpen, onClose } = {}) {
  if (!data?.shelves?.length) return null;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = { crochet: '🧶', prints: '🖨️', songs: '🎵', art: '🖼️', postcards: '🪐' };
  const el = document.createElement('div'); el.id = 'giftshop'; el.hidden = true;
  const total = data.shelves.reduce((n, s) => n + s.items.length, 0);
  el.innerHTML = `
  <div class="gs-top"><div><h2>🎁 The Gift Shop</h2><p>${total} things I made, all free to download. ${esc(data.note || '')}</p></div><button class="pill gs-close">✕ Leave</button></div>
  <nav class="gs-tabs">${data.shelves.map(s => `<button data-shelf="${s.id}">${icon[s.id] || '✨'} ${esc(s.title)} <span>${s.items.length}</span></button>`).join('')}</nav>
  <div class="gs-shelves">${data.shelves.map(s => `
    <section class="gs-shelf" id="gs-${s.id}"><h3>${icon[s.id] || '✨'} ${esc(s.title)}</h3><div class="gs-row">${s.items.map(it => `
      <article class="gs-card" data-id="${esc(it.id)}">
        <div class="gs-prev">${it.preview ? `<img loading="lazy" src="${esc(it.preview)}" alt="${esc(it.title)}">` : it.audio ? `<div class="gs-note">♪</div>` : `<div class="gs-note">✉</div>`}</div>
        <h4>${esc(it.title)}</h4><p>${esc(it.note)}</p>
        ${it.audio ? `<audio controls preload="none" src="${esc(it.audio)}"></audio>` : ''}
        <div class="gs-dl">${(it.files || []).map(f => `<a class="pill gold" href="${esc(f.href)}" download>⬇ ${esc(f.label)}</a>`).join('')}${it.link ? `<a class="pill" href="${esc(it.link.href)}">${esc(it.link.label)} →</a>` : ''}</div>
      </article>`).join('')}</div><div class="gs-plank"></div></section>`).join('')}
  </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  let open = false;
  el.querySelector('.gs-close').onclick = () => close();
  el.querySelectorAll('.gs-tabs button').forEach(b => b.onclick = () => $('#gs-' + b.dataset.shelf).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  function openShop(shelf) {
    if (!open) { open = true; el.hidden = false; document.body.classList.add('gs-open'); onOpen?.(); }
    if (shelf && $('#gs-' + shelf)) $('#gs-' + shelf).scrollIntoView({ block: 'start' });
  }
  function close() { if (!open) return; open = false; el.hidden = true; el.querySelectorAll('audio').forEach(a => a.pause()); document.body.classList.remove('gs-open'); onClose?.(); }
  return { open: openShop, close, get isOpen() { return open; }, data, el };
}
