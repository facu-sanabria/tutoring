// Orden de chequeos de la API (el mismo que tenía handleApi en server.js):
// origen → chequeo local → ingreso → sesión → contraseña pendiente → rutas de los módulos.
const { fail } = require("./shared/http/respuesta");
const { exigir, mismoOrigen, MSG_SIN_PERMISO } = require("./shared/http/permisos");
const { crearRouter } = require("./shared/http/router");
const { usuarioDe } = require("./modules/auth/sesion");
const auth = require("./modules/auth/auth.routes");
const ia = require("./modules/ia/ia.routes");
const { chequeo } = require("./modules/ia/chequeo.controller");
const empresa = require("./modules/empresa/empresa.routes");
const simulaciones = require("./modules/simulaciones/simulaciones.routes");

const publicas = crearRouter(auth.publicas);
const privadas = crearRouter([...auth.privadas, ...ia, ...simulaciones, ...empresa]);

async function handleApi(req, res, url) {
  const libre = url.pathname.startsWith("/api/chequeo/");   // solo desde esta compu, ver chequeo.controller.js
  if (!libre && ["POST", "PUT", "DELETE"].includes(req.method) && !mismoOrigen(req)) return fail(res, 403, MSG_SIN_PERMISO);
  if (libre) return chequeo(req, res, url);

  if (await publicas(req, res, { url })) return;

  const yo = usuarioDe(req);
  if (!exigir(res, yo)) return;
  if (yo.debeCambiar && !["/api/yo", "/api/contrasena", "/api/logout"].includes(url.pathname)) return fail(res, 403, "Primero creá tu contraseña.");

  if (await privadas(req, res, { url, yo })) return;
  return fail(res, 404, "Ruta no encontrada");
}

module.exports = { handleApi };
