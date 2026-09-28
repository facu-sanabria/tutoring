# Tutoring

Simulaciones por voz para evaluar habilidades blandas de candidatos y un mentor de IA para juniors. Todo usa el contexto que carga el senior de la empresa.

## Cómo levantarlo

Requisito: Node.js 18 o superior (`node -v`). La app no necesita instalar paquetes.

1. Conseguí una API key (ver abajo) y pegala en el archivo `.env`.
2. En la carpeta del proyecto ejecutá:
   ```
   npm start
   ```
3. Entrá a **http://localhost:3000** con **Chrome o Edge** (son los que reconocen voz).
4. La primera vez que empieces una llamada, el navegador pide permiso para usar el micrófono: aceptalo.

Arriba a la derecha tiene que aparecer **"IA conectada"** en verde.

Si el puerto 3000 ya está ocupado (por ejemplo, quedó otra copia abierta), el servidor lo avisa y se puede levantar en otro:

```
PORT=3100 npm start                      # Git Bash / macOS / Linux
$env:PORT=3100; npm start                # PowerShell
```

## Proveedor de IA

Se elige en el `.env` con `LLM_PROVIDER`. El resto de la app no cambia.

| `LLM_PROVIDER` | Key | Costo |
|---|---|---|
| `gemini` (por defecto) | `GEMINI_API_KEY`: se crea gratis en https://aistudio.google.com/apikey con tu cuenta de Google | Plan gratuito con límites por minuto y por día |
| `anthropic` | `ANTHROPIC_API_KEY`: se crea en https://console.anthropic.com | Pago por uso (hay que cargar crédito) |

Para comprobar que la key y los modelos del `.env` funcionan de verdad, sin abrir el navegador:

```
npm run probar-ia
```

Prueba los tres modelos (chat, voz y evaluación), muestra cuánto tardó cada uno y, si algo falla, explica qué cambiar. Nunca imprime la key.

Notas sobre Gemini gratis:
- Si aparece **"la API de Gemini está apagada en el proyecto de Google de esa key"** (error 403, `SERVICE_DISABLED`): la key es válida, pero el proyecto de Google al que pertenece no tiene habilitada la *Generative Language API*. Pasa cuando en AI Studio se elige un proyecto de Cloud ya existente. Dos salidas:
  1. Abrir el link que aparece en el mensaje (trae el número de proyecto), tocar **Habilitar**, esperar 1 o 2 minutos y reiniciar el servidor.
  2. Más rápido: crear otra key en https://aistudio.google.com/apikey eligiendo un **proyecto nuevo**, que ya viene con la API habilitada.
- Si aparece "cuota" o "límite de consultas", esperá un minuto. Los límites exactos se ven en AI Studio.
- Si un modelo no está disponible para tu key, cambiá `GEMINI_MODEL` / `GEMINI_MODEL_VOICE` / `GEMINI_MODEL_EVAL` en el `.env` por otro de la lista de AI Studio y reiniciá.
- En el plan gratuito, Google puede usar lo que se envía para mejorar sus productos: usá solo datos de ejemplo.

Cada vez que cambies el `.env`, frená el servidor (Ctrl+C) y volvé a ejecutar `npm start`.

## Qué hay en cada perfil

| Perfil | Qué hace |
|---|---|
| **Estudiante** | Elige un escenario, habla por voz con un cliente simulado y recibe un informe con puntaje, evidencia, fortalezas y puntos a mejorar. |
| **Junior** | Chat con el mentor: entender el código, cómo trabaja el equipo, encarar un ticket y revisar antes del PR. Explica lo técnico y el porqué de negocio. |
| **Empresa** | El senior carga el contexto, los archivos del repo, los escenarios y los criterios de evaluación. También ve los informes de los candidatos. |

## Estructura

```
server.js               servidor (sirve la app, reenvía al proveedor de IA, guarda datos)
.env                    API key y configuración
data/                   configuración de la empresa e informes (se crean solos)
public/index.html
public/css/styles.css
public/js/core.js       lógica pura y testeable (historial, evaluación, puntaje, voz)
public/js/defaults.js   empresa de ejemplo (Nodo Software)
public/js/prompts.js    instrucciones que recibe la IA en cada modo
public/js/voice.js      motor de voz (navegador o Vapi)
public/js/api.js        llamadas al servidor
public/js/app.js        interfaz
test/                   pruebas automatizadas y utilidades de prueba
```

## Probar sin API key ni internet

```
npm run demo
```

Levanta la app en http://localhost:3200 contra una IA falsa con respuestas fijas. Sirve para recorrer toda la interfaz (y como plan B si se cae la red en la demo). Guarda los datos en una carpeta temporal, así no pisa `data/`.

## Pruebas automatizadas

```
npm test           # servidor y lógica pura (rápido, sin navegador)
npm run test:e2e   # recorrido completo en un navegador de verdad
npm run test:todo  # todo junto
```

Ninguna prueba usa la API real: todas hablan con la IA falsa de `test/fake-llm.mjs`.

`npm test` cubre las rutas del servidor (config, empresa, informes, messages), la traducción del streaming de Gemini al formato de eventos de Claude, el mapeo de errores, path traversal, límites de tamaño, y la lógica de `core.js` (historial que se manda a la IA, parseo del JSON de evaluación, puntaje ponderado, corte de oraciones para la voz).

El recorrido en navegador necesita Playwright, que es **dependencia solo de desarrollo** (la app en producción sigue sin dependencias):

```
npm install
npx playwright install chromium
npm run test:e2e
```

Si Playwright no está instalado, esas pruebas se saltean con un aviso en vez de fallar.

## Voz

- Por defecto usa la voz del navegador (`VOICE_PROVIDER=browser`). El reconocimiento de voz de Chrome necesita internet.
- Edge suele tener voces en español más naturales (por ejemplo, "Elena" o "Tomás", de Argentina). Se elige en la pantalla previa a la llamada, con el botón **Probar voz**.
- Si el micrófono falla o el navegador no reconoce voz, la app lo avisa y abre sola el cuadro para escribir. También se puede abrir con el botón del teclado.
- Si el navegador no está leyendo en voz alta (volumen bajo, sin voces en español instaladas), la llamada sigue igual: lo que dice el cliente se ve como subtítulo.

### Pasar a Vapi (a futuro)

`public/js/voice.js` tiene las dos implementaciones con la misma interfaz. Para usar Vapi:

1. Creá una cuenta en Vapi y copiá tu **public key**.
2. En el `.env`: `VOICE_PROVIDER=vapi` y `VAPI_PUBLIC_KEY=...` (opcional: `VAPI_ASSISTANT_ID`).
3. Reiniciá el servidor.

La integración con Vapi quedó preparada pero **nunca se ejecutó**: revisala antes de usarla en una demo. Ojo con dos cosas: Vapi elige su propio modelo y su propia voz (no los del `.env` del servidor), y la key pública de Vapi sí llega al navegador (es pública por diseño, a diferencia de la key del proveedor de IA).

## Seguridad

- Las API keys del proveedor de IA viven solo en el `.env` del servidor: el navegador nunca las ve. `/api/config` solo informa si hay key cargada y cómo se llama la variable.
- El `.env` y los datos están en `.gitignore`.
- El servidor escucha solo en `127.0.0.1` (no queda expuesto en la red).
- Los datos de los informes son de ejemplo: no cargues datos reales de personas.
