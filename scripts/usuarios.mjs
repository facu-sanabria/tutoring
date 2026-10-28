/* Administración de usuarios por consola (no hay pantalla para esto todavía).

       npm run usuarios -- crear --rol estudiante --nombre "Juan Pérez" [--usuario jperez]
       npm run usuarios -- listar
       npm run usuarios -- resetear jperez        (código inicial nuevo)
       npm run usuarios -- desactivar jperez      /  activar jperez
       npm run usuarios -- demo                   (cuentas candidato-demo, junior-demo y empresa-demo, clave 1234)

   Usa la misma carpeta de datos que el servidor: DATA_DIR o data/.               */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const crearAuth = require("../auth.js");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Solo nos interesa DATA_DIR del .env; la variable de entorno tiene prioridad, como en server.js.
function dataDirDelEnv() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR.trim();
  try {
    const m = fs.readFileSync(path.join(RAIZ, ".env"), "utf8").match(/^\s*(?:export\s+)?DATA_DIR\s*=\s*["']?([^"'\r\n]*)/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch (_) {}
  return "data";
}

// Las cuentas de prueba están en auth.js: el servidor también las crea si arranca sin usuarios.
export const CUENTAS_DEMO = crearAuth.CUENTAS_DEMO;
export const crearCuentasDemo = auth => auth.crearCuentasDemo();

const AYUDA = `Uso: npm run usuarios -- <comando>

  crear --rol <estudiante|junior|empresa> --nombre "Nombre Apellido" [--usuario u]
  listar
  resetear <usuario>
  desactivar <usuario>
  activar <usuario>
  demo`;

function opcion(args, nombre) {
  const i = args.indexOf("--" + nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args) {
  const dataDir = path.resolve(RAIZ, dataDirDelEnv());
  const auth = crearAuth(dataDir);
  const [cmd, arg] = args;
  switch (cmd) {
    case "crear": {
      const r = auth.crearUsuario({ rol: opcion(args, "rol"), nombre: opcion(args, "nombre"), usuario: opcion(args, "usuario") });
      console.log(`Usuario creado: ${r.usuario}\nCódigo inicial: ${r.codigo}\nEn el primer ingreso va a tener que crear su contraseña.`);
      return 0;
    }
    case "listar": {
      const l = auth.listar();
      if (!l.length) { console.log("Todavía no hay usuarios."); return 0; }
      for (const u of l) console.log([u.usuario.padEnd(16), u.nombre.padEnd(26), u.rol.padEnd(11), u.activo ? "activo" : "INACTIVO", u.debeCambiar ? "· falta crear contraseña" : ""].join("  ").trimEnd());
      return 0;
    }
    case "resetear":
      console.log(`Código inicial nuevo para ${arg}: ${auth.resetear(arg)}\nSe cerraron sus sesiones abiertas.`);
      return 0;
    case "desactivar":
    case "activar":
      auth.setActivo(arg, cmd === "activar");
      console.log(`${arg}: ${cmd === "activar" ? "activado" : "desactivado (se cerraron sus sesiones)"}.`);
      return 0;
    case "demo":
      crearCuentasDemo(auth);
      console.log("Cuentas de demo listas (usuario / contraseña):");
      for (const c of CUENTAS_DEMO) console.log(`  ${c.usuario.padEnd(15)} / ${c.clave.padEnd(6)} ${c.nombre}`);
      return 0;
    default:
      console.error(AYUDA);
      return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error("Error: " + e.message); process.exitCode = 2; }
}
