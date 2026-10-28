/* Arranca server.js en un proceso aparte, con la falsa API de IA y una carpeta
   de datos temporal, así las pruebas no tocan data/ ni salen a internet.
   Siembra usuarios de prueba (clave "clave-de-prueba") y entra como empresa1:
   pedir() y pedirMensajes() mandan esa sesión salvo que se pase { cookie: null } u otra. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { startFakeLLM } from "./fake-llm.mjs";

const require = createRequire(import.meta.url);
const crearAuth = require("../auth.js");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// sinUsuarios: arranca con la carpeta de datos vacía (el servidor crea las cuentas de prueba) y entra como empresa-demo.
export async function startApp({ provider = "gemini", key = "clave-de-prueba", env = {}, sinUsuarios = false } = {}) {
  const fake = await startFakeLLM();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-test-"));
  fs.mkdirSync(path.join(dataDir, "informes"), { recursive: true });
  let codigoNuevo = null;
  if (!sinUsuarios) {
    const auth = crearAuth(dataDir);
    for (const u of USUARIOS_PRUEBA) {
      auth.crearUsuario(u);
      auth.fijarClave(u.usuario, CLAVE_PRUEBA);
    }
    // Uno que todavía tiene que crear su contraseña: entra con este código.
    codigoNuevo = auth.crearUsuario({ rol: "estudiante", nombre: "Nico Nuevo", usuario: "nuevo1" }).codigo;
  }

  const proc = spawn(process.execPath, [path.join(RAIZ, "server.js")], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PORT: "0",                       // lo reemplazamos abajo: node necesita un puerto fijo, buscamos uno libre
      LLM_PROVIDER: provider,
      LLM_FALLBACK: "",
      GEMINI_API_KEY: provider === "gemini" ? key : "",
      ANTHROPIC_API_KEY: provider === "anthropic" ? key : "",
      GEMINI_LIVE_API_KEY_2: "",           // que no se cuelen las keys de respaldo del .env real
      GEMINI_LIVE_API_KEY_3: "",
      GEMINI_BASE_URL: fake.gemini,
      ANTHROPIC_BASE_URL: fake.anthropic,
      GEMINI_LIVE_BASE_URL: fake.live,
      GEMINI_LIVE_MODEL: "gemini-test-live",
      GEMINI_MODEL: "gemini-test-chat",
      GEMINI_MODEL_VOICE: "gemini-test-voz",
      GEMINI_MODEL_EVAL: "gemini-test-eval",
      ANTHROPIC_MODEL: "claude-test-chat",
      ANTHROPIC_MODEL_VOICE: "claude-test-voz",
      ANTHROPIC_MODEL_EVAL: "claude-test-eval",
      VOICE_PROVIDER: "browser",
      DATA_DIR: dataDir,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let salida = "";
  proc.stdout.on("data", d => (salida += d));
  proc.stderr.on("data", d => (salida += d));

  const puerto = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("el servidor no arrancó:\n" + salida)), 10000);
    const mirar = () => {
      const m = salida.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(t); clearInterval(iv); res(Number(m[1])); }
    };
    const iv = setInterval(mirar, 50);
    proc.on("exit", () => { clearTimeout(t); clearInterval(iv); rej(new Error("el servidor murió:\n" + salida)); });
  });

  const base = `http://127.0.0.1:${puerto}`;
  const ingresar = async (usuario, clave = CLAVE_PRUEBA) => {
    const r = await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario, clave }) });
    const c = (r.headers.get("set-cookie") || "").split(";")[0];
    if (!r.ok || !c) throw new Error(`no se pudo entrar como ${usuario}: HTTP ${r.status}`);
    return c;
  };
  let cookie;
  try { cookie = sinUsuarios ? await ingresar("empresa-demo", "1234") : await ingresar("empresa1"); }
  catch (e) { proc.kill(); await fake.close(); throw e; }
  COOKIES.set(base, cookie);
  return {
    base, fake, dataDir, cookie, ingresar, codigoNuevo,
    log: () => salida,
    async stop() {
      COOKIES.delete(base);
      proc.kill();
      await fake.close();
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
    }
  };
}

export const CLAVE_PRUEBA = "clave-de-prueba";
export const USUARIOS_PRUEBA = [
  { usuario: "estudiante1", rol: "estudiante", nombre: "Lucas Ferreyra" },
  { usuario: "estudiante2", rol: "estudiante", nombre: "Ana Paz" },
  { usuario: "junior1", rol: "junior", nombre: "Camila Ruiz" },
  { usuario: "empresa1", rol: "empresa", nombre: "Responsable" }
];
const COOKIES = new Map();   // base -> cookie de empresa1 de esa startApp
const conSesion = (base, opts) => {
  const c = opts.cookie === undefined ? COOKIES.get(base) : opts.cookie;
  return c ? { cookie: c } : {};
};

// Pide una URL y devuelve status + cuerpo ya parseado si es JSON.
export async function pedir(base, ruta, opts = {}) {
  const { cookie: _c, json: _j, ...resto } = opts;
  const res = await fetch(base + ruta, {
    ...resto,
    headers: { "content-type": "application/json", ...conSesion(base, opts), ...(opts.headers || {}) },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
  });
  const texto = await res.text();
  let cuerpo = texto;
  try { cuerpo = JSON.parse(texto); } catch (_) {}
  return { status: res.status, cuerpo, texto, headers: res.headers };
}

// Junta el texto de un streaming de /api/messages, como hace public/js/api.js.
export async function pedirMensajes(base, payload, opts = {}) {
  const res = await fetch(base + "/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...conSesion(base, opts) },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const texto = await res.text();
    let cuerpo = texto; try { cuerpo = JSON.parse(texto); } catch (_) {}
    return { status: res.status, error: cuerpo && cuerpo.error, texto, eventos: [] };
  }
  const bruto = await res.text();
  const eventos = [];
  for (const bloque of bruto.split("\n\n")) {
    const linea = bloque.split("\n").find(l => l.startsWith("data:"));
    if (!linea) continue;
    try { eventos.push(JSON.parse(linea.slice(5).trim())); } catch (_) {}
  }
  const texto = eventos
    .filter(e => e.type === "content_block_delta" && e.delta && e.delta.type === "text_delta")
    .map(e => e.delta.text).join("");
  return { status: res.status, eventos, texto, bruto };
}

// La configuración de ejemplo del navegador (T.DEFAULTS), para guardarla con cambios en una prueba.
export function configEjemplo() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const rel of ["public/js/core.js", "public/js/defaults.js"]) vm.runInContext(fs.readFileSync(path.join(RAIZ, rel), "utf8"), ctx, { filename: rel });
  return JSON.parse(JSON.stringify(ctx.T.DEFAULTS));
}

// Navegador (Playwright): entra por la pantalla de ingreso de la app.
export async function ingresarEn(page, base, usuario, clave = CLAVE_PRUEBA) {
  if (!page.url().startsWith(base)) await page.goto(base);
  await page.locator("#loginUsuario").fill(usuario);
  await page.locator("#loginClave").fill(clave);
  await page.locator("#loginEntrar").click();
  await page.waitForFunction(() => !document.body.classList.contains("sin-sesion"), null, { timeout: 15000 });
}

// Navegador: cierra la sesión desde el menú de la tarjeta del usuario.
export async function salirEn(page) {
  // En pantallas chicas la tarjeta está en el menú lateral, fuera de la pantalla: hay que abrirlo.
  const cerrado = await page.evaluate(() => !document.getElementById("side").classList.contains("open"));
  if (await page.locator("#menu").isVisible() && cerrado) {
    await page.locator("#menu").click();
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open"));
  }
  await page.locator("#me").click();
  await page.locator("#salir").click();
  await page.locator("#loginUsuario").waitFor();
}

// Llamadas por teléfono: hay que tocar el botón verde, "Atender" (entrante) o "Llamar" (saliente).
// En las entrantes que conectan mientras suena, el botón se habilita cuando la voz está lista.
export async function atenderEn(page) {
  const boton = page.locator("#atender, #llamar");
  try { await boton.waitFor({ timeout: 3000 }); } catch (_) { return; }
  await page.waitForFunction(() => { const b = document.querySelector("#atender, #llamar"); return !b || !b.disabled; }, null, { timeout: 15000 });
  if (await boton.count()) await boton.click();
}
