# Prompt para Claude Code: duración estimada y cierre por resolución

> BORRADOR. No aplicar hasta que Pepito lo apruebe.

## Contexto

En el motor de voz Gemini Live (el único que va a usar la demo), hoy la llamada termina cuando el cliente simulado llama a la herramienta `colgar`. No hay corte por tiempo en ese camino. El corte por `duración × 60 + 180` solo existe en el camino de Vapi, que no se usa.

El problema: el cliente se despide enseguida cuando el candidato ofrece un próximo paso, aunque la conversación haya sido corta y no se hayan visto las habilidades. Pasó en la prueba de Facundo (129 segundos, 11 turnos).

Lo que se quiere:
- La duración de cada escenario es una **estimación**, no un límite.
- La llamada **termina cuando la situación se resuelve** (el cliente acepta un acuerdo concreto) **o cuando el cliente se cansa** (el candidato evade, no propone nada o trata mal al cliente).
- Hay un **tope de seguridad** para evitar llamadas infinitas y costos sin control.

## Objetivo

1. Que el cliente simulado no se despida hasta que la condición de cierre del escenario se cumpla o hasta que se corte por cansancio.
2. Que el cliente sepa cuánto suele durar la conversación (la estimación) sin cortarla por eso.
3. Agregar un tope de seguridad de `CALL_MAX_MINUTES` minutos (por defecto 15), configurable en `.env`. Al cumplirse, el cliente se despide y la llamada termina.
4. No cambiar la evaluación, el puntaje ni el camino de Vapi.

## Archivos que tocar

Buscar por texto, no por número de línea (los números pueden haber cambiado):

- `public/js/prompts.js`: la función que arma la consigna del cliente simulado. Buscar la sección `CÓMO TERMINAR`.
- `public/js/voice.js`: la parte de Gemini Live que arma la sesión y la consigna de voz. Buscar `colgar`, `finPendiente`, `finTimer`, `intentarCerrar` y `GEMINI_LIVE`.
- `server.js`: solo si hace falta leer `CALL_MAX_MINUTES` del `.env`. Si ya hay un lector de variables de entorno, usarlo.
- `.env.example`: agregar `CALL_MAX_MINUTES=15` con un comentario en español.

## Cambios

### 1. Consigna del cliente (prompts.js)

Reemplazar la sección `CÓMO TERMINAR` por esta regla (adaptar el texto al estilo del archivo):

```
CÓMO TERMINAR
- La conversación termina cuando la situación se resuelve o cuando te cansás. No te despidas antes.
- Se resuelve cuando: {escenario.cierre}. Solo entonces podés despedirte.
- Si {candidato} no llega a resolver la situación pero sigue intentando, seguí conversando: repreguntá, poné límites, pedí cosas concretas. No cortes solo porque pasó tiempo.
- Si {candidato} evade, no propone nada o te trata mal, te cansás: decilo con una frase que muestre que no te deja conforme, y despedite.
- Al despedirte, en una oración corta, escribí al final, en una línea aparte, exactamente: [FIN]
- No escribas [FIN] antes de despedirte, y nunca lo digas como parte de una oración.
```

- El campo `cierre` viene del escenario. Si un escenario no lo tiene, usar la regla general: "cuando la situación esté resuelta o cuando te canses".
- Agregar una línea de duración estimada en el encabezado de la consigna: "La conversación suele durar unos {duracion} minutos, pero puede ser más corta o más larga según cómo avance."

### 2. Sesión de Gemini Live (voice.js)

- Leer `CALL_MAX_MINUTES` (default 15). Si no es un número válido, usar 15.
- Iniciar un temporizador cuando empieza la llamada. Al cumplirse, enviar al cliente una instrucción para despedirse (por ejemplo, un mensaje de texto de sistema: "Ya no hay más tiempo: despedite ahora con [FIN]") y, cuando termine de hablar, cerrar la llamada con el mismo camino que usa `colgar`.
- Limpiar el temporizador al terminar la llamada por cualquier motivo.
- No cambiar el manejo de `colgar`, de `[FIN]`, de la reconexión de Gemini Live (session resumption) ni del botón Colgar.

### 3. Lo que NO se toca

- El puntaje, la evaluación y `puntajePonderado`.
- El camino de Vapi, incluido `maxDurationSeconds`.
- El `.env` real (no tocar claves ni valores existentes).
- Ningún archivo de `data/`.

## Cómo probar

### Automáticas (sin llamar a la IA)

1. `npm test`: tiene que pasar todo. Si `test/prompts.test.mjs` compara el texto de la consigna contra una versión anterior, actualizar esa referencia de forma explícita y dejar un comentario que diga por qué cambió.
2. Agregar un test en `test/prompts.test.mjs` que verifique que la consigna contiene la regla de cierre y el texto del campo `cierre`.

### Manuales (con Gemini Live, datos de ejemplo)

Hacer tres llamadas con el escenario `alcance-sprint` (o cualquiera con `cierre` definido):

1. **Resuelto:** el candidato propone un acuerdo concreto (qué entra, qué no, cuándo). Esperado: el cliente acepta, pide confirmación, se despide con [FIN] y la llamada termina sola. Duración: la que dure.
2. **No resuelto por evasión:** el candidato no propone nada. Esperado: el cliente insiste dos veces y después se cansa y corta. La llamada no se corta antes.
3. **Tope:** hacer una llamada sin resolver que siga viva. Con `CALL_MAX_MINUTES=2` en `.env` (solo para la prueba), esperado: a los 2 minutos el cliente se despide y la llamada termina sin cortar una frase a la mitad.

En los tres casos, revisar:
- que no se corte ninguna frase a la mitad,
- que `duracionSeg` del informe coincida con la duración real,
- que el informe se genere igual,
- que en la terminal no aparezcan errores nuevos.

Después de las pruebas, devolver `CALL_MAX_MINUTES` a 15.

## Restricciones

- No pedir ni escribir API keys. No modificar `.env` salvo para la prueba del tope, y devolverlo después.
- Usar solo datos de ejemplo (plan gratuito de Gemini).
- Cambios mínimos y en español. Si algo no está claro, preguntar antes de inventar.
- Al terminar, resumir qué archivos cambiaron y qué quedó sin probar.
