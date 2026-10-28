const { sinSecretos } = require("../utils/secretos");
const { registrarArchivo } = require("../utils/registro");
// ---------- Registro en la terminal ----------
// Cada línea va a la terminal y también a data/logs/ia-AAAA-MM-DD.log.
// o.req: identificador corto del pedido (para seguir todos los intentos de una misma evaluación).
function logIA(o) {
  const partes = [`[IA]${o.req ? " #" + o.req : ""} ${o.proveedor}`, o.modelo, o.purpose];
  if (o.etiqueta) partes.push(o.etiqueta);
  partes.push(`${(o.ms / 1000).toFixed(1)}s`);
  if (o.ok) partes.push("ok");
  if (o.ttft != null) partes.push(`primer texto a los ${(o.ttft / 1000).toFixed(1)}s`);
  else if (o.error && o.recibio === false) partes.push("no llegó ningún texto");
  if (o.chars) partes.push(`${o.chars} caracteres recibidos`);
  if (o.tokens && (o.tokens.in != null || o.tokens.out != null)) partes.push(textoTokens(o.tokens));
  if (o.error) partes.push(`ERROR ${o.error.status || ""}${o.error.code ? " " + o.error.code : ""}: ${String(o.error.message).slice(0, 220)}`);
  if (o.nota) partes.push(o.nota);
  const linea = sinSecretos(partes.join(" · "));
  console.log("  " + linea);
  registrarArchivo(linea);
  if (o.error) {
    const p = pista(o.error, o.proveedor);
    if (p) { console.log("      → " + p); registrarArchivo("      → " + p); }
  }
}
// Qué significa el error y qué hacer, en castellano.
function pista(e, id) {
  if (!e) return "";
  const c = e.code || "", s = e.status;
  if (c === "timeout" && id === "claude-sdk") return "Claude Code (tu suscripción) no respondió a tiempo. No es falta de uso del plan: suele ser saturación momentánea de Claude o una respuesta que se colgó a mitad de camino. En la evaluación se cubre con el intento en paralelo.";
  if (c === "timeout") return "El proveedor no respondió a tiempo (saturación o red). Se pasa al siguiente.";
  if (c === "limite_plan") return "Se terminó el uso disponible de tu plan de Claude por ahora. Se usa el respaldo hasta que se renueve.";
  if (c === "sesion" && id === "claude-sdk") return "La sesión de Claude Code no es válida: ejecutá `claude` en una terminal, iniciá sesión y reiniciá el servidor.";
  if (c === "sesion") return "La key de ese proveedor fue rechazada: revisala en el .env.";
  if (c === "missing_key") return "Falta la key en el .env: ese proveedor se saltea.";
  if (c === "sdk") return "Claude Code no pudo responder. Probá `npm run chequeo` para ver si es la sesión o el proveedor.";
  if (c === "network") return "Se cortó la comunicación (internet o el proceso de Claude Code). Revisá la conexión.";
  if (c === "eval_formato" || c === "eval_incompleta") return "La IA respondió, pero el informe vino incompleto o mal formado. Se reintenta.";
  if (s === 503 && id === "gemini") return "Saturación del lado de Google (alta demanda del modelo). No depende de tu key: otra key no lo arregla.";
  if (s === 429 && id === "gemini") return "Se agotó la cuota de esa key de Gemini por ahora.";
  if (s === 529 || c === "saturado") return "Claude está saturado en este momento. Se reintenta y, si sigue, se pasa al siguiente.";
  return "";
}
// "tokens in=5200 (normales=300 caché: escritos=0 leídos=4900, 94% cacheado) out=410"
function textoTokens(t) {
  let s = `tokens in=${t.in ?? "?"}`;
  if (t.in != null && (t.cacheWrite != null || t.cacheRead != null)) {
    const w = t.cacheWrite || 0, r = t.cacheRead || 0;
    s += ` (normales=${t.in - w - r} caché: escritos=${w} leídos=${r}, ${t.in ? Math.round(r / t.in * 100) : 0}% cacheado)`;
  }
  return s + ` out=${t.out ?? "?"}`;
}
module.exports = { logIA, pista, textoTokens };
