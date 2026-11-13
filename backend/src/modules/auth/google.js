// Verificación del ID token de "Entrar con Google" (Google Identity Services).
// El navegador recibe el token de Google y nos lo manda; acá NO se confía en nada del navegador
// hasta comprobar la firma con las claves públicas de Google y que el token sea para nuestra app.
// No guarda nada: devuelve los datos de la persona o falla. Qué hacer con ellos lo decide quien llama.
const { OAuth2Client } = require("google-auth-library");

// Google firma los ID tokens con cualquiera de estos dos emisores.
const EMISORES = ["accounts.google.com", "https://accounts.google.com"];

// Error con un código para el log y un mensaje genérico para la persona.
// El mensaje de afuera no dice qué falló: no le damos pistas a quien prueba tokens falsos.
class ErrorGoogle extends Error {
  constructor(codigo, detalle) {
    super("No pudimos verificar tu cuenta de Google. Probá de nuevo.");
    this.name = "ErrorGoogle";
    this.codigo = codigo;    // para el log; nunca incluye el email ni el token
    this.detalle = detalle;
  }
}

// clientId: el Client ID del cliente OAuth de Google Cloud (público; va en GOOGLE_CLIENT_ID).
// obtenerCerts: solo para los tests. Por defecto se usan las claves públicas de Google,
// que la librería baja y guarda en caché según lo que indique Google.
function crearVerificadorGoogle({ clientId, obtenerCerts } = {}) {
  const cliente = new OAuth2Client();
  const certs = obtenerCerts || (async () => (await cliente.getFederatedSignonCertsAsync()).certs);

  return async function verificarTokenGoogle(credential) {
    if (!clientId) throw new ErrorGoogle("sin_client_id", "Falta GOOGLE_CLIENT_ID en el servidor.");
    if (typeof credential !== "string" || !credential || credential.length > 8192) {
      throw new ErrorGoogle("token_ausente", "No llegó un token o es demasiado largo.");
    }

    let payload;
    try {
      // Verifica firma (RS256 con la clave cuyo kid indica el token), aud = clientId, iss y vencimiento.
      const ticket = await cliente.verifySignedJwtWithCertsAsync(credential, await certs(), clientId, EMISORES);
      payload = ticket.getPayload();
    } catch (e) {
      throw new ErrorGoogle("token_invalido", String(e && e.message || e).slice(0, 200));
    }

    // La invitación se basa en el email: si Google no lo verificó, no sirve para autorizar.
    const verificado = payload.email_verified === true || payload.email_verified === "true";
    if (!payload.sub || !payload.email) throw new ErrorGoogle("datos_incompletos", "El token no trae sub o email.");
    if (!verificado) throw new ErrorGoogle("email_no_verificado", "Google no verificó el email de esta cuenta.");

    return {
      sub: String(payload.sub),                       // identificador estable de la cuenta de Google
      email: String(payload.email).trim().toLowerCase(),
      nombre: payload.name ? String(payload.name) : null
    };
  };
}

module.exports = { crearVerificadorGoogle, ErrorGoogle, EMISORES };
