/* Comunicación con el servidor (server.js). La API key nunca pasa por acá. */
window.T = window.T || {};

T.api = (function () {
  async function jsonReq(url, opts = {}) {
    let res;
    try {
      res = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
    } catch (e) {
      const err = new Error("No se pudo conectar con el servidor. ¿Sigue corriendo npm start?");
      err.offline = true; throw err;
    }
    let cuerpo = null;
    try { cuerpo = await res.json(); } catch (_) {}
    if (!res.ok) {
      const msg = (cuerpo && cuerpo.error && cuerpo.error.message) || "HTTP " + res.status;
      const e = new Error(msg);
      e.status = res.status;
      e.type = (cuerpo && cuerpo.error && cuerpo.error.type) || "";
      throw e;
    }
    return cuerpo;
  }

  // Llama al modelo de IA (el proveedor lo elige el servidor según el .env) con streaming.
  // purpose: "chat" | "voice" | "eval" (el servidor elige el modelo).
  // onStatus(texto): avisos mientras espera, por ejemplo "Reintentando…".
  async function claude({ purpose = "chat", system, messages, maxTokens = 1024, onText, onStatus, signal }) {
    const historial = T.core.normalizarHistorial(messages, 40);
    if (!historial.length) throw Object.assign(new Error("No hay nada para enviar."), { status: 400 });

    let res;
    try {
      res = await fetch("/api/messages", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, system, messages: historial, max_tokens: maxTokens, stream: true })
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw Object.assign(new Error("No se pudo conectar con el servidor. ¿Sigue corriendo npm start?"), { offline: true });
    }

    if (!res.ok) {
      let msg = "", type = "";
      try { const j = await res.json(); msg = (j.error && j.error.message) || ""; type = (j.error && j.error.type) || ""; } catch (_) {}
      const err = new Error(msg || res.statusText || "Error de la API");
      err.status = res.status; err.type = type; throw err;
    }
    if (!res.body) throw Object.assign(new Error("El servidor no devolvió contenido."), { status: 502 });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", text = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const eventos = buffer.split("\n\n");
        buffer = eventos.pop();
        for (const ev of eventos) {
          // Un evento SSE puede traer varias líneas "data:": se concatenan.
          const datos = ev.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
          if (!datos || datos === "[DONE]") continue;
          let data; try { data = JSON.parse(datos); } catch (_) { continue; }
          if (data.type === "content_block_delta" && data.delta && data.delta.type === "text_delta") {
            text += data.delta.text;
            if (onText) onText(text, data.delta.text);
          } else if (data.type === "retry") {
            if (onStatus) onStatus(data.message || "Reintentando…");
          } else if (data.type === "provider") {
            // El servidor pasó al proveedor de respaldo: lo mostramos en la barra superior.
            if (onStatus) onStatus(`Usando el respaldo: ${data.name}…`);
            if (onProviderChange) onProviderChange(data);
          } else if (data.type === "error") {
            const e = data.error || {};
            const err = new Error(e.message || "Error de la API");
            err.status = Number(e.status) || (e.type === "overloaded_error" ? 529 : 500);
            err.type = e.type || "";
            err.partial = text; throw err;
          }
        }
      }
    } finally {
      try { reader.cancel(); } catch (_) {}
    }
    return text;
  }

  let keyVar = "la API key", aiName = "La IA", onProviderChange = null;
  function setProvider(cfg) { if (cfg && cfg.keyVar) keyVar = cfg.keyVar; if (cfg && cfg.providerName) aiName = cfg.providerName; }

  // Un mensaje que el usuario pueda entender (y accionar) para cada tipo de error.
  function errorCopy(e) {
    if (!e) return "Algo falló. Probá de nuevo.";
    if (e.name === "AbortError") return "";
    if (e.offline) return "No se pudo conectar con el servidor. ¿Sigue corriendo npm start?";
    if (e.type === "missing_key") return e.message || `Falta la API key: pegala en el archivo .env (${keyVar}) y reiniciá el servidor.`;
    if (e.type === "sesion") return e.message;
    if (e.type === "limite_plan") return e.message;
    if (e.type === "timeout") return e.message + " Probá de nuevo.";
    if (e.status === 401) return e.message || `La API key no es válida. Revisá ${keyVar} en el .env y reiniciá el servidor.`;
    if (e.status === 403) return e.message || "La API key no tiene permiso para usar este modelo.";
    if (e.status === 404) return e.message || "El modelo configurado en el .env no está disponible para tu key. Probá con otro modelo.";
    if (e.status === 413) return e.message || "El contenido es demasiado grande. Quitá algún archivo del contexto.";
    if (e.status === 429) return e.message || "Se alcanzó el límite de consultas del plan. Esperá un minuto y probá de nuevo.";
    if (e.status === 529 || e.status === 503) return e.message && !/^Error de la API$/.test(e.message) ? e.message + " Probá de nuevo en unos segundos." : `${aiName} está saturado en este momento. Probá de nuevo en unos segundos.`;
    if (e.status === 502) return e.message || `No se pudo hablar con ${aiName}. Revisá tu conexión a internet.`;
    if (e.status === 400) return "La API rechazó el pedido: " + (e.message || "sin detalle");
    if (e instanceof TypeError) return "No se pudo conectar con el servidor. ¿Sigue corriendo npm start?";
    if (e.message) return e.message;
    return "Se cortó la respuesta. Probá de nuevo.";
  }

  return {
    claude,
    errorCopy,
    setProvider,
    onProvider: fn => { onProviderChange = fn; },
    config: () => jsonReq("/api/config"),
    diagnostico: () => jsonReq("/api/diagnostico"),
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
