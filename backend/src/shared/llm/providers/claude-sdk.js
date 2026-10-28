const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { RAIZ, env } = require("../../../config/env");
const { provError } = require("../errores");
const { registrarArchivo } = require("../../utils/registro");
// ---------- Claude Agent SDK (suscripción) ----------
// Lo usamos SOLO como modelo de texto: sin herramientas, sin MCP, sin ajustes del disco,
// un solo turno y en una carpeta vacía. No puede leer ni tocar archivos de la compu.
let sdkMod = null;
async function cargarSdk() {
  if (sdkMod) return sdkMod;
  try {
    // CLAUDE_SDK_MODULE permite reemplazar el SDK por uno simulado en las pruebas.
    const ruta = env("CLAUDE_SDK_MODULE");
    sdkMod = await import(ruta ? pathToFileURL(path.resolve(RAIZ, ruta)).href : "@anthropic-ai/claude-agent-sdk");
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
        // Todo lo que Claude Code escribe en stderr queda en el archivo de log; los errores también en la terminal.
        stderr: d => {
          const t = String(d).trim();
          if (!t) return;
          if (/error|fail|timeout|overload|rate|ECONN|socket/i.test(t)) ctx.log && ctx.log("Claude Code dice: " + t.slice(0, 300));
          else registrarArchivo(`[claude-sdk stderr] ${t.slice(0, 500)}`);
        }
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
      // El proceso de Claude Code ya arrancó: sirve para saber si la demora es del arranque o de la respuesta.
      if (m.type === "system" && m.subtype === "init") { ctx.onInit && ctx.onInit(); continue; }
      if (m.type === "result") {
        const u = m.usage || {};
        ctx.onUsage({ in: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), out: u.output_tokens,
          cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0 });
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
module.exports = { runClaudeSdk, verificarSesionClaude, SDK_STATE, MSG_SIN_SESION };
