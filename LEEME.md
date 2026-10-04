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
public/js/voice.js      motor de voz (Gemini Live, Vapi o navegador)
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

Ninguna prueba usa la API real: todas hablan con la IA falsa de `test/fake-llm.mjs`. La llamada con Gemini Live (`test/voz-gemini.test.mjs`) reemplaza el WebSocket de Google por uno falso que habla el mismo protocolo (audio, transcripciones, interrupciones, colgar) y usa el micrófono falso de Chromium.

`npm test` cubre las rutas del servidor (config, empresa, informes, messages), la traducción del streaming de Gemini al formato de eventos de Claude, el mapeo de errores, path traversal, límites de tamaño, y la lógica de `core.js` (historial que se manda a la IA, parseo del JSON de evaluación, puntaje ponderado, corte de oraciones para la voz).

El recorrido en navegador necesita Playwright, que es **dependencia solo de desarrollo** (la app en producción sigue sin dependencias):

```
npm install
npx playwright install chromium
npm run test:e2e
```

Si Playwright no está instalado, esas pruebas se saltean con un aviso en vez de fallar.

## Voz

Hay tres motores con la misma interfaz (la app no cambia):

| `VOICE_PROVIDER` | Cómo se siente | Costo |
|---|---|---|
| `gemini-live` (por defecto) | Voz a voz nativa: el modelo escucha y habla directo, sin pasar por texto. Entona, reacciona, usa muletillas y se lo interrumpe hablando encima | Gratis con el plan gratuito de Gemini; pago: ~US$ 0,02 por minuto |
| `vapi` | Cadena voz → texto → IA → voz. Natural y con interrupciones, pero se nota más "leído" | Por minuto de llamada (Vapi) |
| `browser` | Voz del navegador (Chrome/Edge). Por turnos: hablás, pausa, contesta | Gratis |

Si el motor elegido no está configurado (falta su key), la app usa el siguiente que sí lo esté (Gemini Live → Vapi → navegador) y lo avisa en la pantalla previa a la llamada. Si falla al conectar (key inválida, cuota agotada, sin crédito, sin internet), la llamada muestra el motivo y un botón **Seguir con otra voz**.

### Gemini Live: cómo activarlo

1. Necesitás una `GEMINI_API_KEY` (la misma que usa la IA de texto). Se crea gratis en https://aistudio.google.com/apikey.
2. En el `.env`:
   ```
   VOICE_PROVIDER=gemini-live
   GEMINI_API_KEY=tu-key
   GEMINI_LIVE_MODEL=gemini-3.8-live
   GEMINI_LIVE_VOICE=auto
   ```
3. Reiniciá el servidor. En la terminal tiene que aparecer `Voz: gemini-live · modelo gemini-3.8-live · voz Kore / Orus (voz a voz nativa)`.
4. Usá **Chrome o Edge** y, si podés, **auriculares**: con parlantes, el cancelador de eco del navegador suele alcanzar, pero si el cliente "se interrumpe solo" es porque el micrófono escucha su propia voz.

**Voces:** con `GEMINI_LIVE_VOICE=auto` se elige femenina (`Kore`) o masculina (`Orus`) según el campo "Voz del cliente" del escenario o el nombre del cliente. Se pueden cambiar con `GEMINI_LIVE_VOICE_FEMENINA` / `GEMINI_LIVE_VOICE_MASCULINA`, o fijar una sola con `GEMINI_LIVE_VOICE=Aoede` (otras: Leda, Zephyr, Puck, Charon, Fenrir; se escuchan en https://aistudio.google.com/live). Todas hablan español: el acento rioplatense lo da la consigna del escenario.

**Cómo funciona:**
- El servidor genera un **token efímero** en `POST /api/voz/token` (un solo uso, 1 minuto para conectarse, 30 minutos de vida, atado a `GEMINI_LIVE_MODEL`). La `GEMINI_API_KEY` nunca llega al navegador.
- El navegador se conecta directo a Google por WebSocket con ese token: el audio no pasa por nuestro servidor. El micrófono se manda en PCM 16 kHz (AudioWorklet) y la respuesta llega en PCM 24 kHz, que se reproduce encadenada para que no se corte.
- La consigna del escenario va como instrucción de sistema y el cliente habla primero. Gemini detecta solo cuándo terminaste de hablar; si hablás encima, corta el audio del cliente al instante (también tocando la esfera).
- Gemini transcribe los dos lados: esa transcripción es la que ve el estudiante y la que se evalúa al final, igual que con los otros motores.
- Para cortar, el cliente se despide y llama a la herramienta `colgar` (el equivalente hablado de `[FIN]`); también se corta con **Colgar**.
- Google corta cada conexión a los ~10 minutos: la app la retoma sola (session resumption) sin perder la conversación.

**Plan gratuito y costo:**
- Con el plan gratuito de la API de Gemini, `gemini-3.8-live` no cobra ni la entrada ni la salida. Los límites del plan gratuito (sesiones simultáneas, pedidos por minuto y por día) dependen del proyecto y Google no los publica fijos para Live: se ven en AI Studio → **Rate limits**. Si se agotan, la llamada lo explica y ofrece **Seguir con otra voz**.
- **Ojo:** en el plan gratuito Google puede usar lo que se manda para mejorar sus productos. Por eso, en el plan gratuito no cargues datos reales de personas ni de clientes.
- En el plan pago, Google cobra el audio por minuto: US$ 0,005 por minuto de audio que escucha y US$ 0,018 por minuto de audio que habla. Como el micrófono se transmite toda la llamada y el cliente habla más o menos la mitad del tiempo, da **~US$ 0,015 a 0,025 por minuto**: una simulación de 5 minutos sale unos 10 centavos de dólar. (Precios de octubre de 2026: https://ai.google.dev/gemini-api/docs/pricing.)

**Latencia medida** (fin de la frase del estudiante → el cliente empieza a hablar; mismo escenario y mismo audio de estudiante, Chrome, 6 mediciones por motor, octubre de 2026):

| Motor | Mediana | Rango |
|---|---|---|
| Gemini Live (`gemini-3.8-live`) | ~1,1 s | 0,8 a 2,2 s |
| Vapi (Deepgram + Claude Haiku + Azure) | ~1,4 s sin superposición (~2 s contando todas) | 0,8 a 2,5 s |

La diferencia de latencia es chica; lo que cambia es cómo suena. En las pruebas, Vapi cortaba al cliente en pedazos (15 a 19 líneas de transcripción contra 6 de Gemini) y dos veces arrancó a hablar encima del estudiante; Gemini respetó los turnos y contestó con muletillas y reacciones ("Mirá, hace como dos semanas…, viste", "Ah, bueno, menos mal").

### Vapi: cómo configurarlo

1. Creá una cuenta en https://dashboard.vapi.ai (se puede entrar con Google).
2. En el panel, andá a **API Keys** (en el menú de la organización) y copiá la **Public Key**. No uses la Private Key: esa nunca va en el `.env` de esta app.
3. Si la public key tiene restricción de orígenes, agregá `http://localhost:3000`.
4. En el `.env`:
   ```
   VOICE_PROVIDER=vapi
   VAPI_PUBLIC_KEY=tu-public-key
   ```
5. Reiniciá el servidor. En la terminal tiene que aparecer `Voz: vapi · modelo anthropic/claude-haiku-4-5-20251001 · voces es-AR-ElenaNeural / es-AR-TomasNeural…`.

**Qué se cobra:** Vapi cobra por minuto de llamada: una tarifa de plataforma más lo que cuesta cada proveedor que usa (transcripción, modelo y voz). Con la configuración por defecto, cada minuto suele costar unos pocos centavos de dólar. El precio exacto y el saldo se ven en el panel de Vapi (**Billing**). Las cuentas nuevas suelen traer algo de crédito de prueba. Una simulación de 4 o 5 minutos gasta 4 o 5 minutos.

**Qué corre dónde:**
- El cliente simulado (el modelo que habla) corre dentro de Vapi con `VAPI_MODEL` y lo paga tu cuenta de Vapi: no usa tu plan de Claude.
- La **evaluación** y el informe los hace nuestro servidor con el proveedor de IA del `.env`.
- La public key llega al navegador (es pública por diseño). La private key nunca se usa.

**Cómo probarlo:**
1. Perfil Estudiante → elegí un escenario. La pantalla previa dice "Voz natural con Vapi".
2. Empezá la conversación y aceptá el permiso del micrófono.
3. El cliente habla primero. Respondele con naturalidad; probá interrumpirlo hablando encima (o tocando la esfera).
4. Despedite: cuando el cliente también se despide, la llamada se corta sola y aparece el informe. También podés tocar **Colgar**.

Variables para ajustar (todas opcionales): `VAPI_MODEL_PROVIDER` / `VAPI_MODEL` (modelo del cliente), `VAPI_VOICE_FEMENINA` / `VAPI_VOICE_MASCULINA` (voces de Azure; la voz se elige según el nombre del cliente del escenario), `VAPI_TRANSCRIBER` / `VAPI_TRANSCRIBER_MODEL` / `VAPI_LANGUAGE` (transcripción), `VAPI_ASSISTANT_ID` (usar un asistente creado en el panel, al que se le reemplazan las instrucciones por las del escenario).

El SDK de Vapi se sirve desde `public/vendor/vapi/` (copia fija de `@vapi-ai/web` 2.7.1), así la demo no depende de un CDN. Al conectar, el SDK igual necesita internet (Vapi y Daily, su proveedor de audio).

### Voz del navegador

- El reconocimiento de voz de Chrome necesita internet.
- Edge suele tener voces en español más naturales (por ejemplo, "Elena" o "Tomás", de Argentina). Se elige en la pantalla previa a la llamada, con el botón **Probar voz**.
- Si el micrófono falla o el navegador no reconoce voz, la app lo avisa y abre sola el cuadro para escribir.
- Si el navegador no está leyendo en voz alta, la llamada sigue igual: lo que dice el cliente se ve como subtítulo.

## Seguridad

- Las API keys del proveedor de IA viven solo en el `.env` del servidor: el navegador nunca las ve. `/api/config` solo informa si hay key cargada y cómo se llama la variable.
- Para Gemini Live, el navegador recibe solo un token efímero de un uso que vence en 30 minutos y sirve únicamente para el modelo de `GEMINI_LIVE_MODEL`.
- El `.env` y los datos están en `.gitignore`.
- El servidor escucha solo en `127.0.0.1` (no queda expuesto en la red).
- Los datos de los informes son de ejemplo: no cargues datos reales de personas.
