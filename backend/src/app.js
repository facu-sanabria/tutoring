// Recibe cada pedido: /api/* va a la API, el resto a los estáticos de public/.
const { fail } = require("./shared/http/respuesta");
const { serveStatic } = require("./shared/http/static");
const { sinSecretos } = require("./shared/utils/secretos");

function crearApp(handleApi) {
  return (req, res) => {
    let url;
    try { url = new URL(req.url, "http://localhost"); }
    catch (_) { res.writeHead(400); return res.end("Pedido inválido"); }
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url).catch(e => {
        console.error("  Error en", url.pathname + ":", sinSecretos((e && e.message) || e));
        fail(res, 500, "Error interno del servidor. Mirá la consola donde corre npm start.");
      });
      return;
    }
    try { serveStatic(req, res, url); }
    catch (e) { try { res.writeHead(500); res.end(); } catch (_) {} }
  };
}

module.exports = { crearApp };
