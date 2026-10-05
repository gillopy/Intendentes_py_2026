from playwright.sync_api import sync_playwright

URL = "https://resultados.tsje.gov.py/publicacion/divulgacion.html"
API = "/publicacion/dinamics/divulgacion.ajax.php?codeleccion=47&candidatura=1&departamento=0&distrito=0"


def main(headless=True):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(locale="es-PY")
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        print("TITLE:", page.title())
        try:
            cb = page.get_by_role("checkbox", name="Verify you're human")
            if cb.count() > 0:
                cb.check()
                page.get_by_role("button", name="Click to Proceed to Page").click()
                page.wait_for_timeout(6000)
                print("AFTER CHALLENGE:", page.title())
        except Exception as e:  # noqa: BLE001
            print("challenge handling:", repr(e))
        data = page.evaluate(
            """async (api) => {
                const r = await fetch(api);
                return await r.text();
            }""",
            API,
        )
        print("API:", data[:400])
        browser.close()


if __name__ == "__main__":
    import sys

    hl = "--headed" not in sys.argv
    print("headless =", hl)
    main(headless=hl)
