const { fail } = require("./respuesta");

// Tabla de rutas: { method, path, handler(req, res, ctx) }.
// path es un texto exacto o una RegExp (sus grupos llegan en ctx.params).
// method "*" deja que el handler despache por método (para validar antes, como en /api/informes/:id).
// Devuelve true si atendió el pedido (incluido el 405) y false si ninguna ruta coincide.
function crearRouter(rutas) {
  return async (req, res, ctx) => {
    let hayRuta = false;
    for (const r of rutas) {
      const m = typeof r.path === "string" ? (ctx.url.pathname === r.path ? [r.path] : null) : ctx.url.pathname.match(r.path);
      if (!m) continue;
      hayRuta = true;
      if (r.method === "*" || r.method === req.method) {
        await r.handler(req, res, { ...ctx, params: m.slice(1) });
        return true;
      }
    }
    if (hayRuta) { fail(res, 405, "Método no permitido"); return true; }
    return false;
  };
}

module.exports = { crearRouter };
