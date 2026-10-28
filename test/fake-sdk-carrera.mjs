// Simula Claude Code para probar la carrera de la evaluación. Nunca usa la red.
// FAKE_SDK_MODO=colgado: el primer pedido manda un pedazo de texto y se cuelga; el segundo responde bien.
// FAKE_SDK_MODO=lento: el primero tarda 3 s en responder bien; el segundo nunca termina.
import { EVAL_JSON } from "./fake-llm.mjs";
let n = 0;
const dormir = (ms, signal) => new Promise(r => { const t = setTimeout(r, ms); signal && signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });
export function query({ prompt, options }) {
  // El chequeo de sesión del servidor no manda texto: no cuenta como pedido.
  const yo = typeof prompt === "string" ? ++n : 0;
  const ac = options && options.abortController;
  const modo = process.env.FAKE_SDK_MODO || "colgado";
  return {
    accountInfo: async () => ({ subscriptionType: "pro", tokenSource: "test" }),
    close() {},
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init" };
      const json = JSON.stringify(EVAL_JSON);
      const cuelga = modo === "colgado" ? yo === 1 : yo !== 1;
      if (cuelga) {
        yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: json.slice(0, 20) } } };
        await dormir(600000, ac && ac.signal);
        return;
      }
      if (modo === "lento") await dormir(3000, ac && ac.signal);
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: json } } };
      yield { type: "result", subtype: "success", usage: { input_tokens: 10, output_tokens: 20 } };
    }
  };
}
