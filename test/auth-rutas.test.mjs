/* Pruebas del login y de los permisos por rol en el servidor.
   Usuarios sembrados por startApp: estudiante1, estudiante2, junior1, empresa1 (clave-de-prueba)
   y nuevo1 (tiene que crear su contraseña; entra con app.codigoNuevo). */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startApp, pedir, pedirMensajes, CLAVE_PRUEBA } from "./helpers.mjs";

const SIN_SESION = "Tu sesión venció o no ingresaste. Volvé a ingresar.";
const MENSAJE = { system: "s", messages: [{ role: "user", content: "hola" }], max_tokens: 64, purpose: "chat" };

describe("login y sesión", () => {
  let app;
  before(async () => { app = await startApp({ provider: "gemini" }); });
  after(async () => { await app.stop(); });

  test("sin sesión, la API responde 401 con el mensaje en español", async () => {
    for (const [ruta, method] of [["/api/config", "GET"], ["/api/empresa", "GET"], ["/api/informes", "GET"], ["/api/yo", "GET"], ["/api/voz/token", "POST"], ["/api/diagnostico", "GET"]]) {
      const r = await pedir(app.base, ruta, { method, cookie: null });
      assert.equal(r.status, 401, ruta);
      assert.equal(r.cuerpo.error.message, SIN_SESION, ruta);
    }
    assert.equal((await pedirMensajes(app.base, MENSAJE, { cookie: null })).status, 401);
  });

  test("sin sesión, la página y sus archivos se sirven igual", async () => {
    assert.equal((await pedir(app.base, "/", { cookie: null })).status, 200);
    assert.equal((await pedir(app.base, "/js/app.js", { cookie: null })).status, 200);
  });

  test("login con clave incorrecta da 401 y no deja cookie", async () => {
    const r = await pedir(app.base, "/api/login", { method: "POST", json: { usuario: "junior1", clave: "mal" }, cookie: null });
    assert.equal(r.status, 401);
    assert.equal(r.cuerpo.error.message, "Usuario o contraseña incorrectos.");
    assert.equal(r.headers.get("set-cookie"), null);
  });

  test("login correcto deja una cookie HttpOnly y /api/yo dice quién es", async () => {
    const r = await pedir(app.base, "/api/login", { method: "POST", json: { usuario: "estudiante1", clave: CLAVE_PRUEBA }, cookie: null });
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { nombre: "Lucas Ferreyra", rol: "estudiante", debeCambiar: false });
    const sc = r.headers.get("set-cookie");
    assert.match(sc, /^sesion=[\w-]{43};/);
    for (const parte of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=43200"]) assert.ok(sc.includes(parte), parte);
    assert.ok(!/Secure/.test(sc));
    const yo = await pedir(app.base, "/api/yo", { cookie: sc.split(";")[0] });
    assert.equal(yo.status, 200);
    assert.equal(yo.cuerpo.usuario, "estudiante1");
    assert.equal(yo.cuerpo.rol, "estudiante");
    assert.equal(yo.cuerpo.nombre, "Lucas Ferreyra");
    assert.ok(yo.cuerpo.id);
  });

  test("después de 5 fallos el login da 429 con Retry-After", async () => {
    let r;
    for (let i = 0; i < 6; i++) r = await pedir(app.base, "/api/login", { method: "POST", json: { usuario: "estudiante2", clave: "mal" + i }, cookie: null });
    assert.equal(r.status, 429);
    assert.equal(r.cuerpo.error.message, "Probaste muchas veces. Esperá un minuto y volvé a intentar.");
    assert.ok(Number(r.headers.get("retry-after")) > 0);
  });

  test("quien tiene que crear su contraseña solo puede hacer eso", async () => {
    const c = await app.ingresar("nuevo1", app.codigoNuevo);
    const bloq = await pedir(app.base, "/api/config", { cookie: c });
    assert.equal(bloq.status, 403);
    assert.equal(bloq.cuerpo.error.message, "Primero creá tu contraseña.");
    assert.equal((await pedir(app.base, "/api/yo", { cookie: c })).cuerpo.debeCambiar, true);
    const corta = await pedir(app.base, "/api/contrasena", { method: "POST", json: { nueva: "1234" }, cookie: c });
    assert.equal(corta.status, 400);
    assert.equal((await pedir(app.base, "/api/contrasena", { method: "POST", json: { nueva: "otra-clave-1" }, cookie: c })).status, 200);
    assert.equal((await pedir(app.base, "/api/config", { cookie: c })).status, 200);
  });

  test("cambiar la contraseña cierra la otra ventana y mantiene la actual", async () => {
    const a = await app.ingresar("junior1"), b = await app.ingresar("junior1");
    const r = await pedir(app.base, "/api/contrasena", { method: "POST", json: { actual: CLAVE_PRUEBA, nueva: "nueva-clave-junior" }, cookie: a });
    assert.equal(r.status, 200);
    assert.equal((await pedir(app.base, "/api/yo", { cookie: a })).status, 200);
    assert.equal((await pedir(app.base, "/api/yo", { cookie: b })).status, 401);
    const mal = await pedir(app.base, "/api/contrasena", { method: "POST", json: { actual: "mal", nueva: "x".repeat(10) }, cookie: a });
    assert.equal(mal.status, 401);
  });

  test("logout cierra la sesión", async () => {
    const c = await app.ingresar("estudiante1");
    const r = await pedir(app.base, "/api/logout", { method: "POST", cookie: c });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /sesion=;.*Max-Age=0/);
    assert.equal((await pedir(app.base, "/api/yo", { cookie: c })).status, 401);
  });

  test("un pedido que modifica algo desde otro origen se rechaza", async () => {
    const cfg = { empresa: "MKT", criterios: [], escenarios: [] };
    const otro = await pedir(app.base, "/api/empresa", { method: "PUT", json: cfg, headers: { origin: "http://otro.com" } });
    assert.equal(otro.status, 403);
    const mismo = await pedir(app.base, "/api/empresa", { method: "PUT", json: cfg, headers: { origin: app.base } });
    assert.equal(mismo.status, 200);
  });

  test("la llave local de data/ sirve a los scripts sin cookie", async () => {
    const llave = fs.readFileSync(path.join(app.dataDir, "llave-local.txt"), "utf8").trim();
    assert.ok(llave.length >= 32);
    assert.equal((await pedir(app.base, "/api/diagnostico", { cookie: null, headers: { "x-llave-local": llave } })).status, 200);
    assert.equal((await pedir(app.base, "/api/diagnostico", { cookie: null, headers: { "x-llave-local": "mal" } })).status, 401);
  });
});

describe("primer arranque sin usuarios", () => {
  let app;
  before(async () => { app = await startApp({ provider: "gemini", sinUsuarios: true }); });
  after(async () => { await app.stop(); });

  test("el servidor crea las tres cuentas de prueba con clave 1234 y lo avisa en la consola", async () => {
    for (const [u, rol] of [["candidato-demo", "estudiante"], ["junior-demo", "junior"], ["empresa-demo", "empresa"]]) {
      const r = await pedir(app.base, "/api/login", { method: "POST", json: { usuario: u, clave: "1234" }, cookie: null });
      assert.equal(r.status, 200, u);
      assert.equal(r.cuerpo.rol, rol);
      assert.equal(r.cuerpo.debeCambiar, false);
    }
    assert.match(app.log(), /candidato-demo/);
    assert.match(app.log(), /desactivalas/i);
  });
});

describe("permisos por rol", () => {
  let app, est1, est2, jun;
  const INFORME = { candidato: "Otro Nombre", fecha: "2026-10-27T12:00:00.000Z", evaluacion: { criterios: [] }, puntaje: 70, escenario: { titulo: "t" } };
  before(async () => {
    app = await startApp({ provider: "gemini" });
    est1 = await app.ingresar("estudiante1");
    est2 = await app.ingresar("estudiante2");
    jun = await app.ingresar("junior1");
  });
  after(async () => { await app.stop(); });

  test("estudiante y junior no pueden diagnosticar, guardar la configuración ni borrar informes", async () => {
    for (const c of [est1, jun]) {
      assert.equal((await pedir(app.base, "/api/diagnostico", { cookie: c })).status, 403);
      const put = await pedir(app.base, "/api/empresa", { method: "PUT", json: { empresa: "X" }, cookie: c });
      assert.equal(put.status, 403);
      assert.equal(put.cuerpo.error.message, "No tenés permiso para hacer esto.");
      assert.equal((await pedir(app.base, "/api/informes/abcdef123", { method: "DELETE", cookie: c })).status, 403);
    }
  });

  test("estudiante y junior sí pueden leer la configuración y usar la IA", async () => {
    await pedir(app.base, "/api/empresa", { method: "PUT", json: { empresa: "MKT", criterios: [], escenarios: [] } });
    for (const c of [est1, jun]) {
      assert.equal((await pedir(app.base, "/api/empresa", { cookie: c })).status, 200);
      assert.equal((await pedir(app.base, "/api/config", { cookie: c })).status, 200);
      assert.equal((await pedirMensajes(app.base, MENSAJE, { cookie: c })).status, 200);
    }
  });

  test("el informe queda a nombre de quien tiene la sesión y solo lo ve su dueño y la empresa", async () => {
    const r = await pedir(app.base, "/api/informes", { method: "POST", json: INFORME, cookie: est1 });
    assert.equal(r.status, 200);
    const id = r.cuerpo.id;
    const propio = await pedir(app.base, "/api/informes/" + id, { cookie: est1 });
    assert.equal(propio.cuerpo.candidato, "Lucas Ferreyra");
    assert.ok(propio.cuerpo.usuarioId);

    assert.ok(!(await pedir(app.base, "/api/informes", { cookie: est2 })).cuerpo.some(x => x.id === id));
    assert.equal((await pedir(app.base, "/api/informes/" + id, { cookie: est2 })).status, 403);
    assert.ok((await pedir(app.base, "/api/informes", { cookie: est1 })).cuerpo.some(x => x.id === id));

    assert.ok((await pedir(app.base, "/api/informes")).cuerpo.some(x => x.id === id), "la empresa lo ve");
    assert.equal((await pedir(app.base, "/api/informes/" + id, { method: "DELETE" })).status, 200);
  });

  test("un informe viejo sin usuarioId solo lo ve la empresa", async () => {
    const id = "viejo-informe-1";
    fs.writeFileSync(path.join(app.dataDir, "informes", id + ".json"), JSON.stringify({ ...INFORME, id, candidato: "Viejo" }));
    assert.ok(!(await pedir(app.base, "/api/informes", { cookie: est1 })).cuerpo.some(x => x.id === id));
    assert.equal((await pedir(app.base, "/api/informes/" + id, { cookie: est1 })).status, 403);
    assert.ok((await pedir(app.base, "/api/informes")).cuerpo.some(x => x.id === id));
  });

  test("con la llave local, el informe conserva el candidato que manda el script", async () => {
    const llave = fs.readFileSync(path.join(app.dataDir, "llave-local.txt"), "utf8").trim();
    const r = await pedir(app.base, "/api/informes", { method: "POST", json: INFORME, cookie: null, headers: { "x-llave-local": llave } });
    assert.equal((await pedir(app.base, "/api/informes/" + r.cuerpo.id)).cuerpo.candidato, "Otro Nombre");
  });
});
