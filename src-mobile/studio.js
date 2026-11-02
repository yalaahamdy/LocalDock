/* LocalDock Mobile — Standalone Offline Pro Media & Document Studio */
"use strict";

(function () {
  const studioItems = []; // { id, file, url, name, size, ext, cat }
  let activeFilter = "all";
  let searchQuery = "";
  let currentIdx = -1;

  // Player state
  let hudTimer = null;
  let audioCtx = null;
  let audioAnimId = 0;

  function getExt(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i).toLowerCase() : "";
  }

  function classifyFile(file) {
    const ext = getExt(file.name);
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif", ".heic"].includes(ext)) return "image";
    if ([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".3gp", ".ogv"].includes(ext)) return "video";
    if ([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".opus"].includes(ext)) return "audio";
    if (ext === ".pdf") return "pdf";
    if ([".docx", ".doc", ".rtf", ".odt"].includes(ext)) return "docx";
    if ([".csv", ".tsv"].includes(ext)) return "csv";
    return "text";
  }

  function fmtSize(bytes) {
    if (!bytes) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
  }

  function fmtTime(sec) {
    if (!sec || Number.isNaN(sec) || !Number.isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function decodeBufSmart(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buf);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      try {
        return new TextDecoder("windows-1256").decode(buf);
      } catch {
        return new TextDecoder("utf-8").decode(buf);
      }
    }
  }

  function showStudioHud(msg) {
    const el = document.getElementById("spHud");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => el.classList.add("hidden"), 1150);
  }

  function filteredList() {
    return studioItems.filter((it) => {
      if (activeFilter === "video" && it.cat !== "video") return false;
      if (activeFilter === "audio" && it.cat !== "audio") return false;
      if (activeFilter === "image" && it.cat !== "image") return false;
      if (activeFilter === "doc" && !["pdf", "docx", "csv", "text"].includes(it.cat)) return false;
      if (searchQuery && !it.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }

  function renderStudioList() {
    const body = document.getElementById("studioBody");
    if (!body) return;
    const list = filteredList();

    if (studioItems.length === 0) {
      body.innerHTML = `
        <div class="studio-empty">
          <div class="studio-empty-icons">
            <span>🎬</span><span>🎵</span><span>🖼️</span><span>📄</span>
          </div>
          <h3 style="margin:0 0 6px;font-size:16px;">استوديو ومشغل ملفات الهاتف الاحترافي</h3>
          <p style="margin:0 0 18px;font-size:12px;color:#94a3b8;max-width:340px;line-height:1.5;">
            شغّل الفيديوهات (مع الترجمة وإيماءات السطوع والصوت وقفل اللمس)، الصوتيات (مع المحلل الطيفي)، الصور (مع الفلاتر والعرض التلقائي)، وملفات PDF و Word (.docx) والجداول والنصوص مع القراءة الصوتية!
          </p>
          <button type="button" id="emptyPickBtn" class="btn primary" style="padding:10px 22px;border-radius:14px;">
            ＋ اختيار ملفات من الهاتف للتشغيل فوراً
          </button>
        </div>
      `;
      document.getElementById("emptyPickBtn")?.addEventListener("click", () => {
        document.getElementById("studioFileInput")?.click();
      });
      return;
    }

    const grid = document.createElement("div");
    grid.className = "studio-grid";
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "studio-item";
      const iconMap = {
        video: "🎬",
        audio: "🎵",
        image: "🖼️",
        pdf: "📕",
        docx: "📘",
        csv: "📊",
        text: "📄",
      };
      const thumbHtml =
        item.cat === "image"
          ? `<img src="${item.url}" alt="" />`
          : `<span>${iconMap[item.cat] || "📄"}</span>`;

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          <div class="studio-item-thumb">${thumbHtml}</div>
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" dir="auto">${item.name}</div>
            <div style="font-size:11px;color:#94a3b8;">${fmtSize(item.size)} · ${item.cat.toUpperCase()}</div>
          </div>
        </div>
        <span style="font-size:16px;color:#2dd4bf;">▶</span>
      `;
      card.addEventListener("click", () => {
        const idx = list.findIndex((x) => x.id === item.id);
        openStudioPlayer(idx);
      });
      grid.appendChild(card);
    });
    body.innerHTML = "";
    body.appendChild(grid);
  }

  function addStudioFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const added = arr.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      url: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
      ext: getExt(f.name),
      cat: classifyFile(f),
    }));
    studioItems.unshift(...added);
    renderStudioList();
    openStudioPlayer(0);
  }

  function closeStudioPlayer() {
    cancelAnimationFrame(audioAnimId);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const modal = document.getElementById("studioPlayerModal");
    const stage = document.getElementById("spStage");
    const ctrls = document.getElementById("spControls");
    if (stage) stage.innerHTML = "";
    if (ctrls) ctrls.innerHTML = "";
    modal?.classList.add("hidden");
  }

  function openStudioPlayer(idx) {
    const list = filteredList();
    if (idx < 0 || idx >= list.length) return;
    currentIdx = idx;
    const item = list[idx];

    cancelAnimationFrame(audioAnimId);
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const modal = document.getElementById("studioPlayerModal");
    const titleEl = document.getElementById("spTitle");
    const metaEl = document.getElementById("spMeta");
    const stage = document.getElementById("spStage");
    const ctrls = document.getElementById("spControls");
    if (!modal || !stage || !ctrls) return;

    titleEl.textContent = item.name;
    metaEl.textContent = `${fmtSize(item.size)} · ${idx + 1} / ${list.length}`;
    stage.innerHTML = `<div id="spHud" class="sp-hud hidden"></div>`;
    ctrls.innerHTML = "";
    modal.classList.remove("hidden");

    if (item.cat === "video") mountVideoPlayer(item, stage, ctrls);
    else if (item.cat === "image") mountImageViewer(item, stage, ctrls);
    else if (item.cat === "audio") mountAudioPlayer(item, stage, ctrls, list);
    else if (item.cat === "pdf") mountPdfReader(item, stage, ctrls);
    else mountDocOrTextReader(item, stage, ctrls);
  }

  /* ── 1. PRO VIDEO PLAYER ── */
  function mountVideoPlayer(item, stage, ctrls) {
    const video = document.createElement("video");
    video.src = item.url;
    video.playsInline = true;
    video.autoplay = true;
    video.style.cssText = "width:100%;height:100%;object-fit:contain;transition:transform 0.08s;";
    stage.appendChild(video);

    const subOverlay = document.createElement("div");
    subOverlay.style.cssText = "position:absolute;bottom:24px;left:16px;right:16px;text-align:center;pointer-events:none;z-index:35;";
    stage.appendChild(subOverlay);

    let locked = false;
    let zoom = 1;
    let rot = 0;
    let bright = 1;
    let fitModes = ["contain", "cover", "fill"];
    let fitIdx = 0;
    let cues = [];

    ctrls.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;font-family:monospace;">
        <span id="vCur">00:00</span>
        <input id="vSeek" type="range" min="0" max="100" step="0.1" value="0" style="flex:1;accent-color:#14b8a6;" />
        <span id="vDur">00:00</span>
      </div>
      <div class="sp-pill-row">
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="sp-btn" id="vPlay">⏸</button>
          <button class="sp-btn" id="vRew">-10s</button>
          <button class="sp-btn" id="vFwd">+10s</button>
          <button class="sp-btn" id="vSpeed">1x</button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="sp-btn" id="vLock" title="قفل اللمس">🔒</button>
          <button class="sp-btn" id="vFit" title="أبعاد الشاشة">📐 Fit</button>
          <button class="sp-btn" id="vRot" title="تدوير">🔄</button>
          <button class="sp-btn" id="vSub" title="ترجمة .srt">💬</button>
          <button class="sp-btn" id="vSnap" title="لقطة شاشة">📸</button>
        </div>
      </div>
      <input type="file" id="vSubInput" accept=".srt,.vtt,.txt" class="hidden" />
    `;

    const seekEl = ctrls.querySelector("#vSeek");
    const curEl = ctrls.querySelector("#vCur");
    const durEl = ctrls.querySelector("#vDur");
    const playBtn = ctrls.querySelector("#vPlay");

    const applyTransform = () => {
      video.style.transform = `scale(${zoom}) rotate(${rot}deg)`;
      video.style.filter = `brightness(${bright})`;
    };

    video.addEventListener("loadedmetadata", () => {
      seekEl.max = video.duration || 100;
      durEl.textContent = fmtTime(video.duration);
    });
    video.addEventListener("timeupdate", () => {
      seekEl.value = video.currentTime;
      curEl.textContent = fmtTime(video.currentTime);
      if (cues.length) {
        const c = cues.find((x) => video.currentTime >= x.start && video.currentTime <= x.end);
        subOverlay.innerHTML = c
          ? `<span style="background:rgba(0,0,0,0.78);color:#fff;padding:4px 12px;border-radius:8px;font-size:14px;">${c.text}</span>`
          : "";
      }
    });
    video.addEventListener("play", () => (playBtn.textContent = "⏸"));
    video.addEventListener("pause", () => (playBtn.textContent = "▶"));

    seekEl.addEventListener("input", () => (video.currentTime = parseFloat(seekEl.value)));
    playBtn.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
    ctrls.querySelector("#vRew").addEventListener("click", () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
      showStudioHud("⏪ -10s");
    });
    ctrls.querySelector("#vFwd").addEventListener("click", () => {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      showStudioHud("⏩ +10s");
    });
    ctrls.querySelector("#vSpeed").addEventListener("click", (e) => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      const next = rates[(rates.indexOf(video.playbackRate) + 1) % rates.length] || 1;
      video.playbackRate = next;
      e.currentTarget.textContent = `${next}x`;
      showStudioHud(`⚡ ${next}x`);
    });
    ctrls.querySelector("#vFit").addEventListener("click", (e) => {
      fitIdx = (fitIdx + 1) % fitModes.length;
      video.style.objectFit = fitModes[fitIdx];
      e.currentTarget.textContent = `📐 ${fitModes[fitIdx]}`;
      showStudioHud(`📐 ${fitModes[fitIdx]}`);
    });
    ctrls.querySelector("#vRot").addEventListener("click", () => {
      rot = (rot + 90) % 360;
      applyTransform();
      showStudioHud(`🔄 ${rot}°`);
    });
    ctrls.querySelector("#vLock").addEventListener("click", () => {
      locked = true;
      ctrls.classList.add("hidden");
      showStudioHud("🔒 تم قفل اللمس (انقر مرتين لفتح القفل)");
    });
    ctrls.querySelector("#vSub").addEventListener("click", () => {
      ctrls.querySelector("#vSubInput").click();
    });
    ctrls.querySelector("#vSubInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const txt = decodeBufSmart(buf);
      cues = parseSrtText(txt);
      showStudioHud(`💬 تم تفعيل الترجمة (${cues.length})`);
    });
    ctrls.querySelector("#vSnap").addEventListener("click", () => {
      if (!video.videoWidth) return;
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = c.toDataURL("image/png");
      if (window.LocalDockAndroid?.saveBlob) {
        window.LocalDockAndroid.saveBlob(dataUrl, `snap-${Date.now()}.png`, "image/png");
        showStudioHud("📸 تم حفظ اللقطة في التنزيلات");
      }
    });

    // Touch gestures on stage
    let startX = 0, startY = 0, startVol = 1, startBright = 1, gestureMode = "";
    let lastTap = 0;
    stage.ontouchstart = (e) => {
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 280) {
          if (locked) {
            locked = false;
            ctrls.classList.remove("hidden");
            showStudioHud("🔓 تم إلغاء قفل الشاشة");
          } else {
            const x = e.touches[0].clientX;
            if (x < stage.clientWidth * 0.35) video.currentTime = Math.max(0, video.currentTime - 10);
            else if (x > stage.clientWidth * 0.65) video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            else video.paused ? video.play() : video.pause();
          }
          lastTap = 0;
          return;
        }
        lastTap = now;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startVol = video.volume;
        startBright = bright;
        gestureMode = "";
      }
    };
    stage.ontouchmove = (e) => {
      if (locked || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!gestureMode && Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx)) {
        gestureMode = startX < stage.clientWidth / 2 ? "bright" : "vol";
      }
      if (gestureMode === "bright") {
        bright = Math.max(0.3, Math.min(1.6, startBright - dy / 220));
        applyTransform();
        showStudioHud(`☀️ السطوع: ${Math.round(bright * 100)}%`);
      } else if (gestureMode === "vol") {
        video.volume = Math.max(0, Math.min(1, startVol - dy / 220));
        showStudioHud(`🔊 الصوت: ${Math.round(video.volume * 100)}%`);
      }
    };
  }

  /* ── 2. PRO IMAGE VIEWER ── */
  function mountImageViewer(item, stage, ctrls) {
    const img = document.createElement("img");
    img.src = item.url;
    img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;transition:transform 0.1s;";
    stage.appendChild(img);

    let zoom = 1, rot = 0, flipH = 1, gray = false, sepia = false;
    const apply = () => {
      img.style.transform = `scale(${zoom}) rotate(${rot}deg) scaleX(${flipH})`;
      img.style.filter = `${gray ? "grayscale(100%)" : ""} ${sepia ? "sepia(80%)" : ""}`;
    };

    ctrls.innerHTML = `
      <div class="sp-pill-row">
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="sp-btn" id="iOut">－</button>
          <button class="sp-btn" id="iReset">100%</button>
          <button class="sp-btn" id="iIn">＋</button>
          <button class="sp-btn" id="iRot">🔄 90°</button>
          <button class="sp-btn" id="iFlip">↔ قلب</button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="sp-btn" id="iGray">B&W</button>
          <button class="sp-btn" id="iSepia">Sepia</button>
        </div>
      </div>
    `;
    ctrls.querySelector("#iOut").onclick = () => { zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2)); apply(); };
    ctrls.querySelector("#iReset").onclick = () => { zoom = 1; rot = 0; flipH = 1; apply(); };
    ctrls.querySelector("#iIn").onclick = () => { zoom = Math.min(6, +(zoom + 0.25).toFixed(2)); apply(); };
    ctrls.querySelector("#iRot").onclick = () => { rot = (rot + 90) % 360; apply(); };
    ctrls.querySelector("#iFlip").onclick = () => { flipH *= -1; apply(); };
    ctrls.querySelector("#iGray").onclick = () => { gray = !gray; apply(); };
    ctrls.querySelector("#iSepia").onclick = () => { sepia = !sepia; apply(); };
  }

  /* ── 3. PRO AUDIO STUDIO ── */
  function mountAudioPlayer(item, stage, ctrls, list) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;width:100%;";
    wrap.innerHTML = `
      <canvas id="aVis" width="360" height="130" style="width:100%;max-width:400px;height:130px;background:rgba(255,255,255,0.03);border-radius:18px;border:1px solid rgba(255,255,255,0.1);"></canvas>
      <div style="font-size:15px;font-weight:700;text-align:center;" dir="auto">${item.name}</div>
    `;
    stage.appendChild(wrap);

    const audio = document.createElement("audio");
    audio.src = item.url;
    audio.autoplay = true;
    stage.appendChild(audio);

    const canvas = wrap.querySelector("#aVis");
    const ctx = canvas.getContext("2d");
    let phase = 0;
    function drawVis() {
      audioAnimId = requestAnimationFrame(drawVis);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!audio.paused) phase += 0.1;
      const bars = 28;
      const bw = (canvas.width - (bars - 1) * 4) / bars;
      for (let i = 0; i < bars; i++) {
        const h = audio.paused ? 8 : Math.max(10, 45 + 38 * Math.sin(phase + i * 0.35));
        ctx.fillStyle = "#2dd4bf";
        ctx.fillRect(i * (bw + 4), canvas.height - h, bw, h);
      }
    }
    drawVis();

    ctrls.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;font-family:monospace;">
        <span id="aCur">00:00</span>
        <input id="aSeek" type="range" min="0" max="100" step="0.1" value="0" style="flex:1;accent-color:#14b8a6;" />
        <span id="aDur">00:00</span>
      </div>
      <div class="sp-pill-row">
        <button class="sp-btn" id="aPrev">⏮</button>
        <button class="sp-btn" id="aPlay">⏸</button>
        <button class="sp-btn" id="aNext">⏭</button>
        <button class="sp-btn" id="aSpeed">1x</button>
      </div>
    `;
    const seekEl = ctrls.querySelector("#aSeek");
    audio.onloadedmetadata = () => {
      seekEl.max = audio.duration || 100;
      ctrls.querySelector("#aDur").textContent = fmtTime(audio.duration);
    };
    audio.ontimeupdate = () => {
      seekEl.value = audio.currentTime;
      ctrls.querySelector("#aCur").textContent = fmtTime(audio.currentTime);
    };
    audio.onended = () => {
      if (currentIdx + 1 < list.length) openStudioPlayer(currentIdx + 1);
    };
    seekEl.oninput = () => (audio.currentTime = parseFloat(seekEl.value));
    ctrls.querySelector("#aPlay").onclick = (e) => {
      if (audio.paused) { audio.play(); e.currentTarget.textContent = "⏸"; }
      else { audio.pause(); e.currentTarget.textContent = "▶"; }
    };
    ctrls.querySelector("#aPrev").onclick = () => { if (currentIdx > 0) openStudioPlayer(currentIdx - 1); };
    ctrls.querySelector("#aNext").onclick = () => { if (currentIdx + 1 < list.length) openStudioPlayer(currentIdx + 1); };
    ctrls.querySelector("#aSpeed").onclick = (e) => {
      const rates = [0.75, 1, 1.25, 1.5, 2];
      const next = rates[(rates.indexOf(audio.playbackRate) + 1) % rates.length] || 1;
      audio.playbackRate = next;
      e.currentTarget.textContent = `${next}x`;
    };
  }

  /* ── 4. PRO PDF READER (Canvas Offline) ── */
  async function mountPdfReader(item, stage, ctrls) {
    const wrap = document.createElement("div");
    wrap.className = "sp-doc-wrap theme-dark";
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;";
    wrap.innerHTML = `<p style="margin-top:40px;color:#94a3b8;">جارٍ فتح صفحات PDF بدقة عالية…</p>`;
    stage.appendChild(wrap);

    let scale = 1.2, night = false;
    ctrls.innerHTML = `
      <div class="sp-pill-row">
        <div style="display:flex;gap:6px;">
          <button class="sp-btn" id="pOut">－ تصغير</button>
          <button class="sp-btn" id="pIn">＋ تكبير</button>
        </div>
        <button class="sp-btn" id="pNight">🌙 وضع ليلي للـ PDF</button>
      </div>
    `;

    try {
      const pdfjs = await import("./pdfjs/pdf.min.mjs");
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.min.mjs";
      }
      const buf = await item.file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;

      const renderPages = async () => {
        wrap.innerHTML = "";
        const count = Math.min(doc.numPages, 35);
        for (let p = 1; p <= count; p++) {
          const page = await doc.getPage(p);
          const vp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          c.style.cssText = `max-width:100%;border-radius:8px;background:#fff;${
            night ? "filter:invert(92%) hue-rotate(180deg);" : ""
          }`;
          wrap.appendChild(c);
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        }
      };
      await renderPages();
      ctrls.querySelector("#pOut").onclick = () => { scale = Math.max(0.6, scale - 0.25); renderPages(); };
      ctrls.querySelector("#pIn").onclick = () => { scale = Math.min(2.5, scale + 0.25); renderPages(); };
      ctrls.querySelector("#pNight").onclick = () => { night = !night; renderPages(); };
    } catch (err) {
      wrap.innerHTML = `<p style="color:#fda4af;">تعذر عرض ملف PDF: ${err.message || err}</p>`;
    }
  }

  /* ── 5. WORD (.docx), CSV & TEXT READER + TTS ── */
  async function mountDocOrTextReader(item, stage, ctrls) {
    const wrap = document.createElement("div");
    wrap.className = "sp-doc-wrap theme-dark";
    stage.appendChild(wrap);

    let fontSize = 15;
    let themes = ["theme-dark", "theme-sepia", "theme-light"];
    let tIdx = 0;
    let rawForTts = "";

    ctrls.innerHTML = `
      <div class="sp-pill-row">
        <div style="display:flex;gap:5px;">
          <button class="sp-btn" id="dFontDec">A-</button>
          <button class="sp-btn" id="dFontInc">A+</button>
          <button class="sp-btn" id="dTheme">🎨 السمة</button>
        </div>
        <button class="sp-btn" id="dTts">🔊 قراءة صوتية</button>
      </div>
    `;

    try {
      const buf = await item.file.arrayBuffer();
      if (item.cat === "docx" && window.mammoth) {
        try {
          const res = await window.mammoth.convertToHtml({ arrayBuffer: buf });
          const raw = await window.mammoth.extractRawText({ arrayBuffer: buf });
          rawForTts = raw.value || "";
          wrap.innerHTML = `<div dir="auto" style="line-height:1.75;">${res.value || ""}</div>`;
        } catch {
          rawForTts = decodeBufSmart(buf).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "\n");
          wrap.innerHTML = `<pre dir="auto" style="white-space:pre-wrap;word-break:break-word;line-height:1.7;margin:0;"></pre>`;
          wrap.querySelector("pre").textContent = rawForTts;
        }
      } else if (item.cat === "csv") {
        const txt = decodeBufSmart(buf);
        rawForTts = txt;
        const rows = txt.split(/\r?\n/).filter((l) => l.trim()).slice(0, 300).map((l) => l.split(","));
        const tbl = document.createElement("table");
        tbl.className = "sp-csv-table";
        tbl.innerHTML = rows
          .map(
            (r, idx) =>
              `<tr>${r.map((c) => (idx === 0 ? `<th>${c}</th>` : `<td dir="auto">${c}</td>`)).join("")}</tr>`
          )
          .join("");
        wrap.appendChild(tbl);
      } else {
        const txt = decodeBufSmart(buf);
        rawForTts = txt;
        const pre = document.createElement("pre");
        pre.dir = "auto";
        pre.style.cssText = "white-space:pre-wrap;word-break:break-word;line-height:1.7;margin:0;";
        pre.textContent = txt;
        wrap.appendChild(pre);
      }
    } catch (e) {
      wrap.textContent = "تعذر قراءة المستند: " + e;
    }

    ctrls.querySelector("#dFontDec").onclick = () => {
      fontSize = Math.max(11, fontSize - 2);
      wrap.style.fontSize = `${fontSize}px`;
    };
    ctrls.querySelector("#dFontInc").onclick = () => {
      fontSize = Math.min(28, fontSize + 2);
      wrap.style.fontSize = `${fontSize}px`;
    };
    ctrls.querySelector("#dTheme").onclick = () => {
      wrap.classList.remove(themes[tIdx]);
      tIdx = (tIdx + 1) % themes.length;
      wrap.classList.add(themes[tIdx]);
    };
    ctrls.querySelector("#dTts").onclick = () => {
      if (!window.speechSynthesis) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        return;
      }
      const u = new SpeechSynthesisUtterance(rawForTts.slice(0, 8000));
      u.lang = /[\u0600-\u06FF]/.test(rawForTts) ? "ar-SA" : "en-US";
      window.speechSynthesis.speak(u);
    };
  }

  function parseSrtText(raw) {
    const blocks = raw.replace(/\r\n/g, "\n").split(/\n{2,}/);
    const out = [];
    const toSec = (s) => {
      const p = s.trim().replace(",", ".").split(":");
      return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : 0;
    };
    for (const b of blocks) {
      const lines = b.trim().split("\n");
      const idx = lines.findIndex((l) => l.includes("-->"));
      if (idx === -1) continue;
      const [st, en] = lines[idx].split("-->");
      out.push({ start: toSec(st), end: toSec(en.split(/\s+/)[0]), text: lines.slice(idx + 1).join(" ") });
    }
    return out;
  }

  /* ── INIT STUDIO bindings ── */
  window.addEventListener("DOMContentLoaded", () => {
    const openBtn = document.getElementById("openLocalStudioCard");
    const overlay = document.getElementById("studioOverlay");
    const closeBtn = document.getElementById("closeStudioBtn");
    const fileInput = document.getElementById("studioFileInput");
    const pickBtn = document.getElementById("studioPickFilesBtn");
    const clearBtn = document.getElementById("studioClearBtn");
    const searchInput = document.getElementById("studioSearchInput");
    const closePlayerBtn = document.getElementById("spCloseBtn");
    const prevPlayerBtn = document.getElementById("spPrevBtn");
    const nextPlayerBtn = document.getElementById("spNextBtn");

    openBtn?.addEventListener("click", () => {
      overlay?.classList.remove("hidden");
      renderStudioList();
    });
    closeBtn?.addEventListener("click", () => overlay?.classList.add("hidden"));
    pickBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", (e) => {
      addStudioFiles(e.target.files);
      e.target.value = "";
    });
    clearBtn?.addEventListener("click", () => {
      studioItems.forEach((x) => URL.revokeObjectURL(x.url));
      studioItems.length = 0;
      renderStudioList();
    });
    searchInput?.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderStudioList();
    });

    document.querySelectorAll(".studio-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".studio-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.getAttribute("data-cat") || "all";
        renderStudioList();
      });
    });

    closePlayerBtn?.addEventListener("click", closeStudioPlayer);
    prevPlayerBtn?.addEventListener("click", () => {
      if (currentIdx > 0) openStudioPlayer(currentIdx - 1);
    });
    nextPlayerBtn?.addEventListener("click", () => {
      const list = filteredList();
      if (currentIdx + 1 < list.length) openStudioPlayer(currentIdx + 1);
    });
  });
})();
