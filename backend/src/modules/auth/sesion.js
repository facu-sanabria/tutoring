// Usuarios y sesiones: instancia de auth sobre data/, cuentas demo y llave local de los scripts.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA } = require("../../config/paths");
const { env } = require("../../config/env");
const { cookieDe } = require("../../shared/http/cookies");
// Los usuarios se crean con npm run usuarios (scripts/usuarios.mjs). Ver auth.service.js.
const auth = require("./auth.service")(DATA);
// Primer arranque (sin ningún usuario): se crean las cuentas de prueba para poder entrar con solo npm start.
// En un servidor público va CUENTAS_DEMO=off: su clave es conocida.
if (!auth.listar().length && env("CUENTAS_DEMO") !== "off") auth.crearCuentasDemo();
// Llave local: los scripts de esta compu (chequeo, probar-ia, evals) la leen de este archivo y la mandan
// en x-llave-local. Quien puede leer data/ ya puede leer el .env, así que no abre nada nuevo.
const LLAVE_LOCAL = crypto.randomBytes(32).toString("hex");
try { fs.writeFileSync(path.join(DATA, "llave-local.txt"), LLAVE_LOCAL + "\n"); }
catch (e) { console.error("  No se pudo escribir data/llave-local.txt: los scripts de chequeo no van a poder entrar.", e.message); }

// JWT de sesión para quienes entran con Google (usuarios en Postgres). Sin JWT_SECRET o sin DATABASE_URL,
// ese camino queda apagado y todo funciona como antes.
const jwt = require("./jwt").crearJwt(env("JWT_SECRET"));
const loginPostgres = jwt.disponible && Boolean(env("DATABASE_URL"));
const repoPg = loginPostgres ? require("./usuarios-pg.repository") : null;

// Usuario con la cookie "acceso", o null. El token dice quién es; la base dice si sigue activo,
// qué rol tiene y si el token no fue invalidado (token_version).
async function usuarioDelJwt(token) {
  if (!loginPostgres || !token) return null;
  const datos = await jwt.verificar(token);
  if (!datos) return null;
  let u;
  try { u = await repoPg.buscarPorId(datos.usuarioId); }
  catch (e) { console.error("[auth] no se pudo leer el usuario de la base:", e.message); return null; }
  if (!u || !u.activo || u.tokenVersion !== datos.tokenVersion) return null;
  return { id: u.id, usuario: u.email, nombre: u.nombre, rol: u.rol, debeCambiar: false, empresaId: u.empresaId, metodo: datos.metodo };
}

// Orden: llave local de los scripts → JWT (Postgres) → sesión vieja (usuarios.json).
// TRANSICIÓN (paso 3a): la sesión vieja se va en el paso 3b, cuando las contraseñas pasen a Postgres.
async function usuarioDe(req) {
  const llave = req.headers["x-llave-local"];
  if (typeof llave === "string" && llave.length === LLAVE_LOCAL.length && crypto.timingSafeEqual(Buffer.from(llave), Buffer.from(LLAVE_LOCAL))) {
    return { id: "local", usuario: "local", nombre: "Script local", rol: "empresa", debeCambiar: false, local: true };
  }
  return (await usuarioDelJwt(cookieDe(req, "acceso"))) || auth.sesion(cookieDe(req, "sesion"));
}
module.exports = { auth, usuarioDe, jwt, loginPostgres, repoPg };
