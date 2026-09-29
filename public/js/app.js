/* Tutoring: lógica de la interfaz. */
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  let avisoStorage = false;
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (_) { return f; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (_) {
        if (!avisoStorage) { avisoStorage = true; setTimeout(() => toast("No se pudo guardar en este navegador (almacenamiento lleno o modo privado)."), 0); }
        return false;
      }
    }
  };
  // Crea elementos sin usar innerHTML con datos del usuario.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  const svg = (paths, vb = "0 0 20 20") => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", vb); s.innerHTML = paths; return s; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const initials = n => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const firstName = n => (n || "").split(/\s+/)[0] || n;
  const enPersona = e => T.prompts.enPersona(e);
  const clientName = e => (e.cliente || "El cliente").split(",")[0].trim();
  const fmtDate = iso => { try { return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (_) { return iso; } };
  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let toastT;
  function toast(msg, ms) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms || 2600); }

  const ICON = {
    sims: '<path d="M10 2.5a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0v-4a3 3 0 0 0-3-3z"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>',
    reports: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M8 9h5M8 12h5M8 15h3"/>',
    ctx: '<path d="M3 5.5 10 2.5l7 3-7 3z"/><path d="M3 10l7 3 7-3M3 14.5l7 3 7-3"/>',
    esc: '<path d="M4 5h12v8H9l-4 3v-3H4z"/>',
    crit: '<path d="M4 15.5V11M8 15.5V7M12 15.5V9M16 15.5V4"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    code: '<path d="M7 6 3 10l4 4M13 6l4 4-4 4"/>',
    flow: '<circle cx="5" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 5h4a4 4 0 0 1 4 4v4"/>',
    ticket: '<path d="M3 6h14v2.5a1.5 1.5 0 0 0 0 3V14H3v-2.5a1.5 1.5 0 0 0 0-3z"/><path d="M8 6v8" stroke-dasharray="1.5 1.5"/>',
    check: '<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>',
    chevron: '<path d="M5 8l5 5 5-5"/>',
    x: '<path d="M5 5l10 10M15 5 5 15"/>',
    mic: '<rect x="7" y="2.5" width="6" height="10" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>',
    micOff: '<path d="M3 3l14 14"/><path d="M7 7v2.5a3 3 0 0 0 5 2.2M13 9V5.5a3 3 0 0 0-5.8-1"/><path d="M4.5 9.5a5.5 5.5 0 0 0 9 4.2M15.5 9.5c0 .6-.1 1.2-.3 1.7M10 15v2.5"/>',
    keyboard: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8h1M8.5 8h1M11.5 8h1M14.5 8h0M6 12h8"/>',
    list: '<path d="M7 5.5h10M7 10h10M7 14.5h10M3.5 5.5h0M3.5 10h0M3.5 14.5h0"/>',
    phone: '<path d="M5.2 3h2.6l1.3 3.4-1.7 1.1a8.5 8.5 0 0 0 5.1 5.1l1.1-1.7 3.4 1.3v2.6a1.6 1.6 0 0 1-1.7 1.6A13.5 13.5 0 0 1 3.6 4.7 1.6 1.6 0 0 1 5.2 3z"/>',
    hangup: '<path d="M2.5 11.5c4.2-4 10.8-4 15 0l-1.9 2.3-3.1-1.3v-2.1a9 9 0 0 0-5 0v2.1l-3.1 1.3z"/>',
    play: '<path d="M6 4l10 6-10 6z"/>',
    download: '<path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 17h12"/>',
    back: '<path d="M12 4 6 10l6 6"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
    upload: '<path d="M10 14V3M5.5 7.5 10 3l4.5 4.5M4 17h12"/>',
    book: '<path d="M3.5 4.5c2.5-1 4.5-1 6.5.5 2-1.5 4-1.5 6.5-.5V16c-2.5-1-4.5-1-6.5.5-2-1.5-4-1.5-6.5-.5z"/><path d="M10 5v11.5"/>',
    up: '<path d="M5 12l5-5 5 5"/>',
    down: '<path d="M5 8l5 5 5-5"/>'
  };
  const icon = k => svg(ICON[k]);

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const S = {
    profile: "estudiante",
    view: "sims",
    params: {},
    cfg: null,          // configuración de la empresa (la carga la persona responsable)
    server: null,       // /api/config
    candidato: store.get("tutoring.candidato", "Lucas Ferreyra"),
    voiceName: store.get("tutoring.voice", ""),
    informes: [],
    dirty: false,
    engine: null,
    timer: null,
    lastCall: null,
    report: null
  };
  let navToken = 0;   // corta el trabajo asíncrono de una pantalla que ya se abandonó
  const J = store.get("tutoring.junior", { chats: [], current: null }); // chats del junior
  const JUNIOR = { name: "Camila Ruiz", role: "Junior · semana 3" };
  // Guardamos solo las últimas conversaciones: el localStorage tiene ~5 MB y los
  // chats con código pegado lo llenan rápido.
  const MAX_CHATS = 20;
  const saveJ = () => {
    if (J.chats.length > MAX_CHATS) J.chats = J.chats.slice(-MAX_CHATS);
    store.set("tutoring.junior", { chats: J.chats.map(c => ({ ...c, turns: c.turns.filter(t => !t.pending) })), current: J.current });
  };

  const VIEW_LABEL = {
    sims: "Simulaciones por voz", misinformes: "Mis informes", brief: "Simulación", call: "Llamada en curso", corta: "Llamada muy corta", evaluating: "Evaluando", report: "Informe",
    chat: "Mentor del equipo",
    contexto: "Contexto de la empresa", escenarios: "Escenarios de simulación", criterios: "Criterios de evaluación", informes: "Informes de candidatos"
  };

  // ------------------------------------------------------------------
  // Navegación
  // ------------------------------------------------------------------
  function go(view, params = {}) {
    if (S.view === "call" && view !== "call") endCallSilently();
    navToken++;
    S.view = view; S.params = params;
    render();
    $("body").scrollTop = 0;
    cerrarMenu();
  }
  function cerrarMenu() {
    $("side").classList.remove("open");
    $("menu").setAttribute("aria-expanded", "false");
  }
  function setProfile(p) {
    if (S.dirty && S.profile === "empresa" && p !== "empresa" && !confirm("Hay cambios sin guardar en la configuración. ¿Salir igual? (Los cambios siguen aplicados en esta sesión.)")) return;
    S.profile = p;
    go(p === "estudiante" ? "sims" : p === "junior" ? "chat" : "contexto");
  }

  function render() {
    document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.profile === S.profile)));
    renderSide();
    renderTop();
    const view = $("view");
    view.replaceChildren();
    $("foot").hidden = S.view !== "chat";
    const fn = VIEWS[S.view];
    if (fn) fn(view);
  }

  // Indicador de la barra superior: qué proveedor de IA está respondiendo.
  function renderTop() {
    $("viewLabel").textContent = VIEW_LABEL[S.view] || "";
    const st = $("status"); st.replaceChildren();
    if (!S.server) return;
    const ia = S.server.ia || {};
    const ok = S.server.hasKey;
    const respaldoEnUso = ok && (S.usandoRespaldo || (ia.principal && !ia.principal.listo));
    st.className = "status" + (ok ? (respaldoEnUso ? " warn" : "") : " bad");
    let texto;
    if (!ok) texto = S.server.problema || `Falta ${S.server.keyVar || "la API key"} en .env`;
    else if (respaldoEnUso) texto = `IA de respaldo · ${S.server.providerName || "IA"}`;
    else texto = `IA conectada · ${S.server.providerName || "IA"}` + (ia.respaldo ? ` · respaldo ${ia.respaldo.nombre}` : "");
    st.title = "Tocá para probar la conexión con la IA";
    st.append(h("i"), texto);
  }

  // Diagnóstico: prueba de verdad el proveedor principal y el de respaldo.
  let diagnosticando = false;
  async function diagnosticar() {
    if (diagnosticando) return;
    diagnosticando = true;
    toast("Probando la conexión con la IA…");
    try {
      const d = await T.api.diagnostico();
      const linea = p => p ? `${p.nombre}: ${p.ok ? `OK (${(p.latenciaMs / 1000).toFixed(1)} s)` : p.error}` : "";
      toast([linea(d.principal), d.respaldo ? "Respaldo · " + linea(d.respaldo) : ""].filter(Boolean).join("  ·  "), 7000);
      S.server = await T.api.config().catch(() => S.server);
      S.usandoRespaldo = Boolean(d.activo && d.principal && d.activo !== d.principal.id);
      T.api.setProvider(S.server);
      renderTop();
    } catch (e) { toast("No se pudo hacer el diagnóstico: " + T.api.errorCopy(e)); }
    finally { diagnosticando = false; }
  }

  function navBtn(view, label, ic) {
    return h("button", { "aria-current": S.view === view || (view === "sims" && ["brief", "call", "corta", "evaluating"].includes(S.view)) ? "page" : null, onclick: () => go(view) }, icon(ic), label);
  }

  function renderSide() {
    const nav = $("sideNav"); nav.replaceChildren();
    let person;
    if (S.profile === "estudiante") {
      nav.append(h("nav", { class: "nav" }, navBtn("sims", "Simulaciones", "sims"), navBtn("misinformes", "Mis informes", "reports")));
      person = { name: S.candidato, role: "Estudiante · UTN" };
    } else if (S.profile === "junior") {
      nav.append(h("button", { class: "new", onclick: () => { J.current = null; saveJ(); go("chat"); $("input").focus(); } }, svg('<path d="M8 3v10M3 8h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>', "0 0 16 16"), "Nuevo chat"));
      nav.append(h("div", { class: "side-label", text: "Conversaciones" }));
      const hist = h("div", { class: "hist" });
      if (!J.chats.some(deEstaEmpresa)) hist.append(h("div", { class: "empty", text: "Todavía no hay conversaciones." }));
      J.chats.slice().reverse().filter(deEstaEmpresa).forEach(c => hist.append(h("button", { class: c.id === J.current ? "on" : null, text: c.title, title: c.title, onclick: () => { J.current = c.id; saveJ(); go("chat"); } })));
      nav.append(hist);
      person = JUNIOR;
    } else {
      nav.append(h("nav", { class: "nav" },
        navBtn("contexto", "Contexto", "ctx"), navBtn("escenarios", "Escenarios", "esc"),
        navBtn("criterios", "Criterios", "crit"), navBtn("informes", "Informes", "reports")));
      const r = S.cfg.responsable || {};
      person = { name: r.nombre || "Responsable", role: (r.rol ? r.rol + " · " : "") + S.cfg.empresa };
    }
    $("meName").textContent = person.name; $("meRole").textContent = person.role; $("meAv").textContent = initials(person.name);
  }

  const VIEWS = {};

  // ------------------------------------------------------------------
  // ESTUDIANTE: inicio
  // ------------------------------------------------------------------
  VIEWS.sims = view => {
    const col = h("div", { class: "col" });
    const nameInput = h("input", { id: "candidato", type: "text", value: S.candidato, "aria-label": "Tu nombre",
      onchange: e => { S.candidato = e.target.value.trim() || "Candidato"; store.set("tutoring.candidato", S.candidato); renderSide(); } });
    const cards = h("div", { class: "cards" });
    if (!S.cfg.escenarios.length) cards.append(h("div", { class: "notice", text: "Todavía no hay escenarios cargados. La persona responsable los crea desde el perfil Empresa → Escenarios." }));
    S.cfg.escenarios.forEach(e => cards.append(
      h("button", { class: "card", onclick: () => go("brief", { id: e.id }) },
        icon(enPersona(e) ? "esc" : "phone"), h("b", { text: e.titulo }), h("span", { text: e.resumen }),
        h("div", { class: "meta" }, h("span", { class: "tag", text: `${e.duracion || 5} min` }), h("span", { class: "tag", text: `Dificultad ${String(e.dificultad || "media").toLowerCase()}` })))
    ));
    col.append(h("div", { class: "hero" },
      h("div", { class: "orb", "aria-hidden": "true" }),
      h("p", { class: "hello", text: `Hola, ${firstName(S.candidato)}` }),
      h("h1", { class: "ask", text: "¿Qué situación querés practicar?" }),
      h("p", { class: "sub", text: `Hablás por voz con un cliente de ${S.cfg.empresa}. Al terminar, recibís un informe con tus fortalezas y lo que podés mejorar.` }),
      h("div", { class: "name-row" }, h("label", { for: "candidato", text: "Practicás como" }), nameInput),
      cards));
    const mine = S.informes.filter(r => r.candidato === S.candidato).slice(0, 5);
    if (mine.length) {
      col.append(h("div", { class: "section-title" }, h("h2", { text: "Tus simulaciones" }), h("button", { class: "btn-o", onclick: () => go("misinformes") }, "Ver todas")));
      col.append(reportList(mine));
    }
    view.append(col);
  };

  function reportList(items, showName) {
    const list = h("div", { class: "list" });
    items.forEach(r => list.append(h("button", { onclick: () => openReport(r.id) },
      h("div", null, h("div", { class: "t", text: showName ? `${r.candidato} · ${r.escenario}` : r.escenario }), h("div", { class: "d", text: fmtDate(r.fecha) })),
      h("span"),
      h("span", { class: "score-chip", text: r.puntaje != null ? `${r.puntaje}/100` : "—" }))));
    return list;
  }

  VIEWS.misinformes = view => {
    const col = h("div", { class: "col", style: "padding-top:20px" });
    col.append(h("h1", { text: "Mis informes", style: "font-size:24px;font-weight:600" }));
    const mine = S.informes.filter(r => r.candidato === S.candidato);
    col.append(mine.length ? reportList(mine) : h("p", { class: "muted", text: "Todavía no hiciste ninguna simulación." }));
    view.append(col);
  };

  // ------------------------------------------------------------------
  // ESTUDIANTE: antes de la llamada
  // ------------------------------------------------------------------
  VIEWS.brief = view => {
    const e = S.cfg.escenarios.find(x => x.id === S.params.id);
    if (!e) return go("sims");
    const sup = T.voice.support();
    const col = h("div", { class: "col brief" });
    col.append(h("button", { class: "btn-o", style: "align-self:flex-start", onclick: () => go("sims") }, icon("back"), "Volver"));
    col.append(h("div", null, h("div", { class: "eyebrow", text: `Simulación · ${e.duracion || 5} min` }), h("h1", { text: e.titulo }), h("p", { class: "lead", text: e.resumen })));
    col.append(h("div", { class: "info" },
      h("div", null, h("div", { class: "eyebrow", text: "Con quién hablás" }), h("p", { text: e.cliente })),
      h("div", null, h("div", { class: "eyebrow", text: "Tu objetivo" }), h("p", { text: e.objetivo }))));
    col.append(h("ul", { class: "tips" },
      h("li", { text: "Hablá con naturalidad. Cuando hacés una pausa, el cliente responde." }),
      h("li", { text: "Si el cliente está hablando, tocá la esfera para interrumpirlo." }),
      h("li", { text: enPersona(e) ? "La conversación termina cuando se despiden o cuando tocás Terminar." : "La llamada termina cuando se despiden o cuando tocás Colgar." })));

    if (!S.server.hasKey) col.append(h("div", { class: "notice red", text: S.server.problema || `Falta la API key: pegala en el archivo .env (${S.server.keyVar || "API key"}) y reiniciá el servidor.` }));
    if (!S.cfg.criterios.length) col.append(h("div", { class: "notice red", text: "No hay criterios de evaluación cargados: la simulación va a funcionar, pero no se puede armar el informe. Cargalos en Empresa → Criterios." }));
    if (motorDeVoz() !== "vapi" && !sup.stt) col.append(h("div", { class: "notice", text: "Este navegador no reconoce voz: vas a poder escribir tus respuestas. Para hablar, usá Chrome o Edge." }));
    if (motorDeVoz() !== "vapi" && !sup.tts) col.append(h("div", { class: "notice", text: "Este navegador no puede leer en voz alta: vas a ver lo que dice el cliente como texto." }));

    if (S.server.voice.provider === "vapi" && !S.server.voice.vapiPublicKey) col.append(h("div", { class: "notice", text: "Falta VAPI_PUBLIC_KEY en el .env: esta simulación usa la voz del navegador. Para la conversación natural con Vapi, cargá la key y reiniciá el servidor." }));
    if (motorDeVoz() === "vapi") col.append(h("p", { class: "muted", text: "Voz natural con Vapi: podés interrumpir al cliente hablando encima." }));
    if (motorDeVoz() !== "vapi") {
      const sel = h("select", { id: "voiceSel", "aria-label": "Voz del cliente", onchange: ev => { S.voiceName = ev.target.value; store.set("tutoring.voice", S.voiceName); } });
      const test = h("button", { class: "btn-o", onclick: () => {
        if (!("speechSynthesis" in window)) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(`Hola, soy ${clientName(e)}. ¿Me escuchás bien?`);
        const v = T.voice.spanishVoices().find(x => x.name === S.voiceName) || T.voice.spanishVoices()[0];
        if (v) { u.voice = v; u.lang = v.lang; } u.rate = 1.05;
        speechSynthesis.speak(u);
      } }, icon("play"), "Probar voz");
      T.voice.onVoicesReady(voices => {
        sel.replaceChildren();
        if (!voices.length) sel.append(h("option", { text: "Voz predeterminada del sistema", value: "" }));
        voices.forEach(v => sel.append(h("option", { value: v.name, text: `${v.name.replace(/Microsoft |Google /, "")} (${v.lang})`, selected: v.name === S.voiceName })));
        if (!S.voiceName && voices[0]) S.voiceName = voices[0].name;
      });
      col.append(h("div", { class: "voice-row" }, h("label", { for: "voiceSel", class: "muted", text: "Voz del cliente" }), sel, test));
    }
    col.append(h("div", null, h("button", { class: "btn lg", id: "startCall", disabled: !S.server.hasKey, onclick: () => go("call", { id: e.id }) }, icon(enPersona(e) ? "esc" : "phone"), enPersona(e) ? "Empezar conversación" : "Empezar llamada")));
    view.append(col);
  };

  // ------------------------------------------------------------------
  // ESTUDIANTE: llamada por voz
  // ------------------------------------------------------------------
  VIEWS.call = view => {
    const e = S.cfg.escenarios.find(x => x.id === S.params.id);
    if (!e) return go("sims");
    const cName = clientName(e);
    const sup = T.voice.support();
    const provider = motorDeVoz();
    const turns = [];
    let muted = false, started = Date.now(), showTx = false;

    const orb = h("div", { class: "orb big connecting", role: "button", tabindex: "0", "aria-label": `Interrumpir a ${cName}` });
    const stateLbl = h("div", { class: "state-label", role: "status", "aria-live": "polite", text: "Conectando…" });
    const cap = h("div", { class: "caption", "aria-live": "polite", "aria-atomic": "true", text: "" });
    const capU = h("div", { class: "caption dim", text: "" });
    const note = h("div", { class: "notice", role: "alert", hidden: true, style: "max-width:600px" });
    const timer = h("span", { class: "timer", text: "0:00", "aria-label": "Duración de la llamada" });
    const txList = h("div", { class: "transcript", hidden: true });

    const micBtn = h("button", { class: "round", "aria-label": "Silenciar micrófono", "aria-pressed": "false", title: "Silenciar micrófono" }, icon("mic"));
    const kbBtn = h("button", { class: "round", "aria-label": "Escribir en vez de hablar", "aria-pressed": "false", "aria-expanded": "false", title: "Escribir en vez de hablar" }, icon("keyboard"));
    const txBtn = h("button", { class: "round", "aria-label": "Ver transcripción", "aria-pressed": "false", title: "Ver transcripción" }, icon("list"));
    const hang = h("button", { class: "hang", id: "hang" }, icon("hangup"), enPersona(e) ? "Terminar" : "Colgar");
    const typeInput = h("input", { type: "text", placeholder: "Escribí tu respuesta y apretá Enter", "aria-label": "Tu respuesta" });
    const typebar = h("form", { class: "typebar", hidden: true, onsubmit: ev => { ev.preventDefault(); S.engine && S.engine.sendText(typeInput.value); typeInput.value = ""; } },
      typeInput, h("button", { class: "btn", type: "submit", text: "Enviar" }));

    view.append(h("div", { class: "call" },
      h("div", { class: "call-top" }, h("div", { class: "who" }, h("b", { text: cName }), h("span", { text: e.titulo })), timer),
      h("div", { class: "stage" }, orb, stateLbl, cap, capU, note),
      h("div", { class: "controls" }, micBtn, hang, kbBtn, txBtn),
      typebar, txList));

    function addTx(role, text) {
      turns.push({ role, text });
      txList.append(h("div", { class: "ln " + (role === "user" ? "u" : "c") }, h("b", { text: role === "user" ? firstName(S.candidato) : cName }), text));
    }
    function abrirTeclado(foco) {
      typebar.hidden = false;
      kbBtn.classList.add("on");
      kbBtn.setAttribute("aria-pressed", "true"); kbBtn.setAttribute("aria-expanded", "true");
      if (foco) typeInput.focus();
    }
    const LABEL = { connecting: "Conectando…", listening: "Te escucho", thinking: `${firstName(cName)} está pensando`, speaking: `${firstName(cName)} está hablando · tocá para interrumpir`, ended: "Llamada terminada" };

    const engine = T.voice.create(provider, {
      voiceName: S.voiceName,
      vapiPublicKey: S.server.voice.vapiPublicKey,
      vapiAssistantId: S.server.voice.vapiAssistantId,
      vapi: S.server.voice.vapi,
      escenario: e
    });
    S.engine = engine;

    function onEvent(ev) {
      if (S.engine !== engine) return;
      switch (ev.type) {
        case "state":
          orb.className = "orb big " + ev.state;
          stateLbl.textContent = muted && ev.state === "listening" ? "Micrófono silenciado · escribí tu respuesta" : LABEL[ev.state] || "";
          // Mientras el cliente piensa, dejamos a la vista que la llamada sigue.
          if (ev.state === "thinking") { cap.textContent = "···"; cap.classList.add("pensando"); }
          if (ev.state === "listening") note.hidden = true;
          break;
        case "level": orb.style.setProperty("--lvl", Number(ev.value || 0).toFixed(3)); break;
        case "interim": capU.textContent = ev.text; break;
        case "partial": if (ev.text) { cap.classList.remove("pensando"); cap.textContent = ev.text; } break;
        case "turn":
          addTx(ev.role, ev.text);
          if (ev.role === "assistant") { cap.classList.remove("pensando"); cap.textContent = ev.text; } else capU.textContent = "";
          break;
        case "error":
          note.hidden = false; note.textContent = ev.message;
          // Vapi no pudo arrancar: ofrecemos seguir con la voz del navegador para no frenar la demo.
          if (ev.code === "vapi_inicio") {
            note.append(" ", h("button", { class: "btn-o", style: "margin-top:8px", onclick: () => {
              S.vozForzada = "browser"; endCallSilently(); go("call", { id: e.id });
            } }, "Seguir con la voz del navegador"));
          }
          if (ev.code === "mic") {
            muted = true;
            micBtn.classList.add("on"); micBtn.setAttribute("aria-pressed", "true");
            micBtn.replaceChildren(icon("micOff"));
            micBtn.setAttribute("aria-label", "Activar micrófono");
            abrirTeclado(true);
          }
          break;
        case "end": finishCall(e, turns, Math.round((Date.now() - started) / 1000), ev.reason); break;
      }
    }

    const interrumpir = () => { if (engine.state === "speaking" || engine.state === "thinking") engine.interrupt(); };
    orb.addEventListener("click", interrumpir);
    orb.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); interrumpir(); } });
    micBtn.addEventListener("click", () => {
      muted = !muted; engine.setMuted(muted);
      micBtn.replaceChildren(icon(muted ? "micOff" : "mic")); micBtn.classList.toggle("on", muted);
      micBtn.setAttribute("aria-pressed", String(muted));
      micBtn.setAttribute("aria-label", muted ? "Activar micrófono" : "Silenciar micrófono");
      if (muted) abrirTeclado(false);
      if (engine.state === "listening") stateLbl.textContent = muted ? "Micrófono silenciado · escribí tu respuesta" : LABEL.listening;
    });
    kbBtn.addEventListener("click", () => {
      const abrir = typebar.hidden;
      if (abrir) return abrirTeclado(true);
      typebar.hidden = true; kbBtn.classList.remove("on");
      kbBtn.setAttribute("aria-pressed", "false"); kbBtn.setAttribute("aria-expanded", "false");
    });
    txBtn.addEventListener("click", () => {
      showTx = !showTx; txList.hidden = !showTx;
      txBtn.classList.toggle("on", showTx); txBtn.setAttribute("aria-pressed", String(showTx));
    });
    hang.addEventListener("click", () => engine.stop("user"));

    if (provider !== "vapi" && !sup.stt) { muted = true; micBtn.disabled = true; abrirTeclado(false); }

    clearInterval(S.timer);
    S.timer = setInterval(() => { timer.textContent = fmtDur((Date.now() - started) / 1000); }, 500);
    engine.start({ system: T.prompts.voz(S.cfg, e, S.candidato), firstUserTurn: T.prompts.vozInicio(e), onEvent });
  };

  // Qué motor de voz usar: Vapi si está configurado (y no falló en esta sesión), si no el navegador.
  function motorDeVoz() {
    const v = (S.server && S.server.voice) || {};
    if (S.vozForzada) return S.vozForzada;
    return v.provider === "vapi" && v.vapiPublicKey ? "vapi" : "browser";
  }

  function endCallSilently() {
    clearInterval(S.timer);
    if (S.engine) { const en = S.engine; S.engine = null; try { en.stop("user"); } catch (_) {} }
  }

  function finishCall(e, turns, seconds, reason) {
    clearInterval(S.timer);
    S.engine = null;
    const userTurns = turns.filter(t => t.role === "user").length;
    S.lastCall = { escenario: e, turns: turns.slice(), seconds, reason };
    if (userTurns < 2) return go("corta", { id: e.id });
    go("evaluating");
  }

  VIEWS.corta = view => {
    const id = S.params.id;
    view.append(h("div", { class: "col hero" },
      h("div", { class: "orb", "aria-hidden": "true" }),
      h("h1", { class: "ask", text: "La conversación fue muy corta" }),
      h("p", { class: "sub", text: "Para armar un informe hacen falta al menos dos respuestas tuyas." }),
      h("div", { class: "r-actions", style: "justify-content:center" },
        h("button", { class: "btn", onclick: () => go("call", { id }) }, "Volver a intentar"),
        h("button", { class: "btn-o", onclick: () => go("sims") }, "Elegir otra simulación"))));
  };

  // ------------------------------------------------------------------
  // ESTUDIANTE: evaluación
  // ------------------------------------------------------------------
  VIEWS.evaluating = view => {
    const call = S.lastCall; if (!call) return go("sims");
    const status = h("p", { class: "sub", text: `Aplicando los criterios que definió ${T.core.responsableTexto(S.cfg)} en ${S.cfg.empresa}.` });
    const box = h("div", { class: "col hero" }, h("div", { class: "orb", "aria-hidden": "true" }),
      h("h1", { class: "ask", text: "Analizando la conversación…" }), status);
    view.append(box);
    runEvaluation(call, box);
  };

  async function runEvaluation(call, box) {
    const cfg = S.cfg, e = call.escenario;
    // Si el usuario navega a otra pantalla mientras evaluamos, no le robamos la vista.
    const token = ++navToken;
    const vigente = () => navToken === token && S.view === "evaluating";
    try {
      let report = call.pendingReport;
      if (!report) {
        const text = await T.api.claude({
          purpose: "eval", maxTokens: 2500,
          onStatus: msg => { if (vigente()) { const st = box.querySelector(".sub"); if (st) st.textContent = msg; } },
          system: "Sos un evaluador riguroso y justo. Respondés solo con un objeto JSON válido, sin texto alrededor.",
          messages: [{ role: "user", content: T.prompts.evaluacion(cfg, e, call.turns, S.candidato, Math.max(1, Math.round(call.seconds / 60))) }]
        });
        const ev = T.core.parseEvaluacion(text);
        if (!ev) throw Object.assign(new Error("formato inesperado"), { bad: true });
        const p = T.core.puntajePonderado(cfg.criterios, ev.criterios);
        report = {
          candidato: S.candidato, fecha: new Date().toISOString(), duracionSeg: call.seconds,
          empresa: cfg.empresa, responsable: T.core.responsableTexto(cfg),
          escenario: { titulo: e.titulo, resumen: e.resumen, cliente: e.cliente, objetivo: e.objetivo },
          criteriosDef: clone(cfg.criterios), evaluacion: ev,
          puntaje: p.puntaje, criteriosPuntuados: p.cubiertos,
          transcripcion: call.turns
        };
        call.pendingReport = report;
      }
      try {
        if (!report.id) {
          const { id } = await T.api.informes.save(report);
          report.id = id;
        }
      } catch (err) {
        throw new Error("La valoración está lista, pero no se pudo guardar en Empresa → Informes. Reintentá para guardarla sin volver a evaluar. " + T.api.errorCopy(err));
      }
      const resumen = { id: report.id, candidato: report.candidato, escenario: report.escenario.titulo, empresa: report.empresa, fecha: report.fecha, puntaje: report.puntaje };
      S.informes = [resumen, ...S.informes.filter(r => r.id !== report.id)];
      S.report = report; S.lastCall = null;
      if (!vigente()) { toast("El informe quedó listo en “Mis informes”."); return; }
      go("report", { id: report.id });
    } catch (err) {
      if (!vigente()) return;
      box.replaceChildren(
        h("div", { class: "orb", "aria-hidden": "true" }),
        h("h1", { class: "ask", text: "No se pudo armar el informe" }),
        h("p", { class: "sub", text: err.bad ? "La evaluación vino en un formato que no se pudo leer. Probá reintentar: la conversación no se perdió." : T.api.errorCopy(err) }),
        h("div", { class: "r-actions", style: "justify-content:center" },
          h("button", { class: "btn", onclick: () => go("evaluating") }, "Reintentar"),
          h("button", { class: "btn-o", onclick: () => go("sims") }, "Volver")));
    }
  }

  // ------------------------------------------------------------------
  // Informe (lo ven el estudiante y la empresa)
  // ------------------------------------------------------------------
  async function openReport(id) {
    try { S.report = await T.api.informes.get(id); go("report", { id }); }
    catch (e) { toast("No se pudo abrir el informe: " + T.api.errorCopy(e)); }
  }

  function ring(score) {
    const r = 44, c = 2 * Math.PI * r, v = score == null ? 0 : score / 100;
    const s = svg(`<circle cx="52" cy="52" r="${r}" fill="none" stroke="#ECEAF1" stroke-width="9"/><circle cx="52" cy="52" r="${r}" fill="none" stroke="#9B7FD6" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/>`, "0 0 104 104");
    return h("div", { class: "ring" }, s, h("div", { class: "n" }, h("div", null, h("b", { text: score == null ? "—" : String(score) }), h("span", { text: "de 100" }))));
  }

  VIEWS.report = view => {
    const r = S.report; if (!r) return go(S.profile === "empresa" ? "informes" : "sims");
    const ev = r.evaluacion || {};
    const col = h("div", { class: "wide report" });

    const actions = h("div", { class: "r-actions no-print" },
      h("button", { class: "btn-o", onclick: () => go(S.profile === "empresa" ? "informes" : "sims") }, icon("back"), "Volver"),
      h("button", { class: "btn-o", onclick: () => window.print() }, icon("download"), "Descargar PDF"));
    if (S.profile === "estudiante") {
      const e = S.cfg.escenarios.find(x => x.titulo === r.escenario.titulo);
      if (e) actions.append(h("button", { class: "btn-o", onclick: () => go("brief", { id: e.id }) }, icon("phone"), "Practicar de nuevo"));
    }
    if (S.profile === "empresa" && r.id) actions.append(h("button", { class: "btn-o btn-danger", onclick: async () => {
      if (!confirm("¿Eliminar este informe?")) return;
      try { await T.api.informes.remove(r.id); } catch (err) { return toast("No se pudo eliminar: " + T.api.errorCopy(err)); }
      S.informes = await T.api.informes.list().catch(() => S.informes); go("informes"); toast("Informe eliminado.");
    } }, icon("trash"), "Eliminar"));
    col.append(actions);

    col.append(h("div", { class: "r-head" },
      h("div", null,
        h("div", { class: "eyebrow", text: `Informe de habilidades blandas · ${r.empresa}` }),
        h("h1", { text: r.candidato }),
        h("div", { class: "r-meta" }, h("span", { text: r.escenario.titulo }), h("span", { text: fmtDate(r.fecha) }), h("span", { text: `Duración ${fmtDur(r.duracionSeg || 0)}` }))),
      ring(r.puntaje)));
    if (ev.resumen) col.append(h("p", { class: "r-summary", text: ev.resumen }));

    const defs = r.criteriosDef || [];
    const list = h("div", { class: "crit-list" });
    let sinPuntuar = 0;
    defs.forEach((c, i) => {
      const x = T.core.buscarCriterio({ nombre: c.nombre, total: defs.length }, i, ev.criterios || []) || {};
      const p = T.core.puntajeCriterio(x.puntaje);
      if (p == null) sinPuntuar++;
      const bars = h("div", { class: "bar5", role: "img", "aria-label": p == null ? "sin puntuar" : `${p} de 5` });
      for (let k = 1; k <= 5; k++) bars.append(h("i", { class: p != null && k <= p ? "on" : null, "aria-hidden": "true" }));
      bars.append(h("b", { text: p == null ? "—" : `${p}/5`, "aria-hidden": "true" }));
      list.append(h("div", { class: "crit" },
        h("div", { class: "nm" }, c.nombre, h("small", { text: `peso ${c.peso}` })), bars,
        x.comentario ? h("p", { class: "cm", text: x.comentario }) : null,
        h("p", { class: "ev", text: x.evidencia ? `“${String(x.evidencia).replace(/^["“]+|["”]+$/g, "")}”` : "Sin evidencia en la conversación." })));
    });
    col.append(h("div", null, h("div", { class: "eyebrow", text: "Criterios de la empresa", style: "margin-bottom:8px" }), list));
    if (sinPuntuar) col.append(h("div", { class: "notice", text: `La IA no puntuó ${sinPuntuar} de ${defs.length} criterios: el puntaje se calculó solo con los que sí evaluó. Tomalo con pinzas.` }));

    const ul = arr => h("ul", null, (arr || []).map(t => h("li", { text: t })));
    col.append(h("div", { class: "two" },
      h("div", { class: "box" }, h("h3", null, h("i", { style: "background:var(--green)" }), "Fortalezas"), ul(ev.fortalezas)),
      h("div", { class: "box" }, h("h3", null, h("i", { style: "background:var(--amber)" }), "A mejorar"), ul(ev.a_mejorar))));
    col.append(h("div", { class: "two" },
      h("div", { class: "box" }, h("h3", { text: "Cómo encaró el problema" }), h("ol", null, (ev.como_encaro || []).map(t => h("li", { text: t })))),
      h("div", { class: "box" }, h("h3", { text: "Cómo se expresó" }), h("p", { text: ev.expresion || "—" }))));
    if (ev.preguntas_entrevista && ev.preguntas_entrevista.length)
      col.append(h("div", { class: "box" }, h("h3", { text: "Preguntas sugeridas para la entrevista" }), ul(ev.preguntas_entrevista)));

    const tx = h("div", { class: "transcript" });
    (r.transcripcion || []).forEach(t => tx.append(h("div", { class: "ln " + (t.role === "user" ? "u" : "c") }, h("b", { text: t.role === "user" ? firstName(r.candidato) : clientName(r.escenario) }), t.text)));
    col.append(h("details", { class: "tx" }, h("summary", { text: "Ver la conversación completa" }), tx));

    col.append(h("p", { class: "disclaimer", text: `Este informe no recomienda contratar ni descartar: la decisión es de una persona. Evaluación generada con IA según los criterios definidos por ${r.responsable || r.senior} (${r.empresa}), a partir de una simulación. Puede contener errores de transcripción.` }));
    view.append(col);
  };

  // ------------------------------------------------------------------
  // JUNIOR: mentor del equipo
  // ------------------------------------------------------------------
  // Las cuatro acciones del junior. Los textos de ejemplo salen de la empresa cargada.
  function actions() {
    const sw = T.core.esSoftware(S.cfg);
    const te = S.cfg.tareaEjemplo || {};
    const emp = S.cfg.empresa;
    return [
      { id: "entender", icon: sw ? "code" : "book", title: "Entender cómo funciona", desc: sw ? "Un proceso, una herramienta o el código, y por qué existe." : "Un proceso, un área o una herramienta, y por qué existe.",
        send: te.entender || `¿Cómo funciona el trabajo diario en ${emp}? Explicame el circuito principal y por qué se hace así.` },
      { id: "trabajo", icon: "flow", title: "Cómo trabajamos", desc: "Roles, reglas y forma de trabajo, con el porqué de cada una.",
        send: te.trabajo || `¿Cómo se trabaja en ${emp}? Contame los roles, las reglas y por qué existe cada una.` },
      { id: "tarea", icon: "ticket", title: "Resolver una tarea", desc: "Te acompaño a resolverla entendiendo cada paso.",
        send: te.tarea || "Tengo que resolver esta tarea: (describila acá). ¿Cómo la encaro?" },
      { id: "revisar", icon: "check", title: "Revisar antes de entregar", desc: `Reviso lo que hiciste con los criterios de calidad de ${emp}.`,
        fill: te.revisar || "Revisá esto antes de entregarlo:\n\n" }
    ];
  }
  const ACTION_LABEL = { entender: "Entender", trabajo: "Cómo trabajamos", tarea: "Tarea", revisar: "Revisión", codigo: "Código", metodologia: "Metodología", ticket: "Ticket", pr: "PR", libre: "Consulta" };
  let jBusy = false, jCtl = null;
  // Cada chat queda asociado a la empresa con la que se abrió: al cambiar de ejemplo no se mezclan.
  const deEstaEmpresa = c => !c.empresa || c.empresa === S.cfg.empresa;
  const jChat = () => J.chats.find(c => c.id === J.current && deEstaEmpresa(c)) || null;

  VIEWS.chat = view => {
    const c = jChat();
    const col = h("div", { class: "col" });
    if (!c) {
      const cards = h("div", { class: "cards four" });
      actions().forEach(a => cards.append(h("button", { class: "card", onclick: () => startAction(a) }, icon(a.icon), h("b", { text: a.title }), h("span", { text: a.desc }))));
      col.append(h("div", { class: "hero compact" },
        h("div", { class: "orb", "aria-hidden": "true" }),
        h("p", { class: "hello", text: `Hola, ${firstName(JUNIOR.name)}` }),
        h("h1", { class: "ask", text: "¿En qué te ayudo hoy?" }),
        h("p", { class: "sub", text: `Conozco cómo trabaja ${S.cfg.empresa}. Te explico cómo se hace cada cosa y por qué importa para el negocio.` }),
        cards));
    } else {
      const thread = h("div", { class: "thread", id: "thread" });
      c.turns.forEach(t => thread.append(bubble(t)));
      col.append(thread);
    }
    view.append(col);
    renderComposer();
    if (c) requestAnimationFrame(() => { $("body").scrollTop = $("body").scrollHeight; });
  };

  function startAction(a) {
    const c = { id: String(Date.now()), empresa: S.cfg.empresa, action: a.id, title: `${ACTION_LABEL[a.id]} · ${a.title}`, turns: [] };
    if (a.fill) {
      J.chats.push(c); J.current = c.id; saveJ(); go("chat");
      $("input").value = a.fill; autosize(); $("input").focus();
      toast("Pegamos un ejemplo. Tocá enviar o reemplazalo por lo tuyo.");
      return;
    }
    J.chats.push(c); J.current = c.id; saveJ();
    sendJunior(a.send);
  }

  // Formato de las respuestas del mentor: bloques [Cómo se hace] [Por qué importa] [Cómo lo hacemos acá] [Tu turno].
  // Seguimos aceptando las etiquetas viejas ([Técnico], [Negocio]).
  const TAGS = {
    "cómo se hace": "hace", "como se hace": "hace", "técnico": "hace", "tecnico": "hace",
    "por qué importa": "imp", "por que importa": "imp", "negocio": "imp",
    "cómo lo hacemos acá": "met", "como lo hacemos aca": "met", "cómo lo hacemos aca": "met", "tu turno": "tur"
  };
  const TAG_LABEL = { hace: "Cómo se hace", imp: "Por qué importa", met: "Cómo lo hacemos acá", tur: "Tu turno" };
  function mdInline(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); }
  function mdText(s) {
    let html = "";
    s.split(/\n{2,}/).forEach(block => {
      block = block.trim(); if (!block) return;
      const lines = block.split("\n");
      if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ord = /^\s*\d+[.)]/.test(lines[0]);
        html += (ord ? "<ol>" : "<ul>") + lines.map(l => "<li>" + mdInline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) + "</li>").join("") + (ord ? "</ol>" : "</ul>");
      } else html += "<p>" + mdInline(block).replace(/\n/g, "<br>") + "</p>";
    });
    return html;
  }
  function renderMentor(text) {
    const blocks = [{ kind: null, parts: [] }];
    const cur = () => blocks[blocks.length - 1];
    const segs = text.split(/(```[\s\S]*?(?:```|$))/g);
    segs.forEach(seg => {
      if (seg.startsWith("```")) {
        const body = seg.replace(/^```[\w-]*\n?/, "").replace(/```$/, "").replace(/\n$/, "");
        cur().parts.push("<pre><code>" + esc(body) + "</code></pre>");
        return;
      }
      let buf = [];
      const flush = () => { if (buf.join("").trim()) cur().parts.push(mdText(buf.join("\n"))); buf = []; };
      seg.split("\n").forEach(line => {
        const m = line.match(/^\s*\**\[([^\]]+)\]\**:?\s*(.*)$/);
        const kind = m && TAGS[m[1].trim().toLowerCase()];
        if (kind) { flush(); blocks.push({ kind, parts: [] }); if (m[2]) buf.push(m[2]); }
        else buf.push(line);
      });
      flush();
    });
    return blocks.filter(b => b.parts.length).map(b => b.kind
      ? `<div class="blk ${b.kind}"><span class="lbl">${TAG_LABEL[b.kind]}</span>${b.parts.join("")}</div>`
      : b.parts.join("")).join("");
  }

  function bubble(t) {
    if (t.role === "user") return h("div", { class: "u", text: t.content });
    const tx = h("div", { class: "txt", html: t.pending ? '<p class="thinking">Pensando…</p>' : renderMentor(t.content || "") });
    if (t.error) tx.append(h("p", { class: "err", text: t.error }));
    return h("div", { class: "a" }, h("div", { class: "mini", "aria-hidden": "true" }), tx);
  }

  function renderComposer() {
    const input = $("input");
    const sw = T.core.esSoftware(S.cfg);
    input.placeholder = sw ? "Preguntá lo que necesites o pegá tu código…" : "Preguntá lo que necesites…";
    $("pasteCode").hidden = !sw;
    const send = $("send");
    send.classList.toggle("stop", jBusy);
    send.setAttribute("aria-label", jBusy ? "Detener" : "Enviar");
    send.replaceChildren(jBusy ? svg('<rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="#fff" stroke="none"/>', "0 0 16 16") : svg('<path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/>', "0 0 16 16"));
    const line = $("ctxLine"); line.replaceChildren("Entrenado con el contexto de ", h("b", { text: S.cfg.empresa }), `, cargado por ${T.core.responsableTexto(S.cfg)}`);
  }

  async function sendJunior(text) {
    text = (text || "").trim();
    if (!text || jBusy) return;
    let c = jChat();
    if (!c) { c = { id: String(Date.now()), empresa: S.cfg.empresa, action: "libre", title: text.slice(0, 60), turns: [] }; J.chats.push(c); J.current = c.id; }
    c.turns.push({ role: "user", content: text });
    const reply = { role: "assistant", content: "", pending: true };
    c.turns.push(reply);
    $("input").value = ""; autosize();
    jBusy = true; saveJ(); go("chat");

    // normalizarHistorial recorta primero y después asegura que arranque en user:
    // al revés (como estaba antes) el recorte podía dejar un assistant al principio.
    const msgs = T.core.normalizarHistorial(c.turns.filter(t => t !== reply), 30);

    jCtl = new AbortController();
    const cid = c.id;
    try {
      reply.content = await T.api.claude({
        purpose: "chat", maxTokens: 1600, signal: jCtl.signal,
        system: T.prompts.junior(S.cfg, c.action, firstName(JUNIOR.name)),
        messages: msgs,
        onStatus: msg => {
          if (!reply.pending || S.view !== "chat" || J.current !== cid) return;
          const th = $("thread"); const last = th && th.lastElementChild;
          const p = last && last.querySelector(".thinking");
          if (p) p.textContent = msg;
        },
        onText: txt => {
          reply.pending = false; reply.content = txt;
          if (S.view === "chat" && J.current === cid) {
            const th = $("thread"); const last = th && th.lastElementChild;
            const tx = last && last.querySelector(".txt");
            if (tx) { tx.innerHTML = renderMentor(txt); $("body").scrollTop = $("body").scrollHeight; }
          }
        }
      });
      reply.pending = false;
      if (!reply.content) reply.error = "El mentor no devolvió texto. Probá reformular.";
    } catch (e) {
      reply.pending = false;
      if (e.name === "AbortError") { if (!reply.content) reply.content = "(Detenido)"; }
      else { if (e.partial) reply.content = e.partial; reply.error = T.api.errorCopy(e); }
    } finally {
      jBusy = false; jCtl = null; saveJ();
      if (S.view === "chat") render(); else renderSide();
    }
  }

  function autosize() { const i = $("input"); i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 200) + "px"; }
  $("input").addEventListener("input", autosize);
  $("input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendJunior($("input").value); } });
  $("send").addEventListener("click", () => { if (jBusy) { if (jCtl) jCtl.abort(); } else sendJunior($("input").value); });
  $("pasteCode").addEventListener("click", () => {
    const i = $("input");
    const pre = i.value ? i.value.replace(/\s*$/, "") + "\n\n" : "";
    i.value = pre + "```js\n\n```";
    const pos = pre.length + 6; i.focus(); i.setSelectionRange(pos, pos); autosize();
  });

  // ------------------------------------------------------------------
  // EMPRESA (persona responsable): configuración
  // ------------------------------------------------------------------
  function markDirty() { S.dirty = true; const d = document.querySelector(".dirty"); if (d) d.hidden = false; const b = $("saveCfg"); if (b) b.disabled = false; }
  async function saveCfg() {
    try { await T.api.empresa.save(S.cfg); S.dirty = false; render(); toast("Configuración guardada. El agente ya la usa."); }
    catch (e) { toast("No se pudo guardar: " + T.api.errorCopy(e)); }
  }
  function cfgHead(title, sub) {
    return h("div", { class: "cfg-head" },
      h("div", null, h("h1", { text: title }), h("p", { text: sub })),
      h("div", { style: "display:flex;gap:10px;align-items:center" },
        h("span", { class: "dirty", hidden: !S.dirty, text: "Cambios sin guardar" }),
        h("button", { class: "btn", id: "saveCfg", disabled: !S.dirty, onclick: saveCfg }, "Guardar cambios")));
  }
  function field(label, help, control) {
    const id = control.id || ("f" + Math.random().toString(36).slice(2, 8)); control.id = id;
    return h("div", { class: "field" }, h("label", { for: id }, label, help ? h("span", { class: "help", text: help }) : null), control);
  }
  function autoGrow(t) { const f = () => { t.style.height = "auto"; t.style.height = Math.max(84, t.scrollHeight + 2) + "px"; }; t.addEventListener("input", f); requestAnimationFrame(f); return t; }

  // Carga un ejemplo completo (reemplaza toda la configuración) y lo guarda.
  async function cargarEjemplo(clave) {
    const ej = T.EJEMPLOS[clave];
    if (!ej) return;
    if (!confirm(`¿Cargar el ejemplo "${ej.etiqueta}"? Reemplaza TODA la configuración actual (contextos, documentos, escenarios y criterios).`)) return;
    S.cfg = T.core.normalizarConfig(clone(ej.config));
    S.params = {};
    try { await T.api.empresa.save(S.cfg); S.dirty = false; toast(`Cargamos "${S.cfg.empresa}". El agente ya lo usa.`); }
    catch (e) { S.dirty = true; toast("Se cargó el ejemplo, pero no se pudo guardar: " + T.api.errorCopy(e)); }
    render();
  }

  VIEWS.contexto = view => {
    const col = h("div", { class: "wide cfg" });
    col.append(cfgHead("Contexto de la empresa", "Lo cargás una vez. El mentor y las simulaciones usan todo esto para responder y evaluar."));

    // ---- Cargar ejemplo
    const selEj = h("select", { "aria-label": "Empresa de ejemplo" },
      h("option", { value: "", text: "Elegí un ejemplo…" }),
      Object.keys(T.EJEMPLOS).map(k => h("option", { value: k, text: T.EJEMPLOS[k].etiqueta })));
    col.append(h("div", { class: "ej-row" },
      h("span", { class: "muted", text: "¿Querés ver cómo queda?" }), selEj,
      h("button", { class: "btn-o", onclick: () => { if (selEj.value) cargarEjemplo(selEj.value); else toast("Elegí un ejemplo de la lista."); } }, "Cargar ejemplo")));

    // ---- Datos básicos
    const inp = (obj, key, extra) => h("input", Object.assign({ type: "text", value: obj[key] || "", oninput: e => { obj[key] = e.target.value; markDirty(); } }, extra || {}));
    const lista = h("datalist", { id: "rubros" }, T.RUBROS.map(r => h("option", { value: r })));
    col.append(h("h2", { class: "cfg-sec", text: "Datos básicos" }));
    col.append(h("div", { class: "grid2" },
      field("Nombre de la empresa", null, inp(S.cfg, "empresa")),
      field("Rubro", "Elegí o escribí el tuyo.", inp(S.cfg, "rubro", { list: "rubros", placeholder: "Software, Gastronomía, Comercio…" }))), lista);
    col.append(h("div", { class: "grid2" },
      field("Persona responsable", "Quien carga el contexto.", inp(S.cfg.responsable, "nombre", { placeholder: "Ana Gómez" })),
      field("Rol", null, inp(S.cfg.responsable, "rol", { placeholder: "Encargada de salón, líder técnico…" }))));

    // ---- Contextos generales
    col.append(h("h2", { class: "cfg-sec", text: "Contextos generales" }),
      h("p", { class: "muted cfg-sub", text: "Siempre están. Podés dejar alguno vacío si no aplica." }));
    S.cfg.contextos.filter(c => c.general).forEach(c => {
      const def = T.core.GENERALES.find(g => g.clave === c.clave) || {};
      const t = autoGrow(h("textarea", { oninput: e => { c.contenido = e.target.value; markDirty(); } }));
      t.value = c.contenido || "";
      col.append(field(c.titulo, def.ayuda, t));
    });

    // ---- Contextos particulares
    col.append(h("h2", { class: "cfg-sec", text: "Contextos particulares" }),
      h("p", { class: "muted cfg-sub", text: "Lo propio de tu negocio: un área, un procedimiento, una situación frecuente. Por ejemplo: \"Atención en el salón\" o \"Cierre de caja\"." }));
    const particulares = () => S.cfg.contextos.filter(c => !c.general);
    const mover = (c, delta) => {
      const ps = particulares();
      const i = ps.indexOf(c), j = i + delta;
      if (j < 0 || j >= ps.length) return;
      [ps[i], ps[j]] = [ps[j], ps[i]];
      S.cfg.contextos = S.cfg.contextos.filter(x => x.general).concat(ps);
      markDirty(); render();
    };
    const ps = particulares();
    if (!ps.length) col.append(h("p", { class: "muted", text: "Todavía no agregaste ninguno." }));
    ps.forEach((c, i) => {
      const titulo = h("input", { type: "text", value: c.titulo, placeholder: "Título (por ejemplo: Reclamos)", "aria-label": "Título del contexto", "data-ctx": c.id,
        oninput: e => { c.titulo = e.target.value; markDirty(); } });
      const cont = autoGrow(h("textarea", { placeholder: "Qué tiene que saber alguien nuevo sobre esto, y por qué se hace así.", "aria-label": "Contenido de " + (c.titulo || "contexto"),
        oninput: e => { c.contenido = e.target.value; markDirty(); } }));
      cont.value = c.contenido || "";
      col.append(h("div", { class: "ctx-card" },
        h("div", { class: "ctx-top" }, titulo,
          h("button", { class: "icon-x", "aria-label": "Subir " + (c.titulo || "contexto"), title: "Subir", disabled: i === 0, onclick: () => mover(c, -1) }, icon("up")),
          h("button", { class: "icon-x", "aria-label": "Bajar " + (c.titulo || "contexto"), title: "Bajar", disabled: i === ps.length - 1, onclick: () => mover(c, 1) }, icon("down")),
          h("button", { class: "icon-x", "aria-label": "Eliminar " + (c.titulo || "contexto"), title: "Eliminar", onclick: () => {
            if (!confirm(`¿Eliminar el contexto "${c.titulo || "sin título"}"?`)) return;
            S.cfg.contextos = S.cfg.contextos.filter(x => x !== c); markDirty(); render();
          } }, icon("trash"))),
        cont));
    });
    col.append(h("div", null, h("button", { class: "btn-o", onclick: () => {
      const nuevo = { id: T.core.nuevoId("p"), titulo: "", contenido: "", general: false };
      S.cfg.contextos.push(nuevo); markDirty(); render();
      const el = document.querySelector(`[data-ctx="${nuevo.id}"]`);
      if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
    } }, icon("plus"), "Agregar contexto")));

    // ---- Documentos de referencia
    const files = h("div", { class: "files" });
    const drawFiles = () => {
      files.replaceChildren();
      if (!S.cfg.documentos.length) files.append(h("span", { class: "muted", text: "Sin documentos cargados." }));
      S.cfg.documentos.forEach((f, i) => files.append(h("div", { class: "fchip" }, h("span", { text: f.nombre }),
        h("button", { "aria-label": "Quitar " + f.nombre, onclick: () => { S.cfg.documentos.splice(i, 1); markDirty(); drawFiles(); } }, "×"))));
    };
    drawFiles();
    const fileInput = h("input", { type: "file", multiple: true, hidden: true, accept: ".txt,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.java,.sql,.css,.html,.yml,.yaml,.xml,.cs,.php,.go,.rb" });
    fileInput.addEventListener("change", async ev => {
      for (const f of Array.from(ev.target.files)) {
        let c = await f.text().catch(() => null); if (c == null) continue;
        if (c.length > 60000) c = c.slice(0, 60000) + "\n[… documento recortado]";
        S.cfg.documentos = S.cfg.documentos.filter(x => x.nombre !== f.name); S.cfg.documentos.push({ nombre: f.name, contenido: c });
      }
      ev.target.value = ""; markDirty(); drawFiles();
    });
    col.append(h("h2", { class: "cfg-sec", text: "Documentos de referencia" }));
    col.append(h("div", { class: "field" },
      h("label", null, "Manuales, procedimientos, cartas, listas de precios o código", h("span", { class: "help", text: "Archivos de texto que el mentor puede citar." })),
      files, h("div", null, h("button", { class: "btn-o", onclick: () => fileInput.click() }, icon("upload"), "Agregar documentos")), fileInput));

    // ---- Ejemplos para el junior
    col.append(h("h2", { class: "cfg-sec", text: "Ejemplos para quien recién entra" }),
      h("p", { class: "muted cfg-sub", text: "Los textos que aparecen al tocar cada tarjeta del perfil Junior. Si los dejás vacíos, se usa uno genérico." }));
    [["entender", "Entender cómo funciona"], ["trabajo", "Cómo trabajamos"], ["tarea", "Resolver una tarea"], ["revisar", "Revisar antes de entregar"]].forEach(([k, lbl]) => {
      const t = autoGrow(h("textarea", { oninput: e => { S.cfg.tareaEjemplo[k] = e.target.value; markDirty(); } }));
      t.value = S.cfg.tareaEjemplo[k] || "";
      col.append(field(lbl, null, t));
    });
    view.append(col);
  };

  VIEWS.escenarios = view => {
    const col = h("div", { class: "wide cfg" });
    col.append(cfgHead("Escenarios de simulación", "Las situaciones que practican los candidatos. La IA interpreta al cliente con estos datos."));
    const open = S.params.open;
    S.cfg.escenarios.forEach((e, i) => {
      const isOpen = open === e.id;
      const acc = h("div", { class: "acc" + (isOpen ? " open" : "") });
      acc.append(h("button", { class: "acc-h", "aria-expanded": String(isOpen), onclick: () => { S.params = { open: isOpen ? null : e.id }; render(); } },
        h("div", null, h("b", { text: e.titulo || "Sin título" }), h("span", { text: e.resumen })), icon("chevron")));
      if (isOpen) {
        const tx = (key, rows) => { const t = autoGrow(h("textarea", { rows, oninput: ev => { e[key] = ev.target.value; markDirty(); } })); t.value = e[key] || ""; return t; };
        const tin = key => h("input", { type: "text", value: e[key] || "", oninput: ev => { e[key] = ev.target.value; markDirty(); } });
        const dif = h("select", { onchange: ev => { e.dificultad = ev.target.value; markDirty(); } }, ["Baja", "Media", "Alta"].map(d => h("option", { value: d, text: d, selected: e.dificultad === d })));
        const dur = h("input", { type: "number", min: "2", max: "20", value: e.duracion || 5, oninput: ev => { e.duracion = Number(ev.target.value) || 5; markDirty(); } });
        acc.append(h("div", { class: "acc-b" },
          field("Título", null, tin("titulo")),
          field("Resumen", "Lo que ve el candidato antes de empezar.", tin("resumen")),
          h("div", { class: "grid2" },
            field("Cliente", "Nombre y quién es.", tin("cliente")),
            field("Modalidad", null, h("select", { onchange: ev => { e.modalidad = ev.target.value; markDirty(); } },
              [["llamada", "Llamada telefónica"], ["presencial", "En persona"]].map(([v, t]) => h("option", { value: v, text: t, selected: (e.modalidad || "llamada") === v }))))),
          field("Personalidad", "Cómo habla y cómo reacciona.", tx("personalidad")),
          field("Situación", "Incluí los datos que solo da si le preguntan.", tx("situacion")),
          field("Objetivo del candidato", null, tx("objetivo")),
          h("div", { class: "grid2" }, field("Duración (min)", null, dur), field("Dificultad", null, dif)),
          field("Voz del cliente (Vapi)", "Automática: se elige por el nombre.", h("select", { onchange: ev => { e.voz = ev.target.value; markDirty(); } },
            [["", "Automática"], ["femenina", "Femenina"], ["masculina", "Masculina"]].map(([v, t]) => h("option", { value: v, text: t, selected: (e.voz || "") === v })))),
          h("div", null, h("button", { class: "btn-o btn-danger", onclick: () => { if (confirm(`¿Eliminar "${e.titulo}"?`)) { S.cfg.escenarios.splice(i, 1); markDirty(); render(); } } }, icon("trash"), "Eliminar escenario"))));
      }
      col.append(acc);
    });
    col.append(h("div", null, h("button", { class: "btn-o", onclick: () => {
      const e = { id: "esc-" + Date.now(), titulo: "Nuevo escenario", resumen: "", modalidad: "llamada", cliente: "", personalidad: "", situacion: "", objetivo: "", duracion: 5, dificultad: "Media" };
      S.cfg.escenarios.push(e); markDirty(); S.params = { open: e.id }; render();
    } }, icon("plus"), "Agregar escenario")));
    view.append(col);
  };

  VIEWS.criterios = view => {
    const col = h("div", { class: "wide cfg" });
    col.append(cfgHead("Criterios de evaluación", "Qué habilidades se evalúan en cada simulación y cuánto pesa cada una en el puntaje."));
    col.append(h("div", { class: "crit-head" }, h("span", { text: "Competencia" }), h("span", { text: "Qué se observa" }), h("span", { text: "Peso" }), h("span")));
    S.cfg.criterios.forEach((c, i) => {
      col.append(h("div", { class: "crit-row" },
        h("input", { type: "text", value: c.nombre, "aria-label": "Competencia", oninput: e => { c.nombre = e.target.value; markDirty(); } }),
        h("input", { type: "text", value: c.descripcion, "aria-label": "Qué se observa", oninput: e => { c.descripcion = e.target.value; markDirty(); } }),
        h("select", { "aria-label": "Peso", onchange: e => { c.peso = Number(e.target.value); markDirty(); } },
          [[1, "Bajo"], [2, "Medio"], [3, "Alto"]].map(([v, t]) => h("option", { value: v, text: `${t} (${v})`, selected: Number(c.peso) === v }))),
        h("button", { class: "icon-x", "aria-label": "Quitar " + c.nombre, onclick: () => { S.cfg.criterios.splice(i, 1); markDirty(); render(); } }, icon("x"))));
    });
    col.append(h("div", null, h("button", { class: "btn-o", onclick: () => { S.cfg.criterios.push({ nombre: "", descripcion: "", peso: 2 }); markDirty(); render(); } }, icon("plus"), "Agregar criterio")));
    const notes = autoGrow(h("textarea", { oninput: e => { S.cfg.notasEvaluacion = e.target.value; markDirty(); } }));
    notes.value = S.cfg.notasEvaluacion || "";
    col.append(field("Notas para el evaluador", "Lo que más valoran como empresa.", notes));
    view.append(col);
  };

  VIEWS.informes = view => {
    const col = h("div", { class: "wide cfg" });
    col.append(h("div", { class: "cfg-head" }, h("div", null, h("h1", { text: "Informes de candidatos" }), h("p", { text: "Resultados de las simulaciones. La decisión siempre la toma una persona." }))));
    const lista = h("div");
    const mostrar = () => {
      const deEsta = S.informes.filter(r => !r.empresa || r.empresa === S.cfg.empresa);
      lista.replaceChildren(deEsta.length ? reportList(deEsta, true) : h("p", { class: "muted", text: "Todavía no hay informes. Aparecen acá cuando un candidato termina una simulación." }));
    };
    mostrar();
    col.append(lista);
    view.append(col);
    T.api.informes.list().then(informes => {
      if (!lista.isConnected) return;
      S.informes = informes;
      mostrar();
    }).catch(err => { if (lista.isConnected) toast("No se pudieron actualizar los informes: " + T.api.errorCopy(err)); });
  };

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------
  document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => setProfile(b.dataset.profile)));
  $("status").addEventListener("click", diagnosticar);
  T.api.onProvider(data => { S.usandoRespaldo = true; if (S.server) { S.server.providerName = data.name; renderTop(); } });
  $("menu").addEventListener("click", () => {
    const abierto = $("side").classList.toggle("open");
    $("menu").setAttribute("aria-expanded", String(abierto));
  });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && $("side").classList.contains("open")) cerrarMenu(); });
  window.addEventListener("beforeunload", ev => {
    if (S.dirty || S.view === "call") { ev.preventDefault(); ev.returnValue = ""; }
  });

  async function boot() {
    if (!location.protocol.startsWith("http")) {
      document.body.replaceChildren(h("div", { class: "notice", style: "max-width:560px;margin:10vh auto;font-size:15px" },
        "Esta app se abre desde el servidor: en la carpeta del proyecto ejecutá ", h("b", { text: "npm start" }), " y entrá a ", h("b", { text: "http://localhost:3000" }), "."));
      return;
    }
    let errorConfig = null;
    try { S.server = await T.api.config(); }
    catch (e) { errorConfig = e; S.server = { hasKey: false, models: {}, ia: {}, voice: { provider: "browser" } }; }
    T.api.setProvider(S.server);
    try { S.cfg = await T.api.empresa.get(); }
    catch (e) {
      S.cfg = clone(T.DEFAULTS);
      if (e && e.status && e.status !== 404) toast("No se pudo leer la configuración guardada: se está usando la de ejemplo.");
    }
    // Convierte el formato viejo (si hiciera falta) y completa lo que falte.
    S.cfg = T.core.migrarConfig(S.cfg) || T.core.normalizarConfig(clone(T.DEFAULTS));
    if (!S.cfg.empresa) S.cfg.empresa = T.DEFAULTS.empresa;
    try { S.informes = await T.api.informes.list(); } catch (_) { S.informes = []; }
    render();
    if (errorConfig) toast(T.api.errorCopy(errorConfig));
  }
  boot();
})();
