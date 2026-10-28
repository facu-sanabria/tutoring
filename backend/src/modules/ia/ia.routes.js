const c = require("./ia.controller");

module.exports = [
  { method: "GET", path: "/api/config", handler: c.config },
  { method: "GET", path: "/api/diagnostico", handler: c.diagnostico },
  { method: "POST", path: "/api/messages", handler: c.mensajes }
];
