const { fail } = require("./respuesta");
const { isObj } = require("../utils/validacion");
// ---------- helpers ----------
// Lee el cuerpo con tope de tamaño. Si se pasa, sigue descartando lo que llega para poder
// contestarle 413 al cliente (si cortamos el socket, el navegador solo ve "conexión perdida").
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, done = false, over = false; let chunks = [];
    const fin = fn => (...a) => { if (!done) { done = true; fn(...a); } };
    const bad = fin(reject), ok = fin(resolve);
    const tooLarge = () => bad(Object.assign(new Error("too_large"), { code: "too_large" }));
    req.on("data", c => {
      size += c.length;
      if (size > limit) {
        over = true; chunks = [];
        if (size > limit * 8) { tooLarge(); req.destroy(); }   // freno duro: alguien está abusando
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => (over ? tooLarge() : ok(Buffer.concat(chunks).toString("utf8"))));
    req.on("aborted", () => bad(Object.assign(new Error("aborted"), { code: "aborted" })));
    req.on("error", bad);
  });
}

// Lee el cuerpo como objeto JSON. Devuelve null y ya respondió el error si algo falla.
async function bodyObject(req, res, limit, queHacia) {
  let raw;
  try { raw = await readBody(req, limit); }
  catch (e) {
    if (e.code === "too_large") fail(res, 413, `El contenido es demasiado grande (máximo ${Math.round(limit / 1e6)} MB). ${queHacia}`.trim());
    return null;
  }
  let obj;
  try { obj = JSON.parse(raw); } catch (_) { fail(res, 400, "El pedido no es JSON válido."); return null; }
  if (!isObj(obj)) { fail(res, 400, "El pedido tiene que ser un objeto JSON."); return null; }
  return obj;
}
module.exports = { readBody, bodyObject };
