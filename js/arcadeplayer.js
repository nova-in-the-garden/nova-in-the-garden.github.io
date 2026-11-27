// The full-screen game overlay for Nova's Arcade. It loads a game module
// (games/<id>/game.js), gives it a canvas, and turns keyboard, swipes and the
// on-screen d-pad into simple actions: up / down / left / right / a / tap.
// Esc or × closes it; the 3D world is paused while it is open (main.js).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// tiny WebAudio blips, muted by default
function makeSound() {
  let ac = null, muted = true;
  try { muted = localStorage.getItem('nova.arcade.sound') !== 'on'; } catch { }
  const ensure = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } if (ac?.state === 'suspended') ac.resume(); return ac; };
  function tone(f = 440, d = 0.08, type = 'square', vol = 0.06, slide = 0) {
    if (muted) return; const a = ensure(); if (!a) return;
    const t0 = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }
  const SFX = {
    hop: () => tone(520, 0.05, 'square', 0.04, 260), blip: () => tone(880, 0.04, 'square', 0.035), tick: () => tone(1200, 0.03, 'square', 0.025),
    splash: () => tone(300, 0.35, 'sawtooth', 0.05, -240), hit: () => tone(180, 0.3, 'square', 0.06, -120),
    nest: () => { tone(660, 0.08); setTimeout(() => tone(880, 0.08), 80); setTimeout(() => tone(1320, 0.12), 160); },
    clear: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.07), i * 110)),
    over: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.07), i * 170)),
    start: () => [523, 784].forEach((f, i) => setTimeout(() => tone(f, 0.08, 'square', 0.05), i * 90)), extra: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.07), i * 70)),
  };
  return {
    tone, play: n => SFX[n]?.(),
    get muted() { return muted; },
    set muted(v) { muted = !!v; if (!muted) ensure(); try { localStorage.setItem('nova.arcade.sound', muted ? 'off' : 'on'); } catch { } },
  };
}

export function createArcadePlayer({ onOpen, onClose, onScore } = {}) {
  const sound = makeSound();
  const el = document.createElement('div'); el.id = 'game-overlay'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="game-bar">
      <h2 class="game-title"></h2>
      <div class="game-btns">
        <button class="gbtn" data-act="pause" aria-label="Pause">⏸</button>
        <button class="gbtn" data-act="sound" aria-label="Sound"></button>
        <button class="gbtn close" data-act="close" aria-label="Close game">×</button>
      </div>
    </div>
    <div class="game-stage"><canvas class="game-canvas" tabindex="0"></canvas><p class="game-loading">Loading…</p></div>
    <div class="game-pad" aria-label="Game pad">
      <div class="dpad">
        <button data-dir="up" aria-label="Up">▲</button><button data-dir="left" aria-label="Left">◀</button>
        <button data-dir="a" class="mid" aria-label="Start">●</button>
        <button data-dir="right" aria-label="Right">▶</button><button data-dir="down" aria-label="Down">▼</button>
      </div>
    </div>
    <p class="game-help"></p>`;
  document.body.appendChild(el);
  const canvas = el.querySelector('canvas'), stage = el.querySelector('.game-stage'), title = el.querySelector('.game-title'), help = el.querySelector('.game-help'), loading = el.querySelector('.game-loading');
  const btnPause = el.querySelector('[data-act=pause]'), btnSound = el.querySelector('[data-act=sound]');
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  el.classList.toggle('touch', touch);
  let game = null, def = null, open = false, gen = 0, best = 0;
  const syncSound = () => { btnSound.textContent = sound.muted ? '🔇' : '🔊'; btnSound.title = sound.muted ? 'Sound is off (M)' : 'Sound is on (M)'; };
  syncSound();
  const host = { touch, sfx: n => sound.play(n), tone: sound.tone, get muted() { return sound.muted; } };

  function fit() {
    if (!game) return;
    const r = stage.getBoundingClientRect();
    // 3D / fill games use the whole stage and a device-pixel canvas (capped by the Garden's quality tier).
    if (game.fill || def?.mode === '3d') {
      el.classList.add('mode-3d');
      const cap = window.nova?.gfx?.T?.dpr || 2;
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      const w = Math.max(1, Math.floor(r.width * dpr)), h = Math.max(1, Math.floor(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; game.resize?.(w, h); }
      canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
      return;
    }
    el.classList.remove('mode-3d');
    const W = canvas.width, H = canvas.height;
    let s = Math.min(r.width / W, r.height / H);
    if (s >= 2) s = Math.floor(s); // whole-number scaling keeps pixels perfectly square
    canvas.style.width = Math.floor(W * s) + 'px'; canvas.style.height = Math.floor(H * s) + 'px';
  }
  async function openGame(g) {
    if (open) closeGame(true);
    def = g; open = true; const my = ++gen;
    el.hidden = false; el.classList.toggle('mode-3d', g.mode === '3d'); document.body.classList.add('in-game'); title.textContent = g.title; loading.hidden = false; canvas.style.visibility = 'hidden';
    help.innerHTML = esc(touch ? (g.controls_touch || 'Swipe or use the pad · tap to hop') : (g.controls || 'Arrow keys / WASD · P pause · M sound · Esc close'));
    onOpen?.(g);
    try {
      const mod = await import(new URL(g.module, document.baseURI).href);
      if (my !== gen) return;
      game = mod.create(host); game.init(canvas);
      game.onScore?.(s => { best = Math.max(best, s.best || 0); onScore?.(g, s); });
      game.start(); loading.hidden = true; canvas.style.visibility = ''; fit(); canvas.focus({ preventScroll: true });
      btnPause.textContent = '⏸';
      // Games with their own stick (Honest Claw) hide the arcade D-pad so
      // phones are not stuck with two control schemes.
      el.classList.toggle('own-pad', !!(game.hold && game.pointer));
    } catch (e) { console.error('arcade: game failed to load', g.module, e); loading.textContent = 'This game could not load. Try again later.'; }
  }
  function closeGame(silent = false) {
    if (!open) return; open = false; gen++;
    game?.destroy(); game = null; el.hidden = true; el.classList.remove('own-pad'); document.body.classList.remove('in-game');
    if (!silent) onClose?.(def);
  }
  function togglePause() { if (!game) return; if (game.paused) { game.resume(); btnPause.textContent = '⏸'; } else { game.pause(); btnPause.textContent = '▶'; } }
  el.querySelector('[data-act=close]').onclick = () => closeGame();
  btnPause.onclick = togglePause;
  btnSound.onclick = () => { sound.muted = !sound.muted; syncSound(); if (!sound.muted) sound.play('blip'); };
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'a', Enter: 'a' };
  addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeGame(); return; }
    e.stopImmediatePropagation();
    if (!game) return;
    if (game.key?.(e.key)) { e.preventDefault(); return; } // e.g. typing initials
    if (e.code === 'KeyP') { togglePause(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { btnSound.click(); e.preventDefault(); return; }
    const a = KEYS[e.code]; if (a) { e.preventDefault(); if (!e.repeat) { game.press(a); game.hold?.(a, true); } }
  }, true);
  addEventListener('keyup', e => {
    if (!open) return;
    e.stopImmediatePropagation();
    if (!game) return;
    const a = KEYS[e.code]; if (a) game.hold?.(a, false);
  }, true);
  // swipe / tap, or a game-owned pointer (drag-to-aim) when game.pointer exists
  let sw = null;
  const local = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  stage.addEventListener('pointerdown', e => {
    if (!game) return; e.preventDefault();
    if (game.pointer) { game.pointer('down', local(e), e); return; }
    sw = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  stage.addEventListener('pointermove', e => {
    if (!game || !game.pointer) return;
    game.pointer('move', local(e), e);
  });
  stage.addEventListener('pointerup', e => {
    if (!game) return;
    if (game.pointer) { game.pointer('up', local(e), e); return; }
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
    if (Math.hypot(dx, dy) < 18) { if (game.paused) togglePause(); else game.press('tap'); return; }
    game.press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  stage.addEventListener('pointercancel', e => {
    if (game?.pointer) game.pointer('cancel', local(e), e);
    sw = null;
  });
  // d-pad: fire on press (no waiting for release), hold to repeat slowly
  el.querySelectorAll('.dpad button').forEach(b => {
    let rep = 0;
    const fire = () => { if (game && !game.paused) game.press(b.dataset.dir); else if (game?.paused) togglePause(); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.classList.add('on'); fire();
      game?.hold?.(b.dataset.dir, true);
      clearInterval(rep);
      // games that listen to hold() drive continuous motion themselves; others still get a slow repeat
      if (!game?.hold) rep = setInterval(fire, 240);
      try { b.setPointerCapture?.(e.pointerId); } catch { }
    });
    const up = () => { b.classList.remove('on'); clearInterval(rep); game?.hold?.(b.dataset.dir, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.paused) togglePause(); });
  return {
    open: openGame, close: () => closeGame(), get isOpen() { return open; }, get game() { return game; }, get def() { return def; }, sound, fit,
  };
}
