// Puente entre run_evals.py y el evaluador real de la app. No reimplementa nada:
// - el prompt sale de public/js/prompts.js (T.prompts.evaluacion), igual que en el navegador;
// - el pedido va a POST /api/messages del servidor, que corre la cadena de proveedores y valida el JSON;
// - el parseo y el puntaje salen de public/js/core.js (parseEvaluacion y puntajePonderado);
// - el system y el max_tokens se leen de public/js/app.js (runEvaluation), para que no se desincronicen.
//
// Uso (lo llama run_evals.py; también sirve a mano):
//   node evals/puente.mjs --url http://localhost:3000 < caso.json      evalúa una vez e imprime JSON
//   node evals/puente.mjs --solo-prompt < caso.json                    imprime el prompt, sin llamar a la IA
//   node evals/puente.mjs --estado --url http://localhost:3000         proveedores que usará el servidor

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const URL_APP = opcion("--url") || process.env.TUTORING_URL || "http://localhost:3000";
// La llave local está en la carpeta de datos del servidor (DATA_DIR o data/). Sin ella, /api/messages da 401.
const DATOS = path.resolve(RAIZ, opcion("--datos") || process.env.DATA_DIR || "data");
// Llave que escribe el servidor al arrancar (ver server.js): sin ella la API responde 401.
const llaveLocal = dir => { try { return fs.readFileSync(path.join(dir, "llave-local.txt"), "utf8").trim(); } catch (_) { return ""; } };

const salir = (obj, codigo = 0) => { process.stdout.write(JSON.stringify(obj) + "\n"); process.exit(codigo); };
const fallar = (mensaje, extra = {}) => salir({ ok: false, error: mensaje, ...extra }, 1);

if (args.includes("--estado")) {
  try {
    const r = await fetch(`${URL_APP}/api/chequeo/estado`);
    const e = await r.json();
    salir({ ok: true, cadenaEval: e.cadenaEval, modelos: e.modelos, claudeSdk: e.claudeSdk, carreraMs: e.carreraMs });
  } catch (e) { fallar(`No pude conectarme a ${URL_APP} (${e.message})`); }
}

// Mismos archivos que carga el navegador.
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const f of ["public/js/core.js", "public/js/defaults.js", "public/js/prompts.js"]) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, { filename: f });
}
const T = ctx.T;

// El pedido de evaluación que arma la app, leído de app.js.
function pedidoDeLaApp() {
  const src = fs.readFileSync(path.join(RAIZ, "public/js/app.js"), "utf8");
  const i = src.indexOf("async function runEvaluation");
  const bloque = i >= 0 ? src.slice(i, i + 2500) : "";
  const mt = bloque.match(/purpose:\s*"eval",\s*maxTokens:\s*(\d+)/);
  const sys = bloque.match(/system:\s*"((?:[^"\\]|\\.)*)"/);
  if (!mt || !sys) fallar("No encontré el pedido de evaluación en public/js/app.js (runEvaluation). Si cambió, actualizá pedidoDeLaApp() en evals/puente.mjs.");
  return { maxTokens: Number(mt[1]), system: JSON.parse(`"${sys[1]}"`) };
}

function configDe(caso) {
  const clave = caso.empresa || "nodo";
  if (clave === "cargada") {
    const real = path.join(RAIZ, "data", "empresa.json");
    if (!fs.existsSync(real)) fallar("El caso pide empresa \"cargada\" pero no existe data/empresa.json.");
    return T.core.migrarConfig(JSON.parse(fs.readFileSync(real, "utf8")));
  }
  const ej = T.EJEMPLOS[clave];
  if (!ej) fallar(`Empresa "${clave}" desconocida. Opciones: cargada, ${Object.keys(T.EJEMPLOS).join(", ")}.`);
  return ej.config;
}

async function evaluar(prompt, pedido) {
  const t0 = Date.now();
  let r;
  try {
    // Mismo cuerpo que manda public/js/api.js para purpose "eval".
    r = await fetch(`${URL_APP}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-llave-local": llaveLocal(DATOS) },
      body: JSON.stringify({ purpose: "eval", max_tokens: pedido.maxTokens, system: pedido.system, messages: [{ role: "user", content: prompt }], stream: true })
    });
  } catch (e) {
    fallar(`No pude conectarme a ${URL_APP}. ¿Está corriendo npm start? (${e.message})`);
  }
  const cuerpo = await r.text();
  if (r.status === 401) fallar(`El servidor pidió sesión: no encontré la llave en ${path.join(DATOS, "llave-local.txt")}. Pasá --datos con la carpeta de datos del servidor (DATA_DIR) o usá --levantar-servidor.`);
  if (!r.ok) {
    let msg = cuerpo; try { const e = JSON.parse(cuerpo).error; msg = (e && e.message) || e || cuerpo; } catch (_) {}
    fallar(`El servidor respondió ${r.status}: ${String(msg).slice(0, 300)}`, { segundos: (Date.now() - t0) / 1000 });
  }
  let texto = "", proveedor = "";
  for (const bloque of cuerpo.split("\n\n")) {
    const datos = bloque.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
    if (!datos) continue;
    let d; try { d = JSON.parse(datos); } catch (_) { continue; }
    if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta") texto += d.delta.text;
    if (d.type === "provider") proveedor = d.provider;
    if (d.type === "error") fallar((d.error && d.error.message) || "error de la IA", { segundos: (Date.now() - t0) / 1000 });
  }
  return { texto, proveedor, segundos: (Date.now() - t0) / 1000 };
}

const caso = JSON.parse(fs.readFileSync(0, "utf8"));
const cfg = configDe(caso);
const esc = (cfg.escenarios || []).find(e => e.id === caso.escenarioId);
if (!esc) fallar(`No encontré el escenario "${caso.escenarioId}" en ${cfg.empresa}.`);
if (!Array.isArray(caso.transcripcion) || !caso.transcripcion.length) fallar("El caso no trae transcripcion.");

const prompt = T.prompts.evaluacion(cfg, esc, caso.transcripcion, caso.candidato || "Candidato", caso.minutos || 5);
if (args.includes("--solo-prompt")) { process.stdout.write(prompt + "\n"); process.exit(0); }

const pedido = pedidoDeLaApp();
const { texto, proveedor, segundos } = await evaluar(prompt, pedido);
const ev = T.core.parseEvaluacion(texto);
if (!ev) fallar("La respuesta no tiene el formato esperado.", { segundos, crudo: texto.slice(0, 2000) });
const pond = T.core.puntajePonderado(cfg.criterios, ev.criterios);

const criterios = cfg.criterios.map((c, i) => {
  const r = T.core.buscarCriterio({ nombre: c.nombre, total: cfg.criterios.length }, i, ev.criterios);
  return {
    nombre: c.nombre, peso: c.peso,
    puntaje: T.core.puntajeCriterio(r && r.puntaje),
    evidencia: (r && r.evidencia) || "", comentario: (r && r.comentario) || "", observado: (r && r.observado) || ""
  };
});

salir({
  ok: true, empresa: cfg.empresa, escenario: esc.id, proveedor: proveedor || "principal", segundos,
  puntaje: pond.puntaje, cubiertos: pond.cubiertos, total: pond.total, criterios,
  resumen: ev.resumen, evaluacion: ev
});
