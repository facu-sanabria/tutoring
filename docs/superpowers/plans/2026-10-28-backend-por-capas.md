# Backend por capas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partir `server.js` (1525 líneas, versión del PR #2) en `backend/` con capas por módulo, sin cambiar comportamiento.

**Architecture:** Refactor puro. El código se mueve tal cual (copiado por rangos de líneas) a archivos chicos; solo se agregan `require`/`module.exports` y un router que reproduce el orden de `handleApi`. Los tests existentes son la red: tienen que dar lo mismo que la base.

**Tech Stack:** Node ≥ 18, CommonJS, `http` nativo, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-backend-por-capas-design.md` (ver sección "Actualización: base = PR #2").

## Global Constraints

- Solo cambios estructurales: sin funcionalidad nueva, sin tests nuevos, sin cambios de lógica ni de mensajes.
- Sin dependencias nuevas; CommonJS; `public/` intacto.
- `.env`, `DATA_DIR`, `LOG_DIR`, `CLAUDE_SDK_MODULE` y `public/js/core.js` se resuelven desde la raíz del repo.
- Un módulo no importa de otro; `shared/` no importa de `modules/`.
- Base: `npm test` 152/153 y `npm run test:e2e` 37/38 (fallas previas: `/..%5c.env` y "interrumpir al cliente"). Cada paso tiene que terminar con el mismo resultado.

## Review Focus

1. Orden de chequeos de la API: origen (403) → chequeo local → login → sesión (401) → contraseña pendiente (403) → ruta/método (404/405). Un `/api/nada` sin sesión da 401, no 404.
2. `/api/chequeo/*` con método equivocado da 404 (no 405) y no pide sesión.
3. `/api/informes/:id` valida el id (400) antes del método (405).
4. Estado mutable compartido (`SDK_STATE`, `liveActual`, `LIVE_ESTADO`, `USO_SESION`) tiene que vivir en un solo módulo y exportarse por referencia, no copiarse.
5. `data/llave-local.txt` y las cuentas demo se crean al arrancar, igual que hoy.

---

### Task 1: Mover a `backend/` y partir en archivos

**Files:** todo `backend/` (ver estructura del spec), `package.json`, `test/helpers.mjs`, `test/auth.test.mjs`, `test/demo-offline.mjs`, `test/chequeo.mjs`, `test/probar-ia.mjs`, `scripts/usuarios.mjs`, `evals/puente.mjs` (solo rutas). Se borran `server.js` y `auth.js` de la raíz.

- [ ] Partir `server.js` por rangos de líneas en los archivos de `config/`, `shared/` y `modules/` del spec, agregando solo `require` y `module.exports`.
- [ ] `git mv auth.js backend/src/modules/auth/auth.service.js` y actualizar sus `require`.
- [ ] Router (`shared/http/router.js`) y `routes.js` con el orden del Review Focus 1.
- [ ] `npm test` → 152/153 con la misma falla; `npm run test:e2e` → 37/38 con la misma falla.
- [ ] Verificar dependencias: `grep -rn "modules/" backend/src/shared` vacío y ningún `modules/X` requiriendo `modules/Y`.
- [ ] Commit: `refactor(backend): partir server.js en capas por módulo`

### Task 2: Documentación

- [ ] `modules/mentor/README.md`, `LEEME.md` (dónde está cada cosa), `CLAUDE.md` del repo (si menciona `server.js`/`auth.js`) y `hackahton/CLAUDE.md` (fuera del repo).
- [ ] Commit: `docs: estructura del backend por capas`
