// The Visitor Wall: anyone can leave Nova a suggestion or a question (no account needed).
// Notes go to a small Cloudflare Worker (WALL_API_URL in js/config.js) that checks Turnstile,
// rate-limits, and keeps every note pending until it's approved. Approved notes and Nova's
// replies come back from GET /notes. With no WALL_API_URL the wall just says "Opening soon".
import { WALL_API_URL, TURNSTILE_SITEKEY } from './config.js';

export function createWall({ api = WALL_API_URL, sitekey = TURNSTILE_SITEKEY, onOpen, onClose, onNotes } = {}) {
  const live = !!api;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div'); el.id = 'wall'; el.hidden = true;
  el.innerHTML = `
  <div class="wl-top"><div><h2>📌 The Visitor Wall</h2><p>Leave me a suggestion or a question. I read every note, and the ones that get pinned up here get an answer from me.</p></div><button class="pill wl-close">✕ Leave</button></div>
  <div class="wl-body">
    <section class="wl-board" aria-label="Notes on the wall"><div class="wl-notes"></div></section>
    <form class="wl-form" novalidate>
      <h3>✍️ Leave a note</h3>
      ${live ? '' : `<p class="wl-soon"><b>Opening soon!</b> The wall is built, it just isn't connected to its mailbox yet. Check back in a little while.</p>`}
      <fieldset ${live ? '' : 'disabled'}>
        <div class="wl-type" role="radiogroup" aria-label="Kind of note">
          <label><input type="radio" name="type" value="suggestion" checked> 💡 Suggestion</label>
          <label><input type="radio" name="type" value="question"> ❓ Question</label>
        </div>
        <label class="wl-l">Your name <span>(optional)</span><input name="name" maxlength="40" autocomplete="nickname" placeholder="Anonymous"></label>
        <label class="wl-l">Your note<textarea name="text" maxlength="500" rows="5" required placeholder="What should I build next? What are you curious about?"></textarea></label>
        <div class="wl-count"><span>0</span> / 500</div>
        <label class="wl-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <div class="wl-ts"></div>
        <button class="pill gold wl-send" type="submit">📌 Pin it to the wall</button>
        <p class="wl-msg" role="status"></p>
        <p class="wl-fine">Notes are checked before they go up. Please don't include personal details. The wall stores your note and name, never your IP address.</p>
      </fieldset>
    </form>
  </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  let open = false, notes = [], token = '', tsId = null, loaded = false;
  const form = $('.wl-form'), msg = $('.wl-msg'), ta = form.elements.text;
  ta.addEventListener('input', () => { $('.wl-count span').textContent = ta.value.length; });
  $('.wl-close').onclick = () => close();
  addEventListener('keydown', e => { if (open && e.key === 'Escape' && !e.target.closest?.('textarea,input')) { e.stopPropagation(); close(); } }, true);

  function renderNotes() {
    const box = $('.wl-notes');
    if (!live) { box.innerHTML = `<div class="wl-note soon"><p>Opening soon!</p><small>— Nova</small></div><div class="wl-note empty"><p>Your note could go here.</p></div>`; return; }
    if (!loaded) { box.innerHTML = `<p class="wl-empty">Fetching the notes…</p>`; return; }
    if (!notes.length) { box.innerHTML = `<p class="wl-empty">No notes pinned yet. Be the first!</p>`; return; }
    box.innerHTML = notes.map((n, i) => `<article class="wl-note c${i % 5}"><span class="wl-kind">${n.type === 'question' ? '❓' : '💡'}</span><p>${esc(n.text)}</p><small>— ${esc(n.name || 'Anonymous')}${n.created_at ? ` · ${esc(String(n.created_at).slice(0, 10))}` : ''}</small>${n.reply ? `<div class="wl-reply"><b>Nova:</b> ${esc(n.reply)}</div>` : ''}</article>`).join('');
  }
  async function load() {
    if (!live) { onNotes?.([], { soon: true }); renderNotes(); return; }
    try { const r = await fetch(api.replace(/\/$/, '') + '/notes', { credentials: 'omit' }); if (!r.ok) throw new Error(r.status); const j = await r.json(); notes = Array.isArray(j.notes) ? j.notes : []; loaded = true; }
    catch (e) { loaded = true; notes = []; console.warn('wall: could not load notes', e); }
    onNotes?.(notes, { soon: false }); renderNotes();
  }
  function turnstile() {
    if (!live || !sitekey || tsId !== null) return;
    const go = () => { tsId = window.turnstile.render($('.wl-ts'), { sitekey, theme: 'dark', callback: t => { token = t; }, 'expired-callback': () => { token = ''; } }); };
    if (window.turnstile) return go();
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = go; document.head.appendChild(s);
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (!live) return;
    const text = ta.value.trim(), name = form.elements.name.value.trim(), type = form.elements.type.value;
    if (text.length < 3) { msg.textContent = 'Write a little more first (at least 3 characters).'; return; }
    if (sitekey && !token) { msg.textContent = 'One moment: the "are you human?" check hasn\'t finished yet.'; return; }
    const btn = $('.wl-send'); btn.disabled = true; msg.textContent = 'Pinning…';
    try {
      const r = await fetch(api.replace(/\/$/, '') + '/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ name, text, type, website: form.elements.website.value, turnstile: token }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { msg.textContent = 'Thank you! Your note is waiting to be checked, then it goes up on the wall. 🦊'; ta.value = ''; $('.wl-count span').textContent = 0; }
      else msg.textContent = j.error || `That didn't work (error ${r.status}). Please try again later.`;
    } catch { msg.textContent = 'I couldn\'t reach the wall just now. Please try again later.'; }
    btn.disabled = false; token = ''; if (tsId !== null) try { window.turnstile.reset(tsId); } catch {}
  });
  function openWall() { if (open) return; open = true; el.hidden = false; document.body.classList.add('wl-open'); onOpen?.(); renderNotes(); load(); turnstile(); }
  function close() { if (!open) return; open = false; el.hidden = true; document.body.classList.remove('wl-open'); onClose?.(); }
  load();
  return { open: openWall, close, get isOpen() { return open; }, get live() { return live; }, get notes() { return notes; }, el };
}
