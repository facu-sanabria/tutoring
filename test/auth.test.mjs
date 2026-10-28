/* Pruebas de auth.js: usuarios, contraseñas, sesiones y límite de intentos.
   No levantan el servidor: usan una carpeta temporal y un reloj falso. */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const crearAuth = require("../auth.js");

const CODIGO = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/;
const IP = "127.0.0.1";

let dir, reloj, auth;
const nuevo = () => crearAuth(dir, { ahora: () => reloj });
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutoring-auth-"));
  reloj = Date.UTC(2026, 9, 27, 12);
  auth = nuevo();
});

describe("usuarios", () => {
  test("crearUsuario devuelve un código inicial y no guarda la clave en texto", () => {
    const { usuario, codigo } = auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    assert.equal(usuario, "jperez");
    assert.match(codigo, CODIGO);
    const archivo = fs.readFileSync(path.join(dir, "usuarios.json"), "utf8");
    assert.ok(!archivo.includes(codigo));
    assert.ok(!/"clave"/.test(archivo));
  });

  test("usuarioDesdeNombre agrega un número si el usuario ya existe", () => {
    auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    assert.equal(auth.usuarioDesdeNombre("Juana Pereyra Ñandú"), "jpereyra");
    assert.equal(auth.crearUsuario({ rol: "junior", nombre: "José Pérez" }).usuario, "jperez2");
  });

  test("rechaza un rol inválido, un nombre vacío o un usuario repetido", () => {
    assert.throws(() => auth.crearUsuario({ rol: "jefe", nombre: "Ana" }), /rol/i);
    assert.throws(() => auth.crearUsuario({ rol: "junior", nombre: "  " }), /nombre/i);
    auth.crearUsuario({ rol: "junior", nombre: "Ana", usuario: "ana" });
    assert.throws(() => auth.crearUsuario({ rol: "junior", nombre: "Ana 2", usuario: "ANA" }), /ya existe/i);
  });

  test("listar no expone hash ni sal", () => {
    auth.crearUsuario({ rol: "empresa", nombre: "Responsable MKT" });
    const [u] = auth.listar();
    assert.deepEqual(Object.keys(u).sort(), ["activo", "debeCambiar", "nombre", "rol", "usuario"]);
  });
});

describe("ingreso", () => {
  test("con el código entra, con debeCambiar y un token de 43 caracteres", () => {
    const { codigo } = auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    const r = auth.ingresar("jperez", codigo, IP);
    assert.equal(r.ok, true);
    assert.equal(r.token.length, 43);
    assert.equal(r.usuario.debeCambiar, true);
    assert.equal(r.usuario.rol, "estudiante");
    assert.ok(!("hash" in r.usuario));
  });

  test("con clave incorrecta da 401", () => {
    auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    assert.equal(auth.ingresar("jperez", "otra", IP).status, 401);
    assert.equal(auth.ingresar("nadie", "otra", IP).status, 401);
  });

  test("normaliza mayúsculas y espacios del usuario", () => {
    const { codigo } = auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    assert.equal(auth.ingresar(" JPerez ", codigo, IP).ok, true);
  });

  test("después de 5 intentos fallidos da 429 aun con la clave correcta, y al minuto vuelve a andar", () => {
    const { codigo } = auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    for (let i = 0; i < 5; i++) assert.equal(auth.ingresar("jperez", "mal", "10.0.0." + i).status, 401);
    const bloqueado = auth.ingresar("jperez", codigo, "10.0.0.9");
    assert.equal(bloqueado.status, 429);
    assert.ok(bloqueado.retryAfter > 0 && bloqueado.retryAfter <= 60);
    reloj += 61_000;
    assert.equal(auth.ingresar("jperez", codigo, "10.0.0.9").ok, true);
  });

  test("30 fallos desde una IP con usuarios distintos bloquean esa IP; 5 no (aula detrás de una sola IP)", () => {
    for (let i = 0; i < 5; i++) auth.ingresar("nadie" + i, "mal", IP);
    assert.equal(auth.ingresar("otro", "mal", IP).status, 401);
    for (let i = 6; i < 30; i++) auth.ingresar("nadie" + i, "mal", IP);
    assert.equal(auth.ingresar("otro", "mal", IP).status, 429);
  });

  test("un usuario desactivado no entra y pierde sus sesiones", () => {
    auth.crearUsuario({ rol: "junior", nombre: "Ana", usuario: "ana" });
    auth.fijarClave("ana", "clave-de-ana");
    const { token } = auth.ingresar("ana", "clave-de-ana", IP);
    auth.setActivo("ana", false);
    assert.equal(auth.sesion(token), null);
    assert.equal(auth.ingresar("ana", "clave-de-ana", IP).status, 401);
    auth.setActivo("ana", true);
    assert.equal(auth.ingresar("ana", "clave-de-ana", IP).ok, true);
  });

  test("usuarios.json con basura: nadie entra y no se lanza ningún error", () => {
    fs.writeFileSync(path.join(dir, "usuarios.json"), "{esto no es json");
    assert.equal(nuevo().ingresar("jperez", "x", IP).status, 401);
  });
});

describe("sesiones", () => {
  let token;
  beforeEach(() => {
    auth.crearUsuario({ rol: "empresa", nombre: "Responsable", usuario: "resp" });
    auth.fijarClave("resp", "clave-segura");
    token = auth.ingresar("resp", "clave-segura", IP).token;
  });

  test("sesion devuelve el usuario y vence a las 12 horas", () => {
    assert.equal(auth.sesion(token).usuario, "resp");
    reloj += 12 * 3600_000 + 1;
    assert.equal(auth.sesion(token), null);
  });

  test("salir cierra la sesión", () => {
    auth.salir(token);
    assert.equal(auth.sesion(token), null);
  });

  test("sesiones.json no guarda el token", () => {
    assert.ok(!fs.readFileSync(path.join(dir, "sesiones.json"), "utf8").includes(token));
  });

  test("la sesión sobrevive a un reinicio (nuevo crearAuth sobre la misma carpeta)", () => {
    assert.equal(nuevo().sesion(token).usuario, "resp");
  });

  test("un token inventado o vacío no es una sesión", () => {
    assert.equal(auth.sesion("x".repeat(43)), null);
    assert.equal(auth.sesion(""), null);
    assert.equal(auth.sesion(undefined), null);
  });
});

describe("cambiarClave", () => {
  test("en el primer ingreso no pide la actual y deja de pedir el cambio", () => {
    const { codigo } = auth.crearUsuario({ rol: "estudiante", nombre: "Juan Pérez" });
    const { token } = auth.ingresar("jperez", codigo, IP);
    assert.deepEqual(auth.cambiarClave(token, { nueva: "mi-clave-nueva" }), { ok: true });
    assert.equal(auth.sesion(token).debeCambiar, false);
    assert.equal(auth.ingresar("jperez", codigo, IP).status, 401);
    assert.equal(auth.ingresar("jperez", "mi-clave-nueva", IP).ok, true);
  });

  test("sin debeCambiar exige la actual; la nueva necesita 8 caracteres", () => {
    auth.crearUsuario({ rol: "junior", nombre: "Ana", usuario: "ana" });
    auth.fijarClave("ana", "clave-de-ana");
    const { token } = auth.ingresar("ana", "clave-de-ana", IP);
    assert.equal(auth.cambiarClave(token, { actual: "otra", nueva: "nueva-clave" }).status, 401);
    const corta = auth.cambiarClave(token, { actual: "clave-de-ana", nueva: "1234567" });
    assert.equal(corta.status, 400);
    assert.match(corta.mensaje, /8 caracteres/);
  });

  test("cierra las otras sesiones del usuario pero no la actual", () => {
    auth.crearUsuario({ rol: "junior", nombre: "Ana", usuario: "ana" });
    auth.fijarClave("ana", "clave-de-ana");
    const a = auth.ingresar("ana", "clave-de-ana", IP).token;
    const b = auth.ingresar("ana", "clave-de-ana", IP).token;
    assert.equal(auth.cambiarClave(a, { actual: "clave-de-ana", nueva: "otra-clave-1" }).ok, true);
    assert.ok(auth.sesion(a));
    assert.equal(auth.sesion(b), null);
  });

  test("resetear da un código nuevo, pide cambio y cierra sesiones", () => {
    auth.crearUsuario({ rol: "junior", nombre: "Ana", usuario: "ana" });
    auth.fijarClave("ana", "clave-de-ana");
    const t = auth.ingresar("ana", "clave-de-ana", IP).token;
    const codigo = auth.resetear("ana");
    assert.match(codigo, CODIGO);
    assert.equal(auth.sesion(t), null);
    assert.equal(auth.ingresar("ana", codigo, IP).usuario.debeCambiar, true);
  });
});

describe("npm run usuarios (scripts/usuarios.mjs)", () => {
  const SCRIPT = fileURLToPath(new URL("../scripts/usuarios.mjs", import.meta.url));
  const correr = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, DATA_DIR: dir }, encoding: "utf8" });
    return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
  };

  test("crear imprime el usuario y un código que sirve para entrar", () => {
    const r = correr("crear", "--rol", "junior", "--nombre", "Ana Gómez");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /agomez/);
    const codigo = r.out.match(/[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}/)[0];
    assert.equal(nuevo().ingresar("agomez", codigo, IP).ok, true);
  });

  test("demo crea las tres cuentas con claves conocidas y sin pedir cambio", () => {
    assert.equal(correr("demo").code, 0);
    for (const [u, rol] of [["candidato-demo", "estudiante"], ["junior-demo", "junior"], ["empresa-demo", "empresa"]]) {
      const r = nuevo().ingresar(u, "1234", IP);
      assert.equal(r.ok, true, u);
      assert.equal(r.usuario.rol, rol);
      assert.equal(r.usuario.debeCambiar, false);
    }
    assert.equal(correr("demo").code, 0, "se puede correr dos veces");
  });

  test("un rol inválido o un comando desconocido terminan con error en español", () => {
    const r = correr("crear", "--rol", "jefe", "--nombre", "X");
    assert.notEqual(r.code, 0);
    assert.match(r.out, /rol tiene que ser/);
    const h = correr("cualquiera");
    assert.equal(h.code, 1);
    assert.match(h.out, /Uso/);
  });

  test("listar, resetear y desactivar", () => {
    correr("crear", "--rol", "estudiante", "--nombre", "Juan Pérez");
    assert.match(correr("listar").out, /jperez.*Juan Pérez.*estudiante/);
    const r = correr("resetear", "jperez");
    assert.equal(r.code, 0);
    assert.match(r.out, /[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}/);
    assert.equal(correr("desactivar", "jperez").code, 0);
    assert.equal(nuevo().listar()[0].activo, false);
    assert.notEqual(correr("resetear", "nadie").code, 0);
  });
});
