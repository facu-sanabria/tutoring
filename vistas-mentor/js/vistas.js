/* Comportamiento compartido por las vistas del mentor. No hay backend: solo solapas,
   tareas tildables y la barra de 180 días. Cada HTML define su día en <body data-dia="N">. */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ---------------------------------------------------------------- Trayecto de 180 días
  // Los cuatro períodos del plan de onboarding. Se dibujan con el mismo ancho para que
  // los días 1–2 se lean; el avance dentro de cada uno sí es proporcional.
  const TRAMOS = [
    { nombre: "Bienvenida", desde: 1, hasta: 2 },
    { nombre: "Cómo se trabaja", desde: 3, hasta: 30, eval: true },
    { nombre: "Trabajo con apoyo", desde: 31, hasta: 90, eval: true },
    { nombre: "Consulta a demanda", desde: 91, hasta: 180, eval: true }
  ];

  let fills = [];
  function trayecto() {
    const box = $("#trayecto");
    if (!box) return;
    const dia = Number(document.body.dataset.dia) || 1;
    const actual = TRAMOS.findIndex(t => dia >= t.desde && dia <= t.hasta);
    const prox = TRAMOS.find(t => t.eval && t.hasta >= dia);
    const falta = prox ? prox.hasta - dia : 0;

    const head = document.createElement("div");
    head.className = "tr-head";
    head.innerHTML = `<div><span class="eyebrow">Tu onboarding</span><br><b>Día ${dia} de 180 · ${TRAMOS[actual].nombre}</b></div>` +
      (prox ? `<div class="hoy-txt">Próxima evaluación: <strong>día ${prox.hasta}</strong> · faltan ${falta} días</div>` : "");

    const track = document.createElement("div");
    track.className = "tr-track";
    fills = [];
    TRAMOS.forEach((t, i) => {
      const largo = t.hasta - t.desde + 1;
      const pct = i < actual ? 100 : i > actual ? 0 : ((dia - t.desde + 1) / largo) * 100;
      const el = document.createElement("div");
      el.className = "tramo" + (i === actual ? " now" : "");
      el.innerHTML =
        (t.eval ? `<div class="tr-ev"><span class="full">Evaluación </span>día ${t.hasta}</div>` : "") +
        `<div class="tr-bar"><div class="tr-fill"></div>` +
        (i === 0 ? `<div class="tr-node start done"></div>` : "") +
        `<div class="tr-node end${t.eval ? " ev" : ""}${i < actual ? " done" : ""}"></div>` +
        (i === actual ? `<div class="tr-hoy" title="Hoy"></div>` : "") +
        `</div><div class="tr-lbl"><b>${t.nombre}</b><span>Días ${t.desde}–${t.hasta}</span></div>`;
      track.append(el);
      fills.push([el.querySelector(".tr-fill"), el.querySelector(".tr-hoy"), pct, i]);
    });
    box.replaceChildren(head, track);
  }

  // Se llena cada vez que se abre Inicio, un período detrás del otro.
  function llenarTrayecto() {
    fills.forEach(([fill, hoy]) => {
      fill.style.transition = "none"; fill.style.width = "0";
      if (hoy) { hoy.style.transition = "none"; hoy.style.left = "0"; }
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fills.forEach(([fill, hoy, pct, i]) => {
        const delay = 0.3 + i * 0.25 + "s";
        fill.style.transition = ""; fill.style.transitionDelay = delay; fill.style.width = pct + "%";
        if (hoy) { hoy.style.transition = ""; hoy.style.transitionDelay = delay; hoy.style.left = pct + "%"; }
      });
    }));
  }

  // Puntaje de las evaluaciones ya hechas: <div class="ring" data-score="78">.
  function llenarAnillos() {
    $$(".ring[data-score] .fg").forEach(c => {
      c.style.transition = "none"; c.style.strokeDashoffset = "226";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        c.style.transition = "";
        c.style.strokeDashoffset = String(226 * (1 - Number(c.closest(".ring").dataset.score) / 100));
      }));
    });
  }

  // ---------------------------------------------------------------- Carrusel del equipo
  function carrusel() {
    const track = $("#carTrack");
    if (!track) return;
    const cards = Array.from(track.children);
    const dots = $("#carDots");
    const paso = () => cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;
    cards.forEach((c, i) => {
      const b = document.createElement("button");
      b.setAttribute("aria-label", `Ir a la tarjeta ${i + 1}`);
      b.onclick = () => track.scrollTo({ left: i * paso() });
      dots.append(b);
    });
    const actualizar = () => {
      const i = Math.round(track.scrollLeft / paso());
      Array.from(dots.children).forEach((d, j) => d.setAttribute("aria-current", String(j === i)));
      $('[data-car="-1"]').disabled = track.scrollLeft <= 2;
      $('[data-car="1"]').disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    };
    track.addEventListener("scroll", actualizar, { passive: true });
    $$("[data-car]").forEach(b => b.addEventListener("click", () => track.scrollBy({ left: Number(b.dataset.car) * paso() })));
    window.addEventListener("resize", actualizar);
    carruselListo = actualizar;
  }
  let carruselListo = () => {};

  // ---------------------------------------------------------------- Solapas
  function abrir(tab) {
    const btn = $(`.nav button[data-tab="${tab}"]`);
    if (!btn) return;
    $$(".nav button[data-tab]").forEach(b => b.removeAttribute("aria-current"));
    btn.setAttribute("aria-current", "page");
    $$("[data-panel]").forEach(p => {
      const on = p.dataset.panel === tab;
      p.hidden = !on;
      if (on) { p.classList.remove("panel"); void p.offsetWidth; p.classList.add("panel"); }
    });
    $("#viewLabel").textContent = btn.dataset.label || btn.textContent.trim();
    if (tab === "inicio") { llenarTrayecto(); llenarAnillos(); }
    if (tab === "equipo") carruselListo();
    const foot = $("#foot");
    if (foot) foot.hidden = tab !== "mentor";
    $("#body").scrollTop = 0;
    $("#side").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
  }

  // ---------------------------------------------------------------- Tareas
  // Las mismas tareas aparecen en Inicio y en Tareas: se tildan juntas.
  function contarTareas() {
    const ids = [...new Set($$(".task[data-task]").map(t => t.dataset.task))];
    if (!ids.length) return;
    const hechas = ids.filter(id => $(`.task[data-task="${id}"]`).getAttribute("aria-checked") === "true").length;
    $$("[data-count]").forEach(el => { el.textContent = `${hechas} de ${ids.length}`; });
    $$("[data-pending]").forEach(el => { el.textContent = ids.length - hechas; el.hidden = hechas === ids.length; });
    $$(".pbar i").forEach(el => { el.style.width = (hechas / ids.length) * 100 + "%"; });
  }

  // ---------------------------------------------------------------- La empresa (4 C)
  function verC(c) {
    $$("#empresa .c-card[data-c]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === c)));
    $$("[data-c-panel]").forEach(p => {
      const on = p.dataset.cPanel === c;
      p.hidden = !on;
      if (on) { p.classList.remove("panel"); void p.offsetWidth; p.classList.add("panel"); }
    });
  }

  document.addEventListener("click", e => {
    const task = e.target.closest(".task[data-task]");
    if (task && !e.target.closest("[data-go]")) {
      const on = task.getAttribute("aria-checked") !== "true";
      $$(`.task[data-task="${task.dataset.task}"]`).forEach(t => t.setAttribute("aria-checked", String(on)));
      contarTareas();
      return;
    }
    const go = e.target.closest("[data-go]");
    if (go) {
      abrir(go.dataset.go);
      if (go.dataset.c) verC(go.dataset.c);
      return;
    }
    const tab = e.target.closest(".nav button[data-tab]");
    if (tab) { abrir(tab.dataset.tab); return; }
    const c = e.target.closest("#empresa .c-card[data-c]");
    if (c) verC(c.dataset.c);
  });

  document.addEventListener("keydown", e => {
    if ((e.key === " " || e.key === "Enter") && e.target.matches(".task[data-task]")) { e.preventDefault(); e.target.click(); }
  });

  if (!$("#menu")) return; // index.html no tiene shell
  $("#menu").addEventListener("click", () => {
    const open = $("#side").classList.toggle("open");
    $("#menu").setAttribute("aria-expanded", String(open));
  });

  // Orden de entrada escalonada según la posición de cada módulo.
  $$(".stagger").forEach(s => Array.from(s.children).forEach((c, i) => c.style.setProperty("--i", i)));
  trayecto();
  carrusel();
  contarTareas();
  const primera = $("#empresa .c-card[data-c]");
  if (primera) verC(primera.dataset.c);
  abrir(document.body.dataset.inicio || "mentor");
})();
