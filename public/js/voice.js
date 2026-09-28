/* Motor de voz.
   Hay dos implementaciones con la MISMA interfaz, así la app no cambia:
     - "browser": voz del navegador (reconocimiento + síntesis de Chrome/Edge) y la IA vía /api/messages.
     - "vapi":    Vapi (a futuro). Se activa con VOICE_PROVIDER=vapi en el .env.

   Interfaz:
     const engine = T.voice.create(provider, { voiceName, vapiPublicKey, vapiAssistantId });
     engine.start({ system, firstUserTurn, onEvent })
     engine.sendText(texto)     // escribir en vez de hablar
     engine.interrupt()         // cortar al cliente y pasar a escuchar
     engine.setMuted(bool)
     engine.stop()              // cuelga
     engine.state               // estado actual
     engine.history             // [{role:"user"|"assistant", content}]

   Eventos (onEvent):
     {type:"state", state:"connecting"|"listening"|"thinking"|"speaking"|"ended"}
     {type:"interim", text}               lo que va diciendo el candidato (parcial)
     {type:"partial", text}               lo que va diciendo el cliente (parcial)
     {type:"turn", role, text}            un turno terminado
     {type:"level", value}                volumen del micrófono 0..1
     {type:"end", reason:"fin"|"user"}    la llamada terminó
     {type:"error", message, fatal, code} code: "mic" cuando el problema es el micrófono
*/
window.T = window.T || {};

T.voice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TTS = "speechSynthesis" in window;

  // Tiempos de la conversación, todos en ms.
  const T_SILENCIO = 1200;        // pausa que cierra el turno del candidato
  const T_SILENCIO_PARCIAL = 1900; // más paciencia si el reconocedor no cerró la frase
  const T_SIN_VOZ = 14000;        // cuánto esperamos antes de sugerir que escriba
  const T_REINTENTO_REC = 1300;   // cada cuánto revisamos que el reconocimiento siga vivo

  function support() {
    return { stt: Boolean(SR), tts: TTS };
  }

  // Voces en español, las rioplatenses primero.
  function spanishVoices() {
    if (!TTS) return [];
    const rank = v => {
      const l = (v.lang || "").toLowerCase(), n = (v.name || "").toLowerCase();
      let s = 0;
      if (l === "es-ar") s += 50; else if (l === "es-uy") s += 45; else if (l === "es-419" || l === "es-us" || l === "es-mx") s += 30; else if (l.startsWith("es")) s += 10;
      if (n.includes("natural") || n.includes("online") || n.includes("neural")) s += 20;
      if (n.includes("google")) s += 5;
      return s;
    };
    let voces = [];
    try { voces = speechSynthesis.getVoices() || []; } catch (_) { return []; }
    return voces.filter(v => (v.lang || "").toLowerCase().startsWith("es")).sort((a, b) => rank(b) - rank(a));
  }

  // Las voces tardan en cargar y en algunos navegadores nunca avisan: reintentamos,
  // pero llamamos al callback una sola vez.
  function onVoicesReady(cb) {
    if (!TTS) return cb([]);
    let listo = false;
    const avisar = v => { if (!listo) { listo = true; cb(v); } };
    const v = spanishVoices();
    if (v.length) return avisar(v);
    const onChange = () => avisar(spanishVoices());
    speechSynthesis.addEventListener("voiceschanged", onChange, { once: true });
    setTimeout(() => { speechSynthesis.removeEventListener("voiceschanged", onChange); avisar(spanishVoices()); }, 2000);
  }

  const speakable = t => T.core.textoHablable(t);
  const tieneFin = t => /\[\s*FIN\s*\]/i.test(String(t || ""));

  // ---------------------------------------------------------------------------
  // Implementación con la voz del navegador
  // ---------------------------------------------------------------------------
  function BrowserEngine(opts = {}) {
    const self = this;
    this.history = [];
    let emit = () => {}, system = "";
    let state = "idle", muted = false, ended = false, finReached = false;
    let rec = null, recActive = false, recArrancando = false, recErroresRed = 0;
    let finalBuf = "", ultimoInterim = "", silenceTimer = null, sinVozTimer = null, recVigia = null;
    let ctl = null, streamDone = true, assistantText = "", spokenUpTo = 0;
    let queue = [], speaking = false, actual = null, watchdog = null, arranqueTimer = null, seq = 0;
    let ttsAnda = false, avisoTTS = false;   // ttsAnda: la síntesis de voz realmente suena
    let media = null, audioCtx = null, raf = 0;

    Object.defineProperty(this, "state", { get: () => state });

    function setState(s) {
      if (ended && s !== "ended") return;
      if (state === s) return;
      state = s;
      emit({ type: "state", state: s });
    }
    function aviso(message, extra) { emit(Object.assign({ type: "error", message, fatal: false }, extra || {})); }

    function pickVoice() {
      const voices = spanishVoices();
      return voices.find(v => v.name === opts.voiceName) || voices[0] || null;
    }

    // ----- Micrófono: nivel para animar la esfera -----
    async function startLevel() {
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
        const src = audioCtx.createMediaStreamSource(media);
        const an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          if (ended) return;
          an.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
          emit({ type: "level", value: state === "listening" && !muted ? Math.min(1, Math.sqrt(sum / buf.length) * 4) : 0 });
          raf = requestAnimationFrame(tick);
        };
        tick();
        return true;
      } catch (e) {
        muted = true;
        aviso("No hay acceso al micrófono. Permitilo en el navegador o escribí tus respuestas.", { code: "mic" });
        return false;
      }
    }
    function stopLevel() {
      cancelAnimationFrame(raf); raf = 0;
      if (media) media.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      if (audioCtx) audioCtx.close().catch(() => {});
      media = null; audioCtx = null;
    }

    // ----- Reconocimiento de voz -----
    function setupRecognition() {
      if (!SR) return;
      rec = new SR();
      rec.lang = opts.lang || "es-AR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onstart = () => { recActive = true; recArrancando = false; };
      rec.onresult = e => {
        if (ended || state !== "listening") return;
        recErroresRed = 0;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r || !r[0]) continue;
          if (r.isFinal) finalBuf += (finalBuf ? " " : "") + String(r[0].transcript || "").trim();
          else interim += r[0].transcript || "";
        }
        ultimoInterim = interim.trim();
        const visible = (finalBuf + " " + ultimoInterim).trim();
        emit({ type: "interim", text: visible });
        if (visible) clearTimeout(sinVozTimer);
        programarCierreDeTurno();
      };
      rec.onerror = e => {
        const err = (e && e.error) || "";
        if (err === "not-allowed" || err === "service-not-allowed") {
          muted = true; stopRec();
          aviso("El navegador bloqueó el micrófono. Permitilo en el candado de la barra de direcciones o escribí tus respuestas.", { code: "mic" });
        } else if (err === "audio-capture") {
          muted = true; stopRec();
          aviso("No se encontró ningún micrófono. Conectá uno o escribí tus respuestas.", { code: "mic" });
        } else if (err === "network") {
          recErroresRed++;
          if (recErroresRed >= 3) {
            muted = true; stopRec();
            aviso("El reconocimiento de voz de Chrome necesita internet y no está respondiendo. Escribí tus respuestas para seguir la llamada.", { code: "mic" });
          }
        }
        // "no-speech" y "aborted" son normales: los maneja onend.
      };
      rec.onend = () => {
        recActive = false; recArrancando = false;
        // Chrome corta el reconocimiento cada tanto: si seguimos escuchando, lo reactivamos.
        if (deberiaEscuchar()) setTimeout(startRec, 150);
      };
    }
    const deberiaEscuchar = () => Boolean(rec) && state === "listening" && !muted && !ended;

    function startRec() {
      if (!deberiaEscuchar() || recActive || recArrancando) return;
      recArrancando = true;
      try { rec.start(); }
      catch (e) {
        recArrancando = false;
        // "already started": el navegador lo tiene vivo aunque no nos avisó.
        if (e && /already started/i.test(e.message || "")) recActive = true;
      }
    }
    function stopRec() {
      clearTimeout(silenceTimer); silenceTimer = null;
      clearTimeout(sinVozTimer); sinVozTimer = null;
      if (rec) { try { rec.abort(); } catch (_) {} }
      recActive = false; recArrancando = false;
    }
    // Red de seguridad: si rec.start() falló y onend nunca llegó, el reconocimiento
    // queda muerto y la llamada se traba. Revisamos cada tanto.
    function iniciarVigiaRec() {
      clearInterval(recVigia);
      recVigia = setInterval(() => { if (deberiaEscuchar() && !recActive) startRec(); }, T_REINTENTO_REC);
    }

    // Cierra el turno del candidato cuando deja de hablar.
    // Si el reconocedor no cerró la frase (se quedó en parcial), esperamos un poco más
    // y usamos el parcial: antes se trababa la conversación esperando un final que no llegaba.
    function programarCierreDeTurno() {
      clearTimeout(silenceTimer);
      const soloParcial = !finalBuf.trim() && Boolean(ultimoInterim);
      silenceTimer = setTimeout(() => {
        if (state !== "listening" || ended) return;
        const texto = finalBuf.trim() || ultimoInterim.trim();
        if (texto) commitUser(texto);
        else esperarVoz();
      }, soloParcial ? T_SILENCIO_PARCIAL : T_SILENCIO);
    }
    // Si no se escucha nada por un buen rato, avisamos en vez de dejarlo esperando.
    function esperarVoz() {
      clearTimeout(sinVozTimer);
      sinVozTimer = setTimeout(() => {
        if (state === "listening" && !ended && !finalBuf.trim() && !ultimoInterim.trim()) {
          aviso(muted ? "El micrófono está silenciado: escribí tu respuesta." : "No se escucha nada. Hablá más cerca del micrófono o escribí tu respuesta.");
        }
      }, T_SIN_VOZ);
    }

    function listen() {
      if (ended) return;
      finalBuf = ""; ultimoInterim = "";
      emit({ type: "interim", text: "" });
      setState("listening");
      startRec();
      esperarVoz();
    }

    function agregarHistorial(role, content) {
      const last = self.history[self.history.length - 1];
      if (last && last.role === role) last.content += "\n\n" + content;
      else self.history.push({ role, content });
    }

    function commitUser(text) {
      text = (text || "").trim();
      if (!text || ended) return;
      stopRec();
      finalBuf = ""; ultimoInterim = "";
      emit({ type: "interim", text: "" });
      agregarHistorial("user", text);
      emit({ type: "turn", role: "user", text });
      respond();
    }

    // ----- La IA responde (streaming) y se va leyendo por oraciones -----
    async function respond() {
      setState("thinking");
      emit({ type: "partial", text: "" });
      assistantText = ""; spokenUpTo = 0; streamDone = false; finReached = false;
      const mio = ctl = new AbortController();
      try {
        await T.api.claude({
          purpose: "voice", system, messages: self.history, maxTokens: 300, signal: mio.signal,
          onText: txt => {
            if (mio.signal.aborted || ended) return;
            assistantText = txt;
            emit({ type: "partial", text: speakable(txt) });
            flushSentences(false);
          }
        });
        if (mio.signal.aborted || ended) return;
        streamDone = true;
        flushSentences(true);
        finishAssistant();
      } catch (e) {
        if (ctl === mio) streamDone = true;
        if (e && e.name === "AbortError") return;
        if (ended) return;
        if (e && e.partial) assistantText = e.partial;
        aviso(T.api.errorCopy(e) || "No se pudo escuchar la respuesta del cliente. Probá de nuevo.");
        if (speakable(assistantText)) { flushSentences(true); finishAssistant(); }
        else listen();
      }
    }

    function flushSentences(all) {
      const pending = assistantText.slice(spokenUpTo);
      const cut = T.core.largoDecible(pending, all);
      if (cut <= 0) return;
      const chunk = speakable(pending.slice(0, cut));
      spokenUpTo += cut;
      if (chunk) enqueue(chunk);
    }

    function finishAssistant() {
      const clean = speakable(assistantText);
      finReached = tieneFin(assistantText);
      if (clean) {
        agregarHistorial("assistant", clean + (finReached ? " [FIN]" : ""));
        emit({ type: "turn", role: "assistant", text: clean });
        emit({ type: "partial", text: clean });
      } else if (finReached) {
        // El cliente solo dijo [FIN]: cerramos igual.
        agregarHistorial("assistant", "[FIN]");
      }
      assistantText = ""; spokenUpTo = 0;
      afterSpeech();
    }

    // ----- Síntesis de voz -----
    function enqueue(text) {
      if (!TTS) return;
      queue.push(text);
      if (!speaking) speakNext();
    }
    function speakNext() {
      clearTimeout(watchdog); watchdog = null;
      clearTimeout(arranqueTimer); arranqueTimer = null;
      if (ended) { speaking = false; return; }
      const text = queue.shift();
      if (!text) { speaking = false; actual = null; afterSpeech(); return; }
      speaking = true;
      setState("speaking");
      const id = ++seq;
      actual = id;
      const seguir = () => {
        if (actual !== id) return;
        clearTimeout(watchdog); watchdog = null;
        clearTimeout(arranqueTimer); arranqueTimer = null;
        actual = null; speakNext();
      };
      let u;
      try {
        u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "es-AR";
        u.rate = opts.rate || 1.05; u.pitch = 1;
        u.onstart = () => { ttsAnda = true; };
        u.onend = seguir;
        u.onerror = seguir;
        if (speechSynthesis.paused) speechSynthesis.resume();
        speechSynthesis.speak(u);
      } catch (_) {
        // Si la síntesis no arranca, seguimos la conversación igual.
        ttsRoto(); return seguir();
      }
      // Si en 1,2 s no empezó a hablar, la síntesis de este navegador no funciona
      // (sin voces, audio silenciado, permisos). No vale esperar el tiempo completo
      // de la frase: seguimos la conversación con los subtítulos.
      if (!ttsAnda) arranqueTimer = setTimeout(() => { if (actual === id && !ttsAnda) { ttsRoto(); seguir(); } }, 1200);
      // Red de seguridad: hay navegadores que no disparan onend (y Chrome se cuelga
      // si la pestaña pierde el foco). Avanzamos igual pasado el tiempo estimado.
      watchdog = setTimeout(() => {
        if (actual !== id) return;
        try { speechSynthesis.cancel(); } catch (_) {}
        seguir();
      }, 1500 + text.length * 80);
    }
    function ttsRoto() {
      try { speechSynthesis.cancel(); } catch (_) {}
      if (avisoTTS) return;
      avisoTTS = true;
      aviso("Este navegador no está leyendo en voz alta (revisá el volumen o instalá una voz en español). Igual podés seguir la llamada leyendo lo que dice el cliente.");
    }
    function pararVoz() {
      clearTimeout(watchdog); watchdog = null;
      clearTimeout(arranqueTimer); arranqueTimer = null;
      queue = []; speaking = false; actual = null;
      if (TTS) { try { speechSynthesis.cancel(); } catch (_) {} }
    }
    function afterSpeech() {
      if (speaking || !streamDone || queue.length || ended) return;
      if (finReached) { self.stop("fin"); return; }
      if (state !== "listening") listen();
    }

    // ----- API pública -----
    this.start = async function ({ system: sys, firstUserTurn, onEvent }) {
      emit = onEvent || emit;
      system = sys || "";
      ended = false; muted = false; finReached = false;
      self.history = [];
      setState("connecting");
      if (TTS) { try { speechSynthesis.cancel(); } catch (_) {} }
      setupRecognition();
      if (!SR) {
        muted = true;
        aviso("Este navegador no reconoce voz. Escribí tus respuestas (o usá Chrome o Edge).", { code: "mic" });
      }
      await startLevel();
      if (ended) return;   // colgó mientras pedíamos el micrófono
      iniciarVigiaRec();
      agregarHistorial("user", firstUserTurn || "Hola.");
      respond();
    };

    this.sendText = function (text) {
      text = (text || "").trim();
      if (!text || ended) return;
      // Escribir siempre manda: si el cliente está hablando o pensando, lo cortamos.
      if (state === "speaking" || state === "thinking") {
        if (ctl) ctl.abort();
        pararVoz();
        streamDone = true;
        const clean = speakable(assistantText);
        if (clean) { agregarHistorial("assistant", clean); emit({ type: "turn", role: "assistant", text: clean }); }
        assistantText = ""; spokenUpTo = 0;
      }
      commitUser(text);
    };

    this.interrupt = function () {
      // Solo tiene sentido si el cliente está hablando o pensando; si ya estamos
      // escuchando, interrumpir borraría lo que el candidato venía diciendo.
      if (ended || (state !== "speaking" && state !== "thinking")) return;
      if (ctl) ctl.abort();
      pararVoz();
      streamDone = true;
      const clean = speakable(assistantText);
      if (clean) {
        agregarHistorial("assistant", clean);
        emit({ type: "turn", role: "assistant", text: clean });
      }
      assistantText = ""; spokenUpTo = 0; finReached = false;
      listen();
    };

    this.setMuted = function (m) {
      muted = Boolean(m) || !SR;
      if (muted) { stopRec(); clearTimeout(sinVozTimer); }
      else if (state === "listening") { startRec(); esperarVoz(); }
    };

    this.stop = function (reason = "user") {
      if (ended) return;
      ended = true;
      if (ctl) ctl.abort();
      clearInterval(recVigia); recVigia = null;
      clearTimeout(silenceTimer); clearTimeout(sinVozTimer);
      pararVoz();
      stopRec(); stopLevel();
      // Si cortó mientras el cliente hablaba, guardamos lo que alcanzó a decir.
      const clean = speakable(assistantText);
      if (clean) agregarHistorial("assistant", clean);
      assistantText = "";
      state = "ended";
      emit({ type: "state", state: "ended" });
      emit({ type: "end", reason });
    };
  }

  // ---------------------------------------------------------------------------
  // Implementación con Vapi (preparada para el futuro, SIN PROBAR).
  // Requiere VOICE_PROVIDER=vapi y VAPI_PUBLIC_KEY en el .env.
  // Vapi maneja el micrófono, la transcripción, el modelo y la voz; nosotros
  // le pasamos las mismas instrucciones del escenario y recibimos la transcripción.
  // ---------------------------------------------------------------------------
  function VapiEngine(opts = {}) {
    const self = this;
    this.history = [];
    let vapi = null, emit = () => {}, ended = false, state = "idle";

    Object.defineProperty(this, "state", { get: () => state });
    const setState = s => { state = s; emit({ type: "state", state: s }); };
    const agregar = (role, content) => {
      const last = self.history[self.history.length - 1];
      if (last && last.role === role) last.content += "\n\n" + content;
      else self.history.push({ role, content });
    };

    this.start = async function ({ system, firstUserTurn, onEvent }) {
      emit = onEvent || emit;
      setState("connecting");
      if (!opts.vapiPublicKey) {
        emit({ type: "error", message: "Falta VAPI_PUBLIC_KEY en el .env. Volvé a VOICE_PROVIDER=browser o cargá la key.", fatal: true });
        return;
      }
      try {
        const mod = await import("https://esm.sh/@vapi-ai/web");
        const Vapi = mod.default || mod.Vapi;
        vapi = new Vapi(opts.vapiPublicKey);
      } catch (e) {
        emit({ type: "error", message: "No se pudo cargar Vapi. Revisá la conexión o volvé a VOICE_PROVIDER=browser.", fatal: true });
        return;
      }
      vapi.on("call-start", () => setState("listening"));
      vapi.on("speech-start", () => setState("speaking"));
      vapi.on("speech-end", () => setState("listening"));
      vapi.on("volume-level", v => emit({ type: "level", value: Number(v) || 0 }));
      vapi.on("message", msg => {
        if (!msg || msg.type !== "transcript") return;
        const role = msg.role === "user" ? "user" : "assistant";
        const texto = String(msg.transcript || "").trim();
        if (msg.transcriptType === "final") {
          if (!texto) return;
          agregar(role, texto);
          emit({ type: "turn", role, text: texto });
          emit({ type: role === "user" ? "interim" : "partial", text: "" });
        } else {
          emit({ type: role === "user" ? "interim" : "partial", text: texto });
        }
      });
      vapi.on("error", e => emit({ type: "error", message: "Error de Vapi: " + ((e && e.message) || "desconocido"), fatal: false }));
      vapi.on("call-end", () => self.stop("fin"));

      // Asistente armado en el momento con las instrucciones del escenario.
      // Si preferís un asistente creado en el panel de Vapi, poné VAPI_ASSISTANT_ID en el .env.
      // Ojo: el modelo lo elige Vapi, no el .env del servidor.
      const armado = {
        firstMessageMode: "assistant-speaks-first-with-model-generated-message",
        model: {
          provider: opts.vapiModelProvider || "anthropic",
          model: opts.vapiModel || "claude-sonnet-5",
          messages: [{ role: "system", content: String(system || "") + "\n\n" + String(firstUserTurn || "") }]
        },
        transcriber: { provider: "deepgram", language: "es" },
        voice: { provider: "azure", voiceId: "es-AR-ElenaNeural" },
        endCallPhrases: ["[FIN]", "hasta luego"]
      };
      try {
        if (opts.vapiAssistantId) await vapi.start(opts.vapiAssistantId, { model: { messages: [{ role: "system", content: String(system || "") }] } });
        else await vapi.start(armado);
      } catch (e) {
        emit({ type: "error", message: "Vapi no pudo iniciar la llamada: " + ((e && e.message) || "error desconocido"), fatal: true });
      }
    };
    this.sendText = function (text) {
      const t = String(text || "").trim();
      if (!vapi || !t) return;
      try { vapi.send({ type: "add-message", message: { role: "user", content: t } }); } catch (_) {}
      agregar("user", t);
      emit({ type: "turn", role: "user", text: t });
    };
    this.interrupt = function () { /* Vapi corta al asistente solo cuando detecta voz */ };
    this.setMuted = function (m) { if (vapi) { try { vapi.setMuted(Boolean(m)); } catch (_) {} } };
    this.stop = function (reason = "user") {
      if (ended) return;
      ended = true;
      if (vapi) { try { vapi.stop(); } catch (_) {} }
      state = "ended";
      emit({ type: "state", state: "ended" });
      emit({ type: "end", reason });
    };
  }

  function create(provider, opts) {
    return provider === "vapi" ? new VapiEngine(opts) : new BrowserEngine(opts);
  }

  return { create, support, spanishVoices, onVoicesReady };
})();
