// Conexión a Postgres. Un único pool para todo el servidor: un grupo de conexiones abiertas
// que se reutilizan entre pedidos (abrir una conexión por pedido es lento).
// Se crea recién la primera vez que alguien lo pide, así el servidor arranca aunque no haya DATABASE_URL.
const { Pool } = require("pg");
const { env, envNum } = require("../config/env");

let pool = null;

function obtenerPool() {
  if (pool) return pool;
  const url = env("DATABASE_URL");
  if (!url) throw new Error("Falta DATABASE_URL en el .env (ver .env.example).");
  pool = new Pool({ connectionString: url, max: envNum("DB_POOL_MAX", 10) });
  // Una conexión que estaba quieta en el pool puede caerse (por ejemplo, si reinician la base).
  // Sin este manejador, ese error tira abajo todo el proceso de Node.
  pool.on("error", e => console.error("[db] se cayó una conexión inactiva:", e.message));
  return pool;
}

// Atajo para una consulta suelta: query("SELECT ... WHERE id = $1", [id]).
// Los valores van SIEMPRE como parámetros ($1, $2...), nunca pegados en el texto: eso evita la inyección SQL.
const query = (texto, valores) => obtenerPool().query(texto, valores);

async function cerrarPool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

module.exports = { obtenerPool, query, cerrarPool };
