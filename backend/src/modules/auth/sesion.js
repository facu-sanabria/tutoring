// Usuarios y sesiones: instancia de auth sobre data/, cuentas demo y llave local de los scripts.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA } = require("../../config/paths");
const { cookieDe } = require("../../shared/http/cookies");
// Los usuarios se crean con npm run usuarios (scripts/usuarios.mjs). Ver auth.service.js.
const auth = require("./auth.service")(DATA);
// Primer arranque (sin ningún usuario): se crean las cuentas de prueba para poder entrar con solo npm start.
if (!auth.listar().length) auth.crearCuentasDemo();
// Llave local: los scripts de esta compu (chequeo, probar-ia, evals) la leen de este archivo y la mandan
// en x-llave-local. Quien puede leer data/ ya puede leer el .env, así que no abre nada nuevo.
const LLAVE_LOCAL = crypto.randomBytes(32).toString("hex");
try { fs.writeFileSync(path.join(DATA, "llave-local.txt"), LLAVE_LOCAL + "\n"); }
catch (e) { console.error("  No se pudo escribir data/llave-local.txt: los scripts de chequeo no van a poder entrar.", e.message); }

function usuarioDe(req) {
  const llave = req.headers["x-llave-local"];
  if (typeof llave === "string" && llave.length === LLAVE_LOCAL.length && crypto.timingSafeEqual(Buffer.from(llave), Buffer.from(LLAVE_LOCAL))) {
    return { id: "local", usuario: "local", nombre: "Script local", rol: "empresa", debeCambiar: false, local: true };
  }
  return auth.sesion(cookieDe(req, "sesion"));
}
module.exports = { auth, usuarioDe };
