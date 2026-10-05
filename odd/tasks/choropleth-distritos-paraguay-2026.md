# Feature: Choropleth of winning mayors — Paraguay municipal elections 2026

## Objective
Produce a basic data analysis of the 2026 Paraguayan municipal elections
(INTENDENTE MUNICIPAL) as a district-level choropleth: scrape who won (most
votes) in every district from the TSJE publication site, join the results to
the CNPV2022 district geometries, and render a map painted with the winning
party's official color.

## Problem
The TSJE result site is behind a Sucuri firewall and exposes results only
through an AJAX endpoint. The census GeoJSON (`DISTRITOS_PY_CNPV2022.geojson.txt`,
263 features) and the TSJE source use *different* department and district codes,
so a naive code join is wrong.

## Key discovered facts (evidence)
- Target: `https://resultados.tsje.gov.py/publicacion/divulgacion.html`
- Sucuri "Verify you're human" checkbox challenge is passable with Playwright:
  check the checkbox, click "Click to Proceed to Page". Verified working
  headless from Python (see `test_scrape.py`).
- Results API (same-origin, call via `page.evaluate(fetch)`):
  `/publicacion/dinamics/divulgacion.ajax.php?codeleccion=47&candidatura=1&departamento=<D>&distrito=<d>`
  - `codeleccion=47` = ELECCIONES MUNICIPALES 2026
  - `candidatura=1` = INTENDENTE MUNICIPAL
  - JSON: `{"totales": {...}, "candidatos":[{"numLista","nomCandidato","desPartido","colLista","votos",...}], ...}`
  - `colLista` is the party color as `"R,G,B"`.
- Department/district catalog (same origin):
  `/publicacion/statics/json/divulgacion/distritos.js` (var jsonDistritos)
  `/publicacion/statics/json/divulgacion/departamentos.js`
  - Structure: `jsonDistritos["47"]["1"][depCode][distCode] = "<code>-<NAME>"`.
- Department codes are PERMUTED between sources:
  - geojson `16 BOQUERON` == TSJE `16 ALTO PARAGUAY`
  - geojson `17 ALTO PARAGUAY` == TSJE `17 BOQUERON`
- District codes differ entirely (e.g. geojson Concepcion `02 BELEN` vs TSJE `1-BELEN`).
- District COUNTS match exactly per department: 263 geojson features == 263 TSJE
  (dept,dist) pairs. A per-department bijection by NAME exists.
- Name variants require normalization + aliases, e.g.:
  - Itapua: `MAYOR JULIO DIONISIO OTAÑO` ~ `MAYOR OTAÑO`
  - Canindeyu: `VILLA CURUGUATY` ~ `SAN ISIDRO CURUGUATY`; `YPEJHU` ~ `YPE JHU`;
    `LA PALOMA DEL ESPIRITU SANTO` ~ `LA PALOMA`; `YBYRAROBANA` ~ `YBYRAROVANA`
  - Misiones: `SAN JUAN BAUTISTA DE LAS MISIONES` ~ `SAN JUAN BAUTISTA`;
    `YABEBYRY` ~ `YAVEVYRY`
  - Abbreviations: GRAL->GENERAL, DR->DOCTOR, SGTO->SARGENTO, TTE->TENIENTE,
    MCAL->MARISCAL, PDTE/PTE->PRESIDENTE.

## Scope
In scope:
- Scrape INTENDENTE MUNICIPAL winners for all departments/districts.
- Save raw results (JSON) + normalized CSV.
- Join to geojson by normalized district name within department; validate the
  bijection and report any unmatched pair.
- Render a district choropleth colored by winning party + legend, plus a
  data table and an interactive HTML map.

Out of scope:
- JUNTA MUNICIPAL / any other candidacy.
- Historical elections or official certification.

## Constraints
- Python via `uv` (env already initialized: playwright, matplotlib, pandas).
- Color = winning party's `colLista`.
- Be polite to the site (small delay between requests, retries, single browser).
- No git repo here, so no work-unit commits; deliverables are files.

## Acceptance criteria
- `data/raw_results.json` contains one record per (departamento, distrito) with
  candidates and the computed winner.
- All 263 districts are matched to a geojson feature OR unmatched pairs are
  explicitly listed in a join report (target: 0 unmatched).
- `output/choropleth_intendentes_2026.png` renders all 263 polygons painted by
  winning party with a party legend.
- `output/distritos_intendentes_2026.geojson` + `output/resumen_partidos.csv` +
  interactive `output/mapa_intendentes_2026.html` exist and are non-empty.

## Tasks
- T1 — Scraper (`scrape.py`): Playwright, pass Sucuri, load catalog, iterate all
  (dept,dist), call API, compute winner (max `votos`), write `data/raw_results.json`.
  Check: `uv run python scrape.py` succeeds and JSON has ~263 records.
- T2 — Join + render (`make_choropleth.py`): normalize names, alias map, per-dept
  bijection, merge results into geojson, write joined geojson + CSV + PNG + HTML.
  Check: run script; 263/263 matched; outputs exist.
- T3 — Docs (`README.md`): how to run, data sources, join gotcha.

## Delivery
- Single deliverable set of files; no PR (not a git repository).
- Forecast authored lines: ~450 (scraper ~160, map ~220, docs ~70).
