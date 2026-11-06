/* Pruebas de lo que hace falta para correr detrás del balanceador (ALB) y de Cloudflare:
   /health, cuentas de prueba apagadas, cookie Secure, IP real del cliente y apagado con SIGTERM. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startApp, pedir, CLAVE_PRUEBA } from "./helpers.mjs";

const login = (app, usuario, clave, headers = {}) => pedir(app.base, "/api/login", { method: "POST", json: { usuario, clave }, cookie: null, headers });
// 30 fallos con usuarios distintos bloquean la IP (MAX_FALLOS_IP en auth.service.js).
async function agotarIp(app, headers, prefijo) {
  for (let i = 0; i < 30; i++) await login(app, `${prefijo}${i}`, "mal", headers);
}

describe("sin TRUST_PROXY (npm start en la compu)", () => {
  let app;
  before(async () => { app = await startApp(); });
  after(async () => { await app.stop(); });

  test("/health responde sin sesión", async () => {
    const r = await pedir(app.base, "/health", { cookie: null });
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { ok: true });
  });

  test("ignora x-forwarded-proto: no pone Secure por un header que manda el cliente", async () => {
    const r = await login(app, "estudiante1", CLAVE_PRUEBA, { "x-forwarded-proto": "https" });
    assert.equal(r.status, 200);
    assert.ok(!/Secure/.test(r.headers.get("set-cookie")));
  });

  test("ignora x-forwarded-for: cambiar el header no esquiva el límite por IP", async () => {
    await agotarIp(app, { "x-forwarded-for": "1.1.1.1" }, "a");
    assert.equal((await login(app, "otro", "mal", { "x-forwarded-for": "2.2.2.2" })).status, 429);
  });
});

describe("TRUST_PROXY=alb", () => {
  let app;
  before(async () => { app = await startApp({ env: { TRUST_PROXY: "alb" } }); });
  after(async () => { await app.stop(); });

  test("la cookie sale Secure si el balanceador recibió https", async () => {
    const r = await login(app, "estudiante1", CLAVE_PRUEBA, { "x-forwarded-proto": "https" });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /; Secure/);
  });

  test("la cookie no sale Secure si llegó por http", async () => {
    const r = await login(app, "estudiante2", CLAVE_PRUEBA, { "x-forwarded-proto": "http" });
    assert.ok(!/Secure/.test(r.headers.get("set-cookie")));
  });

  test("el límite por IP separa a los clientes y usa la IP que agregó el balanceador (la última)", async () => {
    await agotarIp(app, { "x-forwarded-for": "9.9.9.9, 3.3.3.3" }, "b");
    assert.equal((await login(app, "otro", "mal", { "x-forwarded-for": "8.8.8.8, 3.3.3.3" })).status, 429, "misma IP real, primer valor falsificado");
    assert.equal((await login(app, "otro", "mal", { "x-forwarded-for": "4.4.4.4" })).status, 401, "otro cliente sigue pudiendo entrar");
  });
});

describe("TRUST_PROXY=cloudflare", () => {
  let app;
  before(async () => { app = await startApp({ env: { TRUST_PROXY: "cloudflare" } }); });
  after(async () => { await app.stop(); });

  test("el límite por IP usa cf-connecting-ip", async () => {
    await agotarIp(app, { "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "5.5.5.5, 162.158.0.1" }, "c");
    assert.equal((await login(app, "otro", "mal", { "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "5.5.5.5, 162.158.0.1" })).status, 429);
    assert.equal((await login(app, "otro", "mal", { "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6, 162.158.0.1" })).status, 401);
  });
});

// Con el túnel, cloudflared corre al lado de la app: todo el tráfico de internet llega desde 127.0.0.1.
describe("chequeo local", () => {
  test("con TRUST_PROXY, /api/chequeo/ no responde aunque la conexión venga de 127.0.0.1", async () => {
    const app = await startApp({ env: { TRUST_PROXY: "cloudflare" } });
    try {
      for (const [ruta, method] of [["/api/chequeo/estado", "GET"], ["/api/chequeo/ia", "POST"], ["/api/chequeo/live", "POST"]]) {
        const r = await pedir(app.base, ruta, { method, cookie: null, json: method === "POST" ? {} : undefined });
        assert.equal(r.status, 403, ruta);
      }
    } finally { await app.stop(); }
  });

  test("sin TRUST_PROXY, /api/chequeo/ sigue andando desde esta compu", async () => {
    const app = await startApp();
    try { assert.equal((await pedir(app.base, "/api/chequeo/estado", { cookie: null })).status, 200); }
    finally { await app.stop(); }
  });
});

describe("CUENTAS_DEMO=off", () => {
  let app;
  before(async () => { app = await startApp({ sinUsuarios: true, sinIngreso: true, env: { CUENTAS_DEMO: "off" } }); });
  after(async () => { await app.stop(); });

  test("el primer arranque no crea cuentas con clave conocida", async () => {
    for (const u of ["candidato-demo", "junior-demo", "empresa-demo"]) assert.equal((await login(app, u, "1234")).status, 401, u);
    assert.doesNotMatch(app.log(), /Cuentas de prueba activas/);
  });
});

test("con SIGTERM el proceso termina enseguida (lo manda ECS al reemplazar una tarea)", async () => {
  const app = await startApp();
  try {
    const salida = new Promise(res => app.proc.once("exit", (code, signal) => res({ code, signal })));
    app.proc.kill("SIGTERM");
    assert.deepEqual(await salida, { code: 0, signal: null });
  } finally { await app.stop(); }
});
