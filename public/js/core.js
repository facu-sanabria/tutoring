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

  // ---------------------------------------------------------------- configuración de la empresa
  // Contextos generales: siempre presentes (se pueden dejar vacíos, no borrar).
  const GENERALES = [
    { clave: "proposito", titulo: "Propósito del negocio", ayuda: "Qué hace la empresa, para quién y para qué existe." },
    { clave: "oferta", titulo: "Productos o servicios y clientes", ayuda: "Qué vendés u ofrecés, quiénes son tus clientes y qué valoran." },
    { clave: "trabajo", titulo: "Cómo trabajamos", ayuda: "Procesos, roles, horarios, herramientas y metodología." },
    { clave: "problemas", titulo: "Cómo encaramos un problema", ayuda: "El orden de pasos que esperás cuando algo sale mal." },
    { clave: "clientes", titulo: "Trato con clientes", ayuda: "Cómo se le habla a un cliente y qué no se hace nunca." },
    { clave: "calidad", titulo: "Criterios de calidad", ayuda: "Qué se revisa antes de dar algo por terminado." },
    { clave: "restricciones", titulo: "Restricciones", ayuda: "Lo que no se hace sin la persona responsable." }
  ];
  const ACCIONES_JUNIOR = ["entender", "trabajo", "tarea", "revisar"];
  // Del formato viejo (secciones fijas pensadas para software) al nuevo.
  const MAPA_VIEJO = { proposito: "proposito", producto: "oferta", metodologia: "trabajo", problemas: "problemas", clientes: "clientes", revision: "calidad", restricciones: "restricciones" };
  const TITULOS_VIEJOS = { arquitectura: "Arquitectura y módulos" };

  const str = v => (v == null ? "" : String(v));
  let secuencia = 0;
  const nuevoId = pref => `${pref}-${Date.now().toString(36)}${(secuencia++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const esFormatoViejo = cfg => Boolean(cfg) && typeof cfg === "object" && !Array.isArray(cfg.contextos) && cfg.contexto && typeof cfg.contexto === "object";

  // Convierte el formato viejo ({ contexto: {proposito, producto, ...}, archivos, senior }) al nuevo, sin perder nada.
  function migrarConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return null;
    if (!esFormatoViejo(cfg)) return normalizarConfig(cfg);
    const viejo = cfg.contexto || {};
    const contextos = GENERALES.map(g => {
      const claveVieja = Object.keys(MAPA_VIEJO).find(k => MAPA_VIEJO[k] === g.clave);
      return { id: "g-" + g.clave, clave: g.clave, titulo: g.titulo, contenido: str(viejo[claveVieja]).trim(), general: true };
    });
    Object.keys(viejo).forEach(k => {
      if (MAPA_VIEJO[k] || !str(viejo[k]).trim()) return;
      contextos.push({ id: "p-" + k.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), titulo: TITULOS_VIEJOS[k] || k, contenido: str(viejo[k]).trim(), general: false });
    });
    const nuevo = Object.assign({}, cfg, {
      version: 2,
      rubro: cfg.rubro || "Software",
      responsable: { nombre: str(cfg.senior).trim(), rol: "Líder técnico" },
      contextos,
      documentos: Array.isArray(cfg.archivos) ? cfg.archivos : []
    });
    delete nuevo.contexto; delete nuevo.archivos; delete nuevo.senior;
    return normalizarConfig(nuevo);
  }

  // Deja la configuración completa y ordenada: generales primero (todos, en su orden) y después los particulares.
  function normalizarConfig(cfg) {
    const c = Object.assign({}, cfg);
    c.version = 2;
    c.empresa = str(c.empresa);
    c.rubro = str(c.rubro);
    const r = c.responsable && typeof c.responsable === "object" ? c.responsable : { nombre: str(c.senior), rol: "" };
    c.responsable = { nombre: str(r.nombre), rol: str(r.rol) };
    delete c.senior;
    const lista = (Array.isArray(c.contextos) ? c.contextos : []).filter(x => x && typeof x === "object");
    const generales = GENERALES.map(g => {
      const x = lista.find(y => y.general && y.clave === g.clave) || {};
      return { id: str(x.id) || "g-" + g.clave, clave: g.clave, titulo: str(x.titulo).trim() || g.titulo, contenido: str(x.contenido), general: true };
    });
    const particulares = lista.filter(y => !(y.general && GENERALES.some(g => g.clave === y.clave)))
      .map(y => ({ id: str(y.id) || nuevoId("p"), titulo: str(y.titulo), contenido: str(y.contenido), general: false }));
    c.contextos = generales.concat(particulares);
    const docs = Array.isArray(c.documentos) ? c.documentos : Array.isArray(c.archivos) ? c.archivos : [];
    c.documentos = docs.filter(d => d && d.nombre).map(d => ({ nombre: str(d.nombre), contenido: str(d.contenido) }));
    delete c.archivos; delete c.contexto;
    const te = c.tareaEjemplo;
    const obj = te && typeof te === "object" ? te : { tarea: str(te) };
    c.tareaEjemplo = {};
    ACCIONES_JUNIOR.forEach(k => { c.tareaEjemplo[k] = str(obj[k]); });
    c.escenarios = Array.isArray(c.escenarios) ? c.escenarios : [];
    c.criterios = Array.isArray(c.criterios) ? c.criterios : [];
    c.notasEvaluacion = str(c.notasEvaluacion);
    return c;
  }

  // Texto de un contexto general por su clave ("" si está vacío).
  const contextoDe = (cfg, clave) => {
    const x = ((cfg && cfg.contextos) || []).find(c => c.general && c.clave === clave);
    return x ? str(x.contenido).trim() : "";
  };
  // "Martín Sosa (líder técnico)" o solo el nombre si no hay rol.
  function responsableTexto(cfg) {
    const r = (cfg && cfg.responsable) || {};
    const nombre = str(r.nombre).trim() || str(cfg && cfg.senior).trim() || "la persona responsable";
    const rol = str(r.rol).trim();
    return rol ? `${nombre} (${rol.charAt(0).toLowerCase() + rol.slice(1)})` : nombre;
  }
  const esSoftware = cfg => /software|sistemas|tecnolog|desarrollo|programaci|inform[aá]tica|\bit\b|saas/i.test(str(cfg && cfg.rubro));

  const api = { normalizarHistorial, extraerJSON, parseEvaluacion, puntajeCriterio, puntajePonderado, buscarCriterio, clave, textoHablable, largoDecible,
    GENERALES, ACCIONES_JUNIOR, esFormatoViejo, migrarConfig, normalizarConfig, contextoDe, responsableTexto, esSoftware, nuevoId };

  if (typeof module === "object" && module.exports) module.exports = api;
  else { raiz.T = raiz.T || {}; raiz.T.core = api; }
})(typeof window !== "undefined" ? window : globalThis);
