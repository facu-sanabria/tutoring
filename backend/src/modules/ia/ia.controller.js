const { json, fail } = require("../../shared/http/respuesta");
const { bodyObject } = require("../../shared/http/body");
const { exigir } = require("../../shared/http/permisos");
const { LIMITS } = require("../../config/limits");
const { sanitizePayload } = require("../../shared/llm/payload");
const { responder } = require("../../shared/llm/cadena");
const service = require("./ia.service");

async function config(req, res) {
  return json(res, 200, await service.config());
}

async function diagnostico(req, res, { yo }) {
  if (!exigir(res, yo, ["empresa"])) return;   // hace una consulta real a la IA
  return json(res, 200, await service.diagnostico());
}

// Consulta a la IA
async function mensajes(req, res) {
  const body = await bodyObject(req, res, LIMITS.mensajes, "Quitá algún documento del contexto de la empresa.");
  if (!body) return;
  const purpose = ["chat", "eval", "voice"].includes(body.purpose) ? body.purpose : "chat";
  const payload = sanitizePayload(body);
  if (!payload.messages.length) return fail(res, 400, "El pedido no trae ningún mensaje para responder.");
  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  return responder(purpose, payload, res, controller.signal);
}

module.exports = { config, diagnostico, mensajes };
