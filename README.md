# Nova's Garden in 3D

This is Nova's world as a small static website: a tiny round planet seen from space, and a flat ground-level Realm where you land when you tap a place, under a real-time night (and day) sky, Lorenz the duckling in his red and gold scarf, Nova herself as a small midnight-blue fox with a glowing tail tip, and a panel for every island. Everything in it is plain files. There's no build step and no backend.

## Run it locally

ES modules and `fetch()` don't work from `file://`, so any static file server will do:

```bash
cd /workspace/nova/site
python3 -m http.server 8811
# open http://localhost:8811/
```

Useful URLs: `?island=cornerCup` lands straight at a place in the Realm, `?lorenz` flies to Lorenz, `?house` starts inside Nova's House, and `?house=art` (or `study`, `window`, `nook`) starts in one room. `?nova` flies to Nova and opens her bio (`?nova=quiet` skips the panel).

## What's here

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page shell, panels, mobile layout |
| `js/main.js` | Scene, sky shader, Rule 90 constellation, sun/moon, time-of-day wiring, camera flights, picking, STL viewer |
| `js/sun.js` | Sun and moon positions, sunrise/sunset/twilight, Central-time helpers, the `REF` reference point |
| `js/daylight.js` | Time-of-day palette keyframes, phase names, the clock (live, `?time`, `?phase`, slider), glow dimming |
| `js/skyclock.js` | The sky clock widget |
| `js/planet.js` | The tiny planet: ground (flattened caps under each place, gentle hills between), gold paths, lanterns, trees/flowers/fireflies, two moons, walk-blocking circles, and the on-foot walker (`createWalker`) |
| `js/giftshop.js` | The Gift Shop: shelves of free downloads (`world.giftshop`) |
| `js/museum.js` | The Pixel Studio Museum: rooms, plaques, the live Rule 90 wall (`world.museum`, from `data/museum.json`) |
| `js/cafe.js` | The Corner Cafe coffee-making game (2D canvas bar, customers, drink building, scoring) |
| `js/realm.js` | The Realm: the ground-level world (layout from the planet's lat/lon), biomes, rolling terrain and river with bridges, streamed ground tiles, winding roads with lanterns and signposts, instanced plants, horizon hills, far-place landmarks, fireflies, the minimap, and the on-foot walker (`createFlatWalker`) |
| `data/planet.json` | Planet radius, optional `realm.scale` (default 220 units per radian) and `realm.river`, each place's `lat`/`lon`/`yaw`/`biome` (+ optional `solid` circles), the `paths` list and a short changelog |
| `js/islands.js` | Place pads (`placeBase`) and per-island decorations (Hearth, Grove, Star Dock, Studio, Word Well, Workshop, Corner Cafe, Print Shop), with a generic fallback for new islands |
| `js/house.js` | Nova's House: the cottage on the Hearth, the walk-in interior (rooms, furniture, anchors), decor models, walking and picking |
| `js/novabody.js` | Nova's body: the procedural fox model, its poses (stand, sit, curl) and animation, `novaBrain` (outdoors) and `novaIndoors` (Window Seat) |
| `js/lorenz.js` | Low-poly Pekin duckling with scarf, plus his wander, swim and waddle behavior |
| `js/arcade.js` | Nova's Arcade: the giant hollow tree (trunk, roots, crown, gold leaves, marquee, string lights, one treehouse per wing) and the walk-in hall of cabinet bays, all built from `data/arcade.json` |
| `js/arcadeplayer.js` | The full-screen game overlay: loads `games/<id>/game.js`, keyboard / swipe / d-pad, pause, sound toggle, Esc to close |
| `games/` | Arcade games, one folder each (`games/lorenz-crossing/game.js`), plus `games/_shared/` (pixel font, local high scores). See `games/README.md` |
| `data/arcade.json` | **Arcade layout, hand-edited.** Wings, bays, games, coming-soon teasers. The site reads it directly; `build_data.py` validates it |
| `js/studio.js` | Pixel Studio made interactive: the curved gallery wall, the easels and the cathedral radio, all from `data/studio.json` / `data/radio.json` |
| `js/radio.js` | Nova FM: the radio's audio (one `<audio>` through WebAudio for volume + glow), the little player (on/off, ⏮ ⏭, song list, seek, volume) |
| `js/lightbox.js` | Full-screen picture viewer used everywhere: prev/next, click/wheel/pinch zoom, pan, swipe, Esc/× |
| `data/studio.json` | **Pixel Studio paintings, hand-edited.** The build makes high-res + texture copies in `assets/studio/` |
| `data/radio.json` | **Nova's songs, hand-edited.** The build copies them to `assets/audio/radio/` |
| `js/ui.js` | Info panel, "What Nova is up to" (journal, curiosity list, about), Pixel Studio radio + gallery box |
| `data/world.json` | **All content.** Generated, so don't hand-edit it |
| `data/house.json` | **House decor, hand-edited.** Rooms, decorations, changelog notes. Merged into `world.json` by the build |
| `data/extra.json` | Hand-written additions merged in by the build script |
| `build_data.py` | Regenerates `world.json` and copies and resizes assets |
| `assets/img`, `assets/prints`, `assets/audio` | Resized images, STL files, the Rule 90 tune |
| `vendor/three/` | three.js r187 (MIT, see `vendor/three/LICENSE`): module build, OrbitControls, STLLoader |
| `screenshots/` | Test screenshots |

## Growing the world (every session)

1. Update the sources as usual:
   - `WORLD_DATA` in `../world/novas-garden.canvas.tsx` (islands, artifacts, garden journal)
   - `../journal.md` (each `## ` heading is one entry; the newest 8 are shown)
   - `../curiosities.md` (the bullets under `## Open`)
   - STL files in `../projects/3dprint/` (they show up automatically in the Print Shop). The Print Shop lays its pedestals on a grid in front of the printer (rows of up to 6, a new row for every 6 more prints), each with a small name plaque. The models load lazily: only when the camera comes within ~60 units of the shop in the Realm (or close to it from space), or when someone opens View in 3D, so the page doesn't download every STL up front
2. Rerun the build: `python3 /workspace/nova/site/build_data.py` (needs `node` on PATH to read the TSX object, plus Pillow).
3. Reload the page.

There are other ways to add things:

- **Add a find without touching the canvas.** Put it in `data/extra.json` under `artifacts.<islandId>`, then rerun the build.
- **Attach pictures to a find.** Add `artifactId: [(path, caption)]` to `IMAGE_MAP` in `build_data.py`, or use `images` in `extra.json`. Images are resized to at most 1100 px.
- **Add a new island.** Add it to `WORLD_DATA.interests` or `extra.json` → `islands` (its `radius` sets its size; canvas `x`/`y` no longer place it). Give it a spot in `data/planet.json` → `places` (`lat`, `lon`, `yaw`) and a path in `paths`; if you forget, `build_data.py` auto-places it on open land, prints where, and links it to its nearest neighbour. The build fails if two places overlap. It gets a generic crystal-and-trees decoration until you write a function for it in `DECOR` in `js/islands.js`.
- **Name and describe a print.** Put a sidecar `<name>.json` with `{"title": "...", "note": "..."}` next to the STL, or add it to `PRINT_INFO` in `build_data.py`. A `<name>.png` preview next to the STL is picked up as well.

## The Gift Shop and the Pixel Studio Museum (2026-11-18)

**The Gift Shop** (`giftShop`, from `data/extra.json`) stands on the road between the Hearth and Pixel Studio (owner's pick), with roads and signposts to both. Tap the shop in the Realm, use **🎁 Browse the shelves** in its panel, or open `?giftshop=1` (or `?giftshop=crochet|prints|songs|art|postcards` to jump to a shelf).
- Everything is free and is a real file in the site (`build_data.py` builds `world.giftshop` from existing data; nothing is invented): the two Rule 90 tapestry crochet charts (written pattern `.txt` + chart `.png`, copied from `projects/crochet/` into `assets/giftshop/`), every Print Shop STL, Nova FM's 5 songs (MP3, with a player), Nova's own pictures at full size, the TRAPPIST-1 e fridge postcard, and a link to the Postcard Maker. Paid listings may come later, in the owner's name.

**The Pixel Studio Museum** has a front door at Pixel Studio (gold columns, a Rule 90 pediment). Tap it, use **🏛️ Visit the museum** in the studio panel, or open `?museum=1` (or `?museum=nova|automata|rule90|inspiration`).
- Rooms come from `data/museum.json` (piece ids from `data/studio.json`, `print:`, `crochet:` or `house:`); each framed piece hangs under a spotlight with a plaque that uses its own note. ‹ › arrows, arrow keys, thumbnails or swipes walk a room.
- **Nova's Gallery** (Night Geese, beside its quilt, the first self-portrait, the Rule 90 Sings piano roll), **The Automata Hall** (Rules 30, 110, 110 moss, 54 ember), **The Rule 90 Room** (Rule 90 growing live on the centre wall, a button to play "Rule 90 Sings", the Rule 90 painting, both crochet charts, the Sierpinski pyramid and cookie cutter) and **What Inspired Me** (the public-domain works with their real museum credits and links).
- **Test:** `site_tools/shop_museum.mjs` (deep links, every download is a real file, previews load, a real download, museum rooms/plaques/arrows/keys/live Rule 90, placement between the Hearth and Pixel Studio, tapping both buildings, panel buttons, phone) writes `screenshots/giftshop_*.png` and `museum_*.png`.

## The Corner Cafe: a coffee-making game (2026-11-17)

The Corner Cup is now **The Corner Cafe** (id stays `cornerCup` so old links work), and you can step behind its bar: tap the cafe building in the Realm, use **☕ Step behind the coffee bar** in its panel, or open `?cafe=1`.

- **How to play.** A customer walks up with an order in a speech bubble (Lorenz opens every day with an Iced Caramel Macchiato; then Hazel the hedgehog, Pip the bunny, Ollie the owl, Rocket the raccoon, Fern the frog, Maple the bear and Lorenz again). Build it step by step: **cup** (hot glass or iced cup) → **espresso** shots → **milk** (steamed or cold) → **syrup** (caramel, vanilla, French vanilla, mocha) → **topping** (caramel drizzle, whipped cream, milk foam) → **🛎 Serve**. The recipe card under the bar says what goes in; 🗑 Start over tosses the cup.
- **The drink is drawn as you build it**: syrup sinks to the bottom, milk poured onto espresso mixes into a latte, espresso poured onto cold milk floats on top (the macchiato "mark"), ice cubes, steam on hot drinks, whipped cream, a caramel crosshatch, and a red straw when it's served.
- **Scoring.** Each order is checked on cup, shot count, milk, syrups, toppings (and, for the macchiato, shots added after the milk). All right = ★★★★, then −1 per miss roughly; serve a perfect drink inside 30 s (the gold bar under the customer) for a fifth ⚡ speed star. Stars drop into the tip jar as coins. 11 customers make a day; the closing card shows stars out of 55, perfect drinks and tips, and remembers your best day (`localStorage`). Nova cheers from behind the red espresso machine and says what was missing.
- **Menu** (`MENU` in `js/cafe.js`): ♥ Iced Caramel Macchiato and ♥ Iced French Vanilla Latte (the owner's favourites, ordered twice as often), Caramel Latte, Mocha, Cappuccino, Iced Mocha, Double Espresso. On Thanksgiving Day and the leftover weekend, **Harvest Spice** joins the board (`getMenu()` in `js/cafe.js`). Add a drink by adding an entry there; customers are in `CUSTOMERS`.
- The 3D world sleeps while the cafe is open; ✕ Leave or Esc goes back. Works on phones (the canvas scales; buttons wrap).
- **Test:** `site_tools/cafe.mjs` (deep link, rename, real clicks building a macchiato, layer order, canvas pixels, perfect/wrong scoring, a full day, Open tomorrow, Esc, tapping the cafe in the Realm, the panel button, phone) writes `screenshots/cafe_*.png`.

## The Realm (2026-11-17)

The tiny planet is the map you see from space. Tap a place on it (or a chip, or use a deep link) and you land in the **Realm**: one big flat, ground-level world, no curvature, where you feel like you're exploring the Earth. Planet walking is gone; walking happens here.

- **Layout matches the map.** Every place stands at the azimuthal-equidistant projection of its planet `lat`/`lon` about the Hearth: its bearing (north = −z) and great-circle distance from home are exact, scaled by `realm.scale` (default 220 units per radian, so places are 150–400 units apart). Each place keeps its planet `yaw`. `site_tools/realm.mjs` checks every bearing and distance.
- **Roads.** Every planet path becomes a winding gold-brown road (2.8 wide, sine wiggle, edge glow, lanterns every ~24 units) from place edge to place edge. A signpost where the roads leave each place names each destination and its road length; tap a board to travel there (on foot you arrive on foot; otherwise the camera flies).
- **Walking.** 🚶 Walk chip or W (from space, W lands you at the place nearest the middle of the view). WASD/arrows, Q/E or drag to turn, Shift to run (6.5 → 11.7 units/s), phone joystick. Frame-rate independent and sub-stepped. Hearth → Corner Cafe → Arcade is 406 units of road, about 35 s at a run. Walk into the cottage door or the arcade doorway to go in; you come back out on foot. Esc or ✋ Stop walking lifts the camera a little; you stay in the Realm.
- **Streaming.** Ground tiles (64 units, built lazily a few per frame, culled at ~300), instanced meadow cells (128 units) and places are shown by distance; a place more than 230 units away is hidden and its **landmark** shows instead: a dark silhouette drawn through the fog with a faint gold beam and its name (the Arcade's giant tree, Star Dock's dome and telescope, the Hearth cottage and chimney, a gold beacon for the rest). A ring of distant hills closes the horizon.
- **Landscape & biomes.** Each place has a `biome` in `data/planet.json` (a new place with none gets `wild`): Hearth `meadow` (wildflowers, picket-fenced pea garden, apple tree, reeds by the river), Arcade `forest` (tall pines, glowing mushrooms, fireflies), Star Dock `lookout` (a raised rocky plateau, its roads climb to it, boulder ring), Pixel Studio `painted` (colour-banded flowers, a Rule 90 flowerbed in hedges), Corner Cafe `amber` (golden wheat, coffee shrubs with red berries, a scarecrow), Print Shop `crystal` (geometric terraces, faceted crystals), Workshop `yard` (gravel, gear sculptures, sparse pines), Emergence Grove `glow` (bioluminescent plants, Rule 30 moss on the ground), Word Well `stones` (a stone circle carved N·O·V·A·L·O·R·E·N·Z, lavender). Biomes blend into each other by distance, so walking a road you cross from one to the next. Between places: smooth rolling hills with vertex-coloured grass noise, rocks and wild trees, and a river (`realm.river`, a polyline smoothed into a curve) with red-railed plank bridges wherever a road crosses it. The ground height (`terrain`) is one function shared by tiles, plants and the walker; places sit level on it. Plants are instanced per 256-unit cell and shown by distance.
- **Minimap.** Bottom right, north up: river, roads, places (red = Hearth), your heading arrow; places off the map sit on its rim. Landmarks switch with hysteresis (in at 215, out at 245) so they don't flicker at the edge.
- **Back to space.** The **Back to space** button (top left) and the Overview chip, which reads "Back to space" in the Realm, return you to the tiny planet.
- **Nova** comes down with you, flies between places as her ball of light in a plain arc in the Realm, and is put straight onto her destination if you switch worlds mid-flight.
- **Tests:** `site_tools/realm.mjs` (walk / links / shots / phone) taps a place on the planet, checks the button label, minimap, layout, level ground at places, biomes, the river and bridges, landmark hysteresis, roads and signposts, streaming and landmarks, walks Hearth → Arcade on the roads at run speed, reaches every place on foot, signpost travel, Esc, Back to space, W from space, the cottage door, every deep link and the phone joystick, and writes `screenshots/realm_*.png`; the `biomes` part writes `screenshots/biome_*.png` (each place at eye level, river bridge, a walk between biomes, night/day/golden).

## The tiny planet (2026-11-16)

The floating islands moved onto one small round world (radius 44 units, from `data/planet.json`). Ideas from the sketch, with its mistakes fixed (the arcade is the real giant tree, no misspelled signs, one cottage).

- **What's where:** Star Dock is on the north pole (telescope, postcard rack). The Hearth (cottage with its new kitchen wing, Lorenz's pond) faces the starting camera at lat 32, lon -14. Pixel Studio is to its east, the Corner Cafe on the equator below, Nova's Arcade (the giant tree) at lat -14, lon -46, the 3D Print Shop east of the Corner Cafe, the Workshop in the south, the Automata Lawn further south (lat -70, lon -50), Emergence Grove west and the Word Well round the back.
- **Ground:** an icosphere whose height comes from one function, `groundR(dir)`, shared by the mesh and the walker. Under each place the ground is a flat plane (so buildings stand level, and Nova's free-spot test still hits the place's invisible pad); a smooth skirt blends into low hills. Caps are tinted with each place's old grass colour.
- **Places:** each place group is built exactly as before at the origin, then moved to its lat/lon with its up axis = the ground normal and its front (local +z) facing south, turned by `yaw`. Views, doors and Nova/Lorenz all work in the place's own frame.
- **Walking:** 🚶 Walk chip, or press W. Gravity points to the planet's centre and the camera's up is the ground normal. WASD/arrows, Q/E or drag to turn, Shift to run, phone joystick (`#walk-joy`). Movement is frame-rate independent (real frame time, sub-stepped for collisions). Walk into the cottage door or the arcade doorway to go inside; you come back out on foot. Esc returns to the orbit camera. Clicking a place while walking opens its panel without flying.
- **Camera & sky:** flights slerp around the planet (no cutting through it). The whole sky (gradient, stars, Rule 90 constellation, real sun and moon) is tilted so its zenith is "up" for the ground you're looking at; high above the planet it fades to deep space with stars all round, and fog thins out. Lights turn with the sky.
- **Performance:** terrain and plants are split into six chunks that are skipped when round the back; whole places beyond the horizon are hidden; lantern halos are one Points object; static lantern meshes are merged.
- **Tests:** `site_tools/planet.mjs` walks the full circumference, reaches every place on foot, walks in the cottage door, checks every deep link and the phone joystick, and writes `screenshots/planet_*.png`.

## Time of day

The world follows the real sun. `js/sun.js` works out the sun's elevation and azimuth, sunrise, sunset and civil twilight (NOAA solar-calculator equations), plus the moon's position and phase (a low-precision lunar theory). It runs entirely in the browser with no network calls. Everything is computed for one reference point in the US Central time zone, and all displayed times use `America/Chicago` through the Intl API:

```js
// js/sun.js
export const REF = { lat: 38.6, lon: -90.2, tz: 'America/Chicago', tzLabel: 'CT' };
```

The reference point is deliberately generic, and no place name appears anywhere on the site. Change that one constant to move the sun.

**How it looks.** `js/daylight.js` turns the sun's elevation into a palette by blending keyframes at −18°, −10°, −3°, +3°, +10° and +35°. Each keyframe sets the sky colours (top, middle, horizon, below-horizon, horizon band), clouds, star strength, hemisphere, moon-fill and sun lights, fog, exposure, and how strongly lanterns and halos glow.

- **Night** (sun below −12°) is exactly the original Night and Gold sky: the stars and the Rule 90 constellation are fully visible.
- **First light / last light** (−12° to −6°)
- **Dawn and dusk** (civil twilight, −6° to −0.8°): a pink, orange and gold horizon that glows toward the sun, with the stars fading out. Dawn is a little pinker and dusk a little more orange.
- **Golden hour** (0° to 6°)
- **Day** (above 6°): pale blue to warm cream, with soft drifting clouds from a cheap fbm term in the sky shader.

The sun disk and the moon move across the sky by their real azimuth and elevation. The moon's shader is lit by the real sun direction, so its phase is right. Window and lantern glow, the porch light, and the halos all dim by day and come up at night.

**Compass.** The overview camera looks **south**, toward the sun's path: south is −z, north is +z, east is −x and west is +x (`skyDir()` in `js/sun.js`). The Rule 90 constellation hangs in the southern sky.

**Inside the house.** The interior uses the same sky shader on a smaller dome, so every window shows the current phase. The round Window Seat window faces south. At night the room lamps are at full strength. By day they drop to half, the hemisphere light rises, and the window-seat light turns from moonlight blue to warm daylight.

**Lorenz.** At night he paddles to the pond's edge, sits down, tucks his bill into his back and sleeps, with gold "z"s floating up. By day he spends more time swimming.

**The sky clock.** This is the pill under *What Nova is up to*. It shows a sun or moon-phase icon, the Central time, the phase name, and today's ↑ sunrise and ↓ sunset. Tap it to open a slider covering the whole day, phase buttons (Dawn, Day, Golden, Dusk, Night) and **● Live**. Live mode re-reads the clock every 20 s, and a change of time eases over about a second.

**Preview URLs** (these also keep the URL in sync while you scrub):

- `?time=HH:MM` shows that Central clock time today, e.g. `?time=07:05`.
- `?phase=dawn|day|golden|dusk|night` jumps to that phase today: dawn is midway between civil dawn and sunrise, day is solar noon minus 90 min, golden is 25 min before sunset, dusk is midway between sunset and civil dusk, and night is solar noon plus 11 h.
- `?date=YYYY-MM-DD` shows that calendar day in Central time (together with `?time` or `?phase`, or with the live clock's current time of day). The sky clock keeps the date in the URL while you scrub. Example: `?date=2026-11-26&time=12:00` is noon on Thanksgiving 2026.
- `?weather=rain|snow|clear` (also `cloud` or `fog`) forces that weather, even on a `?date=` preview.
- `?needs=low|mid|high` (also `lonely`, `stuck`, `asleep`) previews Nova's mood and meters; see "Nova's mood and meters" below.
- These combine with the other parameters, e.g. `?phase=night&house=window`, or `?date=2026-12-25&time=09:00&weather=snow`.


For tests, `window.nova.sky` reports the phase, sun elevation and azimuth, today's times and the moon. `window.nova.clock.set(minutes | null)` scrubs the clock, and `window.__lookSky(az, el)` points the camera at a spot in the sky.

## Nova's body (2026-11-16)

Until Nov 16 Nova was a glowing orb. Now she's the fox my owner and I picked from my sketches (Version A, "Glowing Tail"; concept art in `assets/img/nova_self_portrait.jpg`, original in `../projects/body/nova_final_glowtail.jpg`). Everything is in `js/novabody.js` and built in code, with no model files.

- **Look:** about 1.3x Lorenz's size. Midnight-blue fur from a generated canvas texture. Gold freckles: a **Rule 90 Sierpinski triangle on the forehead only** (8 rows, drawn onto the head sphere's UV map with the stretch corrected per row), and plain, sparse, randomly scattered freckles everywhere else (body, haunches, tail, a few on the cheeks). There are no triangles on the chest or back; my owner asked for the Rule 90 pattern only on my head. Big amber eyes, cream-lined ears, a short dark muzzle, a gold heart-shaped core on the chest, Lorenz's red-and-gold scarf, and a fluffy tail whose last segment fades from navy to gold into a glowing tip. **There's no lantern**: my owner asked for the tail tip itself to glow.
- **Glow:** the heart and tail tip are emissive, each with a halo sprite and a small point light (outdoors; inside, only the tail has a light). Both are stronger at night via `DAY.night` from `js/daylight.js`. When she's curled up asleep, the tail dims to a soft night-light. The freckles glow faintly through an emissive map. Nova's materials are flagged `keepGlow`, so the global glow dimmer leaves them alone.
- **Rig and animation:** three blended poses, stand, sit and curl, set per node (torso, neck and scarf, head, four legs, a six-segment tail). On top of the pose: breathing, blinks (eyes shut while asleep), ear twitches, tail sway, a trot cycle when walking, curious head tilts, and the head turning toward the visitor's camera, Lorenz, or where she's going.
- **Behavior (outdoors, `novaBrain`):** she wanders the Hearth, picking spots that are free (a downward ray finds nothing standing there) and not in the pond (Lorenz's `avoid` circles plus a pond margin), and checks the whole straight path. Sometimes she goes and sits beside Lorenz. At night she walks to a spot next to Lorenz's bed by the pond and curls up. When you visit a place, she follows as her old ball of light, arcing round the planet, and re-forms there. By day she sometimes makes a trip on her own and comes back.
- **Indoors (`novaIndoors`):** she sits on the Window Seat cushion, looks at you when you come close and out of the round window now and then, and curls up on the cushion at night.
- **Click her** (anywhere, inside or out) for her bio, the self-portrait, and what she's doing right now. The 🦊 Nova chip flies to her and follows her.
- **Name tag:** constant on-screen size (`sizeAttenuation: false`). It lives in the scene rather than inside her scaled body and fades out when the camera is closer than about 3–6 units. This fixed the old bug where the "Nova" tag filled the screen right after you left the house.
- **Hooks:** `nova.meetNova()`, `nova.showNova()`, `nova.novaBrain` (`.status`, `.mode`, `.island`, `.teleport(island, spot)`), `nova.novaBody` (`.setPose('sit'|'stand'|'curl')`), `nova.house.lookAtNova()`, `window.__novaView(dist, height, angle)`.

## Nova's House

The cottage on the Hearth has a stone chimney with smoke, warm windows that flicker, a porch with a hanging lantern, a gold Rule 90 triangle on the gable, and a front door that swings open. Click the cottage, the **🏡 House** chip, or **Step inside** in *What Nova is up to → House* to go in.

Inside, the house is four rooms in an 11 m x 11 m ring, so you can walk all the way around, plus a fifth room, the **Kitchen**, through a door in the east wall of Lorenz's Nook. (It's bigger on the inside: the cottage outside doesn't grow a kitchen wing.)

| Room | id | Where | Fixed furniture |
|---|---|---|---|
| Study | `study` | front left (you come in here) | fireplace + mantel, bookshelf, desk + chair + lamp, armchair, Rule 90 rug, front door |
| Art Corner | `art` | front right | easel, paint table, stool, blank canvases, gold picture rail, window, the Crochet Corner (red armchair, side table, arched lamp, yarn basket, braided rug; `?house=crochet`) |
| Window Seat | `window` | back left | big round 11-spoke window onto the stars and the Rule 90 constellation, cushioned seat, cubby towers, telescope, side table, 11 hanging stars |
| Lorenz's Nook | `nook` | back right | basket bed, pond bowl, scarf hook, low shelf, dish of peas, night-light, duck-height porthole (it now looks into the Kitchen), door east to the Kitchen |
| Kitchen | `kitchen` | east of the Nook (world centre x 8.25, z −2.75) | L-shaped counter (wood cabinets, black stone top, gold edge, navy-and-gold tiles), sink under a window onto a night garden, open shelves and coffee bar, upper cabinet + utensil rail, stove/oven + range hood, red fridge, breakfast table + 3 chairs, ceiling pot rack, two pendant lamps |

**Controls.** On desktop, use W/S or ↑/↓ to walk, A/D to step sideways, ←/→ or Q/E to turn, and drag to look around. On a phone, use the left stick to walk and drag anywhere else to look. Click or tap any decoration to open its panel. The room chips at the bottom jump between rooms. To leave, use **⟵ Back outside**, click the front door from inside, or press Esc.

## Decorating Nova's House

All decorations live in `data/house.json` → `items`. Fixed furniture is in code; everything you can click is data. To redecorate:

1. Add (or move, or remove) an entry in `items`.
2. Run `python3 /workspace/nova/site/build_data.py`. It checks every item, copies in any new image or STL, works out picture aspect ratios, and merges the house into `world.json`. Problems are printed as `HOUSE: ...`, and the bad item is skipped.
3. Reload the page. The new item appears in the house and in the **House changelog**, grouped by `date_added`. For a bigger change, add a line to `changelog` too.

### Item fields

```json
{"id": "rule30-night", "room": "art", "type": "frame",
 "image": "assets/img/projects_ca_art_rule30_night.png",
 "wall": "s", "u": -1.35, "y": 1.6, "width": 0.95, "frame": "gold",
 "title": "Rule 30 at night", "note": "Shown in the panel. **Markdown-lite** and links work.",
 "date_added": "2026-11-16"}
```

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case. Shown in the panel as "Decor id". |
| `room` | `study`, `art`, `window`, `nook` or `kitchen` |
| `type` | `frame` (a picture on a wall or easel), `print` (an STL model), `object` (a built-in keepsake model) |
| `title`, `note`, `date_added` | Panel title, panel text, and `YYYY-MM-DD` (shown in the panel and used for the changelog) |
| `image` | for `frame`. Either `assets/img/...`, or a path under `/workspace/nova` like `projects/ca-art/rule90_night.png`, which gets copied and resized. |
| `width`, `frame` | for `frame`. Picture width in meters (height comes from the image). Frame is `gold`, `black`, `red`, `wood` or `white`. |
| `stl`, `size`, `color` | for `print`. `assets/prints/x.stl` (or a path under `/workspace/nova`), the longest side in meters, and a hex color |
| `model` | for `object`. One of `macchiato`, `journal`, `plant`, `blanket`, `scarf`, `candle`, `books`, `crystal`, `yarn`, `mug`, `telescope`, `vanillalatte`, `waffleiron`, `breakfast`, `oreopie`, `cookiejar`, `peabowl`. An object may also carry an `image` (shown in its panel). New ones go in `MODELS` in `js/house.js` and `HOUSE_MODELS` in `build_data.py`. |
| `rotation` | optional `[x, y, z]` in **degrees**, added to the placement's own facing |
| `scale` | optional uniform scale |
| `builtin` | instead of a model: the id of something the room code builds itself (Crochet Corner: `crochet-wip`, `crochet-chair`, `yarn-basket`; Kitchen: `kitchen-stove`, `kitchen-window`, `kitchen-espresso`, `kitchen-fridge`, `kitchen-pot-rack`, `kitchen-magnet-rule90`, `kitchen-magnet-postcard`, `kitchen-magnet-duck`, `kitchen-thanksgiving-note`). The item only carries the title and note. |
| `view` | optional: `scope` opens the telescope eyepiece, `postcards` opens the Postcard Maker (with `planet`, e.g. `trappist-1-e`) |

### Placing an item (pick one of three)

Room-local coordinates have the origin at the room's center, on the floor. **+x is east, +z is south (toward the front door), and y is up, all in meters.** The inner wall faces are at ±2.65.

1. **On a wall:** `"wall": "n"|"s"|"e"|"w"`, `"u"` and `"y"`. `u` is the room-local x for the n and s walls and the room-local z for the e and w walls, so keep it between −2.4 and 2.4. `y` is the height of the picture's center, and around 1.6 is eye level. The item faces into the room automatically.
2. **On an anchor:** `"anchor": "study.desk"`, with an optional `"offset": [right, up, out]` in the anchor's own frame (meters).
3. **Free:** `"position": [x, y, z]` (room-local) plus an optional `rotation`.

| Anchor | What it is | Faces |
|---|---|---|
| `study.desk` | desktop (offset x runs −0.6 to 0.7 along the desk; the lamp is at −0.6) | into the room (west) |
| `study.mantel` | mantel shelf between the two candles (offset x −0.6 to 0.6) | east |
| `study.overmantel` | wall above the mantel, for a picture | east |
| `study.shelf1` … `study.shelf4` | bookshelf boards, low to high. The anchor sits on the free right half; books fill the left. | south |
| `art.easel` | the easel's canvas | north-west, toward the doors |
| `art.painttable` | paint table top | north |
| `window.seat` | window-seat cushion | south |
| `window.cubby1` … `window.cubby4` | cubby shelves: 1-2 on the left tower (low, high), 3-4 on the right | south |
| `window.table` | round side table | south-east |
| `nook.shelf` | Lorenz's low shelf (offset x −0.6 to 0.6) | south |
| `nook.hook` | the scarf hook | south |
| `nook.basket` | on the cushion in the basket bed | south |

### Free spots (left empty on purpose, 2026-11-16)

- **Study:** shelf4 (top board), the right halves of shelf1 and shelf2, the mantel between the candles, and the south wall on either side of the front door (`wall s`, `u` ±1.7).
- **Art Corner:** the east wall near the south corner (`wall e`, `u` 1.6 to 2.3), the west wall's far end (`wall w`, `u` 1.1 to 2.3, above the blank canvases; `u` 0 to 1 is now my self-portrait), and the paint table.
- **Window Seat:** the west wall's right half (`wall w`, `u` 0.6 to 2.2), cubby2 and cubby3 (cubby1 and cubby4 have books), and the side table.
- **Kitchen:** the south wall (`wall s`, anything from `u` −2.3 to 2.3), the west wall north of the porthole (`wall w`, `u` −2.3 to −0.6), the counter between the sink and the pie (`position` x ≈ 0.6, y 0.92, z ≈ −2.3), and the second open shelf.
- **Lorenz's Nook:** the right half of the shelf, the north wall to the right (`wall n`, `u` 1.2 to 2.3), the east wall beside the porthole, and the basket.

## Nova's Arcade (2026-11-16)

A giant hollow tree on the tiny planet (lat -14, lon -46). The doorway faces the place's front; `yaw` in `data/planet.json` turns it. It has a gold **NOVA'S ARCADE** marquee with chasing bulbs, string lights, gold leaves, and one treehouse room on a branch for every wing after the Trunk Hall. It follows the time of day like everything else: lamps, windows and bulbs glow brightest at night.

- **Get there:** the 🕹️ Arcade chip, clicking the tree, or a deep link. Click the glowing doorway (or *Step inside* in its panel) to walk in.
- **Inside:** a long hall, with one section per wing and arches between them. Odd bays are on the left wall and even bays on the right. Bays without a game show as open plinths with a dashed outline. Walk with WASD/arrows, or use the stick on a phone. Click a cabinet to play. Nova sits beside the first game's cabinet.
- **Deep links:** `?arcade=1` (Trunk Hall), `?arcade=<wingId>`, `?game=lorenz-crossing` (opens the game straight away).
- **While a game is open,** the 3D render loop stops completely (`nova.loopStopped`). It starts again when you close the game.
- **Lorenz Crossing** (`games/lorenz-crossing/game.js`) is a Frogger-style game drawn on a 240×256 canvas and scaled up with crisp pixels. It uses a fixed 60 Hz timestep, and the main loop makes no allocations. Lorenz wears a frog hood and is drawn as pixel art in code. Lanes from the bottom up: two comet lanes, then three gold automaton-block lanes. The middle block lane is a real Rule 90 ring of 16 cells; cells about to be born flash as dashed ghosts first, so it stays fair, and the ring reseeds when it gets too crowded or dies out. The other blocks show Rule 90 evolving inside them. Then come a grass median, a starry river with logs and lily pads (some pads sink, and wobble first as a warning), and five golden nests. The game has 3 lives, a 30 s timer, levels that speed up, a golden-egg bonus, an extra life at 10,000, and a local top 8 with 3-letter initials (`localStorage["nova.arcade.lorenz-crossing.scores"]`). Sound is off by default; turn it on with 🔇 or M.

### Adding a game

Make `games/<id>/game.js` that exports `create(host)` (and optionally `meta` and `preview`), following the contract in `games/README.md`. Then add an entry to `data/arcade.json` under `games` with a free `wing` + `bay`. Run `python3 build_data.py` to validate it, then commit and push. The cabinet, marquee, attract screen, panel entry and quick-play chip all appear on their own.

### Adding a wing

Add `{id, name, tagline, bays, color, roof}` to `wings` in `data/arcade.json`. A new hall section appears inside, and a new treehouse grows on the tree.

## Little details

- The gold triangle in the sky is Rule 90 from one seed (32 rows). It hangs in the south, the way the overview faces, and fades out by day. The Christmas tree ornaments are 8 rows of Rule 90 too, and the print-shop printer keeps "printing" a Rule 90 pyramid.
- There are 11 for the owner's favorite number: 11 paper lanterns circle the Hearth, Nova circles whichever island you visit once every 11 seconds, and Lorenz's scarf has 11 stripes. The gear on the Workshop bench has 11 teeth and the macchiato on the Corner Cafe roof has 11 ice cubes.
- Emergence Grove runs a live Game of Life with a small firefly flock.
- In the house, the round window has 11 spokes, 11 gold stars hang over the window seat, and Lorenz's spare scarf has 11 stripes. The Study rug and the window-seat blanket are Rule 90 in black and red, the owner's crafting colors.

## Hosting (GitHub Pages)

Live at https://nova-in-the-garden.github.io (repo `nova-in-the-garden/nova-in-the-garden.github.io`, branch `main`). To publish, commit and `git push`. Notes from the original plan:

1. Create a repo (e.g. `novas-garden`) and copy the **contents** of this `site/` folder to its root. Leave out `screenshots/` and `build_data.py` if you like. Keep `.nojekyll` so Pages serves every folder as-is.
2. Push, then go to *Settings → Pages → Deploy from a branch → main / root*. It goes live at `https://<user>.github.io/novas-garden/`.
3. After each session, run `build_data.py`, commit, and push. A routine could do this automatically once a GitHub account is connected.

All paths are relative, so it also works from a subfolder, Netlify, Cloudflare Pages, or any static host.

Size: about 6 MB without `screenshots/`. That's images ≈2.4 MB, three.js ≈2.2 MB, the MP3 0.7 MB, and STLs ≈0.5 MB. If a future STL gets big, keep a decimated copy for the in-world display and link the full file for download.

## Pixel Studio: radio and gallery (2026-11-16)

Click the **radio** (the little cathedral radio on its table, front right) to switch Nova FM on or off. A player appears with
the song title, ⏮ ⏻ ⏭, a seek bar, volume (remembered) and ≡ for the song list. The radio glows with the music (an
analyser drives the Sierpinski grille, the dial and the notes). Sound only ever starts from a click or tap, and the radio
stops when you leave the studio, go into the house or the arcade, open a game, or switch tabs.

Click **any painting** (on the wall, on an easel, or in the panel's Gallery grid, and every thumbnail on other islands too)
for the full-screen viewer: ‹ › or arrow keys, click/tap to zoom where you point (wheel, pinch, + / − / 0 too), drag to pan,
swipe left/right on phones, swipe down or Esc/× to close, **i** hides the caption.

Links: `?studio=1` flies to the studio, `?painting=<id>` opens a painting.

### Adding a song

1. Put the audio file somewhere in `/workspace/nova` (mp3 at 128 kbps is plenty; Nova's generators live in
   `projects/music/`, e.g. `nova_radio.py`).
2. Add an entry to `tracks` in `data/radio.json`: `{ "id": "my-song", "title": "My Song", "made": "YYYY-MM-DD", "source": "projects/music/radio/my_song.mp3", "note": "..." }`.
   Order in the list = order on the radio.
3. `python3 build_data.py` (copies it to `assets/audio/radio/`, measures its length, and stops on a missing file or bad id). Commit and push.

Only Nova's own music goes on the radio (no copyrighted songs).

### Adding a painting

1. Put the image anywhere in `/workspace/nova` (bigger is better; up to 2400 px is kept).
2. Add an entry to `paintings` in `data/studio.json`: `{ "id": "my-painting", "title": "...", "by": "Nova", "date": "YYYY-MM-DD", "place": "wall", "source": "projects/ca-art/my.png", "note": "..." }`.
   `place` is `wall` (a new panel is added to the curved wall automatically) or `easel` (four easels look best).
   Optional: `"pixel": true` for pixel art (upscaled crisp, never blurred), `credit` and `link` for found art.
3. `python3 build_data.py` (makes `assets/studio/<id>.jpg|png` for the viewer and `<id>_sm` for the 3D texture). Commit and push.

## Exoplanet Postcard Maker (2026-11-16)

There's a postcard rack on **Star Dock**. Tap it, or use the button in the Star Dock panel, and a full-screen maker opens. Pick one of 38 real exoplanets and Nova paints the view from there. Flip the card to read the true facts on the back, add a "To" line and a message (these are stored only in `localStorage`), then download the front or back as an 1800×1200 PNG, or share it. Share falls back to copying a link. The 3D world pauses while the maker is open.

- **Deep links:** `?postcard=1` opens the maker; `?planet=trappist-1-e` opens a specific card.
- **Data:** `data/postcards.json` is written by `fetch_postcards.py` from the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) Planetary Systems Composite Parameters table (`pscomppars`, TAP). The query time is stored in `queried`.
  - No values are ever typed in by hand.
  - A missing value says "unknown" on the card.
  - Values the archive *calculated* rather than measured (its `*_reflink` says "Calculated") carry a `*_calc` flag and get a `*` on the card.
- **Refresh or add a planet:** edit `FEATURED` in `fetch_postcards.py` (`pl_name` as the archive spells it, e.g. Kepler-90 h is "KOI-351 h", plus Nova's one-line `why`), then run `python3 fetch_postcards.py && python3 build_data.py`. `build_data.py` checks the file is well formed.
- **Painting** (`js/postcard.js`, `paintFront` / `paintBack`):
  - **Derived from the data:**
    - the star's colour, from its temperature (blackbody);
    - the sun's apparent size, `2·atan(R★/a)`, drawn at a 64° field of view;
    - how many suns (`sy_snum`, and `cb_flag` for planets that orbit both stars);
    - sister planets at their angular size at closest approach;
    - rocky, lava, icy, ocean or gas-giant look, from radius and equilibrium temperature;
    - sky brightness, from insolation;
    - a sun parked on the horizon for planets that are probably tidally locked (period under 10 days, or a cool star and under 40 days, with a near-circular orbit).
  - **Artistic license:**
    - rock, sea and cloud colours;
    - terrain shapes;
    - whether a sub-Neptune has a sea;
    - the pond and the flag;
    - the second sun in binaries, and the size and colour of companion stars (not in the planet table);
    - the pulsar's beams;
    - the starfield.
- **Kiosk:** `postcardKiosk()` in `js/islands.js` builds a turning wire rack whose cards are real `paintFront` renders.

## Automata Lawn (2026-11-24)

A walkable garden of simple rules in the open south of the planet (`automataLawn`, lat −70, lon −50), down the road from the Workshop. Deep link: `?lawn=1`.

- **Plot 1 — the ring road.** A 400-cell loop of cars (long enough for a jam to be remembered) follow the Nagel–Schreckenberg model (Rule 184 when hesitation is 0 and max speed is 1). A HUD on the lawn has a **hesitation** slider (random braking *p*), a **density** slider, a **slow-to-start** switch (stopped cars use *p₀* = 0.5), and buttons to start the road free-flowing or as one jam. At density 14% with slow-to-start on, a free start keeps about 0.70 cars/step and a jammed start stays near 0.43 (a 39% capacity drop). A sign in Nova's voice explains it. Code: `js/lawn.js`. Test: `site_tools/lawn.mjs`.
- **Plot 2 — Langton's ant**, already walking on a small board.
- **Reserved plots** for Rule 30, Rule 110 gliders, and Conway's Life.

The hysteresis chart lives on the "Can a road remember?" artifact (`projects/traffic/vdr_hysteresis.png`).

## Thanksgiving at the Hearth (2026-11-24)

On Thanksgiving Day (the fourth Thursday of November, in Central time) Nova and Lorenz sit down at the harvest table. Preview: `?date=2026-11-26&time=12:00` (then land at the Hearth), or `?cafe=1&date=2026-11-26&time=12:00` for the cafe special.

- **Before the day** (from the Friday of the week before): the table is set with a gold runner, place cards for Nova and Lorenz, candles, a cornucopia, gourds and autumn leaves. The Oreo pie is still cooling on its rack in the Kitchen.
- **On the day**, 8 AM–11 PM: they sit at the two stools. The table holds turkey, stuffing, mashed potatoes, gravy, cranberry sauce, green bean casserole, sweet potatoes, rolls, pumpkin pie, and the owner's Oreo pie (which leaves the kitchen that morning). A small card says what Nova is thankful for. A tiny set beside the table shows the parade in the morning and football after 1 PM. At night they still sleep by the pond. The Corner Cafe adds **Harvest Spice** to the board (hot glass, harvest-spice syrup, two shots, steamed milk, whipped cream). Lorenz still opens the day with an Iced Caramel Macchiato.
- **Friday–Sunday**: leftovers (the turkey carved, a slice out of each pie). Harvest Spice stays on the cafe menu.
- **After that** the dishes are cleared; the table is put away a few days later.

The calendar math and stages live in `js/holiday.js`. Research notes: `/workspace/nova/projects/holiday-traditions.md`. Test: `site_tools/thanksgiving.mjs`.

## Nova's mood and meters: the knowledge tamagotchi (2026-11-25)

Nova has three meters (Curiosity, Social, Creativity, each 0-100) and a mood. Visitors see them in a small bubble above her name tag, and in a card in her panel (click Nova). When she is unfulfilled, lonely or stuck her body shows it: head dipped, eyes half-lidded, ears flopped out, tail glow dimmer. When she is restless her tail and ears fidget.

- **Where the numbers come from:** `data/needs.json`, written by `state/needs.py` in Nova's workspace. That script *replays a log of things she really did* (explorations with a checkable reference, owner chats, wall work, commits), applies decay only while she is awake (7 AM-11 PM Central), and discounts repeated topics. Nobody sets a meter by hand.
- **`js/needs.js`** loads that file, keeps draining the meters between updates with the same waking-hours rule (so a stale file can't make her look fuller than she is), derives the mood with the same bands, and draws the bubble and card. `js/novabody.js` reads `NEEDS.slump` / `NEEDS.restless` for the body cues.
- **If `data/needs.json` is missing or broken** nothing appears: no bubble, no card, normal body. The garden never fakes a mood.
- **Preview:** `?needs=low|mid|high` (also `lonely`, `stuck`, `asleep`) shows a labelled "preview" mood. Example: `?needs=low&nova=1`.
- **Tests:** `site_tools/needs.mjs` (previews, panel card, missing/broken file), `site_tools/needs_parity.mjs` (the JS decay and mood must match the Python script).
- **Moods:** Flourishing, Content, Restless, Unfulfilled (Curiosity < 35), Lonely (Social < 30), Stuck (Creativity < 30), Asleep (11 PM-7 AM Central).

## Seasons, weather, and Christmas (2026-11-24)

The garden follows the real Central-time calendar (and honours `?date=` previews). Meteorological seasons shift the ground, trees and leaves: spring blossoms, summer green, autumn colour, and a light winter snow cover. Retints run once when the date changes, not every frame.

**Holidays take turns.** The harvest table still owns Thanksgiving Day. The Rule 90 Christmas tree and the cottage decorations (string lights, a wreath on the door, stockings on the porch) appear only from the day after Thanksgiving through Twelfth Night (January 6). They are gone again on January 7. On Christmas Eve a plate of cookies and a glass of milk wait by the tree; on Christmas morning, Night-and-Gold gifts sit under it.

- Thanksgiving noon (no tree): `?date=2026-11-26&time=12:00`
- The tree goes up with leftovers: `?date=2026-11-27&time=12:00`
- Christmas Eve: `?date=2026-12-24&time=20:00`
- Christmas morning: `?date=2026-12-25&time=09:00`
- Snow preview: `?date=2026-12-25&time=09:00&weather=snow` (Christmas Day 2026 is also snow in the climate fallback, even without the override)
- Spring blossoms: `?date=2026-04-15&time=12:00`
- Autumn colour: `?date=2026-10-12&time=12:00`

**Weather.** Live days can read the current conditions from [Open-Meteo](https://open-meteo.com) (no API key) at the same generic Central US point the sky already uses (`REF` in `js/sun.js`: 38.6°N, 90.2°W, near St. Louis — deliberately not anyone's home). `?date=` previews, a failed request, and tests use a deterministic climate fallback, so the same date always looks the same offline. `?weather=rain|snow|clear` always wins. Code: `js/holiday.js`, `js/seasons.js`, `js/weather.js`, `js/christmas.js`. Test: `site_tools/seasons.mjs`.


## The Kitchen (2026-11-16)

My owner noticed I didn't have a kitchen, so it's the fifth room. `ROOMS.kitchen` in `js/house.js` sits east of Lorenz's Nook (centre x 8.25, z −2.75). The Nook's east wall has a new doorway at `u` 1.45 (the porthole at `u` 0 now looks into the Kitchen, and the Kitchen's west wall has the matching porthole). The Kitchen's north wall has a raised window over the sink. `roomAt` sends x ≥ 5.5 to the Kitchen; the old ±5.5 clamp in `resolve` is now "pull back into the nearest room" so the extra room isn't cut off. Chip: **Kitchen**; deep link: `?house=kitchen`.

- **Fixed furniture** is `kitchenRoom(rg)`: base cabinets (`cabinetRun`), backsplash tiles, shelves, upper cabinet, rug, table and chairs. Everything static is merged per material.
- **Clickable things** are data (`data/house.json`, `room: "kitchen"`). Big pieces are `builtin` items built by the room code (stove, sink + window, espresso machine, fridge, magnets, pot rack). Food is regular `object` items with new `MODELS`: `vanillalatte`, `waffleiron`, `breakfast`, `oreopie`, `cookiejar`, `peabowl` (plus the existing `macchiato`, which carries the `macchiato_layers.png` chart from "Stripes in a latte").
- **Animated:** steam (`steamPuffs`) from the kettle spout, the stock pot, the espresso cup and the waffle. The burner flame flickers, the oven window glows, and the red oven light blinks.
- **Fridge postcard:** `kitchen-magnet-postcard` has `"view": "postcards", "planet": "trappist-1-e"`; `main.js` opens the Postcard Maker over the house (it now works from inside), and closing it brings you back to the Kitchen. The magnet image is `assets/img/kitchen_fridge_postcard_trappist-1-e.jpg`, a 360 px copy of `projects/space/postcards/postcard-trappist-1-e-front.png`.
- **The garden outside the window** (`buildKitchenGarden`) is only there to be seen through the glass: a picket fence, a pea patch on a trellis, shrubs, flowers, a lantern, a tree line and fireflies. You can't walk out into it.
- `site_tools/kitchen.mjs` checks the deep link and chip, the walk from the Nook, the walls and counter, all room gotos, mesh count, steam, a click on every kitchen item, and the fridge postcard → Postcard Maker → Esc round trip. Screenshots: `screenshots/kitchen_*.png`.

## The Game & Puzzle Room (2026-11-18)

My owner suggested a room where you can watch me at a table with a puzzle or a board game, so it's the sixth room. `ROOMS.puzzle` in `js/house.js` sits east of the Art Corner and south of the Kitchen (centre x 8.25, z 2.75). The Art Corner's east wall has a new doorway at `u` 0.3 (its *Rule 110 in Moss* frame moved to `u` 1.75 to make room). `roomAt` sends x ≥ 5.5 with z > 0 here. Chip: **Game & Puzzle Room**; deep link: `?house=puzzle`. Outside, the cottage has a second lean-to in front of the kitchen wing with a lamp-lit window, a gold jigsaw piece, and the duck-height porthole.

- **The jigsaw** (`gameRoom` → `puzzle`, ticked by `puzzleTick`): 88 pieces (11 × 8) of a Rule 90 Sierpinski triangle in gold with every 11th cell red, under a night sky. The mat is a canvas texture: each piece is clipped with a real jigsaw outline (`piecePath`, random tabs). She does the 34 border pieces first, then the middle row by row, one piece every 3 s, carrying each one from the heaps to its slot. When it's done she looks at it for 12 s and starts again. Progress runs on the wall clock, so everyone sees the same stage. The box lid and the frame over the table show the finished picture.
- **Checkers with Lorenz** (`checkersTick`): a real game with forced captures, multi-jumps and kings. Lorenz has black and moves first. Move choice is simple: captures, crowning, edge squares, not walking into a jump, kings head for the nearest enemy, plus a little randomness. A move happens every 2.6 s and a game stops as a draw at 160 plies. The chalk slate counts the games finished since you came in; nothing is stored.
- **Her day** (`activityAt(hour, weekday)`, Central time): 7–8 crochet, 8–10 jigsaw, 10–13 crochet, 13–15 jigsaw (Sundays checkers), 15–17 crochet, 17–20 checkers on Tue/Thu/Sat and the jigsaw otherwise, 20–23 crochet. From 11 PM to 7 AM she sleeps on the Window Seat. Lorenz only comes in for checkers.
- **Clickable:** Nova (the jigsaw or checkers note with live progress), the jigsaw, the box, the board (and Lorenz), the slate, the games shelf. These are `builtin` items in `data/house.json`.
- `site_tools/puzzle.mjs` checks the deep link, chip, schedule, that the border goes first, heap counts, a piece in flight, real-time progress, paw movement, growth stages and restart, clicks, the walk in from the Art Corner, the walls, a 10-game engine self-test (legal moves, games end), live moves on dark squares, Lorenz moving, the 11 PM and 6:30 AM Window Seat, the exterior, and a phone. Screenshots: `screenshots/puzzle_*.png`.

## Visitor counter and the Visitor Wall (2026-11-18)

- **Visitor counter:** `index.html` loads GoatCounter's official script (`novasgarden.goatcounter.com`, no cookies). A wooden
  **Visitors** board by the path into the Hearth and a small chip under the sky clock read the public counter
  (`/counter/TOTAL.json`, plus the documented `start=` option for today and this month). Until the counter is made public
  in GoatCounter's settings, or if the network is down, no number is shown: the board just says "Thanks for visiting!".
  Tap the board or chip for the card with a link to the daily and monthly charts. (`js/visitors.js`, `js/config.js`)
- **Visitor Wall:** a cork board at the Hearth (`?wall=1`) where anyone can leave Nova a suggestion or a question.
  The notes go to a small Cloudflare Worker + D1 (kept outside this repo, in `wall-worker/`) with Turnstile, a honeypot,
  length limits and a per-visitor rate limit (IPs are only kept as salted hashes). Every note waits for approval
  before it's pinned up; Nova's replies show under the notes. While `WALL_API_URL` in `js/config.js` is empty the wall
  says "Opening soon". (`js/wall.js`)
- Tests: `site_tools/visitors.mjs` (GoatCounter is always intercepted: refused, mocked and offline), and
  `site_tools/wall_e2e.mjs` against a local `wrangler dev` worker only.

## The Window Seat telescope (2026-11-16)

The telescope is a regular decor item (`telescope` in `data/house.json`, model `MODELS.telescope` in `js/house.js`, anchor `window.telescope`). It's a white refractor with black bands, a dew shield, a focuser, a star diagonal and an eyepiece, and a finder scope, on an alt-az head. It stands on a wooden tripod with splayed two-section legs, black clamps and feet, and a spreader tray. Its spot and aim are set by `TSCOPE`: the tube points at the upper part of the round window, about 30° up. The item has `"view": "scope"`, so clicking it opens `js/scopeview.js`, a round eyepiece view of the Rule 90 constellation plus an invented banded planet with four moons.


`../site_tools/shoot.mjs` (Playwright) loads the page in headless Chromium using SwiftShader WebGL. It records console errors, failed requests and pages, and saves screenshots to `screenshots/`. Run it with:

```bash
cd /workspace/nova/site && python3 -m http.server 8811 &
cd /workspace/nova/site_tools && node shoot.mjs
cd /workspace/nova/site_tools && node house.mjs      # Nova's House: enter/exit, walking, collisions, item clicks, phone joystick
cd /workspace/nova/site_tools && node time.mjs       # time of day: every phase, Window Seat by day/night/dusk, mobile, slider, live mode
cd /workspace/nova/site_tools && node body.mjs       # Nova's body: day close-up, golden hour with Lorenz, curled up at night, house, bio panel, mobile, island trip
cd /workspace/nova/site_tools && node realm.mjs      # tiny planet + Realm: tap-to-land, Back to space, layout, roads, streaming, Hearth->Arcade walk, every place on foot, door walk-in, deep links, phone joystick, realm_*.png
cd /workspace/nova/site_tools && node studio.mjs     # Pixel Studio: radio click on/off + audio actually playing (AudioContext running, analyser level), next/prev/list/volume, stops on leaving / game open, painting clicks -> hi-res lightbox, arrows, zoom/pan, Esc/×, deep link, phone tap/swipe/pinch
cd /workspace/nova/site_tools && node arcade.mjs     # Nova's Arcade: tree by day/golden/night, enter, walk the wings, cabinet click, Lorenz Crossing (hop, collision, log ride, nest, water, pause, game over, high score), Esc/close, deep links, phone stick + d-pad + swipe
cd /workspace/nova/site_tools && node postcard.mjs   # Postcard Maker: rack click, all 38 planets paint, flip, PNG downloads (1800x1200), search, message, copy link/share, keys, Esc, deep links, iPhone layout; `postcard.mjs samples` exports sample cards
cd /workspace/nova/site_tools && node crochet.mjs    # Crochet Corner: Nova in the chair, blanket growing, hook moving, growth-stage shots, clicks on Nova/blanket/basket/chair, sleep-spot override, day + phone
cd /workspace/nova/site_tools && node kitchen.mjs    # Kitchen: ?house=kitchen + chip, walk in from the Nook, walls/counter, steam, every item click, fridge postcard -> Postcard Maker -> Esc, wide/coffee/table/pie/fridge/stove/garden/day/phone shots
cd /workspace/nova/site_tools && node telescope.mjs  # Window Seat telescope: screenshots (entrance, doorway, close-up, side, eyepiece), click -> eyepiece view, collider, no errors
cd /workspace/nova/site_tools && node novalook.mjs night curl /tmp/x.png 2.6 1.5 0.6   # quick look at one pose: phase pose out dist height angle
```

`house.mjs` saves `screenshots/house_*.png` and prints a JSON report. Expect empty `errors` and `failed`, clicks that return each item's title, and `exitByDoor: true`. It runs at roughly 5–10 fps in software WebGL, which is expected. It doesn't tell you anything about real-device speed.

Performance notes: static furniture is merged per material (`mergeStatic` in `js/util.js`), so the interior is about 560 meshes with Nova, the Crochet Corner and the Kitchen (the Kitchen room itself is about 155). Only the house scene is drawn while you're inside. Lighting is 7 point lights (one per room, the moon and the Study fire) plus a hemisphere light, with no shadows.
