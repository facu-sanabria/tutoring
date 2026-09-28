/* Recorrido completo de la app en un navegador de verdad, con la API de IA falsa.
   Cubre: inicio del estudiante, llamada escribiendo en vez de hablar, evaluación,
   informe, chat del junior y edición en el panel de empresa.

   Necesita Playwright (dependencia solo de desarrollo):
       npm install
       npx playwright install chromium
       npm run test:e2e

   Si Playwright no está instalado, las pruebas se saltean con un aviso en vez de fallar. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startApp, pedir } from "./helpers.mjs";

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (_) {}

const saltear = chromium
  ? false
  : "Falta Playwright: corré `npm install` y `npx playwright install chromium`.";

describe("recorrido completo en el navegador", { skip: saltear }, () => {
  let app, browser, page;

  before(async () => {
    app = await startApp({ provider: "gemini" });
    browser = await chromium.launch();
    const ctx = await browser.newContext({ locale: "es-AR" });
    page = await ctx.newPage();
    page.on("dialog", d => d.accept());          // beforeunload al recargar durante una llamada
    errores = [];
    page.on("pageerror", e => errores.push(String(e)));
    // El 404 de /api/empresa la primera vez es esperado (todavía no hay configuración guardada).
    page.on("console", m => {
      const url = (m.location() && m.location().url) || "";
      if (m.type() === "error" && !/favicon|\/api\/empresa/.test(url + " " + m.text())) errores.push(m.text() + " @ " + url);
    });
    await page.goto(app.base);
    await page.waitForSelector(".card");
  });
  after(async () => {
    if (browser) await browser.close();
    if (app) await app.stop();
  });

  let errores = [];
  const esperarVista = etiqueta => page.waitForFunction(t => document.getElementById("viewLabel").textContent === t, etiqueta, { timeout: 15000 });

  test("estudiante: la pantalla de inicio muestra los escenarios y el estado de la IA", async () => {
    assert.equal(await page.locator(".status").textContent(), "IA conectada · Gemini");
    assert.equal(await page.locator(".card").count(), 3);
    await assert.doesNotReject(page.locator(".card b", { hasText: "Recordatorios duplicados" }).waitFor());
    assert.equal(await page.locator("#candidato").inputValue(), "Lucas Ferreyra");
  });

  test("estudiante: el brief explica con quién habla y cuál es el objetivo", async () => {
    await page.locator(".card").first().click();
    await esperarVista("Simulación");
    const texto = await page.locator(".brief").innerText();
    assert.match(texto, /Laura Méndez/i);
    assert.match(texto, /tu objetivo/i);
    assert.equal(await page.locator("#startCall").isEnabled(), true);
  });

  test("la llamada arranca, habla el cliente y se puede responder escribiendo", async () => {
    await page.locator("#startCall").click();
    await esperarVista("Llamada en curso");
    // El cliente simulado abre la conversación.
    await page.waitForFunction(() => /dos mensajes por cada turno/.test(document.querySelector(".caption").textContent), null, { timeout: 15000 });

    // Sin micrófono el motor avisa y abre el teclado solo; igual lo abrimos por las dudas.
    if (await page.locator(".typebar").isHidden()) await page.locator('button[aria-label="Escribir en vez de hablar"]').click();
    const campo = page.locator('.typebar input[aria-label="Tu respuesta"]');
    await campo.fill("Buen día Laura, contame desde cuándo pasa y a cuántos pacientes les pasa.");
    await campo.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".transcript .ln").length >= 3, null, { timeout: 15000 });

    await campo.fill("Entiendo. Lo reviso con el equipo y te aviso hoy a las tres.");
    await campo.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".transcript .ln").length >= 5, null, { timeout: 15000 });

    const turnos = await page.locator(".transcript .ln").evaluateAll(ns => ns.map(n => n.className));
    // La conversación alterna cliente/candidato.
    assert.ok(turnos.filter(c => c.includes("u")).length >= 2, "faltan turnos del candidato");
    assert.ok(turnos.filter(c => c.includes("c")).length >= 2, "faltan turnos del cliente");
  });

  test("colgar dispara la evaluación y deja un informe con puntaje y evidencia", async () => {
    await page.locator("#hang").click();
    await esperarVista("Informe");

    assert.equal(await page.locator(".ring .n b").textContent(), "81");
    const criterios = await page.locator(".crit .nm").evaluateAll(ns => ns.map(n => n.firstChild.textContent));
    assert.deepEqual(criterios, ["Escucha activa", "Preguntas para entender", "Claridad", "Empatía", "Manejo de expectativas", "Cierre y próximos pasos"]);

    const evidencias = await page.locator(".crit .ev").allTextContents();
    assert.equal(evidencias.length, 6, "cada criterio tiene que mostrar evidencia");
    assert.match(evidencias[0], /Entiendo, contame desde cuándo pasa/);

    const aviso = await page.locator(".disclaimer").textContent();
    assert.match(aviso, /no recomienda contratar ni descartar/);
    assert.equal(await page.locator(".report .notice").count(), 0, "no debería avisar criterios sin puntuar");
  });

  test("el informe quedó guardado en el servidor y se ve en la lista", async () => {
    const { cuerpo } = await pedir(app.base, "/api/informes");
    assert.equal(cuerpo.length, 1);
    assert.equal(cuerpo[0].candidato, "Lucas Ferreyra");
    assert.equal(cuerpo[0].puntaje, 81);

    await page.locator('.seg button[data-profile="estudiante"]').click();
    await esperarVista("Simulaciones por voz");
    await page.locator('.nav button:has-text("Mis informes")').click();
    await esperarVista("Mis informes");
    assert.equal(await page.locator(".list button").count(), 1);
    assert.equal(await page.locator(".score-chip").textContent(), "81/100");
  });

  test("junior: el mentor responde con los bloques [Técnico] [Negocio] [Cómo lo hacemos acá] [Tu turno]", async () => {
    await page.locator('.seg button[data-profile="junior"]').click();
    await esperarVista("Mentor del equipo");
    await page.locator(".card", { hasText: "Encarar un ticket" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".thread .blk").length >= 4, null, { timeout: 15000 });

    const etiquetas = await page.locator(".thread .blk .lbl").allTextContents();
    assert.deepEqual(etiquetas, ["Técnico", "Negocio", "Cómo lo hacemos acá", "Tu turno"]);
    assert.match(await page.locator(".thread .u").first().textContent(), /TF-142/);
    assert.match(await page.locator("#ctxLine").textContent(), /Nodo Software/);
  });

  test("junior: se puede seguir la conversación escribiendo", async () => {
    await page.locator("#input").fill("¿Por qué se duplican si el worker corre en dos réplicas?");
    await page.locator("#send").click();
    await page.waitForFunction(() => document.querySelectorAll(".thread .blk").length >= 8, null, { timeout: 15000 });
    assert.equal(await page.locator(".thread .u").count(), 2);
    assert.equal(await page.locator(".thread .err").count(), 0, "no tendría que haber errores");
  });

  test("empresa: el senior edita el contexto y se guarda en el servidor", async () => {
    await page.locator('.seg button[data-profile="empresa"]').click();
    await esperarVista("Contexto de la empresa");
    assert.equal(await page.locator("#saveCfg").isDisabled(), true, "sin cambios el botón está apagado");

    await page.locator(".cfg .grid2 input").first().fill("Nodo Software SRL");
    assert.equal(await page.locator("#saveCfg").isDisabled(), false);
    assert.equal(await page.locator(".dirty").isVisible(), true);
    await page.locator("#saveCfg").click();
    await page.waitForFunction(() => /Configuración guardada/.test(document.getElementById("toast").textContent), null, { timeout: 10000 });

    const { cuerpo } = await pedir(app.base, "/api/empresa");
    assert.equal(cuerpo.empresa, "Nodo Software SRL");
  });

  test("empresa: se edita un escenario y un criterio, y quedan guardados", async () => {
    await page.locator('.nav button:has-text("Escenarios")').click();
    await esperarVista("Escenarios de simulación");
    await page.locator(".acc-h").first().click();
    await page.locator(".acc-b input").first().fill("Recordatorios duplicados (editado)");
    await page.locator("#saveCfg").click();
    await page.waitForFunction(() => /Configuración guardada/.test(document.getElementById("toast").textContent), null, { timeout: 10000 });

    await page.locator('.nav button:has-text("Criterios")').click();
    await esperarVista("Criterios de evaluación");
    await page.locator(".crit-row select").first().selectOption("1");
    await page.locator("#saveCfg").click();
    await page.waitForFunction(() => /Configuración guardada/.test(document.getElementById("toast").textContent), null, { timeout: 10000 });

    const { cuerpo } = await pedir(app.base, "/api/empresa");
    assert.equal(cuerpo.escenarios[0].titulo, "Recordatorios duplicados (editado)");
    assert.equal(cuerpo.criterios[0].peso, 1);
  });

  test("empresa: ve el informe del candidato y lo puede eliminar", async () => {
    await page.locator('.nav button:has-text("Informes")').click();
    await esperarVista("Informes de candidatos");
    assert.equal(await page.locator(".list button").count(), 1);
    await page.locator(".list button").first().click();
    await esperarVista("Informe");
    assert.equal(await page.locator('button:has-text("Eliminar")').count(), 1);

    await page.locator('button:has-text("Eliminar")').click();
    await esperarVista("Informes de candidatos");
    const { cuerpo } = await pedir(app.base, "/api/informes");
    assert.equal(cuerpo.length, 0);
  });

  test("a 400 px de ancho no se desborda ninguna pantalla", async () => {
    await page.setViewportSize({ width: 400, height: 820 });
    const vistas = [
      ['.seg button[data-profile="estudiante"]', "Simulaciones por voz"],
      ['.seg button[data-profile="junior"]', "Mentor del equipo"],
      ['.seg button[data-profile="empresa"]', "Contexto de la empresa"]
    ];
    for (const [sel, etiqueta] of vistas) {
      // En pantallas chicas el menú lateral está escondido: hay que abrirlo primero.
      await page.locator("#menu").click();
      await page.waitForFunction(() => document.getElementById("side").classList.contains("open"));
      await page.locator(sel).click();
      await esperarVista(etiqueta);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(desborde, 0, `${etiqueta} se desborda a lo ancho`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("no hubo errores de JavaScript en toda la corrida", () => {
    assert.deepEqual(errores, []);
  });
});
