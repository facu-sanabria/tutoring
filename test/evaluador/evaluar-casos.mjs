// Verifica que el evaluador distinga niveles de conversación con los criterios de la empresa.
// NO es un guion para candidatos: son casos de prueba del evaluador.
//
// Uso:
//   1) En una terminal: npm start   (el servidor usa tu .env real)
//   2) En otra:         node test/evaluador/evaluar-casos.mjs
// Cada corrida hace una llamada real a la IA (gasta un poco de cuota). No corre en npm test.

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const URL_APP = process.env.TUTORING_URL || "http://localhost:3000";

// Cargamos los mismos archivos que usa el navegador, para armar exactamente el mismo prompt.
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const f of ["public/js/core.js", "public/js/prompts.js", "public/js/defaults.js"]) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, { filename: f });
}
const T = ctx.T;
const cfg = T.DEFAULTS;
const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "test/evaluador/casos.json"), "utf8"));
const esc = cfg.escenarios.find(e => e.id === casos.escenarioId);
if (!esc) { console.error(`No encontré el escenario "${casos.escenarioId}" en la configuración de Nodo Software.`); process.exit(2); }

// Mismo pedido que hace la app para evaluar (public/js/app.js).
async function evaluar(prompt) {
  let r;
  try {
    r = await fetch(`${URL_APP}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "eval", max_tokens: 2500,
        system: "Sos un evaluador riguroso y justo. Respondés solo con un objeto JSON válido, sin texto alrededor.",
        messages: [{ role: "user", content: prompt }]
      })
    });
  } catch (e) {
    throw new Error(`No pude conectarme a ${URL_APP}. ¿Está corriendo npm start? (${e.message})`);
  }
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}: ${await r.text()}`);
  let texto = "";
  for (const bloque of (await r.text()).split("\n\n")) {
    const datos = bloque.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
    if (!datos || datos === "[DONE]") continue;
    let d; try { d = JSON.parse(datos); } catch (_) { continue; }
    if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta") texto += d.delta.text;
    if (d.type === "error") throw new Error((d.error && d.error.message) || "error de la IA");
  }
  return texto;
}

let fallos = 0;
const totales = {};
for (const caso of casos.casos) {
  const prompt = T.prompts.evaluacion(cfg, esc, caso.transcripcion, caso.candidato, caso.minutos);
  const texto = await evaluar(prompt);
  const ev = T.core.parseEvaluacion(texto);
  if (!ev) { console.log(`\n✗ ${caso.nombre}: la respuesta no tiene el formato esperado`); fallos++; continue; }

  const pond = T.core.puntajePonderado(cfg.criterios, ev.criterios);
  totales[caso.nombre] = pond.puntaje;
  console.log(`\n${caso.nombre}: puntaje ${pond.puntaje} (criterios puntuados ${pond.cubiertos}/${pond.total})`);

  for (const [nombre, { min, max }] of Object.entries(caso.esperado)) {
    const idx = cfg.criterios.findIndex(c => c.nombre === nombre);
    const r = T.core.buscarCriterio({ ...cfg.criterios[idx], total: cfg.criterios.length }, idx, ev.criterios);
    const p = T.core.puntajeCriterio(r && r.puntaje);
    const ok = p != null && p >= min && p <= max;
    if (!ok) fallos++;
    console.log(`  ${ok ? "✓" : "✗"} ${nombre}: ${p ?? "sin puntaje"} (esperado ${min}-${max})`);
    if (!ok && r && r.comentario) console.log(`      comentario del evaluador: ${r.comentario}`);
  }

  // Cada criterio puntuado debe citar evidencia: un comentario no vacío que el evaluador justifique.
  for (const c of cfg.criterios) {
    const idx = cfg.criterios.indexOf(c);
    const r = T.core.buscarCriterio({ ...c, total: cfg.criterios.length }, idx, ev.criterios);
    const comentario = r && typeof r.comentario === "string" ? r.comentario.trim() : "";
    if (!comentario) { fallos++; console.log(`  ✗ ${c.nombre}: sin comentario que justifique el puntaje`); }
  }

  const { min, max } = caso.puntajeTotal;
  const okTotal = pond.puntaje != null && pond.puntaje >= min && pond.puntaje <= max;
  if (!okTotal) fallos++;
  console.log(`  ${okTotal ? "✓" : "✗"} puntaje total ${pond.puntaje} (esperado ${min}-${max})`);
}

// Chequeo de orden: cada caso debe puntuar más que el anterior de la lista "orden".
for (let i = 1; i < casos.orden.length; i++) {
  const bajo = totales[casos.orden[i - 1]], alto = totales[casos.orden[i]];
  const ok = bajo != null && alto != null && alto > bajo;
  if (!ok) fallos++;
  console.log(`\n${ok ? "✓" : "✗"} orden: ${casos.orden[i]} (${alto}) debe superar a ${casos.orden[i - 1]} (${bajo})`);
}

console.log(fallos ? `\nResultado: ${fallos} control(es) fallaron. Revisá los comentarios del evaluador.` : "\nResultado: el evaluador distingue los niveles como se esperaba.");
process.exitCode = fallos ? 1 : 0;
