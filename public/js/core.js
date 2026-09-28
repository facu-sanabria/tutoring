/* Lógica pura, sin DOM: historial, parseo de la evaluación, puntaje y corte de
   oraciones para la voz. Está en un archivo aparte para poder probarla con
   `npm test` (funciona igual en el navegador y en Node). */
(function (raiz) {
  "use strict";

  // ---------------------------------------------------------------- historial
  // El modelo exige que los mensajes alternen user/assistant y empiecen en user.
  // Junta los seguidos del mismo rol, descarta los vacíos y corta los primeros si hacen falta.
  function normalizarHistorial(lista, maximo) {
    const out = [];
    (Array.isArray(lista) ? lista : []).forEach(m => {
      if (!m) return;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content == null ? "" : m.content).trim();
      if (!content) return;
      const last = out[out.length - 1];
      if (last && last.role === role) last.content += "\n\n" + content;
      else out.push({ role, content });
    });
    // Primero recortamos por cantidad y después aseguramos que arranque en user:
    // al revés, el recorte podría volver a dejar un assistant al principio.
    const cortado = maximo > 0 ? out.slice(-maximo) : out;
    while (cortado.length && cortado[0].role !== "user") cortado.shift();
    return cortado;
  }

  // ---------------------------------------------------------------- evaluación
  const LISTAS = ["fortalezas", "a_mejorar", "como_encaro", "preguntas_entrevista"];

  // Intenta sacar el objeto JSON de la respuesta del modelo, aunque venga con
  // texto alrededor, en un bloque ``` o con alguna coma de más.
  function extraerJSON(texto) {
    const t = String(texto == null ? "" : texto).trim();
    if (!t) return null;
    const candidatos = [t];
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidatos.push(fence[1]);
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) candidatos.push(t.slice(a, b + 1));
    for (const c of candidatos) {
      const limpio = c.trim();
      if (!limpio) continue;
      for (const intento of [limpio, limpio.replace(/,\s*([}\]])/g, "$1")]) {
        try { const v = JSON.parse(intento); if (v && typeof v === "object") return v; } catch (_) {}
      }
    }
    return null;
  }

  const texto1 = v => (v == null ? "" : Array.isArray(v) ? v.map(texto1).filter(Boolean).join(" ") : typeof v === "object" ? "" : String(v).trim());
  const lista1 = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(texto1).filter(Boolean);

  // Deja la evaluación con la forma que espera el informe. Devuelve null si no hay criterios.
  function parseEvaluacion(texto) {
    const raw = extraerJSON(texto);
    if (!raw) return null;
    const crits = Array.isArray(raw.criterios) ? raw.criterios
      : Array.isArray(raw.criterias) ? raw.criterias
        : Array.isArray(raw.evaluacion && raw.evaluacion.criterios) ? raw.evaluacion.criterios : null;
    if (!crits || !crits.length) return null;
    const ev = {
      resumen: texto1(raw.resumen || raw.summary),
      criterios: crits.filter(Boolean).map(c => ({
        nombre: texto1(c.nombre || c.criterio || c.name),
        puntaje: puntajeCriterio(c.puntaje != null ? c.puntaje : c.score),
        evidencia: texto1(c.evidencia || c.cita || c.evidence),
        comentario: texto1(c.comentario || c.comment)
      })),
      expresion: texto1(raw.expresion)
    };
    LISTAS.forEach(k => { ev[k] = lista1(raw[k]); });
    return ev;
  }

  // ---------------------------------------------------------------- puntaje
  // Acepta 4, "4", "4/5", "4,5" o "puntaje 4". Devuelve un entero de 1 a 5, o null.
  function puntajeCriterio(valor) {
    if (valor == null) return null;
    let n = typeof valor === "number" ? valor : NaN;
    if (!Number.isFinite(n)) {
      const m = String(valor).replace(",", ".").match(/-?\d+(\.\d+)?/);
      if (!m) return null;
      n = Number(m[0]);
    }
    if (!Number.isFinite(n)) return null;
    n = Math.round(n);
    if (n < 1 || n > 5) return null;
    return n;
  }

  function sinAcentos(s) {
    const t = String(s == null ? "" : s);
    return t.normalize ? t.normalize("NFD").replace(/[̀-ͯ]/g, "") : t;
  }
  const clave = s => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Busca en la evaluación el criterio que definió el senior: primero por nombre
  // (sin importar acentos ni mayúsculas) y, si no aparece, por posición.
  function buscarCriterio(def, i, evaluados) {
    const k = clave(def && def.nombre);
    let r = k ? (evaluados || []).find(x => clave(x && x.nombre) === k) : null;
    if (!r && k) r = (evaluados || []).find(x => { const k2 = clave(x && x.nombre); return k2 && (k2.indexOf(k) === 0 || k.indexOf(k2) === 0); });
    if (!r && (evaluados || []).length === (def && def.total)) r = evaluados[i];
    return r || null;
  }

  // Puntaje de 0 a 100 ponderado por el peso de cada criterio.
  // Solo promedia los criterios que el modelo realmente puntuó e informa la cobertura,
  // para que el informe pueda avisar si quedó incompleto.
  function puntajePonderado(definidos, evaluados) {
    const defs = Array.isArray(definidos) ? definidos : [];
    const evs = Array.isArray(evaluados) ? evaluados : [];
    let num = 0, den = 0, cubiertos = 0;
    defs.forEach((c, i) => {
      const r = buscarCriterio({ nombre: c && c.nombre, total: defs.length }, i, evs);
      const p = puntajeCriterio(r && r.puntaje);
      if (p == null) return;
      let peso = Number(c && c.peso);
      if (!Number.isFinite(peso) || peso <= 0) peso = 1;
      num += p * peso; den += 5 * peso; cubiertos++;
    });
    return { puntaje: den ? Math.round((num / den) * 100) : null, cubiertos, total: defs.length };
  }

  // ---------------------------------------------------------------- voz
  // Limpia lo que no se tiene que leer en voz alta.
  function textoHablable(t) {
    return String(t == null ? "" : t)
      .replace(/\[\s*FIN\s*\]/gi, " ")
      .replace(/```[\s\S]*?(```|$)/g, " ")
      .replace(/\*\*?|[_#`>~]/g, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const FIN_ORACION = /[.!?…](["»”’)]+)?(\s|$)/g;
  const CORTE_BLANDO = /[,;:—]\s/g;

  // Cuánto del texto pendiente conviene mandar a la síntesis de voz.
  // - `forzar`: ya llegó todo, se manda lo que quede.
  // - si no hay punto todavía pero se acumuló mucho, corta en una coma o en un espacio:
  //   así el cliente simulado empieza a hablar antes y la espera se siente más corta.
  function largoDecible(pendiente, forzar, minimo) {
    const t = String(pendiente == null ? "" : pendiente);
    if (!t) return 0;
    if (forzar) return t.length;
    const min = minimo || 0;
    let corte = 0, m;
    FIN_ORACION.lastIndex = 0;
    while ((m = FIN_ORACION.exec(t))) corte = m.index + m[0].length;
    if (corte > 0 && corte >= min) return corte;
    if (t.length < 140) return corte;
    let blando = 0;
    CORTE_BLANDO.lastIndex = 0;
    while ((m = CORTE_BLANDO.exec(t))) { if (m.index + m[0].length <= 220) blando = m.index + m[0].length; }
    if (blando >= 30) return blando;
    const esp = t.lastIndexOf(" ", 200);
    return esp > 30 ? esp + 1 : corte;
  }

  const api = { normalizarHistorial, extraerJSON, parseEvaluacion, puntajeCriterio, puntajePonderado, buscarCriterio, clave, textoHablable, largoDecible };

  if (typeof module === "object" && module.exports) module.exports = api;
  else { raiz.T = raiz.T || {}; raiz.T.core = api; }
})(typeof window !== "undefined" ? window : globalThis);
