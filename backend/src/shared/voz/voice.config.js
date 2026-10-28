const { env } = require("../../config/env");
const { trimUrl, LIVE_KEYS } = require("../llm/providers.config");
// Voz: "gemini-live" (por defecto, voz a voz nativa), "vapi" o "browser" (voz del navegador).
// La PUBLIC key de Vapi puede llegar al navegador (así está diseñada). La private key, nunca: no se lee.
// GEMINI_API_KEY tampoco llega nunca al navegador: para Gemini Live se entrega un token efímero (/api/voz/token).
const VOZ_PROVEEDORES = ["gemini-live", "vapi", "browser"];
const VOICE = {
  provider: VOZ_PROVEEDORES.includes(env("VOICE_PROVIDER").toLowerCase()) ? env("VOICE_PROVIDER").toLowerCase() : "gemini-live",
  geminiLive: {
    disponible: LIVE_KEYS.length > 0,
    model: env("GEMINI_LIVE_MODEL") || "gemini-3.8-live",
    // "auto" elige voz femenina o masculina según el cliente del escenario.
    voice: env("GEMINI_LIVE_VOICE") || "auto",
    voiceFemenina: env("GEMINI_LIVE_VOICE_FEMENINA") || "Kore",
    voiceMasculina: env("GEMINI_LIVE_VOICE_MASCULINA") || "Orus",
    wsUrl: trimUrl(env("GEMINI_LIVE_WS_URL") || "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained")
  },
  vapiPublicKey: env("VAPI_PUBLIC_KEY"),
  vapiAssistantId: env("VAPI_ASSISTANT_ID"),
  vapi: {
    modelProvider: env("VAPI_MODEL_PROVIDER") || "anthropic",
    model: env("VAPI_MODEL") || "claude-haiku-4-5-20251001",
    voiceProvider: env("VAPI_VOICE_PROVIDER") || "azure",
    voiceFemenina: env("VAPI_VOICE_FEMENINA") || "es-AR-ElenaNeural",
    voiceMasculina: env("VAPI_VOICE_MASCULINA") || "es-AR-TomasNeural",
    transcriber: env("VAPI_TRANSCRIBER") || "deepgram",
    transcriberModel: env("VAPI_TRANSCRIBER_MODEL") || "nova-3",
    language: env("VAPI_LANGUAGE") || "es"
  }
};
module.exports = { VOZ_PROVEEDORES, VOICE };
