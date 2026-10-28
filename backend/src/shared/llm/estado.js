const { PROVIDERS, PRIMARY, FALLBACK, CADENA } = require("./providers.config");
const { RUN, problemaDe } = require("./intentos");
const { verificarSesionClaude, SDK_STATE, MSG_SIN_SESION } = require("./providers/claude-sdk");
const { logIA } = require("./log");
const { sinSecretos } = require("../utils/secretos");
const { dormir } = require("../utils/tiempo");
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
module.exports = { probarProveedor, estadoIA };
