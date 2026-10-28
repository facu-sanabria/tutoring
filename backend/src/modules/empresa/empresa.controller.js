const { json, fail } = require("../../shared/http/respuesta");
const { bodyObject } = require("../../shared/http/body");
const { exigir } = require("../../shared/http/permisos");
const { LIMITS } = require("../../config/limits");
const service = require("./empresa.service");

// Configuración de la empresa (la carga la persona responsable)
function obtener(req, res) {
  const data = service.obtener();
  if (!data) return fail(res, 404, "Sin configuración guardada");
  return json(res, 200, data);
}

async function guardar(req, res, { yo }) {
  if (!exigir(res, yo, ["empresa"])) return;
  const cfg = await bodyObject(req, res, LIMITS.empresa, "Subí documentos más chicos.");
  if (!cfg) return;
  const error = service.validar(cfg);
  if (error) return fail(res, 400, error);
  try { service.guardar(cfg); } catch (_) { return fail(res, 500, "No se pudo escribir data/empresa.json en el disco."); }
  return json(res, 200, { ok: true });
}

module.exports = { obtener, guardar };
