const fs = require("fs");
const path = require("path");
const { REPORTS } = require("../../../config/paths");
const { readJSON, writeJSON } = require("../../../shared/utils/archivos-json");

const archivo = id => path.join(REPORTS, id + ".json");

// Todos los informes guardados, tal cual están en el disco (los ilegibles vienen como null).
function listar() {
  let files = [];
  try { files = fs.readdirSync(REPORTS).filter(f => f.endsWith(".json")); } catch (_) {}
  return files.map(f => readJSON(path.join(REPORTS, f), null));
}

const leer = id => readJSON(archivo(id), null);
const guardar = r => writeJSON(archivo(r.id), r);
// No existir ya cuenta como borrado.
function borrar(id) {
  try { fs.unlinkSync(archivo(id)); } catch (e) { if (e.code !== "ENOENT") throw e; }
}

module.exports = { listar, leer, guardar, borrar };
