const { PROVIDERS } = require("../providers.config");
const { provError } = require("../errores");
const { leerSSE } = require("../leer-sse");
// ---------- Gemini ----------
const EVAL_SCHEMA = {
  type: "object",
  properties: {
    resumen: { type: "string" },
    criterios: { type: "array", minItems: 1, items: {
      type: "object",
      properties: { nombre: { type: "string" }, puntaje: { type: "integer", minimum: 1, maximum: 5 }, evidencia: { type: "string" }, comentario: { type: "string" } },
      required: ["nombre", "puntaje", "evidencia", "comentario"], additionalProperties: false
    } },
    ...Object.fromEntries(["fortalezas", "a_mejorar", "como_encaro", "preguntas_entrevista"].map(k => [k, { type: "array", items: { type: "string" } }])),
    expresion: { type: "string" }
  },
  required: ["resumen", "criterios", "fortalezas", "a_mejorar", "como_encaro", "preguntas_entrevista", "expresion"],
  additionalProperties: false
};
// Gemini cachea solo (caché implícito) cuando el principio del prompt se repite (mínimo ~4096 tokens en Flash).
// Por la API nativa lo informa; por este endpoint compatible con OpenAI hoy no lo devuelve, pero si algún día
// llega en prompt_tokens_details.cached_tokens (incluido dentro de prompt_tokens), se registra.
function usoGemini(u) {
  const r = Number((u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || u.cached_tokens || 0);
  return { in: u.prompt_tokens, out: u.completion_tokens, cacheWrite: 0, cacheRead: r };
}
// Usa el endpoint compatible con OpenAI de Gemini.
async function runGemini(p, ctx) {
  const prov = PROVIDERS.gemini;
  const messages = [];
  if (p.system) messages.push({ role: "system", content: p.system });
  p.messages.forEach(m => messages.push({ role: m.role, content: m.content }));
  const body = { model: p.model, messages, max_tokens: p.max_tokens + prov.extraTokens, stream: true };
  // Sin esto, el streaming de Gemini no informa los tokens usados (solo cambia lo que se registra).
  body.stream_options = { include_usage: true };
  if (p.purpose === "eval") body.response_format = { type: "json_schema", json_schema: { name: "evaluacion", strict: true, schema: EVAL_SCHEMA } };
  if (prov.reasoning && prov.reasoning !== "default") body.reasoning_effort = prov.reasoning;
  if (p.temperature != null) body.temperature = p.temperature;

  let upstream;
  try {
    upstream = await fetch(prov.baseUrl + "/chat/completions", {
      method: "POST", signal: ctx.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + prov.key },
      body: JSON.stringify(body)
    });
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    throw provError(502, "No se pudo conectar con la API de Gemini. Revisá tu conexión a internet.", "network");
  }

  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch (_) {}
    try {
      const j = JSON.parse(raw);
      const e = Array.isArray(j) ? j[0] && j[0].error : j.error;
      msg = (e && e.message) || "";
    } catch (_) { msg = raw.replace(/\s+/g, " ").slice(0, 300); }
    const st = geminiStatus(upstream.status, msg);
    throw provError(st, geminiMessage(upstream.status, msg, p.model), st === 401 || st === 403 ? "sesion" : "");
  }

  let emitido = 0, finish = "";
  // Si Gemini contesta con JSON en vez de SSE (pasa con algunos errores), igual rescatamos el texto.
  const ctype = (upstream.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("event-stream")) {
    let j;
    try { j = JSON.parse(await upstream.text()); } catch (_) { throw provError(502, "Gemini respondió en un formato que no se pudo interpretar.", "empty"); }
    if (j.error) throw provError(geminiStatus(200, j.error.message || ""), geminiMessage(200, j.error.message || "", p.model));
    const ch = j.choices && j.choices[0];
    finish = String((ch && ch.finish_reason) || "");
    const text = (ch && ch.message && (typeof ch.message.content === "string" ? ch.message.content
      : Array.isArray(ch.message.content) ? ch.message.content.map(x => x && x.text || "").join("") : "")) || "";
    if (j.usage) ctx.onUsage(usoGemini(j.usage));
    if (text) { emitido += text.length; ctx.onText(text); }
  } else {
    await leerSSE(upstream.body, ctx, j => {
      if (j.error) throw provError(geminiStatus(200, j.error.message || ""), geminiMessage(200, j.error.message || "", p.model));
      if (j.usage) ctx.onUsage(usoGemini(j.usage));
      const ch = j.choices && j.choices[0];
      if (!ch) return;
      if (ch.finish_reason) finish = String(ch.finish_reason);
      const d = ch.delta || {};
      const text = typeof d.content === "string" ? d.content
        : Array.isArray(d.content) ? d.content.map(x => (x && typeof x.text === "string" ? x.text : "")).join("") : "";
      if (text) { emitido += text.length; ctx.onText(text); }
    }, "Gemini");
  }
  if (!emitido) {
    if (/content_filter|safety|blocked|prohibited/i.test(finish)) throw provError(400, "Gemini bloqueó la respuesta por sus filtros de contenido. Probá reformular.", "filtro");
    if (/length|max_tokens/i.test(finish)) throw provError(502, "Gemini gastó todo el límite de tokens razonando y no llegó a responder. Subí GEMINI_THINKING_EXTRA en el .env.", "empty");
    throw provError(502, `Gemini devolvió una respuesta vacía${finish ? ` (motivo: ${finish})` : ""}.`, "empty");
  }
  if (/length|max_tokens/i.test(finish)) {
    if (p.purpose === "eval") throw provError(502, "La evaluación quedó incompleta por el límite de tokens.", "eval_incompleta");
    ctx.nota = "respuesta cortada por límite de tokens";
  }
}

// La API está creada pero apagada en el proyecto de Google de esa key.
const apiApagada = msg => /has not been used in project|service[_ ]disabled|accessnotconfigured|api is not enabled/i.test(msg);

// Traduce el error de Gemini a un código HTTP que el front sepa explicar.
function geminiStatus(status, msg) {
  if (apiApagada(msg)) return 403;
  if (/api key not valid|api_key_invalid|invalid api key|unauthenticated|permission_denied.*api key/i.test(msg)) return 401;
  if (status === 429 || /quota|rate limit|resource.?exhausted|too many requests/i.test(msg)) return 429;
  if (/overloaded|unavailable|high demand/i.test(msg)) return 503;
  if (/not found|is not supported|unknown model|does not exist/i.test(msg)) return 404;
  if (status === 200) return 502;
  return status;
}
function geminiMessage(status, msg, model) {
  const code = geminiStatus(status, msg);
  const detalle = msg ? ` (${msg.replace(/\s+/g, " ").slice(0, 200)})` : "";
  if (code === 403 && apiApagada(msg)) {
    // El mensaje de Google trae el link exacto al proyecto: lo rescatamos.
    const link = (msg.match(/https:\/\/\S+?generativelanguage\S*?(?=\s|$)/i) || [])[0];
    return "La API de Gemini está apagada en el proyecto de Google de esa key. "
      + (link ? `Entrá a ${link} y tocá "Habilitar", esperá 1 o 2 minutos y reiniciá el servidor. ` : 'Habilitá "Generative Language API" en ese proyecto, esperá 1 o 2 minutos y reiniciá el servidor. ')
      + "Atajo: creá otra key en https://aistudio.google.com/apikey eligiendo un proyecto NUEVO, que ya viene habilitado.";
  }
  if (code === 401) return `La GEMINI_API_KEY del .env no es válida. Creá otra en https://aistudio.google.com/apikey y reiniciá el servidor.${detalle}`;
  if (code === 429) return `Se agotó la cuota gratuita de Gemini por ahora. Esperá un minuto y probá de nuevo.${detalle}`;
  // El detalle de Google viene en inglés y no le sirve al usuario: no lo mostramos.
  if (code === 503) return "Gemini está con mucha demanda en este momento. Esperá unos segundos y tocá Reintentar: la conversación no se pierde.";
  if (code === 404) return `El modelo "${model}" no está disponible para tu key. Cambiá GEMINI_MODEL (o el de voz/evaluación) en el .env por uno de la lista de AI Studio.${detalle}`;
  return (msg || "Error de la API de Gemini").slice(0, 300);
}
module.exports = { runGemini, geminiStatus, geminiMessage };
