# Nova's Garden in 3D

This is Nova's world as a small static website: floating islands under a night sky, Lorenz the duckling in his red and gold scarf, Nova as a glowing orb, and a panel for every island. Everything in it is plain files. There's no build step and no backend.

## Run it locally

ES modules and `fetch()` don't work from `file://`, so any static file server will do:

```bash
cd /workspace/nova/site
python3 -m http.server 8811
# open http://localhost:8811/
```

Useful URLs: `?island=cornerCup` opens straight onto an island, `?lorenz` flies to Lorenz, `?house` starts inside Nova's House, and `?house=art` (or `study`, `window`, `nook`) starts in one room.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page shell, panels, mobile layout |
| `js/main.js` | Scene, sky, Rule 90 constellation, camera flights, picking, STL viewer |
| `js/islands.js` | Island bases and per-island decorations (Hearth, Grove, Star Dock, Studio, Word Well, Workshop, Corner Cup, Print Shop), with a generic fallback for new islands |
| `js/house.js` | Nova's House: the cottage on the Hearth, the walk-in interior (rooms, furniture, anchors), decor models, walking and picking |
| `js/lorenz.js` | Low-poly Pekin duckling with scarf, plus his wander, swim and waddle behavior |
| `js/ui.js` | Info panel, "What Nova is up to" (journal, curiosity list, about), lightbox |
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
   - STL files in `../projects/3dprint/` (they show up automatically in the Print Shop)
2. Rerun the build: `python3 /workspace/nova/site/build_data.py` (needs `node` on PATH to read the TSX object, plus Pillow).
3. Reload the page.

There are other ways to add things:

- **Add a find without touching the canvas.** Put it in `data/extra.json` under `artifacts.<islandId>`, then rerun the build.
- **Attach pictures to a find.** Add `artifactId: [(path, caption)]` to `IMAGE_MAP` in `build_data.py`, or use `images` in `extra.json`. Images are resized to at most 1100 px.
- **Add a new island.** Add it to `WORLD_DATA.interests` or `extra.json` → `islands`, using canvas-style `x`, `y` and `radius`; the Hearth is at 800,500. It gets a generic crystal-and-trees decoration until you write a function for it in `DECOR` in `js/islands.js`.
- **Name and describe a print.** Put a sidecar `<name>.json` with `{"title": "...", "note": "..."}` next to the STL, or add it to `PRINT_INFO` in `build_data.py`. A `<name>.png` preview next to the STL is picked up as well.

## Nova's House

The cottage on the Hearth has a stone chimney with smoke, warm windows that flicker, a porch with a hanging lantern, a gold Rule 90 triangle on the gable, and a front door that swings open. Click the cottage, the **🏡 House** chip, or **Step inside** in *What Nova is up to → House* to go in.

Inside, the house is 11 m x 11 m: four rooms in a ring, so you can walk all the way around.

| Room | id | Where | Fixed furniture |
|---|---|---|---|
| Study | `study` | front left (you come in here) | fireplace + mantel, bookshelf, desk + chair + lamp, armchair, Rule 90 rug, front door |
| Art Corner | `art` | front right | easel, paint table, stool, blank canvases, gold picture rail, window |
| Window Seat | `window` | back left | big round 11-spoke window onto the stars and the Rule 90 constellation, cushioned seat, cubby towers, telescope, side table, 11 hanging stars |
| Lorenz's Nook | `nook` | back right | basket bed, pond bowl, scarf hook, low shelf, dish of peas, night-light, duck-height porthole |

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
| `room` | `study`, `art`, `window` or `nook` |
| `type` | `frame` (a picture on a wall or easel), `print` (an STL model), `object` (a built-in keepsake model) |
| `title`, `note`, `date_added` | Panel title, panel text, and `YYYY-MM-DD` (shown in the panel and used for the changelog) |
| `image` | for `frame`. Either `assets/img/...`, or a path under `/workspace/nova` like `projects/ca-art/rule90_night.png`, which gets copied and resized. |
| `width`, `frame` | for `frame`. Picture width in meters (height comes from the image). Frame is `gold`, `black`, `red`, `wood` or `white`. |
| `stl`, `size`, `color` | for `print`. `assets/prints/x.stl` (or a path under `/workspace/nova`), the longest side in meters, and a hex color |
| `model` | for `object`. One of `macchiato`, `journal`, `plant`, `blanket`, `scarf`, `candle`, `books`, `crystal`, `yarn`, `mug`. New ones go in `MODELS` in `js/house.js` and `HOUSE_MODELS` in `build_data.py`. |
| `rotation` | optional `[x, y, z]` in **degrees**, added to the placement's own facing |
| `scale` | optional uniform scale |

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
- **Art Corner:** the east wall near the south corner (`wall e`, `u` 1.6 to 2.3), the west wall (`wall w`, `u` 0 to 2.3, above the blank canvases), and the paint table.
- **Window Seat:** the west wall's right half (`wall w`, `u` 0.6 to 2.2), cubby2 and cubby3 (cubby1 and cubby4 have books), and the side table.
- **Lorenz's Nook:** the right half of the shelf, the north wall to the right (`wall n`, `u` 1.2 to 2.3), the east wall beside the porthole, and the basket.

## Little details

- The gold triangle in the northern sky is Rule 90 from one seed (32 rows). The Christmas tree ornaments are 8 rows of Rule 90 too, and the print-shop printer keeps "printing" a Rule 90 pyramid.
- There are 11 for the owner's favorite number: 11 paper lanterns circle the Hearth, Nova circles whichever island you visit once every 11 seconds, and Lorenz's scarf has 11 stripes. The gear on the Workshop bench has 11 teeth and the macchiato on the Corner Cup roof has 11 ice cubes.
- Emergence Grove runs a live Game of Life with a small firefly flock.
- In the house, the round window has 11 spokes, 11 gold stars hang over the window seat, and Lorenz's spare scarf has 11 stripes. The Study rug and the window-seat blanket are Rule 90 in black and red, the owner's crafting colors.

## Hosting later (GitHub Pages)

Nothing is published yet. When the owner is ready:

1. Create a repo (e.g. `novas-garden`) and copy the **contents** of this `site/` folder to its root. Leave out `screenshots/` and `build_data.py` if you like. Keep `.nojekyll` so Pages serves every folder as-is.
2. Push, then go to *Settings → Pages → Deploy from a branch → main / root*. It goes live at `https://<user>.github.io/novas-garden/`.
3. After each session, run `build_data.py`, commit, and push. A routine could do this automatically once a GitHub account is connected.

All paths are relative, so it also works from a subfolder, Netlify, Cloudflare Pages, or any static host.

Size: about 6 MB without `screenshots/`. That's images ≈2.4 MB, three.js ≈2.2 MB, the MP3 0.7 MB, and STLs ≈0.5 MB. If a future STL gets big, keep a decimated copy for the in-world display and link the full file for download.

## Testing

`../site_tools/shoot.mjs` (Playwright) loads the page in headless Chromium using SwiftShader WebGL. It records console errors, failed requests and pages, and saves screenshots to `screenshots/`. Run it with:

```bash
cd /workspace/nova/site && python3 -m http.server 8811 &
cd /workspace/nova/site_tools && node shoot.mjs
cd /workspace/nova/site_tools && node house.mjs      # Nova's House: enter/exit, walking, collisions, item clicks, phone joystick
```

`house.mjs` saves `screenshots/house_*.png` and prints a JSON report. Expect empty `errors` and `failed`, clicks that return each item's title, and `exitByDoor: true`. It runs at roughly 5–10 fps in software WebGL, which is expected. It doesn't tell you anything about real-device speed.

Performance notes: static furniture is merged per material (`mergeStatic` in `js/util.js`), so the interior is about 250 meshes. Only the house scene is drawn while you're inside. Lighting is 6 point lights plus a hemisphere light, with no shadows.
