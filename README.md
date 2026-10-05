# Intendentes PY 2026

Mapa coroplético de los **ganadores a intendente** en las elecciones municipales
de Paraguay 2026: se toma el portal preliminar del TSJE, se une cada distrito
con su polígono censal y se pinta cada uno de los **263 distritos** con el color
oficial del partido ganador.

| | |
| --- | --- |
| **Fuente electoral** | [resultados.tsje.gov.py](https://resultados.tsje.gov.py) — elección `47`, candidatura `1` (INTENDENTE MUNICIPAL) |
| **Fuente de polígonos** | `DISTRITOS_PY_CNPV2022.geojson.txt` (263 distritos, censo 2022) |
| **Resultado nacional** | PARTIDO COLORADO 187/263 (71.1%) · PLRA 34 (12.9%) · Yo Creo 3 · 39 alianzas locales con 1 c/u |

---

## 🚀 Inicio rápido (2 caminos)

### Camino A — solo quiero el mapa (sin scrapear, sin navegador)

El resultado ya scrapeado está versionado en `data/raw_results.json`. Alcanza
con Python + las librerías de render; **no necesitás Playwright**.

```powershell
uv sync --no-group scraper     # instala solo matplotlib + pandas + folium
uv run python make_choropleth.py
```

### Camino B — quiero volver a scrapear (actualizar resultados)

Necesitás Playwright porque el portal está detrás de un firewall **Sucuri** con
verificación humana; un `requests.get` normal recibe 403.

```powershell
uv sync                        # instala todo (incluye Playwright)
uv run playwright install chromium
uv run python scrape.py        # ~1-3 min, secuencial y respetuoso
uv run python make_choropleth.py
```

`make_choropleth.py` imprime un reporte de join y **sale con error si algún
distrito no matcheó** (esperado: `263/263`).

---

## 🧭 ¿Playwright es necesario?

**Depende para qué:**

| Tarea | ¿Playwright? | Por qué |
| --- | --- | --- |
| Generar el mapa desde `data/raw_results.json` | ❌ No | `make_choropleth.py` solo lee JSON + geojson y dibuja |
| Volver a scrapear el TSJE | ✅ Sí | Hay que pasar el challenge Sucuri y hacer 263 fetches same-origin |
| Cambiar de elección/candidatura | ✅ Sí | implicás volver a scrapear |

`scrape.py` **no trae los datos embebidos**: es el programa que los consigue.
Playwright es el motor que abre el navegador, pasa el firewall y ejecuta los
`fetch` con las cookies de la sesión.

---

## 📦 Qué genera

| Salida | Descripción |
| --- | --- |
| `output/choropleth_intendentes_2026.png` | Mapa estático (matplotlib) pintado por color del ganador + leyenda |
| `output/mapa_intendentes_2026.html` | Mapa interactivo (folium) con tooltip por distrito |
| `output/distritos_intendentes_2026.geojson` | Polígonos enriquecidos (ganador, votos, %, color, score de match) |
| `output/resumen_partidos.csv` | Distritos ganados por partido (conteo + %) |
| `data/raw_results.json` | Scrape crudo: candidatos, ganador y totales por distrito |

---

## 📁 Estructura del proyecto

```text
scrape.py                            Scraper Playwright        -> data/raw_results.json
make_choropleth.py                   Join + render             -> output/*
DISTRITOS_PY_CNPV2022.geojson.txt    Polígonos censales (input)
test_scrape.py                       Prueba mínima del challenge Sucuri + API
data/raw_results.json                Datos ya scrapeados (versionados)
output/                              Generado, git-ignored
pyproject.toml / uv.lock             Dependencias (uv)
```

---

## 🔧 Escalar / adaptar

### Cambiar de elección o candidatura

El portal es data-driven. Editá las dos constantes al inicio de `scrape.py`:

```python
ELECCION   = "47"   # 47 = ELECCIONES MUNICIPALES 2026
CANDIDATURA = "1"   # 1 = INTENDENTE MUNICIPAL (2 = JUNTA MUNICIPAL)
```

Los ids válidos salen del propio portal:

- `/publicacion/statics/json/divulgacion/elecciones.js`
- `/publicacion/statics/json/divulgacion/candidaturas.js`

El resto (distritos, departamentos, forma de la API) se lee dinámicamente, así
que el mismo pipeline sirve para otros cargos o elecciones futuras sin tocar el
código.

### Usar otro conjunto de polígonos

`make_choropleth.py` espera un `FeatureCollection` con las propiedades
`DPTO`, `DPTO_DESC`, `DISTRITO`, `DIST_DESC_`, `CLAVE`. Si cambiás la fuente,
ajustá el join por nombre en `make_choropleth.py`.

### Performance

El scrape es secuencial a propósito (~0.2 s entre requests, con reintento). 263
distritos tardan 1-3 minutos. Para volumen mayor, respetá el rate limit del
portal antes de paralelizar.

---

## ⚠️ Gotchas que hay que conocer

1. **Los códigos de departamento están permutados** entre las dos fuentes. En el
   geojson censal `16 = BOQUERON` y `17 = ALTO PARAGUAY`, pero en el TSJE es al
   revés. Unir por código intercambia dos departamentos enteros — el mapeo
   explícito está en `tsje_dep_to_geo()`.
2. **Los códigos de distrito NO coinciden** (geojson `02 BELEN` vs TSJE
   `1-BELEN`), así que los distritos se unen **por nombre**, nunca por código.
3. **Variantes de nombre** se resuelven con normalización de acentos, limpieza
   de puntuación, abreviaturas (`GRAL → GENERAL`, `DR → DOCTOR`, `PTO → PUERTO`,
   …), un mapa de alias y asignación 1:1 por mejor score dentro de cada
   departamento. Los conteos por departamento son una biyección exacta (263 = 263).
4. **Corrupción en la fuente:** el geojson censal guarda la `Ñ` como `??` literal
   en dos nombres (`MAYOR JULIO DIONISIO OTA??O`, `DR. RAUL PE?A`); el alias
   lleva la forma corrupta tal cual.
5. **Challenge Sucuri:** el control "Verify you're human" es un
   `<div role="checkbox">` custom (`cap-widget`) cuyo `aria-checked` nunca
   cambia; `.check()` de Playwright falla. El scraper usa `.click()` + reintentos.

---

## 📝 Notas

- El portal a veces devuelve una variante "Access Denied"; el loop de reintentos
  la absorbe.
- Dos distritos reportan ganador con 0 votos: refleja el payload de origen (todos
  los candidatos en 0), no un bug de parseo.
- `resumen_partidos.csv` está en UTF-8 **sin BOM**, así que Excel puede mostrar
  mal las `Ñ`. Usá un editor que respete UTF-8, o re-guardá con BOM.

## Licencia

Los datos pertenecen al TSJE (resultados) y al censo 2022 (polígonos). El código
de este repositorio se ofrece tal cual, con fines analíticos.
