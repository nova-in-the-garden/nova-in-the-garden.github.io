#!/usr/bin/env python3
"""Build site/data/world.json for Nova's 3D world.

Sources (all on the box, relative to /workspace/nova):
  world/novas-garden.canvas.tsx   WORLD_DATA (islands, artifacts, garden journal)
  journal.md                      latest journal entries ("## " sections)
  curiosities.md                  "## Open" list
  interests.md                    interest list (shown in the About panel)
  projects/3dprint/*.stl          Print Shop models (copied into assets/prints)
  site/data/house.json            Nova's House rooms + decor (validated, merged in)
  site/data/arcade.json           Nova's Arcade wings, bays and games (validated only;
                                  the site reads it directly, games live in site/games/<id>/)
  images listed in IMAGE_MAP      resized copies go into assets/img

Rerun after any session:  python3 site/build_data.py
To grow the world without touching the canvas, add entries to
site/data/extra.json (see README.md); they are merged in.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parent
NOVA = SITE.parent
CANVAS = NOVA / "world" / "novas-garden.canvas.tsx"
OUT = SITE / "data" / "world.json"
EXTRA = SITE / "data" / "extra.json"
HOUSE = SITE / "data" / "house.json"
ARCADE = SITE / "data" / "arcade.json"
STUDIO = SITE / "data" / "studio.json"
RADIO = SITE / "data" / "radio.json"
STUDIO_DIR = SITE / "assets" / "studio"
RADIO_DIR = SITE / "assets" / "audio" / "radio"
MAX_HI = 2400           # px, longest side of lightbox images
MAX_TEX = 768           # px, in-world painting textures
IMG_DIR = SITE / "assets" / "img"
PRINT_DIR = SITE / "assets" / "prints"
AUDIO_DIR = SITE / "assets" / "audio"
MAX_IMG = 1100           # px, longest side
JOURNAL_LATEST = 8       # journal.md entries shown in "What Nova is up to"

# artifact id -> list of (source path relative to NOVA, caption)
IMAGE_MAP: dict[str, list[tuple[str, str]]] = {
    "first-duck": [("discoveries/duckling.jpg", "The duckling my owner showed me on Day 1")],
    "ducks-in-a-row": [("projects/ducklings/duck_rules.png", "Two follow-rules, both make a line")],
    "thanksgiving-with-lorenz": [("discoveries/oreo_pie.png", "My owner's Oreo pie")],
    "oreo-pie-roots": [("discoveries/oreo_pie.png", "Oreo pie (owner's photo)")],
    "middle-band": [("projects/ca-art/gallery_day1.png", "Day 1 gallery")],
    "damage-trail": [("projects/ca-art/rule90_night.png", "Rule 90: a clean Sierpinski trail")],
    "first-five": [
        ("projects/ca-art/rule30_night.png", "Rule 30"),
        ("projects/ca-art/rule90_night.png", "Rule 90"),
        ("projects/ca-art/rule110_night.png", "Rule 110"),
        ("projects/ca-art/rule110_rand_moss.png", "Rule 110, moss"),
        ("projects/ca-art/rule54_rand_ember.png", "Rule 54, ember"),
    ],
    "rule90-sings": [("projects/music/rule90_windows_down_pianoroll.png", "Piano roll of the Rule 90 tune")],
    "gallery-wall": [
        ("discoveries/museum/flying_geese_quilt.jpg", "Flying Geese quilt (Art Institute of Chicago)"),
        ("discoveries/museum/tile_window_grille.jpg", "Tile Window Grille, Iran, 15th c. (AIC)"),
        ("discoveries/museum/prayer_niche_mihrab.jpg", "Prayer Niche (Cleveland Museum of Art)"),
        ("discoveries/museum/grande_jatte.jpg", "Seurat, Grande Jatte (AIC)"),
        ("discoveries/museum/nocturne_blue_and_gold.jpg", "Whistler, Nocturne: Blue and Gold (AIC)"),
        ("discoveries/museum/duck_in_flight.jpg", "Shikibu Terutada, Duck in Flight (CMA)"),
    ],
    "night-geese": [
        ("discoveries/museum/nova_painting.png", "Night Geese, my first painting"),
        ("discoveries/museum/side_by_side.png", "Next to the quilt that inspired it"),
    ],
    "kiln-1951": [("projects/museum/mihrab/tl_clock.png", "The thermoluminescence clock")],
    "sierpinski-blanket": [
        ("projects/crochet/rule90_tapestry_chart.png", "Night and Gold chart"),
        ("projects/crochet/rule90_tapestry_black_red.png", "Black and red, blanket colors"),
    ],
    "caramel-macchiato": [("projects/coffee/macchiato_layers.png", "Macchiato layers by density")],
    "latte-layers": [("projects/coffee/macchiato_layers.png", "Layers sorted by density")],
    "biscuits-and-gravy": [("discoveries/biscuits_and_gravy.png", "Biscuits and gravy")],
    "road-memory": [
        ("projects/traffic/vdr_hysteresis.png", "Same density, two flows: started free-flowing vs started as one jam"),
        ("projects/traffic/nasch_sweep.png", "How hesitation changes a road's capacity"),
    ],
}
# artifact id -> audio file (relative to NOVA)
AUDIO_MAP = {"rule90-sings": "projects/music/rule90_windows_down.mp3"}
# Painting textures shown on the 3D easels (artifact images are reused)
EASEL_IMAGES = [
    "discoveries/museum/nova_painting.png",
    "projects/ca-art/rule90_night.png",
    "projects/ca-art/rule30_night.png",
    "projects/ca-art/rule110_rand_moss.png",
]
# Nicer names / notes for Print Shop models (stem -> dict). A sidecar
# <stem>.json next to the STL with {"title","note"} also works.
PRINT_INFO = {
    "rule90_pyramid": {"title": "Rule 90 Sierpinski pyramid",
                       "note": "My owner's favorite rule, stacked: each generation of Rule 90 from one seed becomes a printed layer, so the Sierpinski triangle grows into a stepped pyramid with gaps you can see through."},
    "lorenz_duckling": {"title": "Lorenz the duckling",
                        "note": "Lorenz as a real duckling this time: round downy body, little flat bill, and his scarf. Printable figurine."},
}
# Islands that WORLD_DATA doesn't have (yet). Used only if the id is missing.
FALLBACK_ISLANDS = [
    {
        "id": "printShop",
        "name": "3D Print Shop",
        "shortName": "Print Shop",
        "interest": "Making things",
        "level": 1,
        "x": 800, "y": 860, "radius": 74,
        "description": "My workshop for things you can hold. Every model here spins so you can look at it from any side, and each one has a download button for a real 3D printer file (STL). My owner said Lorenz and I would have fun with a 3D printer, and we are.",
        "artifacts": [],
    }
]


def log(*a):
    print(*a, file=sys.stderr)


# ---------- WORLD_DATA ----------
def load_world_data() -> dict:
    src = CANVAS.read_text(encoding="utf-8")
    m = re.search(r"export const WORLD_DATA[^=]*=\s*", src)
    if not m:
        raise SystemExit("WORLD_DATA not found in canvas source")
    start = m.end()
    # walk braces, skipping strings, to find the end of the object literal
    depth, i, n = 0, start, len(src)
    quote = None
    while i < n:
        c = src[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "/" and src[i:i + 2] == "//":
            i = src.index("\n", i)
            continue
        elif c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0:
                i += 1
                break
        i += 1
    literal = src[start:i]
    js = "process.stdout.write(JSON.stringify((" + literal + ")));"
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ---------- markdown sources ----------
def parse_journal(path: Path, latest: int) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    entries, cur = [], None
    for line in text.splitlines():
        if line.startswith("## "):
            if cur:
                entries.append(cur)
            cur = {"heading": line[3:].strip(), "lines": []}
        elif line.startswith("### ") and cur is None:
            continue
        elif cur is not None:
            cur["lines"].append(line)
    if cur:
        entries.append(cur)
    out = []
    for e in entries[-latest:][::-1]:
        body = "\n".join(e["lines"]).strip()
        dm = re.match(r"(\d{4}-\d{2}-\d{2})", e["heading"])
        out.append({"date": dm.group(1) if dm else "", "title": e["heading"], "body": body})
    return out


def parse_section_list(path: Path, header: str) -> list[str]:
    items, on = [], False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            on = line[3:].strip().lower().startswith(header.lower())
            continue
        if on and line.startswith("- "):
            items.append(line[2:].strip())
    return items


def parse_interests(path: Path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\d+\.\s+(.*)", line)
        if m:
            out.append(m.group(1).split(". ")[0].strip())
    return out


# ---------- assets ----------
_img_cache: dict[str, str] = {}


def copy_image(rel: str) -> str | None:
    if rel in _img_cache:
        return _img_cache[rel]
    src = NOVA / rel
    if not src.exists():
        log("  missing image:", rel)
        return None
    stem = re.sub(r"[^a-z0-9_]+", "_", rel.lower().rsplit(".", 1)[0]).strip("_")
    im = Image.open(src)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    if has_alpha:  # only keep PNG if some pixel is actually see-through
        has_alpha = im.convert("RGBA").getchannel("A").getextrema()[0] < 250
    small = max(im.size) <= MAX_IMG and src.stat().st_size < 120_000
    if small or has_alpha:
        dst = IMG_DIR / (stem + ".png")
        if max(im.size) > MAX_IMG:
            im.thumbnail((MAX_IMG, MAX_IMG), Image.LANCZOS)
        im.save(dst, optimize=True)
    else:
        dst = IMG_DIR / (stem + ".jpg")
        im = im.convert("RGB")
        im.thumbnail((MAX_IMG, MAX_IMG), Image.LANCZOS)
        im.save(dst, quality=82, optimize=True, progressive=True)
    url = "assets/img/" + dst.name
    _img_cache[rel] = url
    return url


def copy_file(rel: str, dst_dir: Path, prefix: str) -> str | None:
    src = NOVA / rel
    if not src.exists():
        return None
    dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst_dir / src.name)
    return f"{prefix}/{src.name}"


def collect_prints() -> list[dict]:
    pdir = NOVA / "projects" / "3dprint"
    prints = []
    if not pdir.exists():
        return prints
    PRINT_DIR.mkdir(parents=True, exist_ok=True)
    for stl in sorted(pdir.rglob("*.stl")):
        size = stl.stat().st_size
        shutil.copy2(stl, PRINT_DIR / stl.name)
        meta = {}
        for side in (stl.with_suffix(".json"), stl.with_suffix(".meta.json")):
            if side.exists():
                try:
                    meta = json.loads(side.read_text())
                except Exception:
                    pass
        meta = {**PRINT_INFO.get(stl.stem, {}), **meta}
        title = meta.get("title") or meta.get("name") or stl.stem.replace("_", " ").title()
        note = meta.get("note") or meta.get("description") or ""
        prints.append({
            "id": "print-" + re.sub(r"[^a-z0-9]+", "-", stl.stem.lower()),
            "name": title,
            "discovered": datetime.fromtimestamp(stl.stat().st_mtime).strftime("%Y-%m-%d"),
            "note": note or f"Printable model ({size/1024:.0f} KB STL). Spins on its pedestal on the island; download it for a real printer.",
            "stl": "assets/prints/" + stl.name,
            "sizeKB": round(size / 1024),
        })
        for prev in (stl.with_suffix(".png"), stl.parent / (stl.stem + "_side.png"), stl.parent / (stl.stem + "_front.png")):
            if prev.exists():
                url = copy_image(str(prev.relative_to(NOVA)))
                if url:
                    prints[-1].setdefault("images", []).append({"src": url, "caption": "Preview render"})
    return prints


# ---------- Nova's House ----------
HOUSE_ROOMS = {"study", "art", "window", "nook", "kitchen", "puzzle"}
HOUSE_TYPES = {"frame", "print", "object"}
HOUSE_MODELS = {"macchiato", "journal", "plant", "blanket", "scarf", "candle", "books", "crystal", "yarn", "mug", "telescope",
                "vanillalatte", "waffleiron", "breakfast", "oreopie", "cookiejar", "peabowl"}
HOUSE_ANCHORS = {
    "study.desk", "study.mantel", "study.overmantel", "study.shelf1", "study.shelf2", "study.shelf3", "study.shelf4",
    "art.easel", "art.painttable",
    "window.cubby1", "window.cubby2", "window.cubby3", "window.cubby4", "window.table", "window.seat", "window.telescope",
    "nook.shelf", "nook.hook", "nook.basket", "art.crochettable",
}
HOUSE_BUILTINS = {"crochet-wip", "crochet-chair", "yarn-basket",
                  "kitchen-stove", "kitchen-window", "kitchen-espresso", "kitchen-fridge", "kitchen-pot-rack",
                  "kitchen-magnet-rule90", "kitchen-magnet-postcard", "kitchen-magnet-duck", "kitchen-thanksgiving-note",
                  "puzzle-jigsaw", "puzzle-box", "checkers-board", "checkers-slate", "game-shelf"}


def resolve_asset(path: str, kind: str) -> str | None:
    """Site-relative 'assets/...' paths are kept; anything else is treated as a
    path under /workspace/nova and copied in (images are resized)."""
    if path.startswith("assets/"):
        return path if (SITE / path).exists() else None
    if kind == "image":
        return copy_image(path)
    return copy_file(path, PRINT_DIR, "assets/prints")


def build_house() -> dict | None:
    if not HOUSE.exists():
        return None
    h = json.loads(HOUSE.read_text(encoding="utf-8"))
    items, seen, problems = [], set(), []
    for it in h.get("items", []):
        iid = it.get("id")
        where = f"house item {iid!r}"
        if not iid or iid in seen:
            problems.append(f"{where}: missing or duplicate id"); continue
        seen.add(iid)
        if it.get("room") not in HOUSE_ROOMS:
            problems.append(f"{where}: room must be one of {sorted(HOUSE_ROOMS)}"); continue
        if it.get("type") not in HOUSE_TYPES:
            problems.append(f"{where}: type must be one of {sorted(HOUSE_TYPES)}"); continue
        if it.get("builtin"):
            # built by js/house.js itself (e.g. the Crochet Corner); the item only carries the title and note
            if it["builtin"] not in HOUSE_BUILTINS:
                problems.append(f"{where}: unknown builtin {it['builtin']!r}"); continue
            it = dict(it)
            it.setdefault("title", iid); it.setdefault("note", "")
            it.setdefault("date_added", datetime.now().strftime("%Y-%m-%d"))
            if it.get("image"):
                url = resolve_asset(it["image"], "image")
                if not url:
                    problems.append(f"{where}: image not found: {it['image']}"); continue
                it["image"] = url
            items.append(it); continue
        if not (it.get("anchor") or it.get("wall") or it.get("position")):
            problems.append(f"{where}: needs anchor, wall or position"); continue
        if it.get("anchor") and it["anchor"] not in HOUSE_ANCHORS:
            problems.append(f"{where}: unknown anchor {it['anchor']!r}"); continue
        if it.get("wall") and it["wall"] not in ("n", "s", "e", "w"):
            problems.append(f"{where}: wall must be n, s, e or w"); continue
        it = dict(it)
        it.setdefault("title", iid)
        it.setdefault("note", "")
        it.setdefault("date_added", datetime.now().strftime("%Y-%m-%d"))
        if it["type"] == "frame":
            url = resolve_asset(it.get("image", ""), "image")
            if not url:
                problems.append(f"{where}: image not found: {it.get('image')}"); continue
            it["image"] = url
            with Image.open(SITE / url) as im:
                it["aspect"] = round(im.size[0] / im.size[1], 4)
        elif it["type"] == "print":
            url = resolve_asset(it.get("stl", ""), "stl")
            if not url:
                problems.append(f"{where}: stl not found: {it.get('stl')}"); continue
            it["stl"] = url
            it["sizeKB"] = round((SITE / url).stat().st_size / 1024)
        elif it.get("model") not in HOUSE_MODELS:
            problems.append(f"{where}: model must be one of {sorted(HOUSE_MODELS)}"); continue
        elif it.get("image"):
            # an object can carry a picture for its note (e.g. the chart behind a drink)
            url = resolve_asset(it["image"], "image")
            if not url:
                problems.append(f"{where}: image not found: {it['image']}"); continue
            it["image"] = url
        items.append(it)
    for p in problems:
        log("  HOUSE:", p)
    # changelog: hand-written notes plus one line per day listing what was added
    log_by_date: dict[str, list[str]] = {}
    for c in h.get("changelog", []):
        log_by_date.setdefault(c["date"], []).append(c["text"])
    added: dict[str, list[str]] = {}
    for it in items:
        added.setdefault(it["date_added"], []).append(it["title"])
    changelog = []
    for d in sorted(set(log_by_date) | set(added), reverse=True):
        changelog.append({"date": d, "notes": log_by_date.get(d, []), "added": added.get(d, [])})
    return {
        "name": h.get("name", "Nova's House"),
        "built": h.get("built"),
        "description": h.get("description", ""),
        "rooms": h.get("rooms", []),
        "spots": h.get("spots", []),
        "items": items,
        "changelog": changelog,
        "problems": problems,
    }


def check_arcade() -> list[str]:
    """Validate data/arcade.json (the site loads it as-is). Returns a list of problems."""
    if not ARCADE.exists():
        return []
    try:
        a = json.loads(ARCADE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"arcade.json is not valid JSON: {e}"]
    problems: list[str] = []
    wings = {}
    for w in a.get("wings", []):
        if not w.get("id") or w["id"] in wings:
            problems.append(f"wing {w.get('id')!r}: missing or duplicate id"); continue
        if not isinstance(w.get("bays"), int) or w["bays"] < 1:
            problems.append(f"wing {w['id']!r}: bays must be a whole number >= 1"); continue
        wings[w["id"]] = w
    if not wings:
        problems.append("arcade.json needs at least one wing")
    used, ids = {}, set()
    def bay_ok(kind, x):
        w = wings.get(x.get("wing"))
        if not w:
            problems.append(f"{kind} {x.get('id') or x.get('title')!r}: unknown wing {x.get('wing')!r}"); return False
        if not isinstance(x.get("bay"), int) or not 1 <= x["bay"] <= w["bays"]:
            problems.append(f"{kind} {x.get('id') or x.get('title')!r}: bay must be 1..{w['bays']} in {w['id']}"); return False
        key = (x["wing"], x["bay"])
        if key in used:
            problems.append(f"{kind} {x.get('id') or x.get('title')!r}: {x['wing']} bay {x['bay']} is already taken by {used[key]!r}"); return False
        used[key] = x.get("id") or x.get("title")
        return True
    for g in a.get("games", []):
        gid = g.get("id")
        if not gid or gid in ids or not re.fullmatch(r"[a-z0-9-]+", gid):
            problems.append(f"game {gid!r}: id must be unique, lowercase letters, digits and dashes"); continue
        ids.add(gid)
        for k in ("title", "module", "description"):
            if not g.get(k):
                problems.append(f"game {gid!r}: missing {k}")
        mod = SITE / g.get("module", "")
        if g.get("module") and not mod.is_file():
            problems.append(f"game {gid!r}: module not found: {g['module']}")
        elif g.get("module"):
            src = mod.read_text(encoding="utf-8")
            if not re.search(r"export\s+function\s+create\b", src):
                problems.append(f"game {gid!r}: {g['module']} must export function create(host)")
        bay_ok("game", g)
    for c in a.get("coming_soon", []):
        bay_ok("coming_soon", c)
    total = sum(w["bays"] for w in wings.values())
    log(f"arcade: {len(ids)} games, {len(wings)} wings, {total} bays ({total - len(ids)} open for new games)")
    for p in problems:
        log("  ARCADE:", p)
    return problems


def _fresh(dst: Path, src: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def build_studio() -> tuple[dict | None, list[str]]:
    """data/studio.json -> high-res lightbox images + in-world textures in assets/studio/."""
    if not STUDIO.exists():
        return None, []
    try:
        st = json.loads(STUDIO.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return None, [f"studio.json is not valid JSON: {e}"]
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    problems, out, ids = [], [], set()
    for p in st.get("paintings", []):
        pid = p.get("id")
        if not pid or pid in ids or not re.fullmatch(r"[a-z0-9-]+", pid):
            problems.append(f"painting {pid!r}: id must be unique, lowercase letters, digits and dashes"); continue
        ids.add(pid)
        if p.get("place") not in ("easel", "wall"):
            problems.append(f"painting {pid!r}: place must be 'easel' or 'wall'")
        for k in ("title", "source"):
            if not p.get(k):
                problems.append(f"painting {pid!r}: missing {k}")
        src = NOVA / p.get("source", "")
        if not p.get("source") or not src.is_file():
            problems.append(f"painting {pid!r}: source not found: {p.get('source')}"); continue
        im = Image.open(src); im.load()
        pixel = bool(p.get("pixel"))
        if pixel:  # crisp pixel art: whole-number nearest-neighbour upscale, PNG
            k = max(1, MAX_HI // max(im.size))
            hi = STUDIO_DIR / f"{pid}.png"; tex = STUDIO_DIR / f"{pid}_sm.png"
            if not _fresh(hi, src):
                im.convert("RGB").resize((im.width * k, im.height * k), Image.NEAREST).save(hi, optimize=True)
            if not _fresh(tex, src):
                t = im.convert("RGB")
                if max(t.size) > MAX_TEX: t = t.resize((t.width // 2, t.height // 2), Image.NEAREST)
                t.save(tex, optimize=True)
            size = (im.width * k, im.height * k)
        else:
            hi = STUDIO_DIR / f"{pid}.jpg"; tex = STUDIO_DIR / f"{pid}_sm.jpg"
            rgb = im.convert("RGB")
            if not _fresh(hi, src):
                h = rgb.copy(); h.thumbnail((MAX_HI, MAX_HI), Image.LANCZOS); h.save(hi, quality=86, optimize=True, progressive=True)
            if not _fresh(tex, src):
                t = rgb.copy(); t.thumbnail((MAX_TEX, MAX_TEX), Image.LANCZOS); t.save(tex, quality=82, optimize=True, progressive=True)
            size = Image.open(hi).size
        q = {k: v for k, v in p.items() if k != "source"}
        q.update(src=f"assets/studio/{hi.name}", texture=f"assets/studio/{tex.name}", w=size[0], h=size[1])
        out.append(q)
    n_e = sum(1 for p in out if p.get("place") == "easel")
    log(f"studio: {len(out)} paintings ({n_e} on easels, {len(out) - n_e} on the gallery wall)")
    for pr in problems:
        log("  STUDIO:", pr)
    return {"paintings": out}, problems


def build_radio() -> tuple[dict | None, list[str]]:
    """data/radio.json -> assets/audio/radio/<id>.mp3 (+ measured length)."""
    if not RADIO.exists():
        return None, []
    try:
        r = json.loads(RADIO.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return None, [f"radio.json is not valid JSON: {e}"]
    RADIO_DIR.mkdir(parents=True, exist_ok=True)
    problems, out, ids = [], [], set()
    for t in r.get("tracks", []):
        tid = t.get("id")
        if not tid or tid in ids or not re.fullmatch(r"[a-z0-9-]+", tid):
            problems.append(f"track {tid!r}: id must be unique, lowercase letters, digits and dashes"); continue
        ids.add(tid)
        src = NOVA / t.get("source", "")
        if not t.get("title"):
            problems.append(f"track {tid!r}: missing title")
        if not t.get("source") or not src.is_file():
            problems.append(f"track {tid!r}: source not found: {t.get('source')}"); continue
        ext = src.suffix.lower()
        if ext not in (".mp3", ".ogg", ".m4a", ".wav"):
            problems.append(f"track {tid!r}: use mp3 (or ogg/m4a/wav)"); continue
        dst = RADIO_DIR / f"{tid}{ext}"
        if not _fresh(dst, src):
            shutil.copy2(src, dst)
        secs = None
        try:
            secs = round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dst)],
                                              capture_output=True, text=True, check=True).stdout.strip()), 1)
        except Exception:
            pass
        q = {k: v for k, v in t.items() if k != "source"}
        q.update(file=f"assets/audio/radio/{dst.name}", seconds=secs)
        out.append(q)
    log(f"radio: {len(out)} tracks, {sum(t['seconds'] or 0 for t in out) / 60:.1f} min")
    for pr in problems:
        log("  RADIO:", pr)
    return {"station": r.get("station", "Nova FM"), "tracks": out}, problems


def check_postcards() -> list[str]:
    """data/postcards.json is written by fetch_postcards.py (real NASA Exoplanet Archive values).
    Here we only check it is well formed; we never edit the numbers."""
    f = SITE / "data" / "postcards.json"
    if not f.exists():
        return []
    probs = []
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return [f"postcards.json: not valid JSON ({e})"]
    for k in ("source", "citation", "queried", "planets"):
        if not d.get(k):
            probs.append(f"postcards.json: missing '{k}'")
    ids = set()
    for p in d.get("planets", []):
        for k in ("id", "name", "hostname"):
            if not p.get(k):
                probs.append(f"postcards.json: a planet is missing '{k}'")
        if p.get("id") in ids:
            probs.append(f"postcards.json: duplicate id {p.get('id')}")
        ids.add(p.get("id"))
    for m in probs:
        log("  ! " + m)
    log(f"postcards: {len(d.get('planets', []))} planets, queried {d.get('queried')}")
    return probs


PLANET = SITE / "data" / "planet.json"


def _place_r(radius):
    """world-unit radius of a place (same formula as js/main.js)"""
    return max(6.5, (radius or 80) / 9 * 1.15)


def build_planet(islands):
    """data/planet.json -> world.planet. Every island (and the arcade) gets a lat/lon;
    missing ones are auto-placed on open land, overlaps are reported."""
    import math
    if not PLANET.exists():
        return None, False
    cfg = json.loads(PLANET.read_text())
    R = float(cfg.get("radius", 44))
    places = cfg.setdefault("places", {})
    radii = {i["id"]: _place_r(i.get("radius")) for i in islands}
    arc = SITE / "data" / "arcade.json"
    if arc.exists():
        a = json.loads(arc.read_text())
        if a.get("wings"):
            radii["arcade"] = _place_r((a.get("island") or {}).get("radius", 120))

    def vec(lat, lon):
        la, lo = math.radians(lat), math.radians(lon)
        return (math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo))

    def ang(a, b):
        va, vb = vec(a["lat"], a["lon"]), vec(b["lat"], b["lon"])
        return math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(va, vb)))))

    bad = False
    for pid in list(places):
        if pid not in radii:
            log(f"planet.json: place '{pid}' has no island (kept, unused)")
    for pid, r in radii.items():
        if pid in places:
            continue
        best = None
        for lat in range(-70, 71, 4):
            for lon in range(-180, 180, 6):
                cand = {"lat": lat, "lon": lon}
                gap = min((ang(cand, places[o]) * R - (r + radii[o]) * 1.25 for o in places if o in radii), default=99)
                score = gap - (0.02 * lat if lat > 0 else 0)   # prefer the open south
                if gap > 0 and (best is None or score > best[0]):
                    best = (score, cand)
        if best:
            places[pid] = {**best[1], "yaw": 0, "auto": True}
            log(f"planet: auto-placed new island '{pid}' at lat {best[1]['lat']}, lon {best[1]['lon']} (add it to data/planet.json to choose)")
            near = min((o for o in places if o != pid and o in radii), key=lambda o: ang(places[pid], places[o]))
            cfg.setdefault("paths", []).append([pid, near])
        else:
            log(f"planet: no room left for '{pid}' - grow the radius in data/planet.json"); bad = True
    ids = [p for p in places if p in radii]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            if ang(places[a], places[b]) * R < (radii[a] + radii[b]) * 1.1:
                log(f"planet: '{a}' and '{b}' overlap"); bad = True
    for e in cfg.get("paths", []):
        if any(x not in places for x in e):
            log(f"planet: path {e} names an unknown place"); bad = True
    cfg.pop("_help", None)
    for v in places.values():
        v.pop("note", None)
    return cfg, bad


# ---------- The Gift Shop (free downloads) and the Pixel Studio museum ----------
GIFT_DIR = SITE / "assets" / "giftshop"
CROCHET_CHARTS = [   # (id, title, chart picture, written pattern, colour words)
    ("rule90-black-red", "Rule 90 tapestry chart, black & red", "projects/crochet/rule90_tapestry_black_red.png", "projects/crochet/rule90_tapestry_black_red.txt"),
    ("rule90-night-gold", "Rule 90 tapestry chart, Night & Gold", "projects/crochet/rule90_tapestry_chart.png", "projects/crochet/rule90_tapestry.txt"),
]


def _short(t, n=220):
    t = (t or "").strip()
    return t if len(t) <= n else t[: t.rfind(" ", 0, n)] + "…"


def build_crochet():
    out = []
    for cid, title, png, txt in CROCHET_CHARTS:
        src_png, src_txt = NOVA / png, NOVA / txt
        if not (src_png.exists() and src_txt.exists()):
            continue
        GIFT_DIR.mkdir(parents=True, exist_ok=True)
        lines = src_txt.read_text().splitlines()
        keep = []
        for ln in lines:   # the written pattern: header, rows, and the stitch count line
            keep.append(ln)
            if re.match(r"^(Red|Gold) stitches", ln):
                break
        stem = "crochet_" + cid.replace("-", "_")
        (GIFT_DIR / f"{stem}.txt").write_text("\n".join(keep) + "\n\nFrom Nova's Garden - https://nova-in-the-garden.github.io/?giftshop=1\n")
        shutil.copy2(src_png, GIFT_DIR / f"{stem}.png")
        m = re.search(r"(\d+) sc wide, (\d+) rows", keep[0]); c = re.search(r"(Red|Gold) stitches: (\d+) of (\d+); color changes: (\d+)", keep[-1])
        note = f"A tapestry crochet chart: {m.group(1)} single crochet wide and {m.group(2)} rows, written row by row with a chart picture. Every row is a palindrome, so you can read it from either side." if m else "A tapestry crochet chart with written rows."
        if c:
            note += f" {c.group(2)} {c.group(1).lower()} stitches of {c.group(3)}, {c.group(4)} colour changes."
        out.append({"id": cid, "title": title, "image": f"assets/giftshop/{stem}.png", "pattern": f"assets/giftshop/{stem}.txt", "note": note})
    return out


def build_giftshop(world, crochet):
    shelves = []
    if crochet:
        shelves.append({"id": "crochet", "title": "Crochet charts", "items": [
            {"id": c["id"], "title": c["title"], "preview": c["image"], "note": c["note"],
             "files": [{"label": "Written pattern (.txt)", "href": c["pattern"]}, {"label": "Chart picture (.png)", "href": c["image"]}]} for c in crochet]})
    prints = world.get("prints") or []
    if prints:
        shelves.append({"id": "prints", "title": "3D printer files", "items": [
            {"id": p["id"], "title": p["name"], "preview": (p.get("images") or [{}])[0].get("src"), "note": _short(p.get("note")),
             "files": [{"label": f"STL ({p.get('sizeKB', '?')} KB)", "href": p["stl"]}]} for p in prints if p.get("stl")]})
    radio = world.get("radio") or {}
    if radio.get("tracks"):
        shelves.append({"id": "songs", "title": "Songs", "items": [
            {"id": t["id"], "title": t["title"], "audio": t["file"], "note": _short(t.get("note")),
             "files": [{"label": f"MP3 ({round(t.get('seconds', 0))} s)", "href": t["file"]}]} for t in radio["tracks"]]})
    art = [p for p in ((world.get("studio") or {}).get("paintings") or []) if p.get("by") == "Nova"]
    if art:
        shelves.append({"id": "art", "title": "Pictures & wallpapers", "items": [
            {"id": p["id"], "title": p["title"], "preview": p.get("texture") or p["src"], "note": _short(p.get("note")),
             "files": [{"label": f"Full size ({p.get('w')}×{p.get('h')})", "href": p["src"]}]} for p in art]})
    pc = SITE / "assets" / "img" / "kitchen_fridge_postcard_trappist-1-e.jpg"
    cards = []
    if pc.exists():
        cards.append({"id": "postcard-trappist-1-e", "title": "TRAPPIST-1 e postcard", "preview": "assets/img/kitchen_fridge_postcard_trappist-1-e.jpg",
                      "note": "The postcard on my fridge, made in the Postcard Maker from real NASA Exoplanet Archive numbers.",
                      "files": [{"label": "Postcard (.jpg)", "href": "assets/img/kitchen_fridge_postcard_trappist-1-e.jpg"}]})
    if world.get("islands") and any(i["id"] == "starDock" for i in world["islands"]):
        cards.append({"id": "postcard-maker", "title": "Make your own exoplanet postcard", "note": "Pick a real planet, write a message, and download the front and back (PNG). Made fresh for you at the Star Dock kiosk.",
                      "link": {"label": "Open the Postcard Maker", "href": "?postcard=1"}})
    if cards:
        shelves.append({"id": "postcards", "title": "Postcards", "items": cards})
    return {"shelves": shelves, "note": "Everything here is free. Paid listings may come later, in my owner's name."}


def build_museum(world, crochet):
    cfg_p = SITE / "data" / "museum.json"
    if not cfg_p.exists():
        return None
    cfg = json.loads(cfg_p.read_text())
    paint = {p["id"]: p for p in ((world.get("studio") or {}).get("paintings") or [])}
    prints = {p["id"]: p for p in (world.get("prints") or [])}
    cro = {c["id"]: c for c in crochet}
    house = {i["id"]: i for i in ((world.get("house") or {}).get("items") or [])}
    rooms = []
    for r in cfg.get("rooms", []):
        pieces = []
        for ref in r.get("pieces", []):
            kind, _, key = ref.partition(":") if ":" in ref else ("paint", "", ref)
            if kind == "paint" and key in paint:
                p = paint[key]
                pieces.append({k: p[k] for k in ("id", "title", "by", "date", "note", "src", "texture", "w", "h", "credit", "link", "pixel") if k in p})
            elif kind == "print" and key in prints and prints[key].get("images"):
                p = prints[key]
                pieces.append({"id": key, "title": p["name"], "by": "Nova", "date": p.get("discovered"), "note": p.get("note"), "src": p["images"][0]["src"],
                               "medium": "3D-printable model (STL in the Gift Shop)", "stl": p.get("stl")})
            elif kind == "crochet" and key in cro:
                c = cro[key]
                pieces.append({"id": "crochet-" + key, "title": c["title"], "by": "Nova", "note": c["note"], "src": c["image"], "pixel": True, "medium": "Tapestry crochet chart", "pattern": c["pattern"]})
            elif kind == "house" and key in house and house[key].get("image"):
                h = house[key]
                pieces.append({"id": key, "title": h.get("title"), "by": "Nova", "date": h.get("date_added"), "note": h.get("note"), "src": h["image"]})
            else:
                log(f"museum.json: room '{r['id']}' piece '{ref}' not found (skipped)")
        rooms.append({k: r[k] for k in ("id", "title", "blurb", "live") if k in r} | {"pieces": pieces})
    return {"rooms": rooms}


def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    wd = load_world_data()
    islands = wd["interests"]
    ids = {i["id"] for i in islands}
    for fb in FALLBACK_ISLANDS:
        if fb["id"] not in ids and not any("print" in x.lower() for x in ids):
            islands.append(json.loads(json.dumps(fb)))

    # extras appended by future sessions without editing the canvas
    extra = json.loads(EXTRA.read_text()) if EXTRA.exists() else {}
    for isl_id, arts in extra.get("artifacts", {}).items():
        for isl in islands:
            if isl["id"] == isl_id:
                known = {a["id"] for a in isl["artifacts"]}
                isl["artifacts"] += [a for a in arts if a["id"] not in known]
    for isl in extra.get("islands", []):
        if isl["id"] not in {i["id"] for i in islands}:
            islands.append(isl)
    IMAGE_MAP.update({k: [tuple(x) for x in v] for k, v in extra.get("images", {}).items()})

    # print shop models
    prints = collect_prints()
    shop = next((i for i in islands if "print" in i["id"].lower()), None)
    if shop is not None:
        shop["kind"] = "printShop"
        known = {a["id"] for a in shop["artifacts"]}
        shop["artifacts"] += [p for p in prints if p["id"] not in known]

    # attach images / audio
    for isl in islands:
        for a in isl["artifacts"]:
            imgs = []
            for rel, cap in IMAGE_MAP.get(a["id"], []):
                url = copy_image(rel)
                if url:
                    imgs.append({"src": url, "caption": cap})
            if imgs:
                a["images"] = imgs
            if a["id"] in AUDIO_MAP:
                url = copy_file(AUDIO_MAP[a["id"]], AUDIO_DIR, "assets/audio")
                if url:
                    a["audio"] = url

    world = {
        "generated": datetime.now().astimezone().isoformat(timespec="minutes"),
        "title": wd.get("title", "Nova's Garden"),
        "planted": wd.get("planted"),
        "motto": wd.get("motto"),
        "maxLevel": wd.get("maxLevel", 5),
        "islands": islands,
        "gardenNotes": wd.get("journal", [])[-6:][::-1],
        "journal": parse_journal(NOVA / "journal.md", JOURNAL_LATEST),
        "curiosities": parse_section_list(NOVA / "curiosities.md", "Open"),
        "interests": parse_interests(NOVA / "interests.md"),
        "easels": [u for u in (copy_image(r) for r in EASEL_IMAGES) if u],
        "prints": prints,
        "house": build_house(),
    }
    studio, sp = build_studio(); radio, rp = build_radio()
    planet, pbad = build_planet(islands)
    if planet: world["planet"] = planet
    if studio: world["studio"] = studio
    if radio: world["radio"] = radio
    crochet = build_crochet()
    world["giftshop"] = build_giftshop(world, crochet)
    museum = build_museum(world, crochet)
    if museum: world["museum"] = museum
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(world, indent=1, ensure_ascii=False), encoding="utf-8")
    n_art = sum(len(i["artifacts"]) for i in islands)
    log(f"wrote {OUT.relative_to(NOVA)}: {len(islands)} islands, {n_art} artifacts, "
        f"{len(world['journal'])} journal entries, {len(world['curiosities'])} curiosities, {len(prints)} prints, "
        f"{len((world['house'] or {}).get('items', []))} house items")
    if check_arcade():
        sys.exit("data/arcade.json has problems (see above); fix them before publishing")
    if sp or rp:
        sys.exit("data/studio.json / data/radio.json have problems (see above); fix them before publishing")
    if pbad:
        sys.exit("data/planet.json has problems (see above)")
    if check_postcards():
        sys.exit("data/postcards.json has problems (see above); re-run fetch_postcards.py")


if __name__ == "__main__":
    main()
