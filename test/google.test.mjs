// Verificación del ID token de Google, sin hablar con Google: firmamos tokens con una clave propia
// y le pasamos al verificador esa clave en lugar de las de Google.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { crearVerificadorGoogle, ErrorGoogle } = require("../backend/src/modules/auth/google");

const CLIENT_ID = "123-prueba.apps.googleusercontent.com";
const clave = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const otraClave = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = k => k.publicKey.export({ type: "spki", format: "pem" });
const certs = async () => ({ k1: pem(clave) });

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const ahora = () => Math.floor(Date.now() / 1000);
function firmar(datos = {}, { con = clave, header = {} } = {}) {
  const h = b64({ alg: "RS256", kid: "k1", typ: "JWT", ...header });
  const p = b64({
    iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "109876543210",
    email: "Maria@Gmail.com", email_verified: true, name: "María Gómez",
    iat: ahora(), exp: ahora() + 3600, ...datos
  });
  const firma = crypto.sign("RSA-SHA256", Buffer.from(h + "." + p), con.privateKey).toString("base64url");
  return `${h}.${p}.${firma}`;
}

const verificar = crearVerificadorGoogle({ clientId: CLIENT_ID, obtenerCerts: certs });
async function rechaza(token, codigo) {
  await assert.rejects(verificar(token), e => e instanceof ErrorGoogle && e.codigo === codigo);
}

test("acepta un token válido y devuelve sub, email en minúsculas y nombre", async () => {
  assert.deepEqual(await verificar(firmar()), { sub: "109876543210", email: "maria@gmail.com", nombre: "María Gómez" });
});

test("acepta el emisor sin https", async () => {
  assert.equal((await verificar(firmar({ iss: "accounts.google.com" }))).sub, "109876543210");
});

test("acepta email_verified como texto \"true\"", async () => {
  assert.equal((await verificar(firmar({ email_verified: "true" }))).email, "maria@gmail.com");
});

test("rechaza un token emitido para otra app (aud distinto)", () => rechaza(firmar({ aud: "otra-app.apps.googleusercontent.com" }), "token_invalido"));
test("rechaza un emisor que no es Google", () => rechaza(firmar({ iss: "https://accounts.falso.com" }), "token_invalido"));
test("rechaza un token vencido", () => rechaza(firmar({ iat: ahora() - 7200, exp: ahora() - 3600 }), "token_invalido"));
test("rechaza un token firmado con otra clave", () => rechaza(firmar({}, { con: otraClave }), "token_invalido"));
test("rechaza un token con kid desconocido", () => rechaza(firmar({}, { header: { kid: "k9" } }), "token_invalido"));

test("rechaza alg none (token sin firma)", async () => {
  const h = b64({ alg: "none", kid: "k1", typ: "JWT" });
  const p = b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "1", email: "a@b.com", email_verified: true, iat: ahora(), exp: ahora() + 3600 });
  await rechaza(`${h}.${p}.`, "token_invalido");
});

test("rechaza un token alterado después de firmado", async () => {
  const [h, , f] = firmar().split(".");
  const p = b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "999", email: "intruso@gmail.com", email_verified: true, iat: ahora(), exp: ahora() + 3600 });
  await rechaza(`${h}.${p}.${f}`, "token_invalido");
});

test("rechaza si Google no verificó el email", () => rechaza(firmar({ email_verified: false }), "email_no_verificado"));
test("rechaza si falta el email", () => rechaza(firmar({ email: undefined }), "datos_incompletos"));
test("rechaza texto que no es un token", () => rechaza("esto-no-es-un-jwt", "token_invalido"));
test("rechaza si no llega nada", () => rechaza(undefined, "token_ausente"));
test("rechaza un token demasiado largo", () => rechaza("a".repeat(9000), "token_ausente"));

test("sin GOOGLE_CLIENT_ID no acepta ningún token", async () => {
  const sinId = crearVerificadorGoogle({ clientId: "", obtenerCerts: certs });
  await assert.rejects(sinId(firmar()), e => e.codigo === "sin_client_id");
});

test("el mensaje para la persona es genérico y no incluye el email", async () => {
  await assert.rejects(verificar(firmar({ email_verified: false })), e => {
    assert.equal(e.message, "No pudimos verificar tu cuenta de Google. Probá de nuevo.");
    assert.ok(!e.message.includes("maria") && !String(e.detalle).includes("maria"));
    return true;
  });
});
