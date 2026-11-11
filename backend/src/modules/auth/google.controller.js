// POST /api/auth/google: "Entrar con Google".
// El navegador manda el ID token que le dio Google; acá se verifica y se decide si la persona entra:
//   1. ya tiene identidad de Google guardada  -> entra (si sigue activa)
//   2. no la tiene, pero hay invitación vigente para su email -> se crea su usuario y entra
//   3. ninguna de las dos -> 403, sin guardar nada (ni en la base ni el email en el log)
const fs = require("fs");
const { json, fail } = require("../../shared/http/respuesta");
const { bodyObject } = require("../../shared/http/body");
const { esHttps } = require("../../shared/http/proxy");
const { env } = require("../../config/env");
const { crearVerificadorGoogle, ErrorGoogle } = require("./google");
const { jwt, loginPostgres, repoPg } = require("./sesion");

const CLIENT_ID = env("GOOGLE_CLIENT_ID");
const MSG_SIN_ACCESO = "Tu cuenta de Google no tiene acceso a Tutoring. Si una empresa te invitó, entrá con el mismo email al que te llegó la invitación.";
const MSG_NO_DISPONIBLE = "El ingreso con Google no está disponible en este momento.";

// Solo para las pruebas automáticas: claves falsas en lugar de las de Google. Nunca en producción.
function certsDePrueba() {
  const archivo = env("GOOGLE_CERTS_PRUEBA");
  if (!archivo) return undefined;
  if (env("NODE_ENV") === "production") throw new Error("GOOGLE_CERTS_PRUEBA no se puede usar en producción.");
  console.warn("  [auth] ATENCIÓN: usando claves de Google de PRUEBA (GOOGLE_CERTS_PRUEBA). Solo para tests.");
  const certs = JSON.parse(fs.readFileSync(archivo, "utf8"));
  return async () => certs;
}
const verificarTokenGoogle = crearVerificadorGoogle({ clientId: CLIENT_ID, obtenerCerts: certsDePrueba() });

const habilitado = () => Boolean(CLIENT_ID && loginPostgres);

// GET /api/auth/config (pública): lo que el navegador necesita para mostrar el botón. El Client ID es público.
function configuracion(req, res) {
  return json(res, 200, { google: habilitado() ? { clientId: CLIENT_ID } : null });
}

function ponerCookie(req, res, token) {
  res.setHeader("set-cookie", `acceso=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${jwt.DURACION_SEG}${esHttps(req) ? "; Secure" : ""}`);
}

async function entrarConGoogle(req, res) {
  if (!habilitado()) return fail(res, 503, MSG_NO_DISPONIBLE);
  const body = await bodyObject(req, res, 16384, "");
  if (!body) return;

  let persona;
  try { persona = await verificarTokenGoogle(body.credential); }
  catch (e) {
    if (e instanceof ErrorGoogle) { console.warn(`[auth] ingreso con Google rechazado: ${e.codigo}`); return fail(res, 401, e.message); }
    throw e;
  }

  try {
    let u = await repoPg.buscarPorIdentidad("google", persona.sub);
    if (!u) u = await repoPg.aceptarInvitacion({ proveedor: "google", ...persona });
    if (!u) { console.warn("[auth] ingreso con Google denegado: sin invitación vigente"); return fail(res, 403, MSG_SIN_ACCESO); }
    if (!u.activo) { console.warn("[auth] ingreso con Google denegado: cuenta desactivada"); return fail(res, 403, MSG_SIN_ACCESO); }
    ponerCookie(req, res, await jwt.firmar({ usuarioId: u.id, tokenVersion: u.tokenVersion, metodo: "google" }));
    return json(res, 200, { nombre: u.nombre, rol: u.rol, empresa: u.empresa });
  } catch (e) {
    console.error("[auth] error de la base en el ingreso con Google:", e.message);
    return fail(res, 503, MSG_NO_DISPONIBLE);
  }
}

module.exports = { configuracion, entrarConGoogle };
