import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startApp, pedir } from "./helpers.mjs";

test("respaldo Gemini: recuperar JSON, reintentar guardado y ver informe en Empresa", async () => {
  const app = await startApp({ provider: "claude-sdk", env: {
    LLM_FALLBACK: "gemini", GEMINI_API_KEY: "clave-de-prueba",
    CLAUDE_SDK_MODULE: "test/fake-sdk-limit.mjs"
  } });
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const empresa = await ctx.newPage();
    const errores = [];
    page.on("pageerror", e => errores.push(e.message));
    page.on("dialog", d => d.accept());
    await empresa.goto(app.base);
    await empresa.locator(".card").first().waitFor();
    await page.route("**/api/messages", async route => {
      const body = route.request().postDataJSON();
      if (body.purpose === "eval") body.messages[0].content += "\nFALLA_EVAL_TRUNCADA";
      await route.continue({ postData: JSON.stringify(body) });
    });
    let guardarFalla = true;
    await page.route("**/api/informes", async route => {
      if (route.request().method() === "POST" && guardarFalla) {
        guardarFalla = false;
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Disco no disponible" } }) });
      }
      await route.continue();
    });
    await page.goto(app.base);
    await page.locator(".card").first().click();
    await page.locator("#startCall").click();
    await page.waitForFunction(() => document.querySelectorAll(".transcript .ln").length >= 1);
    if (await page.locator(".typebar").isHidden()) await page.locator('button[aria-label="Escribir en vez de hablar"]').click();
    const input = page.locator('.typebar input[aria-label="Tu respuesta"]');
    for (const [i, texto] of ["Entiendo, contame desde cuándo pasa.", "Lo reviso con el equipo y te aviso hoy a las tres."].entries()) {
      await input.fill(texto);
      await input.press("Enter");
      await page.waitForFunction(n => document.querySelectorAll(".transcript .ln").length >= n, 3 + i * 2);
    }
    await page.locator("#hang").click();
    await page.getByText(/La valoración está lista, pero no se pudo guardar/).waitFor();
    const evalCalls = () => app.fake.calls.filter(c => c.payload.model === "gemini-test-eval").length;
    assert.equal(evalCalls(), 2, "recupera el JSON truncado en un segundo intento");
    assert.equal((await pedir(app.base, "/api/informes")).cuerpo.length, 0);
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("viewLabel").textContent === "Informe");
    assert.equal(evalCalls(), 2, "reintentar guardado no vuelve a consumir IA");
    assert.equal((await pedir(app.base, "/api/informes")).cuerpo.length, 1);
    await empresa.locator('.seg button[data-profile="empresa"]').click();
    await empresa.locator('.nav button:has-text("Informes")').click();
    await empresa.locator(".list button").first().waitFor();
    assert.equal(await empresa.locator(".list button").count(), 1);
    await empresa.locator(".list button").first().click();
    await empresa.locator(".crit").first().waitFor();
    assert.equal(await empresa.locator(".crit").count(), 6);
    assert.deepEqual(errores, []);
  } finally {
    await browser?.close();
    await app.stop();
  }
});
