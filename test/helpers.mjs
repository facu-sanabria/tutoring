/* Arranca server.js en un proceso aparte, con la falsa API de IA y una carpeta
   de datos temporal, así las pruebas no tocan data/ ni salen a internet. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeLLM } from "./fake-llm.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function startApp({ provider = "gemini", key = "clave-de-prueba", env = {} } = {}) {
  const fake = await startFakeLLM();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-test-"));
  fs.mkdirSync(path.join(dataDir, "informes"), { recursive: true });

  const proc = spawn(process.execPath, [path.join(RAIZ, "server.js")], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PORT: "0",                       // lo reemplazamos abajo: node necesita un puerto fijo, buscamos uno libre
      LLM_PROVIDER: provider,
      GEMINI_API_KEY: provider === "gemini" ? key : "",
      ANTHROPIC_API_KEY: provider === "anthropic" ? key : "",
      GEMINI_BASE_URL: fake.gemini,
      ANTHROPIC_BASE_URL: fake.anthropic,
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
  return {
    base, fake, dataDir,
    log: () => salida,
    async stop() {
      proc.kill();
      await fake.close();
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
    }
  };
}

// Pide una URL y devuelve status + cuerpo ya parseado si es JSON.
export async function pedir(base, ruta, opts = {}) {
  const res = await fetch(base + ruta, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
  });
  const texto = await res.text();
  let cuerpo = texto;
  try { cuerpo = JSON.parse(texto); } catch (_) {}
  return { status: res.status, cuerpo, texto, headers: res.headers };
}

// Junta el texto de un streaming de /api/messages, como hace public/js/api.js.
export async function pedirMensajes(base, payload) {
  const res = await fetch(base + "/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
