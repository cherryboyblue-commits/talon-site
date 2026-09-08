(function () {
  const playBtn = document.getElementById("studio-play");
  const prevBtn = document.getElementById("studio-prev");
  const nextBtn = document.getElementById("studio-next");
  const seek = document.getElementById("studio-seek");
  const vol = document.getElementById("studio-vol");
  const nowTitle = document.getElementById("studio-now-title");
  const nowIndex = document.getElementById("studio-now-index");
  const timeEl = document.getElementById("studio-time");
  const onair = document.getElementById("studio-onair");
  const canvas = document.getElementById("studio-eq");
  const vuL = document.getElementById("studio-vu-l");
  const vuR = document.getElementById("studio-vu-r");
  const tubes = Array.prototype.slice.call(document.querySelectorAll(".studio-tube i"));
  const buttons = Array.prototype.slice.call(document.querySelectorAll(".studio-track"));
  if (!playBtn || !buttons.length) return;

  function sizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }
  sizeCanvas();
  window.addEventListener("load", sizeCanvas);
  window.addEventListener("resize", sizeCanvas);

  const tracks = buttons.map(function (btn, i) {
    const row = btn.closest("li") || btn;
    return {
      button: btn,
      src: btn.getAttribute("data-src"),
      title: (row.querySelector(".p-name") && row.querySelector(".p-name").textContent || "").trim(),
      slug: row.id || "",
      index: i
    };
  });

  const buffers = {};
  let current = 0;
  let ctx = null;
  let analyser = null;
  let gain = null;
  let freq = null;
  let wave = null;
  let source = null;
  let playing = false;
  let startedAt = 0;
  let pausedAt = 0;
  let seeking = false;
  let loading = false;
  let raf = 0;

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function duration() {
    const buf = buffers[tracks[current].src];
    return buf ? buf.duration : 0;
  }

  function position() {
    if (playing && ctx) return Math.min(duration(), pausedAt + (ctx.currentTime - startedAt));
    return pausedAt;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    gain = ctx.createGain();
    gain.gain.value = Number(vol.value);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
    return ctx;
  }

  function decodeBuffer(data) {
    const copy = data.slice(0);
    return new Promise(function (resolve, reject) {
      const result = ctx.decodeAudioData(copy, resolve, reject);
      if (result && typeof result.then === "function") result.then(resolve, reject);
    });
  }

  function loadTrack(src) {
    if (buffers[src]) return Promise.resolve(buffers[src]);
    return fetch(src).then(function (res) {
      if (!res.ok) throw new Error("track missing");
      return res.arrayBuffer();
    }).then(function (data) {
      return decodeBuffer(data);
    }).then(function (buf) {
      buffers[src] = buf;
      return buf;
    });
  }

  function stopSource() {
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch (err) { /* already stopped */ }
    try { source.disconnect(); } catch (err2) { /* ignore */ }
    source = null;
  }

  function paintIdle() {
    if (vuL) vuL.style.transform = "scaleY(0.08)";
    if (vuR) vuR.style.transform = "scaleY(0.08)";
    tubes.forEach(function (el) {
      el.style.width = "12%";
      el.style.opacity = "0.2";
    });
    if (!canvas) return;
    const g = canvas.getContext("2d");
    g.fillStyle = "#070504";
    g.fillRect(0, 0, canvas.width, canvas.height);
  }

  function paintMeters() {
    if (!playing || !analyser) {
      paintIdle();
      return;
    }
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    let peak = 0;
    for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i] - 128));
    const level = Math.min(1, peak / 64);
    if (vuL) vuL.style.transform = "scaleY(" + Math.max(0.08, level * 0.96) + ")";
    if (vuR) vuR.style.transform = "scaleY(" + Math.max(0.08, level * 0.86 + freq[8] / 320) + ")";
    tubes.forEach(function (el, i) {
      const v = freq[4 + i * 6] / 255;
      el.style.width = Math.round(14 + v * 86) + "%";
      el.style.opacity = String(0.25 + v * 0.75);
    });
    if (!canvas) return;
    const g = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    g.fillStyle = "rgba(7, 5, 4, 0.35)";
    g.fillRect(0, 0, w, h);
    const bars = 28;
    const gap = 2;
    const bw = (w - gap * bars) / bars;
    for (let i = 0; i < bars; i++) {
      const bin = freq[Math.floor(i * freq.length / bars)] || 0;
      const bh = Math.max(2, (bin / 255) * (h - 8));
      g.fillStyle = bin > 180 ? "#fbbf24" : "#b45309";
      g.fillRect(i * (bw + gap) + 4, h - bh - 4, bw, bh);
    }
  }

  function syncClock() {
    const d = duration();
    const t = position();
    if (!seeking && d) seek.value = String((t / d) * 1000);
    timeEl.textContent = fmt(t) + " / " + fmt(d);
  }

  function loop() {
    if (playing && !seeking) {
      const d = duration();
      if (d && position() >= d - 0.02) {
        select(current + 1, true);
        return;
      }
    }
    paintMeters();
    syncClock();
    raf = requestAnimationFrame(loop);
  }

  function setPlayingUi(on) {
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playBtn.textContent = loading ? "Loading" : on ? "Pause" : "Listen";
    onair.classList.toggle("is-live", on);
  }

  function startFrom(offset) {
    const buf = buffers[tracks[current].src];
    if (!buf || !ctx) return;
    stopSource();
    const start = Math.min(Math.max(0, offset), Math.max(0, buf.duration - 0.05));
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(analyser);
    source.onended = function () {
      if (!playing) return;
      if (Math.abs(position() - buf.duration) < 0.25 || position() >= buf.duration - 0.05) {
        select(current + 1, true);
      }
    };
    pausedAt = start;
    startedAt = ctx.currentTime;
    playing = true;
    source.start(0, start);
    setPlayingUi(true);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pausePlayback() {
    if (!playing) return;
    pausedAt = position();
    playing = false;
    stopSource();
    setPlayingUi(false);
    paintIdle();
    syncClock();
  }

  function playFrom(offset) {
    ensureContext();
    const track = tracks[current];
    loading = true;
    setPlayingUi(playing);
    playBtn.textContent = "Loading";
    return ctx.resume().then(function () {
      return loadTrack(track.src);
    }).then(function () {
      loading = false;
      startFrom(typeof offset === "number" ? offset : pausedAt);
    }).catch(function () {
      loading = false;
      playing = false;
      setPlayingUi(false);
      playBtn.textContent = "Listen";
    });
  }

  function applySeek(sliderValue) {
    const d = duration();
    const ratio = Math.min(1, Math.max(0, Number(sliderValue) / 1000));
    if (!d) {
      pausedAt = 0;
      syncClock();
      return;
    }
    const t = ratio * d;
    pausedAt = t;
    if (playing) startFrom(t);
    else syncClock();
  }

  function select(index, play) {
    const next = (index + tracks.length) % tracks.length;
    const keepPlay = play === true || (play !== false && playing);
    pausePlayback();
    pausedAt = 0;
    current = next;
    const track = tracks[current];
    buttons.forEach(function (btn) { btn.classList.remove("is-current"); });
    track.button.classList.add("is-current");
    nowTitle.textContent = track.title;
    nowIndex.textContent = "Track " + String(current + 1).padStart(2, "0") + " / " + String(tracks.length).padStart(2, "0");
    seek.value = "0";
    syncClock();
    if (track.slug && history.replaceState) history.replaceState(null, "", "#" + track.slug);
    if (keepPlay) playFrom(0);
  }

  function toggle() {
    if (loading) return;
    if (playing) pausePlayback();
    else playFrom(pausedAt);
  }

  playBtn.addEventListener("click", toggle);
  prevBtn.addEventListener("click", function () { select(current - 1, true); });
  nextBtn.addEventListener("click", function () { select(current + 1, true); });
  buttons.forEach(function (btn, i) {
    btn.addEventListener("click", function () { select(i, true); });
  });

  seek.addEventListener("pointerdown", function () { seeking = true; });
  seek.addEventListener("input", function () {
    seeking = true;
    applySeek(seek.value);
  });
  function finishSeek() {
    applySeek(seek.value);
    seeking = false;
  }
  seek.addEventListener("change", finishSeek);
  seek.addEventListener("pointerup", finishSeek);
  seek.addEventListener("pointercancel", function () { seeking = false; });

  vol.addEventListener("input", function () {
    if (gain) gain.gain.value = Number(vol.value);
  });

  document.addEventListener("keydown", function (event) {
    if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      toggle();
    } else if (event.code === "ArrowRight") select(current + 1, playing);
    else if (event.code === "ArrowLeft") select(current - 1, playing);
  });

  const hash = (location.hash || "").replace(/^#/, "");
  const fromHash = tracks.findIndex(function (t) { return t.slug === hash; });
  select(fromHash >= 0 ? fromHash : 0, false);
})();
