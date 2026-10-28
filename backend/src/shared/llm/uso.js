const { CACHE, PRECIO_CACHE } = require("./providers.config");
// Totales de la sesión (desde que arrancó el servidor), por proveedor. Se ven en /api/diagnostico.
const USO_SESION = {};
function sumarUso(id, u) {
  if (!u || u.in == null) return;
  const t = USO_SESION[id] || (USO_SESION[id] = { consultas: 0, entrada: 0, escritosEnCache: 0, leidosDelCache: 0, tokensAhorrados: 0 });
  const escritos = u.cacheWrite || 0, leidos = u.cacheRead || 0, precio = PRECIO_CACHE[id];
  t.consultas++;
  t.entrada += u.in;
  t.escritosEnCache += escritos;
  t.leidosDelCache += leidos;
  // Tokens "equivalentes" ahorrados: lo leído del caché sale ~10%, lo escrito puede salir más caro.
  t.tokensAhorrados += Math.round(leidos * (1 - precio.lectura) - escritos * (precio.escritura - 1));
}
function resumenUso() {
  const out = { activo: CACHE.activo, ttl: CACHE.ttl, proveedores: USO_SESION };
  const tot = Object.values(USO_SESION).reduce((a, t) => ({ entrada: a.entrada + t.entrada, leidos: a.leidos + t.leidosDelCache, ahorro: a.ahorro + t.tokensAhorrados }), { entrada: 0, leidos: 0, ahorro: 0 });
  out.tokensAhorrados = tot.ahorro;
  out.porcentajeCacheado = tot.entrada ? Math.round(tot.leidos / tot.entrada * 100) : 0;
  return out;
}
module.exports = { sumarUso, resumenUso };
