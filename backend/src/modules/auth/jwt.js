// Nuestro JWT de sesión (no confundir con el ID token de Google, que se usa una vez y se descarta).
// Va en la cookie "acceso" (HttpOnly). Está FIRMADO, no cifrado: cualquiera puede leer lo que dice,
// así que no lleva datos personales. Lo que impide falsificarlo es el secreto JWT_SECRET.
const { SignJWT, jwtVerify } = require("jose");

const ALG = "HS256";            // fijo: nunca se acepta el algoritmo que diga el token
const EMISOR = "tutoring";
const DESTINO = "tutoring-web";
const DURACION_SEG = 12 * 60 * 60;
const MIN_SECRETO = 32;         // bytes: un secreto corto se puede adivinar probando

function crearJwt(secreto) {
  const clave = secreto ? new TextEncoder().encode(secreto) : null;
  const disponible = Boolean(clave && clave.length >= MIN_SECRETO);

  // usuarioId: uuid de Postgres. tv: token_version del usuario (si sube, este token deja de valer).
  async function firmar({ usuarioId, tokenVersion, metodo }) {
    if (!disponible) throw new Error("Falta JWT_SECRET (mínimo 32 caracteres) en el .env.");
    return new SignJWT({ tv: tokenVersion, metodo })
      .setProtectedHeader({ alg: ALG, typ: "JWT" })
      .setSubject(usuarioId)
      .setIssuer(EMISOR)
      .setAudience(DESTINO)
      .setIssuedAt()
      .setExpirationTime(`${DURACION_SEG}s`)
      .sign(clave);
  }

  // Devuelve { usuarioId, tokenVersion, metodo } o null si el token es inválido, vencido o ajeno.
  async function verificar(token) {
    if (!disponible || typeof token !== "string" || !token || token.length > 2048) return null;
    try {
      const { payload } = await jwtVerify(token, clave, { algorithms: [ALG], issuer: EMISOR, audience: DESTINO });
      if (typeof payload.sub !== "string" || !Number.isInteger(payload.tv)) return null;
      return { usuarioId: payload.sub, tokenVersion: payload.tv, metodo: payload.metodo || null };
    } catch (_) {
      return null;
    }
  }

  return { disponible, firmar, verificar, DURACION_SEG };
}

module.exports = { crearJwt, DURACION_SEG };
