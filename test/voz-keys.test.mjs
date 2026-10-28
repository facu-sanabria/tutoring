/* Gemini Live con varias keys: si una se queda sin cuota, el token sale con la siguiente.
   Usa un Google falso local: no sale a internet. */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startApp, pedir } from "./helpers.mjs";

describe("Gemini Live con keys de respaldo", () => {
  let app, google, pedidos = [];
  before(async () => {
    google = http.createServer((req, res) => {
      const key = req.headers["x-goog-api-key"];
      pedidos.push(key);
      res.setHeader("content-type", "application/json");
      if (key === "key-sin-cuota-1234") { res.statusCode = 429; return res.end(JSON.stringify({ error: { message: "Resource has been exhausted (e.g. check quota)." } })); }
      res.end(JSON.stringify({ name: "auth_tokens/token-de-" + key }));
    });
    await new Promise(r => google.listen(0, "127.0.0.1", r));
    app = await startApp({ provider: "gemini", env: {
      GEMINI_API_KEY: "key-sin-cuota-1234", GEMINI_LIVE_API_KEY_2: "key-respaldo-5678",
      GEMINI_LIVE_BASE_URL: `http://127.0.0.1:${google.address().port}`, VOICE_PROVIDER: "gemini-live"
    } });
  });
  after(async () => { await app?.stop(); google?.close(); });

  test("la key 1 sin cuota: el token sale con la key 2, sin exponer ninguna key", async () => {
    const r = await pedir(app.base, "/api/voz/token", { method: "POST", body: "{}" });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.cuerpo.keyIndex, 1);
    assert.equal(r.cuerpo.keys, 2);
    assert.deepEqual(pedidos, ["key-sin-cuota-1234", "key-respaldo-5678"]);
    assert.ok(!r.texto.includes("key-respaldo-5678") || r.cuerpo.token.includes("token-de-"), "solo el token, no la key");
    assert.match(app.log(), /key 1 de Gemini Live en pausa/);
    assert.ok(!app.log().includes("key-sin-cuota-1234"));
  });

  test("con la key 1 en pausa, la siguiente llamada va directo a la key 2", async () => {
    pedidos = [];
    const r = await pedir(app.base, "/api/voz/token", { method: "POST", body: "{}" });
    assert.equal(r.cuerpo.keyIndex, 1);
    assert.deepEqual(pedidos, ["key-respaldo-5678"]);
  });

  test("el navegador avisa que la key 2 falló: se intenta la 1 como último recurso", async () => {
    pedidos = [];
    const r = await pedir(app.base, "/api/voz/token", { method: "POST", json: { descartar: 1, motivo: "quota exceeded" } });
    // La 1 sigue sin cuota y la 2 está en pausa, pero se reintenta igual antes de rendirse.
    assert.deepEqual(pedidos, ["key-sin-cuota-1234", "key-respaldo-5678"]);
    assert.equal(r.cuerpo.keyIndex, 1);
  });
});
