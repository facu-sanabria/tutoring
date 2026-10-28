const fs = require("fs");
const path = require("path");
const { LOGS } = require("../../config/paths");
const { sinSecretos } = require("./secretos");

// Registro de la IA en archivo (data/logs/ia-AAAA-MM-DD.log): sirve para ver qué pasó después de una demo.
function registrarArchivo(linea) {
  try {
    fs.mkdirSync(LOGS, { recursive: true });
    const d = new Date();
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    fs.appendFileSync(path.join(LOGS, `ia-${dia}.log`), `${d.toTimeString().slice(0, 8)} ${sinSecretos(linea)}\n`);
  } catch (_) {}
}
// Línea suelta (resúmenes, respaldo, reintentos): terminal + archivo.
function logLinea(texto) {
  const t = sinSecretos(texto);
  console.log("  " + t);
  registrarArchivo(t);
}
module.exports = { registrarArchivo, logLinea };
