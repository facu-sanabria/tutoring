const fs = require("fs");
const path = require("path");
const { DATA } = require("../../config/paths");
const { readJSON, writeJSON } = require("../../shared/utils/archivos-json");

const ARCHIVO = path.join(DATA, "empresa.json");
const RESPALDO = path.join(DATA, "empresa.formato-viejo.json");

const leer = () => readJSON(ARCHIVO, null);
const guardar = cfg => writeJSON(ARCHIVO, cfg);
function guardarRespaldoSiNoExiste(data) {
  if (!fs.existsSync(RESPALDO)) writeJSON(RESPALDO, data);
}

module.exports = { leer, guardar, guardarRespaldoSiNoExiste };
