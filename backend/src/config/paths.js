const fs = require("fs");
const path = require("path");
const { RAIZ, env } = require("./env");
const PUBLIC = path.resolve(RAIZ, "public");
// DATA_DIR se usa en las pruebas para no pisar los datos reales. Normalmente no hace falta tocarlo.
const DATA = path.resolve(RAIZ, env("DATA_DIR") || "data");
const REPORTS = path.join(DATA, "informes");
fs.mkdirSync(REPORTS, { recursive: true });
// Registro de la IA en archivo (data/logs/ia-AAAA-MM-DD.log): sirve para ver qué pasó después de una demo.
const LOGS = path.resolve(DATA, env("LOG_DIR") || "logs");
module.exports = { PUBLIC, DATA, REPORTS, LOGS };
