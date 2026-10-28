const { LIMITS } = require("../../config/limits");
const { isObj } = require("../utils/validacion");
// El historial que recibe el modelo tiene que alternar user/assistant y empezar en user.
// El front ya lo normaliza, pero lo repetimos acá: un historial mal armado es un 400 del proveedor.
function sanitizeMessages(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const m of list) {
    if (!isObj(m)) continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    let content = typeof m.content === "string" ? m.content
      : Array.isArray(m.content) ? m.content.map(p => (p && typeof p.text === "string" ? p.text : "")).join("") : "";
    content = content.slice(0, LIMITS.caracteresPorMensaje).trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out.slice(-LIMITS.mensajesCant);
}

// Solo dejamos pasar los campos que usa la app: el navegador no elige el modelo ni el proveedor.
function sanitizePayload(payload) {
  const msgs = sanitizeMessages(payload.messages);
  const out = { messages: msgs };
  if (typeof payload.system === "string" && payload.system.trim()) out.system = payload.system.slice(0, 600_000);
  // Hasta qué carácter el system no cambia entre consultas (para el caché). Si no cierra, se ignora.
  const est = Number(payload.system_estable);
  if (out.system && out.system.length === payload.system.length && Number.isInteger(est) && est > 0 && est < out.system.length) out.systemEstable = est;
  const mt = Number(payload.max_tokens);
  out.max_tokens = Number.isFinite(mt) ? Math.min(LIMITS.maxTokens, Math.max(16, Math.round(mt))) : 1024;
  const temp = Number(payload.temperature);
  if (Number.isFinite(temp)) out.temperature = Math.min(1, Math.max(0, temp));
  return out;
}
module.exports = { sanitizeMessages, sanitizePayload };
