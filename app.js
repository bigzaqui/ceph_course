/**
 * Ceph & CephFS 3Blue1Brown-Style Visual Animation Engine
 * Pure Vanilla JS + HTML5 2D Canvas + ElevenLabs Neural TTS Engine
 */

(() => {
  const SCENES = window.CEPH_SCENES;
  const DEFAULT_ELEVENLABS_KEY = "";

  // Build flat segment index & cumulative timeline offsets across all 8 scenes
  let cumulative = 0;
  const ALL_SEGMENTS = [];
  SCENES.forEach((sc, idx) => {
    sc.index = idx;
    sc.globalStart = cumulative;
    sc.segments.forEach((seg, sIdx) => {
      seg.sceneId = sc.id;
      seg.sceneIndex = idx;
      seg.segIndex = sIdx;
      seg.key = `s${sc.id}_seg${sIdx}`;
      seg.diskFile = `audio/seg-0${sc.id}-0${sIdx + 1}.mp3`;
      seg.globalStart = cumulative + seg.start;
      seg.globalEnd = cumulative + seg.end;
      ALL_SEGMENTS.push(seg);
    });
    cumulative += sc.duration;
    sc.globalEnd = cumulative;
  });
  const TOTAL_DURATION = cumulative; // 380s (~6m 20s)

  // Palette (3Blue1Brown inspired)
  const C = {
    bg: "#070a0f",
    grid: "rgba(88, 196, 221, 0.045)",
    blue: "#58c4dd",
    blueSoft: "rgba(88, 196, 221, 0.16)",
    green: "#83c167",
    greenSoft: "rgba(131, 193, 103, 0.16)",
    yellow: "#f4d03f",
    yellowSoft: "rgba(244, 208, 63, 0.16)",
    orange: "#ff862f",
    orangeSoft: "rgba(255, 134, 47, 0.16)",
    purple: "#b189e8",
    purpleSoft: "rgba(177, 137, 232, 0.16)",
    red: "#fc6255",
    redSoft: "rgba(252, 98, 85, 0.16)",
    teal: "#45d0b0",
    white: "#eceff4",
    muted: "#8796ab",
    dim: "#3b495e",
    panel: "#0f151f"
  };

  // Player & ElevenLabs state
  const state = {
    playing: true,
    globalTime: 0,
    speed: 1.0,
    voiceEnabled: true,
    voiceId: localStorage.getItem("ceph_el_voice") || "nPczCjzI2devNBz1zQrb",
    apiKey: (localStorage.getItem("ceph_el_key") || "").startsWith("sk_") ? localStorage.getItem("ceph_el_key") : DEFAULT_ELEVENLABS_KEY,
    lastFrameTs: performance.now(),
    activeSegmentKey: "",
    audioEl: new Audio(),
    audioPlayingForKey: "",
    audioBusyLoadingKey: "",
    waitingForAudioFinish: false,
    autoplayBlocked: false,
    memBlobCache: new Map(),
    inflightFetches: new Map()
  };

  state.audioEl.preload = "auto";

  // DOM Elements
  const canvas = document.getElementById("stage-canvas");
  const ctx = canvas.getContext("2d");
  const sceneNav = document.getElementById("scene-nav");
  const captionTitle = document.getElementById("caption-scene-title");
  const captionBadge = document.getElementById("caption-step-badge");
  const captionText = document.getElementById("caption-text");
  const timeReadout = document.getElementById("time-readout");
  const scrubberTrack = document.getElementById("scrubber-track");
  const scrubberFill = document.getElementById("scrubber-fill");
  const scrubberThumb = document.getElementById("scrubber-thumb");
  const scrubberMarkers = document.getElementById("scrubber-markers");
  const playBtn = document.getElementById("btn-play");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const voiceBtn = document.getElementById("btn-voice");
  const voiceSelect = document.getElementById("voice-select");
  const speedSelect = document.getElementById("speed-select");
  const elStatus = document.getElementById("el-status");
  const voGuideBtn = document.getElementById("btn-vo-guide");
  const voModal = document.getElementById("vo-modal");
  const voCloseBtn = document.getElementById("btn-close-modal");
  const apiKeyInput = document.getElementById("el-api-key-input");
  const saveKeyBtn = document.getElementById("btn-save-key");
  const precacheBtn = document.getElementById("btn-precache-all");
  const precacheProgress = document.getElementById("precache-progress");

  if (voiceSelect) voiceSelect.value = state.voiceId;
  if (apiKeyInput) apiKeyInput.value = state.apiKey;

  // ============================================================================
  // IndexedDB Audio Cache + ElevenLabs Direct & Server-Backed Synthesizer
  // ============================================================================
  const DB_NAME = "ceph_elevenlabs_audio_db";
  const STORE_NAME = "segments";
  let dbPromise = null;

  function openAudioDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function getCachedBlob(cacheKey) {
    if (state.memBlobCache.has(cacheKey)) {
      return state.memBlobCache.get(cacheKey);
    }
    const db = await openAudioDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(cacheKey);
      req.onsuccess = () => {
        if (req.result) {
          state.memBlobCache.set(cacheKey, req.result);
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  async function setCachedBlob(cacheKey, blob) {
    state.memBlobCache.set(cacheKey, blob);
    const db = await openAudioDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, cacheKey);
  }

  function setStatus(text, color = "#83c167") {
    if (!elStatus) return;
    elStatus.textContent = text;
    elStatus.style.color = color;
  }

  async function fetchSegmentAudioBlob(seg) {
    const cacheKey = `${state.voiceId}_${seg.key}`;
    const existing = await getCachedBlob(cacheKey);
    if (existing) return existing;

    if (state.inflightFetches.has(cacheKey)) {
      return state.inflightFetches.get(cacheKey);
    }

    const promise = (async () => {
      // 1. Check if pre-generated MP3 exists on local server disk (for default voice Brian)
      if (state.voiceId === "nPczCjzI2devNBz1zQrb" || !state.apiKey) {
        try {
          const diskResp = await fetch(seg.diskFile, { method: "GET" });
          if (diskResp.ok && !(diskResp.headers.get("content-type") || "").includes("text/html")) {
            const diskBlob = await diskResp.blob();
            if (diskBlob.size > 1000) {
              await setCachedBlob(cacheKey, diskBlob);
              return diskBlob;
            }
          }
        } catch (_) {}
      }

      // 2. Call ElevenLabs REST API directly from browser (with automatic fallback if a voice requires a higher tier)
      const candidateVoices = [state.voiceId, "JBFqnCBsd6RMkjVDRZzb", "pNInz6obpgDQGcFmaJgB", "onwK4e9ZLuTAKqWW03F9"];
      let resp = null;
      for (const vId of candidateVoices) {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${vId}?output_format=mp3_44100_128`;
        resp = await fetch(url, {
          method: "POST",
          headers: {
            "xi-api-key": state.apiKey.trim(),
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify({
            text: seg.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.58,
              similarity_boost: 0.80,
              style: 0.15,
              use_speaker_boost: true
            }
          })
        });
        if (resp.ok) {
          state.voiceId = vId;
          break;
        }
        if (resp.status === 401) break; // Invalid key, do not retry
      }

      if (!resp.ok) {
        let errDetail = `HTTP ${resp.status}`;
        try {
          const errJson = await resp.json();
          errDetail = errJson?.detail?.message || errDetail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      const blob = await resp.blob();
      await setCachedBlob(cacheKey, blob);

      // Optional: if running via serve.py, also upload to local disk cache so future visits/devices have it on disk
      try {
        fetch(`/api/save-audio?file=${encodeURIComponent(seg.diskFile)}`, {
          method: "POST",
          body: blob
        }).catch(() => {});
      } catch (_) {}

      return blob;
    })();

    state.inflightFetches.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      state.inflightFetches.delete(cacheKey);
    }
  }

  function prefetchUpcomingSegments(currentSeg) {
    const idx = ALL_SEGMENTS.indexOf(currentSeg);
    if (idx === -1) return;
    for (let offset = 1; offset <= 2; offset++) {
      const nextSeg = ALL_SEGMENTS[idx + offset];
      if (nextSeg) {
        fetchSegmentAudioBlob(nextSeg).catch(() => {});
      }
    }
  }

  async function triggerNarrationForSegment(scene, seg, segIdx) {
    const key = seg.key;
    if (state.activeSegmentKey === key) return;
    state.activeSegmentKey = key;

    if (!state.voiceEnabled) return;

    stopNarrationAudio();
    state.audioBusyLoadingKey = key;
    setStatus(`Synthesizing ${scene.id}.${segIdx + 1}...`, C.yellow);

    // Prefetch next 2 segments in parallel
    prefetchUpcomingSegments(seg);

    try {
      const blob = await fetchSegmentAudioBlob(seg);
      // Verify user hasn't scrubbed to a different segment while fetching
      if (state.activeSegmentKey !== key || !state.voiceEnabled || !state.playing) {
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      state.audioEl.src = blobUrl;
      state.audioEl.playbackRate = state.speed;
      state.audioPlayingForKey = key;

      state.audioEl.onended = () => {
        URL.revokeObjectURL(blobUrl);
        if (state.audioPlayingForKey === key) {
          state.audioPlayingForKey = "";
          state.waitingForAudioFinish = false;
        }
      };

      await state.audioEl.play();
      state.autoplayBlocked = false;
      state.audioBusyLoadingKey = "";
      setStatus(`🔊 ElevenLabs Speaking (${scene.id}.${segIdx + 1})`, C.green);
    } catch (err) {
      state.audioBusyLoadingKey = "";
      state.audioPlayingForKey = "";
      state.waitingForAudioFinish = false;

      if (err && err.name === "NotAllowedError") {
        // Browser blocked unmuted autoplay before first user click; pause until user clicks Play
        state.autoplayBlocked = true;
        state.playing = false;
        state.activeSegmentKey = "";
        setStatus("▶ Click Play or press Space to start with ElevenLabs Audio", C.yellow);
        updateUI();
      } else {
        setStatus(`ElevenLabs Error: ${err.message || "Check API key"}`, C.red);
      }
    }
  }

  function stopNarrationAudio() {
    try {
      state.audioEl.pause();
      state.audioEl.removeAttribute("src");
      state.audioPlayingForKey = "";
      state.audioBusyLoadingKey = "";
      state.waitingForAudioFinish = false;
    } catch (_) {}
  }

  // Math & Easing Helpers
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const easeInOutCubic = (t) => {
    const x = clamp(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  const appear = (t, start, dur = 1.0) => easeOutCubic(invLerp(start, start + dur, t));

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  }

  function getActiveSceneAndLocalTime(globalSec) {
    const t = clamp(globalSec, 0, TOTAL_DURATION - 0.001);
    for (let i = 0; i < SCENES.length; i++) {
      const sc = SCENES[i];
      if (t >= sc.globalStart && t <= sc.globalEnd) {
        return { scene: sc, localTime: t - sc.globalStart };
      }
    }
    const last = SCENES[SCENES.length - 1];
    return { scene: last, localTime: last.duration };
  }

  function getActiveSegment(scene, localTime) {
    for (let i = 0; i < scene.segments.length; i++) {
      const seg = scene.segments[i];
      if (localTime >= seg.start && localTime <= seg.end) {
        return { seg, segIdx: i };
      }
    }
    const lastIdx = scene.segments.length - 1;
    return { seg: scene.segments[lastIdx], segIdx: lastIdx };
  }

  function initUI() {
    SCENES.forEach((sc, i) => {
      const btn = document.createElement("button");
      btn.className = "scene-pill";
      btn.dataset.index = i;
      btn.innerHTML = `<span class="num">0${sc.id}</span><span>${sc.shortTitle}</span>`;
      btn.addEventListener("click", () => {
        jumpToGlobalTime(sc.globalStart);
      });
      sceneNav.appendChild(btn);

      if (i > 0) {
        const marker = document.createElement("div");
        marker.className = "scrubber-marker";
        marker.style.left = `${(sc.globalStart / TOTAL_DURATION) * 100}%`;
        marker.title = sc.title;
        scrubberMarkers.appendChild(marker);
      }
    });
  }

  function jumpToGlobalTime(targetSec) {
    state.globalTime = clamp(targetSec, 0, TOTAL_DURATION);
    state.activeSegmentKey = "";
    stopNarrationAudio();
    updateUI();
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Drawing Primitives (1600x900 coordinate space)
  function drawGrid(ctx) {
    const step = 50;
    ctx.save();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1600; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 900);
      ctx.stroke();
    }
    for (let y = 0; y <= 900; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1600, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSceneHeader(ctx, scene, localTime) {
    const a = appear(localTime, 0, 0.8);
    ctx.save();
    ctx.globalAlpha = a;

    ctx.font = "600 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = C.white;
    ctx.textAlign = "left";
    ctx.fillText(scene.title, 70, 56);

    ctx.font = "500 17px 'SFMono-Regular', Consolas, monospace";
    const fWidth = ctx.measureText(scene.formula).width + 36;
    const rx = 1530 - fWidth;
    const ry = 28;
    roundRect(ctx, rx, ry, fWidth, 40, 8, "rgba(18, 26, 38, 0.9)", C.blue, 1.5);
    ctx.fillStyle = C.yellow;
    ctx.textAlign = "center";
    ctx.fillText(scene.formula, rx + fWidth / 2, ry + 26);

    ctx.strokeStyle = "rgba(88, 196, 221, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, 78);
    ctx.lineTo(1530, 78);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 2) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawCircleNode(ctx, x, y, r, fill, stroke, title, subtitle = "", alpha = 1, glow = false) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (title) {
      ctx.fillStyle = C.white;
      ctx.font = `600 ${Math.max(14, Math.floor(r * 0.42))}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(title, x, subtitle ? y - 7 : y);
    }
    if (subtitle) {
      ctx.fillStyle = C.muted;
      ctx.font = `500 ${Math.max(11, Math.floor(r * 0.3))}px 'SFMono-Regular', Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(subtitle, x, y + r * 0.36);
    }
    ctx.restore();
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, progress = 1, dashed = false, width = 2.5, label = "") {
    const p = clamp(progress, 0, 1);
    if (p <= 0.01) return;
    const tx = lerp(x1, x2, p);
    const ty = lerp(y1, y2, p);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 11;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (label && p > 0.6) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 12;
      ctx.font = "500 13px 'SFMono-Regular', Consolas, monospace";
      const lw = ctx.measureText(label).width + 14;
      roundRect(ctx, mx - lw / 2, my - 11, lw, 22, 4, "rgba(7, 10, 15, 0.88)", color, 1);
      ctx.fillStyle = C.white;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my);
    }
    ctx.restore();
  }

  function drawPacket(ctx, x1, y1, x2, y2, t, color, label = "") {
    const p = clamp(t, 0, 1);
    if (p <= 0 || p >= 1) return;
    const x = lerp(x1, x2, easeInOutCubic(p));
    const y = lerp(y1, y2, easeInOutCubic(p));
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.shadowBlur = 0;
      ctx.font = "600 12px 'SFMono-Regular', monospace";
      ctx.fillStyle = C.white;
      ctx.textAlign = "center";
      ctx.fillText(label, x, y - 14);
    }
    ctx.restore();
  }

  // ============================================================================
  // SCENE 1: What Ceph Is — Unified Object, Block, and File Storage
  // ============================================================================
  function renderScene1(ctx, t) {
    const siloFadeOut = 1 - invLerp(9.5, 12.5, t);
    if (siloFadeOut > 0.01) {
      const sA = appear(t, 0.4, 1.2) * siloFadeOut;
      ctx.save();
      ctx.globalAlpha = sA;
      ctx.font = "600 20px -apple-system, sans-serif";
      ctx.fillStyle = C.red;
      ctx.textAlign = "center";
      ctx.fillText("Legacy Storage Silos (Fragmented Capacity & Separate Hardware)", 800, 130);

      const silos = [
        { x: 350, title: "Object Silo", sub: "S3 / HTTP Appliance", col: C.orange },
        { x: 800, title: "Block SAN Silo", sub: "Fibre Channel LUNs", col: C.purple },
        { x: 1250, title: "File NAS Silo", sub: "NFS / SMB Filers", col: C.green }
      ];
      silos.forEach((s, idx) => {
        const bx = s.x - 160;
        const by = 175;
        roundRect(ctx, bx, by, 320, 420, 12, "rgba(25, 16, 22, 0.75)", s.col, 2);
        ctx.fillStyle = C.white;
        ctx.font = "600 22px -apple-system, sans-serif";
        ctx.fillText(s.title, s.x, by + 48);
        ctx.fillStyle = C.muted;
        ctx.font = "15px 'SFMono-Regular', monospace";
        ctx.fillText(s.sub, s.x, by + 80);

        for (let d = 0; d < 4; d++) {
          roundRect(ctx, bx + 36 + d * 64, by + 290, 52, 85, 6, C.panel, s.col, 1.5);
          ctx.fillStyle = s.col;
          ctx.font = "11px monospace";
          ctx.fillText(`Disk ${d + 1}`, bx + 62 + d * 64, by + 336);
        }

        if (idx < 2) {
          ctx.strokeStyle = "rgba(252, 98, 85, 0.45)";
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(s.x + 225, 165);
          ctx.lineTo(s.x + 225, 610);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      ctx.restore();
    }

    const unifiedAlpha = appear(t, 9.2, 1.5);
    if (unifiedAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = unifiedAlpha;

      const radosY = 470;
      roundRect(ctx, 180, radosY, 1240, 225, 16, "rgba(14, 29, 42, 0.85)", C.blue, 2.5);
      ctx.fillStyle = C.blue;
      ctx.font = "700 23px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CEPH UNIFIED RADOS STORAGE CLUSTER", 800, radosY + 40);
      ctx.fillStyle = C.muted;
      ctx.font = "15px 'SFMono-Regular', monospace";
      ctx.fillText("Self-Healing  •  Commodity Hardware  •  No Single Point of Failure  •  Shared Pool of OSDs", 800, radosY + 68);

      for (let i = 0; i < 8; i++) {
        const nx = 270 + i * 150;
        const ny = radosY + 145;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.5 + i * 0.8);
        drawCircleNode(
          ctx,
          nx,
          ny,
          36,
          "rgba(88, 196, 221, 0.14)",
          C.blue,
          `OSD.${i}`,
          "4 TB NVMe",
          1,
          pulse > 0.85
        );
        if (i < 7) {
          drawArrow(ctx, nx + 38, ny, nx + 112, ny, "rgba(88, 196, 221, 0.3)", 1, true, 1.5);
        }
      }

      const pillars = [
        {
          start: 18,
          x: 340,
          title: "1. Object Storage (RGW)",
          proto: "S3 & Swift REST APIs",
          desc: "Buckets, Objects, Multi-Site Cloud Apps",
          color: C.orange,
          soft: C.orangeSoft
        },
        {
          start: 27,
          x: 800,
          title: "2. Block Storage (RBD)",
          proto: "Kernel RBD / librbd",
          desc: "Virtual Disks for KVM, OpenStack & K8s PVCs",
          color: C.purple,
          soft: C.purpleSoft
        },
        {
          start: 36,
          x: 1260,
          title: "3. File System (CephFS)",
          proto: "POSIX Shared Filesystem",
          desc: "Directories, Inodes & Shared HPC / AI Mounts",
          color: C.green,
          soft: C.greenSoft
        }
      ];

      pillars.forEach((p) => {
        const pa = appear(t, p.start, 1.3);
        if (pa <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = pa * unifiedAlpha;
        const boxW = 370;
        const boxH = 190;
        const bx = p.x - boxW / 2;
        const by = 165;
        roundRect(ctx, bx, by, boxW, boxH, 12, p.soft, p.color, 2.5);

        ctx.fillStyle = C.white;
        ctx.font = "700 21px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.title, p.x, by + 48);

        ctx.fillStyle = p.color;
        ctx.font = "600 15px 'SFMono-Regular', monospace";
        ctx.fillText(p.proto, p.x, by + 88);

        ctx.fillStyle = C.white;
        ctx.font = "14.5px -apple-system, sans-serif";
        ctx.fillText(p.desc, p.x, by + 132);

        drawArrow(ctx, p.x, by + boxH + 4, p.x, radosY - 6, p.color, pa, false, 3, "librados");
        const flowT = ((t - p.start) * 0.7) % 1;
        drawPacket(ctx, p.x, by + boxH + 4, p.x, radosY - 6, flowT, p.color);
        ctx.restore();
      });

      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 2: RADOS as the Foundation
  // ============================================================================
  function renderScene2(ctx, t) {
    const a1 = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = a1;

    roundRect(ctx, 90, 150, 300, 160, 12, C.greenSoft, C.green, 2.5);
    ctx.fillStyle = C.white;
    ctx.font = "700 20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("User File / RBD Volume", 240, 195);
    ctx.fillStyle = C.green;
    ctx.font = "600 16px 'SFMono-Regular', monospace";
    ctx.fillText("movie.mp4  (16 MB)", 240, 232);
    ctx.fillStyle = C.muted;
    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillText("Sliced into 4 MB stripes", 240, 270);
    ctx.restore();

    const shardProgress = appear(t, 8.5, 1.8);
    if (shardProgress > 0.01) {
      const shards = [
        { id: "100001a.00000000", range: "0 – 4 MB", col: C.blue },
        { id: "100001a.00000001", range: "4 – 8 MB", col: C.teal },
        { id: "100001a.00000002", range: "8 – 12 MB", col: C.yellow },
        { id: "100001a.00000003", range: "12 – 16 MB", col: C.orange }
      ];

      shards.forEach((sh, i) => {
        const sy = 365 + i * 76;
        drawArrow(ctx, 240, 310, 240, 355, C.green, shardProgress, false, 2);
        ctx.save();
        ctx.globalAlpha = shardProgress;
        roundRect(ctx, 85, sy, 310, 60, 8, "rgba(18, 28, 42, 0.9)", sh.col, 2);
        ctx.fillStyle = C.white;
        ctx.font = "600 14.5px 'SFMono-Regular', monospace";
        ctx.textAlign = "left";
        ctx.fillText(sh.id, 102, sy + 28);
        ctx.fillStyle = sh.col;
        ctx.font = "13px 'SFMono-Regular', monospace";
        ctx.fillText(sh.range, 102, sy + 48);
        ctx.restore();
      });
    }

    const anatAlpha = appear(t, 17.5, 1.5);
    if (anatAlpha > 0.01) {
      drawArrow(ctx, 395, 395, 510, 320, C.blue, anatAlpha, false, 2.5, "Inspect Object");
      ctx.save();
      ctx.globalAlpha = anatAlpha;

      const ox = 520;
      const oy = 150;
      const ow = 440;
      const oh = 490;
      roundRect(ctx, ox, oy, ow, oh, 14, "rgba(15, 23, 34, 0.94)", C.blue, 2.5);

      ctx.fillStyle = C.blue;
      ctx.font = "700 21px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Anatomy of a RADOS Object", ox + ow / 2, oy + 42);

      roundRect(ctx, ox + 30, oy + 72, ow - 60, 95, 10, C.yellowSoft, C.yellow, 2);
      ctx.fillStyle = C.yellow;
      ctx.font = "700 16px 'SFMono-Regular', monospace";
      ctx.fillText("1. Object ID (OID)", ox + ow / 2, oy + 104);
      ctx.fillStyle = C.white;
      ctx.font = "14px 'SFMono-Regular', monospace";
      ctx.fillText("oid = \"100001a.00000000\"", ox + ow / 2, oy + 136);

      roundRect(ctx, ox + 30, oy + 188, ow - 60, 145, 10, C.blueSoft, C.blue, 2);
      ctx.fillStyle = C.blue;
      ctx.font = "700 16px 'SFMono-Regular', monospace";
      ctx.fillText("2. Binary Data Payload (up to 4 MB)", ox + ow / 2, oy + 220);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 6; c++) {
          roundRect(ctx, ox + 52 + c * 56, oy + 240 + r * 36, 48, 28, 4, "#0b121c", C.blue, 1);
          ctx.fillStyle = C.muted;
          ctx.font = "11px monospace";
          ctx.fillText(`0x${((r * 6 + c + 10) * 7).toString(16)}`, ox + 76 + c * 56, oy + 258 + r * 36);
        }
      }

      roundRect(ctx, ox + 30, oy + 354, ow - 60, 112, 10, C.purpleSoft, C.purple, 2);
      ctx.fillStyle = C.purple;
      ctx.font = "700 16px 'SFMono-Regular', monospace";
      ctx.fillText("3. xattrs & OMAP (Key-Value Store)", ox + ow / 2, oy + 386);
      ctx.fillStyle = C.white;
      ctx.font = "13.5px 'SFMono-Regular', monospace";
      ctx.fillText("xattr['layout'] = stripe_4M  |  OMAP: { dir_key: inode }", ox + ow / 2, oy + 422);

      ctx.restore();
    }

    const ringAlpha = appear(t, 27, 1.5);
    if (ringAlpha > 0.01) {
      drawArrow(ctx, 960, 395, 1065, 395, C.teal, ringAlpha, false, 2.5, "librados");
      ctx.save();
      ctx.globalAlpha = ringAlpha;

      const cx = 1290;
      const cy = 395;
      const rad = 165;

      ctx.font = "700 20px -apple-system, sans-serif";
      ctx.fillStyle = C.white;
      ctx.textAlign = "center";
      ctx.fillText("Autonomic Self-Healing Mesh", cx, 165);
      ctx.font = "14px 'SFMono-Regular', monospace";
      ctx.fillStyle = C.teal;
      ctx.fillText("Replication • Scrubbing • Recovery", cx, 192);

      const pts = [];
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6 - Math.PI / 2;
        pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
      }
      ctx.strokeStyle = "rgba(69, 208, 176, 0.28)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        for (let j = i + 1; j < 6; j++) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }

      const pIdx = Math.floor(t * 1.5) % 6;
      const nIdx = (pIdx + 2) % 6;
      drawPacket(ctx, pts[pIdx].x, pts[pIdx].y, pts[nIdx].x, pts[nIdx].y, (t * 1.5) % 1, C.yellow, "3x Replica");

      pts.forEach((pt, idx) => {
        drawCircleNode(ctx, pt.x, pt.y, 34, C.panel, C.teal, `OSD.${idx}`, "Active", 1, idx === pIdx);
      });
      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 3: OSDs (Object Storage Daemons) & BlueStore
  // ============================================================================
  function renderScene3(ctx, t) {
    const osdAlpha = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = osdAlpha;

    const lx = 80;
    const ly = 135;
    const lw = 650;
    const lh = 535;
    roundRect(ctx, lx, ly, lw, lh, 16, "rgba(15, 22, 34, 0.92)", C.blue, 2.5);

    ctx.fillStyle = C.white;
    ctx.font = "700 22px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Inside One OSD Node: ceph-osd + BlueStore", lx + lw / 2, ly + 42);
    ctx.fillStyle = C.muted;
    ctx.font = "14px 'SFMono-Regular', monospace";
    ctx.fillText("1 Daemon  =  1 Physical Drive (No Local XFS/ext4 Overhead)", lx + lw / 2, ly + 70);

    drawCircleNode(ctx, lx + lw / 2, ly + 135, 44, C.blueSoft, C.blue, "ceph-osd.1", "Daemon", 1, true);

    const bsAlpha = appear(t, 9, 1.4);
    if (bsAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = bsAlpha * osdAlpha;
      roundRect(ctx, lx + 35, ly + 210, lw - 70, 295, 12, "rgba(10, 16, 26, 0.95)", C.teal, 2);
      ctx.fillStyle = C.teal;
      ctx.font = "700 18px 'SFMono-Regular', monospace";
      ctx.fillText("BlueStore Storage Engine (Direct Raw Block I/O)", lx + lw / 2, ly + 242);

      roundRect(ctx, lx + 58, ly + 268, 255, 210, 10, C.blueSoft, C.blue, 2);
      ctx.fillStyle = C.white;
      ctx.font = "700 16px -apple-system, sans-serif";
      ctx.fillText("Raw Block Device", lx + 185, ly + 300);
      ctx.fillStyle = C.blue;
      ctx.font = "13px 'SFMono-Regular', monospace";
      ctx.fillText("Direct 4MB Object Extents", lx + 185, ly + 325);
      for (let b = 0; b < 6; b++) {
        roundRect(ctx, lx + 78 + (b % 3) * 74, ly + 348 + Math.floor(b / 3) * 52, 64, 40, 5, "#091019", C.blue, 1.2);
        ctx.fillStyle = C.white;
        ctx.font = "11px monospace";
        ctx.fillText(`Extent ${b}`, lx + 110 + (b % 3) * 74, ly + 372 + Math.floor(b / 3) * 52);
      }
      drawArrow(ctx, lx + lw / 2 - 30, ly + 170, lx + 185, ly + 265, C.blue, bsAlpha, false, 2.2, "Raw Data");

      const rdbAlpha = appear(t, 18.5, 1.4);
      if (rdbAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = rdbAlpha;
        roundRect(ctx, lx + 338, ly + 268, 255, 210, 10, C.yellowSoft, C.yellow, 2);
        ctx.fillStyle = C.white;
        ctx.font = "700 16px -apple-system, sans-serif";
        ctx.fillText("RocksDB + WAL (NVMe)", lx + 465, ly + 300);
        ctx.fillStyle = C.yellow;
        ctx.font = "13px 'SFMono-Regular', monospace";
        ctx.fillText("BlueFS Embedded Metadata", lx + 465, ly + 325);

        const items = ["• Object OMAP & xattrs", "• Free-Space Allocator", "• Write-Ahead Log (WAL)", "• Checksums (CRC32c)"];
        ctx.textAlign = "left";
        ctx.fillStyle = C.white;
        ctx.font = "13.5px 'SFMono-Regular', monospace";
        items.forEach((it, idx) => {
          ctx.fillText(it, lx + 358, ly + 362 + idx * 28);
        });
        drawArrow(ctx, lx + lw / 2 + 30, ly + 170, lx + 465, ly + 265, C.yellow, rdbAlpha, false, 2.2, "KV / WAL");
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();

    const repAlpha = appear(t, 28.5, 1.4);
    if (repAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = repAlpha;
      const rx = 780;
      const ry = 135;
      const rw = 740;
      const rh = 535;
      roundRect(ctx, rx, ry, rw, rh, 16, "rgba(15, 22, 34, 0.92)", C.green, 2.5);

      ctx.fillStyle = C.white;
      ctx.font = "700 22px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Strong Consistency: Primary-Driven Replication", rx + rw / 2, ry + 42);
      ctx.fillStyle = C.muted;
      ctx.font = "14px 'SFMono-Regular', monospace";
      ctx.fillText("Pool Size = 3  (1 Primary OSD + 2 Replica OSDs)", rx + rw / 2, ry + 70);

      const clientPos = { x: rx + 115, y: ry + 275 };
      const primPos = { x: rx + 365, y: ry + 275 };
      const sec1Pos = { x: rx + 610, y: ry + 175 };
      const sec2Pos = { x: rx + 610, y: ry + 385 };

      drawCircleNode(ctx, clientPos.x, clientPos.y, 44, C.purpleSoft, C.purple, "Client", "librados", 1);
      drawCircleNode(ctx, primPos.x, primPos.y, 52, C.blueSoft, C.blue, "OSD.2", "Primary", 1, true);
      drawCircleNode(ctx, sec1Pos.x, sec1Pos.y, 46, C.greenSoft, C.green, "OSD.7", "Replica 1", 1);
      drawCircleNode(ctx, sec2Pos.x, sec2Pos.y, 46, C.greenSoft, C.green, "OSD.10", "Replica 2", 1);

      drawArrow(ctx, clientPos.x + 46, clientPos.y - 10, primPos.x - 54, primPos.y - 10, C.yellow, 1, false, 2.5, "1. Write Obj");
      drawArrow(ctx, primPos.x + 48, primPos.y - 22, sec1Pos.x - 46, sec1Pos.y + 10, C.blue, 1, false, 2.2, "2. Replicate");
      drawArrow(ctx, primPos.x + 48, primPos.y + 22, sec2Pos.x - 46, sec2Pos.y - 10, C.blue, 1, false, 2.2, "2. Replicate");

      const cycle = ((t - 29) % 4) / 4;
      if (cycle < 0.35) {
        drawPacket(ctx, clientPos.x + 46, clientPos.y - 10, primPos.x - 54, primPos.y - 10, cycle / 0.35, C.yellow, "4MB Write");
      } else if (cycle < 0.7) {
        const sub = (cycle - 0.35) / 0.35;
        drawPacket(ctx, primPos.x + 48, primPos.y - 22, sec1Pos.x - 46, sec1Pos.y + 10, sub, C.blue, "Copy 2");
        drawPacket(ctx, primPos.x + 48, primPos.y + 22, sec2Pos.x - 46, sec2Pos.y - 10, sub, C.blue, "Copy 3");
      }

      const ackAlpha = appear(t, 38.5, 1.2);
      if (ackAlpha > 0.01) {
        drawArrow(ctx, primPos.x - 54, primPos.y + 16, clientPos.x + 46, clientPos.y + 16, C.green, ackAlpha, true, 2.2, "3. Commit ACK");
        drawArrow(ctx, sec1Pos.x, sec1Pos.y + 48, sec2Pos.x, sec2Pos.y - 48, C.teal, ackAlpha, true, 1.8, "Peer Heartbeat");
        if (cycle >= 0.7) {
          const sub = (cycle - 0.7) / 0.3;
          drawPacket(ctx, primPos.x - 54, primPos.y + 16, clientPos.x + 46, clientPos.y + 16, sub, C.green, "ACK");
        }
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 4: Monitors (MONs) and the Cluster Map
  // ============================================================================
  function renderScene4(ctx, t) {
    const monAlpha = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = monAlpha;

    const mons = [
      { id: "MON.a", ip: "10.0.1.10:3300", x: 310, y: 195, role: "Leader" },
      { id: "MON.b", ip: "10.0.1.11:3300", x: 160, y: 430, role: "Peon" },
      { id: "MON.c", ip: "10.0.1.12:3300", x: 460, y: 430, role: "Peon" }
    ];

    ctx.fillStyle = C.white;
    ctx.font = "700 21px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Monitor Paxos Quorum (Odd Count: 3 MONs)", 310, 125);

    for (let i = 0; i < 3; i++) {
      const m1 = mons[i];
      const m2 = mons[(i + 1) % 3];
      drawArrow(ctx, m1.x, m1.y, m2.x, m2.y, C.yellow, 1, true, 2);
      const pulseT = ((t * 0.9 + i * 0.33) % 1);
      drawPacket(ctx, m1.x, m1.y, m2.x, m2.y, pulseT, C.yellow, "Paxos");
    }

    mons.forEach((m) => {
      drawCircleNode(ctx, m.x, m.y, 48, C.yellowSoft, C.yellow, m.id, m.role, 1, true);
    });

    roundRect(ctx, 115, 515, 390, 88, 10, "rgba(244, 208, 63, 0.1)", C.yellow, 1.5);
    ctx.fillStyle = C.yellow;
    ctx.font = "600 15px 'SFMono-Regular', monospace";
    ctx.fillText("Quorum Rule: Majority = ⌊3/2⌋ + 1 = 2 MONs", 310, 548);
    ctx.fillStyle = C.muted;
    ctx.font = "13.5px -apple-system, sans-serif";
    ctx.fillText("MONs never serve file data — only Cluster Maps", 310, 578);
    ctx.restore();

    const mapAlpha = appear(t, 17.5, 1.4);
    if (mapAlpha > 0.01) {
      const isEpochUpdated = t >= 28;
      const epochNum = isEpochUpdated ? "Epoch e105" : "Epoch e104";
      const epochCol = isEpochUpdated ? C.orange : C.blue;

      drawArrow(ctx, 510, 320, 600, 320, C.yellow, mapAlpha, false, 2.5, "Maintains");

      ctx.save();
      ctx.globalAlpha = mapAlpha;
      const mx = 610;
      const my = 125;
      const mw = 440;
      const mh = 520;
      roundRect(ctx, mx, my, mw, mh, 14, "rgba(14, 22, 34, 0.95)", epochCol, 2.5);

      ctx.fillStyle = C.white;
      ctx.font = "700 22px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Master Cluster Map (${epochNum})`, mx + mw / 2, my + 42);

      const subMaps = [
        { name: "1. MON Map", desc: "Monitor addresses, FSID, Paxos epoch", col: C.yellow },
        {
          name: "2. OSD Map",
          desc: isEpochUpdated ? "OSD.4 marked DOWN / OUT (e105)" : "All 12 OSDs UP / IN (e104)",
          col: isEpochUpdated ? C.red : C.blue
        },
        { name: "3. PG Map", desc: "PG versions, acting sets, scrub states", col: C.teal },
        { name: "4. CRUSH Map", desc: "Physical hierarchy tree + placement rules", col: C.purple },
        { name: "5. MDS Map", desc: "Active / Standby CephFS metadata daemons", col: C.green }
      ];

      subMaps.forEach((sm, idx) => {
        const sy = my + 75 + idx * 84;
        roundRect(ctx, mx + 26, sy, mw - 52, 68, 9, "#0a1018", sm.col, 1.8);
        ctx.fillStyle = sm.col;
        ctx.font = "700 15.5px 'SFMono-Regular', monospace";
        ctx.textAlign = "left";
        ctx.fillText(sm.name, mx + 44, sy + 27);
        ctx.fillStyle = C.white;
        ctx.font = "13.5px -apple-system, sans-serif";
        ctx.fillText(sm.desc, mx + 44, sy + 50);
      });
      ctx.restore();
    }

    const failAlpha = appear(t, 28, 1.4);
    if (failAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = failAlpha;

      ctx.fillStyle = C.white;
      ctx.font = "700 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Epoch Update & Map Broadcast", 1330, 145);

      drawCircleNode(ctx, 1330, 240, 44, C.redSoft, C.red, "OSD.4", "DOWN / OUT", 1, true);
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1300, 210);
      ctx.lineTo(1360, 270);
      ctx.moveTo(1360, 210);
      ctx.lineTo(1300, 270);
      ctx.stroke();

      const bcastAlpha = appear(t, 37, 1.3);
      const targets = [
        { label: "OSD.2", sub: "e105 synced", x: 1210, y: 430, col: C.blue },
        { label: "OSD.7", sub: "e105 synced", x: 1450, y: 430, col: C.blue },
        { label: "Client A", sub: "e105 synced", x: 1210, y: 575, col: C.purple },
        { label: "Client B", sub: "e105 synced", x: 1450, y: 575, col: C.purple }
      ];

      targets.forEach((tg, i) => {
        drawCircleNode(ctx, tg.x, tg.y, 40, C.panel, tg.col, tg.label, bcastAlpha > 0.5 ? tg.sub : "e104", 1);
        if (bcastAlpha > 0.01) {
          drawArrow(ctx, 1050, 340 + i * 25, tg.x - 42, tg.y, C.orange, bcastAlpha, false, 2, i === 0 ? "Δ e105" : "");
          const pT = ((t - 37 + i * 0.25) * 0.8) % 1;
          drawPacket(ctx, 1050, 340 + i * 25, tg.x - 42, tg.y, pT, C.orange, "e105");
        }
      });

      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 5: MDS (Metadata Servers) for CephFS
  // ============================================================================
  function renderScene5(ctx, t) {
    const treeAlpha = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = treeAlpha;

    roundRect(ctx, 75, 130, 470, 530, 14, "rgba(14, 23, 35, 0.92)", C.green, 2);
    ctx.fillStyle = C.white;
    ctx.font = "700 21px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("POSIX Directory Hierarchy (CephFS)", 310, 170);

    const rootN = { x: 310, y: 235, label: "/", sub: "inode 0x1" };
    const homeN = { x: 195, y: 350, label: "/home", sub: "dir" };
    const dataN = { x: 425, y: 350, label: "/data", sub: "hot dir" };
    const aliceN = { x: 195, y: 475, label: "/alice", sub: "dir" };
    const projN = { x: 425, y: 475, label: "run.py", sub: "inode 100001a" };
    const fileN = { x: 195, y: 595, label: "notes.txt", sub: "inode 100001b" };

    const edges = [
      [rootN, homeN],
      [rootN, dataN],
      [homeN, aliceN],
      [aliceN, fileN],
      [dataN, projN]
    ];
    edges.forEach(([a, b]) => {
      drawArrow(ctx, a.x, a.y + 30, b.x, b.y - 30, C.green, 1, false, 2);
    });

    const isPartitioned = t >= 29;
    drawCircleNode(ctx, rootN.x, rootN.y, 34, C.greenSoft, C.green, rootN.label, rootN.sub);
    drawCircleNode(ctx, homeN.x, homeN.y, 36, C.greenSoft, C.green, homeN.label, homeN.sub);
    drawCircleNode(
      ctx,
      dataN.x,
      dataN.y,
      36,
      isPartitioned ? C.orangeSoft : C.greenSoft,
      isPartitioned ? C.orange : C.green,
      dataN.label,
      isPartitioned ? "MDS.1 Shard" : dataN.sub,
      1,
      isPartitioned
    );
    drawCircleNode(ctx, aliceN.x, aliceN.y, 36, C.greenSoft, C.green, aliceN.label, aliceN.sub);
    drawCircleNode(
      ctx,
      projN.x,
      projN.y,
      38,
      isPartitioned ? C.orangeSoft : C.blueSoft,
      isPartitioned ? C.orange : C.blue,
      projN.label,
      projN.sub
    );
    drawCircleNode(ctx, fileN.x, fileN.y, 38, C.blueSoft, C.blue, fileN.label, fileN.sub);
    ctx.restore();

    const mdsAlpha = appear(t, 9, 1.4);
    if (mdsAlpha > 0.01) {
      drawArrow(ctx, 545, 350, 635, 290, C.green, mdsAlpha, false, 2.5, "Managed by");
      ctx.save();
      ctx.globalAlpha = mdsAlpha;

      const mx = 645;
      const my = 130;
      const mw = 450;
      const mh = 340;
      roundRect(ctx, mx, my, mw, mh, 14, "rgba(16, 26, 38, 0.95)", C.green, 2.5);
      ctx.fillStyle = C.green;
      ctx.font = "700 21px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ceph-mds.0 (Active Metadata Server)", mx + mw / 2, my + 40);

      roundRect(ctx, mx + 26, my + 65, mw - 52, 130, 10, "#09111a", C.blue, 1.5);
      ctx.fillStyle = C.blue;
      ctx.font = "700 15px 'SFMono-Regular', monospace";
      ctx.fillText("RAM Cache: Dentries, Inodes & Capabilities", mx + mw / 2, my + 92);
      ctx.textAlign = "left";
      ctx.fillStyle = C.white;
      ctx.font = "13.5px 'SFMono-Regular', monospace";
      ctx.fillText("• Path: /data/run.py  →  Inode: 0x100001a", mx + 44, my + 122);
      ctx.fillText("• Mode: 0644 | UID: 1000 | Size: 16,777,216 B", mx + 44, my + 148);
      ctx.fillText("• Client Caps: [Auth, Link, Xattr, FileReadWrite]", mx + 44, my + 174);

      const ruleAlpha = appear(t, 19, 1.2);
      if (ruleAlpha > 0.01) {
        roundRect(ctx, mx + 26, my + 215, mw - 52, 98, 10, C.yellowSoft, C.yellow, 2);
        ctx.fillStyle = C.yellow;
        ctx.textAlign = "center";
        ctx.font = "700 16px -apple-system, sans-serif";
        ctx.fillText("CRITICAL ARCHITECTURAL RULE", mx + mw / 2, my + 245);
        ctx.fillStyle = C.white;
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillText("MDS NEVER stores or routes file payload bytes!", mx + mw / 2, my + 272);
        ctx.fillStyle = C.muted;
        ctx.font = "13px 'SFMono-Regular', monospace";
        ctx.fillText("Metadata Journal is stored in RADOS cephfs_metadata pool", mx + mw / 2, my + 296);

        roundRect(ctx, mx, 525, mw, 135, 14, C.blueSoft, C.blue, 2);
        ctx.fillStyle = C.blue;
        ctx.font = "700 18px 'SFMono-Regular', monospace";
        ctx.fillText("RADOS Pool: cephfs_metadata", mx + mw / 2, 565);
        ctx.fillStyle = C.white;
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillText("Persists MDS Journal + Inode OMAP Objects on SSD/NVMe OSDs", mx + mw / 2, 602);
        drawArrow(ctx, mx + mw / 2, my + mh, mx + mw / 2, 522, C.yellow, ruleAlpha, false, 2.5, "Journal Flush");
      }

      ctx.restore();
    }

    const scaleAlpha = appear(t, 29, 1.4);
    if (scaleAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = scaleAlpha;
      const rx = 1155;
      roundRect(ctx, rx, 130, 375, 530, 14, "rgba(15, 22, 34, 0.92)", C.orange, 2);
      ctx.fillStyle = C.white;
      ctx.font = "700 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MDS Scale-Out & HA", rx + 187, 172);

      drawCircleNode(ctx, rx + 187, 275, 52, C.orangeSoft, C.orange, "ceph-mds.1", "Active (/data)", 1, true);
      drawArrow(ctx, 1095, 260, rx + 130, 275, C.orange, scaleAlpha, false, 2.5, "Migrate /data");

      const sbAlpha = appear(t, 39, 1.3);
      if (sbAlpha > 0.01) {
        drawCircleNode(ctx, rx + 187, 495, 52, C.purpleSoft, C.purple, "ceph-mds.2", "Standby-Replay", sbAlpha, true);
        drawArrow(ctx, 1095, 585, rx + 130, 505, C.purple, sbAlpha, true, 2.2, "Tail Journal");
        ctx.fillStyle = C.muted;
        ctx.font = "13.5px -apple-system, sans-serif";
        ctx.fillText("Warm RAM cache ready for instant failover", rx + 187, 585);
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 6: CRUSH Algorithm — Hierarchical Deterministic Placement
  // ============================================================================
  function renderScene6(ctx, t) {
    const fAlpha = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = fAlpha;

    roundRect(ctx, 160, 105, 1280, 92, 12, "rgba(16, 25, 38, 0.95)", C.purple, 2);
    ctx.fillStyle = C.white;
    ctx.font = "600 20px 'SFMono-Regular', Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      "CRUSH( PG = \"3.a7\",  ClusterMap = e105,  Rule = \"replicated_rack_3x\" )   ===►   [ OSD.2,  OSD.7,  OSD.10 ]",
      800,
      144
    );
    ctx.fillStyle = C.yellow;
    ctx.font = "14.5px -apple-system, sans-serif";
    ctx.fillText(
      "No Central Lookup Table! Every Client & OSD computes identical target coordinates purely from the Cluster Map.",
      800,
      176
    );
    ctx.restore();

    const treeAlpha = appear(t, 10, 1.5);
    if (treeAlpha <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = treeAlpha;

    const rootPos = { x: 800, y: 255 };
    const racks = [
      { id: "Rack A", weight: "w: 16.0", x: 310, y: 375, selected: true, col: C.blue },
      { id: "Rack B", weight: "w: 16.0", x: 800, y: 375, selected: true, col: C.green },
      { id: "Rack C", weight: "w: 16.0", x: 1290, y: 375, selected: true, col: C.orange }
    ];

    const hosts = [
      { id: "host-a1", rack: 0, x: 190, y: 505, selected: false },
      { id: "host-a2", rack: 0, x: 430, y: 505, selected: true, col: C.blue },
      { id: "host-b1", rack: 1, x: 680, y: 505, selected: true, col: C.green },
      { id: "host-b2", rack: 1, x: 920, y: 505, selected: false },
      { id: "host-c1", rack: 2, x: 1170, y: 505, selected: true, col: C.orange },
      { id: "host-c2", rack: 2, x: 1410, y: 505, selected: false }
    ];

    const osds = [
      { id: "OSD.0", host: 0, x: 140, y: 635, sel: false },
      { id: "OSD.1", host: 0, x: 240, y: 635, sel: false },
      { id: "OSD.2", host: 1, x: 380, y: 635, sel: true, role: "Primary", col: C.blue },
      { id: "OSD.3", host: 1, x: 480, y: 635, sel: false },
      { id: "OSD.6", host: 2, x: 630, y: 635, sel: false },
      { id: "OSD.7", host: 2, x: 730, y: 635, sel: true, role: "Replica 2", col: C.green },
      { id: "OSD.8", host: 3, x: 870, y: 635, sel: false },
      { id: "OSD.9", host: 3, x: 970, y: 635, sel: false },
      { id: "OSD.10", host: 4, x: 1120, y: 635, sel: true, role: "Replica 3", col: C.orange },
      { id: "OSD.11", host: 4, x: 1220, y: 635, sel: false },
      { id: "OSD.12", host: 5, x: 1360, y: 635, sel: false },
      { id: "OSD.13", host: 5, x: 1460, y: 635, sel: false }
    ];

    const walkStep = t >= 31;

    racks.forEach((rk) => {
      const col = walkStep ? rk.col : C.dim;
      drawArrow(ctx, rootPos.x, rootPos.y + 32, rk.x, rk.y - 34, col, 1, !walkStep, walkStep ? 3 : 1.5);
    });

    hosts.forEach((h) => {
      const rk = racks[h.rack];
      const active = walkStep && h.selected;
      drawArrow(ctx, rk.x, rk.y + 34, h.x, h.y - 30, active ? h.col : C.dim, 1, !active, active ? 3 : 1.5);
    });

    osds.forEach((o) => {
      const h = hosts[o.host];
      const active = walkStep && o.sel;
      drawArrow(ctx, h.x, h.y + 30, o.x, o.y - 30, active ? o.col : C.dim, 1, !active, active ? 3 : 1.5);
    });

    if (walkStep) {
      const pT = ((t - 31) * 0.55) % 1;
      [
        { rk: racks[0], h: hosts[1], o: osds[2], c: C.blue },
        { rk: racks[1], h: hosts[2], o: osds[5], c: C.green },
        { rk: racks[2], h: hosts[4], o: osds[8], c: C.orange }
      ].forEach((branch) => {
        if (pT < 0.33) {
          drawPacket(ctx, rootPos.x, rootPos.y + 32, branch.rk.x, branch.rk.y - 34, pT / 0.33, branch.c);
        } else if (pT < 0.66) {
          drawPacket(ctx, branch.rk.x, branch.rk.y + 34, branch.h.x, branch.h.y - 30, (pT - 0.33) / 0.33, branch.c);
        } else {
          drawPacket(ctx, branch.h.x, branch.h.y + 30, branch.o.x, branch.o.y - 30, (pT - 0.66) / 0.34, branch.c);
        }
      });
    }

    drawCircleNode(ctx, rootPos.x, rootPos.y, 38, C.purpleSoft, C.purple, "root=default", "w: 48.0", 1, true);

    racks.forEach((rk) => {
      drawCircleNode(
        ctx,
        rk.x,
        rk.y,
        36,
        walkStep ? "rgba(25, 38, 56, 0.95)" : C.panel,
        walkStep ? rk.col : C.muted,
        rk.id,
        rk.weight,
        1,
        walkStep
      );
    });

    hosts.forEach((h) => {
      const active = walkStep && h.selected;
      drawCircleNode(
        ctx,
        h.x,
        h.y,
        31,
        active ? "rgba(25, 38, 56, 0.95)" : C.panel,
        active ? h.col : C.dim,
        h.id,
        "w: 8.0",
        1,
        active
      );
    });

    osds.forEach((o) => {
      const active = walkStep && o.sel;
      drawCircleNode(
        ctx,
        o.x,
        o.y,
        29,
        active ? "rgba(25, 38, 56, 0.98)" : C.panel,
        active ? o.col : C.dim,
        o.id,
        active ? o.role : "4TB",
        1,
        active
      );
    });

    ctx.restore();
  }

  // ============================================================================
  // SCENE 7: Pools & Placement Groups (PGs)
  // ============================================================================
  function renderScene7(ctx, t) {
    const a1 = appear(t, 0.3, 1.2);
    ctx.save();
    ctx.globalAlpha = a1;

    roundRect(ctx, 75, 130, 390, 530, 14, "rgba(14, 22, 34, 0.92)", C.blue, 2);
    ctx.fillStyle = C.white;
    ctx.font = "700 20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1. Logical Pool: cephfs_data", 270, 170);
    ctx.fillStyle = C.blue;
    ctx.font = "14px 'SFMono-Regular', monospace";
    ctx.fillText("Pool ID = 3  |  Millions of 4MB Objects", 270, 198);

    const sampleObjects = [
      { oid: "100001a.00000000", pg: 1, col: C.yellow },
      { oid: "100001a.00000001", pg: 0, col: C.blue },
      { oid: "100001a.00000002", pg: 2, col: C.green },
      { oid: "100001b.00000000", pg: 1, col: C.yellow },
      { oid: "100004f.00000009", pg: 3, col: C.purple },
      { oid: "100008c.00000004", pg: 1, col: C.yellow }
    ];

    sampleObjects.forEach((ob, idx) => {
      const oy = 235 + idx * 66;
      const highlight = idx === 0 || idx === 3 || idx === 5;
      roundRect(
        ctx,
        105,
        oy,
        330,
        50,
        8,
        highlight ? "rgba(244, 208, 63, 0.12)" : "#0b111a",
        ob.col,
        highlight ? 2.2 : 1.3
      );
      ctx.fillStyle = C.white;
      ctx.font = "600 14px 'SFMono-Regular', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`OID: ${ob.oid}`, 122, oy + 30);
    });
    ctx.restore();

    const pgAlpha = appear(t, 18.5, 1.4);
    if (pgAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = pgAlpha;

      roundRect(ctx, 595, 130, 410, 530, 14, "rgba(14, 22, 34, 0.92)", C.yellow, 2);
      ctx.fillStyle = C.white;
      ctx.font = "700 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("2. Placement Groups (PGs)", 800, 170);
      ctx.fillStyle = C.yellow;
      ctx.font = "14px 'SFMono-Regular', monospace";
      ctx.fillText("pg_id = hash(OID) % pg_num (128)", 800, 198);

      const pgs = [
        { id: "PG 3.12", count: "~8,400 objs", col: C.blue, y: 265 },
        { id: "PG 3.a7", count: "~8,420 objs (Selected)", col: C.yellow, y: 375, hot: true },
        { id: "PG 3.c4", count: "~8,390 objs", col: C.green, y: 485 },
        { id: "PG 3.f9", count: "~8,410 objs", col: C.purple, y: 595 }
      ];

      pgs.forEach((pg) => {
        roundRect(
          ctx,
          635,
          pg.y - 36,
          330,
          72,
          10,
          pg.hot ? C.yellowSoft : "#0b111a",
          pg.col,
          pg.hot ? 2.8 : 1.6
        );
        ctx.fillStyle = pg.col;
        ctx.font = "700 17px 'SFMono-Regular', monospace";
        ctx.textAlign = "left";
        ctx.fillText(pg.id, 658, pg.y - 4);
        ctx.fillStyle = C.white;
        ctx.font = "13.5px 'SFMono-Regular', monospace";
        ctx.fillText(pg.count, 658, pg.y + 20);
      });

      sampleObjects.forEach((ob, idx) => {
        const oy = 260 + idx * 66;
        const targetPg = pgs[ob.pg];
        drawArrow(ctx, 435, oy, 632, targetPg.y, ob.col, pgAlpha, idx !== 0 && idx !== 3, idx === 0 ? 2.5 : 1.5);
      });
      const hFlow = ((t - 19) * 0.65) % 1;
      drawPacket(ctx, 435, 260, 632, pgs[1].y, hFlow, C.yellow, "hash()");

      ctx.restore();
    }

    const crushAlpha = appear(t, 29, 1.4);
    if (crushAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = crushAlpha;

      roundRect(ctx, 1135, 130, 390, 530, 14, "rgba(14, 22, 34, 0.92)", C.green, 2);
      ctx.fillStyle = C.white;
      ctx.font = "700 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("3. Acting Set of OSDs", 1330, 170);
      ctx.fillStyle = C.green;
      ctx.font = "14px 'SFMono-Regular', monospace";
      ctx.fillText("CRUSH(PG 3.a7) → [OSD.2, OSD.7, OSD.10]", 1330, 198);

      const targets = [
        { id: "OSD.2", sub: "Primary (Rack A)", y: 290, col: C.blue },
        { id: "OSD.7", sub: "Replica (Rack B)", y: 425, col: C.green },
        { id: "OSD.10", sub: "Replica (Rack C)", y: 560, col: C.orange }
      ];

      targets.forEach((tg) => {
        drawCircleNode(ctx, 1330, tg.y, 48, C.panel, tg.col, tg.id, tg.sub, 1, true);
        drawArrow(ctx, 965, 375, 1280, tg.y, tg.col, crushAlpha, false, 2.5, tg.id === "OSD.2" ? "CRUSH" : "");
        const pT = ((t - 29) * 0.6) % 1;
        drawPacket(ctx, 965, 375, 1280, tg.y, pT, tg.col, "PG 3.a7");
      });

      ctx.restore();
    }
  }

  // ============================================================================
  // SCENE 8: How Clients Access Data Directly from OSDs (Metadata via MDS)
  // ============================================================================
  function renderScene8(ctx, t) {
    const baseAlpha = appear(t, 0.2, 1.0);
    ctx.save();
    ctx.globalAlpha = baseAlpha;

    const client = { x: 230, y: 395 };
    roundRect(ctx, 75, 275, 310, 240, 14, "rgba(25, 20, 42, 0.92)", C.purple, 2.5);
    ctx.fillStyle = C.white;
    ctx.font = "700 22px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CephFS Client", client.x, 318);
    ctx.fillStyle = C.purple;
    ctx.font = "600 14.5px 'SFMono-Regular', monospace";
    ctx.fillText("open('/dataset/train.bin')", client.x, 348);

    const crushInClient = appear(t, 19, 1.2);
    roundRect(
      ctx,
      100,
      375,
      260,
      115,
      10,
      crushInClient > 0.2 ? "rgba(244, 208, 63, 0.14)" : "#0b1018",
      crushInClient > 0.2 ? C.yellow : C.dim,
      1.8
    );
    ctx.fillStyle = crushInClient > 0.2 ? C.yellow : C.muted;
    ctx.font = "700 14px 'SFMono-Regular', monospace";
    ctx.fillText("Client-Side CRUSH Engine", client.x, 405);
    ctx.fillStyle = C.white;
    ctx.font = "12.5px 'SFMono-Regular', monospace";
    ctx.fillText("100001a.00000000 → OSD.2", client.x, 434);
    ctx.fillText("100001a.00000001 → OSD.5", client.x, 456);
    ctx.fillText("100001a.00000002 → OSD.8", client.x, 478);

    const monPos = { x: 720, y: 175 };
    drawCircleNode(ctx, monPos.x, monPos.y, 50, C.yellowSoft, C.yellow, "MON Quorum", "Cluster Map e105", 1, t < 9);
    const step1A = appear(t, 0.5, 1.2);
    drawArrow(
      ctx,
      monPos.x - 52,
      monPos.y + 15,
      385,
      305,
      C.yellow,
      step1A,
      true,
      2.2,
      "1. Fetch Cluster Map"
    );
    if (t < 9) {
      drawPacket(ctx, monPos.x - 52, monPos.y + 15, 385, 305, (t % 2.5) / 2.5, C.yellow, "Map e105");
    }

    const mdsPos = { x: 720, y: 585 };
    drawCircleNode(ctx, mdsPos.x, mdsPos.y, 54, C.greenSoft, C.green, "ceph-mds", "Inode + Caps", 1, t >= 9 && t < 19);
    const step2A = appear(t, 9, 1.2);
    if (step2A > 0.01) {
      drawArrow(
        ctx,
        385,
        475,
        mdsPos.x - 56,
        mdsPos.y - 12,
        C.green,
        step2A,
        true,
        2.5,
        "2. Path → Inode 100001a + Caps"
      );
      if (t >= 9 && t < 20) {
        const sub = ((t - 9) % 2.5) / 2.5;
        drawPacket(ctx, mdsPos.x - 56, mdsPos.y - 12, 385, 475, sub, C.green, "Cap+Inode");
      }
    }

    const osdColX = 1320;
    const osdTargets = [
      { id: "OSD.2", stripe: "Obj .00000000 (0–4 MB)", y: 205, col: C.blue },
      { id: "OSD.5", stripe: "Obj .00000001 (4–8 MB)", y: 395, col: C.teal },
      { id: "OSD.8", stripe: "Obj .00000002 (8–12 MB)", y: 585, col: C.orange }
    ];

    roundRect(ctx, 1110, 115, 415, 555, 16, "rgba(14, 22, 34, 0.9)", C.blue, 2);
    ctx.fillStyle = C.white;
    ctx.font = "700 20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Direct Parallel OSD Data Path", 1317, 150);

    const step4A = appear(t, 28.5, 1.4);
    osdTargets.forEach((ot, i) => {
      drawCircleNode(ctx, osdColX, ot.y, 48, C.panel, ot.col, ot.id, "Primary OSD", 1, step4A > 0.5);
      ctx.fillStyle = ot.col;
      ctx.font = "600 13px 'SFMono-Regular', monospace";
      ctx.textAlign = "center";
      ctx.fillText(ot.stripe, osdColX, ot.y + 66);

      if (step4A > 0.01) {
        drawArrow(
          ctx,
          385,
          365 + i * 32,
          osdColX - 52,
          ot.y,
          ot.col,
          step4A,
          false,
          3.2,
          `4. Direct 4MB Stripe #${i}`
        );
        const streamT = ((t - 28.5 + i * 0.33) * 0.85) % 1;
        drawPacket(ctx, 385, 365 + i * 32, osdColX - 52, ot.y, streamT, ot.col, "4MB Data");
      }
    });

    if (step4A > 0.5) {
      ctx.font = "600 14px 'SFMono-Regular', monospace";
      ctx.fillStyle = C.red;
      ctx.textAlign = "center";
      ctx.fillText("✗ Zero File Payload Through MON or MDS", 720, 662);
    }

    ctx.restore();
  }

  const SCENE_RENDERERS = [
    renderScene1,
    renderScene2,
    renderScene3,
    renderScene4,
    renderScene5,
    renderScene6,
    renderScene7,
    renderScene8
  ];

  function renderFrame() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    const scale = Math.min(W / 1600, H / 900);
    const offsetX = (W - 1600 * scale) / 2;
    const offsetY = (H - 900 * scale) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    drawGrid(ctx);

    const { scene, localTime } = getActiveSceneAndLocalTime(state.globalTime);
    drawSceneHeader(ctx, scene, localTime);

    const renderer = SCENE_RENDERERS[scene.index];
    if (renderer) {
      renderer(ctx, localTime);
    }

    ctx.restore();
  }

  function updateUI() {
    const { scene, localTime } = getActiveSceneAndLocalTime(state.globalTime);

    const pills = sceneNav.querySelectorAll(".scene-pill");
    pills.forEach((p, idx) => {
      p.classList.toggle("active", idx === scene.index);
    });

    const { seg: activeSeg, segIdx: activeSegIdx } = getActiveSegment(scene, localTime);

    captionTitle.textContent = scene.title;
    captionBadge.textContent = `${activeSeg.stepLabel}  •  Step ${activeSegIdx + 1}/${scene.segments.length}`;
    captionText.textContent = activeSeg.text;

    if (state.playing) {
      triggerNarrationForSegment(scene, activeSeg, activeSegIdx);
    }

    const pct = clamp((state.globalTime / TOTAL_DURATION) * 100, 0, 100);
    scrubberFill.style.width = `${pct}%`;
    scrubberThumb.style.left = `${pct}%`;
    timeReadout.textContent = `${formatTime(state.globalTime)} / ${formatTime(TOTAL_DURATION)}`;

    playBtn.textContent = state.playing ? "⏸ Pause" : "▶ Play";
  }

  // Main Animation Loop (holds step boundary briefly if ElevenLabs sentence is still finishing)
  function tick(now) {
    const dt = Math.min(0.1, (now - state.lastFrameTs) / 1000);
    state.lastFrameTs = now;

    if (state.playing) {
      const { scene, localTime } = getActiveSceneAndLocalTime(state.globalTime);
      const { seg } = getActiveSegment(scene, localTime);
      const nextGlobalTime = state.globalTime + dt * state.speed;
      const segEndGlobal = scene.globalStart + seg.end;

      // If ElevenLabs audio is still actively speaking or loading for this segment, don't advance past segment end yet
      const audioStillSpeaking =
        state.voiceEnabled &&
        (state.audioBusyLoadingKey === seg.key ||
          (state.audioPlayingForKey === seg.key && !state.audioEl.paused && !state.audioEl.ended));

      if (audioStillSpeaking && nextGlobalTime >= segEndGlobal - 0.08) {
        state.globalTime = Math.min(state.globalTime, segEndGlobal - 0.08);
      } else {
        state.globalTime = nextGlobalTime;
      }

      if (state.globalTime >= TOTAL_DURATION) {
        state.globalTime = TOTAL_DURATION;
        state.playing = false;
        stopNarrationAudio();
      }
      updateUI();
    }

    renderFrame();
    requestAnimationFrame(tick);
  }

  // Interactive Event Listeners
  playBtn.addEventListener("click", () => {
    if (state.globalTime >= TOTAL_DURATION) {
      state.globalTime = 0;
    }
    state.playing = !state.playing;
    if (!state.playing) {
      stopNarrationAudio();
      setStatus("Paused", C.muted);
    } else {
      state.activeSegmentKey = "";
    }
    updateUI();
  });

  prevBtn.addEventListener("click", () => {
    const { scene, localTime } = getActiveSceneAndLocalTime(state.globalTime);
    if (localTime > 3 && scene.index >= 0) {
      jumpToGlobalTime(scene.globalStart);
    } else {
      const prevIdx = Math.max(0, scene.index - 1);
      jumpToGlobalTime(SCENES[prevIdx].globalStart);
    }
  });

  nextBtn.addEventListener("click", () => {
    const { scene } = getActiveSceneAndLocalTime(state.globalTime);
    const nextIdx = Math.min(SCENES.length - 1, scene.index + 1);
    jumpToGlobalTime(SCENES[nextIdx].globalStart);
  });

  voiceBtn.addEventListener("click", () => {
    state.voiceEnabled = !state.voiceEnabled;
    voiceBtn.classList.toggle("active-toggle", state.voiceEnabled);
    voiceBtn.textContent = state.voiceEnabled ? "🔊 ElevenLabs: ON" : "🔇 ElevenLabs: OFF";
    if (!state.voiceEnabled) {
      stopNarrationAudio();
      setStatus("Voiceover Muted", C.muted);
    } else {
      state.activeSegmentKey = "";
      updateUI();
    }
  });

  if (voiceSelect) {
    voiceSelect.addEventListener("change", (e) => {
      state.voiceId = e.target.value;
      localStorage.setItem("ceph_el_voice", state.voiceId);
      state.activeSegmentKey = "";
      updateUI();
    });
  }

  speedSelect.addEventListener("change", (e) => {
    state.speed = parseFloat(e.target.value) || 1.0;
    state.audioEl.playbackRate = state.speed;
  });

  if (saveKeyBtn && apiKeyInput) {
    saveKeyBtn.addEventListener("click", () => {
      state.apiKey = apiKeyInput.value.trim();
      localStorage.setItem("ceph_el_key", state.apiKey);
      state.activeSegmentKey = "";
      setStatus("API Key Saved", C.green);
      updateUI();
    });
  }

  if (precacheBtn) {
    precacheBtn.addEventListener("click", async () => {
      precacheBtn.disabled = true;
      for (let i = 0; i < ALL_SEGMENTS.length; i++) {
        const s = ALL_SEGMENTS[i];
        precacheProgress.textContent = `Caching ${i + 1} / ${ALL_SEGMENTS.length} (${s.key})...`;
        try {
          await fetchSegmentAudioBlob(s);
        } catch (err) {
          precacheProgress.textContent = `Error on ${s.key}: ${err.message}`;
          precacheBtn.disabled = false;
          return;
        }
      }
      precacheProgress.textContent = `✓ All ${ALL_SEGMENTS.length} segments cached in browser & server!`;
      precacheBtn.disabled = false;
    });
  }

  // Scrubber drag / click
  let isDraggingScrubber = false;
  function scrubFromEvent(e) {
    const rect = scrubberTrack.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    jumpToGlobalTime(ratio * TOTAL_DURATION);
  }

  scrubberTrack.addEventListener("mousedown", (e) => {
    isDraggingScrubber = true;
    scrubFromEvent(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (isDraggingScrubber) scrubFromEvent(e);
  });
  window.addEventListener("mouseup", () => {
    isDraggingScrubber = false;
  });

  voGuideBtn.addEventListener("click", () => {
    voModal.classList.remove("hidden");
  });
  voCloseBtn.addEventListener("click", () => {
    voModal.classList.add("hidden");
  });
  voModal.addEventListener("click", (e) => {
    if (e.target === voModal) voModal.classList.add("hidden");
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.code === "Space") {
      e.preventDefault();
      playBtn.click();
    } else if (e.code === "ArrowRight") {
      jumpToGlobalTime(state.globalTime + 5);
    } else if (e.code === "ArrowLeft") {
      jumpToGlobalTime(state.globalTime - 5);
    } else if (e.key >= "1" && e.key <= "8") {
      const idx = parseInt(e.key, 10) - 1;
      if (SCENES[idx]) jumpToGlobalTime(SCENES[idx].globalStart);
    }
  });

  initUI();
  updateUI();
  requestAnimationFrame(tick);
})();
