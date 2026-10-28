const { sinSecretos } = require("../utils/secretos");
// ---------- Streaming hacia el navegador ----------
// El front entiende el formato de eventos de la API de Claude; todos los proveedores lo emiten igual.
function sendEvent(res, obj) {
  if (res.writableEnded) return;
  try { res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
}
function crearSSE(res) {
  let abierto = false, ping = null;
  const sse = {
    open() {
      if (abierto || res.headersSent) return;
      abierto = true;
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      sendEvent(res, { type: "message_start", message: { role: "assistant", content: [] } });
      sendEvent(res, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      // Mantiene viva la conexión mientras el proveedor piensa.
      ping = setInterval(() => { if (!res.writableEnded) { try { res.write(": ping\n\n"); } catch (_) {} } }, 15000);
    },
    event: obj => sendEvent(res, obj),
    text: t => sendEvent(res, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }),
    error: e => sendEvent(res, { type: "error", error: { type: e.status === 529 ? "overloaded_error" : e.code || "api_error", status: e.status || 500, message: sinSecretos(e.message) } }),
    close() {
      clearInterval(ping);
      sendEvent(res, { type: "content_block_stop", index: 0 });
      sendEvent(res, { type: "message_stop" });
      try { res.end(); } catch (_) {}
    },
    end() { clearInterval(ping); try { res.end(); } catch (_) {} }
  };
  return sse;
}
module.exports = { sendEvent, crearSSE };
