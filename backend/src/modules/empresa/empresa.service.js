const path = require("path");
const { RAIZ } = require("../../config/env");
const repo = require("./empresa.repository");
const core = require(path.join(RAIZ, "public/js/core.js"));   // misma lógica que el navegador (migración de la configuración)

// Devuelve la configuración guardada (o null). Formato viejo (secciones fijas): lo convertimos y guardamos,
// dejando una copia del original.
function obtener() {
  let data = repo.leer();
  if (!data) return null;
  if (core.esFormatoViejo(data)) {
    try {
      repo.guardarRespaldoSiNoExiste(data);
      data = core.migrarConfig(data);
      repo.guardar(data);
      console.log("  Configuración de la empresa convertida al formato nuevo (copia del original en data/empresa.formato-viejo.json).");
    } catch (e) { data = core.migrarConfig(data); }
  }
  return data;
}

// Devuelve el mensaje de error, o "" si la configuración es válida.
function validar(cfg) {
  if (typeof cfg.empresa !== "string" || !cfg.empresa.trim()) return "Falta el nombre de la empresa.";
  for (const k of ["escenarios", "criterios", "archivos", "contextos", "documentos"]) {
    if (k in cfg && !Array.isArray(cfg[k])) return `El campo "${k}" tiene que ser una lista.`;
  }
  return "";
}

const guardar = cfg => repo.guardar(cfg);

module.exports = { obtener, validar, guardar };
