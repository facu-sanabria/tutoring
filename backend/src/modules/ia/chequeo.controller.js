const { json, fail } = require("../../shared/http/respuesta");
const { bodyObject } = require("../../shared/http/body");
const { LIMITS } = require("../../config/limits");
const { LOGS } = require("../../config/paths");
const { IDS, normProv, PROVIDERS, PRIMARY, FALLBACK, CADENA, EVAL_CADENA, LIVE_KEYS, T_EVAL_CARRERA } = require("../../shared/llm/providers.config");
const { verificarSesionClaude, SDK_STATE } = require("../../shared/llm/providers/claude-sdk");
const { problemaDe, intentar, pedidoEval } = require("../../shared/llm/intentos");
const { sanitizePayload } = require("../../shared/llm/payload");
const { pista } = require("../../shared/llm/log");
const { tokenGeminiLive } = require("../../shared/voz/gemini-live");
const { VOICE } = require("../../shared/voz/voice.config");

// Chequeo antes de una demo (npm run chequeo). No tiene botón en la interfaz: se usa solo desde la consola.
// No pide sesión y despacha por su cuenta (un método equivocado da 404, no 405).
async function chequeo(req, res, url) {
  const ip = String(req.socket.remoteAddress || "");
  if (!/^(127\.|::1$|::ffff:127\.)/.test(ip)) return fail(res, 403, "Solo desde esta compu.");
  if (url.pathname === "/api/chequeo/estado" && req.method === "GET") {
    if (CADENA.includes("claude-sdk") || EVAL_CADENA.includes("claude-sdk")) await verificarSesionClaude();
    return json(res, 200, {
      principal: PRIMARY, respaldo: FALLBACK, cadenaEval: EVAL_CADENA, carreraMs: T_EVAL_CARRERA,
      modelos: Object.fromEntries(IDS.map(id => [id, PROVIDERS[id].models])),
      claudeSdk: { estado: SDK_STATE.estado, plan: SDK_STATE.plan, mensaje: SDK_STATE.mensaje },
      anthropicKey: Boolean(PROVIDERS.anthropic.key), geminiKey: Boolean(PROVIDERS.gemini.key),
      voz: VOICE.provider, liveModelo: VOICE.geminiLive.model, liveKeys: LIVE_KEYS.length,
      liveVoces: [VOICE.geminiLive.voiceFemenina, VOICE.geminiLive.voiceMasculina], logs: LOGS
    });
  }
  if (url.pathname === "/api/chequeo/ia" && req.method === "POST") {
    const body = await bodyObject(req, res, LIMITS.mensajes, "");
    if (!body) return;
    const id = normProv(body.id, "");
    if (!id) return fail(res, 400, "Proveedor desconocido.");
    const purpose = ["chat", "eval", "voice"].includes(body.purpose) ? body.purpose : "chat";
    const payload = body.payload ? sanitizePayload(body.payload) : { system: "Respondés con una sola palabra.", messages: [{ role: "user", content: "Decí: listo" }], max_tokens: 32 };
    const problema = await problemaDe(id);
    if (problema) return json(res, 200, { ok: false, ms: 0, error: problema.message, pista: pista(problema, id) });
    let salida = "";
    const sse = { open() {}, text: t => { salida += t; }, event() {}, error() {}, close() {}, end() {} };
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });
    const t0 = Date.now();
    const r = await intentar(id, purpose, purpose === "eval" ? pedidoEval(payload, 0) : payload, sse, ac.signal, { req: "chk", etiqueta: "chequeo" });
    const out = { ok: Boolean(r.ok), ms: Date.now() - t0, modelo: PROVIDERS[id].models[purpose] || PROVIDERS[id].models.chat };
    if (r.ok && purpose === "eval") { try { out.criterios = JSON.parse(salida).criterios.length; } catch (_) {} }
    else if (r.ok) out.respuesta = salida.trim().slice(0, 60);
    if (r.error) { out.error = r.error.message; out.pista = pista(r.error, id); }
    return json(res, 200, out);
  }
  if (url.pathname === "/api/chequeo/live" && req.method === "POST") {
    const body = await bodyObject(req, res, 4096, "");
    if (!body) return;
    const r = await tokenGeminiLive({ soloKey: Number.isInteger(body.key) ? body.key : 0 });
    return r.token ? json(res, 200, { ...r, wsUrl: VOICE.geminiLive.wsUrl }) : json(res, 200, { error: r.error, status: r.status });
  }
  return fail(res, 404, "Ruta no encontrada");
}

module.exports = { chequeo };
