// Invita a una persona a una empresa. La empresa se crea si no existe.
//   npm run invitar -- --empresa "MKT Contact Center" --email maria@gmail.com --rol estudiante [--dias 7]
// Imprime el link para mandarle a la persona (por WhatsApp, mail, etc.). El link solo lleva al ingreso:
// lo que la deja entrar es que su cuenta de Google tenga el mismo email que la invitación.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { env } = require("../backend/src/config/env.js");
const { cerrarPool } = require("../backend/src/shared/db.js");
const repo = require("../backend/src/modules/auth/usuarios-pg.repository.js");

const ROLES = ["estudiante", "junior", "empresa"];
const USO = 'Uso: npm run invitar -- --empresa "Nombre" --email persona@gmail.com --rol estudiante|junior|empresa [--dias 7]';

function leerArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(empresa|email|rol|dias)$/);
    if (!m || argv[i + 1] === undefined) throw new Error(USO);
    a[m[1]] = argv[++i];
  }
  return a;
}

try {
  const a = leerArgs(process.argv.slice(2));
  const empresa = String(a.empresa || "").trim();
  const email = String(a.email || "").trim().toLowerCase();
  const rol = String(a.rol || "").trim();
  const dias = a.dias === undefined ? 7 : Number(a.dias);
  if (!empresa || !email || !rol) throw new Error(USO);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El email no parece válido.");
  if (!ROLES.includes(rol)) throw new Error(`El rol tiene que ser uno de: ${ROLES.join(", ")}.`);
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) throw new Error("--dias tiene que ser un número entero entre 1 y 90.");

  const inv = await repo.crearInvitacion({ empresa, email, rol, dias });
  const base = (env("APP_URL") || `http://localhost:${env("PORT") || 3000}`).replace(/\/+$/, "");
  if (inv.empresaNueva) console.log(`Empresa nueva: ${empresa}`);
  console.log(`Invitación creada para ${email} (${rol}) en ${empresa}.`);
  console.log(`Vence: ${new Date(inv.vence_en).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`);
  console.log(`\nMandale este link:\n  ${base}/\nTiene que tocar "Entrar con Google" con la cuenta ${email}.`);
} catch (e) {
  console.error("No se pudo crear la invitación:", e.message);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
