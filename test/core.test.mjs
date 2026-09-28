/* Pruebas de la lógica pura de public/js/core.js:
   historial que se manda a la IA, parseo del JSON de evaluación, puntaje ponderado
   y corte de oraciones para la voz. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../public/js/core.js");

describe("normalizarHistorial", () => {
  test("empieza en user y alterna", () => {
    const h = core.normalizarHistorial([
      { role: "assistant", content: "hola, soy el cliente" },
      { role: "user", content: "buen día" },
      { role: "assistant", content: "te cuento" },
      { role: "user", content: "dale" }
    ]);
    assert.deepEqual(h.map(m => m.role), ["user", "assistant", "user"]);
  });

  test("junta turnos seguidos del mismo rol", () => {
    const h = core.normalizarHistorial([
      { role: "user", content: "una" },
      { role: "user", content: "dos" },
      { role: "assistant", content: "ok" }
    ]);
    assert.deepEqual(h, [{ role: "user", content: "una\n\ndos" }, { role: "assistant", content: "ok" }]);
  });

  test("descarta vacíos y nulos sin romper la alternancia", () => {
    const h = core.normalizarHistorial([
      { role: "user", content: "hola" },
      { role: "assistant", content: "   " },
      null,
      { role: "user", content: "seguís ahí?" }
    ]);
    assert.deepEqual(h, [{ role: "user", content: "hola\n\nseguís ahí?" }]);
  });

  test("al recortar por cantidad no queda arrancando en assistant", () => {
    const largo = [];
    for (let i = 0; i < 10; i++) largo.push({ role: i % 2 ? "assistant" : "user", content: "m" + i });
    const h = core.normalizarHistorial(largo, 5);
    assert.equal(h[0].role, "user");
    assert.ok(h.length <= 5);
    h.forEach((m, i) => { if (i) assert.notEqual(m.role, h[i - 1].role); });
  });

  test("tolera listas inválidas", () => {
    assert.deepEqual(core.normalizarHistorial(null), []);
    assert.deepEqual(core.normalizarHistorial("hola"), []);
    assert.deepEqual(core.normalizarHistorial([{ role: "assistant", content: "solo assistant" }]), []);
  });
});

describe("parseEvaluacion", () => {
  const base = { criterios: [{ nombre: "Empatía", puntaje: 4, evidencia: "cita", comentario: "bien" }] };

  test("acepta JSON limpio", () => {
    const ev = core.parseEvaluacion(JSON.stringify({ ...base, resumen: "le fue bien", fortalezas: ["a", "b"] }));
    assert.equal(ev.resumen, "le fue bien");
    assert.deepEqual(ev.fortalezas, ["a", "b"]);
    assert.equal(ev.criterios[0].puntaje, 4);
  });

  test("acepta bloque ``` y texto alrededor", () => {
    const ev = core.parseEvaluacion("Claro, acá va:\n```json\n" + JSON.stringify(base) + "\n```\nEspero que sirva.");
    assert.equal(ev.criterios[0].nombre, "Empatía");
  });

  test("acepta comas de más", () => {
    const ev = core.parseEvaluacion('{"criterios":[{"nombre":"Claridad","puntaje":3,}],"fortalezas":["x",],}');
    assert.equal(ev.criterios[0].nombre, "Claridad");
  });

  test("normaliza puntajes escritos raro", () => {
    const ev = core.parseEvaluacion('{"criterios":[{"nombre":"a","puntaje":"4/5"},{"nombre":"b","puntaje":"tres"},{"nombre":"c","puntaje":9},{"nombre":"d"}]}');
    assert.deepEqual(ev.criterios.map(c => c.puntaje), [4, null, null, null]);
  });

  test("convierte a lista lo que vino como texto", () => {
    const ev = core.parseEvaluacion('{"criterios":[{"nombre":"a","puntaje":3}],"fortalezas":"una sola cosa","a_mejorar":null}');
    assert.deepEqual(ev.fortalezas, ["una sola cosa"]);
    assert.deepEqual(ev.a_mejorar, []);
  });

  test("devuelve null si no hay criterios", () => {
    assert.equal(core.parseEvaluacion("No puedo evaluar esto."), null);
    assert.equal(core.parseEvaluacion('{"resumen":"ok"}'), null);
    assert.equal(core.parseEvaluacion('{"criterios":[]}'), null);
    assert.equal(core.parseEvaluacion(""), null);
    assert.equal(core.parseEvaluacion(null), null);
  });
});

describe("puntajePonderado", () => {
  const defs = [
    { nombre: "Escucha activa", peso: 3 },
    { nombre: "Claridad", peso: 2 },
    { nombre: "Empatía", peso: 1 }
  ];

  test("pondera por peso", () => {
    const r = core.puntajePonderado(defs, [
      { nombre: "Escucha activa", puntaje: 5 },
      { nombre: "Claridad", puntaje: 3 },
      { nombre: "Empatía", puntaje: 1 }
    ]);
    // (5*3 + 3*2 + 1*1) / (5*6) = 22/30
    assert.equal(r.puntaje, 73);
    assert.equal(r.cubiertos, 3);
    assert.equal(r.total, 3);
  });

  test("empareja sin importar acentos ni mayúsculas", () => {
    const r = core.puntajePonderado(defs, [
      { nombre: "escucha ACTIVA", puntaje: 5 },
      { nombre: "claridad", puntaje: 5 },
      { nombre: "EMPATIA", puntaje: 5 }
    ]);
    assert.equal(r.puntaje, 100);
    assert.equal(r.cubiertos, 3);
  });

  test("informa cuántos criterios quedaron sin puntuar", () => {
    const r = core.puntajePonderado(defs, [{ nombre: "Claridad", puntaje: 4 }]);
    assert.equal(r.cubiertos, 1);
    assert.equal(r.total, 3);
    assert.equal(r.puntaje, 80);
  });

  test("peso inválido cuenta como 1 y no rompe el cálculo", () => {
    const r = core.puntajePonderado([{ nombre: "a", peso: "x" }, { nombre: "b", peso: 0 }], [{ nombre: "a", puntaje: 5 }, { nombre: "b", puntaje: 5 }]);
    assert.equal(r.puntaje, 100);
  });

  test("sin datos no inventa puntaje", () => {
    assert.equal(core.puntajePonderado(defs, []).puntaje, null);
    assert.equal(core.puntajePonderado([], []).puntaje, null);
    assert.equal(core.puntajePonderado(defs, [{ nombre: "Claridad", puntaje: "no aplica" }]).puntaje, null);
  });
});

describe("textoHablable", () => {
  test("saca [FIN], markdown, código y acotaciones", () => {
    assert.equal(core.textoHablable("Hola **che**, *mirá* (suspira) esto `x`. [FIN]"), "Hola che, mirá esto x.");
    assert.equal(core.textoHablable("Mirá:\n```js\nconst a = 1;\n```\nlisto"), "Mirá: listo");
    assert.equal(core.textoHablable("[ fin ]"), "");
    assert.equal(core.textoHablable(null), "");
  });
});

describe("largoDecible", () => {
  test("corta al terminar una oración", () => {
    const t = "Hola, buen día. Te llamo por";
    assert.equal(t.slice(0, core.largoDecible(t, false)), "Hola, buen día. ");
  });

  test("espera si todavía no hay oración completa y es corta", () => {
    assert.equal(core.largoDecible("Hola buen día te", false), 0);
  });

  test("si se acumuló mucho sin punto, corta igual para no demorar la voz", () => {
    const t = "Mira lo que pasa es que los pacientes reciben dos mensajes por cada turno y eso me complica mucho la agenda del día porque llaman a recepción a preguntar";
    const n = core.largoDecible(t, false);
    assert.ok(n > 100 && n <= t.length, "cortó en " + n);
  });

  test("forzado entrega todo lo que queda", () => {
    assert.equal(core.largoDecible("sin puntuación final", true), "sin puntuación final".length);
    assert.equal(core.largoDecible("", true), 0);
  });
});
