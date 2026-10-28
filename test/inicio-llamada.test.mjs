/* Quién arranca la llamada (campo "inicio" del escenario):
   - sin campo o "cliente": habla primero la IA, como siempre.
   - "atiende": llamada entrante; el candidato atiende y saluda, la IA espera.
   - "llama": llamada saliente; la IA atiende con un "¿Hola?" y espera que el candidato se presente. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({});
ctx.window = ctx;
for (const rel of ["public/js/core.js", "public/js/defaults.js", "public/js/prompts.js"]) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, rel), "utf8"), ctx, { filename: rel });
}
const { prompts, DEFAULTS } = ctx.T;
const base = DEFAULTS.escenarios.find(e => e.id === "incidente-viernes") || DEFAULTS.escenarios[0];
const con = inicio => ({ ...base, inicio });

describe("quién arranca la llamada", () => {
  test("sin el campo, la IA habla primero como siempre", () => {
    assert.match(prompts.vozInicio(base), /Hablá vos primero/);
    assert.equal(prompts.vozInicio(con("cliente")), prompts.vozInicio(base));
    assert.equal(prompts.voz(DEFAULTS, con("cliente"), "Lucas"), prompts.voz(DEFAULTS, base, "Lucas"));
  });

  test("llamada entrante: no hay pie de arranque y la IA espera el saludo del candidato", () => {
    assert.equal(prompts.vozInicio(con("atiende")), null);
    const sys = prompts.voz(DEFAULTS, con("atiende"), "Lucas");
    assert.match(sys, /CÓMO EMPIEZA LA LLAMADA/);
    assert.match(sys, /Esperá a que Lucas atienda y salude/);
  });

  test("llamada saliente: la IA atiende solo con \"¿Hola?\" y espera que el candidato se presente", () => {
    assert.match(prompts.vozInicio(con("llama")), /¿Hola\?/);
    const sys = prompts.voz(DEFAULTS, con("llama"), "Lucas");
    assert.match(sys, /Lucas te llama a vos/);
    assert.match(sys, /¿quién habla\?/);
  });

  test("el evaluador sabe quién arrancó la llamada", () => {
    const tx = [{ role: "user", text: "Buen día, te habla Lucas." }, { role: "assistant", text: "Hola." }];
    assert.match(prompts.evaluacion(DEFAULTS, con("atiende"), tx, "Lucas", 3), /llamada entrante/);
    assert.match(prompts.evaluacion(DEFAULTS, con("llama"), tx, "Lucas", 3), /llamada saliente/);
    assert.doesNotMatch(prompts.evaluacion(DEFAULTS, base, tx, "Lucas", 3), /llamada (entrante|saliente)/);
  });
});
