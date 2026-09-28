/* Comprueba que la key y el modelo del .env funcionan de verdad, usando el mismo camino
   que la app (server.js -> proveedor). No imprime la key ni la guarda en ningún lado.

       npm run probar-ia

   Prueba los tres modelos (chat, voz y evaluación) porque en el plan gratuito de Gemini
   puede pasar que uno esté disponible y otro no.                                        */
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
const base = `http://127.0.0.1:${puerto}`;

const cfg = await (await fetch(base + "/api/config")).json();
console.log("\n──────────────────────────────────────────────");
console.log("  Proveedor:", cfg.providerName, `(LLM_PROVIDER=${cfg.provider})`);
console.log("  Key en el .env:", cfg.hasKey ? `sí (${cfg.keyVar})` : `NO — falta ${cfg.keyVar}`);
console.log("  Modelos: chat=%s · voz=%s · evaluación=%s", cfg.models.chat, cfg.models.voice, cfg.models.eval);
console.log("──────────────────────────────────────────────\n");

if (!cfg.hasKey) {
  console.log(`  Pegá tu key en el archivo .env (${cfg.keyVar}=...) y volvé a correr esto.\n`);
  terminar(1);
}

let fallas = 0;
for (const purpose of ["chat", "voice", "eval"]) {
  const etiqueta = { chat: "chat  ", voice: "voz   ", eval: "evalu." }[purpose];
  const desde = Date.now();
  try {
    const res = await fetch(base + "/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose,
        system: "Respondés en español rioplatense, en una sola oración corta.",
        messages: [{ role: "user", content: "Decime 'listo' y nada más." }],
        max_tokens: 64
      })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.log(`  ✗ ${etiqueta} (${cfg.models[purpose]}) — HTTP ${res.status}`);
      console.log(`      ${(j.error && j.error.message) || "sin detalle"}\n`);
      fallas++;
      continue;
    }
    const bruto = await res.text();
    let texto = "", errorEvento = "";
    for (const bloque of bruto.split("\n\n")) {
      const linea = bloque.split("\n").find(l => l.startsWith("data:"));
      if (!linea) continue;
      let ev; try { ev = JSON.parse(linea.slice(5).trim()); } catch (_) { continue; }
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") texto += ev.delta.text;
      if (ev.type === "error") errorEvento = (ev.error && ev.error.message) || "error";
    }
    if (errorEvento) { console.log(`  ✗ ${etiqueta} (${cfg.models[purpose]}) — ${errorEvento}\n`); fallas++; }
    else if (!texto.trim()) { console.log(`  ✗ ${etiqueta} (${cfg.models[purpose]}) — respondió vacío\n`); fallas++; }
    else console.log(`  ✓ ${etiqueta} (${cfg.models[purpose]}) — ${Date.now() - desde} ms — "${texto.trim().slice(0, 60)}"`);
  } catch (e) {
    console.log(`  ✗ ${etiqueta} — no se pudo conectar: ${e.message}\n`);
    fallas++;
  }
}

console.log("");
if (fallas) {
  console.log("  Qué mirar según el error:");
  console.log("  · \"API ... apagada\" / 403 -> la key pertenece a un proyecto de Google sin la Generative");
  console.log("                                Language API habilitada. Seguí el link del mensaje y tocá");
  console.log("                                Habilitar, o creá otra key eligiendo un proyecto NUEVO.");
  console.log("  · \"key ... no es válida\"  -> creá otra en https://aistudio.google.com/apikey y reiniciá.");
  console.log("  · \"cuota\" / 429           -> esperá un minuto: el plan gratuito limita por minuto y por día.");
  console.log("  · \"no está disponible\"    -> cambiá GEMINI_MODEL / GEMINI_MODEL_VOICE / GEMINI_MODEL_EVAL");
  console.log("                                por un modelo de la lista de AI Studio y reiniciá.\n");
} else {
  console.log("  Todo en orden: la app puede hablar con la IA.\n");
}
terminar(fallas ? 1 : 0);

function terminar(codigo) {
  try { proc.kill(); } catch (_) {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(codigo);
}
