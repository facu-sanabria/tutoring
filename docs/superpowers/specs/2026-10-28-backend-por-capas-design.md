# Backend por capas — diseño

Fecha: 2026-10-28 · Branch: `refactor/backend-por-capas` (PR a `master`)

## Por qué

Todo el backend vive en `server.js` (~1130 líneas): `.env`, proveedores de IA, streaming, helpers HTTP, rutas y estáticos mezclados. Cuesta leerlo y cuesta saber dónde tocar. El objetivo es ordenarlo con las convenciones de capas que ya usa el equipo en `DeviSoft/Clients/masajes-turnos-lili/backend` (`server.js` + `src/{app.js, config, routes, controllers, services, repositories, middlewares}`), para que se lea fácil.

Además el backend es un **monolito que integra simulaciones y mentor**, y en el futuro puede separarse en dos servicios. La estructura tiene que dejar esa separación barata.

## Objetivos

- Partir `server.js` en archivos chicos con una sola responsabilidad, en capas: **routes → controller → service → repository**.
- Agrupar las capas **por módulo** (`empresa`, `ia`, `simulaciones`, `mentor`) en vez de globalmente, para poder sacar un módulo entero el día que se separe.
- Dejar la forma lista para migrar a **Next.js** más adelante: controllers finos (pedido → service → respuesta) que después se reemplazan por `app/api/**/route.ts`; services y repositories que se mueven sin cambios.

## No objetivos

- **No** migrar a Next.js ni a ningún framework (ni Express) en esta branch.
- **No** tocar el frontend: `public/` queda igual, incluido `public/js/core.js`.
- **No** cambiar comportamiento: mismas rutas, mismos códigos y mensajes de error, mismo formato SSE, mismos JSON en `data/`, mismos logs de arranque.
- **No** agregar dependencias de npm.
- **No** implementar el mentor (solo se reserva su lugar).
- No pasar a TypeScript ni a ESM.

## Anti-objetivos (sería un fracaso aunque ande)

- Que cambie algo que el usuario o los tests ven (respuestas, errores, streaming, logs que los tests leen como `http://localhost:<puerto>`).
- Que un módulo importe de otro módulo (acopla lo que queremos poder separar).
- Que `shared/` importe de `modules/`.
- Capas que solo reenvían sin sentido: si un service no tiene lógica, el controller igual lo llama (la regla es la regla), pero no se crean archivos vacíos "por las dudas" salvo el lugar del mentor.

## Restricciones

- Node ≥ 18, CommonJS, sin dependencias nuevas, `http` nativo.
- El server escucha en `127.0.0.1` y `PORT` como hoy.
- `.env` sigue en la raíz del repo; `DATA_DIR` sigue resolviéndose relativo a la **raíz del repo** (hoy es relativo a `__dirname` = raíz; al mover el código hay que mantenerlo).
- `public/js/core.js` es UMD compartido con el navegador: el backend lo sigue requiriendo desde `public/js/core.js` (no se mueve).
- `npm test`, `npm run test:e2e`, `npm run demo` y `npm run probar-ia` tienen que andar igual. Los tests levantan el server con `spawn(node, <ruta del server>)`; solo cambia esa ruta.

## Estructura

```
backend/
  server.js                       arranque: crea el http server, listen, logs de arranque, handlers de errores del proceso
  src/
    app.js                        recibe cada pedido: /api/* → router, resto → estáticos; error 500 genérico
    config/
      env.js                      carga .env de la raíz, env(), envNum(), RAIZ del repo
      paths.js                    PUBLIC, DATA, REPORTS
      limits.js                   LIMITS
    shared/                       lo común a todos los módulos; nunca importa de modules/
      http/
        router.js                 tabla { método, patrón } → handler; 405 si la ruta existe con otro método, 404 si no existe
        respuesta.js              json(), fail()
        body.js                   readBody(), bodyObject()
        sse.js                    sendEvent(), crearSSE()
        static.js                 serveStatic() + TYPES
      utils/
        secretos.js               sinSecretos()
        validacion.js             isObj(), safeId()
        tiempo.js                 dormir()
        log.js                    logIA(), textoTokens()
      llm/                        la cadena de IA; la usan simulaciones y (más adelante) el mentor
        providers.config.js       IDS, normProv, PROVIDERS, PRIMARY, FALLBACK, CADENA, CACHE, PRECIO_CACHE, tiempos y reintentos
        uso.js                    USO_SESION, sumarUso(), resumenUso()
        errores.js                provError(), esReintentable(), pasaAlRespaldo()
        payload.js                sanitizeMessages(), sanitizePayload()
        providers/
          claude-sdk.js           carga lazy del SDK, runClaudeSdk(), verificarSesionClaude(), SDK_STATE
          anthropic.js            runAnthropic(), leerSSE()
          gemini.js               runGemini(), EVAL_SCHEMA, mensajes de error de Gemini
        cadena.js                 RUN, problemaDe(), intentar(), responder()
        estado.js                 probarProveedor(), estadoIA()
      voz/
        voice.config.js           VOICE (proveedor de voz y su configuración)
    modules/
      ia/                         endpoints de la IA genérica
        ia.routes.js              GET /api/config, GET /api/diagnostico, POST /api/messages
        ia.controller.js
        ia.service.js
      empresa/                    contexto de la empresa (lo usan simulaciones y mentor)
        empresa.routes.js         GET/PUT /api/empresa
        empresa.controller.js
        empresa.service.js        validación + migración de formato viejo (usa core.js)
        empresa.repository.js     lee/escribe data/empresa.json y el respaldo
      simulaciones/
        simulaciones.routes.js    POST /api/voz/token, GET/POST /api/informes, GET/DELETE /api/informes/:id
        controllers/  voz.controller.js, informes.controller.js
        services/     voz.service.js (token efímero de Gemini Live), informes.service.js
        repositories/ informes.repository.js (data/informes/*.json)
      mentor/
        README.md                 lugar reservado: misma forma que simulaciones, todavía sin rutas
    routes.js                     junta las rutas de todos los módulos en un solo router
```

`public/`, `data/`, `test/`, `vistas-mentor/`, `.env` quedan donde están. `package.json` sigue único en la raíz.

## Reglas de dependencias

- `routes` → `controller` → `service` → `repository`. Nunca al revés ni salteando hacia arriba.
- **Controller**: recibe `(req, res, params)`, lee el body con `shared/http/body`, llama al service, responde con `json`/`fail` (o SSE). No toca disco ni la IA directamente.
- **Service**: lógica y validaciones. Devuelve datos o lanza/retorna un error con `status` y `message`; no conoce `res` (excepción: `responder()` de la cadena de IA escribe el stream, porque el streaming es su trabajo; queda en `shared/llm`).
- **Repository**: solo acceso a `data/` (leer/escribir JSON). Cuando llegue Postgres, cambia solo esta capa.
- Un módulo **no importa** de otro módulo. Lo común va a `shared/`. Hoy `simulaciones` no necesita nada de `empresa` en el backend (el navegador manda el contexto armado), así que no hay que resolver esa dependencia.
- `shared/` no importa de `modules/`.

Separar un servicio después = copiar `backend/server.js`, `src/app.js`, `config/`, `shared/` y el módulo; en el router dejar solo sus rutas.

## Comportamiento que hay que preservar a mano (lo que los tests pueden no cubrir)

- Orden de evaluación de rutas y respuestas: 405 con "Método no permitido" cuando la ruta existe con otro método; 404 "Ruta no encontrada" para `/api/*` desconocida; 400 "Identificador de informe inválido" para ids que no pasan `safeId`.
- `/api/messages` aborta el pedido al proveedor cuando el navegador cierra la conexión.
- Migración de `empresa.json` de formato viejo con respaldo único `empresa.formato-viejo.json`.
- Estáticos: protección de path traversal, `\0`, `HEAD`, `cache-control: no-cache`.
- `uncaughtException` / `unhandledRejection` no bajan el server; mensaje de `EADDRINUSE`.
- Logs de arranque idénticos (proveedor principal, respaldo, caché, voz, sesión de Claude).
- `sinSecretos` necesita las keys: se arma desde `PROVIDERS` en `shared/llm` o recibe la lista; no puede quedar con lista vacía.
- `CLAUDE_SDK_MODULE` (SDK simulado en tests) se resuelve relativo a la raíz del repo, como hoy (`path.resolve(__dirname, ruta)` con `__dirname` = raíz).

## Cambios fuera de `backend/`

- `package.json`: `main` y `start` → `backend/server.js`.
- `test/helpers.mjs`, `test/demo-offline.mjs`, `test/probar-ia.mjs`: ruta del server → `backend/server.js`.
- `server.js` de la raíz se **borra** (no queda un shim).
- `CLAUDE.md` del proyecto padre (`hackahton/CLAUDE.md`) y `LEEME.md`: actualizar la descripción de la arquitectura (dónde está cada cosa).

## Cómo se verifica

- `npm test` y `npm run test:e2e` pasan sin modificar ninguna aserción.
- `npm run demo` arranca y una simulación completa anda (chat + evaluación + guardar informe).
- `npm start` con el `.env` real muestra los mismos logs de arranque.
- `git grep` no encuentra `require("../../modules/...")` desde otro módulo ni desde `shared/`.

## Decisiones que tomé yo (revisalas)

- Capas **por módulo** en vez de globales como en lili, para que separar sea mover una carpeta.
- Módulo `ia` aparte para `/api/config`, `/api/diagnostico`, `/api/messages`: es la IA genérica que van a usar los dos productos, no es de simulaciones.
- `/api/voz/token` va en `simulaciones` (hoy la voz es solo de simulaciones); si el mentor usa voz se sube a `shared/voz`.
- `test/` queda en la raíz (no `backend/test/`) porque mezcla tests del backend, del `core.js` del frontend y e2e.
- `simulaciones` usa subcarpetas `controllers/ services/ repositories/` porque tiene dos recursos; `empresa` e `ia` tienen un archivo por capa.
- Sin router externo: uno chico propio en `shared/http/router.js`.

## Actualización: base = PR #2 (login y roles)

La branch sale del PR #2 (`pr/demo-mkt`, que apunta a `cambios-demo-2026-10-15`), no de `master`: ese PR reescribe gran parte de `server.js` y refactorizar `master` generaría conflictos inmanejables. El PR a `master` se manda cuando el PR #2 y `cambios-demo` estén en `master`.

**Solo cambios estructurales**: mover y partir código existente. No se agrega funcionalidad, ni tests nuevos, ni se cambia lógica. El router reemplaza la cadena de `if` de `handleApi` respetando el mismo orden de chequeos.

Lo que trae el PR #2 y dónde va:

- `auth.js` → `backend/src/modules/auth/auth.service.js` (se mueve tal cual; lo usan `scripts/usuarios.mjs` y los tests).
- Sesión (`LLAVE_LOCAL`, `usuarioDe`, cuentas demo al primer arranque) → `modules/auth/sesion.js`. Rutas `/api/login`, `/api/yo`, `/api/logout`, `/api/contrasena` → `modules/auth/auth.{routes,controller}.js`.
- `cookieDe`, `mismoOrigen`, `exigir` y los mensajes 401/403 son genéricos → `shared/http/`. Los módulos reciben el usuario ya resuelto (`ctx.yo`) y no importan `auth`: así ningún módulo depende de otro.
- El orden de `handleApi` lo arma `backend/src/routes.js`: chequeo de origen → `/api/chequeo/*` (sin sesión, solo localhost) → `/api/login` → sesión obligatoria y "primero creá tu contraseña" → rutas de los módulos.
- `/api/chequeo/*` → `modules/ia/chequeo.controller.js` (mantiene su propio despacho: método equivocado da 404, como hoy).
- Evaluación en carrera (`responderEval`, `carreraEval`) → `shared/llm/evaluacion.js`; `intentar`, `conReintentos`, `problemaDe` → `shared/llm/intentos.js`; `responder` → `shared/llm/cadena.js`.
- Registro en archivo (`registrarArchivo`, `logLinea`) → `shared/utils/registro.js`; `logIA`, `pista`, `textoTokens` → `shared/llm/log.js`.
- Varias keys de Gemini Live (`LIVE_KEYS`, `tokenGeminiLive`, pausas) → `shared/voz/gemini-live.js`.
- `test/chequeo.mjs`, `evals/puente.mjs` y `scripts/usuarios.mjs`: solo cambian rutas.

Base medida antes del refactor: `npm test` 152/153 (falla `/..%5c.env` → 404 en vez de 403: test pensado para Windows), `npm run test:e2e` 37/38 (falla por timeout "interrumpir al cliente lo corta"). El refactor tiene que dar exactamente lo mismo.

## Lo que queda a criterio de quien lo implemente

Nombres exactos de funciones internas, cómo se parten los archivos de `shared/llm` si alguno queda muy grande o muy chico, y el orden de los commits (idealmente uno por módulo, con los tests pasando en cada uno).
