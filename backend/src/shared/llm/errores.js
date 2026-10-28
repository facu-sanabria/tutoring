const { REINTENTABLES } = require("./providers.config");
const { sinSecretos } = require("../utils/secretos");
// ---------- Errores de proveedor ----------
// status: código HTTP equivalente. code: tipo de problema para decidir reintento y respaldo.
function provError(status, message, code) {
  return Object.assign(new Error(sinSecretos(message)), { status, code: code || "" });
}
const esReintentable = e => e && e.code !== "limite_plan" && e.code !== "timeout" && e.code !== "filtro"
  && (REINTENTABLES.has(e.status) || e.code === "network" || e.code === "empty");
// Al respaldo pasamos por límite, sesión, saturación, red, modelo o timeout; no si el pedido es inválido.
const pasaAlRespaldo = e => e && e.status !== 400 && e.status !== 413 && e.code !== "filtro";
module.exports = { provError, esReintentable, pasaAlRespaldo };
