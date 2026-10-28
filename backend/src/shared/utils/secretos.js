const { PROVIDERS, LIVE_KEYS } = require("../llm/providers.config");
// Nunca imprimimos ni devolvemos una key, aunque venga dentro de un mensaje de error.
const SECRETOS = [PROVIDERS.gemini.key, PROVIDERS.anthropic.key, ...LIVE_KEYS].filter(s => s && s.length > 8);
const sinSecretos = s => SECRETOS.reduce((t, k) => t.split(k).join("***"), String(s == null ? "" : s));
module.exports = { sinSecretos };
