"""Join the scraped 2026 intendente results to the census districts and render maps.

Inputs:
  data/raw_results.json                (from scrape.py)
  DISTRITOS_PY_CNPV2022.geojson.txt    (263 census districts)

Outputs (output/):
  distritos_intendentes_2026.geojson   census polygons enriched with winner props
  resumen_partidos.csv                 districts won per party
  choropleth_intendentes_2026.png      static choropleth (matplotlib)
  mapa_intendentes_2026.html           interactive folium map

Two source mismatches are handled explicitly:
  * Department codes are swapped: TSJE 16=ALTO PARAGUAY <-> geojson 17; TSJE
    17=BOQUERON <-> geojson 16. All other codes map identity (zero-padded).
  * District codes differ entirely, so districts are joined by NAME using
    normalization + an alias map + greedy best-score assignment (the per
    department counts are a perfect 1:1 bijection).
"""

from __future__ import annotations

import difflib
import json
import pathlib
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone

import folium
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.patches import Patch
import pandas as pd

RAW_PATH = pathlib.Path("data/raw_results.json")
# The census file is tracked as "DISTRITOS_PY_CNPV2022.geojson"; older checkouts
# may still have the ".geojson.txt" name, so accept either.
GEOJSON_CANDIDATES = (
    "DISTRITOS_PY_CNPV2022.geojson",
    "DISTRITOS_PY_CNPV2022.geojson.txt",
)


def resolve_geojson_path() -> pathlib.Path:
    for candidate in GEOJSON_CANDIDATES:
        path = pathlib.Path(candidate)
        if path.exists():
            return path
    raise FileNotFoundError(
        "census geojson not found; expected one of: " + ", ".join(GEOJSON_CANDIDATES)
    )
OUT_DIR = pathlib.Path("output")

MATCH_THRESHOLD = 0.60
DEFAULT_COLOR = "#BDBDBD"

# Token abbreviations applied to both sides before scoring.
ABBR = {
    "GRAL": "GENERAL",
    "DR": "DOCTOR",
    "SGTO": "SARGENTO",
    "TTE": "TENIENTE",
    "MCAL": "MARISCAL",
    "PDTE": "PRESIDENTE",
    "PTE": "PRESIDENTE",
    "1RO": "PRIMERO",
    "CNEL": "CORONEL",
    "CNL": "CORONEL",
    "STA": "SANTA",
    "STO": "SANTO",
    "ING": "INGENIERO",
    "PTO": "PUERTO",
    "CAP": "CAPITAN",
}

# Department-specific name aliases (raw TSJE name -> raw geojson name). Keyed by
# the geojson DPTO code. Generic scoring already resolves many variants; these
# pin the ambiguous ones.
ALIASES_RAW = {
    # NOTE: the geojson stores "Ñ" as two literal '?' in this name (source
    # corruption), so the target below carries the corrupted form verbatim.
    "07": [("MAYOR OTAÑO", "MAYOR JULIO DIONISIO OTA??O")],
    "14": [
        ("SAN ISIDRO CURUGUATY", "VILLA CURUGUATY"),
        ("YPE JHU", "YPEJHU"),
        ("LA PALOMA", "LA PALOMA DEL ESPIRITU SANTO"),
        ("YBYRAROVANA", "YBYRAROBANA"),
        ("YASY CAÑY", "YASY KAÑY"),
    ],
    "08": [
        ("SAN JUAN BAUTISTA", "SAN JUAN BAUTISTA DE LAS MISIONES"),
        ("YAVEVYRY", "YABEBYRY"),
    ],
    "09": [
        ("GRAL. BERNARDINO CABALLERO", "CABALLERO"),
        ("SAN ROQUE GONZALEZ", "ROQUE GONZALEZ DE SANTA CRUZ"),
    ],
    "15": [
        ("FORTIN JOSE FALCON", "JOSE FALCON"),
        ("GRAL. JOSE M. BRUGUEZ", "GENERAL JOSE MARIA BRUGUEZ"),
    ],
    "12": [("SAN JUAN BAUTISTA", "SAN JUAN BAUTISTA DE ÑEEMBUCU")],
    "04": [
        ("GRAL. E. A. GARAY", "GRAL. EUGENIO A. GARAY"),
        ("DR. BOTRELL", "DOCTOR BOTTRELL"),
        ("INDEPENDENCIA", "COLONIA INDEPENDENCIA"),
    ],
    "05": [("FRANCISCO SOLANO LOPEZ", "MARISCAL FRANCISCO SOLANO LOPEZ")],
    "06": [
        ("GRAL. MORINIGO", "GRAL. HIGINIO MORINIGO"),
        ("FULGENCIO YEGROS", "YEGROS"),
    ],
}


def tsje_dep_to_geo(code: str) -> str:
    """Map a TSJE department code to the geojson DPTO code (16/17 swapped)."""
    n = int(code)
    if n == 16:
        return "17"
    if n == 17:
        return "16"
    return f"{n:02d}"


def normalize(name: str) -> str:
    """Normalize a district/department name for fuzzy matching."""
    # strip a leading numeric code such as "41-"
    if "-" in name:
        head, _, tail = name.partition("-")
        if head.strip().isdigit():
            name = tail
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    ascii_only = ascii_only.upper()
    cleaned = "".join(ch if ch.isalnum() else " " for ch in ascii_only)
    tokens = []
    for token in cleaned.split():
        if len(token) == 1:
            continue  # drop single-letter noise such as "M." / "E."
        tokens.append(ABBR.get(token, token))
    return " ".join(tokens)


def build_aliases() -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for dep, pairs in ALIASES_RAW.items():
        for tsje_name, geo_name in pairs:
            out[(dep, normalize(tsje_name))] = normalize(geo_name)
    return out


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    sa, sb = set(a.split()), set(b.split())
    inter = len(sa & sb)
    union = len(sa | sb)
    jaccard = inter / union if union else 0.0
    containment = inter / min(len(sa), len(sb)) if inter else 0.0
    sequence = difflib.SequenceMatcher(None, a, b).ratio()
    return max(jaccard, containment, sequence)


def match_department(geo_list, tsje_list, aliases, dep_code):
    """Greedy best-score 1:1 assignment. Returns (assignments, unmatched_geo, unmatched_tsje).

    geo_list:  list of (global_idx, feature, normalized_name)
    tsje_list: list of (record, normalized_name)
    assignments: list of (global_idx, record, score)
    """
    n_geo, n_tsje = len(geo_list), len(tsje_list)

    score_matrix = [[similarity(tn, gn) for (_, _, gn) in geo_list] for (_, tn) in tsje_list]

    # Override with explicit aliases.
    for ti, (_, tn) in enumerate(tsje_list):
        target = aliases.get((dep_code, tn))
        if not target:
            continue
        for gi, (_, _, gn) in enumerate(geo_list):
            if gn == target:
                score_matrix[ti][gi] = 1.0

    pairs = []
    for ti in range(n_tsje):
        for gi in range(n_geo):
            s = score_matrix[ti][gi]
            if s >= MATCH_THRESHOLD:
                pairs.append((s, ti, gi))
    pairs.sort(key=lambda x: (-x[0], x[1], x[2]))

    used_geo = [False] * n_geo
    used_tsje = [False] * n_tsje
    assignments = []
    for s, ti, gi in pairs:
        if used_tsje[ti] or used_geo[gi]:
            continue
        used_tsje[ti] = used_geo[gi] = True
        assignments.append((geo_list[gi][0], tsje_list[ti][0], s))

    unmatched_geo = [geo_list[gi] for gi in range(n_geo) if not used_geo[gi]]
    unmatched_tsje = [tsje_list[ti] for ti in range(n_tsje) if not used_tsje[ti]]
    return assignments, unmatched_geo, unmatched_tsje


def color_to_hex(col: str | None) -> str:
    if not col:
        return DEFAULT_COLOR
    parts = col.split(",")
    if len(parts) != 3:
        return DEFAULT_COLOR
    try:
        r, g, b = (max(0, min(255, int(p))) for p in parts)
    except ValueError:
        return DEFAULT_COLOR
    return f"#{r:02X}{g:02X}{b:02X}"


def build_feature_collection(records, features):
    aliases = build_aliases()

    geo_by_dep = defaultdict(list)
    for gi, feat in enumerate(features):
        props = feat["properties"]
        geo_by_dep[props["DPTO"]].append((gi, feat, normalize(props["DIST_DESC_"])))

    tsje_by_dep = defaultdict(list)
    for rec in records:
        tsje_by_dep[tsje_dep_to_geo(rec["departamento_code"])].append(
            (rec, normalize(rec["distrito_name"]))
        )

    enriched: dict[int, dict] = {}
    match_scores: dict[int, float] = {}
    unmatched_geo = []
    unmatched_tsje = []

    for dep_code, geo_list in geo_by_dep.items():
        tsje_list = tsje_by_dep.get(dep_code, [])
        assignments, u_geo, u_tsje = match_department(geo_list, tsje_list, aliases, dep_code)
        for global_idx, rec, score in assignments:
            enriched[global_idx] = rec
            match_scores[global_idx] = score
        unmatched_geo.extend((dep_code, feat["properties"]) for _, feat, _ in u_geo)
        unmatched_tsje.extend((dep_code, rec) for rec, _ in u_tsje)

    # Departments present on one side only (should not happen with 1:1 counts).
    for dep_code, lst in geo_by_dep.items():
        if dep_code not in tsje_by_dep:
            unmatched_geo.extend((dep_code, f["properties"]) for _, f, _ in lst)
    for dep_code, lst in tsje_by_dep.items():
        if dep_code not in geo_by_dep:
            unmatched_tsje.extend((dep_code, r) for r, _ in lst)

    rows = []
    out_features = []
    for gi, feat in enumerate(features):
        props = dict(feat["properties"])
        rec = enriched.get(gi)
        if rec is None:
            props.update(
                {
                    "winner_party": None,
                    "winner_candidate": None,
                    "winner_votes": None,
                    "winner_color_hex": DEFAULT_COLOR,
                    "winner_pct": None,
                    "margin_votes": None,
                    "margin_pct": None,
                    "match_score": None,
                }
            )
        else:
            cands = sorted(rec["candidatos"], key=lambda c: c.get("votos") or 0, reverse=True)
            winner = cands[0] if cands else None
            total = sum(c.get("votos") or 0 for c in cands)
            runner = cands[1] if len(cands) > 1 else None
            wv = (winner or {}).get("votos") or 0
            rv = (runner or {}).get("votos") or 0
            props.update(
                {
                    "winner_party": (winner or {}).get("desPartido"),
                    "winner_candidate": (winner or {}).get("nomCandidato"),
                    "winner_votes": wv,
                    "winner_color_hex": color_to_hex((winner or {}).get("colLista")),
                    "winner_pct": round(wv / total * 100, 2) if total else None,
                    "margin_votes": wv - rv,
                    "margin_pct": round((wv - rv) / total * 100, 2) if total else None,
                    "match_score": round(match_scores.get(gi, 0.0), 3),
                    "tsje_departamento": rec["departamento_name"],
                    "tsje_distrito": rec["distrito_name"],
                }
            )
            rows.append(
                {
                    "departamento": props["DPTO_DESC"],
                    "distrito": props["DIST_DESC_"],
                    "partido": props["winner_party"],
                    "candidato": props["winner_candidate"],
                    "votos": props["winner_votes"],
                    "color_hex": props["winner_color_hex"],
                    "pct": props["winner_pct"],
                    "match_score": props["match_score"],
                }
            )
        out_features.append({"type": "Feature", "geometry": feat["geometry"], "properties": props})

    collection = {"type": "FeatureCollection", "features": out_features}
    return collection, rows, unmatched_geo, unmatched_tsje


def render_png(collection, out_path, subtitle=None):
    by_color = defaultdict(list)
    parties = {}
    xs, ys = [], []
    for feat in collection["features"]:
        color = feat["properties"]["winner_color_hex"]
        party = feat["properties"]["winner_party"]
        if party:
            parties[party] = color
        geom = feat["geometry"]
        polygons = geom["coordinates"]
        for poly in polygons:
            if not poly:
                continue
            ring = poly[0]  # exterior ring
            arr = [(pt[0], pt[1]) for pt in ring]
            by_color[color].append(arr)
            for x, y in arr:
                xs.append(x)
                ys.append(y)

    fig, ax = plt.subplots(figsize=(9, 12))
    for color, polys in by_color.items():
        ax.add_collection(
            PolyCollection(polys, facecolor=color, edgecolor="white", linewidth=0.15)
        )
    ax.set_xlim(min(xs), max(xs))
    ax.set_ylim(min(ys), max(ys))
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Intendentes ganadores 2026 - Paraguay", fontsize=14, fontweight="bold")

    legend_parties = sorted(parties.items(), key=lambda kv: kv[0])
    handles = [Patch(facecolor=c, edgecolor="white", label=p) for p, c in legend_parties]
    ax.legend(
        handles=handles,
        loc="lower left",
        fontsize=5.5,
        frameon=True,
        title="Partido / Alianza",
        title_fontsize=7,
        ncol=1,
    )
    fig.tight_layout()
    if subtitle:
        fig.text(0.5, 0.02, subtitle, ha="center", va="bottom", fontsize=8, color="#666666")
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def render_html(collection, out_path):
    fmap = folium.Map(location=[-23.4, -58.4], zoom_start=6, tiles="CartoDB positron")

    def style(feature):
        color = feature["properties"].get("winner_color_hex") or DEFAULT_COLOR
        return {"fillColor": color, "color": "#333333", "weight": 0.4, "fillOpacity": 0.8}

    folium.GeoJson(
        collection,
        name="Intendentes 2026",
        style_function=style,
        tooltip=folium.GeoJsonTooltip(
            fields=[
                "DIST_DESC_",
                "DPTO_DESC",
                "winner_party",
                "winner_candidate",
                "winner_votes",
                "winner_pct",
            ],
            aliases=[
                "Distrito",
                "Departamento",
                "Partido ganador",
                "Intendente electo",
                "Votos",
                "% votos validos",
            ],
            localize=True,
        ),
    ).add_to(fmap)
    folium.LayerControl().add_to(fmap)
    fmap.save(str(out_path))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    records = raw["records"]
    geo = json.loads(resolve_geojson_path().read_text(encoding="utf-8"))
    features = geo["features"]

    collection, rows, unmatched_geo, unmatched_tsje = build_feature_collection(records, features)

    OUT_DIR.joinpath("distritos_intendentes_2026.geojson").write_text(
        json.dumps(collection, ensure_ascii=False), encoding="utf-8"
    )

    df = pd.DataFrame(rows)
    summary = (
        df.groupby("partido")
        .size()
        .reset_index(name="distritos_ganados")
        .sort_values(["distritos_ganados", "partido"], ascending=[False, True])
    )
    summary["share"] = (summary["distritos_ganados"] / len(df) * 100).round(2)
    summary.to_csv(OUT_DIR / "resumen_partidos.csv", index=False, encoding="utf-8")

    scraped = raw.get("scraped_at")
    subtitle = None
    if scraped:
        try:
            ts = datetime.fromisoformat(scraped).astimezone(timezone.utc)
            subtitle = f"Datos TSJE al {ts:%Y-%m-%d %H:%M} UTC"
        except ValueError:
            subtitle = f"Datos TSJE: {scraped}"
    render_png(collection, OUT_DIR / "choropleth_intendentes_2026.png", subtitle=subtitle)
    render_html(collection, OUT_DIR / "mapa_intendentes_2026.html")

    matched = len(df)
    total = len(features)
    print("[join] ==============================================")
    print(f"[join] matched {matched}/{total}")
    print(f"[join] unmatched TSJE districts      : {len(unmatched_tsje)}")
    for dep, rec in unmatched_tsje:
        print(f"[join]   TSJE  dep={dep} {rec['departamento_name']} / {rec['distrito_name']}")
    print(f"[join] unmatched geojson features    : {len(unmatched_geo)}")
    for dep, props in unmatched_geo:
        print(f"[join]   GEO   dpto={dep} {props['DPTO_DESC']} / {props['DIST_DESC_']}")

    low = df[df["match_score"] < 0.99].sort_values("match_score")
    print(f"[join] non-exact matches (<0.99): {len(low)}")
    for _, r in low.iterrows():
        print(
            f"[join]   {r['match_score']:.3f}  {r['departamento']}: "
            f"{r['distrito']}  <-  {r['partido']}"
        )
    print(f"[join] parties with wins: {summary.shape[0]}")

    if matched != total:
        print("[join] EXIT NON-ZERO: not all districts matched")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
