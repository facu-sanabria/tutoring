/* Empresa de ejemplo MKT Contact Center (borrador de docs/escenarios-mkt.md) y su golden set (evals/golden-mkt). */
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
// Copia en este contexto: los arrays del vm no son iguales por referencia a los de acá.
const mkt = ctx.T.EJEMPLOS.mkt ? JSON.parse(JSON.stringify(ctx.T.EJEMPLOS.mkt.config)) : null;
const GOLDEN = path.join(RAIZ, "evals", "golden-mkt");
const casos = fs.readdirSync(GOLDEN).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(GOLDEN, f), "utf8")));

describe("MKT Contact Center", () => {
  test("está como empresa de ejemplo, con los 6 escenarios del borrador", () => {
    assert.ok(mkt, "falta T.EJEMPLOS.mkt");
    assert.deepEqual(mkt.escenarios.map(e => e.id),
      ["mkt-sin-internet", "mkt-doble-cobro", "mkt-baja", "mkt-cliente-agresivo", "mkt-cobranza", "mkt-feedback-tl"]);
  });

  test("en las entrantes atiende el candidato, en la cobranza llama él y la team leader arranca ella", () => {
    const inicio = Object.fromEntries(mkt.escenarios.map(e => [e.id, e.inicio || "cliente"]));
    assert.deepEqual(inicio, {
      "mkt-sin-internet": "atiende", "mkt-doble-cobro": "atiende", "mkt-baja": "atiende",
      "mkt-cliente-agresivo": "atiende", "mkt-cobranza": "llama", "mkt-feedback-tl": "cliente"
    });
  });

  test("el candidato no ve el DNI del cliente en el brief (se lo tiene que pedir)", () => {
    for (const e of mkt.escenarios) assert.doesNotMatch([e.cliente, e.resumen, e.ficha].join(" "), /\d{1,2}\.\d{3}\.\d{3}/, e.id);
  });

  test("en las llamadas con clientes, el brief dice lo que el operador tiene a mano", () => {
    for (const e of mkt.escenarios.filter(x => x.id !== "mkt-feedback-tl")) {
      assert.ok(e.ficha && e.ficha.trim(), `${e.id}: falta la ficha`);
      assert.match(e.ficha, /DNI y fecha de nacimiento/, `${e.id}: cómo se valida la identidad`);
      assert.match(e.ficha, /número de gestión/i, `${e.id}: de dónde sale el número de gestión`);
    }
    const cobranza = mkt.escenarios.find(e => e.id === "mkt-cobranza");
    assert.match(cobranza.ficha, /38\.000/, "el monto de la deuda");
    assert.match(cobranza.ficha, /3 cuotas/, "lo que se puede ofrecer");
  });

  test("el evaluador sabe qué tenía a mano el candidato", () => {
    const e = mkt.escenarios.find(x => x.id === "mkt-cobranza");
    const p = ctx.T.prompts.evaluacion(mkt, e, [{ role: "user", text: "Hola" }], "Lucas", 3);
    assert.ok(p.includes(e.ficha));
  });

  test("cada caso del golden set apunta a un escenario de MKT y no trae puntaje esperado", () => {
    assert.ok(casos.length >= 9);
    for (const c of casos) {
      assert.equal(c.empresa, "mkt", c.nombre);
      assert.ok(mkt.escenarios.some(e => e.id === c.escenarioId), c.nombre);
      assert.equal(c.esperado, null, `${c.nombre}: el esperado lo pone RR. HH.`);
    }
  });

  test("las conversaciones del golden set arrancan como en el escenario", () => {
    for (const c of casos) {
      const e = mkt.escenarios.find(x => x.id === c.escenarioId);
      const [primero, segundo] = c.transcripcion;
      if (e.inicio === "atiende") assert.equal(primero.role, "user", `${c.nombre}: atiende y saluda el candidato`);
      else if (e.inicio === "llama") {
        assert.equal(primero.role, "assistant", `${c.nombre}: el cliente atiende`);
        assert.match(primero.text, /^¿(Hola|Sí)\?/, `${c.nombre}: el cliente solo atiende`);
        assert.equal(segundo.role, "user", c.nombre);
      } else assert.equal(primero.role, "assistant", c.nombre);
    }
  });

  test("la planilla de RR. HH. usa los criterios de MKT", () => {
    const planilla = fs.readFileSync(path.join(GOLDEN, "planilla-rrhh.csv"), "utf8").replace(/^﻿/, "");
    const enPlanilla = new Set(planilla.trim().split(/\r?\n/).slice(1).map(l => l.split(";")[2]));
    for (const c of mkt.criterios) assert.ok(enPlanilla.has(c.nombre), c.nombre);
  });
});
