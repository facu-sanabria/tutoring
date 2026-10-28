const { env } = require("../../config/env");
const { trimUrl, LIVE_KEYS } = require("../llm/providers.config");
const { geminiStatus, geminiMessage } = require("../llm/providers/gemini");
const { sinSecretos } = require("../utils/secretos");
const { logLinea } = require("../utils/registro");
const { VOICE } = require("./voice.config");
// ---------- Gemini Live: token efímero ----------
// Un uso, 1 minuto para abrir la sesión y 30 para hablar, atado al modelo configurado:
// aunque alguien lo copie del navegador, no sirve para otra cosa ni por mucho tiempo.
// Con varias keys (GEMINI_API_KEY, GEMINI_LIVE_API_KEY_2, GEMINI_LIVE_API_KEY_3): si una falla por cuota o
// porque Google la rechaza, se pausa un rato y se usa la siguiente. Nunca se devuelve ni se imprime una key:
// solo su número (1, 2, 3).
const LIVE_ESTADO = LIVE_KEYS.map(() => ({ pausadaHasta: 0, motivo: "" }));
let liveActual = 0;
function pausarKeyLive(i, motivo, ms) {
  if (!LIVE_ESTADO[i]) return;
  LIVE_ESTADO[i] = { pausadaHasta: Date.now() + ms, motivo: String(motivo || "").slice(0, 160) };
  logLinea(`[voz] key ${i + 1} de Gemini Live en pausa ${Math.round(ms / 60000)} min: ${LIVE_ESTADO[i].motivo}${LIVE_KEYS.length > 1 ? "" : " (no hay key de respaldo: sumá GEMINI_LIVE_API_KEY_2 en el .env)"}`);
}
async function pedirTokenLive(i) {
  const gl = VOICE.geminiLive;
  const ahora = Date.now();
  const base = trimUrl(env("GEMINI_LIVE_BASE_URL") || "https://generativelanguage.googleapis.com");
  let r;
  try {
    r = await fetch(`${base}/v1alpha/auth_tokens`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": LIVE_KEYS[i] },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(ahora + 30 * 60e3).toISOString(),
        newSessionExpireTime: new Date(ahora + 60e3).toISOString(),
        // Traba solo el modelo: el resto del setup (consigna del escenario, voz) lo manda el navegador.
        // Sin fieldMask, Google traba el setup entero y descarta la consigna.
        bidiGenerateContentSetup: { model: `models/${gl.model}` },
        fieldMask: "model"
      }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (_) {
    return { status: 502, red: true, error: "No se pudo conectar con Google para abrir la llamada de Gemini Live. Revisá la conexión a internet." };
  }
  let j = null;
  try { j = await r.json(); } catch (_) {}
  if (!r.ok || !j || !j.name) {
    const msg = (j && j.error && j.error.message) || "";
    const st = geminiStatus(r.status, msg);
    return { status: st >= 400 ? st : 502, error: sinSecretos(geminiMessage(r.status, msg, gl.model)).replace("Cambiá GEMINI_MODEL (o el de voz/evaluación)", "Cambiá GEMINI_LIVE_MODEL").replace("La GEMINI_API_KEY del .env", `La key ${i + 1} de Gemini Live`) };
  }
  return { token: j.name, model: gl.model, expira: new Date(ahora + 30 * 60e3).toISOString() };
}
// opts.descartar: número de key (0, 1, 2) que el navegador vio fallar (cuota, rechazo). opts.soloKey: para el chequeo.
async function tokenGeminiLive(opts = {}) {
  if (!LIVE_KEYS.length) return { status: 503, error: "Falta GEMINI_API_KEY en el .env: Gemini Live la necesita. Creala gratis en https://aistudio.google.com/apikey y reiniciá el servidor." };
  if (Number.isInteger(opts.soloKey)) {
    if (!LIVE_KEYS[opts.soloKey]) return { status: 404, error: `No hay key ${opts.soloKey + 1} de Gemini Live en el .env.` };
    const r = await pedirTokenLive(opts.soloKey);
    return r.token ? { ...r, keyIndex: opts.soloKey, keys: LIVE_KEYS.length } : r;
  }
  if (Number.isInteger(opts.descartar) && LIVE_ESTADO[opts.descartar]) {
    pausarKeyLive(opts.descartar, "falló en la llamada: " + (opts.motivo || "sin detalle"), 15 * 60e3);
  }
  // Primero las keys que no están en pausa (empezando por la última que anduvo); las pausadas, como último recurso.
  const ahora = Date.now();
  const todas = LIVE_KEYS.map((_, k) => (liveActual + k) % LIVE_KEYS.length);
  const orden = [...todas.filter(k => LIVE_ESTADO[k].pausadaHasta <= ahora), ...todas.filter(k => LIVE_ESTADO[k].pausadaHasta > ahora).sort((x, y) => LIVE_ESTADO[x].pausadaHasta - LIVE_ESTADO[y].pausadaHasta)];
  let ultimo = null;
  for (const i of orden) {
    const r = await pedirTokenLive(i);
    if (r.token) {
      if (i !== liveActual) logLinea(`[voz] Gemini Live ahora usa la key ${i + 1} de ${LIVE_KEYS.length}`);
      liveActual = i;
      LIVE_ESTADO[i] = { pausadaHasta: 0, motivo: "" };
      return { ...r, keyIndex: i, keys: LIVE_KEYS.length };
    }
    ultimo = r;
    logLinea(`[voz] key ${i + 1} de Gemini Live: no se pudo abrir la llamada (${r.status}): ${r.error}`);
    // Sin internet o con el modelo mal configurado, otra key no cambia nada.
    if (r.red || r.status === 404 || r.status === 400) break;
    pausarKeyLive(i, r.error, r.status === 401 || r.status === 403 ? 60 * 60e3 : 15 * 60e3);
  }
  return ultimo;
}
module.exports = { tokenGeminiLive };
