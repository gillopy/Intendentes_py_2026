"""Scrape the 2026 Paraguayan municipal election (INTENDENTE MUNICIPAL) winners.

Target: https://resultados.tsje.gov.py
Reads the official district catalog, requests the per-district results API for
every (departamento, distrito) pair and writes data/raw_results.json.

The site is protected by a Sucuri "Verify you're human" interstitial. We pass it
once, then reuse the browser cookies by issuing same-origin fetch() calls from
the page context.
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import time
from typing import Any

from playwright.sync_api import Page, sync_playwright

BASE = "https://resultados.tsje.gov.py"
PAGE_URL = f"{BASE}/publicacion/divulgacion.html"
DISTRITOS_JS = f"{BASE}/publicacion/statics/json/divulgacion/distritos.js"
DEPARTAMENTOS_JS = f"{BASE}/publicacion/statics/json/divulgacion/departamentos.js"

ELECCION = "47"  # ELECCIONES MUNICIPALES 2026
CANDIDATURA = "1"  # INTENDENTE MUNICIPAL

API = (
    "/publicacion/dinamics/divulgacion.ajax.php"
    "?codeleccion={eleccion}&candidatura={candidatura}"
    "&departamento={departamento}&distrito={distrito}"
)

OUT_PATH = pathlib.Path("data/raw_results.json")
DELAY_SECONDS = 0.2
REQUEST_TIMEOUT_MS = 45_000


def fetch_text(page: Page, url: str) -> str:
    """Same-origin fetch that reuses the page cookies (bypasses Sucuri per request)."""
    return page.evaluate(
        """async (u) => {
            const r = await fetch(u, { credentials: 'same-origin' });
            return await r.text();
        }""",
        url,
    )


def _looks_blocked(page: Page) -> bool:
    title = (page.title() or "").lower()
    return "sucuri" in title or "access denied" in title or "firewall" in title


def solve_challenge(page: Page) -> None:
    """Best-effort solve of the Sucuri challenge page currently loaded.

    The widget is a custom `cap-widget` <div role=checkbox>; a real click fires
    its onclick handler (capSolve). Using .check() fails because aria-checked is
    never flipped, so we click and then press the proceed button.
    """
    checkbox = page.get_by_role("checkbox", name="Verify you're human")
    if checkbox.count() > 0:
        try:
            checkbox.click()
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] human checkbox click: {exc!r}")
        page.wait_for_timeout(1500)

    button = page.get_by_role("button", name="Click to Proceed to Page")
    if button.count() > 0:
        try:
            button.click()
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] proceed button click: {exc!r}")
        page.wait_for_timeout(6000)


def pass_sucuri(page: Page) -> None:
    """Load the results page, passing the Sucuri interstitial if it appears."""
    for attempt in range(1, 5):
        page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=REQUEST_TIMEOUT_MS)
        page.wait_for_timeout(3000)
        if not _looks_blocked(page):
            print(f"[info] page title: {page.title()}")
            return
        print(f"[warn] blocked (attempt {attempt}): {page.title()}")
        solve_challenge(page)
        if not _looks_blocked(page):
            print(f"[info] page title: {page.title()}")
            return
    print(f"[warn] still blocked after retries: {page.title()}")


def parse_js_var(text: str, varname: str) -> Any:
    """Parse `var <varname> = {...};` payloads into Python objects."""
    body = text.split("=", 1)[1].strip().rstrip(";").strip()
    return json.loads(body)


def strip_code(name: str) -> str:
    """Turn '41-OBLIGADO' into 'OBLIGADO'."""
    if "-" in name:
        head, _, tail = name.partition("-")
        if head.strip().isdigit():
            return tail.strip()
    return name.strip()


def load_catalog(page: Page) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    distritos_raw = fetch_text(page, DISTRITOS_JS)
    deptos_raw = fetch_text(page, DEPARTAMENTOS_JS)
    distritos = parse_js_var(distritos_raw, "jsonDistritos")[ELECCION][CANDIDATURA]
    departamentos = parse_js_var(deptos_raw, "jsonDepartamentos")[ELECCION][CANDIDATURA]
    return distritos, departamentos


def get_district_result(page: Page, dep: str, dist: str) -> dict[str, Any] | None:
    url = API.format(
        eleccion=ELECCION,
        candidatura=CANDIDATURA,
        departamento=dep,
        distrito=dist,
    )
    last_error: Exception | None = None
    for attempt in range(2):  # one initial try + one retry
        try:
            raw = fetch_text(page, url)
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError(f"unexpected payload type: {type(data)!r}")
            return data
        except Exception as exc:  # noqa: BLE001 - retry on any transient failure
            last_error = exc
            if attempt == 0:
                time.sleep(0.5)
    print(f"[warn] failed dep={dep} dist={dist}: {last_error!r}")
    return None


def pick_winner(candidatos: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if not candidatos:
        return None
    return max(candidatos, key=lambda c: c.get("votos") or 0)


def summarize(candidatos: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in candidatos or []:
        out.append(
            {
                "numLista": c.get("numLista"),
                "nomCandidato": c.get("nomCandidato"),
                "desPartido": c.get("desPartido"),
                "colLista": c.get("colLista"),
                "votos": c.get("votos"),
            }
        )
    return out


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, Any]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(locale="es-PY")
        page = context.new_page()
        pass_sucuri(page)

        distritos, departamentos = load_catalog(page)
        total_pairs = sum(len(v) for v in distritos.values())
        print(f"[info] catalog loaded: {len(distritos)} departments, {total_pairs} districts")

        done = 0
        for dep in sorted(distritos.keys(), key=int):
            dep_districts = distritos[dep]
            dep_name = strip_code(departamentos.get(dep, dep))
            for dist in sorted(dep_districts.keys(), key=int):
                dist_name = strip_code(dep_districts[dist])
                data = get_district_result(page, dep, dist)
                if data is None:
                    data = {"totales": None, "candidatos": None}

                candidatos = data.get("candidatos")
                records.append(
                    {
                        "departamento_code": dep,
                        "departamento_name": dep_name,
                        "distrito_code": dist,
                        "distrito_name": dist_name,
                        "candidatos": summarize(candidatos),
                        "winner": pick_winner(candidatos),
                        "totales": data.get("totales"),
                    }
                )
                done += 1
                if done % 25 == 0 or done == total_pairs:
                    print(f"[info] fetched {done}/{total_pairs}")
                time.sleep(DELAY_SECONDS)

        browser.close()

    scraped_at = dt.datetime.now(dt.timezone.utc).isoformat()
    payload = {"scraped_at": scraped_at, "count": len(records), "records": records}
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    no_candidates = sum(1 for r in records if not r["candidatos"])
    with_winner = sum(1 for r in records if r["winner"])
    print("[summary] ------------------------------------------")
    print(f"[summary] total records : {len(records)}")
    print(f"[summary] no candidates : {no_candidates}")
    print(f"[summary] with winner   : {with_winner}")
    print(f"[summary] wrote         : {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
