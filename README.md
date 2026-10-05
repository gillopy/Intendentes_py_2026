# Intendentes PY 2026

Choropleth of the **2026 Paraguayan municipal-election mayoral winners**
(`INTENDENTE MUNICIPAL`): scrape the official TSJE preliminary-results portal,
join the results to the 2022 census district polygons, and paint every one of
the 263 districts with the winning party's official color.

## What it produces

| Output | Description |
| --- | --- |
| `output/choropleth_intendentes_2026.png` | Static choropleth (matplotlib), districts painted by winner color + legend |
| `output/mapa_intendentes_2026.html` | Interactive map (folium) with per-district tooltips |
| `output/distritos_intendentes_2026.geojson` | Census polygons enriched with the winner, votes, %, color and match score |
| `output/resumen_partidos.csv` | Districts won per party (count + share) |
| `data/raw_results.json` | Raw scrape: candidates, winner and totals per district |

## Requirements

- [uv](https://docs.astral.sh/uv/) (manages Python and dependencies)
- Python 3.13+ (uv fetches it if missing)

## Quick start

```powershell
# 1. Install Python + dependencies (creates .venv automatically)
uv sync

# 2. Install the browser used by the scraper (once)
uv run playwright install chromium

# 3. Scrape all districts (polite, sequential: ~1-3 min)
uv run python scrape.py

# 4. Join the results to the polygons and render the maps
uv run python make_choropleth.py
```

`make_choropleth.py` prints a join report and exits non-zero unless all
263 districts matched.

### Change the election / candidacy (scalability)

The portal is data-driven. To scrape something other than the 2026 mayors,
edit the two constants at the top of `scrape.py`:

```python
ELECCION = "47"       # election id   (47 = ELECCIONES MUNICIPALES 2026)
CANDIDATURA = "1"     # candidacy id  (1 = INTENDENTE MUNICIPAL)
```

Discover valid ids from the page itself:

- `/publicacion/statics/json/divulgacion/elecciones.js` — available elections
- `/publicacion/statics/json/divulgacion/candidaturas.js` — candidacies per election

Everything else (districts, departments, API shape) is read dynamically, so the
same pipeline works for `JUNTA MUNICIPAL` or for future elections without code
changes.

## Data sources

- **Results portal** — <https://resultados.tsje.gov.py>
  - Page: `/publicacion/divulgacion.html`
  - Results API (same-origin, called from the page to reuse cookies):
    `/publicacion/dinamics/divulgacion.ajax.php?codeleccion=<E>&candidatura=<C>&departamento=<D>&distrito=<d>`
  - Catalogs: `/publicacion/statics/json/divulgacion/{distritos,departamentos}.js`
  - Party color is the API field `colLista` (`"R,G,B"`).
- **Polygons** — `DISTRITOS_PY_CNPV2022.geojson.txt` (263 census districts).
  Properties: `DPTO`, `DPTO_DESC`, `DISTRITO`, `DIST_DESC_`, `CLAVE`.
  Source: 2022 census districts of Paraguay (CNPV2022).

## How it works

1. `scrape.py` — Playwright (headless, `es-PY`) opens the page and passes the
   **Sucuri** human-verification interstitial, then reads the district catalog
   and requests the per-district results API for all 18 departments / 263
   districts. Requests are sequential, ~0.2 s apart, with one retry each.
2. `make_choropleth.py` — joins the scrape to the polygons **by name** and
   renders the static and interactive maps plus the summary CSV.

## Gotchas handled (important for anyone forking this)

1. **Department codes are swapped between the two sources.** In the census
   GeoJSON `16 = BOQUERON` and `17 = ALTO PARAGUAY`, but on the TSJE portal
   `16 = ALTO PARAGUAY` and `17 = BOQUERON`. Joining by code silently swaps two
   whole departments — the mapping is explicit in `tsje_dep_to_geo()`.
2. **District codes differ entirely** (e.g. GeoJSON `02 BELEN` vs TSJE
   `1-BELEN`), so districts are joined by **name**, never by code.
3. **Name variants** are resolved with accent stripping, punctuation removal, a
   token-abbreviation map (`GRAL → GENERAL`, `DR → DOCTOR`, `PTO → PUERTO`, …),
   an explicit alias map, and greedy best-score 1:1 assignment per department.
   The per-department counts are an exact bijection (263 = 263).
4. **Source corruption:** the census GeoJSON stores `Ñ` as literal `??` in two
   names (`MAYOR JULIO DIONISIO OTA??O`, `DR. RAUL PE?A`), so the alias carries
   the corrupted form verbatim.
5. **Sucuri challenge:** the "Verify you're human" control is a custom
   `cap-widget` `<div role="checkbox">`; its `aria-checked` never flips, so
   Playwright's `.check()` fails. The scraper uses `.click()` plus a retry loop.

## Project layout

```text
scrape.py                            Playwright scraper -> data/raw_results.json
make_choropleth.py                   join + render       -> output/*
DISTRITOS_PY_CNPV2022.geojson.txt    census district polygons (input)
test_scrape.py                       minimal Sucuri/API feasibility probe
pyproject.toml / uv.lock             dependencies (uv)
data/ , output/                      generated, git-ignored
```

## Notes

- Network access is required; the portal sits behind a firewall that
  occasionally returns an "Access Denied" variant — the retry loop absorbs it.
- Two districts report a winner with 0 votes: this reflects the source payload
  (all candidates at 0), not a parsing error.
- `resumen_partidos.csv` is UTF-8 **without** a BOM, so Excel may mis-render
  `Ñ`. Use an editor that honours UTF-8, or re-save with a BOM if you need
  Excel compatibility.

## License

Data belongs to the TSJE (results) and the 2022 census (polygons). Code in this
repository is provided as-is for analysis purposes.
