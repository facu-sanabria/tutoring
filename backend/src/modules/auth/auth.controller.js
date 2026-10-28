const { json, fail } = require("../../shared/http/respuesta");
const { bodyObject } = require("../../shared/http/body");
const { cookieDe } = require("../../shared/http/cookies");
const { auth } = require("./sesion");

const COOKIE_BASE = "HttpOnly; SameSite=Lax; Path=/";

async function ingresar(req, res) {
  const body = await bodyObject(req, res, 4096, "");
  if (!body) return;
  const r = auth.ingresar(body.usuario, body.clave, req.socket.remoteAddress);
  if (r.status === 429) { res.setHeader("retry-after", String(r.retryAfter)); return fail(res, 429, "Probaste muchas veces. Esperá un minuto y volvé a intentar."); }
  if (!r.ok) return fail(res, 401, "Usuario o contraseña incorrectos.");
  res.setHeader("set-cookie", `sesion=${r.token}; ${COOKIE_BASE}; Max-Age=43200${req.socket.encrypted ? "; Secure" : ""}`);
  return json(res, 200, { nombre: r.usuario.nombre, rol: r.usuario.rol, debeCambiar: r.usuario.debeCambiar });
}

function yo(req, res, { yo }) {
  return json(res, 200, { id: yo.id, usuario: yo.usuario, nombre: yo.nombre, rol: yo.rol, debeCambiar: yo.debeCambiar });
}

function salir(req, res) {
  auth.salir(cookieDe(req, "sesion"));
  res.setHeader("set-cookie", `sesion=; ${COOKIE_BASE}; Max-Age=0`);
  return json(res, 200, { ok: true });
}

async function cambiarClave(req, res) {
  const body = await bodyObject(req, res, 4096, "");
  if (!body) return;
  const r = auth.cambiarClave(cookieDe(req, "sesion"), { actual: body.actual, nueva: body.nueva });
  return r.ok ? json(res, 200, { ok: true }) : fail(res, r.status, r.mensaje);
}

module.exports = { ingresar, yo, salir, cambiarClave };
