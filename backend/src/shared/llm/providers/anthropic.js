const { PROVIDERS, CACHE } = require("../providers.config");
const { provError } = require("../errores");
const { leerSSE } = require("../leer-sse");
// ---------- Claude (API de Anthropic) ----------
// Cuerpo del pedido. Con caché, el texto es el mismo pero partido en bloques con cache_control:
// - al final de la parte estable del system (reglas + contexto de la empresa), que se reusa entre chats y acciones;
// - en el último mensaje, para que el historial anterior también se lea del caché en el turno siguiente
//   (no en la evaluación: es una sola consulta y escribir en caché cuesta un 25% más).
function cuerpoAnthropic(p, conCache) {
  const body = { model: p.model, max_tokens: p.max_tokens, messages: p.messages, stream: true };
  if (p.system) body.system = p.system;
  if (p.temperature != null) body.temperature = p.temperature;
  if (!conCache) return body;
  const marca = { type: "ephemeral" };
  if (CACHE.ttl === "1h") marca.ttl = "1h";
  if (p.system) {
    const n = p.systemEstable;
    body.system = n
      ? [{ type: "text", text: p.system.slice(0, n), cache_control: marca }, { type: "text", text: p.system.slice(n) }]
      : [{ type: "text", text: p.system, cache_control: marca }];
  }
  if (p.purpose !== "eval" && p.messages.length) {
    const ult = p.messages[p.messages.length - 1];
    body.messages = [...p.messages.slice(0, -1), { role: ult.role, content: [{ type: "text", text: ult.content, cache_control: marca }] }];
  }
  return body;
}

async function runAnthropic(p, ctx) {
  const prov = PROVIDERS.anthropic;
  let conCache = CACHE.activo;
  let upstream;
  for (;;) {
    try {
      upstream = await fetch(prov.baseUrl + "/messages", {
        method: "POST", signal: ctx.signal,
        headers: { "content-type": "application/json", "x-api-key": prov.key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(cuerpoAnthropic(p, conCache))
      });
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      throw provError(502, "No se pudo conectar con la API de Claude. Revisá tu conexión a internet.", "network");
    }
    if (upstream.ok || !conCache || upstream.status !== 400) break;
    // Si la API rechaza el pedido por el caché, sale igual que antes: sin caché.
    let raw = "";
    try { raw = await upstream.text(); } catch (_) {}
    if (!/cache/i.test(raw)) { upstream = { ok: false, status: 400, text: async () => raw }; break; }
    ctx.log && ctx.log("la API rechazó el caché de prompts; reintento sin caché");
    conCache = false;
  }
  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch (_) {}
    try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || ""; } catch (_) { msg = raw.slice(0, 300); }
    if (upstream.status === 401) throw provError(401, "La ANTHROPIC_API_KEY del .env no es válida.", "sesion");
    if (upstream.status === 404) throw provError(404, `El modelo "${p.model}" no existe o no está disponible. Revisá ANTHROPIC_MODEL en el .env.`, "modelo");
    throw provError(upstream.status, msg || "Error de la API de Claude", upstream.status === 529 ? "saturado" : "");
  }
  await leerSSE(upstream.body, ctx, j => {
    if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta" && j.delta.text) ctx.onText(j.delta.text);
    else if (j.type === "message_start" && j.message && j.message.usage) {
      // input_tokens es solo lo que va después del último corte del caché: el total es la suma.
      const u = j.message.usage, w = u.cache_creation_input_tokens || 0, r = u.cache_read_input_tokens || 0;
      ctx.onUsage({ in: (u.input_tokens || 0) + w + r, cacheWrite: w, cacheRead: r });
    }
    else if (j.type === "message_delta" && j.usage) ctx.onUsage({ out: j.usage.output_tokens });
    else if (j.type === "error") {
      const tipo = j.error && j.error.type;
      throw provError(tipo === "overloaded_error" ? 529 : 500, (j.error && j.error.message) || "Error de la API de Claude", tipo === "overloaded_error" ? "saturado" : "");
    }
  }, "Claude");
}
module.exports = { runAnthropic };
