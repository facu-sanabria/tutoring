/* Evaluación rápida con Claude: si el primer intento se cuelga, un segundo intento en paralelo entrega el informe.
   Usa un Claude Code simulado (test/fake-sdk-carrera.mjs): no sale a internet. */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, pedirMensajes, pedir } from "./helpers.mjs";
import { EVAL_JSON } from "./fake-llm.mjs";

const evaluar = app => pedirMensajes(app.base, {
  purpose: "eval", system: "Sos un evaluador riguroso y justo.",
  messages: [{ role: "user", content: "Evaluá esta conversación de prueba" }], max_tokens: 2500
});
const base = { CLAUDE_SDK_MODULE: "test/fake-sdk-carrera.mjs", EVAL_CARRERA_MS: "1500", EVAL_SILENCIO_MS: "4000", LLM_FALLBACK: "gemini", GEMINI_API_KEY: "clave-de-prueba" };

describe("carrera de la evaluación con Claude", () => {
  const apps = [];
  after(async () => { for (const a of apps) await a.stop(); });

  test("Claude se cuelga a mitad: el intento en paralelo con Claude entrega el informe, sin usar Gemini", async () => {
    const app = await startApp({ provider: "claude-sdk", env: { ...base, FAKE_SDK_MODO: "colgado" } });
    apps.push(app);
    const t0 = Date.now();
    const r = await evaluar(app);
    const ms = Date.now() - t0;
    assert.ok(!r.eventos.some(e => e.type === "error"), r.bruto);
    assert.deepEqual(JSON.parse(r.texto), EVAL_JSON);
    assert.ok(!r.eventos.some(e => e.type === "provider"), "no tuvo que pasar a Gemini");
    assert.equal(app.fake.calls.filter(c => /chat\/completions/.test(c.url || "")).length, 0);
    assert.ok(ms < 4000, `tardó ${ms} ms`);
    assert.match(app.log(), /segundo intento en paralelo/);
    assert.match(app.log(), /evaluación lista con Claude/);
  });

  test("Claude lento pero bien: gana el primero y se cancela el paralelo", async () => {
    const app = await startApp({ provider: "claude-sdk", env: { ...base, FAKE_SDK_MODO: "lento" } });
    apps.push(app);
    const r = await evaluar(app);
    assert.deepEqual(JSON.parse(r.texto), EVAL_JSON);
    await new Promise(res => setTimeout(res, 300));
    assert.match(app.log(), /cancelado: el otro intento ya entregó el informe/);
  });

  test("chequeo: el estado dice la cadena de evaluación y no expone keys", async () => {
    const app = apps[0];
    const r = await pedir(app.base, "/api/chequeo/estado");
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo.cadenaEval, ["claude-sdk", "gemini"]);
    assert.ok(!r.texto.includes("clave-de-prueba"));
  });
});
