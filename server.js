// Tutoring: servidor mínimo (Node 18+).
// - Sirve la app de /public
// - Reenvía las consultas al proveedor de IA (Claude vía Agent SDK, Gemini o Claude API).
//   Las keys viven en .env y nunca llegan al navegador.
// - Si el proveedor principal falla antes de empezar a responder, reintenta y pasa al de respaldo.
// - Guarda la configuración de la empresa y los informes en /data
// Única dependencia: @anthropic-ai/claude-agent-sdk (solo para LLM_PROVIDER=claude-sdk).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const core = require("./public/js/core.js");   // misma lógica que el navegador (migración de la configuración)

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
const env = k => String(process.env[k] || "").trim();
const envNum = (k, def) => { const n = Number(env(k)); return Number.isFinite(n) && n > 0 ? n : def; };

// ---------- Proveedores de IA ----------
// claude-sdk = Claude con tu suscripción (Claude Code con sesión iniciada en esta compu). Sin API key.
// gemini     = Gemini de Google (tiene plan gratuito).
// anthropic  = Claude por API (pago por uso).
const IDS = ["claude-sdk", "gemini", "anthropic"];
function normProv(v, def) {
  let s = String(v || "").trim().toLowerCase();
  if (s === "claude" || s === "sdk" || s === "claude_sdk") s = "claude-sdk";
  return IDS.includes(s) ? s : def;
}
const PRIMARY = normProv(env("LLM_PROVIDER"), "claude-sdk");
const FALLBACK = (() => {
  const f = normProv(env("LLM_FALLBACK"), "");
  return f && f !== PRIMARY ? f : "";
})();
const trimUrl = u => String(u).replace(/\/+$/, "");

const PROVIDERS = {
  "claude-sdk": {
    id: "claude-sdk",
    name: "Claude",
    detalle: "Claude (tu suscripción)",
    keyVar: "",
    models: {
      chat: env("CLAUDE_SDK_MODEL") || "sonnet",
      eval: env("CLAUDE_SDK_MODEL_EVAL") || env("CLAUDE_SDK_MODEL") || "sonnet",
      voice: env("CLAUDE_SDK_MODEL_VOICE") || "haiku"
    }
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    detalle: "Gemini",
    keyVar: "GEMINI_API_KEY",
    key: env("GEMINI_API_KEY"),
    baseUrl: trimUrl(env("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai"),
    // Gemini 3 razona antes de responder y ese razonamiento cuenta dentro de max_tokens:
    // pedimos poco razonamiento y le sumamos margen al límite para que no llegue vacío o cortado.
    reasoning: env("GEMINI_REASONING") || "low",
    extraTokens: envNum("GEMINI_THINKING_EXTRA", 4096),
    models: {
      chat: env("GEMINI_MODEL") || "gemini-3.8-flash",
      eval: env("GEMINI_MODEL_EVAL") || env("GEMINI_MODEL") || "gemini-3.8-flash",
      voice: env("GEMINI_MODEL_VOICE") || "gemini-3.1-flash-lite"
    }
  },
  anthropic: {
    id: "anthropic",
    name: "Claude API",
    detalle: "Claude (API)",
    keyVar: "ANTHROPIC_API_KEY",
    key: env("ANTHROPIC_API_KEY"),
    baseUrl: trimUrl(env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com/v1"),
    models: {
      chat: env("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      eval: env("ANTHROPIC_MODEL_EVAL") || env("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      voice: env("ANTHROPIC_MODEL_VOICE") || "claude-haiku-4-5-20251001"
    }
  }
};
const CADENA = [PRIMARY, FALLBACK].filter(Boolean);

// Robustez
const T_PRIMER_TOKEN = envNum("LLM_TIMEOUT_MS", 45000);   // si no empieza a responder en este tiempo, se corta
const T_SILENCIO_STREAM = 60000;                          // si deja de mandar texto a mitad de camino
const MAX_REINTENTOS = 2;
const REINTENTABLES = new Set([429, 500, 502, 503, 529]);

const VOICE = {
  provider: env("VOICE_PROVIDER").toLowerCase() === "vapi" ? "vapi" : "browser",
  vapiPublicKey: env("VAPI_PUBLIC_KEY"),
  vapiAssistantId: env("VAPI_ASSISTANT_ID")
};
const PORT_ENV = env("PORT");
// PORT=0 le pide al sistema un puerto libre (lo usan las pruebas).
const PORT = /^[0-9]+$/.test(PORT_ENV) ? Number(PORT_ENV) : 3000;
const PUBLIC = path.resolve(__dirname, "public");
// DATA_DIR se usa en las pruebas para no pisar los datos reales. Normalmente no hace falta tocarlo.
const DATA = path.resolve(__dirname, env("DATA_DIR") || "data");
const REPORTS = path.join(DATA, "informes");
fs.mkdirSync(REPORTS, { recursive: true });

// Límites de tamaño (el contexto de la empresa puede traer documentos).
const LIMITS = { empresa: 8_000_000, informe: 4_000_000, mensajes: 4_000_000, maxTokens: 8192, mensajesCant: 80, caracteresPorMensaje: 400_000 };

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
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
const dormir = (ms, signal) => new Promise(r => {
  const t = setTimeout(r, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
});

// Nunca imprimimos ni devolvemos una key, aunque venga dentro de un mensaje de error.
const SECRETOS = [PROVIDERS.gemini.key, PROVIDERS.anthropic.key].filter(s => s && s.length > 8);
const sinSecretos = s => SECRETOS.reduce((t, k) => t.split(k).join("***"), String(s == null ? "" : s));

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
  const out = { messages: msgs };
  if (typeof payload.system === "string" && payload.system.trim()) out.system = payload.system.slice(0, 600_000);
  const mt = Number(payload.max_tokens);
  out.max_tokens = Number.isFinite(mt) ? Math.min(LIMITS.maxTokens, Math.max(16, Math.round(mt))) : 1024;
  const temp = Number(payload.temperature);
  if (Number.isFinite(temp)) out.temperature = Math.min(1, Math.max(0, temp));
  return out;
}

// ---------- Errores de proveedor ----------
// status: código HTTP equivalente. code: tipo de problema para decidir reintento y respaldo.
function provError(status, message, code) {
  return Object.assign(new Error(sinSecretos(message)), { status, code: code || "" });
}
const esReintentable = e => e && e.code !== "limite_plan" && e.code !== "timeout" && e.code !== "filtro"
  && (REINTENTABLES.has(e.status) || e.code === "network" || e.code === "empty");
// Al respaldo pasamos por límite, sesión, saturación, red, modelo o timeout; no si el pedido es inválido.
const pasaAlRespaldo = e => e && e.status !== 400 && e.status !== 413 && e.code !== "filtro";

// ---------- Registro en la terminal ----------
function logIA(o) {
  const partes = [`[IA] ${o.proveedor}`, o.modelo, o.purpose, `${(o.ms / 1000).toFixed(1)}s`];
  if (o.ok) partes.push("ok");
  if (o.tokens && (o.tokens.in != null || o.tokens.out != null)) partes.push(`tokens in=${o.tokens.in ?? "?"} out=${o.tokens.out ?? "?"}`);
  if (o.error) partes.push(`ERROR ${o.error.status || ""}${o.error.code ? " " + o.error.code : ""}: ${String(o.error.message).slice(0, 220)}`);
  if (o.nota) partes.push(o.nota);
  console.log("  " + sinSecretos(partes.join(" · ")));
}

// ---------- Streaming hacia el navegador ----------
// El front entiende el formato de eventos de la API de Claude; todos los proveedores lo emiten igual.
function sendEvent(res, obj) {
  if (res.writableEnded) return;
  try { res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
}
function crearSSE(res) {
  let abierto = false, ping = null;
  const sse = {
    open() {
      if (abierto || res.headersSent) return;
      abierto = true;
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      sendEvent(res, { type: "message_start", message: { role: "assistant", content: [] } });
      sendEvent(res, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      // Mantiene viva la conexión mientras el proveedor piensa.
      ping = setInterval(() => { if (!res.writableEnded) { try { res.write(": ping\n\n"); } catch (_) {} } }, 15000);
    },
    event: obj => sendEvent(res, obj),
    text: t => sendEvent(res, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }),
    error: e => sendEvent(res, { type: "error", error: { type: e.status === 529 ? "overloaded_error" : e.code || "api_error", status: e.status || 500, message: sinSecretos(e.message) } }),
    close() {
      clearInterval(ping);
      sendEvent(res, { type: "content_block_stop", index: 0 });
      sendEvent(res, { type: "message_stop" });
      try { res.end(); } catch (_) {}
    },
    end() { clearInterval(ping); try { res.end(); } catch (_) {} }
  };
  return sse;
}

// ---------- Claude Agent SDK (suscripción) ----------
// Lo usamos SOLO como modelo de texto: sin herramientas, sin MCP, sin ajustes del disco,
// un solo turno y en una carpeta vacía. No puede leer ni tocar archivos de la compu.
let sdkMod = null;
async function cargarSdk() {
  if (sdkMod) return sdkMod;
  try {
    // CLAUDE_SDK_MODULE permite reemplazar el SDK por uno simulado en las pruebas.
    const ruta = env("CLAUDE_SDK_MODULE");
    sdkMod = await import(ruta ? pathToFileURL(path.resolve(__dirname, ruta)).href : "@anthropic-ai/claude-agent-sdk");
    return sdkMod;
  } catch (e) {
    throw provError(500, "Falta instalar el SDK de Claude. En la carpeta del proyecto ejecutá: npm install", "sin_sdk");
  }
}
const SDK_CWD = path.join(os.tmpdir(), "tutoring-claude-sin-archivos");
const HERRAMIENTAS_BLOQUEADAS = ["Bash", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "LS", "WebFetch", "WebSearch",
  "NotebookEdit", "NotebookRead", "Task", "Agent", "Skill", "TodoWrite", "KillShell", "BashOutput"];
const MSG_SIN_SESION = "Instalá Claude Code e iniciá sesión con tu cuenta (ejecutá claude en la terminal).";

function envSdk(maxTokens) {
  const e = { ...process.env };
  // Si hubiera una API key o un endpoint en el entorno, el SDK los usaría en vez de tu suscripción.
  ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
    "GEMINI_API_KEY", "VAPI_PUBLIC_KEY"].forEach(k => delete e[k]);
  e.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  if (maxTokens) e.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(maxTokens);
  return e;
}
function opcionesSdk(extra) {
  try { fs.mkdirSync(SDK_CWD, { recursive: true }); } catch (_) {}
  return Object.assign({
    tools: [], allowedTools: [], disallowedTools: HERRAMIENTAS_BLOQUEADAS,
    canUseTool: async () => ({ behavior: "deny", message: "Este asistente no usa herramientas." }),
    permissionMode: "dontAsk",
    mcpServers: {}, strictMcpConfig: true, settingSources: [], skills: [], plugins: [],
    maxTurns: 1, persistSession: false, cwd: SDK_CWD,
    thinking: { type: "disabled" }
  }, extra);
}

// El SDK recibe un solo texto: le armamos la conversación con los turnos marcados.
function promptDesdeHistorial(messages) {
  if (messages.length === 1) return messages[0].content;
  const previos = messages.slice(0, -1).map(m =>
    `<turno de="${m.role === "user" ? "usuario" : "vos (asistente)"}">\n${m.content}\n</turno>`).join("\n\n");
  const ultimo = messages[messages.length - 1];
  return `Esta es la conversación hasta ahora (lo que dijiste vos está marcado como "vos (asistente)"):\n\n${previos}\n\n`
    + `Nuevo mensaje del usuario:\n<turno de="usuario">\n${ultimo.content}\n</turno>\n\n`
    + `Respondé a ese último mensaje siguiendo tus instrucciones. Escribí solo tu respuesta, sin etiquetas de turno.`;
}

function errorSdk(tipo, texto, model) {
  switch (tipo) {
    case "authentication_failed": case "oauth_org_not_allowed":
      return provError(401, "Tu sesión de Claude no es válida o venció. " + MSG_SIN_SESION, "sesion");
    case "rate_limit": return provError(429, "Llegaste al límite de uso de tu plan de Claude. Esperá a que se renueve o usá el proveedor de respaldo.", "limite_plan");
    case "overloaded": return provError(529, "Claude está saturado en este momento.", "saturado");
    case "billing_error": case "account_on_hold": return provError(402, "Tu cuenta de Claude tiene un problema de facturación o está suspendida.", "cuenta");
    case "model_not_found": return provError(404, `El modelo "${model}" no está disponible para tu cuenta. Cambiá CLAUDE_SDK_MODEL en el .env (por ejemplo: sonnet o haiku).`, "modelo");
    case "invalid_request": return provError(400, "Claude rechazó el pedido: " + (texto || "sin detalle"), "pedido");
    case "server_error": return provError(500, "Claude tuvo un error interno.", "servidor");
    default: return provError(500, "Claude devolvió un error: " + (texto || tipo || "desconocido"), tipo || "desconocido");
  }
}
function limitePlanError(info) {
  let cuando = "";
  if (info && info.resetsAt) {
    const d = new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1));
    if (!isNaN(d)) cuando = ` Se renueva ${d.toLocaleString("es-AR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.`;
  }
  return provError(429, "Llegaste al límite de uso de tu plan de Claude." + cuando, "limite_plan");
}
const textoDe = m => ((m && m.message && m.message.content) || []).filter(b => b && b.type === "text").map(b => b.text).join("");

async function runClaudeSdk(p, ctx) {
  const sdk = await cargarSdk();
  const ac = new AbortController();
  const cortar = () => ac.abort();
  if (ctx.signal.aborted) ac.abort(); else ctx.signal.addEventListener("abort", cortar, { once: true });
  try {
    const q = sdk.query({
      prompt: promptDesdeHistorial(p.messages),
      options: opcionesSdk({
        systemPrompt: p.system || "Sos un asistente útil. Respondés en español rioplatense.",
        model: p.model, includePartialMessages: true, abortController: ac, env: envSdk(p.max_tokens),
        stderr: d => { if (/error/i.test(d)) ctx.log && ctx.log(String(d).trim().slice(0, 200)); }
      })
    });
    // Al abortar, el SDK tarda varios segundos en cerrar su proceso: no lo esperamos.
    const abortado = new Promise((_, rej) => {
      const f = () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (ac.signal.aborted) f(); else ac.signal.addEventListener("abort", f, { once: true });
    });
    const recorrido = recorrerSdk(q, p, ctx);
    recorrido.catch(() => {});
    abortado.catch(() => {});
    await Promise.race([recorrido, abortado]);
  } catch (e) {
    if (ctx.signal.aborted || e.status) throw e;
    const msg = String((e && e.message) || e);
    if (/ENOENT|spawn|executable/i.test(msg)) throw provError(500, "No se pudo iniciar Claude Code: " + msg.slice(0, 160), "sdk");
    if (/log ?in|auth|credential/i.test(msg)) throw provError(401, MSG_SIN_SESION, "sesion");
    throw provError(502, "Se cortó la comunicación con Claude: " + msg.slice(0, 160), "network");
  } finally {
    ctx.signal.removeEventListener("abort", cortar);
  }
}

// Traduce los mensajes del SDK a texto para el navegador.
async function recorrerSdk(q, p, ctx) {
  let emitio = false;
  const marcar = () => { emitio = true; };
  {
    for await (const m of q) {
      if (ctx.signal.aborted) return;
      if (m.type === "stream_event") {
        const ev = m.event;
        if (ev && ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta" && ev.delta.text) {
          marcar(); ctx.onText(ev.delta.text);
        }
        continue;
      }
      if (m.type === "assistant") {
        if (m.error && !(m.error === "max_output_tokens" && emitio)) throw errorSdk(m.error, textoDe(m), p.model);
        if (!emitio) { const t = textoDe(m); if (t) { marcar(); ctx.onText(t); } }
        continue;
      }
      if (m.type === "rate_limit_event") {
        if (m.rate_limit_info && m.rate_limit_info.status === "rejected") throw limitePlanError(m.rate_limit_info);
        continue;
      }
      if (m.type === "auth_status" && m.error) throw provError(401, MSG_SIN_SESION, "sesion");
      if (m.type === "system" && m.subtype === "api_retry") { ctx.onRetry && ctx.onRetry(m.attempt, m.error); continue; }
      if (m.type === "result") {
        const u = m.usage || {};
        ctx.onUsage({ in: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), out: u.output_tokens });
        if ((m.is_error || m.subtype !== "success") && !emitio) {
          const txt = String(m.result || (m.errors && m.errors.join(" ")) || m.subtype || "");
          if (/log ?in|\/login|auth|credential|not logged/i.test(txt)) throw provError(401, MSG_SIN_SESION, "sesion");
          if (/usage limit|rate limit|limit reached/i.test(txt)) throw provError(429, "Llegaste al límite de uso de tu plan de Claude.", "limite_plan");
          throw provError(m.api_error_status || 500, "Claude no pudo responder: " + txt.slice(0, 200), "sdk");
        }
      }
    }
  }
}

// Estado de la sesión de Claude Code (se verifica al arrancar y cuando hace falta).
const SDK_STATE = { estado: "sin_verificar", plan: "", mensaje: "", cuando: 0, promesa: null };
function verificarSesionClaude() {
  if (SDK_STATE.promesa) return SDK_STATE.promesa;
  SDK_STATE.promesa = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    try {
      const sdk = await cargarSdk();
      async function* esperar() { await new Promise(r => ac.signal.addEventListener("abort", r, { once: true })); }
      const q = sdk.query({ prompt: esperar(), options: opcionesSdk({ systemPrompt: "x", abortController: ac, env: envSdk() }) });
      const info = await q.accountInfo();
      if (info && (info.subscriptionType || info.email || (info.tokenSource && info.tokenSource !== "none"))) {
        Object.assign(SDK_STATE, { estado: "ok", plan: info.subscriptionType || "", mensaje: "" });
      } else {
        Object.assign(SDK_STATE, { estado: "sin_sesion", plan: "", mensaje: MSG_SIN_SESION });
      }
    } catch (e) {
      const msg = (e && e.code === "sin_sdk") ? e.message : MSG_SIN_SESION;
      Object.assign(SDK_STATE, { estado: "sin_sesion", plan: "", mensaje: msg });
    } finally {
      clearTimeout(timer); ac.abort();
      SDK_STATE.cuando = Date.now();
      SDK_STATE.promesa = null;
    }
    return SDK_STATE;
  })();
  return SDK_STATE.promesa;
}

// ---------- Claude (API de Anthropic) ----------
async function runAnthropic(p, ctx) {
  const prov = PROVIDERS.anthropic;
  const body = { model: p.model, max_tokens: p.max_tokens, messages: p.messages, stream: true };
  if (p.system) body.system = p.system;
  if (p.temperature != null) body.temperature = p.temperature;
  let upstream;
  try {
    upstream = await fetch(prov.baseUrl + "/messages", {
      method: "POST", signal: ctx.signal,
      headers: { "content-type": "application/json", "x-api-key": prov.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body)
    });
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    throw provError(502, "No se pudo conectar con la API de Claude. Revisá tu conexión a internet.", "network");
  }
  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch (_) {}
    try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || ""; } catch (_) { msg = raw.slice(0, 300); }
    if (upstream.status === 401) throw provError(401, "La ANTHROPIC_API_KEY del .env no es válida.", "sesion");
    if (upstream.status === 404) throw provError(404, `El modelo "${p.model}" no existe o no está disponible. Revisá ANTHROPIC_MODEL en el .env.`, "modelo");
    throw provError(upstream.status, msg || "Error de la API de Claude", upstream.status === 529 ? "saturado" : "");
  }
  await leerSSE(upstream.body, ctx, j => {
    if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta" && j.delta.text) ctx.onText(j.delta.text);
    else if (j.type === "message_start" && j.message && j.message.usage) ctx.onUsage({ in: j.message.usage.input_tokens });
    else if (j.type === "message_delta" && j.usage) ctx.onUsage({ out: j.usage.output_tokens });
    else if (j.type === "error") {
      const tipo = j.error && j.error.type;
      throw provError(tipo === "overloaded_error" ? 529 : 500, (j.error && j.error.message) || "Error de la API de Claude", tipo === "overloaded_error" ? "saturado" : "");
    }
  }, "Claude");
}

// Lee un stream SSE línea por línea y le pasa cada JSON a `alRecibir`.
async function leerSSE(body, ctx, alRecibir, nombre) {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;
        let j; try { j = JSON.parse(data); } catch (_) { continue; }
        alRecibir(j);
      }
    }
  } catch (e) {
    if (ctx.signal.aborted || e.status) throw e;
    throw provError(502, `Se cortó la respuesta de ${nombre} a mitad de camino.`, "network");
  }
}

// ---------- Gemini ----------
// Usa el endpoint compatible con OpenAI de Gemini.
async function runGemini(p, ctx) {
  const prov = PROVIDERS.gemini;
  const messages = [];
  if (p.system) messages.push({ role: "system", content: p.system });
  p.messages.forEach(m => messages.push({ role: m.role, content: m.content }));
  const body = { model: p.model, messages, max_tokens: p.max_tokens + prov.extraTokens, stream: true };
  if (prov.reasoning && prov.reasoning !== "default") body.reasoning_effort = prov.reasoning;
  if (p.temperature != null) body.temperature = p.temperature;

  let upstream;
  try {
    upstream = await fetch(prov.baseUrl + "/chat/completions", {
      method: "POST", signal: ctx.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + prov.key },
      body: JSON.stringify(body)
    });
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    throw provError(502, "No se pudo conectar con la API de Gemini. Revisá tu conexión a internet.", "network");
  }

  if (!upstream.ok) {
    let raw = "", msg = "";
    try { raw = await upstream.text(); } catch (_) {}
    try {
      const j = JSON.parse(raw);
      const e = Array.isArray(j) ? j[0] && j[0].error : j.error;
      msg = (e && e.message) || "";
    } catch (_) { msg = raw.replace(/\s+/g, " ").slice(0, 300); }
    const st = geminiStatus(upstream.status, msg);
    throw provError(st, geminiMessage(upstream.status, msg, p.model), st === 401 || st === 403 ? "sesion" : "");
  }

  let emitido = 0, finish = "";
  // Si Gemini contesta con JSON en vez de SSE (pasa con algunos errores), igual rescatamos el texto.
  const ctype = (upstream.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("event-stream")) {
    let j;
    try { j = JSON.parse(await upstream.text()); } catch (_) { throw provError(502, "Gemini respondió en un formato que no se pudo interpretar.", "empty"); }
    if (j.error) throw provError(geminiStatus(200, j.error.message || ""), geminiMessage(200, j.error.message || "", p.model));
    const ch = j.choices && j.choices[0];
    finish = String((ch && ch.finish_reason) || "");
    const text = (ch && ch.message && (typeof ch.message.content === "string" ? ch.message.content
      : Array.isArray(ch.message.content) ? ch.message.content.map(x => x && x.text || "").join("") : "")) || "";
    if (j.usage) ctx.onUsage({ in: j.usage.prompt_tokens, out: j.usage.completion_tokens });
    if (text) { emitido += text.length; ctx.onText(text); }
  } else {
    await leerSSE(upstream.body, ctx, j => {
      if (j.error) throw provError(geminiStatus(200, j.error.message || ""), geminiMessage(200, j.error.message || "", p.model));
      if (j.usage) ctx.onUsage({ in: j.usage.prompt_tokens, out: j.usage.completion_tokens });
      const ch = j.choices && j.choices[0];
      if (!ch) return;
      if (ch.finish_reason) finish = String(ch.finish_reason);
      const d = ch.delta || {};
      const text = typeof d.content === "string" ? d.content
        : Array.isArray(d.content) ? d.content.map(x => (x && typeof x.text === "string" ? x.text : "")).join("") : "";
      if (text) { emitido += text.length; ctx.onText(text); }
    }, "Gemini");
  }
  if (!emitido) {
    if (/content_filter|safety|blocked|prohibited/i.test(finish)) throw provError(400, "Gemini bloqueó la respuesta por sus filtros de contenido. Probá reformular.", "filtro");
    if (/length|max_tokens/i.test(finish)) throw provError(502, "Gemini gastó todo el límite de tokens razonando y no llegó a responder. Subí GEMINI_THINKING_EXTRA en el .env.", "empty");
    throw provError(502, `Gemini devolvió una respuesta vacía${finish ? ` (motivo: ${finish})` : ""}.`, "empty");
  }
  if (/length|max_tokens/i.test(finish)) ctx.nota = "respuesta cortada por límite de tokens";
}

// La API está creada pero apagada en el proyecto de Google de esa key.
const apiApagada = msg => /has not been used in project|service[_ ]disabled|accessnotconfigured|api is not enabled/i.test(msg);

// Traduce el error de Gemini a un código HTTP que el front sepa explicar.
function geminiStatus(status, msg) {
  if (apiApagada(msg)) return 403;
  if (/api key not valid|api_key_invalid|invalid api key|unauthenticated|permission_denied.*api key/i.test(msg)) return 401;
  if (status === 429 || /quota|rate limit|resource.?exhausted|too many requests/i.test(msg)) return 429;
  if (/overloaded|unavailable|high demand/i.test(msg)) return 503;
  if (/not found|is not supported|unknown model|does not exist/i.test(msg)) return 404;
  if (status === 200) return 502;
  return status;
}
function geminiMessage(status, msg, model) {
  const code = geminiStatus(status, msg);
  const detalle = msg ? ` (${msg.replace(/\s+/g, " ").slice(0, 200)})` : "";
  if (code === 403 && apiApagada(msg)) {
    // El mensaje de Google trae el link exacto al proyecto: lo rescatamos.
    const link = (msg.match(/https:\/\/\S+?generativelanguage\S*?(?=\s|$)/i) || [])[0];
    return "La API de Gemini está apagada en el proyecto de Google de esa key. "
      + (link ? `Entrá a ${link} y tocá "Habilitar", esperá 1 o 2 minutos y reiniciá el servidor. ` : 'Habilitá "Generative Language API" en ese proyecto, esperá 1 o 2 minutos y reiniciá el servidor. ')
      + "Atajo: creá otra key en https://aistudio.google.com/apikey eligiendo un proyecto NUEVO, que ya viene habilitado.";
  }
  if (code === 401) return `La GEMINI_API_KEY del .env no es válida. Creá otra en https://aistudio.google.com/apikey y reiniciá el servidor.${detalle}`;
  if (code === 429) return `Se agotó la cuota gratuita de Gemini por ahora. Esperá un minuto y probá de nuevo.${detalle}`;
  if (code === 503) return `Gemini está saturado en este momento.${detalle}`;
  if (code === 404) return `El modelo "${model}" no está disponible para tu key. Cambiá GEMINI_MODEL (o el de voz/evaluación) en el .env por uno de la lista de AI Studio.${detalle}`;
  return (msg || "Error de la API de Gemini").slice(0, 300);
}

const RUN = { "claude-sdk": runClaudeSdk, gemini: runGemini, anthropic: runAnthropic };

// ¿Tiene sentido intentar con este proveedor? Devuelve un error si seguro que no.
async function problemaDe(id) {
  const prov = PROVIDERS[id];
  if (id === "claude-sdk") {
    // Si no había sesión, volvemos a mirar (quizás la iniciaste después de arrancar).
    if (SDK_STATE.estado !== "ok" && Date.now() - SDK_STATE.cuando > 5000) await verificarSesionClaude();
    else if (SDK_STATE.promesa) await SDK_STATE.promesa;
    return SDK_STATE.estado === "sin_sesion" ? provError(401, SDK_STATE.mensaje || MSG_SIN_SESION, "sesion") : null;
  }
  return prov.key ? null : provError(500, `Falta ${prov.keyVar} en el archivo .env.`, "missing_key");
}

// Un intento contra un proveedor, con timeout hasta el primer texto y por silencio a mitad de camino.
async function intentar(id, purpose, payload, sse, signal) {
  const prov = PROVIDERS[id];
  const model = prov.models[purpose] || prov.models.chat;
  const t0 = Date.now();
  let empezo = false, chars = 0, usage = {}, porTimeout = false;
  const local = new AbortController();
  const alCortar = () => local.abort();
  signal.addEventListener("abort", alCortar, { once: true });
  let timer = null;
  const armar = ms => { clearTimeout(timer); timer = setTimeout(() => { porTimeout = true; local.abort(); }, ms); };
  armar(T_PRIMER_TOKEN);
  const ctx = {
    signal: local.signal,
    onText: t => {
      if (!t || local.signal.aborted) return;
      if (!empezo) { empezo = true; sse.open(); }
      chars += t.length;
      armar(T_SILENCIO_STREAM);
      sse.text(t);
    },
    onUsage: u => { Object.keys(u).forEach(k => { if (u[k] != null) usage[k] = u[k]; }); },
    onRetry: (n, err) => logIA({ proveedor: id, modelo: model, purpose, ms: Date.now() - t0, nota: `el SDK reintenta (${n}, ${err})` }),
    log: m => logIA({ proveedor: id, modelo: model, purpose, ms: Date.now() - t0, nota: m })
  };
  try {
    await RUN[id]({ ...payload, model }, ctx);
    if (!chars) throw provError(502, `${prov.name} devolvió una respuesta vacía.`, "empty");
    logIA({ proveedor: id, modelo: model, purpose, ms: Date.now() - t0, ok: true, tokens: usage, nota: ctx.nota });
    return { ok: true };
  } catch (e) {
    if (signal.aborted) {
      logIA({ proveedor: id, modelo: model, purpose, ms: Date.now() - t0, nota: "cancelado por el usuario" });
      return { abortado: true };
    }
    let err = e;
    if (porTimeout) {
      err = empezo
        ? provError(504, `${prov.name} dejó de responder a mitad de camino.`, "timeout")
        : provError(504, `${prov.name} no empezó a responder en ${Math.round(T_PRIMER_TOKEN / 1000)} segundos.`, "timeout");
    } else if (!err || !err.status) {
      err = provError(502, `Falló la comunicación con ${prov.name}: ${(e && e.message) || e}`, "network");
    }
    logIA({ proveedor: id, modelo: model, purpose, ms: Date.now() - t0, error: err, tokens: usage });
    return { error: err, empezo };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", alCortar);
  }
}

// Pide una respuesta con reintentos y respaldo. Emite todo por SSE al navegador.
async function responder(purpose, payload, res, signal) {
  const sse = crearSSE(res);
  let ultimo = null;
  for (let i = 0; i < CADENA.length; i++) {
    const id = CADENA[i];
    if (i > 0) {
      console.log(`  [IA] respaldo: ${CADENA[i - 1]} falló (${ultimo ? ultimo.status + " " + ultimo.message.slice(0, 120) : "?"}) → pruebo con ${id}`);
    }
    const problema = await problemaDe(id);
    if (signal.aborted) return sse.end();
    if (problema) {
      logIA({ proveedor: id, modelo: PROVIDERS[id].models[purpose], purpose, ms: 0, error: problema });
      ultimo = problema;
      continue;
    }
    if (i > 0) { sse.open(); sse.event({ type: "provider", provider: id, name: PROVIDERS[id].detalle, fallback: true }); }
    for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
      const r = await intentar(id, purpose, payload, sse, signal);
      if (r.ok) return sse.close();
      if (r.abortado) return sse.end();
      ultimo = r.error;
      if (r.empezo) { sse.error(ultimo); return sse.close(); }   // ya se mostró texto: no mezclamos proveedores
      if (!esReintentable(ultimo) || intento === MAX_REINTENTOS) break;
      const espera = Math.round(800 * Math.pow(3, intento) * (0.8 + Math.random() * 0.4));
      console.log(`  [IA] reintento ${intento + 1}/${MAX_REINTENTOS} con ${id} en ${(espera / 1000).toFixed(1)}s`);
      sse.open();
      sse.event({ type: "retry", attempt: intento + 1, provider: id, message: "Reintentando…" });
      await dormir(espera, signal);
      if (signal.aborted) return sse.end();
    }
    if (!pasaAlRespaldo(ultimo)) break;
  }
  const err = ultimo || provError(500, "No hay ningún proveedor de IA configurado.", "missing_key");
  if (!res.headersSent) return fail(res, err.status || 500, err.message, err.code || undefined);
  sse.error(err);
  sse.close();
}

// ---------- Diagnóstico ----------
async function probarProveedor(id) {
  const prov = PROVIDERS[id];
  const out = { id, nombre: prov.detalle, modelo: prov.models.chat, ok: false, latenciaMs: null, error: null };
  if (id === "claude-sdk") { await verificarSesionClaude(); out.plan = SDK_STATE.plan || ""; }
  const problema = await problemaDe(id);
  if (problema) { out.error = problema.message; return out; }
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  let texto = "";
  try {
    await RUN[id]({ model: prov.models.chat, system: "Respondés con una sola palabra.", messages: [{ role: "user", content: "Decí: listo" }], max_tokens: 32 },
      { signal: ac.signal, onText: t => { texto += t; }, onUsage: () => {} });
    out.latenciaMs = Date.now() - t0;
    out.ok = Boolean(texto.trim());
    out.respuesta = texto.trim().slice(0, 40);
    if (!out.ok) out.error = "Respondió vacío.";
  } catch (e) {
    out.latenciaMs = Date.now() - t0;
    out.error = ac.signal.aborted ? "No respondió en 30 segundos." : sinSecretos((e && e.message) || String(e));
  } finally { clearTimeout(timer); }
  logIA({ proveedor: id, modelo: out.modelo, purpose: "diagnostico", ms: out.latenciaMs || 0, ok: out.ok, error: out.ok ? null : { message: out.error } });
  return out;
}

// Estado de los proveedores para la barra superior (sin hacer consultas pagas).
async function estadoIA() {
  if (CADENA.includes("claude-sdk") && SDK_STATE.promesa) await Promise.race([SDK_STATE.promesa, dormir(8000)]);
  const info = id => {
    if (!id) return null;
    const prov = PROVIDERS[id];
    let listo, problema = "";
    if (id === "claude-sdk") { listo = SDK_STATE.estado !== "sin_sesion"; problema = listo ? "" : (SDK_STATE.mensaje || MSG_SIN_SESION); }
    else { listo = Boolean(prov.key); problema = listo ? "" : `Falta ${prov.keyVar} en el archivo .env`; }
    return { id, nombre: prov.detalle, listo, problema, modelos: prov.models, keyVar: prov.keyVar, plan: id === "claude-sdk" ? SDK_STATE.plan : undefined };
  };
  const principal = info(PRIMARY), respaldo = info(FALLBACK);
  const activo = principal.listo ? principal : respaldo && respaldo.listo ? respaldo : null;
  return { principal, respaldo, activo: activo ? activo.id : null, problema: activo ? "" : principal.problema };
}

// ---------- rutas ----------
async function handleApi(req, res, url) {
  // Configuración pública (nunca incluye una API key)
  if (url.pathname === "/api/config") {
    if (req.method !== "GET") return fail(res, 405, "Método no permitido");
    const ia = await estadoIA();
    const act = PROVIDERS[ia.activo || PRIMARY];
    return json(res, 200, {
      hasKey: Boolean(ia.activo), provider: act.id, providerName: act.detalle, keyVar: act.keyVar,
      problema: ia.problema, models: act.models, ia, voice: VOICE
    });
  }

  if (url.pathname === "/api/diagnostico") {
    if (req.method !== "GET") return fail(res, 405, "Método no permitido");
    const [principal, respaldo] = await Promise.all([probarProveedor(PRIMARY), FALLBACK ? probarProveedor(FALLBACK) : null]);
    return json(res, 200, { principal, respaldo, activo: principal.ok ? PRIMARY : respaldo && respaldo.ok ? FALLBACK : null });
  }

  // Consulta a la IA
  if (url.pathname === "/api/messages") {
    if (req.method !== "POST") return fail(res, 405, "Método no permitido");
    const body = await bodyObject(req, res, LIMITS.mensajes, "Quitá algún documento del contexto de la empresa.");
    if (!body) return;
    const purpose = ["chat", "eval", "voice"].includes(body.purpose) ? body.purpose : "chat";
    const payload = sanitizePayload(body);
    if (!payload.messages.length) return fail(res, 400, "El pedido no trae ningún mensaje para responder.");
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    return responder(purpose, payload, res, controller.signal);
  }

  // Configuración de la empresa (la carga la persona responsable)
  if (url.pathname === "/api/empresa") {
    const file = path.join(DATA, "empresa.json");
    if (req.method === "GET") {
      let data = readJSON(file, null);
      if (!data) return fail(res, 404, "Sin configuración guardada");
      // Formato viejo (secciones fijas): lo convertimos y guardamos, dejando una copia del original.
      if (core.esFormatoViejo(data)) {
        try {
          const respaldo = path.join(DATA, "empresa.formato-viejo.json");
          if (!fs.existsSync(respaldo)) writeJSON(respaldo, data);
          data = core.migrarConfig(data);
          writeJSON(file, data);
          console.log("  Configuración de la empresa convertida al formato nuevo (copia del original en data/empresa.formato-viejo.json).");
        } catch (e) { data = core.migrarConfig(data); }
      }
      return json(res, 200, data);
    }
    if (req.method === "PUT") {
      const cfg = await bodyObject(req, res, LIMITS.empresa, "Subí documentos más chicos.");
      if (!cfg) return;
      if (typeof cfg.empresa !== "string" || !cfg.empresa.trim()) return fail(res, 400, "Falta el nombre de la empresa.");
      for (const k of ["escenarios", "criterios", "archivos", "contextos", "documentos"]) {
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
        return isObj(r) && r.id ? { id: r.id, candidato: r.candidato, escenario: r.escenario && r.escenario.titulo, empresa: r.empresa, fecha: r.fecha, puntaje: r.puntaje } : null;
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
      console.error("  Error en", url.pathname + ":", sinSecretos((e && e.message) || e));
      fail(res, 500, "Error interno del servidor. Mirá la consola donde corre npm start.");
    });
    return;
  }
  try { serveStatic(req, res, url); }
  catch (e) { try { res.writeHead(500); res.end(); } catch (_) {} }
});

// Que un error suelto no baje el servidor en medio de una demo.
process.on("uncaughtException", e => console.error("  Error inesperado (el servidor sigue andando):", sinSecretos((e && e.stack) || e)));
process.on("unhandledRejection", e => console.error("  Promesa rechazada (el servidor sigue andando):", sinSecretos((e && e.stack) || e)));

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

const descProv = id => {
  const p = PROVIDERS[id];
  return `${p.detalle} (${id}) · chat=${p.models.chat} · voz=${p.models.voice} · evaluación=${p.models.eval}`;
};

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Tutoring corriendo en  http://localhost:${server.address().port}\n`);
  console.log(`  IA principal: ${descProv(PRIMARY)}`);
  console.log(`  IA de respaldo: ${FALLBACK ? descProv(FALLBACK) : "ninguna (LLM_FALLBACK vacío)"}`);
  for (const id of CADENA) {
    if (id !== "claude-sdk" && !PROVIDERS[id].key) console.log(`  Atención: falta ${PROVIDERS[id].keyVar} en el archivo .env`);
  }
  console.log(`  Voz: ${VOICE.provider}${VOICE.provider === "vapi" && !VOICE.vapiPublicKey ? "  (atención: falta VAPI_PUBLIC_KEY en el .env)" : ""}\n`);
  if (CADENA.includes("claude-sdk")) {
    verificarSesionClaude().then(s => {
      if (s.estado === "ok") console.log(`  Claude: sesión iniciada${s.plan ? " (" + s.plan + ")" : ""}. No se usa ninguna API key.\n`);
      else console.log(`\n  ⚠  Claude: ${s.mensaje}\n`);
    });
  }
});
