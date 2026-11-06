// Quién es el cliente real cuando hay un balanceador o Cloudflare adelante.
// TRUST_PROXY: vacío = conexión directa (npm start), alb = detrás del balanceador de AWS,
// cloudflare = detrás de Cloudflare (por ejemplo, con Cloudflare Tunnel). Solo se activa si nadie
// puede llegar al servidor salteándose ese proxy: si no, un cliente podría falsificar estos headers.
const { env } = require("../../config/env");

const uno = v => String(Array.isArray(v) ? v[0] : v || "").trim();

function ipDe(req) {
  const modo = env("TRUST_PROXY");
  const directa = req.socket.remoteAddress;
  if (modo === "cloudflare") return uno(req.headers["cf-connecting-ip"]) || directa;
  // El balanceador agrega la IP que vio al final: lo anterior lo pudo escribir el cliente.
  if (modo === "alb") return uno(req.headers["x-forwarded-for"]).split(",").pop().trim() || directa;
  return directa;
}

function esHttps(req) {
  if (req.socket.encrypted) return true;
  return ["alb", "cloudflare"].includes(env("TRUST_PROXY")) && uno(req.headers["x-forwarded-proto"]) === "https";
}

module.exports = { ipDe, esHttps };
