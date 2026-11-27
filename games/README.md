# Nova's Arcade games

Each game is a self-contained ES module in its own folder (`games/<id>/game.js`). It is listed in `data/arcade.json` and loaded only when someone opens it.

## The contract

```js
export const meta = { id: 'my-game', title: 'My Game', width: 240, height: 256 }; // optional

export function create(host) {
  return {
    init(canvas) {},     // set canvas.width/height (internal pixels) and draw a first frame
    start() {},          // begin (usually on a title / attract screen)
    pause() {},          // stop the loop (cancel requestAnimationFrame) and draw a "paused" frame
    resume() {},
    destroy() {},        // stop everything; the overlay is closing
    onScore(fn) {},      // call fn({ score, level, lives, state, final, best }) when the score changes and at game over
    press(action) {},    // 'up' | 'down' | 'left' | 'right' | 'a' (confirm) | 'tap'
    key(k) { return false; }, // optional: raw key (e.g. typing initials); return true if used
    get paused() {},
  };
}

export function preview(ctx, w, h, t) {} // optional: draws the cabinet's attract screen in the 3D hall
```

What the host (`js/arcadeplayer.js`) gives you:
- **The canvas:** it scales your canvas to fit the screen, using whole-number scaling when it can and `image-rendering: pixelated`.
- **Controls, mapped to `press()`:** arrows/WASD, Space or Enter as `a`, swipes, a tap on the screen (`tap`), and an on-screen d-pad on touch devices.
- **Built-in keys:** P pauses, M toggles sound, and Esc (or ×) closes the game. The host also pauses you when the tab is hidden.
- **`host` fields:** `host.touch` (true on phones), `host.sfx(name)` with names `hop, blip, tick, splash, hit, nest, clear, over, start, extra`, and `host.tone(freq, dur, type, vol, slide)`. Sound is muted until the player turns it on.
- **Shared helpers in `games/_shared/`:** `pixelfont.js` (a 5×7 bitmap font that allocates nothing while drawing) and `scores.js` (a local top-N table in `localStorage`).

Guidelines: use `requestAnimationFrame` with a fixed timestep, allocate nothing per frame, and pre-render sprites to canvases once. Keep everything inside the folder; no network calls.

## Registering it

Add to `data/arcade.json`:

```json
{ "id": "my-game", "title": "My Game", "wing": "automata", "bay": 2,
  "module": "games/my-game/game.js", "color": "#c8323a", "date_added": "2026-11-20",
  "description": "What it is.", "controls": "Arrow keys…", "controls_touch": "Swipe…" }
```

Then run `python3 build_data.py`. It checks ids, wings, bay numbers, that the module exists, and that it exports `create`. Remove any `coming_soon` teaser that used the same bay.

## 3D / analog games (Honest Claw)

A game may also implement:

- `fill: true` (or `mode: '3d'` on the arcade.json entry): the canvas fills the stage at the current quality-tier DPR, without pixelated integer scaling.
- `resize(w, h)`: called when the canvas backing store changes.
- `hold(action, down)`: keyboard and the on-screen pad call this on press and release, so a claw can move while a key is held. Lorenz Crossing ignores this and still uses `press()`.
- `pointer(type, {x,y,w,h}, event)`: if present, the stage forwards pointer down/move/up/cancel in canvas CSS pixels instead of turning a swipe into `press('left')` etc.

Keep camera taps-versus-drags in the 3D Garden alone; the overlay pauses the world while a game is open.

