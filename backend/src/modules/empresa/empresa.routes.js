const c = require("./empresa.controller");

module.exports = [
  { method: "GET", path: "/api/empresa", handler: c.obtener },
  { method: "PUT", path: "/api/empresa", handler: c.guardar }
];
