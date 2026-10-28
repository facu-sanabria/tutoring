const fs = require("fs");
const path = require("path");
const { PUBLIC } = require("../../config/paths");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

// ---------- estáticos ----------
function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end("Ruta inválida"); }
  if (rel.includes("\0")) { res.writeHead(400); return res.end("Ruta inválida"); }
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.resolve(PUBLIC, "." + rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Prohibido"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": data.length,
      "cache-control": "no-cache"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}
module.exports = { serveStatic };
