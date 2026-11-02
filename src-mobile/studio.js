/* LocalDock Mobile — Standalone Offline Pro Media & Document Studio */
"use strict";

(function () {
  const studioItems = []; // { id, file, url, name, size, ext, cat }
  let activeFilter = "all";
  let searchQuery = "";
  let currentIdx = -1;

  // Professional SVG Icons Library
  const ICONS = {
    play: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
    pause: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    rewind: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>`,
    forward: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>`,
    prev: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
    next: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
    lock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    unlock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
    aspect: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 8h10M7 16h10"/></svg>`,
    rotate: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`,
    subtitles: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="15" x2="18" y2="15"/><line x1="6" y1="11" x2="14" y2="11"/></svg>`,
    camera: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    zoomIn: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    zoomOut: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    flip: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    contrast: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z"/></svg>`,
    sepia: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>`,
    moon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    palette: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.68 1.5-1.5 0-.38-.15-.74-.42-1.02-.27-.27-.43-.63-.43-1.01 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9.97-10-9.97z"/></svg>`,
    speaker: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    sun: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    vol: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    // File types
    fileVideo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
    fileAudio: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    fileImage: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    filePdf: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    fileDocx: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    fileCsv: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>`,
    fileText: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`
  };

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

  function showStudioHud(msg, iconSvg = "") {
    const el = document.getElementById("spHud");
    if (!el) return;
    el.innerHTML = iconSvg ? `<span style="display:inline-flex;align-items:center;gap:6px;">${iconSvg}<span>${msg}</span></span>` : msg;
    el.classList.remove("hidden");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => el.classList.add("hidden"), 1200);
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
            <span style="color:#2dd4bf;">${ICONS.fileVideo}</span>
            <span style="color:#a78bfa;">${ICONS.fileAudio}</span>
            <span style="color:#38bdf8;">${ICONS.fileImage}</span>
            <span style="color:#f43f5e;">${ICONS.filePdf}</span>
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
        video: ICONS.fileVideo,
        audio: ICONS.fileAudio,
        image: ICONS.fileImage,
        pdf: ICONS.filePdf,
        docx: ICONS.fileDocx,
        csv: ICONS.fileCsv,
        text: ICONS.fileText,
      };
      const thumbHtml =
        item.cat === "image"
          ? `<img src="${item.url}" alt="" />`
          : `<span>${iconMap[item.cat] || ICONS.fileText}</span>`;

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          <div class="studio-item-thumb">${thumbHtml}</div>
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" dir="auto">${item.name}</div>
            <div style="font-size:11px;color:#94a3b8;">${fmtSize(item.size)} · ${item.cat.toUpperCase()}</div>
          </div>
        </div>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(45,212,191,0.12);color:#2dd4bf;">${ICONS.play}</span>
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
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
          <button class="sp-btn" id="vPlay">${ICONS.pause}</button>
          <button class="sp-btn" id="vRew">-10s</button>
          <button class="sp-btn" id="vFwd">+10s</button>
          <button class="sp-btn" id="vSpeed">1x</button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
          <button class="sp-btn" id="vLock" title="قفل اللمس">${ICONS.lock}</button>
          <button class="sp-btn" id="vFit" title="أبعاد الشاشة">${ICONS.aspect} <span>Fit</span></button>
          <button class="sp-btn" id="vRot" title="تدوير">${ICONS.rotate}</button>
          <button class="sp-btn" id="vSub" title="ترجمة .srt">${ICONS.subtitles}</button>
          <button class="sp-btn" id="vSnap" title="لقطة شاشة">${ICONS.camera}</button>
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
    video.addEventListener("play", () => (playBtn.innerHTML = ICONS.pause));
    video.addEventListener("pause", () => (playBtn.innerHTML = ICONS.play));

    seekEl.addEventListener("input", () => (video.currentTime = parseFloat(seekEl.value)));
    playBtn.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
    ctrls.querySelector("#vRew").addEventListener("click", () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
      showStudioHud("-10 ثوانٍ", ICONS.rewind);
    });
    ctrls.querySelector("#vFwd").addEventListener("click", () => {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      showStudioHud("+10 ثوانٍ", ICONS.forward);
    });
    ctrls.querySelector("#vSpeed").addEventListener("click", (e) => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      const next = rates[(rates.indexOf(video.playbackRate) + 1) % rates.length] || 1;
      video.playbackRate = next;
      e.currentTarget.textContent = `${next}x`;
      showStudioHud(`سرعة التشغيل: ${next}x`);
    });
    ctrls.querySelector("#vFit").addEventListener("click", (e) => {
      fitIdx = (fitIdx + 1) % fitModes.length;
      video.style.objectFit = fitModes[fitIdx];
      e.currentTarget.innerHTML = `${ICONS.aspect} <span>${fitModes[fitIdx]}</span>`;
      showStudioHud(`أبعاد العرض: ${fitModes[fitIdx]}`, ICONS.aspect);
    });
    ctrls.querySelector("#vRot").addEventListener("click", () => {
      rot = (rot + 90) % 360;
      applyTransform();
      showStudioHud(`تدوير: ${rot}°`, ICONS.rotate);
    });
    ctrls.querySelector("#vLock").addEventListener("click", () => {
      locked = true;
      ctrls.classList.add("hidden");
      showStudioHud("تم قفل اللمس (انقر مرتين لفتح القفل)", ICONS.lock);
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
      showStudioHud(`تم تحميل الترجمة (${cues.length} سطر)`, ICONS.subtitles);
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
        showStudioHud("تم حفظ لقطة الشاشة في التنزيلات", ICONS.camera);
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
            showStudioHud("تم إلغاء قفل الشاشة", ICONS.unlock);
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
        showStudioHud(`السطوع: ${Math.round(bright * 100)}%`, ICONS.sun);
      } else if (gestureMode === "vol") {
        video.volume = Math.max(0, Math.min(1, startVol - dy / 220));
        showStudioHud(`الصوت: ${Math.round(video.volume * 100)}%`, ICONS.vol);
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
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
          <button class="sp-btn" id="iOut" title="تصغير">${ICONS.zoomOut}</button>
          <button class="sp-btn" id="iReset">100%</button>
          <button class="sp-btn" id="iIn" title="تكبير">${ICONS.zoomIn}</button>
          <button class="sp-btn" id="iRot" title="تدوير">${ICONS.rotate} <span>90°</span></button>
          <button class="sp-btn" id="iFlip" title="قلب أفقي">${ICONS.flip} <span>قلب</span></button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
          <button class="sp-btn" id="iGray">${ICONS.contrast} <span>رمادي</span></button>
          <button class="sp-btn" id="iSepia">${ICONS.sepia} <span>Sepia</span></button>
        </div>
      </div>
    `;
    ctrls.querySelector("#iOut").onclick = () => { zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2)); apply(); showStudioHud(`${Math.round(zoom * 100)}%`, ICONS.zoomOut); };
    ctrls.querySelector("#iReset").onclick = () => { zoom = 1; rot = 0; flipH = 1; apply(); showStudioHud("100%"); };
    ctrls.querySelector("#iIn").onclick = () => { zoom = Math.min(6, +(zoom + 0.25).toFixed(2)); apply(); showStudioHud(`${Math.round(zoom * 100)}%`, ICONS.zoomIn); };
    ctrls.querySelector("#iRot").onclick = () => { rot = (rot + 90) % 360; apply(); showStudioHud(`تدوير: ${rot}°`, ICONS.rotate); };
    ctrls.querySelector("#iFlip").onclick = () => { flipH *= -1; apply(); showStudioHud("قلب أفقي", ICONS.flip); };
    ctrls.querySelector("#iGray").onclick = () => { gray = !gray; apply(); showStudioHud(gray ? "فلتر أبيض وأسود" : "إلغاء الفلتر"); };
    ctrls.querySelector("#iSepia").onclick = () => { sepia = !sepia; apply(); showStudioHud(sepia ? "فلتر Sepia" : "إلغاء الفلتر"); };
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
        <button class="sp-btn" id="aPrev" title="السابق">${ICONS.prev}</button>
        <button class="sp-btn" id="aPlay" title="تشغيل / إيقاف">${ICONS.pause}</button>
        <button class="sp-btn" id="aNext" title="التالي">${ICONS.next}</button>
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
    seekEl.oninput = () => (audio.currentTime = parseFloat(seekEl.value)));
    ctrls.querySelector("#aPlay").onclick = (e) => {
      if (audio.paused) { audio.play(); e.currentTarget.innerHTML = ICONS.pause; }
      else { audio.pause(); e.currentTarget.innerHTML = ICONS.play; }
    };
    ctrls.querySelector("#aPrev").onclick = () => { if (currentIdx > 0) openStudioPlayer(currentIdx - 1); };
    ctrls.querySelector("#aNext").onclick = () => { if (currentIdx + 1 < list.length) openStudioPlayer(currentIdx + 1); };
    ctrls.querySelector("#aSpeed").onclick = (e) => {
      const rates = [0.75, 1, 1.25, 1.5, 2];
      const next = rates[(rates.indexOf(audio.playbackRate) + 1) % rates.length] || 1;
      audio.playbackRate = next;
      e.currentTarget.textContent = `${next}x`;
      showStudioHud(`سرعة الصوت: ${next}x`);
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
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="sp-btn" id="pOut" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.zoomOut} <span>تصغير</span></button>
          <button class="sp-btn" id="pIn" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.zoomIn} <span>تكبير</span></button>
        </div>
        <button class="sp-btn" id="pNight" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.moon} <span>وضع القراءة الليلي</span></button>
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
        <div style="display:flex;gap:5px;align-items:center;">
          <button class="sp-btn" id="dFontDec">A-</button>
          <button class="sp-btn" id="dFontInc">A+</button>
          <button class="sp-btn" id="dTheme" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.palette} <span>السمة</span></button>
        </div>
        <button class="sp-btn" id="dTts" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.speaker} <span>قراءة صوتية</span></button>
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
