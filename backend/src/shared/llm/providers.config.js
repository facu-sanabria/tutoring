const { env, envNum } = require("../../config/env");
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

// Evaluación: la calidad del informe depende de Claude, así que va primero Claude (suscripción),
// después Claude por API (si hay ANTHROPIC_API_KEY) y recién al final el respaldo general (Gemini).
// Se puede cambiar con LLM_EVAL_CADENA=claude-sdk,anthropic,gemini en el .env.
const EVAL_CADENA = (() => {
  const pedida = env("LLM_EVAL_CADENA")
    ? env("LLM_EVAL_CADENA").split(/[,\s]+/).map(s => normProv(s, ""))
    : [PRIMARY, "anthropic", FALLBACK];
  return [...new Set(pedida.filter(id => id && (id === "claude-sdk" || PROVIDERS[id].key)))];
})();

// Gemini Live (motor de voz): GEMINI_API_KEY y, opcionalmente, keys de respaldo de OTRAS cuentas de Google.
// Si una se queda sin cuota o es rechazada, la llamada siguiente (o la reconexión) usa la próxima.
const LIVE_KEYS = [...new Set([env("GEMINI_API_KEY"), env("GEMINI_LIVE_API_KEY_2"), env("GEMINI_LIVE_API_KEY_3")].filter(Boolean))];

// Caché de prompts: el principio de cada consulta (reglas, contexto de la empresa, documentos) se repite,
// y si es idéntico el proveedor lo cobra a una fracción del precio.
// - anthropic: se marca con cache_control (PROMPT_CACHE=off lo apaga; PROMPT_CACHE_TTL=1h dura más pero escribir cuesta el doble).
// - gemini: caché implícito, automático; solo hace falta que el principio del prompt sea idéntico.
// - claude-sdk: Claude Code ya cachea solo.
const CACHE = {
  activo: !/^(off|no|0|false)$/i.test(env("PROMPT_CACHE")),
  ttl: env("PROMPT_CACHE_TTL") === "1h" ? "1h" : "5m"
};
// Cuánto cuesta cada token del caché comparado con uno normal (para estimar el ahorro).
const PRECIO_CACHE = {
  anthropic: { lectura: 0.1, escritura: CACHE.ttl === "1h" ? 2 : 1.25 },
  "claude-sdk": { lectura: 0.1, escritura: 1.25 },
  gemini: { lectura: 0.1, escritura: 1 }
};

// Robustez
const T_PRIMER_TOKEN = envNum("LLM_TIMEOUT_MS", 45000);   // si no empieza a responder en este tiempo, se corta
const T_SILENCIO_STREAM = 60000;                          // si deja de mandar texto a mitad de camino
const MAX_REINTENTOS = 2;
// Evaluación: un informe normal tarda ~20 s. Si Claude no terminó en EVAL_CARRERA_MS, se lanza un segundo
// intento con Claude en paralelo y gana el primero que entregue un informe válido.
const T_EVAL_CARRERA = envNum("EVAL_CARRERA_MS", 25000);
// Si a mitad de la evaluación deja de llegar texto este tiempo, se da por colgado (antes eran 60 s).
const T_EVAL_SILENCIO = envNum("EVAL_SILENCIO_MS", 20000);
const REINTENTABLES = new Set([429, 500, 502, 503, 529]);
module.exports = {
  IDS, normProv, PRIMARY, FALLBACK, trimUrl, PROVIDERS, CADENA, EVAL_CADENA, LIVE_KEYS, CACHE, PRECIO_CACHE,
  T_PRIMER_TOKEN, T_SILENCIO_STREAM, MAX_REINTENTOS, T_EVAL_CARRERA, T_EVAL_SILENCIO, REINTENTABLES
};
