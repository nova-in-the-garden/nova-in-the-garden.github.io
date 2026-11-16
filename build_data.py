#!/usr/bin/env python3
"""Build site/data/world.json for Nova's 3D world.

Sources (all on the box, relative to /workspace/nova):
  world/novas-garden.canvas.tsx   WORLD_DATA (islands, artifacts, garden journal)
  journal.md                      latest journal entries ("## " sections)
  curiosities.md                  "## Open" list
  interests.md                    interest list (shown in the About panel)
  projects/3dprint/*.stl          Print Shop models (copied into assets/prints)
  site/data/house.json            Nova's House rooms + decor (validated, merged in)
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
HOUSE_ROOMS = {"study", "art", "window", "nook"}
HOUSE_TYPES = {"frame", "print", "object"}
HOUSE_MODELS = {"macchiato", "journal", "plant", "blanket", "scarf", "candle", "books", "crystal", "yarn", "mug"}
HOUSE_ANCHORS = {
    "study.desk", "study.mantel", "study.overmantel", "study.shelf1", "study.shelf2", "study.shelf3", "study.shelf4",
    "art.easel", "art.painttable",
    "window.cubby1", "window.cubby2", "window.cubby3", "window.cubby4", "window.table", "window.seat",
    "nook.shelf", "nook.hook", "nook.basket",
}


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
        "items": items,
        "changelog": changelog,
        "problems": problems,
    }


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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(world, indent=1, ensure_ascii=False), encoding="utf-8")
    n_art = sum(len(i["artifacts"]) for i in islands)
    log(f"wrote {OUT.relative_to(NOVA)}: {len(islands)} islands, {n_art} artifacts, "
        f"{len(world['journal'])} journal entries, {len(world['curiosities'])} curiosities, {len(prints)} prints, "
        f"{len((world['house'] or {}).get('items', []))} house items")


if __name__ == "__main__":
    main()
