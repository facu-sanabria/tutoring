function cookieDe(req, nombre) {
  for (const parte of String(req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return "";
}
module.exports = { cookieDe };
