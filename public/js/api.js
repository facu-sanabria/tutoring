/* Comunicación con el servidor (server.js). La API key nunca pasa por acá. */
window.T = window.T || {};

T.api = (function () {
  async function jsonReq(url, opts = {}) {
    const res = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
    if (!res.ok) { const e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  // Llama al modelo de IA (Gemini o Claude, según el .env) con streaming. purpose: "chat" | "voice" | "eval" (el servidor elige el modelo).
  async function claude({ purpose = "chat", system, messages, maxTokens = 1024, onText, signal }) {
    const res = await fetch("/api/messages", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose, system, messages, max_tokens: maxTokens, stream: true })
    });
    if (!res.ok) {
      let msg = "", type = "";
      try { const j = await res.json(); msg = j.error && j.error.message || ""; type = j.error && j.error.type || ""; } catch (_) {}
      const err = new Error(msg || res.statusText); err.status = res.status; err.type = type; throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const ev of events) {
        const line = ev.split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        let data; try { data = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
        if (data.type === "content_block_delta" && data.delta && data.delta.type === "text_delta") {
          text += data.delta.text;
          if (onText) onText(text, data.delta.text);
        } else if (data.type === "error") {
          const err = new Error(data.error && data.error.message || "Error de la API");
          err.status = data.error && data.error.type === "overloaded_error" ? 529 : 500;
          err.partial = text; throw err;
        }
      }
    }
    return text;
  }

  let keyVar = "la API key", aiName = "La IA";
  function setProvider(cfg) { if (cfg && cfg.keyVar) keyVar = cfg.keyVar; if (cfg && cfg.providerName) aiName = cfg.providerName; }

  function errorCopy(e) {
    if (e && e.name === "AbortError") return "";
    if (e && e.type === "missing_key") return `Falta la API key: pegala en el archivo .env (${keyVar}) y reiniciá el servidor.`;
    if (e && e.status === 401) return `La API key no es válida. Revisá ${keyVar} en el .env y reiniciá el servidor.`;
    if (e && e.status === 403) return "La API key no tiene permiso para usar este modelo.";
    if (e && e.status === 404) return "El modelo configurado en el .env no está disponible para tu key. Probá con otro modelo.";
    if (e && e.status === 429) return "Se alcanzó el límite de consultas del plan. Esperá un minuto y probá de nuevo.";
    if (e && (e.status === 529 || e.status === 503)) return `${aiName} está saturado en este momento. Probá de nuevo en unos segundos.`;
    if (e && e.status === 400) return "La API rechazó el pedido: " + e.message;
    if (e instanceof TypeError) return "No se pudo conectar con el servidor. ¿Sigue corriendo npm start?";
    return "Se cortó la respuesta. Probá de nuevo.";
  }

  return {
    claude,
    errorCopy,
    setProvider,
    config: () => jsonReq("/api/config"),
    empresa: {
      get: () => jsonReq("/api/empresa"),
      save: data => jsonReq("/api/empresa", { method: "PUT", body: JSON.stringify(data) })
    },
    informes: {
      list: () => jsonReq("/api/informes"),
      get: id => jsonReq("/api/informes/" + encodeURIComponent(id)),
      save: data => jsonReq("/api/informes", { method: "POST", body: JSON.stringify(data) }),
      remove: id => jsonReq("/api/informes/" + encodeURIComponent(id), { method: "DELETE" })
    }
  };
})();
