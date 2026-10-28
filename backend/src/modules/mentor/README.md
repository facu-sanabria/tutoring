# Módulo mentor

Lugar reservado para el backend del mentor de onboarding. Todavía no tiene rutas: las vistas del mentor (`vistas-mentor/`) son maquetas estáticas y el chat del junior usa la IA genérica (`/api/messages`, módulo `ia`).

Cuando se implemente, seguir la misma forma que `simulaciones/`:

```
mentor/
  mentor.routes.js        { method, path, handler } para el router
  controllers/            leen el pedido, llaman al service, responden (json/fail/SSE)
  services/               lógica y validaciones; no conocen req/res
  repositories/           solo acceso a data/ (después, a la base)
```

Reglas (ver `docs/superpowers/specs/2026-10-28-backend-por-capas-design.md`):

- No importar de otros módulos. Lo común va a `src/shared/`; el usuario llega resuelto en `ctx.yo`.
- Sumar sus rutas en `src/routes.js` (lista `privadas`).
- Separarlo como servicio propio = copiar `backend/server.js`, `src/app.js`, `src/config/`, `src/shared/` y esta carpeta.
