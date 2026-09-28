/* Levanta Tutoring con una IA falsa, sin API key y sin internet.
   Sirve para probar la interfaz completa (y para ensayar la demo si se cae la red).

       node test/demo-offline.mjs            -> http://localhost:3200
       PORT=3300 node test/demo-offline.mjs

   Las respuestas son fijas (ver test/fake-llm.mjs): el cliente simulado dice siempre lo
   mismo y la evaluación devuelve un informe de ejemplo. No reemplaza la prueba con la
   API real, pero recorre toda la app.                                                 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeLLM } from "./fake-llm.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO = String(process.env.PORT || 3200);
const fake = await startFakeLLM();
const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-demo-"));
fs.mkdirSync(path.join(dataDir, "informes"), { recursive: true });

console.log("  IA falsa escuchando en el puerto", fake.port);
console.log("  Datos de esta corrida:", dataDir);

const proc = spawn(process.execPath, [path.join(RAIZ, "server.js")], {
  cwd: RAIZ,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: PUERTO,
    LLM_PROVIDER: "gemini",
    GEMINI_API_KEY: "clave-falsa-de-prueba",
    GEMINI_BASE_URL: fake.gemini,
    VOICE_PROVIDER: "browser",
    DATA_DIR: dataDir
  }
});

const cerrar = () => { try { proc.kill(); } catch (_) {} fake.close().finally(() => process.exit(0)); };
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
proc.on("exit", code => { fake.close().finally(() => process.exit(code || 0)); });
