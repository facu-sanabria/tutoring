// Tutoring: servidor mínimo (Node 18+, sin dependencias).
// - Sirve la app de /public
// - Reenvía las consultas al proveedor de IA (Gemini o Claude). La key vive en .env y nunca llega al navegador.
// - Guarda la configuración de la empresa y los informes en /data
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

// ---------- .env ----------
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const raw0 = fs.readFileSync(envPath, "utf8").replace(/^﻿/, "");
  for (const raw of raw0.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

// Proveedor de IA: "gemini" (tiene plan gratuito) o "anthropic" (Claude, pago por uso).
const PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase() === "anthropic" ? "anthropic" : "gemini";
const trimUrl = u => String(u).replace(/\/+$/, "");
const PROVIDERS = {
  anthropic: {
    name: "Claude",
    keyVar: "ANTHROPIC_API_KEY",
    key: process.env.ANTHROPIC_API_KEY || "",
    baseUrl: trimUrl(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1"),
    models: {
      chat: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      eval: process.env.ANTHROPIC_MODEL_EVAL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      voice: process.env.ANTHROPIC_MODEL_VOICE || "claude-haiku-4-5-20251001"
    }
  },
  gemini: {
    name: "Gemini",
    keyVar: "GEMINI_API_KEY",
    key: process.env.GEMINI_API_KEY || "",
    baseUrl: trimUrl(process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai"),
    models: {
      chat: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      eval: process.env.GEMINI_MODEL_EVAL || process.env.GEMINI_MODEL || "gemini-3.8-flash",
      voice: process.env.GEMINI_MODEL_VOICE || "gemini-3.1-flash-lite"
    }
  }
};
const AI = PROVIDERS[PROVIDER];
const API_KEY = AI.key;
const MODELS = AI.models;
const VOICE = {
  provider: (process.env.VOICE_PROVIDER || "browser").toLowerCase() === "vapi" ? "vapi" : "browser",
  vapiPublicKey: process.env.VAPI_PUBLIC_KEY || "",
  vapiAssistantId: process.env.VAPI_ASSISTANT_ID || ""
};
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve(__dirname, "public");
const DATA = path.resolve(__dirname, "data");
const REPORTS = path.join(DATA, "informes");
fs.mkdirSync(REPORTS, { recursive: true });

// Límites de tamaño (el contexto de la empresa puede traer archivos del repo).
const LIMITS = { empresa: 8_000_000, informe: 4_000_000, mensajes: 4_000_000, maxTokens: 8192, mensajesCant: 80, caracteresPorMensaje: 400_000 };

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

// ---------- helpers ----------
// Lee el cuerpo con tope de tamaño. Si se pasa, sigue descartando lo que llega para poder
// contestarle 413 al cliente (si cortamos el socket, el navegador solo ve "conexión perdida").
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, done = false, over = false; let chunks = [];
    const fin = fn => (...a) => { if (!done) { done = true; fn(...a); } };
    const bad = fin(reject), ok = fin(resolve);
    const tooLarge = () => bad(Object.assign(new Error("too_large"), { code: "too_large" }));
    req.on("data", c => {
      size += c.length;
      if (size > limit) {
        over = true; chunks = [];
        if (size > limit * 8) { tooLarge(); req.destroy(); }   // freno duro: alguien está abusando
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => (over ? tooLarge() : ok(Buffer.concat(chunks).toString("utf8"))));
    req.on("aborted", () => bad(Object.assign(new Error("aborted"), { code: "aborted" })));
    req.on("error", bad);
  });
}
function json(res, status, obj) {
  if (res.headersSent || res.writableEnded) { try { res.end(); } catch (_) {} return; }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, message, type) => json(res, status, { error: type ? { type, message } : { message } });
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const safeId = id => /^[a-z0-9][a-z0-9-]{5,63}$/i.test(id);
const isObj = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Lee el cuerpo como objeto JSON. Devuelve null y ya respondió el error si algo falla.
async function bodyObject(req, res, limit, queHacia) {
  let raw;
  try { raw = await readBody(req, limit); }
  catch (e) {
    if (e.code === "too_large") fail(res, 413, `El contenido es demasiado grande (máximo ${Math.round(limit / 1e6)} MB). ${queHacia}`.trim());
    return null;
  }
  let obj;
  try { obj = JSON.parse(raw); } catch (_) { fail(res, 400, "El pedido no es JSON válido."); return null; }
  if (!isObj(obj)) { fail(res, 400, "El pedido tiene que ser un objeto JSON."); return null; }
  return obj;
}

// El historial que recibe el modelo tiene que alternar user/assistant y empezar en user.
// El front ya lo normaliza, pero lo repetimos acá: un historial mal armado es un 400 del proveedor.
function sanitizeMessages(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const m of list) {
    if (!isObj(m)) continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    let content = typeof m.content === "string" ? m.content
      : Array.isArray(m.content) ? m.content.map(p => (p && typeof p.text === "string" ? p.text : "")).join("") : "";
    content = content.slice(0, LIMITS.caracteresPorMensaje).trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out.slice(-LIMITS.mensajesCant);
}

// Solo dejamos pasar los campos que usa la app: el navegador no elige el modelo ni el proveedor.
function sanitizePayload(payload) {
  const msgs = sanitizeMessages(payload.messages);
  const out = { messages: msgs, stream: true };
  if (typeof payload.system === "string" && payload.system.trim()) out.system = payload.system.slice(0, 600_000);
  const mt = Number(payload.max_tokens);
  out.max_tokens = Number.isFinite(mt) ? Math.min(LIMITS.maxTokens, Math.max(64, Math.round(mt))) : 1024;
  const temp = Number(payload.temperature);
  if (Number.isFinite(temp)) out.temperature = Math.min(2, Math.max(0, temp));
  return out;
}

// ---------- rutas ----------
async function handleApi(req, res, url) {
  // Configuración pública (nunca incluye la API key)
  if (url.pathname === "/api/config") {
    if (req.method !== "GET") return fail(res, 405, "Método no permitido");
    return json(res, 200, { hasKey: Boolean(API_KEY), provider: PROVIDER, providerName: AI.name, keyVar: AI.keyVar, models: MODELS, voice: VOICE });
  }

  // Proxy al proveedor de IA
  if (url.pathname === "/api/messages") {
    if (req.method !== "POST") return fail(res, 405, "Método no permitido");
    if (!API_KEY) return fail(res, 500, `Falta ${AI.keyVar} en el archivo .env`, "missing_key");
    const body = await bodyObject(req, res, LIMITS.mensajes, "Quitá algún archivo del contexto de la empresa.");
    if (!body) return;
    const purpose = MODELS[body.purpose] ? body.purpose : "chat";
    const payload = sanitizePayload(body);
    if (!payload.messages.length) return fail(res, 400, "El pedido no trae ningún mensaje para responder.");
    payload.model = MODELS[purpose];

    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    if (PROVIDER === "gemini") return proxyGemini(payload, res, controller);
    return proxyAnthropic(payload, res, controller);
  }

  // Configuración de la empresa (la carga el senior)
  if (url.pathname === "/api/empresa") {
    const file = path.join(DATA, "empresa.json");
    if (req.method === "GET") {
      const data = readJSON(file, null);
      return data ? json(res, 200, data) : fail(res, 404, "Sin configuración guardada");
    }
    if (req.method === "PUT") {
      const cfg = await bodyObject(req, res, LIMITS.empresa, "Subí archivos más chicos.");
      if (!cfg) return;
      if (typeof cfg.empresa !== "string" || !cfg.empresa.trim()) return fail(res, 400, "Falta el nombre de la empresa.");
      for (const k of ["escenarios", "criterios", "archivos"]) {
        if (k in cfg && !Array.isArray(cfg[k])) return fail(res, 400, `El campo "${k}" tiene que ser una lista.`);
      }
      try { writeJSON(file, cfg); } catch (_) { return fail(res, 500, "No se pudo escribir data/empresa.json en el disco."); }
      return json(res, 200, { ok: true });
    }
    return fail(res, 405, "Método no permitido");
  }

  // Informes de simulaciones
  if (url.pathname === "/api/informes") {
    if (req.method === "GET") {
      let files = [];
      try { files = fs.readdirSync(REPORTS).filter(f => f.endsWith(".json")); } catch (_) {}
      const list = files.map(f => {
        const r = readJSON(path.join(REPORTS, f), null);
        return isObj(r) && r.id ? { id: r.id, candidato: r.candidato, escenario: r.escenario && r.escenario.titulo, fecha: r.fecha, puntaje: r.puntaje } : null;
      }).filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      return json(res, 200, list);
    }
    if (req.method === "POST") {
      const r = await bodyObject(req, res, LIMITS.informe, "");
      if (!r) return;
      if (typeof r.candidato !== "string" || !r.candidato.trim()) return fail(res, 400, "El informe no tiene candidato.");
      if (!isObj(r.evaluacion)) return fail(res, 400, "El informe no trae la evaluación.");
      r.id = crypto.randomUUID();
      if (!r.fecha) r.fecha = new Date().toISOString();
      try { writeJSON(path.join(REPORTS, r.id + ".json"), r); }
      catch (_) { return fail(res, 500, "No se pudo escribir el informe en data/informes."); }
      return json(res, 200, { id: r.id });
    }
    return fail(res, 405, "Método no permitido");
  }
  const m = url.pathname.match(/^\/api\/informes\/([^/]+)$/);
  if (m) {
    if (!safeId(m[1])) return fail(res, 400, "Identificador de informe inválido");
    const file = path.join(REPORTS, m[1] + ".json");
    if (req.method === "GET") { const r = readJSON(file, null); return isObj(r) ? json(res, 200, r) : fail(res, 404, "El informe no existe"); }
    if (req.method === "DELETE") {
      try { fs.unlinkSync(file); } catch (e) { if (e.code !== "ENOENT") return fail(res, 500, "No se pudo eliminar el informe"); }
      return json(res, 200, { ok: true });
    }
    return fail(res, 405, "Método no permitido");
  }

  return fail(res, 404, "Ruta no encontrada");
}

// ---------- Claude (Anthropic) ----------
async function proxyAnthropic(payload, res, controller) {
  try {
    const upstream = await fetch(AI.baseUrl + "/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload)
    });
    if (!upstream.ok) {
      let raw = "", msg = "";
      try { raw = await upstream.text(); } catch (_) {}
      try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || ""; } catch (_) { msg = raw.slice(0, 300); }
      return fail(res, upstream.status, msg || "Error de la API de Claude");
    }
    res.writeHead(200, { "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).on("error", () => { try { res.end(); } catch (_) {} }).pipe(res);
  } catch (e) {
    if (controller.signal.aborted) { try { res.end(); } catch (_) {} return; }
    fail(res, 502, "No se pudo conectar con la API de Claude. Revisá tu conexión a internet.");
  }
}

// ---------- Gemini ----------
// Usa el endpoint compatible con OpenAI de Gemini y traduce el streaming al formato
// de eventos de Claude, así el front funciona igual con cualquiera de los dos.
async function proxyGemini(payload, res, controller) {
  const messages = [];
  if (payload.system) messages.push({ role: "system", content: payload.system });
  payload.messages.forEach(m => messages.push({ role: m.role, content: m.content }));
  const body = { model: payload.model, messages, max_tokens: payload.max_tokens, stream: true };
  if (payload.temperature != null) body.temperature = payload.temperature;

  let upstream;
  try {
    upstream = await fetch(AI.baseUrl + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + API_KEY },
      body: JSON.stringify(body)
    });
  } catch (e) {
    if (controller.signal.aborted) { try { res.end(); } catch (_) {} return; }
    return fail(res, 502, "No se pudo conectar con la API de Gemini. Revisá tu conexión a internet.");
  }

  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch (_) {}
    try {
      const j = JSON.parse(raw);
      const e = Array.isArray(j) ? j[0] && j[0].error : j.error;
      msg = (e && e.message) || "";
    } catch (_) { msg = raw.replace(/\s+/g, " ").slice(0, 300); }
    return fail(res, geminiStatus(upstream.status, msg), geminiMessage(upstream.status, msg));
  }

  // Si Gemini contesta con JSON en vez de SSE (pasa con algunos errores y con stream desactivado),
  // igual le entregamos al front un texto completo.
  const ctype = (upstream.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("event-stream")) {
    let text = "";
    try {
      const j = JSON.parse(await upstream.text());
      if (j.error) return fail(res, geminiStatus(200, j.error.message || ""), geminiMessage(200, j.error.message || ""));
      const ch = j.choices && j.choices[0];
      text = (ch && ch.message && (typeof ch.message.content === "string" ? ch.message.content
        : Array.isArray(ch.message.content) ? ch.message.content.map(p => p && p.text || "").join("") : "")) || "";
    } catch (_) { return fail(res, 502, "Gemini respondió en un formato que no se pudo interpretar."); }
    openStream(res);
    if (text) sendEvent(res, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
    closeStream(res, !text);
    return;
  }

  openStream(res);
  const decoder = new TextDecoder();
  let buffer = "", emitted = 0, finish = "";
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith(":") || !t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") { buffer = ""; break; }
        let j; try { j = JSON.parse(data); } catch (_) { continue; }
        if (j.error) {
          sendEvent(res, { type: "error", error: { type: "api_error", message: geminiMessage(200, j.error.message || "") } });
          continue;
        }
        const ch = j.choices && j.choices[0];
        if (!ch) continue;
        if (ch.finish_reason) finish = String(ch.finish_reason);
        const d = ch.delta || {};
        const text = typeof d.content === "string" ? d.content
          : Array.isArray(d.content) ? d.content.map(p => (p && typeof p.text === "string" ? p.text : "")).join("") : "";
        if (text) { emitted += text.length; sendEvent(res, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }); }
      }
    }
  } catch (e) {
    // Si el cliente cortó (colgar, cambiar de pantalla) no hay a quién avisarle.
    if (!controller.signal.aborted && !res.writableEnded) {
      sendEvent(res, { type: "error", error: { type: "api_error", message: "Se cortó la respuesta de Gemini a mitad de camino." } });
    }
  }
  if (!emitted && /content_filter|safety|blocked/i.test(finish)) {
    sendEvent(res, { type: "error", error: { type: "api_error", message: "Gemini bloqueó la respuesta por sus filtros de contenido. Probá reformular el escenario." } });
  }
  closeStream(res, false);
}

function sendEvent(res, obj) {
  if (res.writableEnded) return;
  try { res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
}
function openStream(res) {
  if (res.headersSent) return;
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
  sendEvent(res, { type: "message_start", message: { role: "assistant", content: [] } });
  sendEvent(res, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
}
function closeStream(res, vacio) {
  if (vacio) sendEvent(res, { type: "error", error: { type: "api_error", message: "Gemini devolvió una respuesta vacía. Probá de nuevo." } });
  sendEvent(res, { type: "content_block_stop", index: 0 });
  sendEvent(res, { type: "message_stop" });
  try { res.end(); } catch (_) {}
}
// Traduce el error de Gemini a un código HTTP que el front sepa explicar.
function geminiStatus(status, msg) {
  if (/api key not valid|api_key_invalid|invalid api key|unauthenticated|permission_denied.*api key/i.test(msg)) return 401;
  if (status === 429 || /quota|rate limit|resource.?exhausted|too many requests/i.test(msg)) return 429;
  if (/not found|is not supported|unknown model|does not exist/i.test(msg)) return 404;
  if (status === 200) return 502;
  return status;
}
function geminiMessage(status, msg) {
  const code = geminiStatus(status, msg);
  const detalle = msg ? ` (${msg.replace(/\s+/g, " ").slice(0, 200)})` : "";
  if (code === 401) return `La GEMINI_API_KEY del .env no es válida. Creá otra en https://aistudio.google.com/apikey y reiniciá el servidor.${detalle}`;
  if (code === 429) return `Se agotó la cuota gratuita de Gemini por ahora. Esperá un minuto y probá de nuevo.${detalle}`;
  if (code === 404) return `El modelo "${MODELS.chat}" (o el de voz/evaluación) no está disponible para tu key. Cambiá GEMINI_MODEL en el .env por uno de la lista de AI Studio.${detalle}`;
  return (msg || "Error de la API de Gemini").slice(0, 300);
}

// ---------- estáticos ----------
function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end("Ruta inválida"); }
  if (rel.includes("\0")) { res.writeHead(400); return res.end("Ruta inválida"); }
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.resolve(PUBLIC, "." + rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Prohibido"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": data.length,
      "cache-control": "no-cache"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, "http://localhost"); }
  catch (_) { res.writeHead(400); return res.end("Pedido inválido"); }
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(e => {
      console.error("  Error en", url.pathname + ":", (e && e.message) || e);
      fail(res, 500, "Error interno del servidor. Mirá la consola donde corre npm start.");
    });
    return;
  }
  try { serveStatic(req, res, url); }
  catch (e) { try { res.writeHead(500); res.end(); } catch (_) {} }
});

// Que un error suelto no baje el servidor en medio de una demo.
process.on("uncaughtException", e => console.error("  Error inesperado (el servidor sigue andando):", (e && e.stack) || e));
process.on("unhandledRejection", e => console.error("  Promesa rechazada (el servidor sigue andando):", (e && e.stack) || e));

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  El puerto ${PORT} ya está ocupado.`);
    console.error(`  Puede ser otra copia de Tutoring abierta: cerrala (Ctrl+C) o levantá esta en otro puerto:`);
    console.error(`      PORT=3100 npm start        (en PowerShell: $env:PORT=3100; npm start)\n`);
  } else {
    console.error("\n  No se pudo iniciar el servidor:", e.message, "\n");
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Tutoring corriendo en  http://localhost:${PORT}\n`);
  console.log(`  IA: ${AI.name} (LLM_PROVIDER=${PROVIDER})`);
  if (!API_KEY) console.log(`  Atención: falta ${AI.keyVar} en el archivo .env`);
  console.log(`  Modelos: chat=${MODELS.chat} · voz=${MODELS.voice} · evaluación=${MODELS.eval}`);
  console.log(`  Voz: ${VOICE.provider}\n`);
});
