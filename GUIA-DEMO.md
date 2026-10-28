# Guía de la demo: tres ventanas, una por perfil

La idea es mostrar los tres perfiles al mismo tiempo, cada uno en su ventana y con su propia sesión: **Candidato**, **Junior** y **Empresa**.

## El truco de `*.localhost`

El navegador guarda la sesión (la cookie) **por dirección**. Si abrís las tres ventanas en `localhost:3000`, comparten la sesión y al entrar con otro usuario se pisa la anterior. Para evitarlo, se usa un nombre distinto para cada ventana:

- `candidato.localhost:3000`
- `junior.localhost:3000`
- `empresa.localhost:3000`

Chrome y Edge mandan cualquier `algo.localhost` a tu propia compu (`127.0.0.1`), sin tocar nada de la configuración. Como para el navegador son tres sitios distintos, cada ventana guarda su propia sesión. Ya está probado en Chromium.

> Usá **Chrome o Edge** (también son los que reconocen la voz). Si por algún motivo `candidato.localhost` no abre, el plan B está más abajo.

## Preparación (el día anterior y 15 minutos antes)

1. Instalá las dependencias, si es la primera vez: `npm install`.
2. Revisá que el `.env` tenga las keys (ver `LEEME.md` → "Proveedor de IA").
3. Las cuentas de la demo se crean solas la primera vez que corrés `npm start` (si todavía no hay ningún usuario). Si ya había usuarios, o para reiniciarlas, corré:
   ```
   npm run usuarios -- demo
   ```
   Les vuelve a poner la contraseña de la tabla y las reactiva.
4. Probá que la IA y la voz respondan de verdad:
   ```
   npm run chequeo -- --rapido
   ```
   Tiene que terminar con **LISTO PARA LA DEMO**. El día anterior corré la versión completa (`npm run chequeo`, unos 2 minutos).
5. Levantá el servidor y dejá la terminal abierta:
   ```
   npm start
   ```

## Las tres ventanas

Abrí **tres ventanas** (no pestañas, así se ven lado a lado) y entrá en cada una:

| Ventana | Dirección | Usuario | Contraseña | Entra a |
|---|---|---|---|---|
| Candidato | http://candidato.localhost:3000 | `candidato-demo` | `1234` | Simulaciones por voz |
| Junior | http://junior.localhost:3000 | `junior-demo` | `1234` | Mentor del equipo |
| Empresa | http://empresa.localhost:3000 | `empresa-demo` | `1234` | Informes de candidatos |

Cada perfil tiene su color (Candidato violeta, Junior azul, Empresa verde) y su nombre abajo a la izquierda. Para salir o cambiar la contraseña, tocá la tarjeta con el nombre.

Estas cuentas son solo para probar: antes de usar la app con candidatos reales, desactivalas (`npm run usuarios -- desactivar empresa-demo`, y lo mismo con las otras dos). El servidor te lo recuerda en la consola cada vez que arranca. Una cuenta real se crea con un código inicial y la persona arma su propia contraseña la primera vez que entra (ver "Cuentas reales", más abajo).

## Guion sugerido

0. **Antes de empezar:** en **Empresa** → *Contexto* → elegí "MKT Contact Center · atención al cliente (borrador)" → **Cargar ejemplo**. Así el candidato ve los escenarios de call center. Después recargá (F5) la ventana del candidato.
1. **Empresa: el contexto.** Mostrá *Contexto*, *Escenarios* y *Criterios*: la empresa carga una sola vez cómo trabaja y qué quiere evaluar.
2. **Candidato: la simulación.** Elegí un escenario y leé el brief: en "Lo que tenés a mano" está lo que un operador ve en el sistema y las reglas de la campaña. Antes de llamar, probá el audio (la barra del micrófono se tiene que mover y "Probar sonido" se tiene que escuchar) y empezá la llamada. Suena el teléfono: tocá **Atender**. En las llamadas entrantes (por ejemplo, "Hace dos días que no tengo internet") **saludás vos primero**, como en el call center ("ConectAR, buen día, te habla…"). En la cobranza llamás vos: tocá **Llamar** y suena el tono de llamada hasta que el cliente atiende con un "¿Hola?". Cuando el cliente habla se escucha un ruido de línea suave de fondo, como en una llamada real. La voz del cliente suena como por teléfono; si en la sala no se entiende bien, apagala en *Empresa → Escenarios → Voz telefónica*. Al colgar se arma el informe, con puntaje, evidencia de la conversación, fortalezas y qué mejorar.
3. **Empresa: el informe.** En *Informes* aparece el informe que acaba de generar el candidato (tocá *Informes* otra vez para actualizar la lista). El candidato solo ve los suyos; la empresa ve todos.
4. **Junior: el mentor.** Tocá una de las tarjetas (por ejemplo, encarar un ticket) y mostrá cómo responde con el contexto de la empresa: lo técnico, el porqué de negocio y cómo se hace ahí.

### Momento "crear un escenario en vivo"

Sirve para mostrar que la empresa personaliza lo que practica el candidato, sin tocar código:

1. En **Empresa** → *Escenarios* → **Agregar escenario**.
2. Completá el título, con quién habla (el cliente), su personalidad, la situación y el objetivo. Conviene llevarlo pensado de antes: por ejemplo, un cliente que llama enojado porque le cobraron dos veces.
3. Tocá **Guardar cambios**.
4. En la ventana del **Candidato**, recargá la página (F5): el escenario nuevo ya aparece en *Simulaciones* y se puede practicar en el momento.

## Si algo falla

| Qué pasa | Qué hacer |
|---|---|
| `candidato.localhost` no abre | Plan B: en vez de tres nombres, usá tres **perfiles** del navegador (o una ventana normal, una de incógnito y otro navegador), todos en `http://localhost:3000`. Lo importante es que cada ventana tenga su propia sesión. |
| "Usuario o contraseña incorrectos." | Volvé a correr `npm run usuarios -- demo`: reinicia las tres contraseñas. |
| "Probaste muchas veces. Esperá un minuto…" | Esperá un minuto. Después de 5 intentos fallidos por usuario se bloquea 60 segundos. |
| "Tu sesión venció. Volvé a ingresar." | La sesión dura 12 horas o se cerró desde otra ventana con el mismo usuario. Volvé a entrar. |
| Una ventana muestra el perfil de otra | Seguramente las dos están en la misma dirección (por ejemplo, las dos en `localhost:3000`). Revisá la barra de direcciones. |
| La IA no responde o la voz no conecta | Mirá la terminal del servidor (dice qué pasó y qué hacer) y corré `npm run chequeo -- --rapido` en otra terminal. |
| Se cayó internet | Plan B sin red: `npm run demo` levanta la app en el puerto 3200 contra una IA falsa, con las mismas cuentas. Usá `http://candidato.localhost:3200`, etc. |
| El puerto 3000 está ocupado | `$env:PORT=3100; npm start` (PowerShell) y cambiá el puerto en las tres direcciones. |

## Cuentas reales (después de la demo)

Las cuentas se crean desde la consola. No hay pantalla de administración todavía:

```
npm run usuarios -- crear --rol estudiante --nombre "Juan Pérez"   # rol: estudiante | junior | empresa
npm run usuarios -- listar
npm run usuarios -- resetear jperez       # nuevo código inicial y cierra sus sesiones
npm run usuarios -- desactivar jperez     # ya no puede entrar
npm run usuarios -- activar jperez
```

`crear` imprime un **código inicial** (por ejemplo, `K7M-3QX-9TP`). Se lo das a la persona y, la primera vez que entra, la app le pide crear su contraseña (al menos 8 caracteres). Cada persona tiene su propia cuenta, incluidas las de empresa (RR. HH., gerentes, jefes): no se comparten.
