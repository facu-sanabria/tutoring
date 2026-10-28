/* El prompt del mentor se reordenó para aprovechar el caché de prompts del proveedor:
   primero lo que no cambia entre consultas de una misma empresa y al final la acción elegida.
   Estas pruebas comparan contra la versión anterior (test/fixtures/prompts-antes.js) que el
   texto sea exactamente el mismo, solo en otro orden. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = rel => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// Carga los scripts del navegador en un contexto aislado, como los carga index.html.
function cargar(promptsRel) {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const rel of ["public/js/core.js", "public/js/defaults.js", promptsRel]) vm.runInContext(leer(rel), ctx, { filename: rel });
  return ctx.T;
}
const nuevo = cargar("public/js/prompts.js");
const antes = cargar("test/fixtures/prompts-antes.js");

const empresas = Object.values(nuevo.EJEMPLOS).map(e => e.config);
const real = path.join(RAIZ, "data", "empresa.json");
if (fs.existsSync(real)) {
  try { empresas.push(nuevo.core.migrarConfig(JSON.parse(fs.readFileSync(real, "utf8")))); } catch (_) {}
}
// Una sin rubro ni documentos, para cubrir las ramas vacías.
empresas.push({ version: 2, empresa: "Mínima", contextos: [], documentos: [] });

const acciones = [...nuevo.core.ACCIONES_JUNIOR, "libre", "codigo", "ticket", "inexistente"];
const bloques = s => s.split("\n\n").sort();

describe("prompt del mentor reordenado para el caché", () => {
  for (const cfg of empresas) {
    test(`${cfg.empresa}: mismo texto que antes, solo cambia el orden`, () => {
      for (const accion of acciones) {
        const viejo = antes.prompts.junior(cfg, accion, "Camila");
        const actual = nuevo.prompts.junior(cfg, accion, "Camila");
        assert.equal(actual.length, viejo.length, `largo distinto en la acción ${accion}`);
        assert.deepEqual(bloques(actual), bloques(viejo), `contenido distinto en la acción ${accion}`);
      }
    });

    test(`${cfg.empresa}: la parte estable es idéntica para todas las acciones y va primero`, () => {
      const estables = new Set();
      for (const accion of acciones) {
        const p = nuevo.prompts.juniorPartes(cfg, accion, "Camila");
        assert.equal(nuevo.prompts.junior(cfg, accion, "Camila"), p.estable + p.variable);
        assert.ok(p.estable.includes("CONTEXTO DE LA EMPRESA"), "el contexto tiene que estar en la parte estable");
        assert.ok(!p.variable.includes("CONTEXTO DE LA EMPRESA"));
        estables.add(p.estable);
      }
      assert.equal(estables.size, 1);
    });
  }

  test("la parte estable no tiene nada que cambie entre consultas (fechas, horas)", () => {
    const a = nuevo.prompts.juniorPartes(empresas[0], "tarea", "Camila").estable;
    const b = nuevo.prompts.juniorPartes(JSON.parse(JSON.stringify(empresas[0])), "tarea", "Camila").estable;
    assert.equal(a, b);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a));
  });

  test("la evaluación tiene la vara por descripción y no castiga lo no dicho", () => {
    const cfg = empresas[0], esc = cfg.escenarios[0];
    const turnos = [{ role: "assistant", text: "Hola" }, { role: "user", text: "Buen día" }];
    const p = nuevo.prompts.evaluacion(cfg, esc, turnos, "Ana", 3);
    assert.ok(p.includes("3 = cumple lo que dice la descripción del criterio"));
    assert.ok(p.includes("poné puntaje null"));
  });

  test("la evaluación muestra indicadores por criterio y pide evidencia antes del puntaje", () => {
    const cfg = nuevo.DEFAULTS, esc = cfg.escenarios[0];
    const turnos = [{ role: "assistant", text: "Hola" }, { role: "user", text: "Buen día" }];
    const p = nuevo.prompts.evaluacion(cfg, esc, turnos, "Ana", 3);
    assert.ok(p.includes("Cuenta como evidencia:"));
    assert.ok(p.includes("No cuenta (o cuenta en contra):"));
    assert.ok(p.includes("una promesa no es empatía"), "la empatía no se cuenta por tranquilizar o prometer");
    assert.ok(p.indexOf('"observado"') < p.indexOf('"puntaje"'), "primero lo observado, después el puntaje");
  });

  test("la voz tiene la regla de cierre nueva: duración estimada, cierre por resolución o cansancio y [FIN] al final", () => {
    const cfg = empresas[0], esc = { ...cfg.escenarios[0], duracion: 8 };
    const voz = nuevo.prompts.voz(cfg, esc, "Ana");
    assert.ok(voz.includes("Suele durar unos 8 minutos"));
    assert.ok(voz.includes("La conversación termina cuando la situación se resuelve o cuando te cansás"));
    assert.ok(voz.includes("[FIN]"));
    assert.ok(voz.includes("[SISTEMA]"));
  });
});
