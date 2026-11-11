// ¿Hay un Postgres de prueba disponible? Devuelve false si se puede usar, o el motivo para saltear.
// Así npm test no falla cuando Docker está apagado: las pruebas de la base se saltean con el aviso.
import pg from "pg";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../backend/src/config/env.js");   // carga el .env (TEST_DATABASE_URL puede estar ahí)

export const URL_PRUEBA = process.env.TEST_DATABASE_URL || "";

export async function motivoParaSaltear() {
  if (!URL_PRUEBA) return "falta TEST_DATABASE_URL (levantá Postgres con docker compose up -d)";
  const c = new pg.Client({ connectionString: URL_PRUEBA, connectionTimeoutMillis: 3000 });
  try { await c.connect(); await c.query("SELECT 1"); return false; }
  catch (e) { return `no se pudo conectar a TEST_DATABASE_URL (¿Docker apagado?): ${e.message}`; }
  finally { try { await c.end(); } catch (_) {} }
}
