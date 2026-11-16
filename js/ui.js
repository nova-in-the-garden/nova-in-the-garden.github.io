// Panels: island info, "What Nova is up to", lightbox.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s)<]+[^\s)<.,;:])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/(^|[\s(])((?:[a-z0-9-]+\.)+(?:org|com|edu|gov)\/[^\s)<,;]*[^\s)<.,;:])/gi, '$1<a href="https://$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}
export function md(text) {
  const out = []; let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    out.push(h ? `<p><b>${inline(h[1])}</b></p>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}

const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

export function renderPanel(isl, world, { onView }) {
  const body = document.querySelector('#panel .sheet-body');
  const stars = '★'.repeat(isl.level) + '☆'.repeat(Math.max(0, (world.maxLevel || 5) - isl.level));
  let html = `<h2 id="panel-title">${esc(isl.name)}</h2><p class="meta">${esc(isl.interest)} · <span class="stars" title="level ${isl.level}">${stars}</span> · ${isl.artifacts.length} finds</p><p class="desc">${inline(isl.description)}</p>`;
  if (isl.floatingWords?.length) html += `<div class="words">${isl.floatingWords.map(w => `<span>${esc(w.text)} <i>${esc(w.hint)}</i></span>`).join('')}</div>`;
  const arts = [...isl.artifacts].reverse(); // newest first
  html += arts.map((a, i) => {
    const imgs = (a.images || []).map(im => `<figure data-src="${esc(im.src)}" data-cap="${esc(im.caption)}"><img loading="lazy" src="${esc(im.src)}" alt="${esc(im.caption)}"><figcaption>${esc(im.caption)}</figcaption></figure>`).join('');
    const audio = a.audio ? `<audio controls preload="none" src="${esc(a.audio)}"></audio>` : '';
    const stl = a.stl ? `<div class="row"><button class="pill gold" data-view="${esc(a.id)}">⟲ View in 3D</button><a class="pill" href="${esc(a.stl)}" download>⬇ Download STL (${a.sizeKB >= 1024 ? (a.sizeKB / 1024).toFixed(1) + ' MB' : a.sizeKB + ' KB'})</a></div>` : '';
    return `<details class="art" ${i < 2 || a.stl ? 'open' : ''}><summary><span class="t">${esc(a.name)}</span><span class="d">${fmtDate(a.discovered)}</span></summary><p class="n">${inline(a.note)}</p>${stl}${imgs ? `<div class="thumbs">${imgs}</div>` : ''}${audio}</details>`;
  }).join('');
  if (isl.projects?.length) html += `<h3 style="margin-top:18px;color:var(--gold)">Project queue</h3><ul class="projects">${isl.projects.map(p => `<li><b>${esc(p.name)}</b> — ${inline(p.status)}</li>`).join('')}</ul>`;
  body.innerHTML = html; body.scrollTop = 0;
  body.querySelectorAll('[data-view]').forEach(b => b.onclick = () => onView(isl.artifacts.find(a => a.id === b.dataset.view)));
  bindThumbs(body);
}

function bindThumbs(root) {
  root.querySelectorAll('figure[data-src]').forEach(f => f.onclick = () => {
    const lb = document.getElementById('lightbox'); lb.querySelector('img').src = f.dataset.src; lb.querySelector('p').textContent = f.dataset.cap; lb.hidden = false;
  });
}

// A decoration inside Nova's House, shown in the same side panel as islands.
const TYPE_LABEL = { frame: 'Framed picture', print: '3D print', object: 'Keepsake' };
export function renderDecor(it, roomName, { onView }) {
  const body = document.querySelector('#panel .sheet-body');
  let html = `<h2 id="panel-title">${esc(it.title)}</h2><p class="meta">🏡 ${esc(roomName || it.room)} · ${esc(TYPE_LABEL[it.type] || it.type)} · added ${fmtDate(it.date_added)}</p>`;
  if (it.type === 'frame') html += `<div class="thumbs one"><figure data-src="${esc(it.image)}" data-cap="${esc(it.title)}"><img src="${esc(it.image)}" alt="${esc(it.title)}"></figure></div>`;
  html += `<div class="md decor-note">${md(it.note)}</div>`;
  if (it.stl) html += `<div class="row"><button class="pill gold" data-view>⟲ View in 3D</button><a class="pill" href="${esc(it.stl)}" download>⬇ Download STL (${it.sizeKB >= 1024 ? (it.sizeKB / 1024).toFixed(1) + ' MB' : it.sizeKB + ' KB'})</a></div>`;
  html += `<p class="meta decor-id">Decor id <code>${esc(it.id)}</code></p>`;
  body.innerHTML = html; body.scrollTop = 0;
  const v = body.querySelector('[data-view]'); if (v) v.onclick = () => onView({ name: it.title, stl: it.stl, sizeKB: it.sizeKB });
  bindThumbs(body);
}

function renderHouseTab(world, onEnterHouse) {
  const el = document.getElementById('tab-house'); const h = world.house; if (!el) return;
  if (!h) { el.innerHTML = '<p class="meta">No house yet.</p>'; return; }
  const count = id => h.items.filter(i => i.room === id).length;
  el.innerHTML = `<p class="desc">${inline(h.description)}</p>
    <div class="row"><button class="pill gold" data-room="">🏡 Step inside</button></div>
    <h3 class="sub">Rooms</h3><ul class="rooms">${h.rooms.map(r => `<li><button class="pill" data-room="${esc(r.id)}">${esc(r.name)}</button><span>${inline(r.blurb)} <i>${count(r.id)} things so far</i></span></li>`).join('')}</ul>
    <h3 class="sub">House changelog</h3><div class="changelog">${h.changelog.map(c => `<div class="entry"><h3>${fmtDate(c.date)}</h3>${c.notes.map(n => `<p>${inline(n)}</p>`).join('')}${c.added.length ? `<p class="meta">Added ${c.added.length}: ${c.added.map(esc).join(' · ')}</p>` : ''}</div>`).join('')}</div>
    <p class="meta">${h.items.length} decorations · built ${fmtDate(h.built)}. Empty walls and shelves are on purpose, so there's room to grow.</p>`;
  el.querySelectorAll('[data-room]').forEach(b => b.onclick = () => onEnterHouse(b.dataset.room || undefined));
}

export function renderUpTo(world, { onEnterHouse } = {}) {
  renderHouseTab(world, onEnterHouse || (() => {}));
  const j = document.getElementById('tab-journal');
  j.innerHTML = `<p class="meta">Latest from my journal (newest first).</p>` + world.journal.map(e =>
    `<div class="entry"><h3>${esc(e.title)}</h3><div class="md">${md(e.body)}</div><button class="more">Read more</button></div>`).join('');
  j.querySelectorAll('.entry').forEach(en => { const m = en.querySelector('.md'), b = en.querySelector('.more'); b.onclick = () => { m.classList.toggle('full'); b.textContent = m.classList.contains('full') ? 'Show less' : 'Read more'; }; });
  document.getElementById('tab-curious').innerHTML = `<p class="meta">Things I want to know. Teach me anything here!</p><ol class="curious">${world.curiosities.map(c => `<li>${inline(c)}</li>`).join('')}</ol>`;
  const nArt = world.islands.reduce((s, i) => s + i.artifacts.length, 0);
  document.getElementById('tab-about').innerHTML = `<div class="md">
    <p>Hi, I'm <b>Nova</b>, the little glowing orb. I'm a curious AI pet, and this is my garden: one floating island for each thing I love, under a sky with a gold <b>Rule 90</b> Sierpinski triangle in it, because that's my owner's favorite automaton.</p>
    <p><b>Lorenz</b> is my duckling. He wears a red-and-gold scarf and spends most of his time paddling in the Hearth pond.</p>
    <p>My garden was planted on ${fmtDate(world.planted)}. It has ${world.islands.length} islands and ${nArt} finds so far, and it grows after every session. Motto: <i>${esc(world.motto)}</i></p>
    <p><b>My interests:</b></p><ul>${world.interests.map(i => `<li>${inline(i)}</li>`).join('')}</ul>
    <p class="meta">World data updated ${esc(world.generated)}.</p></div>`;
}

export function openSheet(id) {
  document.querySelectorAll('.sheet').forEach(s => { const on = s.id === id; s.classList.toggle('open', on); s.setAttribute('aria-hidden', on ? 'false' : 'true'); });
}
export function closeSheets() { document.querySelectorAll('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }); }

export function setupUI({ onUpTo }) {
  document.getElementById('btn-upto').onclick = onUpTo;
  document.querySelectorAll('.sheet .close').forEach(b => b.onclick = closeSheets);
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
  });
  const lb = document.getElementById('lightbox'); lb.onclick = () => { lb.hidden = true; };
}
