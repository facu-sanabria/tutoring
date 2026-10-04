/* Falsa API de IA para las pruebas: habla los dos protocolos (Gemini compatible con
   OpenAI y Claude) sin salir a internet. El servidor la usa poniendo
   GEMINI_BASE_URL / ANTHROPIC_BASE_URL apuntando acá.

   Qué contesta se decide mirando el pedido:
   - si el system dice "evaluador"  -> devuelve el JSON de evaluación
   - si dice "POR VOZ"              -> devuelve una línea corta del cliente simulado
   - si dice "mentor de IA"         -> devuelve una respuesta con los bloques [Técnico] etc.
   - si el último mensaje del usuario contiene FALLA_<CASO> -> simula ese error
*/
import http from "node:http";

export const EVAL_JSON = {
  resumen: "Escuchó a la clienta, hizo preguntas concretas y cerró con un próximo paso claro.",
  criterios: [
    { nombre: "Escucha activa", puntaje: 4, evidencia: "Entiendo, contame desde cuándo pasa.", comentario: "Dejó hablar y retomó lo dicho." },
    { nombre: "Preguntas para entender", puntaje: 5, evidencia: "¿Pasa con WhatsApp o también con email?", comentario: "Preguntó antes de proponer." },
    { nombre: "Claridad", puntaje: 4, evidencia: "Se lo explico simple: se están enviando dos veces.", comentario: "Sin tecnicismos." },
    { nombre: "Empatía", puntaje: 3, evidencia: "Entiendo que es un problema con tus pacientes.", comentario: "Reconoció el malestar." },
    { nombre: "Manejo de expectativas", puntaje: 4, evidencia: "No te prometo una fecha hasta hablar con el equipo.", comentario: "No prometió de más." },
    { nombre: "Cierre y próximos pasos", puntaje: 4, evidencia: "Te escribo hoy a las 15 con novedades.", comentario: "Dejó un compromiso concreto." }
  ],
  fortalezas: ["Preguntó antes de proponer", "Habló sin tecnicismos"],
  a_mejorar: ["Resumir lo acordado al final", "Confirmar el canal de contacto"],
  como_encaro: ["Escuchó el reclamo", "Preguntó alcance y desde cuándo", "Explicó el problema en simple", "Acordó un próximo paso"],
  expresion: "Tono calmo y frases cortas. Se entendió bien.",
  preguntas_entrevista: ["¿Cómo priorizarías este caso?", "¿Qué harías si el cliente insiste con una fecha?"]
};

const VOZ = "Hola, buen día. Te llamo porque mis pacientes están recibiendo dos mensajes por cada turno.";
const MENTOR = [
  "[Técnico] jobs/recordatorios.js corre cada 15 minutos: hace un SELECT de los turnos con recordatorio_enviado = false y después manda el mensaje.",
  "",
  "[Negocio] Los recordatorios bajaron las ausencias un 30%: es la función que más valoran los clientes.",
  "",
  "[Cómo lo hacemos acá] Antes de tocar nada, reproducimos el problema y escribimos el test del caso.",
  "",
  "[Tu turno] ¿Qué pasa si las dos réplicas hacen el SELECT al mismo tiempo?"
].join("\n");

function replyFor(system, lastUser) {
  const s = String(system || "");
  const u = String(lastUser || "");
  const say = u.match(/DECI:(.+)$/);
  if (say) return say[1].trim();
  if (/evaluador/i.test(s)) return JSON.stringify(EVAL_JSON);
  if (/POR VOZ/i.test(s)) return VOZ;
  if (/mentor de IA/i.test(s)) return MENTOR;
  return "Respuesta de prueba.";
}

function falla(lastUser) {
  const m = String(lastUser || "").match(/FALLA_([A-Z_]+)/);
  return m ? m[1] : "";
}

// Parte el texto en pedacitos para que el streaming se parezca al real.
function trozos(text, n = 12) {
  const out = [];
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
  return out;
}

const readBody = req => new Promise(res => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => res(b)); });

export async function startFakeLLM() {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    let payload = {};
    try { payload = JSON.parse(body); } catch (_) {}
    const url = req.url.split("?")[0];
    const esGemini = url.endsWith("/chat/completions");
    const msgs = payload.messages || [];
    const system = esGemini ? (msgs.find(m => m.role === "system") || {}).content : payload.system;
    const users = msgs.filter(m => m.role === "user");
    const lastUser = users.length ? users[users.length - 1].content : "";
    calls.push({ url, auth: req.headers.authorization || req.headers["x-api-key"] || req.headers["x-goog-api-key"] || "", payload });

    // Tokens efímeros de Gemini Live (POST /v1alpha/auth_tokens).
    if (url.endsWith("/v1alpha/auth_tokens")) {
      const key = req.headers["x-goog-api-key"] || "";
      res.writeHead(key === "clave-sin-cuota" ? 429 : 200, { "content-type": "application/json" });
      return res.end(JSON.stringify(key === "clave-sin-cuota"
        ? { error: { code: 429, message: "Resource has been exhausted (e.g. check quota)." } }
        : { name: "auth_tokens/token-falso-123" }));
    }

    const caso = falla(lastUser);
    const jsonErr = (status, message) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message, code: status } }));
    };
    if (caso === "KEY") return jsonErr(400, "API key not valid. Please pass a valid API key.");
    if (caso === "CUOTA") return jsonErr(429, "Resource has been exhausted (e.g. check quota).");
    if (caso === "MODELO") return jsonErr(404, "models/inexistente is not found for API version v1beta");
    if (caso === "APAGADA") return jsonErr(403, "Generative Language API has not been used in project 800111611422 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=800111611422 then retry.");
    if (caso === "RARO") { res.writeHead(500, { "content-type": "text/html" }); return res.end("<html>Bad Gateway</html>"); }
    if (caso === "JSON") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Respuesta sin streaming." } }] }));
    }
    if (caso === "VACIO") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n');
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    if (caso === "CORTE") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Arranco y "}}]}\n\n');
      setTimeout(() => res.destroy(), 60);   // se cae a mitad del stream, ya con datos entregados
      return;
    }

    const evaluaciones = calls.filter(c => c.url === url && c.payload.messages.some(m => m.content === lastUser)).length;
    const incompleta = caso === "EVAL_TRUNCADA" && evaluaciones === 1;
    const invalida = caso === "EVAL_INVALIDA" && evaluaciones === 1;
    const sinCriterios = caso === "EVAL_SIN_CRITERIOS";
    const text = incompleta ? '{"criterios":[' : invalida ? 'No es JSON' : sinCriterios ? '{"resumen":"sin criterios"}' : replyFor(system, lastUser);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
    if (esGemini) {
      for (const t of trozos(text)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: incompleta ? "length" : "stop" }] })}\n\n`);
      res.write("data: [DONE]\n\n");
    } else {
      const ev = (type, obj) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`);
      ev("message_start", { message: { role: "assistant" } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      for (const t of trozos(text)) ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } });
      ev("content_block_stop", { index: 0 });
      ev("message_stop", {});
    }
    res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    port,
    calls,
    gemini: `http://127.0.0.1:${port}/gemini`,
    anthropic: `http://127.0.0.1:${port}/anthropic`,
    live: `http://127.0.0.1:${port}/live`,
    close: () => new Promise(r => server.close(r))
  };
}
