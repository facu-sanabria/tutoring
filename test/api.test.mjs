/* Pruebas del servidor: rutas, seguridad y los dos proveedores de IA.
   No usan la API real: hablan con test/fake-llm.mjs.
   Se corren con:  npm test                                              */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startApp, pedir, pedirMensajes } from "./helpers.mjs";
import { EVAL_JSON } from "./fake-llm.mjs";

const INFORME = {
  candidato: "Lucas Ferreyra",
  fecha: "2026-09-28T12:00:00.000Z",
  duracionSeg: 240,
  empresa: "Nodo Software",
  senior: "Martín Sosa",
  escenario: { titulo: "Recordatorios duplicados", resumen: "r", cliente: "Laura Méndez", objetivo: "o" },
  criteriosDef: [{ nombre: "Escucha activa", descripcion: "d", peso: 3 }],
  evaluacion: EVAL_JSON,
  puntaje: 78,
  transcripcion: [{ role: "user", text: "Hola" }]
};

describe("servidor con Gemini", () => {
  let app;
  before(async () => { app = await startApp({ provider: "gemini" }); });
  after(async () => { await app.stop(); });

  test("/api/config informa el proveedor y nunca la key", async () => {
    const { status, cuerpo, texto } = await pedir(app.base, "/api/config");
    assert.equal(status, 200);
    assert.equal(cuerpo.provider, "gemini");
    assert.equal(cuerpo.providerName, "Gemini");
    assert.equal(cuerpo.keyVar, "GEMINI_API_KEY");
    assert.equal(cuerpo.hasKey, true);
    assert.equal(cuerpo.models.voice, "gemini-test-voz");
    assert.ok(!/clave-de-prueba/.test(texto), "la respuesta no puede contener la API key");
    assert.ok(!("key" in cuerpo) && !("apiKey" in cuerpo));
  });

  test("empresa: GET vacío da 404, PUT guarda y GET devuelve", async () => {
    assert.equal((await pedir(app.base, "/api/empresa")).status, 404);
    const cfg = { empresa: "Nodo Software", senior: "Martín Sosa", criterios: [], escenarios: [], archivos: [] };
    const put = await pedir(app.base, "/api/empresa", { method: "PUT", json: cfg });
    assert.equal(put.status, 200);
    const get = await pedir(app.base, "/api/empresa");
    assert.equal(get.status, 200);
    assert.equal(get.cuerpo.empresa, "Nodo Software");
    assert.ok(fs.existsSync(path.join(app.dataDir, "empresa.json")));
  });

  test("empresa: rechaza basura con mensaje en español", async () => {
    const casos = [
      [{ criterios: [] }, /nombre de la empresa/i],
      [{ empresa: "N", criterios: "x" }, /tiene que ser una lista/i],
      [[1, 2], /objeto JSON/i]
    ];
    for (const [json, re] of casos) {
      const r = await pedir(app.base, "/api/empresa", { method: "PUT", json });
      assert.equal(r.status, 400, JSON.stringify(json));
      assert.match(r.cuerpo.error.message, re);
    }
    const malo = await pedir(app.base, "/api/empresa", { method: "PUT", body: "{no es json" });
    assert.equal(malo.status, 400);
    assert.match(malo.cuerpo.error.message, /JSON válido/i);
  });

  test("informes: POST, GET lista, GET por id y DELETE", async () => {
    const post = await pedir(app.base, "/api/informes", { method: "POST", json: INFORME });
    assert.equal(post.status, 200);
    const id = post.cuerpo.id;
    assert.match(id, /^[0-9a-f-]{36}$/);

    const lista = await pedir(app.base, "/api/informes");
    assert.equal(lista.status, 200);
    const fila = lista.cuerpo.find(r => r.id === id);
    assert.deepEqual(fila, { id, candidato: "Lucas Ferreyra", escenario: "Recordatorios duplicados", fecha: INFORME.fecha, puntaje: 78 });

    const uno = await pedir(app.base, `/api/informes/${id}`);
    assert.equal(uno.status, 200);
    assert.equal(uno.cuerpo.evaluacion.criterios.length, 6);

    assert.equal((await pedir(app.base, `/api/informes/${id}`, { method: "DELETE" })).status, 200);
    assert.equal((await pedir(app.base, `/api/informes/${id}`)).status, 404);
  });

  test("informes: ordena del más nuevo al más viejo", async () => {
    const ids = [];
    for (const fecha of ["2026-01-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"]) {
      const r = await pedir(app.base, "/api/informes", { method: "POST", json: { ...INFORME, fecha } });
      ids.push(r.cuerpo.id);
    }
    const lista = (await pedir(app.base, "/api/informes")).cuerpo;
    const fechas = lista.map(r => r.fecha);
    assert.deepEqual(fechas, [...fechas].sort().reverse());
    for (const id of ids) await pedir(app.base, `/api/informes/${id}`, { method: "DELETE" });
  });

  test("informes: rechaza cuerpos que no son informes", async () => {
    for (const json of [[1, 2], { candidato: "x" }, { evaluacion: {} }]) {
      const r = await pedir(app.base, "/api/informes", { method: "POST", json });
      assert.equal(r.status, 400);
      assert.ok(r.cuerpo.error.message);
    }
    const sobran = fs.readdirSync(path.join(app.dataDir, "informes")).filter(f => f.startsWith("undefined"));
    assert.deepEqual(sobran, [], "no tiene que escribir undefined.json");
  });

  test("informes: id inválido no toca el disco", async () => {
    for (const id of ["ab", "../../server.js", "con espacio", "a".repeat(80)]) {
      const r = await pedir(app.base, `/api/informes/${encodeURIComponent(id)}`);
      assert.ok(r.status === 400 || r.status === 404, `${id} -> ${r.status}`);
    }
  });

  test("métodos no soportados devuelven 405", async () => {
    assert.equal((await pedir(app.base, "/api/empresa", { method: "POST", json: {} })).status, 405);
    assert.equal((await pedir(app.base, "/api/informes", { method: "PUT", json: {} })).status, 405);
    assert.equal((await pedir(app.base, "/api/messages")).status, 405);
    assert.equal((await pedir(app.base, "/api/config", { method: "POST", json: {} })).status, 405);
    assert.equal((await pedir(app.base, "/api/nada")).status, 404);
  });

  test("cuerpos gigantes responden 413 (y no cortan la conexión)", async () => {
    const r = await pedir(app.base, "/api/empresa", { method: "PUT", json: { empresa: "N", relleno: "a".repeat(9_000_000) } });
    assert.equal(r.status, 413);
    assert.match(r.cuerpo.error.message, /demasiado grande/i);
    assert.equal((await pedir(app.base, "/api/config")).status, 200, "el servidor sigue vivo");
  });

  test("estáticos: sirve la app y bloquea salir de /public", async () => {
    const index = await pedir(app.base, "/");
    assert.equal(index.status, 200);
    assert.match(index.texto, /<title>Tutoring<\/title>/);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.equal((await pedir(app.base, "/js/voice.js")).status, 200);

    for (const ruta of ["/..%2f.env", "/..%5c.env", "/%2e%2e%2f%2e%2e%2f.env", "/..%2fpublic-falso%2fx.js"]) {
      const r = await pedir(app.base, ruta);
      assert.equal(r.status, 403, ruta);
      assert.ok(!/API_KEY/.test(r.texto));
    }
    assert.equal((await pedir(app.base, "/no-existe.js")).status, 404);
  });

  test("una URL malformada no tumba el servidor", async () => {
    const r = await pedir(app.base, "/%");
    assert.equal(r.status, 400);
    assert.equal((await pedir(app.base, "/api/config")).status, 200, "el servidor sigue vivo");
  });

  test("messages: traduce el streaming de Gemini a eventos de Claude", async () => {
    const r = await pedirMensajes(app.base, {
      purpose: "voice",
      system: "Estás en una simulación de práctica profesional POR VOZ.",
      messages: [{ role: "user", content: "[La llamada se acaba de conectar.]" }],
      max_tokens: 300
    });
    assert.equal(r.status, 200);
    assert.equal(r.eventos[0].type, "message_start");
    assert.equal(r.eventos[1].type, "content_block_start");
    assert.equal(r.eventos.at(-1).type, "message_stop");
    assert.equal(r.eventos.at(-2).type, "content_block_stop");
    assert.ok(r.eventos.filter(e => e.type === "content_block_delta").length > 1, "tiene que llegar en varios trozos");
    assert.match(r.texto, /dos mensajes por cada turno/);
    assert.ok(!/clave-de-prueba/.test(r.bruto), "la key no puede viajar al navegador");
  });

  test("messages: el purpose elige el modelo y el navegador no puede forzarlo", async () => {
    const anteriores = app.fake.calls.length;
    await pedirMensajes(app.base, { purpose: "eval", model: "modelo-pirata", messages: [{ role: "user", content: "hola" }] });
    await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "hola" }] });
    await pedirMensajes(app.base, { purpose: "inventado", messages: [{ role: "user", content: "hola" }] });
    const usados = app.fake.calls.slice(anteriores).map(c => c.payload.model);
    assert.deepEqual(usados, ["gemini-test-eval", "gemini-test-chat", "gemini-test-chat"]);
  });

  test("messages: el historial llega alternando y empezando en user", async () => {
    const anteriores = app.fake.calls.length;
    await pedirMensajes(app.base, {
      purpose: "chat",
      messages: [
        { role: "assistant", content: "sobra: arranca en assistant" },
        { role: "user", content: "hola" },
        { role: "user", content: "y otra cosa" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "te escucho" },
        { role: "assistant", content: "seguí" },
        { role: "user", content: "dale" },
        { role: "raro", content: "rol inventado" }
      ]
    });
    const enviado = app.fake.calls.slice(anteriores)[0].payload.messages.filter(m => m.role !== "system");
    assert.deepEqual(enviado.map(m => m.role), ["user", "assistant", "user"]);
    assert.match(enviado[0].content, /hola\n\ny otra cosa/);
    assert.match(enviado[1].content, /te escucho\n\nseguí/);
    assert.match(enviado[2].content, /dale\n\nrol inventado/);
  });

  test("messages: sin mensajes útiles avisa en vez de pegarle a la API", async () => {
    const anteriores = app.fake.calls.length;
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "assistant", content: "hola" }] });
    assert.equal(r.status, 400);
    assert.match(r.error.message, /ningún mensaje/i);
    assert.equal(app.fake.calls.length, anteriores, "no tiene que llamar a la API");
  });

  test("messages: el max_tokens se acota", async () => {
    const anteriores = app.fake.calls.length;
    await pedirMensajes(app.base, { purpose: "chat", max_tokens: 999999, messages: [{ role: "user", content: "hola" }] });
    await pedirMensajes(app.base, { purpose: "chat", max_tokens: -5, messages: [{ role: "user", content: "hola" }] });
    const tops = app.fake.calls.slice(anteriores).map(c => c.payload.max_tokens);
    assert.deepEqual(tops, [8192, 64]);
  });

  test("messages: mapea los errores de Gemini a mensajes entendibles", async () => {
    const casos = [
      ["FALLA_KEY", 401, /GEMINI_API_KEY del .env no es válida/i],
      ["FALLA_CUOTA", 429, /cuota gratuita/i],
      ["FALLA_MODELO", 404, /no está disponible para tu key/i],
      ["FALLA_RARO", 500, /./],
      ["FALLA_APAGADA", 403, /está apagada en el proyecto de Google/i]
    ];
    for (const [marca, status, re] of casos) {
      const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: marca }] });
      assert.equal(r.status, status, marca);
      assert.match(r.error.message, re, marca);
      assert.ok(!/clave-de-prueba/.test(JSON.stringify(r.error)), "el error no puede filtrar la key");
    }
  });

  test("messages: el aviso de API apagada incluye el link al proyecto y el atajo", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "FALLA_APAGADA" }] });
    assert.equal(r.status, 403);
    assert.match(r.error.message, /console\.developers\.google\.com\S*project=800111611422/);
    assert.match(r.error.message, /aistudio\.google\.com\/apikey/);
    assert.match(r.error.message, /proyecto NUEVO/);
  });

  test("messages: si Gemini contesta JSON en vez de SSE igual llega el texto", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "FALLA_JSON" }] });
    assert.equal(r.status, 200);
    assert.equal(r.texto, "Respuesta sin streaming.");
  });

  test("messages: respuesta bloqueada por filtros avisa por evento error", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "FALLA_VACIO" }] });
    assert.equal(r.status, 200);
    const err = r.eventos.find(e => e.type === "error");
    assert.ok(err, "tiene que haber un evento error");
    assert.match(err.error.message, /filtros de contenido/i);
  });

  test("messages: si el stream se corta a mitad, el front se entera", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "FALLA_CORTE" }] });
    assert.equal(r.status, 200);
    assert.match(r.texto, /Arranco y/);
    const err = r.eventos.find(e => e.type === "error");
    assert.ok(err, "tiene que avisar que se cortó");
    assert.match(err.error.message, /cort/i);
  });

  test("messages: cortar del lado del cliente aborta la llamada a la IA", async () => {
    const ctl = new AbortController();
    const p = fetch(app.base + "/api/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "chat", messages: [{ role: "user", content: "DECI:" + "x".repeat(4000) }] })
    }).then(async res => { await res.text(); }).catch(() => {});
    setTimeout(() => ctl.abort(), 30);
    await p;
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await pedir(app.base, "/api/config")).status, 200, "el servidor sigue vivo después del corte");
  });
});

describe("servidor con Claude (anthropic)", () => {
  let app;
  before(async () => { app = await startApp({ provider: "anthropic" }); });
  after(async () => { await app.stop(); });

  test("/api/config dice Claude", async () => {
    const { cuerpo } = await pedir(app.base, "/api/config");
    assert.equal(cuerpo.provider, "anthropic");
    assert.equal(cuerpo.providerName, "Claude");
    assert.equal(cuerpo.keyVar, "ANTHROPIC_API_KEY");
    assert.equal(cuerpo.models.eval, "claude-test-eval");
  });

  test("messages: pasa el streaming de Claude tal cual", async () => {
    const r = await pedirMensajes(app.base, {
      purpose: "eval",
      system: "Sos un evaluador riguroso y justo.",
      messages: [{ role: "user", content: "evaluá esto" }]
    });
    assert.equal(r.status, 200);
    const ev = JSON.parse(r.texto);
    assert.equal(ev.criterios.length, 6);
    assert.ok(!/clave-de-prueba/.test(r.bruto));
  });

  test("messages: manda x-api-key y no la expone", async () => {
    const llamada = app.fake.calls.at(-1);
    assert.equal(llamada.auth, "clave-de-prueba");
    assert.match(llamada.url, /\/anthropic\/messages$/);
  });

  test("messages: propaga el error de Claude con su status", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "FALLA_CUOTA" }] });
    assert.equal(r.status, 429);
    assert.match(r.error.message, /exhausted|quota/i);
  });
});

describe("servidor sin API key", () => {
  let app;
  before(async () => { app = await startApp({ provider: "gemini", key: "" }); });
  after(async () => { await app.stop(); });

  test("config avisa que falta la key", async () => {
    const { cuerpo } = await pedir(app.base, "/api/config");
    assert.equal(cuerpo.hasKey, false);
    assert.equal(cuerpo.keyVar, "GEMINI_API_KEY");
  });

  test("messages devuelve missing_key con el nombre de la variable", async () => {
    const r = await pedirMensajes(app.base, { purpose: "chat", messages: [{ role: "user", content: "hola" }] });
    assert.equal(r.status, 500);
    assert.equal(r.error.type, "missing_key");
    assert.match(r.error.message, /GEMINI_API_KEY/);
  });

  test("el resto de la app sigue funcionando sin key", async () => {
    assert.equal((await pedir(app.base, "/")).status, 200);
    assert.equal((await pedir(app.base, "/api/informes")).status, 200);
  });
});
