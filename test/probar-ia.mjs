/* Comprueba que el proveedor de IA del .env (y el de respaldo) funcionan de verdad, usando
   el mismo camino que la app (server.js -> proveedor). No imprime ninguna key.

       npm run probar-ia                                                                 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-probar-"));

const proc = spawn(process.execPath, [path.join(RAIZ, "server.js")], {
  cwd: RAIZ,
  env: { ...process.env, PORT: "0", DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"]
});
let salida = "";
proc.stdout.on("data", d => (salida += d));
proc.stderr.on("data", d => (salida += d));

const puerto = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("el servidor no arrancó:\n" + salida)), 10000);
  const iv = setInterval(() => {
    const m = salida.match(/http:\/\/localhost:(\d+)/);
    if (m) { clearTimeout(t); clearInterval(iv); res(Number(m[1])); }
  }, 50);
});

console.log("\n  Probando la IA con una consulta mínima…\n");
const d = await (await fetch(`http://127.0.0.1:${puerto}/api/diagnostico`)).json();
const linea = (rol, p) => {
  if (!p) return console.log(`  ${rol}: (sin respaldo: LLM_FALLBACK vacío)`);
  const extra = p.plan ? ` · plan ${p.plan}` : "";
  if (p.ok) console.log(`  ✓ ${rol}: ${p.nombre} · modelo ${p.modelo}${extra} · ${p.latenciaMs} ms · "${p.respuesta}"`);
  else console.log(`  ✗ ${rol}: ${p.nombre} · modelo ${p.modelo} — ${p.error}`);
};
linea("Principal", d.principal);
linea("Respaldo ", d.respaldo);
console.log(d.activo ? `\n  La app va a responder con: ${d.activo}\n` : "\n  Ningún proveedor responde: revisá los mensajes de arriba.\n");
terminar(d.activo ? 0 : 1);

function terminar(codigo) {
  try { proc.kill(); } catch (_) {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(codigo);
}
