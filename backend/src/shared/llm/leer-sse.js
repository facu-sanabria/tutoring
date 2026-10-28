const { provError } = require("./errores");
// Lee un stream SSE línea por línea y le pasa cada JSON a `alRecibir`.
async function leerSSE(body, ctx, alRecibir, nombre) {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;
        let j; try { j = JSON.parse(data); } catch (_) { continue; }
        alRecibir(j);
      }
    }
  } catch (e) {
    if (ctx.signal.aborted || e.status) throw e;
    throw provError(502, `Se cortó la respuesta de ${nombre} a mitad de camino.`, "network");
  }
}
module.exports = { leerSSE };
