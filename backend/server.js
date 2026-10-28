// Tutoring: servidor mínimo (Node 18+).
// - Sirve la app de /public (src/shared/http/static.js)
// - Reenvía las consultas al proveedor de IA (Claude vía Agent SDK, Gemini o Claude API).
//   Las keys viven en .env y nunca llegan al navegador.
// - Si el proveedor principal falla antes de empezar a responder, reintenta y pasa al de respaldo.
// - Guarda la configuración de la empresa y los informes en /data
// Única dependencia: @anthropic-ai/claude-agent-sdk (solo para LLM_PROVIDER=claude-sdk).
// Estructura: src/config (entorno), src/shared (IA, HTTP, utilidades), src/modules (auth, ia, empresa,
// simulaciones, mentor) y src/routes.js (orden de chequeos de la API). Ver docs/superpowers/specs/2026-10-28-backend-por-capas-design.md.
const http = require("http");
const { env } = require("./src/config/env");
const { LOGS } = require("./src/config/paths");
const { PROVIDERS, PRIMARY, FALLBACK, CADENA, EVAL_CADENA, LIVE_KEYS, CACHE, T_EVAL_CARRERA } = require("./src/shared/llm/providers.config");
const { verificarSesionClaude } = require("./src/shared/llm/providers/claude-sdk");
const { VOICE } = require("./src/shared/voz/voice.config");
const { sinSecretos } = require("./src/shared/utils/secretos");
const { auth } = require("./src/modules/auth/sesion");
const { crearApp } = require("./src/app");
const { handleApi } = require("./src/routes");
const PORT_ENV = env("PORT");
// PORT=0 le pide al sistema un puerto libre (lo usan las pruebas).
const PORT = /^[0-9]+$/.test(PORT_ENV) ? Number(PORT_ENV) : 3000;

const server = http.createServer(crearApp(handleApi));

// Que un error suelto no baje el servidor en medio de una demo.
process.on("uncaughtException", e => console.error("  Error inesperado (el servidor sigue andando):", sinSecretos((e && e.stack) || e)));
process.on("unhandledRejection", e => console.error("  Promesa rechazada (el servidor sigue andando):", sinSecretos((e && e.stack) || e)));

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  El puerto ${PORT} ya está ocupado.`);
    console.error(`  Puede ser otra copia de Tutoring abierta: cerrala (Ctrl+C) o levantá esta en otro puerto:`);
    console.error(`      PORT=3100 npm start        (en PowerShell: $env:PORT=3100; npm start)\n`);
  } else {
    console.error("\n  No se pudo iniciar el servidor:", e.message, "\n");
  }
  process.exit(1);
});

const descProv = id => {
  const p = PROVIDERS[id];
  return `${p.detalle} (${id}) · chat=${p.models.chat} · voz=${p.models.voice} · evaluación=${p.models.eval}`;
};

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Tutoring corriendo en  http://localhost:${server.address().port}\n`);
  console.log(`  IA principal: ${descProv(PRIMARY)}`);
  console.log(`  IA de respaldo: ${FALLBACK ? descProv(FALLBACK) : "ninguna (LLM_FALLBACK vacío)"}`);
  console.log(`  Evaluación: ${EVAL_CADENA.map(id => PROVIDERS[id].detalle).join(" → ")}${EVAL_CADENA[0] === "claude-sdk" ? ` · intento en paralelo a los ${Math.round(T_EVAL_CARRERA / 1000)}s si Claude no terminó` : ""}`);
  if (EVAL_CADENA[0] === "claude-sdk" && !PROVIDERS.anthropic.key) console.log("  (Sin ANTHROPIC_API_KEY: el intento en paralelo usa otra vez Claude Code. Con la key, usa Claude por API.)");
  console.log(`  Registro de la IA: ${LOGS}`);
  const demo = auth.cuentasDemoActivas();
  if (demo.length) {
    console.log(`
  Cuentas de prueba activas (clave ${auth.CUENTAS_DEMO[0].clave}): ${demo.map(u => u.usuario).join(", ")}`);
    console.log(`  Antes de usar la app con gente real, desactivalas: npm run usuarios -- desactivar ${demo[0].usuario}`);
  }
  console.log(`  Caché de prompts: ${CACHE.activo ? `activo (duración ${CACHE.ttl}). El ahorro se ve en /api/diagnostico` : "apagado (PROMPT_CACHE=off)"}`);
  for (const id of CADENA) {
    if (id !== "claude-sdk" && !PROVIDERS[id].key) console.log(`  Atención: falta ${PROVIDERS[id].keyVar} en el archivo .env`);
  }
  if (VOICE.provider === "gemini-live" && !VOICE.geminiLive.disponible) {
    console.log("  Voz: gemini-live · ATENCIÓN: falta GEMINI_API_KEY en el .env. Mientras tanto se usa " + (VOICE.vapiPublicKey ? "Vapi" : "la voz del navegador") + ".\n");
  } else if (VOICE.provider === "gemini-live") {
    const gl = VOICE.geminiLive;
    console.log(`  Voz: gemini-live · modelo ${gl.model} · voz ${gl.voice === "auto" ? `${gl.voiceFemenina} / ${gl.voiceMasculina}` : gl.voice} (voz a voz nativa) · ${LIVE_KEYS.length} key${LIVE_KEYS.length === 1 ? " (sin respaldo: sumá GEMINI_LIVE_API_KEY_2)" : "s (con respaldo)"}\n`);
  } else if (VOICE.provider === "vapi" && !VOICE.vapiPublicKey) {
    console.log("  Voz: vapi · ATENCIÓN: falta VAPI_PUBLIC_KEY en el .env. Mientras tanto se usa la voz del navegador.\n");
  } else if (VOICE.provider === "vapi") {
    console.log(`  Voz: vapi · modelo ${VOICE.vapi.modelProvider}/${VOICE.vapi.model} · voces ${VOICE.vapi.voiceFemenina} / ${VOICE.vapi.voiceMasculina} · ${VOICE.vapi.transcriber} ${VOICE.vapi.transcriberModel} (${VOICE.vapi.language})\n`);
  } else console.log("  Voz: navegador\n");
  if (CADENA.includes("claude-sdk")) {
    verificarSesionClaude().then(s => {
      if (s.estado === "ok") console.log(`  Claude: sesión iniciada${s.plan ? " (" + s.plan + ")" : ""}. No se usa ninguna API key.\n`);
      else console.log(`\n  ⚠  Claude: ${s.mensaje}\n`);
    });
  }
});
