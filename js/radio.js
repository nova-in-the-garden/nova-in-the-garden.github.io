// Nova's radio (Pixel Studio). Data: world.radio (data/radio.json, built by build_data.py).
// One <audio> element routed through WebAudio (gain for volume, analyser for the glow).
// Never autoplays: on() is only ever called from a click/tap.
const VOL_KEY = 'nova.radio.volume';
const fmt = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createRadio(R, { onChange } = {}) {
  const tracks = R?.tracks || [];
  const audio = new Audio(); audio.preload = 'none'; audio.crossOrigin = 'anonymous';
  let ctx = null, gain = null, analyser = null, bins = null;
  const st = { on: false, index: 0, volume: +(localStorage.getItem(VOL_KEY) ?? 0.6), title: '', reason: '' };
  if (!(st.volume >= 0 && st.volume <= 1)) st.volume = 0.6;

  // ---- the little player (bottom-left), shown while the radio is on or after you click it
  const ui = document.createElement('div'); ui.id = 'radio-ui'; ui.hidden = true; ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', 'Nova FM radio');
  ui.innerHTML = `<div class="rd-top"><span class="rd-station">📻 ${esc(R?.station || 'Nova FM')}</span><button class="rd-x" aria-label="Turn off and close">×</button></div>
    <div class="rd-title" aria-live="polite"></div><div class="rd-note"></div>
    <div class="rd-bar"><span class="rd-t">0:00</span><input class="rd-seek" type="range" min="0" max="1000" value="0" aria-label="Position"><span class="rd-d">0:00</span></div>
    <div class="rd-ctl"><button class="rd-prev" aria-label="Previous song">⏮</button><button class="rd-power" aria-label="Turn the radio on">⏻</button><button class="rd-next" aria-label="Next song">⏭</button>
    <label class="rd-vol">🔈<input type="range" min="0" max="100" aria-label="Volume"></label><button class="rd-more" aria-label="Show all songs" aria-expanded="false">≡</button></div>
    <ol class="rd-list" hidden>${tracks.map((t, i) => `<li><button data-i="${i}">${esc(t.title)}<span>${fmt(t.seconds)}</span></button></li>`).join('')}</ol>`;
  document.body.appendChild(ui);
  const $ = s => ui.querySelector(s);
  const vol = $('.rd-vol input'); vol.value = Math.round(st.volume * 100);
  $('.rd-power').onclick = () => toggle();
  $('.rd-next').onclick = () => next(); $('.rd-prev').onclick = () => prev();
  $('.rd-x').onclick = () => { off('closed'); ui.hidden = true; };
  $('.rd-more').onclick = () => { const l = $('.rd-list'); l.hidden = !l.hidden; $('.rd-more').setAttribute('aria-expanded', !l.hidden); $('.rd-more').classList.toggle('on', !l.hidden); };
  vol.oninput = () => setVolume(vol.value / 100);
  $('.rd-seek').oninput = e => { if (isFinite(audio.duration)) audio.currentTime = e.target.value / 1000 * audio.duration; };
  ui.querySelectorAll('.rd-list [data-i]').forEach(b => b.onclick = () => play(+b.dataset.i));
  ui.addEventListener('keydown', e => e.stopPropagation());   // arrows on the sliders shouldn't move the world

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC(); const src = ctx.createMediaElementSource(audio);
      gain = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.7;
      bins = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser); analyser.connect(gain); gain.connect(ctx.destination); gain.gain.value = st.volume;
    } catch (e) { console.warn('radio: WebAudio unavailable, using plain audio', e); ctx = null; }
  }
  function load(i) {
    st.index = (i + tracks.length) % tracks.length; const t = tracks[st.index];
    audio.src = t.file; st.title = t.title;
  }
  function render() {
    const t = tracks[st.index] || {};
    $('.rd-title').textContent = st.on ? `♪ ${t.title || ''}` : (t.title ? `Off · next up: ${t.title}` : 'Off');
    $('.rd-note').textContent = t.note || '';
    const p = $('.rd-power'); p.classList.toggle('on', st.on); p.setAttribute('aria-label', st.on ? 'Turn the radio off' : 'Turn the radio on'); p.setAttribute('aria-pressed', st.on);
    ui.classList.toggle('on', st.on);
    ui.querySelectorAll('.rd-list [data-i]').forEach(b => b.classList.toggle('cur', +b.dataset.i === st.index));
    onChange?.({ ...st });
  }
  async function on(i = st.index) {
    if (!tracks.length) return;
    ensureCtx(); if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    if (!audio.src || i !== st.index) load(i);
    if (!ctx) audio.volume = st.volume;
    st.on = true; st.reason = ''; ui.hidden = false; render();
    document.querySelectorAll('audio').forEach(a => { if (a !== audio && !a.paused) a.pause(); });
    try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') { console.warn('radio: play blocked', e.name); st.on = false; render(); } }
  }
  function off(reason = 'off') { if (!st.on && audio.paused) return; audio.pause(); st.on = false; st.reason = reason; render(); }
  function toggle() { st.on ? off('switched off') : on(); }
  function play(i) { load(i); on(st.index); }
  function next() { load(st.index + 1); st.on ? on(st.index) : render(); }
  function prev() { if (st.on && audio.currentTime > 3) { audio.currentTime = 0; return; } load(st.index - 1); st.on ? on(st.index) : render(); }
  function setVolume(v) { st.volume = Math.max(0, Math.min(1, v)); localStorage.setItem(VOL_KEY, st.volume); if (gain) gain.gain.setTargetAtTime(st.volume, ctx.currentTime, 0.03); else audio.volume = st.volume; vol.value = Math.round(st.volume * 100); }
  function show() { ui.hidden = false; render(); }
  audio.addEventListener('ended', () => { if (st.on) { load(st.index + 1); on(st.index); } });
  audio.addEventListener('timeupdate', () => {
    $('.rd-t').textContent = fmt(audio.currentTime); $('.rd-d').textContent = fmt(audio.duration || tracks[st.index]?.seconds);
    if (isFinite(audio.duration)) $('.rd-seek').value = Math.round(audio.currentTime / audio.duration * 1000);
  });
  audio.addEventListener('error', () => { if (st.on) console.warn('radio: could not load', audio.src); });
  // another player on the page (e.g. the panel's <audio>) starting stops the radio
  document.addEventListener('play', e => { if (e.target !== audio && e.target.tagName === 'AUDIO') off('other audio'); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) off('tab hidden'); });
  if (tracks.length) load(0); render();

  // 0..1 loudness for visuals (cheap: reuses one buffer)
  function level() {
    if (!st.on || !analyser) return st.on ? 0.4 + 0.2 * Math.sin(performance.now() / 180) : 0;
    analyser.getByteFrequencyData(bins); let s = 0; for (let i = 2; i < 40; i++) s += bins[i]; return Math.min(1, s / (38 * 170));
  }
  return { on, off, toggle, next, prev, play, setVolume, show, level, state: st, audio, tracks, get ctx() { return ctx; }, ui };
}
