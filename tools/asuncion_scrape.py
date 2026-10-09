"""Scrape the public Power BI report "Elecciones Intendencia Asunción 2026".

The report is published to the web (view link) and exposes its semantic model
through the public `/querydata` endpoint. There is no export button, so this
tool (1) opens the report in a real browser context, (2) issues its own flat
`SemanticQueryDataShapeCommand` queries against the same model, and (3) decodes
the Power BI **DSR** payloads into tidy rows. It then normalizes everything into
`data/asuncion_2026/asuncion.json` (the input of `make_asuncion.py`).

Why a browser: the endpoint needs the report session cookies; the page origin is
allowed to call it, so we POST from inside the page.

Usage:
    uv run python tools/asuncion_scrape.py            # headless
    uv run python tools/asuncion_scrape.py --headed   # watch it
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "asuncion_2026" / "asuncion.json"

VIEW_URL = (
    "https://app.powerbi.com/view?r=eyJrIjoiMmY4ZGNhMjAtNWQ3My00YjY2LWFjYTAt"
    "MDM2YzJmZmM4Y2I1IiwidCI6IjY4YTNkMjFhLTg4NzEtNDAxZC1hYTA0LTBjMmJiMDc0NjQxYiJ9"
)
ENDPOINT = "https://wabi-paas-1-scus-api.analysis.windows.net/public/reports/querydata?synchronous=true"
RESKEY = "2f8dca20-5d73-4b66-aca0-036c2ffc8cb5"
MODEL_ID = 6566910


# --------------------------------------------------------------------------- #
# Query definitions: (kind, alias, property). Kinds: "Column" | "Measure".
# --------------------------------------------------------------------------- #
def col(alias, prop):
    return ("Column", alias, prop)


def mea(alias, prop):
    return ("Measure", alias, prop)


QUERIES = {
    "barrios": (
        [("b", "BARRIOS-ASUNCION"), ("m", "MEDIDAS")],
        [col("b", "ZONA"), col("b", "BARLO_DESC"),
         mea("m", "Ganador 2021"), mea("m", "Ganador 2026"),
         mea("m", "Margen ANR-JA 2021 (pp)"), mea("m", "Margen ANR-JA 2026 (pp)"),
         mea("m", "Cambio de margen (pp)"),
         mea("m", "Votos Intendencia 2021"), mea("m", "Votos Intendencia 2026"),
         mea("m", "% ANR 2021"), mea("m", "% ANR 2026"),
         mea("m", "% JA 2021"), mea("m", "% JA 2026"),
         mea("m", "% Incidencia de pobreza")],
    ),
    "locales": (
        [("b", "BARRIOS-ASUNCION"), ("c", "LOCALES_AMBAS_ELECCIONES"), ("m", "MEDIDAS")],
        [col("b", "ZONA"), col("b", "BARLO_DESC"), col("c", "LOCAL 2026"),
         col("c", "LON LOCAL 2026"), col("c", "LAT LOCAL 2026"),
         mea("m", "Votos Intendencia 2021"), mea("m", "Votos Intendencia 2026"),
         mea("m", "% ANR 2021"), mea("m", "% ANR 2026"),
         mea("m", "% JA 2021"), mea("m", "% JA 2026"),
         mea("m", "Cambio de margen (pp)")],
    ),
    "zonas": (
        [("b", "BARRIOS-ASUNCION"), ("m", "MEDIDAS")],
        [col("b", "ZONA"),
         mea("m", "% ANR 2021"), mea("m", "% ANR 2026"),
         mea("m", "% JA 2021"), mea("m", "% JA 2026"),
         mea("m", "Margen ANR-JA 2021 (pp)"), mea("m", "Margen ANR-JA 2026 (pp)"),
         mea("m", "Participación 2021 %"), mea("m", "Participación 2026 %"),
         mea("m", "Votos Intendencia 2021"), mea("m", "Votos Intendencia 2026"),
         mea("m", "Cambio de margen (pp)")],
    ),
    "fuerzas": (
        [("p", "PARTIDOS_AMBAS_ELECCIONES"), ("m", "MEDIDAS")],
        [col("p", "SIGLA_2"),
         mea("m", "% Votos Intendencia 2021"), mea("m", "% Votos Intendencia 2026")],
    ),
    "correlacion": (
        [("y", "Corr Variable Y"), ("x", "Corr Variable X"), ("m", "MEDIDAS")],
        [col("y", "Variable Y"), col("x", "Variable-X"), mea("m", "Correlación Matriz Barrio")],
    ),
}

KPI_MEASURES = [
    "% ANR 2021", "% ANR 2026", "% JA 2021", "% JA 2026",
    "Margen ANR-JA 2021 (pp)", "Margen ANR-JA 2026 (pp)",
    "Participación 2021 %", "Participación 2026 %",
    "Barrios ganados por JA 2026", "Votos Intendencia 2021", "Votos Intendencia 2026",
]
NARRATIVE = ["Detalle ANR", "Detalle JA", "Detalle margen", "Detalle participación", "Detalle barrios JA"]


def build(entity_list, selects, all_grouping=True):
    proj = list(range(len(selects)))
    sel = []
    for kind, alias, prop in selects:
        sel.append({kind: {"Expression": {"SourceRef": {"Source": alias}}, "Property": prop},
                    "Name": f"{alias}.{prop}", "NativeReferenceName": prop})
    if all_grouping:
        binding = {"Primary": {"Groupings": [{"Projections": proj}]},
                   "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 20000}}},
                   "Version": 1}
    else:
        binding = {"Primary": {"Groupings": [{"Projections": [0]}]},
                   "DataReduction": {"DataVolume": 3, "Primary": {"Top": {}}}, "Version": 1}
    return {
        "version": "1.0.0",
        "queries": [{"Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
            "Query": {"Version": 2,
                      "From": [{"Name": a, "Entity": e} for a, e in entity_list],
                      "Select": sel},
            "Binding": binding, "ExecutionMetricsKind": 1}}]}}],
        "cancelQueries": [], "modelId": MODEL_ID,
    }


# --------------------------------------------------------------------------- #
# DSR decoding
# --------------------------------------------------------------------------- #
def _query_cols(req):
    cmd = req["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]["Query"]
    headers, measures = [], []
    for s in cmd.get("Select", []):
        kind = obj = None
        for k in ("Column", "Measure", "Aggregation", "HierarchyLevel"):
            if k in s:
                kind, obj = k, s[k]
                break
        if kind is None:
            continue
        name = obj.get("NativeReferenceName") or obj.get("Property")
        (headers if kind == "Column" else measures).append(name)
    return headers, measures


def _resolve(item, raw, vd):
    dn = item.get("DN")
    if dn and dn in vd and isinstance(raw, int):
        return vd[dn][raw]
    return raw


def _smap(schema, headers, measures):
    smap, mi = [], 0
    for item in schema:
        n = item["N"]
        if n[:1] in ("G", "H"):
            idx = int(n[1:]) if n[1:].isdigit() else 0
            colname = headers[idx] if idx < len(headers) else f"H{idx}"
        else:
            colname = measures[mi] if mi < len(measures) else f"V{mi}"
            mi += 1
        smap.append((item, colname))
    return smap


def _walk(members, inherited, headers, measures, vd, out):
    cur_smap, prev_cells = [], None
    for node in members:
        if node.get("S"):
            cur_smap = _smap(node["S"], headers, measures)
            prev_cells = None
        if node.get("C") is not None:
            c = list(node["C"])
            rmask = node.get("R")
            if rmask and cur_smap and prev_cells is not None:
                cells, it = [], iter(c)
                for i in range(len(cur_smap)):
                    if (rmask >> i) & 1 and i < len(prev_cells):
                        cells.append(prev_cells[i])
                    else:
                        cells.append(next(it, None))
            else:
                cells = c
            row = dict(inherited)
            for (item, colname), raw in zip(cur_smap, cells):
                row[colname] = _resolve(item, raw, vd)
            out.append(row)
            prev_cells = cells
            continue
        vals = {}
        for item, colname in cur_smap:
            if item["N"] in node:
                vals[colname] = _resolve(item, node[item["N"]], vd)
        merged = {**inherited, **vals}
        children = [v for k, v in node.items()
                    if k not in ("S", "C") and isinstance(v, list) and v and isinstance(v[0], dict)]
        if children:
            for child in children:
                _walk(child, merged, headers, measures, vd, out)
        elif cur_smap:
            out.append(merged)


def decode(text, req):
    resp = json.loads(text)
    dsr = resp["results"][0]["result"]["data"]["dsr"]
    headers, measures = _query_cols(req)
    out = []
    for ds in dsr.get("DS", []):
        vd = ds.get("ValueDicts", {}) or {}
        for ph in ds.get("PH", []):
            for members in ph.values():
                if isinstance(members, list):
                    _walk(members, {}, headers, measures, vd, out)
    return out


# --------------------------------------------------------------------------- #
# Normalization (mirrors the committed schema)
# --------------------------------------------------------------------------- #
def _fnum(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


def _safe(s):
    return "" if s is None else str(s).replace("\ufffd", "·")


def normalize(raw):
    k = raw["kpis"]
    return {
        "meta": {
            "report": "Elecciones Intendencia Asunción 2026",
            "source": "TSJE 2021/2026 · INE censo 2022 (via app.powerbi.com public report)",
            "scraped_at": raw["scraped_at"],
            "counts": {"barrios": len(raw["barrios"]), "locales": len(raw["locales"]),
                       "zonas": len(raw["zonas"]), "fuerzas": len(raw["fuerzas"]),
                       "vars": len(raw["correlacion"]["vars"])},
        },
        "kpis": k, "fuerzas": raw["fuerzas"], "zonas": raw["zonas"],
        "barrios": raw["barrios"], "locales": raw["locales"],
        "correlacion": raw["correlacion"], "narrativa": raw["narrativa"],
    }


def run(headed: bool) -> int:
    raw = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        ctx = browser.new_context(locale="es-ES", viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        page.goto(VIEW_URL, wait_until="load", timeout=90000)
        for _ in range(40):
            page.wait_for_timeout(1000)
            if "Cargando datos" not in page.inner_text("body"):
                break
        page.wait_for_timeout(4000)

        def post(payload):
            return page.evaluate(
                """async (payload) => {
                    const res = await fetch(%r, {method:'POST',
                      headers:{'content-type':'application/json;charset=UTF-8','x-powerbi-resourcekey':%r},
                      body: JSON.stringify(payload)});
                    return await res.text();
                }""" % (ENDPOINT, RESKEY), payload)

        for name, (ents, sels) in QUERIES.items():
            req = build(ents, sels)
            rows = decode(post(req), req)
            raw[name] = rows
            print(f"[ok] {name}: {len(rows)} rows")

        kpis = {}
        for prop in KPI_MEASURES:
            q = build([("m", "MEDIDAS")], [mea("m", prop)], all_grouping=False)
            rows = decode(post(q), q)
            kpis[prop] = rows[0].get(prop) if rows else None

        narr = {}
        for prop in NARRATIVE:
            q = build([("m", "MEDIDAS")], [mea("m", prop)], all_grouping=False)
            rows = decode(post(q), q)
            narr[prop] = rows[0].get(prop) if rows else None

        ctx.close()
        browser.close()

    def _winner(v):
        return v if v in ("ANR", "JA") else None

    barrios = [{
        "zona": _safe(r.get("ZONA")), "barrio": _safe(r.get("BARLO_DESC")),
        "win21": _winner(r.get("Ganador 2021")), "win26": _winner(r.get("Ganador 2026")),
        "margen21": _fnum(r.get("Margen ANR-JA 2021 (pp)")), "margen26": _fnum(r.get("Margen ANR-JA 2026 (pp)")),
        "giro": _fnum(r.get("Cambio de margen (pp)")),
        "votos21": r.get("Votos Intendencia 2021"), "votos26": r.get("Votos Intendencia 2026"),
        "anr21": _fnum(r.get("% ANR 2021")), "anr26": _fnum(r.get("% ANR 2026")),
        "ja21": _fnum(r.get("% JA 2021")), "ja26": _fnum(r.get("% JA 2026")),
        "pobreza": _fnum(r.get("% Incidencia de pobreza")),
    } for r in raw["barrios"]]
    locales = [{
        "zona": _safe(r.get("ZONA")), "barrio": _safe(r.get("BARLO_DESC")), "local": _safe(r.get("LOCAL 2026")),
        "lon": _fnum(r.get("LON LOCAL 2026")), "lat": _fnum(r.get("LAT LOCAL 2026")),
        "votos21": r.get("Votos Intendencia 2021"), "votos26": r.get("Votos Intendencia 2026"),
        "anr21": _fnum(r.get("% ANR 2021")), "anr26": _fnum(r.get("% ANR 2026")),
        "ja21": _fnum(r.get("% JA 2021")), "ja26": _fnum(r.get("% JA 2026")),
        "giro": _fnum(r.get("Cambio de margen (pp)")),
    } for r in raw["locales"]]
    zonas = [{
        "zona": _safe(r.get("ZONA")),
        "anr21": _fnum(r.get("% ANR 2021")), "anr26": _fnum(r.get("% ANR 2026")),
        "ja21": _fnum(r.get("% JA 2021")), "ja26": _fnum(r.get("% JA 2026")),
        "part21": _fnum(r.get("Participación 2021 %")), "part26": _fnum(r.get("Participación 2026 %")),
        "margen21": _fnum(r.get("Margen ANR-JA 2021 (pp)")), "margen26": _fnum(r.get("Margen ANR-JA 2026 (pp)")),
        "votos21": r.get("Votos Intendencia 2021"), "votos26": r.get("Votos Intendencia 2026"),
        "giro": _fnum(r.get("Cambio de margen (pp)")),
    } for r in raw["zonas"]]
    fuerzas = [{
        "sigla": _safe(r.get("SIGLA_2")),
        "p21": _fnum(r.get("% Votos Intendencia 2021")), "p26": _fnum(r.get("% Votos Intendencia 2026")),
    } for r in raw["fuerzas"]]

    order = []
    for r in raw["correlacion"]:
        for lab in (_safe(r.get("Variable Y")), _safe(r.get("Variable-X"))):
            if lab not in order:
                order.append(lab)
    idx = {v: i for i, v in enumerate(order)}
    n = len(order)
    mat = [[None] * n for _ in range(n)]
    for r in raw["correlacion"]:
        mat[idx[_safe(r.get("Variable Y"))]][idx[_safe(r.get("Variable-X"))]] = _fnum(r.get("Correlación Matriz Barrio"))

    data = {
        "meta": {
            "report": "Elecciones Intendencia Asunción 2026",
            "source": "TSJE 2021/2026 · INE censo 2022 (via app.powerbi.com public report)",
            "scraped_at": "2026-10-09",
            "counts": {"barrios": len(barrios), "locales": len(locales), "zonas": len(zonas),
                       "fuerzas": len(fuerzas), "vars": n},
        },
        "kpis": {
            "anr2021": _fnum(kpis.get("% ANR 2021")), "anr2026": _fnum(kpis.get("% ANR 2026")),
            "ja2021": _fnum(kpis.get("% JA 2021")), "ja2026": _fnum(kpis.get("% JA 2026")),
            "margen2021": _fnum(kpis.get("Margen ANR-JA 2021 (pp)")), "margen2026": _fnum(kpis.get("Margen ANR-JA 2026 (pp)")),
            "part2021": _fnum(kpis.get("Participación 2021 %")), "part2026": _fnum(kpis.get("Participación 2026 %")),
            "barriosJA2026": int(kpis.get("Barrios ganados por JA 2026") or 0),
            "votos2021": int(kpis.get("Votos Intendencia 2021") or 0),
            "votos2026": int(kpis.get("Votos Intendencia 2026") or 0),
        },
        "fuerzas": fuerzas, "zonas": zonas, "barrios": barrios, "locales": locales,
        "correlacion": {"vars": order, "m": mat},
        "narrativa": {
            "anr": _safe(narr.get("Detalle ANR")), "ja": _safe(narr.get("Detalle JA")),
            "margen": _safe(narr.get("Detalle margen")), "part": _safe(narr.get("Detalle participación")),
            "barriosJA": _safe(narr.get("Detalle barrios JA")),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[done] {OUT}  barrios={len(barrios)} locales={len(locales)} vars={n}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--headed", action="store_true", help="show the browser")
    return run(ap.parse_args().headed)


if __name__ == "__main__":
    sys.exit(main())
