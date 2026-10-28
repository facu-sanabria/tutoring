const { tokenGeminiLive } = require("../../../shared/voz/gemini-live");

// Token efímero para Gemini Live: el navegador se conecta directo a Google con esto
// (sin pasar el audio por nuestro servidor) y la GEMINI_API_KEY no sale de acá.
// pedido: {descartar, motivo} cuando la key anterior falló en el navegador.
async function token(pedido) {
  const r = await tokenGeminiLive({
    descartar: Number.isInteger(pedido.descartar) ? pedido.descartar : undefined,
    motivo: typeof pedido.motivo === "string" ? pedido.motivo.slice(0, 160) : ""
  });
  const maxMinutos = Math.min(60, Math.max(1, Number(process.env.CALL_MAX_MINUTES) || 15));
  return r.error ? r : { ...r, maxMinutos };
}

module.exports = { token };
