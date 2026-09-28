# Tutoring

Simulaciones por voz para evaluar habilidades blandas de candidatos y un mentor de IA para juniors. Todo usa el contexto que carga el senior de la empresa.

## Cómo levantarlo

Requisito: Node.js 18 o superior (`node -v`). No hay que instalar paquetes.

1. Conseguí una API key (ver abajo) y pegala en el archivo `.env`.
2. En la carpeta del proyecto ejecutá:
   ```
   npm start
   ```
3. Entrá a **http://localhost:3000** con **Chrome o Edge** (son los que reconocen voz).
4. La primera vez que empieces una llamada, el navegador pide permiso para usar el micrófono: aceptalo.

Arriba a la derecha tiene que aparecer **"IA conectada"** en verde.

## Proveedor de IA

Se elige en el `.env` con `LLM_PROVIDER`. El resto de la app no cambia.

| `LLM_PROVIDER` | Key | Costo |
|---|---|---|
| `gemini` (por defecto) | `GEMINI_API_KEY`: se crea gratis en https://aistudio.google.com/apikey con tu cuenta de Google | Plan gratuito con límites por minuto y por día |
| `anthropic` | `ANTHROPIC_API_KEY`: se crea en https://console.anthropic.com | Pago por uso (hay que cargar crédito) |

Notas sobre Gemini gratis:
- Si aparece "límite de consultas", esperá un minuto. Los límites exactos se ven en AI Studio.
- Si un modelo no está disponible para tu key, cambiá `GEMINI_MODEL` / `GEMINI_MODEL_VOICE` en el `.env` por otro de la lista de AI Studio y reiniciá.
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
server.js            servidor (sirve la app, reenvía a Claude, guarda datos)
.env                 API key y configuración
data/                configuración de la empresa e informes (se crean solos)
public/index.html
public/css/styles.css
public/js/defaults.js   empresa de ejemplo (Nodo Software)
public/js/prompts.js    instrucciones que recibe Claude en cada modo
public/js/voice.js      motor de voz (navegador o Vapi)
public/js/api.js        llamadas al servidor
public/js/app.js        interfaz
```

## Voz

- Por defecto usa la voz del navegador (`VOICE_PROVIDER=browser`). El reconocimiento de voz de Chrome necesita internet.
- Edge suele tener voces en español más naturales (por ejemplo, "Elena" o "Tomás", de Argentina). Se elige en la pantalla previa a la llamada.
- Si el micrófono falla, se puede escribir durante la llamada (botón del teclado).

### Pasar a Vapi (a futuro)

`public/js/voice.js` tiene las dos implementaciones con la misma interfaz. Para usar Vapi:

1. Creá una cuenta en Vapi y copiá tu **public key**.
2. En el `.env`: `VOICE_PROVIDER=vapi` y `VAPI_PUBLIC_KEY=...` (opcional: `VAPI_ASSISTANT_ID`).
3. Reiniciá el servidor.

La integración con Vapi quedó preparada pero no está probada: revisala antes de usarla en una demo.

## Seguridad

Las API keys viven solo en el `.env` del servidor: el navegador nunca la ve. El `.env` y los datos están en `.gitignore`.
