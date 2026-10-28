/* Chequeo antes de una demo: prueba de verdad todo lo que se usa en vivo, con las keys y la sesión de esta compu.
   No hay botón en la interfaz: se corre solo desde la consola.

       npm run chequeo            todo (unos 2 minutos): Claude, evaluación real, respaldos y Gemini Live
       npm run chequeo -- --rapido   sin las evaluaciones largas (unos 20 segundos)

   - Arranca una copia del servidor en otro puerto (no toca la que tengas abierta ni tus datos).
   - Nunca imprime una key: solo dice "key 1", "key 2".
   - Lo que pasa queda también en data/logs/ia-AAAA-MM-DD.log.                                         */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Node 20 y 21 traen WebSocket, pero apagado: hace falta --experimental-websocket. Si falta, nos volvemos a
// lanzar con esa opción (una sola vez). En Node 22 o más nuevo ya viene prendido y esto no hace nada.
if (typeof WebSocket === "undefined" && !process.env.TUTORING_CHEQUEO_WS) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--experimental-websocket", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, TUTORING_CHEQUEO_WS: "1" }
  });
  // Si este Node no conoce la opción (muy viejo), seguimos sin prueba de audio.
  if (r.status !== 9 && !r.error) process.exit(r.status ?? 1);
}
const RAPIDO = process.argv.includes("--rapido");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-chequeo-"));
fs.mkdirSync(path.join(dataDir, "informes"), { recursive: true });

const V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", G = "\x1b[90m", N = "\x1b[1m", X = "\x1b[0m";
const problemas = [], avisos = [];
const seg = ms => (ms / 1000).toFixed(1) + "s";
const ok = (texto, extra = "") => console.log(`  ${V}✓${X} ${texto}${extra ? G + " · " + extra + X : ""}`);
const mal = (texto, detalle, pista) => {
  console.log(`  ${R}✗ ${texto}${X}${detalle ? " — " + detalle : ""}`);
  if (pista) console.log(`      ${G}→ ${pista}${X}`);
  problemas.push(texto);
};
const ojo = (texto, detalle) => { console.log(`  ${A}! ${texto}${X}${detalle ? " — " + detalle : ""}`); avisos.push(texto); };
const titulo = t => console.log(`\n${N}${t}${X}`);

// ---------- servidor de prueba ----------
const proc = spawn(process.execPath, [path.join(RAIZ, "server.js")], {
  cwd: RAIZ,
  env: { ...process.env, PORT: "0", DATA_DIR: dataDir, LOG_DIR: path.join(RAIZ, "data", "logs") },
  stdio: ["ignore", "pipe", "pipe"]
});
let salida = "";
proc.stdout.on("data", d => (salida += d));
proc.stderr.on("data", d => (salida += d));
const puerto = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("el servidor no arrancó:\n" + salida)), 15000);
  const iv = setInterval(() => {
    const m = salida.match(/http:\/\/localhost:(\d+)/);
    if (m) { clearTimeout(t); clearInterval(iv); res(Number(m[1])); }
  }, 50);
  proc.on("exit", () => { clearTimeout(t); clearInterval(iv); rej(new Error("el servidor se cerró:\n" + salida)); });
}).catch(e => { console.error("\n  " + e.message); terminar(1); });
const BASE = `http://127.0.0.1:${puerto}`;
// Llave que escribe el servidor al arrancar (ver server.js): sin ella la API responde 401.
const llaveLocal = dir => { try { return fs.readFileSync(path.join(dir, "llave-local.txt"), "utf8").trim(); } catch (_) { return ""; } };
const LLAVE = { "x-llave-local": llaveLocal(dataDir) };
const get = async p => (await fetch(BASE + p, { headers: LLAVE })).json();
const post = async (p, body) => (await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...LLAVE }, body: JSON.stringify(body) })).json();

// ---------- una evaluación real, como la arma la app ----------
function payloadEvaluacion() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const rel of ["public/js/core.js", "public/js/defaults.js", "public/js/prompts.js"]) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, rel), "utf8"), ctx, { filename: rel });
  }
  const T = ctx.T;
  let cfg = T.EJEMPLOS.nodo.config, origen = "ejemplo Nodo Software";
  const real = path.join(RAIZ, "data", "empresa.json");
  if (fs.existsSync(real)) {
    try {
      const c = T.core.migrarConfig(JSON.parse(fs.readFileSync(real, "utf8")));
      if (c && (c.escenarios || []).length && (c.criterios || []).length) { cfg = c; origen = `la empresa cargada (${c.empresa})`; }
    } catch (_) {}
  }
  const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "test", "evaluador", "casos.json"), "utf8"));
  const caso = casos.casos.find(c => c.nombre === "medio") || casos.casos[0];
  const esc = cfg.escenarios.find(e => e.id === casos.escenarioId) || cfg.escenarios[0];
  return {
    origen: `${origen}, escenario "${esc.titulo}"`,
    payload: {
      purpose: "eval", max_tokens: 2500,
      system: "Sos un evaluador riguroso y justo. Respondés solo con un objeto JSON válido, sin texto alrededor.",
      messages: [{ role: "user", content: T.prompts.evaluacion(cfg, esc, caso.transcripcion, caso.candidato, caso.minutos) }]
    }
  };
}

// Evaluación por la cadena real (la misma que usa la app, con carrera y respaldos).
async function evaluarComoLaApp(payload) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/messages", { method: "POST", headers: { "content-type": "application/json", ...LLAVE }, body: JSON.stringify({ ...payload, stream: true }) });
  if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch (_) {} return { ok: false, ms: Date.now() - t0, error: m || r.statusText }; }
  const txt = await r.text();
  let texto = "", error = "", respaldo = "";
  for (const linea of txt.split("\n")) {
    if (!linea.startsWith("data:")) continue;
    let j; try { j = JSON.parse(linea.slice(5)); } catch (_) { continue; }
    if (j.type === "content_block_delta" && j.delta && j.delta.text) texto += j.delta.text;
    if (j.type === "error") error = j.error && j.error.message;
    if (j.type === "provider") respaldo = j.name;
  }
  let criterios = 0;
  try { criterios = JSON.parse(texto).criterios.length; } catch (_) {}
  return { ok: !error && criterios > 0, ms: Date.now() - t0, error, respaldo, criterios };
}

// ---------- Gemini Live: abre una sesión de verdad y espera audio ----------
async function probarLive(i, estado) {
  const t0 = Date.now();
  const tk = await post("/api/chequeo/live", { key: i });
  if (!tk.token) return { ok: false, etapa: "token", error: tk.error };
  const tToken = Date.now() - t0;
  if (typeof WebSocket === "undefined") return { ok: true, soloToken: true, tToken };
  return await new Promise(resolve => {
    let fin = false, tSetup = null;
    const terminarCon = r => { if (fin) return; fin = true; clearTimeout(t); try { ws.close(); } catch (_) {} resolve({ tToken, ...r }); };
    const t = setTimeout(() => terminarCon({ ok: false, etapa: tSetup ? "audio" : "conexión", error: tSetup ? "conectó pero no devolvió audio en 25 segundos" : "no confirmó la sesión en 25 segundos" }), 25000);
    const ws = new WebSocket(`${tk.wsUrl}?access_token=${encodeURIComponent(tk.token)}`);
    ws.onopen = () => ws.send(JSON.stringify({ setup: {
      model: "models/" + tk.model,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: estado.liveVoces[0] || "Kore" } } } },
      systemInstruction: { parts: [{ text: "Sos una persona de prueba. Contestá en español rioplatense, en una sola oración corta." }] }
    } }));
    ws.onmessage = async ev => {
      let txt = ev.data;
      if (typeof txt !== "string") { try { txt = Buffer.from(txt.arrayBuffer ? await txt.arrayBuffer() : txt).toString("utf8"); } catch (_) { return; } }
      let m; try { m = JSON.parse(txt); } catch (_) { return; }
      if (m.setupComplete && tSetup == null) {
        tSetup = Date.now() - t0;
        ws.send(JSON.stringify({ realtimeInput: { text: "Decí: hola, ¿me escuchás bien?" } }));
      }
      const partes = (m.serverContent && m.serverContent.modelTurn && m.serverContent.modelTurn.parts) || [];
      if (partes.some(p => p.inlineData && p.inlineData.data)) terminarCon({ ok: true, tSetup, tAudio: Date.now() - t0 });
    };
    ws.onclose = ev => terminarCon({ ok: false, etapa: tSetup ? "audio" : "conexión", error: `Google cerró la conexión (${ev.code}${ev.reason ? ": " + String(ev.reason).slice(0, 160) : ""})` });
    ws.onerror = () => {};
  });
}

// ---------- recorrido ----------
console.log(`\n${N}Chequeo de Tutoring antes de la demo${X}${RAPIDO ? " (rápido, sin evaluaciones largas)" : ""}`);
const estado = await get("/api/chequeo/estado");
const nombre = { "claude-sdk": "Claude (tu suscripción)", anthropic: "Claude por API", gemini: "Gemini" };
console.log(`${G}  Chat: ${nombre[estado.principal]}${estado.respaldo ? " → " + nombre[estado.respaldo] : ""} · Evaluación: ${estado.cadenaEval.map(id => nombre[id]).join(" → ")} · Voz: ${estado.voz}${X}`);
console.log(`${G}  Registro: ${estado.logs}${X}`);

titulo("1. Claude con tu suscripción (Claude Code)");
const usaSdk = estado.principal === "claude-sdk" || estado.cadenaEval.includes("claude-sdk");
if (!usaSdk) ojo("No está configurado (LLM_PROVIDER no es claude-sdk)");
else if (estado.claudeSdk.estado !== "ok") mal("Sesión de Claude Code", estado.claudeSdk.mensaje, "Abrí una terminal, ejecutá `claude`, iniciá sesión y volvé a correr el chequeo.");
else {
  ok("Sesión iniciada", estado.claudeSdk.plan ? "plan " + estado.claudeSdk.plan : "");
  const r = await post("/api/chequeo/ia", { id: "claude-sdk", purpose: "chat" });
  if (r.ok) (r.ms > 15000 ? ojo : ok)(`Respuesta corta (${r.modelo})`, `${seg(r.ms)}${r.ms > 15000 ? " — anda, pero lento" : ""}`);
  else mal(`Respuesta corta (${r.modelo})`, r.error, r.pista);
}

let ev = null;
if (!RAPIDO && usaSdk && estado.claudeSdk.estado === "ok") {
  ev = payloadEvaluacion();
  titulo("2. Evaluación real con Claude (suscripción)");
  console.log(`${G}  Con ${ev.origen} y una transcripción de prueba. Tarda unos 20 segundos…${X}`);
  const r = await post("/api/chequeo/ia", { id: "claude-sdk", purpose: "eval", payload: ev.payload });
  if (r.ok && r.ms <= estado.carreraMs) ok(`Informe completo (${r.modelo})`, `${seg(r.ms)} · ${r.criterios} criterios`);
  else if (r.ok) ojo(`Informe completo pero lento (${r.modelo})`, `${seg(r.ms)}. En la demo, pasados ${seg(estado.carreraMs)} arranca el intento en paralelo.`);
  else mal(`Evaluación con Claude (${r.modelo})`, r.error, r.pista);
}

titulo(`${RAPIDO || !ev ? "2" : "3"}. Respaldos de la evaluación`);
if (!estado.anthropicKey) ojo("Claude por API: sin ANTHROPIC_API_KEY", "el intento en paralelo usa otra vez Claude Code. Con la key, el respaldo no depende de tu suscripción.");
else {
  const r = await post("/api/chequeo/ia", { id: "anthropic", purpose: "chat" });
  if (r.ok) ok(`Claude por API (${r.modelo})`, seg(r.ms)); else mal(`Claude por API (${r.modelo})`, r.error, r.pista);
}
if (!estado.geminiKey) ojo("Gemini: sin GEMINI_API_KEY");
else if (estado.cadenaEval.includes("gemini") || estado.respaldo === "gemini") {
  const r = await post("/api/chequeo/ia", { id: "gemini", purpose: "chat" });
  if (r.ok) ok(`Gemini texto, último recurso (${r.modelo})`, seg(r.ms));
  else ojo(`Gemini texto (${r.modelo})`, r.error);   // es el último recurso: no frena la demo
}

titulo(`${RAPIDO || !ev ? "3" : "4"}. Gemini Live (motor de voz)`);
if (estado.voz !== "gemini-live") ojo(`La voz configurada es "${estado.voz}", no Gemini Live`);
else if (!estado.liveKeys) mal("Gemini Live", "no hay ninguna key", "Poné GEMINI_API_KEY en el .env.");
else {
  if (estado.liveKeys === 1) ojo("Una sola key de voz", "sumá GEMINI_LIVE_API_KEY_2 (de otra cuenta de Google) para tener respaldo");
  for (let i = 0; i < estado.liveKeys; i++) {
    const r = await probarLive(i, estado);
    const quien = `Key ${i + 1} de ${estado.liveKeys} · ${estado.liveModelo}`;
    if (r.ok && r.soloToken) ojo(quien, `la key funciona (token en ${seg(r.tToken)}), pero este Node no trae WebSocket para probar el audio. Actualizá a Node 22 o probá una llamada desde la app.`);
    else if (r.ok) ok(quien, `token ${seg(r.tToken)} · sesión ${seg(r.tSetup)} · primer audio ${seg(r.tAudio)}`);
    else (i === 0 || estado.liveKeys === 1 ? mal : ojo)(quien, `falló en ${r.etapa}: ${r.error}`);
  }
}

if (ev) {
  titulo("5. Evaluación de punta a punta, como en la demo");
  console.log(`${G}  Mismo camino que la app: Claude primero, intento en paralelo si tarda, respaldos si falla…${X}`);
  const r = await evaluarComoLaApp(ev.payload);
  if (r.ok && !r.respaldo) ok("Informe listo", `${seg(r.ms)} · ${r.criterios} criterios`);
  else if (r.ok) ojo("Informe listo, pero usando respaldo", `${r.respaldo} en ${seg(r.ms)}`);
  else mal("La evaluación de punta a punta falló", r.error, "Mirá las líneas [IA] del registro para ver cada intento.");
}

// ---------- resumen ----------
console.log("");
if (!problemas.length && !avisos.length) console.log(`${V}${N}  TODO LISTO PARA LA DEMO ✓${X}\n`);
else if (!problemas.length) console.log(`${V}${N}  LISTO PARA LA DEMO ✓${X} ${A}(${avisos.length} aviso${avisos.length > 1 ? "s" : ""}: no frenan, pero conviene mirarlos)${X}\n`);
else console.log(`${R}${N}  HAY ${problemas.length} PROBLEMA${problemas.length > 1 ? "S" : ""} PARA RESOLVER ANTES DE LA DEMO:${X}\n${problemas.map(p => "   - " + p).join("\n")}\n`);
terminar(problemas.length ? 1 : 0);

function terminar(codigo) {
  try { proc.kill(); } catch (_) {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(codigo);
}
