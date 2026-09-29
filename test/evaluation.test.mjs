import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startApp, pedir, pedirMensajes } from "./helpers.mjs";
import { EVAL_JSON } from "./fake-llm.mjs";

export const fallbackEnv = {
  LLM_FALLBACK: "gemini", GEMINI_API_KEY: "clave-de-prueba",
  CLAUDE_SDK_MODULE: "test/fake-sdk-limit.mjs"
};

describe("evaluación con Gemini de respaldo", () => {
  let app;
  before(async () => { app = await startApp({ provider: "claude-sdk", env: fallbackEnv }); });
  after(async () => { await app?.stop(); });
  const evaluar = content => pedirMensajes(app.base, {
    purpose: "eval", system: "Sos un evaluador riguroso y justo.",
    messages: [{ role: "user", content }], max_tokens: 2500
  });

  test("cuota agotada del SDK: Gemini evalúa y el informe queda disponible", async () => {
    const r = await evaluar("Evaluá esta conversación de prueba");
    assert.ok(r.eventos.some(e => e.type === "provider" && e.provider === "gemini" && e.fallback));
    assert.ok(!r.eventos.some(e => e.type === "error"));
    assert.deepEqual(JSON.parse(r.texto), EVAL_JSON);
    const body = app.fake.calls.at(-1).payload;
    assert.equal(body.response_format.type, "json_schema");
    assert.ok(body.response_format.json_schema.schema.required.includes("criterios"));
    const saved = await pedir(app.base, "/api/informes", { method: "POST", json: {
      candidato: "Prueba respaldo", empresa: "Empresa demo", escenario: { titulo: "Simulación" },
      evaluacion: JSON.parse(r.texto), transcripcion: [{ role: "user", text: "Hola" }]
    } });
    assert.equal(saved.status, 200);
    const list = await pedir(app.base, "/api/informes");
    assert.ok(list.cuerpo.some(i => i.id === saved.cuerpo.id && i.empresa === "Empresa demo"));
    const report = await pedir(app.base, `/api/informes/${saved.cuerpo.id}`);
    assert.deepEqual(report.cuerpo.evaluacion, EVAL_JSON);
  });

  for (const caso of ["TRUNCADA", "INVALIDA"]) {
    test(`recupera evaluación ${caso} sin mezclar texto de intentos`, async () => {
      const inicio = app.fake.calls.length;
      const r = await evaluar(`FALLA_EVAL_${caso}`);
      assert.deepEqual(JSON.parse(r.texto), EVAL_JSON);
      assert.ok(r.eventos.some(e => e.type === "retry"));
      const calls = app.fake.calls.slice(inicio);
      assert.equal(calls.length, 2);
      assert.ok(calls[1].payload.max_tokens > calls[0].payload.max_tokens);
    });
  }

  test("no entrega como exitosa una evaluación sin criterios", async () => {
    const inicio = app.fake.calls.length;
    const r = await evaluar("FALLA_EVAL_SIN_CRITERIOS");
    assert.equal(r.texto, "");
    assert.ok(r.eventos.some(e => e.type === "error"));
    assert.equal(app.fake.calls.length - inicio, 3);
  });
});
