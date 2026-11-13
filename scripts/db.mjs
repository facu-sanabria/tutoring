// Migraciones de la base con node-pg-migrate.
//   npm run db:migrar   aplica las migraciones de db/migrations que falten, en orden
//   npm run db:estado   muestra cuáles faltan, sin aplicar nada
// Usa DATABASE_URL del .env. Lo que ya corrió queda anotado en la tabla "migraciones" de la base.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runner } from "node-pg-migrate";
const require = createRequire(import.meta.url);
const { RAIZ, env } = require("../backend/src/config/env.js");

export const DIR_MIGRACIONES = path.join(RAIZ, "db", "migrations");
export const TABLA = "migraciones";

// Aplica (o, con soloMirar, lista) las migraciones pendientes. Devuelve los nombres.
export async function migrar({ databaseUrl = env("DATABASE_URL"), soloMirar = false, schema, log = () => {} } = {}) {
  if (!databaseUrl) throw new Error("Falta DATABASE_URL en el .env (ver .env.example).");
  const corridas = await runner({
    databaseUrl,
    dir: DIR_MIGRACIONES,
    direction: "up",
    migrationsTable: TABLA,
    count: Infinity,
    dryRun: soloMirar,
    checkOrder: true,          // si alguien agrega una migración "en el medio", frena
    singleTransaction: false,  // cada archivo en su propia transacción
    ...(schema ? { schema, createSchema: true, migrationsSchema: schema, createMigrationsSchema: true } : {}),
    log,
    verbose: false
  });
  return corridas.map(m => m.name);
}

// Uso por consola.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const accion = process.argv[2];
  if (!["migrar", "estado"].includes(accion)) {
    console.error("Uso: node scripts/db.mjs migrar | estado");
    process.exit(2);
  }
  try {
    const nombres = await migrar({ soloMirar: accion === "estado" });
    if (!nombres.length) console.log("La base está al día: no hay migraciones pendientes.");
    else console.log((accion === "estado" ? "Pendientes:" : "Aplicadas:") + "\n  " + nombres.join("\n  "));
  } catch (e) {
    console.error("No se pudo " + (accion === "estado" ? "consultar" : "migrar") + " la base:", e.message);
    process.exit(1);
  }
}
