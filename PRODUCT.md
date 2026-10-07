# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The general public in Paraguay, mostly on mobile, after the 2026 municipal elections.
They want one thing answered fast: **who won in my municipality**, and who governs the
country overall. Secondary audiences: journalists and curious citizens scanning the
national picture for a story or a share.

## Product Purpose

Turn the official TSJE 2026 municipal-election results into a fast, legible, public
explainer: an interactive district choropleth plus national and per-department summaries.
Success means a visitor understands the national outcome and finds their own municipality
within seconds, on a phone, without waiting.

## Positioning

Official winner data (TSJE election 47, candidatura 1) joined to CNPV2022 census districts
— a complete 263/263 national map, presented as an editorial data graphic rather than a raw
map embed. The incumbent output was a 103 MB folium HTML; the redesign is a small,
dependency-free static site.

## Operating Context

Static hosting on GitHub Pages; also opened directly from disk. Shared links and
screenshots travel through social feeds and chat. Read on phones and laptops. The data is a
fixed snapshot (`data/raw_results.json`, scraped_at 2026-10-06T01:16:52Z); there are no live
updates.

## Capabilities and Constraints

- 263 districts across 18 departments (17 departments + Capital / Asunción).
- Winners are grouped for the public into four categories: **Partido Colorado (ANR)**,
  **PLRA**, **Yo Creo**, and **"Alianzas y otros"** (all local alliances and minor parties).
- Required views: district choropleth; national unit grid (one square per municipality);
  national donut with legend (acronym, party, count, percentage); per-department
  100%-stacked bars showing the share of districts each category won.
- Performance constraint: the previous folium output embedded ~44 MB of raw census geometry
  into a ~103 MB HTML file. The site must load small and fast; geometry is simplified and
  the site ships with no JS framework, no bundler, and no runtime dependency.
- Color truth: party colors come from the source `colLista` — ANR `#FF0000`,
  PLRA `#002BC7`, Yo Creo `#FFA760`; "Alianzas y otros" uses a neutral gray.
- Content language: Spanish (es-PY).

## Brand Commitments

No logo or brand system exists. The identifiers "Intendentes PY 2026" and the source
attribution (TSJE / CNPV2022) are the only fixed names. The user supplied a reference
design (unit grid + donut + legend) that pins the visual direction: editorial
data-journalism.

## Evidence on Hand

- `data/raw_results.json` — scraped candidates, winner and totals per district (263 records).
- `DISTRITOS_PY_CNPV2022.geojson` — 263 census district polygons (44 MB, unsimplified).
- `output/resumen_partidos.csv` — districts won per party (43 rows).
- `output/choropleth_intendentes_2026.png` — static matplotlib map, embedded in the README.
- User reference design: a unit grid of 263 squares + donut + legend.

## Product Principles

1. **The answer first** — a visitor should know the national outcome and find their
   municipality within seconds.
2. **Truth over decoration** — colors and figures come from the official source; nothing is
   invented or embellished.
3. **Legible to anyone** — group the 40+ parties into four readable categories; keep the
   exact party and candidate available on demand.
4. **Fast by construction** — simplified geometry, a dependency-free static site, and a
   build that stays under a megabyte.
5. **Built to be shared** — works on a phone, screenshots well, and reads as an editorial
   graphic rather than a raw map embed.

## Accessibility & Inclusion

Public-interest content: WCAG AA contrast for text, keyboard-operable interactions, and no
reliance on color alone — every color-coded value carries a text label (acronym, party,
count, percentage).
