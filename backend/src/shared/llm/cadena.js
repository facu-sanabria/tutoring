const { PROVIDERS, CADENA } = require("./providers.config");
const { provError, pasaAlRespaldo } = require("./errores");
const { logIA } = require("./log");
const { logLinea } = require("../utils/registro");
const { crearSSE } = require("../http/sse");
const { fail } = require("../http/respuesta");
const { problemaDe, idPedido, conReintentos } = require("./intentos");
const { responderEval } = require("./evaluacion");
// Pide una respuesta con reintentos y respaldo. Emite todo por SSE al navegador.
async function responder(purpose, payload, res, signal) {
  if (purpose === "eval") return responderEval(payload, res, signal);
  const sse = crearSSE(res);
  const req = idPedido();
  let ultimo = null;
  for (let i = 0; i < CADENA.length; i++) {
    const id = CADENA[i];
    if (i > 0) {
      logLinea(`[IA] #${req} respaldo: ${CADENA[i - 1]} falló (${ultimo ? ultimo.status + " " + ultimo.message.slice(0, 120) : "?"}) → pruebo con ${id}`);
    }
    const problema = await problemaDe(id);
    if (signal.aborted) return sse.end();
    if (problema) {
      logIA({ req, proveedor: id, modelo: PROVIDERS[id].models[purpose], purpose, ms: 0, error: problema });
      ultimo = problema;
      continue;
    }
    if (i > 0) { sse.open(); sse.event({ type: "provider", provider: id, name: PROVIDERS[id].detalle, fallback: true }); }
    const r = await conReintentos(id, purpose, payload, sse, signal, req);
    if (r.ok) return sse.close();
    if (r.abortado) return sse.end();
    ultimo = r.error;
    if (r.empezo) { sse.error(ultimo); return sse.close(); }   // ya se mostró texto: no mezclamos proveedores
    if (!pasaAlRespaldo(ultimo)) break;
  }
  const err = ultimo || provError(500, "No hay ningún proveedor de IA configurado.", "missing_key");
  if (!res.headersSent) return fail(res, err.status || 500, err.message, err.code || undefined);
  sse.error(err);
  sse.close();
}
module.exports = { responder };
