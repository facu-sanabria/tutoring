const { PROVIDERS, CADENA, EVAL_CADENA, T_EVAL_CARRERA } = require("./providers.config");
const { provError, pasaAlRespaldo } = require("./errores");
const { logIA } = require("./log");
const { logLinea } = require("../utils/registro");
const { crearSSE } = require("../http/sse");
const { fail } = require("../http/respuesta");
const { problemaDe, intentar, idPedido, pedidoEval, conReintentos } = require("./intentos");
// Evaluación: rápida y con Claude.
// 1) Carrera: arranca Claude (suscripción). Si falla, o si a los EVAL_CARRERA_MS todavía no terminó, arranca un
//    segundo intento con Claude en paralelo (por API si hay ANTHROPIC_API_KEY; si no, otra vez Claude Code en un
//    proceso nuevo). Gana el primero que entregue un informe válido y el otro se cancela.
// 2) Si los dos fallan, sigue el resto de la cadena en orden (Claude API si no corrió, después Gemini), con reintentos.
async function responderEval(payload, res, signal) {
  const sse = crearSSE(res);
  const req = idPedido();
  const t0 = Date.now();
  const cadena = EVAL_CADENA.length ? EVAL_CADENA : CADENA;
  const resumen = [];
  const terminar = (ok, id, err) => {
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    if (ok) logLinea(`[IA] #${req} ✓ evaluación lista con ${PROVIDERS[id].detalle} en ${seg}s${resumen.length ? " (antes fallaron: " + resumen.join("; ") + ")" : ""}`);
    else logLinea(`[IA] #${req} ✗ la evaluación falló después de ${seg}s. Intentos: ${resumen.join("; ") || "ninguno"}. El usuario puede tocar Reintentar: la conversación no se pierde.`);
  };
  logLinea(`[IA] #${req} evaluación: cadena ${cadena.join(" → ")}${cadena[0] === "claude-sdk" ? ` · segundo intento en paralelo a los ${Math.round(T_EVAL_CARRERA / 1000)}s si Claude no terminó` : ""}`);

  // Proveedores utilizables (sesión iniciada, key presente).
  const usables = [];
  for (const id of cadena) {
    const problema = await problemaDe(id);
    if (signal.aborted) return sse.end();
    if (problema) { logIA({ req, proveedor: id, modelo: PROVIDERS[id].models.eval, purpose: "eval", ms: 0, error: problema }); resumen.push(`${id}: ${problema.message.slice(0, 80)}`); continue; }
    usables.push(id);
  }
  let ultimo = null;
  let resto = usables;
  if (usables[0] === "claude-sdk") {
    const segundo = usables.includes("anthropic") ? "anthropic" : "claude-sdk";
    const r = await carreraEval(["claude-sdk", segundo], payload, sse, signal, req);
    if (r.abortado) return sse.end();
    if (r.ok) { terminar(true, r.id); return sse.close(); }
    r.errores.forEach(x => resumen.push(`${x.id}: ${x.error.status || ""} ${x.error.message.slice(0, 80)}`));
    ultimo = r.errores.length ? r.errores[r.errores.length - 1].error : null;
    resto = usables.filter(id => id !== "claude-sdk" && id !== segundo);
  }
  for (const id of resto) {
    if (ultimo) logLinea(`[IA] #${req} respaldo de la evaluación → pruebo con ${id}`);
    if (id !== cadena[0]) { sse.open(); sse.event({ type: "provider", provider: id, name: PROVIDERS[id].detalle, fallback: true }); }
    const r = await conReintentos(id, "eval", payload, sse, signal, req);
    if (r.abortado) return sse.end();
    if (r.ok) { terminar(true, id); return sse.close(); }
    ultimo = r.error;
    resumen.push(`${id}: ${ultimo.status || ""} ${ultimo.message.slice(0, 80)}`);
    if (!pasaAlRespaldo(ultimo)) break;
  }
  terminar(false);
  const err = ultimo || provError(500, "No hay ningún proveedor de IA configurado.", "missing_key");
  if (!res.headersSent) return fail(res, err.status || 500, err.message, err.code || undefined);
  sse.error(err);
  sse.close();
}

// Dos intentos de evaluación que compiten. El segundo arranca si el primero falla o tarda más de T_EVAL_CARRERA.
function carreraEval(ids, payload, sse, signal, req) {
  return new Promise(resolve => {
    let ganador = -1, lanzados = 0, pendientes = 0, resuelto = false, timer = null;
    const errores = [];
    const controles = ids.map(() => new AbortController());
    const fin = r => { if (resuelto) return; resuelto = true; clearTimeout(timer); resolve(r); };
    const lanzar = k => {
      if (k < lanzados || k >= ids.length || ganador >= 0 || signal.aborted || resuelto) return;
      lanzados = k + 1; pendientes++;
      const ac = controles[k];
      const enlazar = () => ac.abort();
      signal.addEventListener("abort", enlazar, { once: true });
      intentar(ids[k], "eval", pedidoEval(payload, 0), sse, ac.signal, {
        req, etiqueta: k === 0 ? "" : (ids[k] === ids[0] ? "intento en paralelo (proceso nuevo)" : "intento en paralelo"),
        gana: () => { if (ganador >= 0) return false; ganador = k; return true; },
        notaCancelado: () => (signal.aborted ? "cancelado por el usuario" : "cancelado: el otro intento ya entregó el informe")
      }).then(r => {
        signal.removeEventListener("abort", enlazar);
        pendientes--;
        if (r.ok && !r.tarde) { controles.forEach((c, j) => { if (j !== k) c.abort(); }); return fin({ ok: true, id: ids[k] }); }
        if (r.error) errores.push({ id: ids[k], error: r.error });
        if (signal.aborted) { if (pendientes === 0) fin({ abortado: true }); return; }
        // Falló antes de que arrancara el otro: no esperamos, lo lanzamos ya.
        // Si Claude Code falló por el plan, la sesión o el modelo, repetirlo en otro proceso no sirve.
        const repetirNoSirve = r.error && ids[k + 1] === ids[k] && ["limite_plan", "sesion", "modelo", "cuenta"].includes(r.error.code);
        if (repetirNoSirve) lanzados = ids.length;
        if (r.error && !repetirNoSirve && lanzados === k + 1 && k + 1 < ids.length) {
          logLinea(`[IA] #${req} ${ids[k]} falló: arranco ya el intento con ${ids[k + 1]}`);
          lanzar(k + 1);
        }
        if (pendientes === 0 && ganador < 0) fin({ ok: false, errores });
      });
    };
    timer = setTimeout(() => {
      if (ganador < 0 && lanzados === 1 && !signal.aborted) {
        logLinea(`[IA] #${req} Claude lleva ${Math.round(T_EVAL_CARRERA / 1000)}s sin terminar: lanzo un segundo intento en paralelo con ${ids[1]}`);
        lanzar(1);
      }
    }, T_EVAL_CARRERA);
    lanzar(0);
  });
}
module.exports = { responderEval };
