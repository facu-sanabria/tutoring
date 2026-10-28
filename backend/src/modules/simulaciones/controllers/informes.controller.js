const { json, fail } = require("../../../shared/http/respuesta");
const { bodyObject } = require("../../../shared/http/body");
const { exigir, MSG_SIN_PERMISO } = require("../../../shared/http/permisos");
const { safeId } = require("../../../shared/utils/validacion");
const { LIMITS } = require("../../../config/limits");
const service = require("../services/informes.service");

function listar(req, res, { yo }) {
  return json(res, 200, service.listar(yo));
}

async function crear(req, res, { yo }) {
  const r = await bodyObject(req, res, LIMITS.informe, "");
  if (!r) return;
  const out = service.crear(r, yo);
  return out.error ? fail(res, out.error.status, out.error.message) : json(res, 200, { id: out.id });
}

// /api/informes/:id: el id se valida antes que el método.
async function porId(req, res, { yo, params }) {
  const id = params[0];
  if (!safeId(id)) return fail(res, 400, "Identificador de informe inválido");
  if (req.method === "GET") {
    const out = service.obtener(id, yo, MSG_SIN_PERMISO);
    return out.error ? fail(res, out.error.status, out.error.message) : json(res, 200, out.informe);
  }
  if (req.method === "DELETE") {
    if (!exigir(res, yo, ["empresa"])) return;
    try { service.borrar(id); } catch (_) { return fail(res, 500, "No se pudo eliminar el informe"); }
    return json(res, 200, { ok: true });
  }
  return fail(res, 405, "Método no permitido");
}

module.exports = { listar, crear, porId };
