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
import { startApp } from "./helpers.mjs";

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
      live.urls.push(url); live.abiertos.push(this); live.ws = this;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 20);
    }
    send(data) {
      const m = JSON.parse(data);
      live.enviados.push(m);
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

  async function abrirLlamada() {
    const ctx = await browser.newContext({ locale: "es-AR", permissions: ["microphone"] });
    page = await ctx.newPage();
    errores = [];
    page.on("pageerror", e => errores.push(String(e)));
    page.on("dialog", d => d.accept());
    await page.addInitScript(simularGeminiLive);
    await page.goto(app.base);
    await page.locator(".card").first().click();
    await esperarVista("Simulación");
    assert.match(await page.locator(".brief").innerText(), /Gemini Live/);
    await page.locator("#startCall").click();
    await esperarVista("Llamada en curso");
  }

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
    assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore", "Laura → voz femenina");
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
    await page.evaluate(() => { window.__live.escuchar("Hola Laura, soy Lucas."); window.__live.escuchar(" Contame desde cuándo pasa."); });
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
    await page.goto(app.base);
    await page.locator(".card").first().click();
    await page.locator("#startCall").click();
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
