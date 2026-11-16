#!/usr/bin/env python3
"""Refresh data/postcards.json for the Star Dock Exoplanet Postcard Maker.

Pulls a curated list of real exoplanets (and every sibling planet in their systems, so the
postcard sky can show them) from the NASA Exoplanet Archive's Planetary Systems Composite
Parameters table (pscomppars) through its TAP service. Values are copied as-is; anything the
archive leaves blank stays null ("unknown" on the card). Nothing is invented.

Usage:  python3 fetch_postcards.py          (then commit data/postcards.json)
"""
import json, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "data" / "postcards.json"
TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
COLS = ("pl_name,hostname,pl_letter,sy_snum,sy_pnum,sy_dist,pl_orbper,pl_orbsmax,pl_rade,pl_bmasse,pl_bmassprov,"
        "pl_dens,pl_eqt,pl_insol,pl_orbeccen,pl_orbincl,st_spectype,st_teff,st_rad,st_mass,st_lum,st_age,"
        "disc_year,discoverymethod,disc_facility,cb_flag,pl_controv_flag,tran_flag,ttv_flag,disc_pubdate,"
        "pl_rade_reflink,pl_bmasse_reflink,pl_eqt_reflink,pl_orbsmax_reflink,st_rad_reflink,st_teff_reflink")

# The postcards, in rack order: (archive pl_name, why Nova picked it)
FEATURED = [
    ("TRAPPIST-1 b", "Innermost of seven Earth-sized worlds in a resonant chain."),
    ("TRAPPIST-1 c", "Second of seven; its year is 2.4 days."),
    ("TRAPPIST-1 d", "On the warm inner edge of the habitable zone."),
    ("TRAPPIST-1 e", "The most Earth-like of the seven by size and sunlight."),
    ("TRAPPIST-1 f", "A cool world in the habitable zone; maybe icy."),
    ("TRAPPIST-1 g", "The second-largest of the seven, in the cold outer zone."),
    ("TRAPPIST-1 h", "The outer planet, whose period was predicted before it was measured."),
    ("Proxima Cen b", "The closest known exoplanet: orbits the nearest star to the Sun."),
    ("Kepler-186 f", "The first Earth-sized planet found in a star's habitable zone."),
    ("Kepler-452 b", "'Earth's cousin': a near-year orbit around a Sun-like star."),
    ("TOI-700 d", "An Earth-sized habitable-zone world found by TESS."),
    ("LHS 1140 b", "A dense super-Earth in the habitable zone of a nearby red dwarf."),
    ("K2-18 b", "A sub-Neptune in the habitable zone; JWST saw methane and CO2 in its air."),
    ("Teegarden's Star b", "One of the most Earth-like planets known, around a tiny nearby star."),
    ("Ross 128 b", "A temperate world around a quiet red dwarf only 11 light-years away."),
    ("Kepler-442 b", "A super-Earth in its star's habitable zone."),
    ("Kepler-62 f", "A habitable-zone super-Earth in a five-planet system."),
    ("Kepler-22 b", "Kepler's first habitable-zone planet (2011)."),
    ("Kepler-1649 c", "Earth-sized, found years later hiding in old Kepler data."),
    ("GJ 667 C c", "In a triple-star system: two more suns far off in its sky."),
    ("Kepler-16 b", "The real 'Tatooine': a planet that orbits two suns."),
    ("TOI-1338 b", "Another circumbinary world, found by a high-school intern at NASA."),
    ("Kepler-47 c", "A circumbinary planet in its stars' habitable zone."),
    ("51 Peg b", "The first planet found around a Sun-like star (1995 Nobel Prize)."),
    ("HD 209458 b", "The first planet seen crossing its star, and the first with a detected atmosphere."),
    ("HD 189733 b", "A deep-blue hot Jupiter where it may rain glass sideways."),
    ("WASP-12 b", "A hot Jupiter being stretched and slowly eaten by its star."),
    ("WASP-76 b", "Hot enough that iron may evaporate on the day side and rain on the night side."),
    ("WASP-121 b", "A puffy hot Jupiter with metal clouds."),
    ("KELT-9 b", "The hottest planet known: hotter than many stars."),
    ("55 Cnc e", "A lava-covered super-Earth whose year lasts less than a day."),
    ("Kepler-10 b", "Kepler's first confirmed rocky planet, a scorched lava world."),
    ("GJ 1214 b", "A hazy 'water world' candidate around a small red star."),
    ("HD 80606 b", "On a wildly stretched orbit: heats by hundreds of degrees in hours."),
    ("KOI-351 h", "Kepler-90 h: the outer giant in an eight-planet system, as many planets as ours."),
    ("PSR B1257+12 c", "One of the first exoplanets ever found, orbiting a dead star (a pulsar)."),
    ("bet Pic b", "A young giant planet photographed directly."),
    ("HR 8799 e", "One of four giant planets photographed around a young star."),
]

def tap(query):
    url = TAP + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    with urllib.request.urlopen(url, timeout=120) as r:
        body = r.read().decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        sys.exit("archive error: " + body[:400])

def slug(name):
    return "".join(c if c.isalnum() else "-" for c in name.lower().replace("'", "")).strip("-").replace("--", "-")

def main():
    names = [n for n, _ in FEATURED]
    q1 = "select pl_name,hostname from pscomppars where pl_name in (" + ",".join("'" + n.replace("'", "''") + "'" for n in names) + ")"
    found = {r["pl_name"]: r["hostname"] for r in tap(q1)}
    missing = [n for n in names if n not in found]
    hosts = sorted(set(found.values()))
    q2 = f"select {COLS} from pscomppars where hostname in (" + ",".join("'" + h.replace("'", "''") + "'" for h in hosts) + ") order by hostname, pl_orbper"
    rows = tap(q2)
    systems = {}
    for r in rows:
        systems.setdefault(r["hostname"], []).append(r)
    cards = []
    for name, why in FEATURED:
        if name not in found:
            continue
        host = found[name]; me = next(r for r in systems[host] if r["pl_name"] == name)
        sib = [{"name": r["pl_name"], "letter": r["pl_letter"], "a_au": r["pl_orbsmax"], "period_d": r["pl_orbper"], "radius_re": r["pl_rade"]}
               for r in systems[host] if r["pl_name"] != name]
        rec = {"id": slug(name), "name": name, "why": why}
        for k in COLS.split(","):
            if k == "pl_name": continue
            v = me[k]
            if k.endswith("_reflink"):   # keep only whether the archive *calculated* the value (e.g. radius from mass)
                rec[k.replace("_reflink", "_calc")] = bool(v and "calculated" in v.lower())
            else:
                rec[k] = v
        rec["siblings"] = sib
        cards.append(rec)
    now = datetime.now(timezone.utc).astimezone()
    out = {
        "_help": "Real data from the NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars). null = the archive has no value (shown as 'unknown'). Refresh with: python3 fetch_postcards.py",
        "source": "NASA Exoplanet Archive, Planetary Systems Composite Parameters table (pscomppars)",
        "source_url": "https://exoplanetarchive.ipac.caltech.edu/",
        "citation": "This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.",
        "queried": now.isoformat(timespec="minutes"),
        "query": q2,
        "missing": missing,
        "planets": cards,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(cards)} postcards from {len(hosts)} systems ({len(rows)} planets); missing: {missing or 'none'}")

if __name__ == "__main__":
    main()
