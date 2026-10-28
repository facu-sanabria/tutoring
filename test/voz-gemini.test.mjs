/* Llamada con Gemini Live en un navegador de verdad, con la conexión SIMULADA:
   reemplazamos el WebSocket de Google por uno falso que habla el mismo protocolo
   (setupComplete, serverContent con audio PCM 24 kHz, transcripciones, interrupted,
   turnComplete y toolCall). El token sale del servidor contra la API falsa.
   Micrófono: el falso de Chromium (un tono), así se prueba el AudioWorklet de verdad.

   Cubre: token del servidor, setup (modelo, consigna, voz, transcripción), el cliente
   habla primero, audio del micrófono a 16 kHz, transcripción en engine.history,
   interrupción que corta el audio al instante, cierre con la herramienta colgar,
   evaluación con la transcripción de los dos lados y el botón "Seguir con otra voz". */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startApp, pedir, ingresarEn, configEjemplo, atenderEn } from "./helpers.mjs";

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (_) {}
const saltear = chromium ? false : "Falta Playwright: corré `npm install` y `npx playwright install chromium`.";

// Corre dentro de la página antes que la app.
function simularGeminiLive() {
  const W = window.WebSocket;
  const live = window.__live = { urls: [], enviados: [], abiertos: [], fallar: "", fuentes: { iniciadas: 0, cortadas: 0, terminadas: 0 } };

  // Contamos el audio del cliente que se programa y el que se corta.
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...a) {
    live.fuentes.iniciadas++;
    this.addEventListener("ended", () => { if (!this.__cortada) live.fuentes.terminadas++; });
    return start.apply(this, a);
  };
  AudioBufferSourceNode.prototype.stop = function (...a) { this.__cortada = true; live.fuentes.cortadas++; return stop.apply(this, a); };

  // PCM 16 bits, 24 kHz, en base64: un tono de "ms" milisegundos.
  live.audio = ms => {
    const n = Math.round(24 * ms), b = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(i / 8) * 8000) & 0xffff; b[2 * i] = v & 0xff; b[2 * i + 1] = v >> 8; }
    let s = ""; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s);
  };

  class LiveFalso {
    constructor(url) {
      this.url = url; this.readyState = 0;
      this.mios = [];   // lo que se mandó por este socket
      live.urls.push(url); live.abiertos.push(this); live.ws = this;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 20);
    }
    send(data) {
      const m = JSON.parse(data);
      live.enviados.push(m); this.mios.push(m);
      if (m.setup) {
        if (live.fallar) return setTimeout(() => this.close(1008, live.fallar), 20);
        return this.servidor({ setupComplete: {} });
      }
      // El cliente habla primero: contesta al pie de arranque.
      if (m.realtimeInput && m.realtimeInput.text && live.enviados.filter(x => x.realtimeInput && x.realtimeInput.text).length === 1) {
        live.decir("Hola, buen día. Te llamo porque mis pacientes reciben dos recordatorios.", 400);
      }
    }
    servidor(m) { setTimeout(() => { if (this.readyState === 1) this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }, 10); }
    close(code = 1000, reason = "") {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => this.onclose && this.onclose({ code, reason }), 0);
    }
  }
  // El cliente dice algo: transcripción + audio en dos pedazos + fin de turno.
  live.decir = (texto, ms, { terminar = true } = {}) => {
    const ws = live.ws, mitad = Math.ceil(texto.length / 2);
    ws.servidor({ serverContent: { outputTranscription: { text: texto.slice(0, mitad) }, modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: live.audio(ms / 2) } }] } } });
    ws.servidor({ serverContent: { outputTranscription: { text: texto.slice(mitad) }, modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: live.audio(ms / 2) } }] } } });
    if (terminar) ws.servidor({ serverContent: { turnComplete: true } });
  };
  live.escuchar = texto => live.ws.servidor({ serverContent: { inputTranscription: { text: texto } } });
  window.WebSocket = function (url, p) { return /falso\.test/.test(url) ? new LiveFalso(url) : new W(url, p); };
  window.WebSocket.OPEN = 1;
}

// Cuenta los osciladores (timbre) y los filtros (voz telefónica) que arma la página.
function espiarAudio() {
  const a = window.__audio = { osciladores: 0, parados: 0, filtros: [] };
  const osc = BaseAudioContext.prototype.createOscillator, fil = BaseAudioContext.prototype.createBiquadFilter;
  BaseAudioContext.prototype.createOscillator = function () {
    a.osciladores++;
    const o = osc.call(this), stop = o.stop.bind(o);
    o.stop = (...x) => { a.parados++; return stop(...x); };
    return o;
  };
  BaseAudioContext.prototype.createBiquadFilter = function () {
    const f = fil.call(this);
    queueMicrotask(() => a.filtros.push(f.type));
    return f;
  };
}

describe("voz con Gemini Live (conexión simulada)", { skip: saltear }, () => {
  let app, browser, page, errores;
  const esperarVista = t => page.waitForFunction(x => document.getElementById("viewLabel").textContent === x, t, { timeout: 15000 });
  const estado = () => page.evaluate(() => document.querySelector(".orb.big").className.replace("orb big ", ""));
  const esperarEstado = s => page.waitForFunction(x => document.querySelector(".orb.big") && document.querySelector(".orb.big").classList.contains(x), s, { timeout: 5000 });

  before(async () => {
    app = await startApp({ provider: "gemini", env: { VOICE_PROVIDER: "gemini-live", GEMINI_LIVE_WS_URL: "wss://falso.test/live" } });
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  });
  after(async () => {
    if (browser) await browser.close();
    if (app) await app.stop();
  });

  async function abrirLlamada({ atender = true } = {}) {
    const ctx = await browser.newContext({ locale: "es-AR", permissions: ["microphone"] });
    page = await ctx.newPage();
    errores = [];
    page.on("pageerror", e => errores.push(String(e)));
    page.on("dialog", d => d.accept());
    await page.addInitScript(simularGeminiLive);
    await page.addInitScript(espiarAudio);
    await ingresarEn(page, app.base, "estudiante1");
    await page.locator(".card", { hasText: "Viernes 19:30" }).click();   // la clienta es Agustina
    await esperarVista("Simulación");
    assert.doesNotMatch(await page.locator(".brief").innerText(), /Voz natural/);
    await page.locator("#startCall").click();
    if (atender) await atenderEn(page);
    await esperarVista("Llamada en curso");
  }
  // Cambia el escenario de Agustina y lo deja como estaba al terminar.
  async function conEscenario(cambiar, prueba) {
    const cfg = configEjemplo();
    cambiar(cfg, cfg.escenarios.find(e => /Viernes 19:30/.test(e.titulo)));
    assert.equal((await pedir(app.base, "/api/empresa", { method: "PUT", json: cfg })).status, 200);
    try { await prueba(); assert.deepEqual(errores, []); await page.context().close(); }
    finally { await pedir(app.base, "/api/empresa", { method: "PUT", json: configEjemplo() }); }
  }
  const mandoAudio = () => page.evaluate(() => window.__live.enviados.filter(m => m.realtimeInput && m.realtimeInput.audio).length);

  test("llamada entrante: suena el timbre, conecta con el micrófono cerrado y el audio pasa recién al atender", () =>
    conEscenario((cfg, e) => { e.inicio = "atiende"; }, async () => {
      await abrirLlamada({ atender: false });
      assert.match(await page.locator(".state-label").textContent(), /Llamada entrante/);
      assert.equal(await estado(), "ringing");
      assert.ok(await page.evaluate(() => window.__audio.osciladores) >= 2, "suena el timbre");
      await page.waitForFunction(() => !document.querySelector("#atender").disabled, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => window.__live.urls.length), 1, "conectó mientras sonaba");
      await page.waitForTimeout(500);
      assert.equal(await mandoAudio(), 0, "mientras suena no se manda el micrófono");
      await page.locator("#atender").click();
      await page.waitForFunction(() => /saludá vos primero/.test(document.querySelector(".state-label").textContent), null, { timeout: 5000 });
      assert.equal(await page.locator("#atender").count(), 0);
      await page.waitForFunction(() => window.__live.enviados.some(m => m.realtimeInput && m.realtimeInput.audio), null, { timeout: 5000 });
      assert.ok(await page.evaluate(() => window.__audio.parados) >= 2, "el timbre se cortó");
    }));

  test("si el cliente habla primero, no conecta hasta que el candidato atiende", () =>
    conEscenario(() => {}, async () => {
      await abrirLlamada({ atender: false });
      assert.equal(await page.locator("#atender").isEnabled(), true);
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => window.__live.urls.length), 0, "todavía no conectó");
      await page.locator("#atender").click();
      await page.waitForFunction(() => document.querySelectorAll(".transcript .ln.c").length >= 1, null, { timeout: 8000 });
    }));

  test("llamada saliente: el candidato toca Llamar y suena el tono hasta que el cliente atiende", () =>
    conEscenario((cfg, e) => { e.inicio = "llama"; }, async () => {
      await abrirLlamada({ atender: false });
      assert.equal(await page.locator("#atender").count(), 0, "no hay Atender: llama el candidato");
      assert.match(await page.locator(".state-label").textContent(), /Agustina Ferrari · 11 6\d{3}-\d{4}/, "a quién llama y su número");
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__audio.osciladores), 0, "antes de marcar no suena nada");
      assert.equal(await page.evaluate(() => window.__live.urls.length), 0, "ni conecta");
      await page.locator("#llamar").click();
      assert.equal(await page.locator("#llamar").count(), 0);
      assert.match(await page.locator(".state-label").textContent(), /Llamando a Agustina/);
      assert.equal(await page.evaluate(() => window.__audio.osciladores), 1, "un solo tono, el de llamada");
      await page.waitForFunction(() => window.__live.enviados.some(m => m.realtimeInput && m.realtimeInput.text), null, { timeout: 8000 });
      await page.waitForFunction(() => !/Llamando/.test(document.querySelector(".state-label").textContent), null, { timeout: 5000 });
      assert.ok(await page.evaluate(() => window.__audio.parados) >= 1, "el tono se cortó cuando atendió");
    }));

  test("mientras suena solo está el botón verde, centrado; al atender aparecen Colgar y los controles", async () => {
    await abrirLlamada({ atender: false });
    await page.locator("#atender:not([disabled]), #llamar").first().waitFor();
    assert.equal(await page.locator("#hang").isVisible(), false, "sin Colgar mientras suena");
    assert.equal(await page.locator(".controls").isVisible(), false, "sin la barra de controles");
    const centro = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const boton = centro(await page.locator(".atender").boundingBox());
    const llamada = centro(await page.locator("#body").boundingBox());
    assert.ok(Math.abs(boton.x - llamada.x) < 2, `centrado a lo ancho (${boton.x} vs ${llamada.x})`);
    const orb = await page.locator(".orb").boundingBox();
    const bloque = (orb.y + (await page.locator(".atender").boundingBox()).y + 52) / 2;
    assert.ok(Math.abs(bloque - llamada.y) < 30, `el bloque del timbre está en el medio (${bloque} vs ${llamada.y})`);
    await atenderEn(page);
    await page.locator("#hang").waitFor({ state: "visible" });
    assert.ok(await page.locator(".controls").isVisible());
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("colgar mientras suena el tono de llamada vuelve al brief sin conectar", () =>
    conEscenario((cfg, e) => { e.inicio = "llama"; }, async () => {
      await abrirLlamada({ atender: false });
      await page.locator("#llamar").click();
      await page.locator("#hang").click();
      await esperarVista("Simulación");
      await page.waitForTimeout(3800);
      assert.equal(await page.evaluate(() => window.__live.urls.length), 0, "no conecta después de colgar");
      assert.ok(await page.evaluate(() => window.__audio.parados) >= 1, "el tono se cortó");
    }));

  test("antes de llamar: elige micrófono, mide el nivel, prueba el sonido y la llamada usa ese micrófono", async () => {
    const ctx = await browser.newContext({ locale: "es-AR", permissions: ["microphone"] });
    page = await ctx.newPage();
    errores = [];
    page.on("pageerror", e => errores.push(String(e)));
    await page.addInitScript(simularGeminiLive);
    await page.addInitScript(espiarAudio);
    await page.addInitScript(() => {
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__mics = [];
      navigator.mediaDevices.getUserMedia = async c => { const st = await gum(c); window.__mics.push({ c, st }); return st; };
    });
    await ingresarEn(page, app.base, "estudiante1");
    await page.locator(".card", { hasText: "Viernes 19:30" }).click();
    const audio = page.locator(".audio");
    assert.match(await audio.innerText(), /probá tu audio/i);
    // Con el micrófono ya permitido, la barra arranca sola y se mueve con el micrófono falso (un tono).
    await page.waitForFunction(() => /Te escuchamos bien/.test(document.querySelector(".audio-msg").textContent), null, { timeout: 8000 });
    assert.equal(await page.locator(".nivel").isVisible(), true);
    const opciones = await page.locator('select[aria-label="Micrófono"] option').evaluateAll(os => os.map(o => o.value));
    assert.equal(opciones[0], "", "primero, el predeterminado");
    assert.ok(opciones.length >= 2, "lista los micrófonos");
    await page.locator('select[aria-label="Micrófono"]').selectOption(opciones[1]);
    await page.waitForFunction(id => window.__mics.some(m => m.c.audio && m.c.audio.deviceId && m.c.audio.deviceId.exact === id), opciones[1]);

    const antes = await page.evaluate(() => window.__audio.osciladores);
    await page.locator("button", { hasText: "Probar sonido" }).click();
    assert.equal(await page.evaluate(() => window.__audio.osciladores), antes + 2, "suenan las dos notas");

    await page.locator("#startCall").click();
    // Al salir del brief se cierra el micrófono de la prueba.
    assert.ok(await page.evaluate(() => window.__mics.slice(0, -1).every(m => m.st.getTracks().every(t => t.readyState === "ended"))));
    await atenderEn(page);
    await page.waitForFunction(() => window.__live.enviados.some(m => m.setup));
    const ultimo = await page.evaluate(() => window.__mics[window.__mics.length - 1].c.audio);
    assert.equal(ultimo.deviceId.exact, opciones[1], "la llamada usa el micrófono elegido");
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  test("cada tanto renueva la sesión sin cortar la llamada, para que no se pierda el acento", async () => {
    await abrirLlamada();
    await page.evaluate(() => { T.voice.ajustes.renovarMs = 800; });
    await page.waitForFunction(() => document.querySelectorAll(".transcript .ln.c").length >= 1, null, { timeout: 8000 });
    await page.waitForTimeout(900);
    if (await page.locator(".typebar").isHidden()) await page.locator('button[aria-label="Escribir en vez de hablar"]').click();
    const campo = page.locator('.typebar input[aria-label="Tu respuesta"]');
    await campo.fill("Hola Agustina, contame qué pasa con los recordatorios.");
    await campo.press("Enter");
    await page.evaluate(() => window.__live.decir("Mirá, a los pacientes les llegan dos mensajes por cada turno.", 300));

    // Cuando el cliente termina de hablar, abre una sesión nueva en paralelo y le pasa el micrófono.
    await page.waitForFunction(() => window.__live.abiertos.length === 2 && window.__live.abiertos[0].readyState === 3, null, { timeout: 8000 });
    const [viejo, nuevo] = await page.evaluate(() => window.__live.abiertos.map(w => ({ mios: w.mios })));
    const consigna = nuevo.mios.find(m => m.setup).setup.systemInstruction.parts[0].text;
    assert.match(consigna, /LA LLAMADA YA ESTÁ EN CURSO/);
    assert.match(consigna, /dos mensajes por cada turno/, "le pasa lo hablado");
    assert.match(consigna, /TU ACENTO/);
    assert.equal(nuevo.mios.find(m => m.setup).setup.sessionResumption.handle, undefined, "es una sesión nueva, no la retomada");
    assert.ok(viejo.mios.some(m => m.realtimeInput && m.realtimeInput.audio));
    await page.waitForFunction(() => window.__live.abiertos[1].mios.some(m => m.realtimeInput && m.realtimeInput.audio), null, { timeout: 5000 });
    assert.equal(nuevo.mios.filter(m => m.realtimeInput && m.realtimeInput.text).length, 0, "la sesión nueva no saluda de nuevo");
    assert.doesNotMatch(await page.locator(".state-label").textContent(), /Conectando/);
    assert.equal(await page.locator(".notice").last().isVisible(), false, "no avisa ningún corte");

    // La charla sigue por la sesión nueva.
    await page.evaluate(() => window.__live.decir("Bueno, ¿y cuándo lo arreglan?", 200));
    await page.waitForFunction(() => /cuándo lo arreglan/.test(document.querySelector(".transcript").textContent), null, { timeout: 5000 });
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("el ruido de línea suena solo mientras habla el cliente", async () => {
    await abrirLlamada({ atender: false });
    await page.evaluate(() => { const orig = T.voice.linea; T.voice.linea = s => (window.__linea = orig(s)); });
    await atenderEn(page);
    await page.waitForFunction(() => window.__linea && window.__linea.sonando, null, { timeout: 8000 });
    assert.equal(await estado(), "speaking", "suena mientras el cliente habla");
    await esperarEstado("listening");
    assert.equal(await page.evaluate(() => window.__linea.sonando), false, "en silencio, no");
    await page.evaluate(() => window.__live.decir("Sí, te escucho.", 300));
    await page.waitForFunction(() => window.__linea.sonando, null, { timeout: 5000 });
    await page.locator("#hang").click();
    await page.waitForFunction(() => window.__linea.parado, null, { timeout: 5000 });
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("la voz del cliente pasa por el filtro telefónico, salvo que la empresa lo apague", async () => {
    await abrirLlamada();
    await esperarEstado("speaking");
    // El filtro de la voz, y el "bandpass" del ruido de línea que suena de fondo.
    assert.deepEqual((await page.evaluate(() => window.__audio.filtros)).sort(), ["bandpass", "highpass", "lowpass", "peaking"]);
    const setup = await page.evaluate(() => window.__live.enviados.find(m => m.setup).setup);
    assert.match(setup.systemInstruction.parts[0].text, /TU ACENTO/);
    assert.match(setup.systemInstruction.parts[0].text, /Tu acento rioplatense es igual en el último turno/);
    await page.context().close();
    await conEscenario(cfg => { cfg.vozTelefonica = false; }, async () => {
      await abrirLlamada();
      await esperarEstado("speaking");
      assert.deepEqual(await page.evaluate(() => window.__audio.filtros), []);
    });
  });

  test("conversación completa: setup, el cliente habla primero, transcripción, interrupción, colgar y evaluación", async () => {
    await abrirLlamada();

    // Conexión: token del servidor y setup con la consigna del escenario.
    await page.waitForFunction(() => window.__live.enviados.some(m => m.realtimeInput && m.realtimeInput.text));
    const { urls, setup, pie } = await page.evaluate(() => ({
      urls: window.__live.urls,
      setup: window.__live.enviados.find(m => m.setup).setup,
      pie: (window.__live.enviados.find(m => m.realtimeInput && m.realtimeInput.text) || {}).realtimeInput
    }));
    assert.equal(urls[0], "wss://falso.test/live?access_token=auth_tokens%2Ftoken-falso-123");
    assert.equal(setup.model, "models/gemini-test-live");
    assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"]);
    assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore", "Agustina → voz femenina");
    assert.match(setup.systemInstruction.parts[0].text, /POR VOZ/);
    assert.match(setup.systemInstruction.parts[0].text, /herramienta colgar/);
    assert.ok(setup.inputAudioTranscription && setup.outputAudioTranscription, "transcripción de los dos lados");
    assert.equal(setup.tools[0].functionDeclarations[0].name, "colgar");
    assert.match(pie.text, /Hablá vos primero/, "el cliente habla primero");

    // El cliente saluda: se ve lo que dice y suena.
    await esperarEstado("speaking");
    await page.waitForFunction(() => /dos recordatorios/.test(document.querySelector(".caption").textContent));
    await esperarEstado("listening");
    assert.ok(await page.evaluate(() => window.__live.fuentes.terminadas >= 2), "se reprodujeron los dos pedazos de audio");

    // Micrófono: PCM 16 bits a 16 kHz en bloques de 40 ms (640 muestras = 1280 bytes).
    await page.waitForFunction(() => window.__live.enviados.some(m => m.realtimeInput && m.realtimeInput.audio));
    const audio = await page.evaluate(() => window.__live.enviados.find(m => m.realtimeInput && m.realtimeInput.audio).realtimeInput.audio);
    assert.equal(audio.mimeType, "audio/pcm;rate=16000");
    assert.equal(atob(audio.data).length, 1280);

    // El estudiante habla y el cliente contesta.
    await page.evaluate(() => { window.__live.escuchar("Hola Agustina, soy Lucas."); window.__live.escuchar(" Contame desde cuándo pasa."); });
    await page.waitForFunction(() => /Contame desde cuándo/.test(document.querySelectorAll(".caption")[1].textContent));
    await page.evaluate(() => window.__live.decir("Desde el lunes, más o menos. Y los pacientes se quejan, viste.", 400));
    await page.waitForFunction(() => document.querySelectorAll(".transcript .ln").length >= 3);

    // Interrupción: el cliente arranca algo largo y el estudiante le habla encima.
    await esperarEstado("listening");
    const antes = await page.evaluate(() => ({ ...window.__live.fuentes }));
    await page.evaluate(() => { window.__live.escuchar("Perfecto, ¿y pasa con todos los pacientes?"); window.__live.decir("Mirá, con todos no sé, pero el otro día una señora me llamó re enojada porque", 6000, { terminar: false }); });
    await esperarEstado("speaking");
    const t0 = Date.now();
    await page.evaluate(() => { window.__live.ws.servidor({ serverContent: { interrupted: true } }); });
    await esperarEstado("listening");
    assert.ok(Date.now() - t0 < 1000, "pasa a escuchar enseguida");
    const despues = await page.evaluate(() => ({ ...window.__live.fuentes }));
    assert.equal(despues.iniciadas - antes.iniciadas, 2);
    assert.equal(despues.cortadas - antes.cortadas, 2, "se cortó todo el audio del cliente que faltaba sonar");

    // Lo que alcanzó a decir queda en la transcripción.
    await page.waitForFunction(() => [...document.querySelectorAll(".transcript .ln")].some(l => /re enojada/.test(l.textContent)));

    // Tocar la esfera también lo corta.
    await page.evaluate(() => { window.__live.escuchar("Uy, entiendo."); window.__live.decir("Sí, y además me dijeron que lo iban a arreglar y nada, sigue igual, así que no sé qué hacer", 6000, { terminar: false }); });
    await esperarEstado("speaking");
    await page.locator(".orb.big").click({ force: true });   // la esfera late con el audio: nunca queda quieta
    await esperarEstado("listening");
    // El resto de esa respuesta que siga llegando se descarta.
    await page.evaluate(() => window.__live.decir("y esto no debería sonar", 400));
    await page.waitForTimeout(300);
    assert.equal(await estado(), "listening");

    // Despedida: el cliente llama a la herramienta colgar y la llamada termina sola.
    await page.evaluate(() => {
      window.__live.escuchar("Lo reviso hoy y te escribo a las tres con novedades.");
      window.__live.decir("Bueno, dale, espero tu mensaje. Gracias, chau.", 400, { terminar: false });
      window.__live.ws.servidor({ toolCall: { functionCalls: [{ id: "f1", name: "colgar", args: {} }] } });
    });
    await esperarVista("Informe");

    // La evaluación recibió la transcripción de los dos lados.
    const evalCall = app.fake.calls.find(c => c.payload.model === "gemini-test-eval");
    const enviado = JSON.stringify(evalCall.payload.messages);
    for (const frase of ["dos recordatorios", "Contame desde cuándo pasa", "Desde el lunes", "re enojada", "te escribo a las tres", "espero tu mensaje"]) {
      assert.ok(enviado.includes(frase), "falta en la evaluación: " + frase);
    }
    assert.ok(!/no debería sonar/.test(enviado), "lo descartado no entra en la transcripción");
    assert.ok(await page.evaluate(() => window.__live.abiertos.every(w => w.readyState === 3)), "se cerró la conexión");
    assert.deepEqual(errores, []);
    await page.context().close();
  });

  test("si Gemini Live no conecta, ofrece seguir con otra voz", async () => {
    const ctx = await browser.newContext({ locale: "es-AR", permissions: ["microphone"] });
    page = await ctx.newPage();
    errores = [];
    page.on("pageerror", e => errores.push(String(e)));
    await page.addInitScript(simularGeminiLive);
    await page.addInitScript(() => { window.__live.fallar = "API key not valid. Please pass a valid API key."; });
    await ingresarEn(page, app.base, "estudiante1");
    await page.locator(".card").first().click();
    await page.locator("#startCall").click();
    await atenderEn(page);
    const boton = page.locator("button", { hasText: "Seguir con otra voz" });
    await boton.waitFor({ timeout: 5000 });
    assert.match(await page.locator(".notice").last().innerText(), /rechazó la conexión de Gemini Live/);
    await boton.click();
    await esperarVista("Llamada en curso");
    // Sigue con la voz del navegador (Vapi no está configurado): ya no intenta Gemini Live.
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__live.urls.length), 1, "no reintenta Gemini Live");
    assert.equal(await page.locator("button", { hasText: "Seguir con otra voz" }).count(), 0);
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  test("llamada entrante: la clienta no habla primero, espera que el candidato atienda", async () => {
    const cfg = configEjemplo();
    cfg.escenarios.find(e => /Viernes 19:30/.test(e.titulo)).inicio = "atiende";
    assert.equal((await pedir(app.base, "/api/empresa", { method: "PUT", json: cfg })).status, 200);
    try {
      await abrirLlamada();
      await page.waitForFunction(() => window.__live.enviados.some(m => m.setup));
      await esperarEstado("listening");
      await page.waitForTimeout(500);
      const pie = await page.evaluate(() => window.__live.enviados.filter(m => m.realtimeInput && m.realtimeInput.text).length);
      assert.equal(pie, 0, "no se manda el pie de arranque");
      assert.match(await page.locator(".state-label").textContent(), /saludá vos primero/);
      const setup = await page.evaluate(() => window.__live.enviados.find(m => m.setup).setup);
      assert.match(setup.systemInstruction.parts[0].text, /Esperá a que Lucas Ferreyra atienda y salude/);
      assert.deepEqual(errores, []);
      await page.context().close();
    } finally {
      await pedir(app.base, "/api/empresa", { method: "PUT", json: configEjemplo() });
    }
  });

  test("Colgar corta la llamada y libera la conexión", async () => {
    await abrirLlamada();
    await esperarEstado("listening");
    await page.locator("#hang").click();
    await esperarVista("Llamada muy corta");
    assert.ok(await page.evaluate(() => window.__live.abiertos.every(w => w.readyState === 3)));
    assert.deepEqual(errores, []);
    await page.context().close();
  });
});
