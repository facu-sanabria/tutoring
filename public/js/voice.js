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
     engine.history             // [{role:"user"|"assistant", content}]

   Eventos (onEvent):
     {type:"state", state:"connecting"|"listening"|"thinking"|"speaking"|"ended"}
     {type:"interim", text}               lo que va diciendo el candidato (parcial)
     {type:"partial", text}               lo que va diciendo el cliente (parcial)
     {type:"turn", role, text}            un turno terminado
     {type:"level", value}                volumen del micrófono 0..1
     {type:"end", reason:"fin"|"user"}    la llamada terminó
     {type:"error", message, fatal}
*/
window.T = window.T || {};

T.voice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function support() {
    return { stt: Boolean(SR), tts: "speechSynthesis" in window };
  }

  // Voces en español, las rioplatenses primero.
  function spanishVoices() {
    if (!("speechSynthesis" in window)) return [];
    const rank = v => {
      const l = (v.lang || "").toLowerCase(), n = (v.name || "").toLowerCase();
      let s = 0;
      if (l === "es-ar") s += 50; else if (l === "es-uy") s += 45; else if (l === "es-419" || l === "es-us" || l === "es-mx") s += 30; else if (l.startsWith("es")) s += 10;
      if (n.includes("natural") || n.includes("online") || n.includes("neural")) s += 20;
      if (n.includes("google")) s += 5;
      return s;
    };
    return speechSynthesis.getVoices().filter(v => (v.lang || "").toLowerCase().startsWith("es")).sort((a, b) => rank(b) - rank(a));
  }

  function onVoicesReady(cb) {
    if (!("speechSynthesis" in window)) return cb([]);
    const v = spanishVoices();
    if (v.length) return cb(v);
    speechSynthesis.addEventListener("voiceschanged", () => cb(spanishVoices()), { once: true });
    setTimeout(() => cb(spanishVoices()), 1500);
  }

  // Limpia lo que no se tiene que leer en voz alta.
  function speakable(t) {
    return t.replace(/\[FIN\]/gi, "").replace(/[*_#`>~]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------------------
  // Implementación con la voz del navegador
  // ---------------------------------------------------------------------------
  function BrowserEngine(opts = {}) {
    const self = this;
    this.history = [];
    let emit = () => {}, system = "";
    let state = "idle", muted = false, ended = false, finReached = false;
    let rec = null, recActive = false, finalBuf = "", silenceTimer = null;
    let ctl = null, streamDone = true, assistantText = "", spokenUpTo = 0;
    let queue = [], speaking = false, utterRefs = [], watchdog = null;
    let media = null, audioCtx = null, raf = 0;

    function setState(s) { if (ended && s !== "ended") return; state = s; emit({ type: "state", state: s }); }

    function pickVoice() {
      const voices = spanishVoices();
      return voices.find(v => v.name === opts.voiceName) || voices[0] || null;
    }

    // ----- Micrófono: nivel para animar la esfera -----
    async function startLevel() {
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(media);
        const an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
          emit({ type: "level", value: state === "listening" && !muted ? Math.min(1, Math.sqrt(sum / buf.length) * 4) : 0 });
          raf = requestAnimationFrame(tick);
        };
        tick();
        return true;
      } catch (e) {
        emit({ type: "error", message: "No hay acceso al micrófono. Permitilo en el navegador o escribí tus respuestas.", fatal: false });
        return false;
      }
    }
    function stopLevel() {
      cancelAnimationFrame(raf);
      if (media) media.getTracks().forEach(t => t.stop());
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
      rec.onresult = e => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalBuf += (finalBuf ? " " : "") + r[0].transcript.trim();
          else interim += r[0].transcript;
        }
        emit({ type: "interim", text: (finalBuf + " " + interim).trim() });
        clearTimeout(silenceTimer);
        // Cuando deja de hablar ~1,3 s, se considera que terminó su turno.
        silenceTimer = setTimeout(() => { if (finalBuf.trim() && !interim.trim()) commitUser(finalBuf); }, 1300);
      };
      rec.onerror = e => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          emit({ type: "error", message: "El navegador bloqueó el micrófono. Permitilo o escribí tus respuestas.", fatal: false });
          muted = true;
        } else if (e.error === "network") {
          emit({ type: "error", message: "El reconocimiento de voz necesita internet. Revisá la conexión o escribí tus respuestas.", fatal: false });
        }
      };
      rec.onend = () => {
        recActive = false;
        // Chrome corta el reconocimiento después de un rato: si seguimos escuchando, lo reactivamos.
        if (state === "listening" && !muted && !ended) setTimeout(startRec, 150);
      };
    }
    function startRec() {
      if (!rec || recActive || muted || ended || state !== "listening") return;
      try { rec.start(); recActive = true; } catch (_) {}
    }
    function stopRec() {
      clearTimeout(silenceTimer);
      if (rec && recActive) { try { rec.abort(); } catch (_) {} }
      recActive = false;
    }

    function listen() {
      if (ended) return;
      finalBuf = "";
      emit({ type: "interim", text: "" });
      setState("listening");
      startRec();
    }

    function commitUser(text) {
      text = (text || "").trim();
      if (!text || ended) return;
      stopRec();
      finalBuf = "";
      emit({ type: "interim", text: "" });
      self.history.push({ role: "user", content: text });
      emit({ type: "turn", role: "user", text });
      respond();
    }

    // ----- La IA responde (streaming) y se va leyendo por oraciones -----
    async function respond() {
      setState("thinking");
      assistantText = ""; spokenUpTo = 0; streamDone = false; finReached = false;
      ctl = new AbortController();
      try {
        await T.api.claude({
          purpose: "voice", system, messages: self.history, maxTokens: 300, signal: ctl.signal,
          onText: txt => {
            assistantText = txt;
            emit({ type: "partial", text: speakable(txt) });
            flushSentences(false);
          }
        });
        streamDone = true;
        flushSentences(true);
        finishAssistant();
      } catch (e) {
        streamDone = true;
        if (e.name === "AbortError") return;
        emit({ type: "error", message: T.api.errorCopy(e), fatal: false });
        if (assistantText) finishAssistant(); else listen();
      }
    }

    function flushSentences(all) {
      const pending = assistantText.slice(spokenUpTo);
      const re = /[^.!?…]+[.!?…]+["»”]?\s+/g;
      let m, last = 0;
      while ((m = re.exec(pending))) last = m.index + m[0].length;
      const cut = all ? pending.length : last;
      if (cut > 0) {
        const chunk = speakable(pending.slice(0, cut));
        spokenUpTo += cut;
        if (chunk) enqueue(chunk);
      }
    }

    function finishAssistant() {
      const clean = speakable(assistantText);
      finReached = /\[FIN\]/i.test(assistantText);
      if (clean) {
        self.history.push({ role: "assistant", content: clean + (finReached ? " [FIN]" : "") });
        emit({ type: "turn", role: "assistant", text: clean });
      }
      afterSpeech();
    }

    // ----- Síntesis de voz -----
    function enqueue(text) {
      if (!("speechSynthesis" in window)) return;
      queue.push(text);
      if (!speaking) speakNext();
    }
    function speakNext() {
      clearTimeout(watchdog);
      if (ended) return;
      const text = queue.shift();
      if (!text) { speaking = false; afterSpeech(); return; }
      speaking = true;
      setState("speaking");
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "es-AR";
      u.rate = opts.rate || 1.05; u.pitch = 1;
      u.onend = u.onerror = () => { utterRefs = utterRefs.filter(x => x !== u); speakNext(); };
      utterRefs.push(u); // evita que Chrome descarte la frase antes de terminar
      speechSynthesis.speak(u);
      // Red de seguridad: algunos navegadores a veces no disparan onend.
      watchdog = setTimeout(() => { if (speaking) { speechSynthesis.cancel(); } }, 4000 + text.length * 90);
    }
    function afterSpeech() {
      if (speaking || !streamDone || queue.length || ended) return;
      if (finReached) { self.stop("fin"); return; }
      if (state !== "listening") listen();
    }

    // ----- API pública -----
    this.start = async function ({ system: sys, firstUserTurn, onEvent }) {
      emit = onEvent || emit; system = sys; ended = false;
      setState("connecting");
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      setupRecognition();
      if (!SR) muted = true;
      await startLevel();
      self.history = [{ role: "user", content: firstUserTurn }];
      respond();
    };

    this.sendText = function (text) {
      text = (text || "").trim(); if (!text || ended) return;
      if (state === "thinking") return;
      if (state === "speaking") self.interrupt(true);
      commitUser(text);
    };

    this.interrupt = function (silent) {
      if (ended) return;
      if (ctl) ctl.abort();
      queue = []; clearTimeout(watchdog);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      speaking = false; streamDone = true;
      const clean = speakable(assistantText);
      if (clean && (!self.history.length || self.history[self.history.length - 1].role !== "assistant")) {
        self.history.push({ role: "assistant", content: clean });
        emit({ type: "turn", role: "assistant", text: clean });
      }
      assistantText = "";
      if (!silent) listen();
    };

    this.setMuted = function (m) {
      muted = Boolean(m) || !SR;
      if (muted) stopRec(); else if (state === "listening") startRec();
    };

    this.stop = function (reason = "user") {
      if (ended) return;
      ended = true;
      if (ctl) ctl.abort();
      queue = []; clearTimeout(watchdog); clearTimeout(silenceTimer);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      stopRec(); stopLevel();
      // Si cortó mientras hablaba, guardamos lo que alcanzó a decir el cliente.
      const clean = speakable(assistantText);
      if (clean && self.history.length && self.history[self.history.length - 1].role !== "assistant") self.history.push({ role: "assistant", content: clean });
      state = "ended"; emit({ type: "state", state: "ended" });
      emit({ type: "end", reason });
    };
  }

  // ---------------------------------------------------------------------------
  // Implementación con Vapi (preparada para el futuro, sin probar).
  // Requiere VOICE_PROVIDER=vapi y VAPI_PUBLIC_KEY en el .env.
  // Vapi maneja el micrófono, la transcripción, el modelo y la voz; nosotros
  // le pasamos las mismas instrucciones del escenario y recibimos la transcripción.
  // ---------------------------------------------------------------------------
  function VapiEngine(opts = {}) {
    const self = this;
    this.history = [];
    let vapi = null, emit = () => {}, ended = false;

    this.start = async function ({ system, firstUserTurn, onEvent }) {
      emit = onEvent || emit;
      emit({ type: "state", state: "connecting" });
      try {
        const mod = await import("https://esm.sh/@vapi-ai/web");
        const Vapi = mod.default || mod.Vapi;
        vapi = new Vapi(opts.vapiPublicKey);
      } catch (e) {
        emit({ type: "error", message: "No se pudo cargar Vapi. Revisá la conexión o volvé a VOICE_PROVIDER=browser.", fatal: true });
        return;
      }
      vapi.on("call-start", () => emit({ type: "state", state: "listening" }));
      vapi.on("speech-start", () => emit({ type: "state", state: "speaking" }));
      vapi.on("speech-end", () => emit({ type: "state", state: "listening" }));
      vapi.on("volume-level", v => emit({ type: "level", value: v }));
      vapi.on("message", msg => {
        if (msg.type !== "transcript") return;
        const role = msg.role === "user" ? "user" : "assistant";
        if (msg.transcriptType === "final") {
          self.history.push({ role, content: msg.transcript });
          emit({ type: "turn", role, text: msg.transcript });
          emit({ type: role === "user" ? "interim" : "partial", text: "" });
        } else {
          emit({ type: role === "user" ? "interim" : "partial", text: msg.transcript });
        }
      });
      vapi.on("error", e => emit({ type: "error", message: "Error de Vapi: " + (e && e.message || "desconocido"), fatal: false }));
      vapi.on("call-end", () => { if (!ended) { ended = true; emit({ type: "state", state: "ended" }); emit({ type: "end", reason: "user" }); } });

      // Asistente armado en el momento con las instrucciones del escenario.
      // Si preferís un asistente creado en el panel de Vapi, poné VAPI_ASSISTANT_ID en el .env.
      const assistant = opts.vapiAssistantId || {
        firstMessageMode: "assistant-speaks-first-with-model-generated-message",
        model: { provider: "anthropic", model: opts.model || "claude-sonnet-5", messages: [{ role: "system", content: system + "\n\n" + firstUserTurn }] },
        transcriber: { provider: "deepgram", language: "es" },
        voice: { provider: "azure", voiceId: "es-AR-ElenaNeural" },
        endCallPhrases: ["[FIN]"]
      };
      const overrides = opts.vapiAssistantId ? { model: { messages: [{ role: "system", content: system }] } } : undefined;
      vapi.start(assistant, overrides);
    };
    this.sendText = function (text) {
      if (vapi && text) vapi.send({ type: "add-message", message: { role: "user", content: text } });
    };
    this.interrupt = function () {};
    this.setMuted = function (m) { if (vapi) vapi.setMuted(Boolean(m)); };
    this.stop = function () { if (vapi) vapi.stop(); else if (!ended) { ended = true; emit({ type: "end", reason: "user" }); } };
  }

  function create(provider, opts) {
    return provider === "vapi" ? new VapiEngine(opts) : new BrowserEngine(opts);
  }

  return { create, support, spanishVoices, onVoicesReady };
})();
