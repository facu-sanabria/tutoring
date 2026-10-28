// Carga el .env de la raíz del repo y expone env() / envNum().
const fs = require("fs");
const path = require("path");

// Raíz del repo (backend/src/config → ../../..): ahí están .env, data/ y public/.
const RAIZ = path.resolve(__dirname, "..", "..", "..");
// ---------- .env ----------
const envPath = path.join(RAIZ, ".env");
if (fs.existsSync(envPath)) {
  const raw0 = fs.readFileSync(envPath, "utf8").replace(/^﻿/, "");
  for (const raw of raw0.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
const env = k => String(process.env[k] || "").trim();
const envNum = (k, def) => { const n = Number(env(k)); return Number.isFinite(n) && n > 0 ? n : def; };
module.exports = { RAIZ, env, envNum };
