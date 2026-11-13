// Ingreso con Google de punta a punta: invitación → primer ingreso → vuelve otro día → no invitado.
// Sin Google real: los ID tokens se firman con una clave de prueba que el servidor recibe por
// GOOGLE_CERTS_PRUEBA. Necesita TEST_DATABASE_URL (Postgres); sin eso, se saltea.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startApp, pedir } from "./helpers.mjs";
import { migrar } from "../scripts/db.mjs";

import { URL_PRUEBA as URL_DB, motivoParaSaltear } from "./db-prueba.mjs";
const omitir = await motivoParaSaltear();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ESQUEMA = "prueba_" + crypto.randomBytes(4).toString("hex");
const CLIENT_ID = "123-prueba.apps.googleusercontent.com";
const JWT_SECRET = crypto.randomBytes(48).toString("base64url");
const MSG_SIN_ACCESO = /no tiene acceso a Tutoring/;

const clave = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const ahora = () => Math.floor(Date.now() / 1000);
function tokenGoogle({ sub, email, ...extra }) {
  const h = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const p = b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub, email, email_verified: true, name: extra.name || "Persona Prueba", iat: ahora(), exp: ahora() + 600, ...extra });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(h + "." + p), clave.privateKey).toString("base64url")}`;
}

describe("entrar con Google", { skip: omitir }, () => {
  let app, db, dirCerts;
  const envDb = () => ({ DATABASE_URL: URL_DB, DATABASE_SCHEMA: ESQUEMA });
  const invitar = (...args) => execFileSync(process.execPath, [path.join(RAIZ, "scripts", "invitar.mjs"), ...args],
    { cwd: RAIZ, env: { ...process.env, ...envDb(), APP_URL: "https://tutoring.com.ar" }, encoding: "utf8", stdio: "pipe" });
  const google = (credential, cookie = null) => pedir(app.base, "/api/auth/google", { method: "POST", json: { credential }, cookie });
  const cookieDe = r => (r.headers.get("set-cookie") || "").split(";")[0];

  before(async () => {
    await migrar({ databaseUrl: URL_DB, schema: ESQUEMA });
    db = new pg.Client({ connectionString: URL_DB });
    await db.connect();
    await db.query(`SET search_path TO "${ESQUEMA}", public`);
    dirCerts = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-certs-"));
    fs.writeFileSync(path.join(dirCerts, "certs.json"), JSON.stringify({ k1: clave.publicKey.export({ type: "spki", format: "pem" }) }));
    app = await startApp({ provider: "gemini", env: { ...envDb(), JWT_SECRET, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CERTS_PRUEBA: path.join(dirCerts, "certs.json") } });
  });
  after(async () => {
    if (app) await app.stop();
    if (db) { await db.query(`DROP SCHEMA IF EXISTS "${ESQUEMA}" CASCADE`); await db.end(); }
    if (dirCerts) fs.rmSync(dirCerts, { recursive: true, force: true });
  });

  test("/api/auth/config entrega el Client ID (es público) sin sesión", async () => {
    const r = await pedir(app.base, "/api/auth/config", { cookie: null });
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { google: { clientId: CLIENT_ID } });
  });

  test("el script invitar crea la empresa y la invitación, e imprime el link", () => {
    const salida = invitar("--empresa", "MKT Contact Center", "--email", "Maria@Gmail.com", "--rol", "estudiante");
    assert.match(salida, /Empresa nueva: MKT Contact Center/);
    assert.match(salida, /https:\/\/tutoring\.com\.ar\//);
    assert.match(salida, /maria@gmail\.com/);
  });

  test("el script rechaza un rol inválido y una segunda invitación pendiente", () => {
    assert.throws(() => invitar("--empresa", "MKT Contact Center", "--email", "x@gmail.com", "--rol", "admin"), e => /rol tiene que ser/.test(e.stderr));
    assert.throws(() => invitar("--empresa", "MKT Contact Center", "--email", "maria@gmail.com", "--rol", "junior"), e => /invitación pendiente/.test(e.stderr));
  });

  test("alguien sin invitación recibe 403 y no se guarda nada", async () => {
    const r = await google(tokenGoogle({ sub: "pedro-1", email: "pedro@gmail.com" }));
    assert.equal(r.status, 403);
    assert.match(r.cuerpo.error.message, MSG_SIN_ACCESO);
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal((await db.query("SELECT count(*)::int n FROM usuarios")).rows[0].n, 0);
    assert.ok(!app.log().includes("pedro@gmail.com"), "el email no tiene que quedar en el log");
  });

  test("un token falso recibe 401", async () => {
    const r = await google("esto-no-es-un-token");
    assert.equal(r.status, 401);
  });

  let cookieMaria, idMaria;
  test("María, invitada, entra la primera vez: se crea su usuario y se gasta la invitación", async () => {
    const r = await google(tokenGoogle({ sub: "maria-1", email: "maria@gmail.com", name: "María Gómez" }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { nombre: "María Gómez", rol: "estudiante", empresa: "MKT Contact Center" });
    const sc = r.headers.get("set-cookie");
    assert.match(sc, /^acceso=/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
    cookieMaria = cookieDe(r);
    const yo = await pedir(app.base, "/api/yo", { cookie: cookieMaria });
    assert.equal(yo.status, 200);
    assert.equal(yo.cuerpo.rol, "estudiante");
    assert.equal(yo.cuerpo.usuario, "maria@gmail.com");
    assert.equal(yo.cuerpo.metodo, "google");
    idMaria = yo.cuerpo.id;
    const inv = (await db.query("SELECT estado, usada_por FROM invitaciones WHERE email = 'maria@gmail.com'")).rows[0];
    assert.deepEqual(inv, { estado: "usada", usada_por: idMaria });
    assert.equal((await db.query("SELECT count(*)::int n FROM identidades_externas WHERE sub = 'maria-1'")).rows[0].n, 1);
  });

  test("con esa sesión usa la app (por ejemplo, la configuración)", async () => {
    assert.equal((await pedir(app.base, "/api/config", { cookie: cookieMaria })).status, 200);
  });

  test("María vuelve otro día (sin invitación): entra igual, es el mismo usuario", async () => {
    const r = await google(tokenGoogle({ sub: "maria-1", email: "maria@gmail.com" }));
    assert.equal(r.status, 200);
    const yo = await pedir(app.base, "/api/yo", { cookie: cookieDe(r) });
    assert.equal(yo.cuerpo.id, idMaria);
    assert.equal((await db.query("SELECT count(*)::int n FROM usuarios")).rows[0].n, 1);
  });

  test("otra cuenta de Google con el mismo email no entra como María", async () => {
    const r = await google(tokenGoogle({ sub: "otra-cuenta", email: "maria@gmail.com" }));
    assert.equal(r.status, 403);
  });

  test("un JWT alterado no sirve", async () => {
    const [k, v] = cookieMaria.split("=");
    const partes = v.split(".");
    const p = JSON.parse(Buffer.from(partes[1], "base64url"));
    p.sub = "00000000-0000-0000-0000-000000000000";
    const falso = `${k}=${partes[0]}.${Buffer.from(JSON.stringify(p)).toString("base64url")}.${partes[2]}`;
    assert.equal((await pedir(app.base, "/api/yo", { cookie: falso })).status, 401);
  });

  test("al subir token_version, la sesión de María deja de valer en el acto", async () => {
    await db.query("UPDATE usuarios SET token_version = token_version + 1 WHERE id = $1", [idMaria]);
    assert.equal((await pedir(app.base, "/api/yo", { cookie: cookieMaria })).status, 401);
    const r = await google(tokenGoogle({ sub: "maria-1", email: "maria@gmail.com" }));
    assert.equal(r.status, 200, "volviendo a entrar recibe una sesión nueva");
    cookieMaria = cookieDe(r);
  });

  test("una cuenta desactivada no entra ni usa su sesión", async () => {
    await db.query("UPDATE usuarios SET activo = false WHERE id = $1", [idMaria]);
    assert.equal((await pedir(app.base, "/api/yo", { cookie: cookieMaria })).status, 401);
    assert.equal((await google(tokenGoogle({ sub: "maria-1", email: "maria@gmail.com" }))).status, 403);
    await db.query("UPDATE usuarios SET activo = true WHERE id = $1", [idMaria]);
  });

  test("una invitación vencida no sirve", async () => {
    invitar("--empresa", "MKT Contact Center", "--email", "juan@gmail.com", "--rol", "junior");
    await db.query("UPDATE invitaciones SET creada_en = now() - interval '10 days', vence_en = now() - interval '1 day' WHERE email = 'juan@gmail.com'");
    assert.equal((await google(tokenGoogle({ sub: "juan-1", email: "juan@gmail.com" }))).status, 403);
  });

  test("salir borra la cookie de Google", async () => {
    const r = await pedir(app.base, "/api/logout", { method: "POST", cookie: cookieMaria });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /acceso=;/);
  });

  test("el login con contraseña sigue funcionando al lado", async () => {
    assert.equal((await pedir(app.base, "/api/yo")).status, 200);
  });
});
