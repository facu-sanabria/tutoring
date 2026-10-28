const c = require("./auth.controller");

// publicas: antes de exigir sesión. privadas: con sesión (pero se permiten con la contraseña pendiente).
module.exports = {
  publicas: [
    { method: "POST", path: "/api/login", handler: c.ingresar }
  ],
  privadas: [
    { method: "GET", path: "/api/yo", handler: c.yo },
    { method: "POST", path: "/api/logout", handler: c.salir },
    { method: "POST", path: "/api/contrasena", handler: c.cambiarClave }
  ]
};
