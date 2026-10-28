const crypto = require("crypto");
const { RAIZ } = require("../../config/env");
const { LIMITS } = require("../../config/limits");
const { PROVIDERS, T_PRIMER_TOKEN, T_SILENCIO_STREAM, T_EVAL_SILENCIO, MAX_REINTENTOS } = require("./providers.config");
const { provError, esReintentable } = require("./errores");
const { sumarUso } = require("./uso");
const { logIA } = require("./log");
const { logLinea } = require("../utils/registro");
const { dormir } = require("../utils/tiempo");
const { runClaudeSdk, verificarSesionClaude, SDK_STATE, MSG_SIN_SESION } = require("./providers/claude-sdk");
const { runGemini } = require("./providers/gemini");
const { runAnthropic } = require("./providers/anthropic");
const core = require(require("path").join(RAIZ, "public/js/core.js"));   // misma lógica que el navegador (parseo de la evaluación)
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
// opts.req: id corto del pedido (para el log). opts.etiqueta: "intento 2", "en paralelo"...
// opts.gana(): en la evaluación, solo el intento que gana la carrera entrega el informe.
// opts.notaCancelado: qué poner en el log si lo cancelamos nosotros (por ejemplo, porque ganó el otro intento).
async function intentar(id, purpose, payload, sse, signal, opts = {}) {
  const prov = PROVIDERS[id];
  const model = prov.models[purpose] || prov.models.chat;
  const t0 = Date.now();
  let empezo = false, recibio = false, ttft = null, tInit = null, chars = 0, usage = {}, porTimeout = false;
  let evaluacionTexto = "";
  const local = new AbortController();
  const alCortar = () => local.abort();
  signal.addEventListener("abort", alCortar, { once: true });
  let timer = null;
  const silencio = purpose === "eval" ? T_EVAL_SILENCIO : T_SILENCIO_STREAM;
  const armar = ms => { clearTimeout(timer); timer = setTimeout(() => { porTimeout = true; local.abort(); }, ms); };
  armar(T_PRIMER_TOKEN);
  const base = { req: opts.req, proveedor: id, modelo: model, purpose, etiqueta: opts.etiqueta };
  const ctx = {
    signal: local.signal,
    onText: t => {
      if (!t || local.signal.aborted) return;
      if (!recibio) { recibio = true; ttft = Date.now() - t0; }
      chars += t.length;
      armar(silencio);
      // Una evaluación se entrega completa: los reintentos no deben mezclar JSON.
      if (purpose === "eval") { evaluacionTexto += t; return; }
      if (!empezo) { empezo = true; sse.open(); }
      sse.text(t);
    },
    onUsage: u => { Object.keys(u).forEach(k => { if (u[k] != null) usage[k] = u[k]; }); },
    onInit: () => { if (tInit == null) tInit = Date.now() - t0; },
    onRetry: (n, err) => logIA({ ...base, ms: Date.now() - t0, nota: `Claude Code reintenta por su cuenta (intento ${n}${err ? ", motivo: " + err : ""})` }),
    log: m => logIA({ ...base, ms: Date.now() - t0, nota: m })
  };
  const notaInit = () => (tInit != null && id === "claude-sdk" ? `Claude Code arrancó en ${(tInit / 1000).toFixed(1)}s` : "");
  try {
    await RUN[id]({ ...payload, model, purpose }, ctx);
    if (!chars) throw provError(502, `${prov.name} devolvió una respuesta vacía.`, "empty");
    if (purpose === "eval") {
      const ev = core.parseEvaluacion(evaluacionTexto);
      // Un criterio sin evidencia puede venir sin puntaje (null): no es un error. Solo falla si no hay ninguno puntuado.
      if (!ev || !ev.criterios.length || ev.criterios.some(c => !c.nombre) || !ev.criterios.some(c => c.puntaje != null)) {
        throw provError(502, "La IA devolvió una evaluación incompleta o con formato inválido. Probá reintentar.", "eval_formato");
      }
      if (opts.gana && !opts.gana()) {
        sumarUso(id, usage);
        logIA({ ...base, ms: Date.now() - t0, ok: true, ttft, tokens: usage, nota: "llegó segundo: se descarta (ya respondió el otro intento)" });
        return { ok: true, tarde: true };
      }
      sse.open();
      sse.text(JSON.stringify(ev));
    }
    sumarUso(id, usage);
    logIA({ ...base, ms: Date.now() - t0, ok: true, ttft, tokens: usage, nota: [notaInit(), ctx.nota].filter(Boolean).join(" · ") });
    return { ok: true };
  } catch (e) {
    if (signal.aborted) {
      logIA({ ...base, ms: Date.now() - t0, ttft, chars, nota: (typeof opts.notaCancelado === "function" ? opts.notaCancelado() : opts.notaCancelado) || "cancelado por el usuario" });
      return { abortado: true };
    }
    let err = e;
    if (porTimeout) {
      err = recibio
        ? provError(504, `${prov.name} empezó a responder pero se quedó colgado ${Math.round(silencio / 1000)} segundos sin mandar nada.`, "timeout")
        : provError(504, `${prov.name} no empezó a responder en ${Math.round(T_PRIMER_TOKEN / 1000)} segundos.`, "timeout");
    } else if (!err || !err.status) {
      err = provError(502, `Falló la comunicación con ${prov.name}: ${(e && e.message) || e}`, "network");
    }
    sumarUso(id, usage);
    logIA({ ...base, ms: Date.now() - t0, error: err, ttft, recibio, chars, tokens: usage, nota: notaInit() });
    return { error: err, empezo };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", alCortar);
  }
}

const idPedido = () => crypto.randomBytes(2).toString("hex");
const pedidoEval = (payload, intento) => ({ ...payload, max_tokens: Math.min(LIMITS.maxTokens, Math.max(4096, payload.max_tokens) * (intento + 1)) });

// Intentos contra un mismo proveedor, con espera creciente entre uno y otro.
async function conReintentos(id, purpose, payload, sse, signal, req, desde = 0) {
  let r = null;
  for (let intento = desde; intento <= MAX_REINTENTOS; intento++) {
    const pedido = purpose === "eval" ? pedidoEval(payload, intento) : payload;
    r = await intentar(id, purpose, pedido, sse, signal, { req, etiqueta: intento ? `intento ${intento + 1}` : "" });
    if (r.ok || r.abortado || r.empezo) return r;
    if (!esReintentable(r.error) || intento === MAX_REINTENTOS) return r;
    // Cuando el proveedor está saturado, esperamos más: reintentar en 1 segundo no sirve.
    const saturado = /saturad|overload|high demand|demanda|529|503/i.test(r.error && r.error.message || "");
    const base = saturado ? 4000 : 800;
    const espera = Math.round(base * Math.pow(3, intento - desde) * (0.8 + Math.random() * 0.4));
    logLinea(`[IA] #${req} reintento ${intento + 1}/${MAX_REINTENTOS} con ${id} en ${(espera / 1000).toFixed(1)}s`);
    sse.open();
    sse.event({ type: "retry", attempt: intento + 1, provider: id, message: "Reintentando…" });
    await dormir(espera, signal);
    if (signal.aborted) return { abortado: true };
  }
  return r;
}
module.exports = { RUN, problemaDe, intentar, idPedido, pedidoEval, conReintentos };
