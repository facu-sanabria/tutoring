/* Llamada más realista: acento rioplatense firme en la consigna de voz y voz telefónica configurable. */
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
const { prompts, core } = ctx.T;
const cfg = core.normalizarConfig(JSON.parse(JSON.stringify(ctx.T.EJEMPLOS.mkt.config)));
const cliente = cfg.escenarios.find(e => e.id === "mkt-sin-internet");
const lider = { id: "l", rol: "lider", cliente: "Hernán Bustos, líder", personalidad: "", situacion: "", objetivo: "" };

describe("acento rioplatense en la consigna de voz", () => {
  for (const [nombre, esc] of [["cliente", cliente], ["líder", lider]]) {
    test(`la del ${nombre} dice cómo suena el acento, no solo el voseo`, () => {
      const p = prompts.voz(cfg, esc, "Lucas Ferreyra");
      assert.match(p, /TU ACENTO/);
      assert.match(p, /sonido "sh"/, "pronunciación de la y y la ll");
      // Si la consigna escribe las palabras como suenan, el modelo las transcribe así ("Sho" en vez de "Yo").
      assert.doesNotMatch(p, /"sho"|cashe|ashá|ehtá|mihmo|entendééés/i);
      assert.match(p, /entonación/i);
      assert.match(p, /toda la llamada/i);
    });
  }

  test("el acento va antes que el personaje, para que pese desde el arranque", () => {
    const p = prompts.voz(cfg, cliente, "Lucas Ferreyra");
    assert.ok(p.indexOf("TU ACENTO") < p.indexOf("TU PERSONAJE"));
  });
});

describe("voz telefónica", () => {
  test("viene prendida en las configuraciones nuevas y viejas", () => {
    assert.equal(core.normalizarConfig({}).vozTelefonica, true);
  });
  test("se puede apagar", () => {
    assert.equal(core.normalizarConfig({ vozTelefonica: false }).vozTelefonica, false);
  });
});

describe("transcripción sin las marcas del acento", () => {
  const { textoHablable } = core;
  test("las palabras dichas con \"sh\" se escriben como siempre", () => {
    assert.equal(textoHablable("Sho te shamé ayer y esha shegó a la cashe."), "Yo te llamé ayer y ella llegó a la calle.");
    assert.equal(textoHablable("Ehtá bien, sha te digo, es lo mihmo."), "Está bien, ya te digo, es lo mismo.");
    assert.equal(textoHablable("SHO no fui, ¿shamaste vos?"), "YO no fui, ¿llamaste vos?");
  });
  test("no toca palabras que sí van con sh", () => {
    assert.equal(textoHablable("Fui al shopping a ver un show"), "Fui al shopping a ver un show");
  });
});
