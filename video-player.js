(function () {
  const SCENES = window.COURSE_SCENES || [];
  const FPS = window.COURSE_FPS || 30;

  const MC_CODE_SNIPPETS = {
    1: `// motion-canvas/src/scenes/scene1_what_is_ceph.tsx
export default makeScene2D(function* (view) {
  // Step 1.1: Reveal legacy SAN/NAS silos & animate saturation to 99% FULL
  yield* all(siloGroup().opacity(1, 0.9, easeOutBack), siloFill(0.99, 6.5, easeInOutCubic));
  // Step 1.2: Camera zoom into 12-OSD Unified RADOS Torus Ring
  yield* all(ringGroup().opacity(1, 1.1), camera().zoom(1.06, 1.5), tween(11, v => ringRotation(v * 180)));
  // Steps 1.3 - 1.5: Transition to Unified Protocol Stack (RGW, RBD, CephFS)
  yield* all(ringGroup().scale(0.45, 1.0), stackGroup().opacity(1, 1.0, easeOutBack));
});`,
    2: `// motion-canvas/src/scenes/scene2_rados.tsx
export default makeScene2D(function* (view) {
  // Step 2.1 - 2.2: 16 MB File Laser Slicer -> 4x 4 MB Objects
  yield* all(laserX(680, 5.5, easeInOutCubic), splitGap(28, 4.0, easeOutBack));
  // Step 2.3 - 2.4: Explode 3-Layer Object Blueprint & Primary->Replica Write Pipeline
  yield* all(camera().zoom(1.08, 1.2), blueprintOpacity(1, 1.0, easeOutBack));
  // Step 2.5: Deep Scrubbing Laser catches 0xDEAD bit-rot & heals from Primary OSD.4
  yield* chain(scrubBeamY(220, 4.5, easeInOutCubic), healed(1, 1.2, easeOutBack));
});`,
    3: `// motion-canvas/src/scenes/scene3_osds.tsx
export default makeScene2D(function* (view) {
  // Step 3.1 - 3.2: OSD Hardware Anatomy & Legacy FileStore Double-Write Penalty (2.0x I/O)
  yield* filestoreLatency(2.0, 9.0, easeInOutCubic);
  // Step 3.3 - 3.5: BlueStore Direct Raw Block I/O (0.9x) + RocksDB/BlueFS WAL
  yield* all(bluestoreReveal(1, 1.2, easeOutBack), bluestoreLatency(0.9, 8.0, easeInOutCubic));
});`,
    4: `// motion-canvas/src/scenes/scene4_monitors.tsx
export default makeScene2D(function* (view) {
  // Step 4.1 - 4.2: 3-Monitor Paxos Quorum Ring & Mechanical Odometer e104 -> e105
  yield* epochDigit(105, 4.5, easeInOutCubic);
  // Step 4.3 - 4.5: Split-Brain Partition Cut (2/3 Quorum) & Incremental Delta Gossip (Δ e105)
  yield* chain(partitionCut(1, 3.0, easeOutBack), deltaWave(1, 6.0, easeInOutCubic));
});`,
    5: `// motion-canvas/src/scenes/scene5_mds.tsx
export default makeScene2D(function* (view) {
  // Step 5.1 - 5.3: POSIX Inode Tree & Capability Tokens (Fc, Fw, Fb)
  yield* mds0Load(0.94, 12.0, easeInOutCubic);
  // Step 5.4 - 5.5: Dynamic Subtree Partitioning (mds.0 migrates /project/build to mds.1)
  yield* all(subtreeShift(1, 3.5), mds0Load(0.51, 3.5), mds1Load(0.46, 3.5, easeOutBack));
});`,
    6: `// motion-canvas/src/scenes/scene6_crush.tsx
export default makeScene2D(function* (view) {
  // Step 6.1 - 6.4: Deterministic CRUSH Tree Walk (root -> rack -> host -> osd [1, 5, 9])
  yield* treeWalkDepth(3, 18.0, easeInOutCubic);
  // Step 6.5: Rack B Power Outage -> Camera Zoom & Epoch e106 Re-route r=2 to osd.8
  yield* all(camera().zoom(1.05, 1.0), rackBOffline(1, 1.0), rerouteArc(1, 3.5, easeInOutCubic));
});`,
    7: `// motion-canvas/src/scenes/scene7_pools_pgs.tsx
export default makeScene2D(function* (view) {
  // Step 7.1 - 7.3: 10,000,000 Objects -> Hash Funnel -> 128 Placement Groups
  yield* funnelProgress(1, 16.0, easeInOutCubic);
  // Step 7.4 - 7.5: Replicated Pool (3x) vs Erasure Coded Pool (k=4, m=2)
  yield* ecReveal(1, 4.0, easeOutBack);
});`,
    8: `// motion-canvas/src/scenes/scene8_direct_path.tsx
export default makeScene2D(function* (view) {
  // Step 8.1 - 8.3: 1.5% MDS Metadata Handshake vs 98.5% Direct Client-to-OSD Striping
  yield* dataStreams(1, 18.0, easeInOutCubic);
  // Step 8.4 - 8.5: 3Blue1Brown O(N) Linear Throughput Scaling Graph (120 GB/s at 1,000 OSDs)
  yield* throughputCurve(1, 12.0, easeOutBack);
});`,
  };

  let playMode = "full"; // "full" | "chapter"
  let activeSceneId = 1;
  let showCode = false;

  const videoEl = document.getElementById("course-video");
  const chapterListEl = document.getElementById("chapter-list");
  const stepsRowEl = document.getElementById("steps-row");
  const statusLabelEl = document.getElementById("status-label");
  const dlSceneBtn = document.getElementById("dl-scene-btn");
  const modeFullBtn = document.getElementById("mode-full-btn");
  const modeChapterBtn = document.getElementById("mode-chapter-btn");
  const codeToggleBtn = document.getElementById("toggle-code-btn");
  const codeDrawerEl = document.getElementById("code-drawer");
  const codeContentEl = document.getElementById("code-content");

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m + ":" + String(rem).padStart(2, "0");
  }

  function getSceneById(id) {
    return SCENES.find((s) => s.id === id) || SCENES[0];
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function renderSidebar() {
    chapterListEl.innerHTML = "";
    SCENES.forEach((sc) => {
      const startSec = sc.fromFrame / FPS;
      const durSec = sc.durationInFrames / FPS;
      const btn = document.createElement("button");
      btn.className = "chapter-card" + (sc.id === activeSceneId ? " active" : "");
      btn.innerHTML =
        '<div class="chapter-top">' +
        "<span>" + sc.id + ". " + sc.shortTitle + "</span>" +
        '<span class="chapter-time">' + fmtTime(startSec) + " (" + Math.round(durSec) + "s)</span>" +
        "</div>" +
        '<div class="chapter-formula">' + sc.formula + "</div>";
      btn.addEventListener("click", () => selectScene(sc.id, true));
      chapterListEl.appendChild(btn);
    });
  }

  function renderSteps(scene, activeStepIdx) {
    stepsRowEl.innerHTML = "";
    scene.segments.forEach((seg, idx) => {
      const pill = document.createElement("button");
      pill.className = "step-pill" + (idx === activeStepIdx ? " active" : "");
      pill.textContent = seg.stepIndex + 1 + ". " + seg.stepLabel;
      pill.addEventListener("click", () => {
        if (playMode === "full") {
          videoEl.currentTime = seg.fromFrameGlobal / FPS + 0.05;
        } else {
          videoEl.currentTime = seg.fromFrameInScene / FPS + 0.05;
        }
        videoEl.play().catch(() => {});
      });
      stepsRowEl.appendChild(pill);
    });
  }

  function updateCodeInspector() {
    codeContentEl.textContent = MC_CODE_SNIPPETS[activeSceneId] || "";
    const sc = getSceneById(activeSceneId);
    dlSceneBtn.href = "videos/scene-" + pad2(sc.id) + ".mp4";
    dlSceneBtn.textContent = "⬇ Scene " + sc.id + " MP4";
  }

  function selectScene(sceneId, autoPlay) {
    activeSceneId = sceneId;
    const sc = getSceneById(sceneId);
    if (playMode === "full") {
      const targetTime = sc.fromFrame / FPS + 0.05;
      if (Math.abs(videoEl.currentTime - targetTime) > 0.5) {
        videoEl.currentTime = targetTime;
      }
    } else {
      const targetSrc = "videos/scene-" + pad2(sceneId) + ".mp4";
      if (!videoEl.getAttribute("src").includes(targetSrc)) {
        videoEl.src = targetSrc;
        videoEl.currentTime = 0;
      }
    }
    renderSidebar();
    renderSteps(sc, 0);
    updateCodeInspector();
    if (autoPlay) {
      videoEl.play().catch(() => {});
    }
  }

  function setPlayMode(mode) {
    playMode = mode;
    modeFullBtn.classList.toggle("active", mode === "full");
    modeChapterBtn.classList.toggle("active", mode === "chapter");

    const sc = getSceneById(activeSceneId);
    if (mode === "full") {
      videoEl.src = "videos/ceph-course-full.mp4";
      videoEl.currentTime = sc.fromFrame / FPS;
    } else {
      videoEl.src = "videos/scene-" + pad2(sc.id) + ".mp4";
      videoEl.currentTime = 0;
    }
    renderSidebar();
    renderSteps(sc, 0);
    updateCodeInspector();
  }

  videoEl.addEventListener("timeupdate", () => {
    const t = videoEl.currentTime;
    if (playMode === "full") {
      const globalFrame = Math.floor(t * FPS);
      const sc =
        SCENES.find((s) => globalFrame >= s.fromFrame && globalFrame < s.toFrame) ||
        SCENES[SCENES.length - 1];
      if (sc && sc.id !== activeSceneId) {
        activeSceneId = sc.id;
        renderSidebar();
        updateCodeInspector();
      }
      if (sc) {
        const localFrame = Math.max(0, globalFrame - sc.fromFrame);
        const segIdx = Math.max(
          0,
          sc.segments.findIndex(
            (seg) => localFrame >= seg.fromFrameInScene && localFrame < seg.toFrameInScene
          )
        );
        renderSteps(sc, segIdx);
        statusLabelEl.textContent =
          "Playing: ceph-course-full.mp4  •  " +
          sc.title +
          "  •  " +
          fmtTime(t) +
          " / 7:11";
      }
    } else {
      const sc = getSceneById(activeSceneId);
      const localFrame = Math.floor(t * FPS);
      const segIdx = Math.max(
        0,
        sc.segments.findIndex(
          (seg) => localFrame >= seg.fromFrameInScene && localFrame < seg.toFrameInScene
        )
      );
      renderSteps(sc, segIdx);
      statusLabelEl.textContent =
        "Playing: scene-" +
        pad2(sc.id) +
        ".mp4  •  " +
        sc.title +
        "  •  " +
        fmtTime(t) +
        " / " +
        fmtTime(sc.durationInFrames / FPS);
    }
  });

  videoEl.addEventListener("ended", () => {
    if (playMode === "chapter" && activeSceneId < SCENES.length) {
      selectScene(activeSceneId + 1, true);
    }
  });

  modeFullBtn.addEventListener("click", () => setPlayMode("full"));
  modeChapterBtn.addEventListener("click", () => setPlayMode("chapter"));

  codeToggleBtn.addEventListener("click", () => {
    showCode = !showCode;
    codeDrawerEl.classList.toggle("open", showCode);
    codeToggleBtn.classList.toggle("active", showCode);
  });

  document.querySelectorAll("[data-speed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const spd = parseFloat(btn.getAttribute("data-speed"));
      videoEl.playbackRate = spd;
      document.querySelectorAll("[data-speed]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
    } else if (e.key === "f" || e.key === "F") {
      if (videoEl.requestFullscreen) videoEl.requestFullscreen();
    }
  });

  // Initialize
  renderSidebar();
  renderSteps(SCENES[0], 0);
  updateCodeInspector();
})();
