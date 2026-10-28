function json(res, status, obj) {
  if (res.headersSent || res.writableEnded) { try { res.end(); } catch (_) {} return; }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
const fail = (res, status, message, type) => json(res, status, { error: type ? { type, message } : { message } });
module.exports = { json, fail };
