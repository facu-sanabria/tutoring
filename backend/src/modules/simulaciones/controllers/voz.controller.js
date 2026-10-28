const { json, fail } = require("../../../shared/http/respuesta");
const { readBody } = require("../../../shared/http/body");
const { isObj } = require("../../../shared/utils/validacion");
const service = require("../services/voz.service");

async function token(req, res) {
  // El cuerpo es opcional: {descartar, motivo} cuando la key anterior falló en el navegador.
  let pedido = {};
  try { const raw = await readBody(req, 4096); pedido = raw ? JSON.parse(raw) : {}; } catch (_) {}
  const r = await service.token(isObj(pedido) ? pedido : {});
  return r.error ? fail(res, r.status, r.error) : json(res, 200, r);
}

module.exports = { token };
