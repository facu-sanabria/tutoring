# Login y roles — diseño

Fecha: 2026-10-27 · Rama: `feat/login-roles` · Para: demo con MKT Contact Center (viernes 2026-10-30)

## Objetivo

Que nadie pueda usar la app sin iniciar sesión y que cada usuario vea la pantalla de su rol. En la demo se abren tres ventanas, una por rol (candidato, junior y empresa), y se ve el recorrido completo de cada uno.

**Criterio de éxito:** alguien entra con un código inicial, crea su contraseña y ve *su* pantalla. La empresa ve a todos los candidatos y sus informes. Sin sesión no se puede usar nada: ni la IA, ni la voz, ni los informes, ni la configuración.

## Decisiones tomadas

- **Tres roles:** `estudiante` (se muestra como "Candidato"), `junior` y `empresa`. Cada usuario tiene un solo rol.
- **Una sola empresa por instalación.** Se mantiene `data/empresa.json`.
- **Una cuenta por persona.** RRHH, el gerente o el jefe tienen cada uno su usuario con rol `empresa`, no una cuenta compartida. Así queda registrado quién hizo qué, se puede dar de baja a una sola persona y, más adelante, cada uno conecta sus propias herramientas por MCP.
- **Las cuentas se crean por consola** (`npm run usuarios`). La pantalla de administración web queda para después.
- **La sesión va en una cookie `HttpOnly`** (enfoque A). Para la demo con tres ventanas se usan `candidato.localhost`, `junior.localhost` y `empresa.localhost`, que tienen cookies separadas.
- **Identidad:** el código inicial se entrega en persona o al WhatsApp que la persona registró, y en el primer ingreso es obligatorio crear una contraseña. Las evaluaciones que tienen consecuencias se hacen en una sesión supervisada; eso es una regla del programa, no del sistema.

## 1. Usuarios, contraseñas y sesión

### `data/usuarios.json` (o en `DATA_DIR`)

```json
[{ "id": "u_…", "usuario": "jperez", "nombre": "Juan Pérez", "rol": "estudiante",
   "sal": "<hex 16 bytes>", "hash": "<hex 64 bytes>", "debeCambiar": true,
   "activo": true, "creado": "2026-10-27T…Z" }]
```

- `usuario` se guarda en minúsculas y no se puede repetir.
- La contraseña se protege con `crypto.scrypt(clave, sal, 64)`, con los parámetros por defecto de Node, y se compara con `crypto.timingSafeEqual`. No hay dependencias nuevas.
- **Código inicial:** tres grupos de tres caracteres (`K7M-Q2P-9XD`), generados con `crypto.randomInt`. El alfabeto excluye los caracteres que se confunden: 0, O, 1, I y L.

### Sesiones: `data/sesiones.json`

- **Token:** 32 bytes aleatorios en base64url. En el archivo se guarda `sha256(token)`, nunca el token.
- **Cada sesión guarda** `{ usuarioId, creada, expira }`.
- **Duración:** 12 horas. Las vencidas se borran al leer o escribir el archivo.
- **Persistencia:** las sesiones sobreviven a un reinicio del servidor.
- **Al cambiar o resetear la contraseña** se borran todas las otras sesiones de ese usuario.
- **Cookie:** `sesion=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`. Lleva `Secure` solo si el pedido llega por HTTPS.

### Límite de intentos

- **Cuándo se activa:** a los 5 intentos fallidos en 60 segundos, sea para un mismo usuario o desde una misma IP.
- **Qué responde:** `429` con el encabezado `Retry-After` y el mensaje "Probaste muchas veces. Esperá un minuto y volvé a intentar."
- **Dónde se guarda:** en memoria. Si se reinicia el servidor, los contadores vuelven a cero.

### Consola: `npm run usuarios -- <comando>` (archivo `scripts/usuarios.mjs`)

| Comando | Qué hace |
|---|---|
| `crear --rol <rol> --nombre "<nombre>" [--usuario <u>]` | Crea el usuario e imprime su código inicial. Si no se pasa `--usuario`, se arma con la inicial del nombre y el apellido, sin acentos y en minúsculas, y se le agrega un número si ya existe. |
| `listar` | Muestra usuario, nombre, rol, si está activo y si todavía tiene que crear su contraseña. |
| `resetear <usuario>` | Genera un código inicial nuevo, pone `debeCambiar: true` y cierra sus sesiones. |
| `desactivar <usuario>` / `activar <usuario>` | Lo da de baja o de alta sin borrarlo. Al desactivarlo se cierran sus sesiones. |
| `demo` | Crea o reinicia `candidato`, `junior` y `empresa` con contraseñas conocidas y `debeCambiar: false`. Son las cuentas que usa la guía de la demo. |

El script usa la misma carpeta de datos que el servidor (`DATA_DIR` o `data/`). La lógica de usuarios y sesiones va en un módulo propio, **`auth.js`**, que usan tanto el servidor como el script. `server.js` ya tiene más de 1400 líneas y no conviene sumarle esto.

`data/usuarios.json` y `data/sesiones.json` se agregan a `.gitignore`.

## 2. Permisos por ruta

**Sin sesión** solo responden los archivos estáticos de `public/` y `POST /api/login`. Todo lo demás devuelve:
- `401`: "Tu sesión venció o no ingresaste. Volvé a ingresar."
- `403` si el rol no alcanza: "No tenés permiso para hacer esto."
- Si el usuario tiene `debeCambiar: true`, solo puede usar `/api/yo`, `/api/contrasena` y `/api/logout`. Cualquier otra ruta responde `403` con "Primero creá tu contraseña."

### Rutas nuevas

| Ruta | Qué hace |
|---|---|
| `POST /api/login` `{usuario, clave}` | Crea la sesión y la cookie. Devuelve `{nombre, rol, debeCambiar}`. |
| `POST /api/logout` | Borra la sesión y vence la cookie. |
| `GET /api/yo` | Devuelve `{id, usuario, nombre, rol, debeCambiar}`, o `401` si no hay sesión. |
| `POST /api/contrasena` `{actual?, nueva}` | Cambia la contraseña. Pide la actual, salvo cuando `debeCambiar` está en `true`. Mínimo 8 caracteres. Cierra las otras sesiones de ese usuario. |

### Rutas existentes

| Ruta | estudiante | junior | empresa |
|---|---|---|---|
| `GET /api/config`, `POST /api/voz/token`, `POST /api/messages` | ✅ | ✅ | ✅ |
| `GET /api/diagnostico` | ❌ | ❌ | ✅ |
| `GET /api/empresa` | ✅ | ✅ | ✅ |
| `PUT /api/empresa` | ❌ | ❌ | ✅ |
| `GET /api/informes` | solo los suyos | solo los suyos | todos |
| `GET /api/informes/:id` | solo si es suyo | solo si es suyo | ✅ |
| `POST /api/informes` | ✅ | ✅ | ✅ |
| `DELETE /api/informes/:id` | ❌ | ❌ | ✅ |
| `/api/chequeo/*` | sin cambios: solo desde la misma computadora, sin sesión | | |

- **Al guardar un informe,** el servidor completa `usuarioId` y `candidato` con los datos de la sesión y descarta lo que haya mandado el navegador.
- **Los informes viejos, sin `usuarioId`,** los ve solo la cuenta de empresa.
- **Protección contra pedidos de otras páginas:** en los `POST`, `PUT` y `DELETE` a `/api/*`, si el pedido trae el encabezado `Origin` y su host no coincide con `Host`, se rechaza con `403`. Los pedidos sin `Origin`, como los de los scripts de Node, pasan.

### Llave local para los scripts (agregado al escribir el plan)

`npm run chequeo`, `npm run probar-ia` y `evals/puente.mjs` llaman a la API sin navegador. Al arrancar, el servidor escribe una llave aleatoria en `DATA_DIR/llave-local.txt` (fuera de git). Los scripts la mandan en el encabezado `x-llave-local` y tienen permisos de empresa.

### Limitaciones que se conocen (para resolver después del viernes y antes de evaluar a los 100)

1. **El prompt de la simulación se arma en el navegador.** Un candidato podría leer la consigna completa con las herramientas de desarrollador.
2. **La evaluación se hace en el navegador.** Un candidato podría guardar un informe con un puntaje inventado.

Las dos se resuelven moviendo el armado del prompt y la evaluación al servidor. No afectan la demo.

## 3. Interfaz

- **Arranque:** `GET /api/yo`.
  - Con `401`, se muestra `VIEWS.login`.
  - Con `debeCambiar`, se muestra `VIEWS.nuevaClave`.
  - En cualquier otro caso, la pantalla inicial del rol: estudiante → `sims`, junior → `chat`, empresa → `informes`.
- **`VIEWS.login`:** a pantalla completa, sin barra lateral. Logo de Tutoring, Usuario, Contraseña y el botón Ingresar. Los errores se muestran en el mismo formulario.
- **`VIEWS.nuevaClave`:** contraseña nueva y repetirla, con el mínimo de 8 caracteres a la vista. No se puede salir de esta pantalla salvo con "Salir".
- **Se quita el selector `.seg`** de `index.html`. `S.profile` pasa a salir de `S.usuario.rol`, y cada rol mantiene su menú actual.
- **Color por rol:** `body[data-rol]` redefine el color de acento en `styles.css`.
- **Tarjeta del usuario** (`.me`): muestra el nombre real y el rol ("Candidato", "Junior" o "Empresa"). Al tocarla se abre un menú con **Cambiar contraseña** (`VIEWS.cuenta`) y **Salir**.
- **Se quita el campo libre del nombre del candidato** (`app.js:217`). El nombre sale de la sesión.
- **`localStorage` separado por usuario:** las claves `tutoring.candidato`, `tutoring.junior` y `tutoring.voice` pasan a ser `tutoring.<usuarioId>.*`.
- **`api.js`:** ante cualquier `401` se llama a un manejador global. Corta la llamada si hay una en curso y lleva a `VIEWS.login` con el aviso "Tu sesión venció. Volvé a ingresar."
- **Vista previa (opcional para el viernes):** en Escenarios, el botón "Probar como candidato" abre el recorrido brief → llamada → informe con la franja "Vista previa: este informe no se guarda". En ese modo no se hace el `POST /api/informes`.

## 4. Guía de la demo: `GUIA-DEMO.md`

En la raíz del proyecto. Incluye:
- Los pasos previos: `npm run usuarios -- demo` y `npm run chequeo`.
- Cómo levantar el servidor.
- Las tres direcciones `*.localhost:3000` con su usuario y contraseña.
- Qué mostrar en cada ventana.
- Qué hacer si algo falla: `npm run demo` sin internet, cerrar la sesión de una ventana, etc.

Antes de escribirla se comprueba que `*.localhost` funcione con el servidor escuchando en `127.0.0.1`.

## 5. Tests

- **`test/auth.test.mjs`:**
  - Ingreso, primer ingreso y cambio de contraseña, salida.
  - Contraseña incorrecta.
  - Límite de intentos (`429`).
  - Usuario desactivado.
  - Sesión vencida.
  - Que la sesión siga después de reiniciar el servidor.
- **La tabla de permisos completa:** `401` y `403` por rol y por ruta.
- **Informes:** que un candidato no vea el informe de otro y que el servidor reemplace el nombre que manda el navegador.
- **Pedidos de otro origen:** que un `Origin` ajeno reciba `403`.
- **`startApp` (`test/helpers.mjs`):** crea los usuarios de prueba en el `DATA_DIR` temporal y ofrece un ayudante para ingresar. Los tests actuales de la API usan la sesión de empresa.
- **`test/demo-offline.mjs`:** crea las cuentas de demo solo.
- **Playwright (`e2e`):** hace el ingreso antes de recorrer la app.

## Fuera de alcance

- La pantalla web para administrar usuarios y empresas.
- Recuperar la contraseña por mail.
- Varias empresas por instalación.
- Permisos más finos dentro del rol `empresa`.
- Pasar la evaluación al servidor.
- La conexión por MCP.
