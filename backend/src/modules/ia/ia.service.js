const { PROVIDERS, PRIMARY, FALLBACK } = require("../../shared/llm/providers.config");
const { estadoIA, probarProveedor } = require("../../shared/llm/estado");
const { resumenUso } = require("../../shared/llm/uso");
const { VOICE } = require("../../shared/voz/voice.config");

// Configuración pública (nunca incluye una API key)
async function config() {
  const ia = await estadoIA();
  const act = PROVIDERS[ia.activo || PRIMARY];
  return {
    hasKey: Boolean(ia.activo), provider: act.id, providerName: act.detalle, keyVar: act.keyVar,
    problema: ia.problema, models: act.models, ia, voice: VOICE
  };
}

// Hace una consulta real a cada proveedor de la cadena.
async function diagnostico() {
  const [principal, respaldo] = await Promise.all([probarProveedor(PRIMARY), FALLBACK ? probarProveedor(FALLBACK) : null]);
  return { principal, respaldo, activo: principal.ok ? PRIMARY : respaldo && respaldo.ok ? FALLBACK : null, cache: resumenUso() };
}

module.exports = { config, diagnostico };
