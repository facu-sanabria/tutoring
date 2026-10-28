const { fail } = require("./respuesta");
const MSG_NO_INGRESO = "Tu sesión venció o no ingresaste. Volvé a ingresar.";
const MSG_SIN_PERMISO = "No tenés permiso para hacer esto.";

// Responde 401/403 y devuelve false si no hay sesión o el rol no alcanza.
function exigir(res, u, roles) {
  if (!u) { fail(res, 401, MSG_NO_INGRESO, "sin_ingreso"); return false; }
  if (roles && !roles.includes(u.rol)) { fail(res, 403, MSG_SIN_PERMISO); return false; }
  return true;
}
// Un POST/PUT/DELETE que viene de otra página no puede usar la sesión de quien la tiene abierta.
function mismoOrigen(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}
module.exports = { MSG_NO_INGRESO, MSG_SIN_PERMISO, exigir, mismoOrigen };
