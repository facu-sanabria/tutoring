// Migraciones contra un Postgres de verdad. Necesita TEST_DATABASE_URL (por ejemplo, el de Docker);
// sin eso, se saltean. Cada corrida usa un esquema propio con nombre al azar y lo borra al final,
// así no toca las tablas de desarrollo de esa base.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { migrar } from "../scripts/db.mjs";

const URL = process.env.TEST_DATABASE_URL || "";
const omitir = URL ? false : "falta TEST_DATABASE_URL (levantá Postgres con docker compose up -d)";
const ESQUEMA = "prueba_" + crypto.randomBytes(4).toString("hex");
let cliente;
async function conectar() {
  if (!cliente) { cliente = new pg.Client({ connectionString: URL }); await cliente.connect(); }
  return cliente;
}
after(async () => {
  if (!cliente) return;
  await cliente.query(`DROP SCHEMA IF EXISTS "${ESQUEMA}" CASCADE`);
  await cliente.end();
});

const TABLAS = ["consumo_ia", "contextos", "criterio_indicadores", "criterios", "empresas", "escenario_glosario",
  "escenarios", "identidades_externas", "informe_criterios", "informe_observaciones", "informes", "invitaciones",
  "migraciones", "simulaciones", "transcripcion_turnos", "usuarios"];

test("db:estado lista las 4 migraciones pendientes sin aplicar nada", { skip: omitir }, async () => {
  assert.deepEqual(await migrar({ databaseUrl: URL, schema: ESQUEMA, soloMirar: true }), [
    "0001_empresas_usuarios_invitaciones", "0002_configuracion_de_empresa",
    "0003_simulaciones_informes_consumo", "0004_extension_vector"
  ]);
  const c = await conectar();
  const { rows } = await c.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'usuarios'", [ESQUEMA]);
  assert.equal(rows[0].n, 0);
});

test("db:migrar crea todas las tablas y la vista", { skip: omitir }, async () => {
  assert.equal((await migrar({ databaseUrl: URL, schema: ESQUEMA })).length, 4);
  const c = await conectar();
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY 1", [ESQUEMA]);
  assert.deepEqual(t.rows.map(r => r.table_name), TABLAS);
  const v = await c.query("SELECT count(*)::int n FROM information_schema.views WHERE table_schema = $1 AND table_name = 'consumo_mensual_por_empresa'", [ESQUEMA]);
  assert.equal(v.rows[0].n, 1);
  const x = await c.query("SELECT count(*)::int n FROM pg_extension WHERE extname = 'vector'");
  assert.equal(x.rows[0].n, 1);
});

test("correr db:migrar otra vez no hace nada", { skip: omitir }, async () => {
  assert.deepEqual(await migrar({ databaseUrl: URL, schema: ESQUEMA }), []);
});

test("las reglas de la base funcionan después de migrar (email en minúsculas)", { skip: omitir }, async () => {
  const c = await conectar();
  await c.query(`SET search_path TO "${ESQUEMA}", public`);
  const emp = (await c.query("INSERT INTO empresas (nombre) VALUES ('Prueba') RETURNING id")).rows[0].id;
  await assert.rejects(c.query("INSERT INTO usuarios (empresa_id, email, nombre, rol) VALUES ($1, 'Maria@Gmail.com', 'María', 'estudiante')", [emp]), /usuarios_email_check/);
});
