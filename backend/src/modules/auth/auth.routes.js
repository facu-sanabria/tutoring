const c = require("./auth.controller");
const g = require("./google.controller");

// publicas: antes de exigir sesión. privadas: con sesión (pero se permiten con la contraseña pendiente).
module.exports = {
  publicas: [
    { method: "POST", path: "/api/login", handler: c.ingresar },
    { method: "GET", path: "/api/auth/config", handler: g.configuracion },
    { method: "POST", path: "/api/auth/google", handler: g.entrarConGoogle }
  ],
  privadas: [
    { method: "GET", path: "/api/yo", handler: c.yo },
    { method: "POST", path: "/api/logout", handler: c.salir },
    { method: "POST", path: "/api/contrasena", handler: c.cambiarClave }
  ]
};
