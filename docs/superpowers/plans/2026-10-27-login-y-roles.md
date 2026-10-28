# Login y roles: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que nadie pueda usar la app sin sesión y que cada usuario vea la pantalla de su rol (estudiante, junior o empresa), listo para la demo con MKT del 2026-10-30.

**Arquitectura:**
- Un módulo nuevo, `auth.js` (CommonJS, sin dependencias), maneja usuarios, contraseñas (scrypt), sesiones y el límite de intentos sobre archivos JSON en `DATA_DIR`. Lo usan el servidor y el script de consola.
- `server.js` revisa la cookie `sesion` antes de cualquier ruta `/api/*` y controla el rol de cada ruta.
- El frontend arranca con `/api/yo` y elige entre la pantalla de ingreso, la de crear contraseña o la pantalla inicial del rol.

**Tecnologías:** Node ≥ 18 (`crypto.scrypt`, `crypto.timingSafeEqual`, `node:test`), JS plano en `public/` y Playwright para los tests e2e.

**Especificación:** `docs/superpowers/specs/2026-10-27-login-y-roles-design.md`

## Restricciones generales

- Sin dependencias nuevas.
- Textos visibles, comentarios y mensajes de error en español rioplatense.
- Mensajes exactos:
  - `401`: "Tu sesión venció o no ingresaste. Volvé a ingresar."
  - `403`: "No tenés permiso para hacer esto."
  - Si todavía tiene que crear su contraseña: "Primero creá tu contraseña."
  - `429`: "Probaste muchas veces. Esperá un minuto y volvé a intentar."
  - Ingreso fallido: "Usuario o contraseña incorrectos."
- Cookie: `sesion=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`, y `Secure` solo si el pedido es HTTPS.
- Sesión de 12 horas. Límite de intentos: 5 fallidos en 60 segundos, por usuario o por IP. Contraseña de 8 caracteres como mínimo.
- Código inicial: `XXX-XXX-XXX` con el alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Roles: `estudiante`, `junior` y `empresa`. En pantalla se muestran como "Candidato", "Junior" y "Empresa".
- `data/usuarios.json`, `data/sesiones.json` y `data/llave-local.txt` quedan fuera de git.
- No se agregan variables de entorno.

**Agregado a la especificación (se encontró al escribir el plan):** `npm run chequeo`, `npm run probar-ia` y `evals/puente.mjs` llaman a la API sin navegador. Como el servidor escucha solo en `127.0.0.1`, la IP no alcanza para reconocerlos. Por eso, al arrancar, el servidor escribe una **llave local** aleatoria en `DATA_DIR/llave-local.txt`, y los scripts la mandan en el encabezado `x-llave-local`. Con esa llave tienen permisos de empresa. Solo puede leer el archivo quien tiene acceso al disco, que es el mismo que ya puede leer el `.env`.

## Puntos a revisar con atención

1. **Cookie de otra ventana `*.localhost`:** cada subdominio tiene que tener su propia sesión. Se comprueba a mano en la Tarea 7 antes de escribir la guía.
2. **Llamada en curso cuando vence la sesión:** el `401` del token de voz o de `/api/messages` tiene que cortar la llamada y llevar a la pantalla de ingreso, no dejar la pantalla colgada. Lo cubre un test en la Tarea 6.
3. **`usuarios.json` corrupto o inexistente:** el servidor no se cae, nadie puede ingresar y se ve un aviso en la consola. Lo cubre un test en la Tarea 1.
4. **Mayúsculas y espacios en el usuario** (`" JPerez "`): se normaliza al ingresar. Lo cubre un test en la Tarea 1.
5. **Dos ventanas del mismo usuario y cambio de contraseña:** la otra sesión deja de valer y la sesión actual sigue. Lo cubre un test en la Tarea 3.

---

### Tarea 1: el módulo `auth.js`

**Archivos:**
- Crear: `auth.js`
- Test: `test/auth.test.mjs` (unitario, sin servidor)
- Modificar: `.gitignore` (agregar `data/llave-local.txt`) y la línea `test` de `package.json` (agregar `test/auth.test.mjs` y `test/auth-rutas.test.mjs`)

**Interfaces que produce** (`module.exports = crearAuth`):
```
crearAuth(dataDir: string, { ahora = Date.now } = {}) -> {
  ROLES: ["estudiante","junior","empresa"],
  crearUsuario({ rol, nombre, usuario? }) -> { usuario, codigo }     // codigo = clave inicial, debeCambiar: true
  usuarioDesdeNombre(nombre) -> string                                 // "Juan Pérez" -> "jperez" (+2, +3... si existe)
  fijarClave(usuario, clave, { debeCambiar = false }) -> void
  resetear(usuario) -> codigo                                          // debeCambiar: true y cierra sus sesiones
  setActivo(usuario, bool) -> void                                     // al desactivar, cierra sus sesiones
  listar() -> [{ usuario, nombre, rol, activo, debeCambiar }]
  ingresar(usuario, clave, ip) -> { ok: true, token, usuario: publico } | { ok: false, status: 401|429, retryAfter? }
  sesion(token) -> publico | null                                      // publico = { id, usuario, nombre, rol, debeCambiar }
  salir(token) -> void
  cambiarClave(token, { actual, nueva }) -> { ok: true } | { ok: false, status: 400|401, mensaje }
}
```
Todos los errores de validación se lanzan como `Error` con un mensaje en español. Los usuarios se escriben en `usuarios.json` y las sesiones en `sesiones.json`, con la clave `sha256(token)` en hex.

- [ ] **Paso 1: tests que fallan** en `test/auth.test.mjs`, con `crearAuth(tmpdir)` y un reloj falso:
  - `crearUsuario` devuelve un código que cumple `/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/`. En el archivo no aparece ni el código ni la palabra "clave".
  - `usuarioDesdeNombre("Juan Pérez")` da `"jperez"`, y la segunda vez da `"jperez2"`.
  - Un rol inválido o un nombre vacío lanzan un error.
  - `ingresar` con el código da `ok`, con `debeCambiar: true` y un token de 43 caracteres. Con una clave incorrecta da `status: 401`.
  - `ingresar(" JPerez ", ...)` funciona igual que con `"jperez"`.
  - Cinco intentos fallidos dan `429`, incluso con la clave correcta. Después de avanzar el reloj 61 segundos, vuelve a dar `ok`.
  - Con el mismo IP y cinco usuarios distintos inexistentes, el sexto intento da `429`.
  - `sesion(token)` devuelve el usuario. Después de 12 horas y 1 milisegundo da `null`. Después de `salir`, da `null`.
  - `sesiones.json` no contiene el token en texto.
  - `cambiarClave` con `debeCambiar` funciona sin `actual`. Sin `debeCambiar` y con una `actual` incorrecta da `401`. Una `nueva` de 7 caracteres da `400`. Después de cambiarla, la sesión que hizo el cambio sigue valiendo y las otras no.
  - `setActivo(u, false)`: `ingresar` da `401` y sus sesiones dan `null`.
  - Si `usuarios.json` tiene basura, `ingresar` da `401` sin lanzar errores.
  - Un `crearAuth` nuevo sobre la misma carpeta sigue reconociendo el token (equivale a reiniciar el servidor).
- [ ] **Paso 2:** correr `node --test test/auth.test.mjs`. Resultado esperado: FALLA porque no existe `auth.js`.
- [ ] **Paso 3:** implementar `auth.js`.
  - Contraseñas: `scryptSync(clave, sal, 64)` y `timingSafeEqual`.
  - Tokens: `randomBytes(32).toString("base64url")`.
  - Códigos: `crypto.randomInt` sobre el alfabeto.
  - Límite de intentos: en memoria, con dos `Map` (por usuario y por IP) que guardan los momentos de los fallos y se limpian después de 60 segundos.
  - Al leer y al escribir las sesiones se borran las vencidas.
- [ ] **Paso 4:** correr `node --test test/auth.test.mjs`. Resultado esperado: PASA.
- [ ] **Paso 5:** commit "auth.js: usuarios, contraseñas y sesiones en archivos JSON".

### Tarea 2: el script de consola `npm run usuarios`

**Archivos:**
- Crear: `scripts/usuarios.mjs`
- Modificar: `package.json` (`"usuarios": "node scripts/usuarios.mjs"`)
- Test: un bloque en `test/auth.test.mjs` que ejecuta el script con `spawnSync` y `DATA_DIR` temporal

**Usa:** `crearAuth` de la Tarea 1, cargado con `createRequire`. La carpeta de datos es `path.resolve(RAIZ, process.env.DATA_DIR || "data")`, la misma regla que usa `server.js`. El script lee el `.env` igual que el servidor, solo para tomar `DATA_DIR`.

**Comandos:**
- `crear --rol R --nombre "N" [--usuario U]` imprime `usuario` y `código inicial`.
- `listar` muestra una tabla.
- `resetear U` imprime el código nuevo.
- `desactivar U` y `activar U`.
- `demo` crea o reinicia las cuentas:

  | Usuario | Rol | Nombre | Contraseña |
  |---|---|---|---|
  | `candidato` | estudiante | Lucas Ferreyra | `demo-candidato` |
  | `junior` | junior | Camila Ruiz | `demo-junior` |
  | `empresa` | empresa | Responsable MKT | `demo-empresa` |

  Las tres quedan con `debeCambiar: false`.
- Un comando desconocido muestra la ayuda y termina con código 1.

- [ ] **Paso 1: tests que fallan.**
  - `crear --rol junior --nombre "Ana Gómez"` termina con código 0. La salida contiene `agomez` y un código válido, y `crearAuth(dir).ingresar("agomez", código)` da `ok`.
  - Después de `demo`, `ingresar("empresa", "demo-empresa")` da `ok` con `debeCambiar: false`.
  - `crear --rol jefe` termina con código distinto de 0 y un mensaje en español.
- [ ] **Paso 2:** correrlos. Resultado esperado: FALLAN.
- [ ] **Paso 3:** implementar `scripts/usuarios.mjs`.
- [ ] **Paso 4:** correrlos. Resultado esperado: PASAN.
- [ ] **Paso 5:** commit "npm run usuarios: crear, listar, resetear y cuentas de demo".

### Tarea 3: sesión en el servidor y rutas de ingreso

**Archivos:**
- Modificar: `server.js`
  - Cerca de `DATA`: `const auth = require("./auth")(DATA)` y la llave local.
  - Al principio de `handleApi`: el control de sesión y de origen.
  - Rutas nuevas.
- Modificar: `test/helpers.mjs`
- Crear: `test/auth-rutas.test.mjs`

**Interfaces:**
- **En `server.js`:**
  - `usuarioDe(req) -> publico | {rol:"empresa", local:true} | null`. Lee la cookie `sesion` o el encabezado `x-llave-local`.
  - `exigir(res, u, roles?) -> boolean`. Responde `401` o `403` y devuelve `false` si no alcanza.
- **Rutas nuevas:** `POST /api/login`, `POST /api/logout`, `GET /api/yo` y `POST /api/contrasena`, con las respuestas de la especificación. El `429` lleva el encabezado `Retry-After`.
- **Orden de controles en `handleApi`:**
  1. `/api/chequeo/*` sigue igual y sin sesión.
  2. Origen: si hay `Origin` y su host no coincide con `req.headers.host` en un `POST`, `PUT` o `DELETE`, responde `403`.
  3. `/api/login` pasa.
  4. Cualquier otra ruta exige sesión.
  5. Si `debeCambiar` está en `true`, solo pasan `yo`, `contrasena` y `logout`.
- **`test/helpers.mjs`:**
  - `startApp` siembra, antes de levantar el servidor, `estudiante1` (Lucas Ferreyra), `estudiante2` (Ana Paz), `junior1` (Camila Ruiz) y `empresa1` (Responsable), todos con clave `clave-de-prueba` y sin `debeCambiar`. Para eso usa `crearAuth(dataDir)`.
  - Después ingresa como `empresa1`. `app.cookie` guarda el valor `sesion=…`, y `app.ingresar(usuario) -> cookie` sirve para ingresar como otro.
  - `pedir` y `pedirMensajes` mandan por defecto la cookie de la última `startApp` para esa `base` (con un `Map` de `base` a cookie). Si se pasa `opts.cookie: null`, el pedido va sin sesión. Así los tests que ya existen no cambian.

- [ ] **Paso 1: tests que fallan** en `test/auth-rutas.test.mjs`:
  - Sin cookie, `GET /api/config`, `POST /api/messages`, `POST /api/voz/token`, `GET /api/empresa`, `GET /api/informes` y `GET /api/yo` dan `401` con el mensaje exacto.
  - `GET /` y `GET /js/app.js` dan `200` sin cookie.
  - `POST /api/login` con una clave incorrecta da `401` "Usuario o contraseña incorrectos.". Con la clave correcta da `200` y `set-cookie`, que contiene `HttpOnly`, `SameSite=Lax`, `Max-Age=43200` y no `Secure`.
  - `GET /api/yo` con esa cookie devuelve `{usuario:"estudiante1", rol:"estudiante", nombre:"Lucas Ferreyra"}`.
  - Seis intentos fallidos dan `429` con `Retry-After`.
  - Con un usuario creado con `debeCambiar: true` (sembrado con `crearUsuario` antes de arrancar, en un `startApp` propio o con `auth` sobre `app.dataDir`), `GET /api/config` da `403` "Primero creá tu contraseña.". `POST /api/contrasena {nueva:"otra-clave-1"}` da `200`, y después `GET /api/config` da `200`.
  - Dos ingresos del mismo usuario (A y B): A cambia la contraseña, B pasa a dar `401` y A sigue dando `200`.
  - `POST /api/logout` y después `GET /api/yo` dan `401`.
  - `PUT /api/empresa` con `Origin: http://otro.com` da `403`. Con `Origin` igual al host da `200`.
  - Con `x-llave-local` (el contenido de `app.dataDir/llave-local.txt`) y sin cookie, `GET /api/diagnostico` da `200`. Con una llave incorrecta da `401`.
- [ ] **Paso 2:** correr `node --test test/auth-rutas.test.mjs`. Resultado esperado: FALLA.
- [ ] **Paso 3:** implementar los controles y las rutas en `server.js`, y las modificaciones de `test/helpers.mjs`.
- [ ] **Paso 4:** correr `npm test`. Resultado esperado: PASAN todos los tests, los nuevos y los que ya existían.
- [ ] **Paso 5:** commit "Servidor: sesión obligatoria, rutas de ingreso y llave local para scripts".

### Tarea 4: permisos por rol e informes por usuario

**Archivos:** `server.js` (rutas `/api/diagnostico`, `/api/empresa`, `/api/informes` y `/api/informes/:id`) y `test/auth-rutas.test.mjs`.

**Usa:** `usuarioDe` y `exigir` de la Tarea 3, y `app.ingresar` de los helpers.

- [ ] **Paso 1: tests que fallan.**
  - Como `estudiante1` y como `junior1`: `GET /api/diagnostico`, `PUT /api/empresa` y `DELETE /api/informes/:id` dan `403`. `GET /api/empresa`, `GET /api/config` y `POST /api/messages` dan `200`.
  - Como `estudiante1`: un `POST /api/informes` con `candidato:"Otro Nombre"` se guarda con `candidato:"Lucas Ferreyra"` y el `usuarioId` de `estudiante1`.
  - Como `estudiante2`: `GET /api/informes` no incluye ese informe. `GET /api/informes/:id` de ese informe da `403`.
  - Como `empresa1`: la lista lo incluye y lo puede borrar.
  - Un informe escrito a mano en `app.dataDir/informes` sin `usuarioId` solo aparece para `empresa1`.
- [ ] **Paso 2:** correrlos. Resultado esperado: FALLAN.
- [ ] **Paso 3:** implementarlo. En la lista y en `GET :id`, si el rol no es `empresa`, se filtra por `r.usuarioId === u.id`. El `POST` pisa `candidato` y `usuarioId` con los datos de la sesión. Con la llave local, el `POST` mantiene el `candidato` que viene en el pedido.
- [ ] **Paso 4:** correr `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5:** commit "Permisos por rol: informes solo del dueño; configuración y diagnóstico solo para la empresa".

### Tarea 5: scripts locales y demo sin internet

**Archivos:**
- `test/chequeo.mjs`, `test/probar-ia.mjs` y `evals/puente.mjs`: agregan `x-llave-local` a sus `fetch`, leído de `path.resolve(RAIZ, process.env.DATA_DIR || "data", "llave-local.txt")`. Si el archivo no está, avisan con el mensaje "Levantá el servidor primero (npm start): falta data/llave-local.txt."
- `test/demo-offline.mjs`: después de crear `dataDir`, crea las tres cuentas de demo con `crearAuth` (mismas claves que la Tarea 2) y las imprime en la consola.

- [ ] **Paso 1:** implementarlo.
- [ ] **Paso 2:** verificar. `npm run demo` levanta el servidor. `curl -s -X POST localhost:3200/api/login -H "content-type: application/json" -d '{"usuario":"empresa","clave":"demo-empresa"}'` tiene que dar `200`. `npm run probar-ia` contra ese servidor no tiene que dar `401`.
- [ ] **Paso 3:** commit "Scripts locales con llave local; npm run demo crea las cuentas de demo".

### Tarea 6: el frontend (ingreso, crear contraseña, rol y salida)

**Archivos:**
- `public/js/api.js`
- `public/js/app.js`
- `public/index.html`: quitar `.seg` y convertir `.me` en un botón con menú
- `public/css/styles.css`
- Test: `test/e2e.test.mjs`, `test/evaluation-browser.test.mjs` y `test/voz-gemini.test.mjs`

**Interfaces:**
- **`T.api.auth`:** `{ yo(), ingresar(usuario, clave), salir(), cambiarClave({actual?, nueva}) }`.
- **`T.api.onSinSesion(fn)`:** `jsonReq` y `claude` la llaman ante cualquier `401` que venga del servidor de Tutoring, salvo en `/api/login`.
- **En `app.js`:**
  - `S.usuario` (lo que devuelve `/api/yo`).
  - `S.profile = S.usuario.rol`.
  - `S.candidato = S.usuario.nombre`.
  - `const k = n => "tutoring." + S.usuario.id + "." + n` para las claves `candidato`, `junior` y `voice`. `J` se carga después del ingreso, no al cargar el archivo.
  - Vistas nuevas: `VIEWS.login`, `VIEWS.nuevaClave` y `VIEWS.cuenta`. Las dos primeras se dibujan sin barra lateral, con `body.classList.add("sin-sesion")`.
  - `JUNIOR` deja de ser fijo: es `{ name: S.usuario.nombre, role: "Junior" }`.
  - Se quitan `setProfile` y el campo `#candidato`.
- **CSS:** `body[data-rol="junior"]` y `body[data-rol="empresa"]` redefinen `--lav`, `--lav-2`, `--lav-soft` y `--lav-ink`: azul para junior y verde para empresa. Estudiante mantiene el lavanda.

- [ ] **Paso 1: tests e2e que fallan.**
  - Abrir `app.base`: se ve el formulario de ingreso (`#loginUsuario`, `#loginClave`).
  - Una clave incorrecta muestra "Usuario o contraseña incorrectos.".
  - Ingresar como `estudiante1` lleva a "Simulaciones por voz" y `.me` muestra "Lucas Ferreyra" y "Candidato". No existe `.seg` ni `#candidato`.
  - El recorrido de llamada que ya existía guarda un informe con `candidato` igual a "Lucas Ferreyra".
  - "Salir" vuelve al formulario.
  - Como `junior1` se ve "Mentor del equipo". Como `empresa1` se ve "Informes de candidatos".
  - Un usuario con `debeCambiar` ve "Creá tu contraseña" y después de crearla llega a su pantalla.
  - Si la sesión se borra a mitad del uso (`POST /api/logout` con la cookie del contexto desde `page.request`) y se toca una acción, se ve el formulario con "Tu sesión venció. Volvé a ingresar.".
  - En `evaluation-browser` y `voz-gemini`, el paso de cambiar de perfil se reemplaza por un ingreso con un helper `ingresarEn(page, usuario)`.
- [ ] **Paso 2:** correr `npm run test:e2e`. Resultado esperado: FALLA.
- [ ] **Paso 3:** implementarlo. El arranque llama a `/api/yo`: con `401` muestra `login`; con `debeCambiar` muestra `nuevaClave`; si no, carga la configuración y los informes y va a la pantalla inicial del rol (estudiante → `sims`, junior → `chat`, empresa → `informes`). `onSinSesion` corta la llamada (`endCallSilently`), limpia `S.usuario` y muestra el aviso.
- [ ] **Paso 4:** correr `npm test && npm run test:e2e`. Resultado esperado: PASAN.
- [ ] **Paso 5:** commit "Interfaz: ingreso, crear contraseña, pantalla por rol y salir".

### Tarea 7: guía de la demo y documentación

**Archivos:**
- Crear: `GUIA-DEMO.md`
- Modificar: `CLAUDE.md` (comandos, arquitectura y bitácora) y `LEEME.md` (sección "Usuarios y acceso")

- [ ] **Paso 1:** comprobación manual. Con `npm start` y las cuentas de `npm run usuarios -- demo`, abrir `http://candidato.localhost:3000`, `http://junior.localhost:3000` y `http://empresa.localhost:3000` en Chrome. Cada una tiene que mantener su propia sesión. Si `*.localhost` no llega a `127.0.0.1`, la alternativa es documentar tres perfiles del navegador o una ventana de incógnito.
- [ ] **Paso 2:** escribir `GUIA-DEMO.md`:
  - Preparación: `npm install`, `.env`, `npm run usuarios -- demo` y `npm run chequeo -- --rapido`.
  - Cómo levantar el servidor.
  - Una tabla con ventana, dirección, usuario y contraseña.
  - El guion de qué mostrar en cada ventana.
  - El momento "crear un escenario en vivo".
  - Qué hacer si algo falla.
- [ ] **Paso 3:** actualizar `CLAUDE.md` y `LEEME.md`.
- [ ] **Paso 4:** commit "Guía de la demo y documentación de usuarios y acceso".

### Tarea 8 (opcional, si sobra tiempo): vista previa como candidato

**Archivos:** `public/js/app.js` (botón en `VIEWS.escenarios`, `S.preview`, franja en `brief`, `call` y `report`, sin `POST` en `runEvaluation` si `S.preview`) y `test/e2e.test.mjs`.

- [ ] **Paso 1:** test e2e: como `empresa1`, "Probar como candidato" muestra la franja "Vista previa: este informe no se guarda". Al terminar, `GET /api/informes` no cambió.
- [ ] **Paso 2:** implementarlo, correr `npm run test:e2e` y hacer commit.
