// Tutoring: servidor mínimo (Node 18+, sin dependencias).
// - Sirve la app de /public
// - Reenvía las consultas a la API de Claude (la key vive en .env y nunca llega al navegador)
// - Guarda la configuración de la empresa y los informes en /data
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

// ---------- .env ----------
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
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
const PROVIDERS = {
  anthropic: {
    name: "Claude",
    keyVar: "ANTHROPIC_API_KEY",
    key: process.env.ANTHROPIC_API_KEY || "",
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
    baseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""),
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
  provider: (process.env.VOICE_PROVIDER || "browser").toLowerCase(),
  vapiPublicKey: process.env.VAPI_PUBLIC_KEY || "",
  vapiAssistantId: process.env.VAPI_ASSISTANT_ID || ""
};
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATA = path.join(__dirname, "data");
const REPORTS = path.join(DATA, "informes");
fs.mkdirSync(REPORTS, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

// ---------- helpers ----------
function readBody(req, limit = 5_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function json(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const safeId = id => /^[a-z0-9-]{6,64}$/i.test(id);

// ---------- rutas ----------
async function handleApi(req, res, url) {
  // Configuración pública (nunca incluye la API key)
  if (req.method === "GET" && url.pathname === "/api/config") {
    return json(res, 200, { hasKey: Boolean(API_KEY), provider: PROVIDER, providerName: AI.name, keyVar: AI.keyVar, models: MODELS, voice: VOICE });
  }

  // Proxy a Claude
  if (req.method === "POST" && url.pathname === "/api/messages") {
    if (!API_KEY) return json(res, 500, { error: { type: "missing_key", message: `Falta ${AI.keyVar} en el archivo .env` } });
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: { message: "Pedido inválido" } }); }
    const purpose = MODELS[payload.purpose] ? payload.purpose : "chat";
    delete payload.purpose;
    payload.model = MODELS[purpose];

    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    if (PROVIDER === "gemini") return proxyGemini(payload, res, controller);
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(payload)
      });
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-cache" });
      if (upstream.body) Readable.fromWeb(upstream.body).on("error", () => res.end()).pipe(res);
      else res.end();
    } catch {
      if (!res.headersSent) json(res, 502, { error: { message: "No se pudo conectar con la API de Claude" } });
      else res.end();
    }
    return;
  }

  // Configuración de la empresa (la carga el senior)
  if (url.pathname === "/api/empresa") {
    const file = path.join(DATA, "empresa.json");
    if (req.method === "GET") {
      const data = readJSON(file, null);
      return data ? json(res, 200, data) : json(res, 404, { error: { message: "Sin configuración guardada" } });
    }
    if (req.method === "PUT") {
      try { writeJSON(file, JSON.parse(await readBody(req))); return json(res, 200, { ok: true }); }
      catch { return json(res, 400, { error: { message: "No se pudo guardar" } }); }
    }
  }

  // Informes de simulaciones
  if (url.pathname === "/api/informes") {
    if (req.method === "GET") {
      const list = fs.readdirSync(REPORTS).filter(f => f.endsWith(".json")).map(f => {
        const r = readJSON(path.join(REPORTS, f), null);
        return r && { id: r.id, candidato: r.candidato, escenario: r.escenario && r.escenario.titulo, fecha: r.fecha, puntaje: r.puntaje };
      }).filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      return json(res, 200, list);
    }
    if (req.method === "POST") {
      try {
        const r = JSON.parse(await readBody(req));
        r.id = crypto.randomUUID();
        writeJSON(path.join(REPORTS, r.id + ".json"), r);
        return json(res, 200, { id: r.id });
      } catch { return json(res, 400, { error: { message: "No se pudo guardar el informe" } }); }
    }
  }
  const m = url.pathname.match(/^\/api\/informes\/([^/]+)$/);
  if (m && safeId(m[1])) {
    const file = path.join(REPORTS, m[1] + ".json");
    if (req.method === "GET") { const r = readJSON(file, null); return r ? json(res, 200, r) : json(res, 404, { error: { message: "No existe" } }); }
    if (req.method === "DELETE") { try { fs.unlinkSync(file); } catch {} return json(res, 200, { ok: true }); }
  }

  json(res, 404, { error: { message: "Ruta no encontrada" } });
}

// ---------- Gemini ----------
// Usa el endpoint compatible con OpenAI de Gemini y traduce el streaming al formato
// de eventos de Claude, así el front funciona igual con cualquiera de los dos.
async function proxyGemini(payload, res, controller) {
  const messages = [];
  if (payload.system) messages.push({ role: "system", content: payload.system });
  (payload.messages || []).forEach(m => messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  let upstream;
  try {
    upstream = await fetch(AI.baseUrl + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + API_KEY },
      body: JSON.stringify({ model: payload.model, messages, max_tokens: payload.max_tokens || 1024, stream: true })
    });
  } catch {
    return res.headersSent ? res.end() : json(res, 502, { error: { message: "No se pudo conectar con la API de Gemini" } });
  }

  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch {}
    try { const j = JSON.parse(raw); const e = Array.isArray(j) ? j[0] && j[0].error : j.error; msg = (e && e.message) || ""; } catch { msg = raw.slice(0, 300); }
    let status = upstream.status;
    if (/api key not valid|api_key_invalid|invalid api key/i.test(msg)) status = 401;
    else if (/not found|is not supported|unknown model/i.test(msg) && status === 400) status = 404;
    else if (status === 429 || /quota|rate limit|resource.?exhausted/i.test(msg)) status = 429;
    return json(res, status, { error: { message: msg || "Error de la API de Gemini" } });
  }

  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
  const send = obj => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`);
  send({ type: "message_start" });
  send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) { send({ type: "error", error: { type: "api_error", message: j.error.message || "Error de Gemini" } }); continue; }
        const text = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (text) send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
      }
    }
    send({ type: "content_block_stop", index: 0 });
    send({ type: "message_stop" });
  } catch {
    // el cliente cortó o se cayó la conexión
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url).catch(() => json(res, 500, { error: { message: "Error interno" } }));
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Tutoring corriendo en  http://localhost:${PORT}\n`);
  console.log(`  IA: ${AI.name} (LLM_PROVIDER=${PROVIDER})`);
  if (!API_KEY) console.log(`  Atención: falta ${AI.keyVar} en el archivo .env\n`);
  console.log(`  Modelos: chat=${MODELS.chat} · voz=${MODELS.voice} · evaluación=${MODELS.eval}`);
  console.log(`  Voz: ${VOICE.provider}\n`);
});
