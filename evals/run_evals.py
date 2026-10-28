"""Golden evals del evaluador de simulaciones.

Pasa transcripciones JSON por el evaluador REAL de la app y guarda el puntaje por criterio en CSV.
No duplica lógica: cada evaluación la hace evals/puente.mjs con el prompt de public/js/prompts.js,
el servidor (POST /api/messages, con su cadena de proveedores) y el puntaje de public/js/core.js.

Uso:
    python evals/run_evals.py                          # todas las de evals/transcripciones, 1 vez cada una
    python evals/run_evals.py -n 5                     # cada una 5 veces, para medir la variación
    python evals/run_evals.py evals/transcripciones/02_mediocre.json -n 3
    python evals/run_evals.py --url http://localhost:3100
    python evals/run_evals.py --levantar-servidor      # arranca su propia copia del servidor (no toca data/)

Cada corrida hace una llamada real a la IA (gasta cuota). Salida en evals/resultados/AAAAMMDD-HHMMSS/:
    corridas.csv   una fila por corrida: total y una columna por criterio
    criterios.csv  una fila por corrida y criterio, con evidencia y comentario
    resumen.csv    por caso y criterio: media, desvío, mín, máx, rango y si cae en el rango esperado
    crudo.jsonl    la respuesta completa de cada corrida
"""

import argparse
import csv
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
PUENTE = AQUI / "puente.mjs"

for flujo in (sys.stdout, sys.stderr):
    try:
        flujo.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def node():
    exe = shutil.which("node")
    if not exe:
        sys.exit("No encontré Node.js en el PATH (hace falta para correr el evaluador de la app).")
    return exe


def cargar_casos(rutas):
    archivos = []
    for r in rutas:
        p = Path(r)
        archivos += sorted(p.glob("*.json")) if p.is_dir() else [p]
    casos = []
    for f in archivos:
        caso = json.loads(f.read_text(encoding="utf-8"))
        caso.setdefault("nombre", f.stem)
        casos.append(caso)
    if not casos:
        sys.exit("No encontré transcripciones JSON.")
    return casos


def levantar_servidor():
    """Copia del servidor en un puerto libre y con datos temporales, como hace npm run chequeo."""
    datos = tempfile.mkdtemp(prefix="tutoring-evals-")
    env = {**os.environ, "PORT": "0", "DATA_DIR": datos, "LOG_DIR": str(RAIZ / "data" / "logs")}
    os.environ["DATA_DIR"] = datos   # puente.mjs lee de ahí la llave local del servidor
    proc = subprocess.Popen([node(), str(RAIZ / "server.js")], cwd=RAIZ, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
    salida, t0 = "", time.time()
    while time.time() - t0 < 20:
        linea = proc.stdout.readline()
        if not linea and proc.poll() is not None:
            break
        salida += linea
        m = re.search(r"http://localhost:(\d+)", linea)
        if m:
            # El servidor sigue escribiendo su registro: lo descartamos para que no se llene el buffer.
            threading.Thread(target=lambda: [None for _ in proc.stdout], daemon=True).start()
            return proc, f"http://127.0.0.1:{m.group(1)}"
    proc.kill()
    sys.exit("El servidor no arrancó:\n" + salida)


def estado(url):
    r = subprocess.run([node(), str(PUENTE), "--estado", "--url", url], capture_output=True, text=True, encoding="utf-8")
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"ok": False, "error": r.stderr.strip() or r.stdout.strip()}


def correr_una(caso, corrida, url, timeout):
    t0 = time.time()
    try:
        r = subprocess.run([node(), str(PUENTE), "--url", url], input=json.dumps(caso, ensure_ascii=False),
                           capture_output=True, text=True, encoding="utf-8", timeout=timeout)
        lineas = r.stdout.strip().splitlines()
        res = json.loads(lineas[-1]) if lineas else {"ok": False, "error": r.stderr.strip()[:500] or "sin salida"}
    except subprocess.TimeoutExpired:
        res = {"ok": False, "error": f"pasaron {timeout}s sin respuesta"}
    except ValueError:
        res = {"ok": False, "error": "salida inválida del puente: " + r.stdout[-300:]}
    res.setdefault("segundos", round(time.time() - t0, 1))
    res["caso"], res["corrida"] = caso["nombre"], corrida
    return res


def stats(valores):
    v = [x for x in valores if x is not None]
    if not v:
        return {"n": 0, "media": "", "desvio": "", "min": "", "max": "", "rango": ""}
    return {"n": len(v), "media": round(statistics.mean(v), 2),
            "desvio": round(statistics.stdev(v), 2) if len(v) > 1 else 0.0,
            "min": min(v), "max": max(v), "rango": max(v) - min(v)}


def main():
    ap = argparse.ArgumentParser(description="Golden evals del evaluador de simulaciones.")
    ap.add_argument("casos", nargs="*", default=[str(AQUI / "transcripciones")], help="archivos JSON o carpetas")
    ap.add_argument("-n", "--repeticiones", type=int, default=1, help="veces que se evalúa cada transcripción")
    ap.add_argument("--url", default=os.environ.get("TUTORING_URL", "http://localhost:3000"))
    ap.add_argument("--levantar-servidor", action="store_true", help="arranca una copia propia del servidor")
    ap.add_argument("--paralelo", type=int, default=1, help="evaluaciones simultáneas (con la suscripción, mejor 1)")
    ap.add_argument("--timeout", type=int, default=240, help="segundos máximos por evaluación")
    ap.add_argument("--salida", default=str(AQUI / "resultados"))
    a = ap.parse_args()

    casos = cargar_casos(a.casos)
    proc, url = (levantar_servidor() if a.levantar_servidor else (None, a.url))
    try:
        est = estado(url)
        if not est.get("ok"):
            sys.exit(f"No pude hablar con el servidor en {url}: {est.get('error')}\n"
                     "Corré npm start en otra terminal o usá --levantar-servidor.")
        print(f"Servidor {url} · cadena de evaluación: {' → '.join(est.get('cadenaEval') or []) or '(vacía)'}")
        if (est.get("claudeSdk") or {}).get("mensaje"):
            print(f"  Claude Code: {est['claudeSdk']['mensaje']}")

        trabajos = [(c, i + 1) for c in casos for i in range(a.repeticiones)]
        print(f"{len(casos)} transcripciones × {a.repeticiones} = {len(trabajos)} evaluaciones\n")
        resultados = []
        with ThreadPoolExecutor(max_workers=max(1, a.paralelo)) as pool:
            futuros = [pool.submit(correr_una, c, i, url, a.timeout) for c, i in trabajos]
            for f in futuros:
                r = f.result()
                resultados.append(r)
                txt = f"total {r['puntaje']} ({r['cubiertos']}/{r['total']} criterios)" if r.get("ok") else f"ERROR: {r['error']}"
                print(f"  {r['caso']} #{r['corrida']}: {txt} · {r.get('segundos')}s · {r.get('proveedor', '')}")
    finally:
        if proc:
            proc.terminate()

    escribir(casos, resultados, a)


def escribir(casos, resultados, a):
    carpeta = Path(a.salida) / datetime.now().strftime("%Y%m%d-%H%M%S")
    carpeta.mkdir(parents=True, exist_ok=True)

    nombres = []  # criterios en el orden en que los definió la empresa
    for r in resultados:
        for c in r.get("criterios", []):
            if c["nombre"] not in nombres:
                nombres.append(c["nombre"])

    with open(carpeta / "crudo.jsonl", "w", encoding="utf-8") as f:
        for r in resultados:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(carpeta / "corridas.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["caso", "corrida", "ok", "error", "proveedor", "segundos", "puntaje_total", "cubiertos", "total_criterios", *nombres])
        for r in resultados:
            por = {c["nombre"]: c["puntaje"] for c in r.get("criterios", [])}
            w.writerow([r["caso"], r["corrida"], r.get("ok"), r.get("error", ""), r.get("proveedor", ""), r.get("segundos"),
                        r.get("puntaje"), r.get("cubiertos"), r.get("total"), *[por.get(n, "") for n in nombres]])

    with open(carpeta / "criterios.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["caso", "corrida", "criterio", "peso", "puntaje", "evidencia", "comentario"])
        for r in resultados:
            for c in r.get("criterios", []):
                w.writerow([r["caso"], r["corrida"], c["nombre"], c["peso"], c["puntaje"], c["evidencia"], c["comentario"]])

    filas = []
    for caso in casos:
        rs = [r for r in resultados if r["caso"] == caso["nombre"] and r.get("ok")]
        fallidas = sum(1 for r in resultados if r["caso"] == caso["nombre"] and not r.get("ok"))
        esperado = caso.get("esperado") or {}
        metricas = [("TOTAL (0-100)", [r["puntaje"] for r in rs], esperado.get("total"))]
        for n in nombres:
            vals = [next((c["puntaje"] for c in r["criterios"] if c["nombre"] == n), None) for r in rs]
            metricas.append((n, vals, (esperado.get("criterios") or {}).get(n)))
        for metrica, vals, rango in metricas:
            s = stats(vals)
            dentro = ""
            if rango and s["n"]:
                ok = sum(1 for v in vals if v is not None and rango["min"] <= v <= rango["max"])
                dentro = f"{round(100 * ok / s['n'])}%"
            filas.append({"caso": caso["nombre"], "metrica": metrica, **s,
                          "sin_puntaje": sum(1 for v in vals if v is None), "corridas_fallidas": fallidas,
                          "esperado_min": rango["min"] if rango else "", "esperado_max": rango["max"] if rango else "",
                          "dentro_del_rango": dentro})

    with open(carpeta / "resumen.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)

    print("\nResumen (TOTAL):")
    for fila in filas:
        if fila["metrica"].startswith("TOTAL"):
            esp = f" · esperado {fila['esperado_min']}-{fila['esperado_max']} → {fila['dentro_del_rango'] or 'n/a'}" if fila["esperado_min"] != "" else ""
            print(f"  {fila['caso']:<28} media {fila['media']!s:>6}  desvío {fila['desvio']!s:>5}  rango {fila['min']}-{fila['max']}{esp}")
    print(f"\nResultados en {carpeta}")


if __name__ == "__main__":
    main()
