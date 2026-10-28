// Usuarios, contraseñas y sesiones, guardados como JSON en la carpeta de datos.
// - usuarios.json: la contraseña nunca está en texto (scrypt + sal).
// - sesiones.json: se guarda sha256(token), no el token que viaja en la cookie.
// Lo usan server.js y scripts/usuarios.mjs. Sin dependencias.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROLES = ["estudiante", "junior", "empresa"];
const DURACION_MS = 12 * 3600_000;
const VENTANA_MS = 60_000;
const MAX_FALLOS = 5;          // por usuario
const MAX_FALLOS_IP = 30;      // por IP: en un aula todos salen por la misma IP
const MIN_CLAVE = 8;
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // sin 0/O, 1/I/L
// Cuentas para probar la app. El servidor las crea solo si arranca sin ningún usuario.
// La clave es corta a propósito (fijarClave no pide mínimo): desactivalas antes de usar la app con gente real.
const CUENTAS_DEMO = [
  { usuario: "candidato-demo", rol: "estudiante", nombre: "Lucas Ferreyra", clave: "1234" },
  { usuario: "junior-demo", rol: "junior", nombre: "Camila Ruiz", clave: "1234" },
  { usuario: "empresa-demo", rol: "empresa", nombre: "Responsable MKT", clave: "1234" }
];

const normUsuario = u => String(u || "").trim().toLowerCase();
const sinAcentos = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const hashClave = (clave, sal) => crypto.scryptSync(String(clave), Buffer.from(sal, "hex"), 64).toString("hex");
const publico = u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, debeCambiar: Boolean(u.debeCambiar) });

function generarCodigo() {
  const g = () => Array.from({ length: 3 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
  return `${g()}-${g()}-${g()}`;
}

function leer(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function escribir(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = crearAuth;
module.exports.CUENTAS_DEMO = CUENTAS_DEMO;
function crearAuth(dataDir, { ahora = Date.now } = {}) {
  const FILE_U = path.join(dataDir, "usuarios.json");
  const FILE_S = path.join(dataDir, "sesiones.json");
  const fallos = { usuario: new Map(), ip: new Map() };

  const usuarios = () => { const l = leer(FILE_U, []); return Array.isArray(l) ? l : []; };
  const guardarUsuarios = l => escribir(FILE_U, l);
  function buscar(lista, usuario) {
    const u = lista.find(x => x.usuario === normUsuario(usuario));
    if (!u) throw new Error(`No existe el usuario "${normUsuario(usuario)}".`);
    return u;
  }
  function conClave(u, clave) {
    u.sal = crypto.randomBytes(16).toString("hex");
    u.hash = hashClave(clave, u.sal);
  }
  function claveCorrecta(u, clave) {
    if (!u || !u.sal || !u.hash) return false;
    const a = Buffer.from(hashClave(clave, u.sal), "hex"), b = Buffer.from(u.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // Sesiones: { [sha256(token)]: { usuarioId, creada, expira } }, sin las vencidas.
  function sesiones() {
    const s = leer(FILE_S, {});
    const vivas = {};
    if (s && typeof s === "object") for (const [k, v] of Object.entries(s)) if (v && v.expira > ahora()) vivas[k] = v;
    return vivas;
  }
  function cerrarSesionesDe(usuarioId, salvo) {
    const s = sesiones();
    for (const [k, v] of Object.entries(s)) if (v.usuarioId === usuarioId && k !== salvo) delete s[k];
    escribir(FILE_S, s);
  }

  // Límite de intentos: momentos de los fallos recientes por usuario y por IP.
  function recientes(mapa, clave) {
    const l = (mapa.get(clave) || []).filter(t => t > ahora() - VENTANA_MS);
    if (l.length) mapa.set(clave, l); else mapa.delete(clave);
    return l;
  }
  function bloqueo(usuario, ip) {
    const l = [[recientes(fallos.usuario, usuario), MAX_FALLOS], [recientes(fallos.ip, ip), MAX_FALLOS_IP]].find(([x, max]) => x.length >= max);
    if (l) return Math.max(1, Math.ceil((l[0][0] + VENTANA_MS - ahora()) / 1000));
    return 0;
  }
  function anotarFallo(usuario, ip) {
    for (const [mapa, k] of [[fallos.usuario, usuario], [fallos.ip, ip]]) mapa.set(k, [...recientes(mapa, k), ahora()]);
  }

  function usuarioDesdeNombre(nombre) {
    const palabras = sinAcentos(String(nombre || "")).toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
    if (!palabras.length) throw new Error("Falta el nombre.");
    const base = palabras.length > 1 ? palabras[0][0] + palabras[1] : palabras[0];
    const usados = new Set(usuarios().map(u => u.usuario));
    let n = 1, u = base;
    while (usados.has(u)) u = base + ++n;
    return u;
  }

  function crearUsuario({ rol, nombre, usuario } = {}) {
    if (!ROLES.includes(rol)) throw new Error(`El rol tiene que ser uno de: ${ROLES.join(", ")}.`);
    nombre = String(nombre || "").trim();
    if (!nombre) throw new Error("Falta el nombre.");
    const lista = usuarios();
    const u = usuario ? normUsuario(usuario) : usuarioDesdeNombre(nombre);
    if (!/^[a-z0-9._-]{2,40}$/.test(u)) throw new Error("El usuario solo puede tener letras, números, punto, guion y guion bajo (de 2 a 40).");
    if (lista.some(x => x.usuario === u)) throw new Error(`El usuario "${u}" ya existe.`);
    const codigo = generarCodigo();
    const nuevo = { id: "u_" + crypto.randomBytes(8).toString("hex"), usuario: u, nombre, rol, debeCambiar: true, activo: true, creado: new Date(ahora()).toISOString() };
    conClave(nuevo, codigo);
    lista.push(nuevo);
    guardarUsuarios(lista);
    return { usuario: u, codigo };
  }

  function fijarClave(usuario, clave, { debeCambiar = false } = {}) {
    const lista = usuarios(), u = buscar(lista, usuario);
    conClave(u, clave);
    u.debeCambiar = debeCambiar;
    guardarUsuarios(lista);
  }

  function resetear(usuario) {
    const codigo = generarCodigo();
    fijarClave(usuario, codigo, { debeCambiar: true });
    cerrarSesionesDe(buscar(usuarios(), usuario).id);
    return codigo;
  }

  function setActivo(usuario, activo) {
    const lista = usuarios(), u = buscar(lista, usuario);
    u.activo = Boolean(activo);
    guardarUsuarios(lista);
    if (!u.activo) cerrarSesionesDe(u.id);
  }

  function listar() {
    return usuarios().map(u => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo !== false, debeCambiar: Boolean(u.debeCambiar) }));
  }

  function ingresar(usuario, clave, ip) {
    const nu = normUsuario(usuario), dir = String(ip || "");
    const espera = bloqueo(nu, dir);
    if (espera) return { ok: false, status: 429, retryAfter: espera };
    const u = usuarios().find(x => x.usuario === nu && x.activo !== false);
    if (!u || !claveCorrecta(u, clave)) { anotarFallo(nu, dir); return { ok: false, status: 401 }; }
    fallos.usuario.delete(nu);
    const token = crypto.randomBytes(32).toString("base64url");
    const s = sesiones();
    s[sha256(token)] = { usuarioId: u.id, creada: ahora(), expira: ahora() + DURACION_MS };
    escribir(FILE_S, s);
    return { ok: true, token, usuario: publico(u) };
  }

  function datosDe(token) {
    if (typeof token !== "string" || !token) return null;
    const clave = sha256(token);
    const s = sesiones()[clave];
    if (!s) return null;
    const u = usuarios().find(x => x.id === s.usuarioId && x.activo !== false);
    return u ? { u, clave } : null;
  }

  function sesion(token) {
    const d = datosDe(token);
    return d ? publico(d.u) : null;
  }

  function salir(token) {
    if (typeof token !== "string" || !token) return;
    const s = sesiones();
    delete s[sha256(token)];
    escribir(FILE_S, s);
  }

  function cambiarClave(token, { actual, nueva } = {}) {
    const d = datosDe(token);
    if (!d) return { ok: false, status: 401, mensaje: "Tu sesión venció o no ingresaste. Volvé a ingresar." };
    if (!d.u.debeCambiar && !claveCorrecta(d.u, actual)) return { ok: false, status: 401, mensaje: "La contraseña actual no es correcta." };
    if (typeof nueva !== "string" || nueva.length < MIN_CLAVE) return { ok: false, status: 400, mensaje: `La contraseña nueva tiene que tener al menos ${MIN_CLAVE} caracteres.` };
    fijarClave(d.u.usuario, nueva);
    cerrarSesionesDe(d.u.id, d.clave);
    return { ok: true };
  }

  // Crea (o reinicia) las cuentas de prueba: clave conocida, activas y sin pedir cambio.
  function crearCuentasDemo() {
    const existentes = new Set(usuarios().map(u => u.usuario));
    for (const c of CUENTAS_DEMO) {
      if (!existentes.has(c.usuario)) crearUsuario({ rol: c.rol, nombre: c.nombre, usuario: c.usuario });
      fijarClave(c.usuario, c.clave);
      setActivo(c.usuario, true);
    }
  }
  const cuentasDemoActivas = () => listar().filter(u => u.activo && CUENTAS_DEMO.some(c => c.usuario === u.usuario));

  return { ROLES, CUENTAS_DEMO, crearCuentasDemo, cuentasDemoActivas, crearUsuario, usuarioDesdeNombre, fijarClave, resetear, setActivo, listar, ingresar, sesion, salir, cambiarClave };
}
