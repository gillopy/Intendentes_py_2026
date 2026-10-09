"""Build the Asunción basemap layers (barrios, district, main roads) for the site.

Sources (committed under data/asuncion_2026/source/):
  - barrios_asuncion.geojson        (68 barrios, census-style properties)
  - distrito_asuncion.geojson       (Capital district outline)
  - vias_principales_asuncion.geojson (main roads, for context)

Simplifies the geometries (Douglas–Peucker) and matches each barrio to our
election barrio names. Output: data/asuncion_2026/asuncion_geo.json

Usage: uv run python tools/asuncion_geo.py
"""
from __future__ import annotations

import json
import math
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "asuncion_2026" / "source"
OUT = ROOT / "data" / "asuncion_2026" / "asuncion_geo.json"
ASUNCION_JSON = ROOT / "data" / "asuncion_2026" / "asuncion.json"

EPS_BARRIO = 0.00005
EPS_DISTRITO = 0.00006
EPS_VIA = 0.00012


def rdp(points, eps):
    if len(points) < 3:
        return list(points)
    (x1, y1), (x2, y2) = points[0], points[-1]
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1) or 1e-12
        d = num / den
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps and 0 < idx < len(points) - 1:
        return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)
    return [points[0], points[-1]]


def simplify_ring(ring, eps):
    pts = [(round(x, 5), round(y, 5)) for x, y in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 4:
        return pts + [pts[0]] if pts else []
    out = rdp(pts, eps)
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def simplify_line(line, eps):
    pts = [(round(x, 5), round(y, 5)) for x, y in line]
    if len(pts) < 3:
        return pts
    return rdp(pts, eps)


def polygons_of(geom, eps):
    t = geom["type"]
    coords = geom["coordinates"]
    if t == "Polygon":
        coords = [coords]
    out = []
    for poly in coords:
        out.append([simplify_ring(r, eps) for r in poly])
    return out


def lines_of(geom, eps):
    t = geom["type"]
    coords = geom["coordinates"]
    if t == "LineString":
        coords = [coords]
    elif t == "MultiPolygon" or t == "Polygon":
        return []
    out = []
    for ln in coords:
        s = simplify_line(ln, eps)
        if len(s) >= 2:
            out.append(s)
    return out


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    for ch in ".,()/-":
        s = s.replace(ch, " ")
    return " ".join(s.split())


def main() -> None:
    ours = [b["barrio"] for b in json.loads(ASUNCION_JSON.read_text(encoding="utf-8"))["barrios"]]
    our_by_norm = {norm(o): o for o in ours}

    barrios = []
    src = json.loads((SRC / "barrios_asuncion.geojson").read_text(encoding="utf-8"))
    for f in src["features"]:
        name = f["properties"].get("BARLO_DESC")
        polys = polygons_of(f["geometry"], EPS_BARRIO)
        if not any(polys):
            continue
        barrios.append({"name": name, "barrio": our_by_norm.get(norm(name)), "polys": polys})

    distrito = []
    dsrc = json.loads((SRC / "distrito_asuncion.geojson").read_text(encoding="utf-8"))
    for f in dsrc["features"]:
        distrito.extend(polygons_of(f["geometry"], EPS_DISTRITO))

    vias = []
    vsrc = json.loads((SRC / "vias_principales_asuncion.geojson").read_text(encoding="utf-8"))
    for f in vsrc["features"]:
        vias.extend(lines_of(f["geometry"], EPS_VIA))

    def bbox_of(iter_pts):
        xs = [p[0] for p in iter_pts]
        ys = [p[1] for p in iter_pts]
        return [min(xs), min(ys), max(xs), max(ys)]

    all_pts = []
    for b in barrios:
        for poly in b["polys"]:
            for r in poly:
                all_pts.extend(r)

    payload = {
        "source": "Municipalidad de Asunción / censo (barrios, distrito, vías) — simplificado",
        "bbox": bbox_of(all_pts),
        "barrios": barrios,
        "distrito": distrito,
        "vias": vias,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    matched = sum(1 for b in barrios if b["barrio"])
    print(f"[done] {OUT} ({OUT.stat().st_size:,} bytes)")
    print(f"  barrios={len(barrios)} matched={matched} distrito_polys={len(distrito)} vias={len(vias)}")
    print("  nuestros sin geometria:", [o for o in ours if o not in {b['barrio'] for b in barrios}])


if __name__ == "__main__":
    main()
