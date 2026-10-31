"use client";

/**
 * LocalDock — professional in-app preview with Fullscreen, Pinch-to-zoom,
 * Gestures, Video enhancements, and Text tools (Q1-Q7).
 */
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { FileEntry } from "@/lib/localdock/types";
import { Api } from "@/lib/localdock/client/api";
import { mediaSrc } from "@/lib/localdock/client/media";
import { formatBytes, formatDateTime } from "@/lib/localdock/client/format";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FastForward,
  Fingerprint,
  Loader2,
  Maximize,
  Maximize2,
  Minimize,
  Minus,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Rewind,
  Search,
  Volume2,
  VolumeX,
  WrapText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/localdock/i18n";

const TEXT_LIMIT = 512 * 1024;

export interface PreviewSibling {
  entry: FileEntry;
  rel: string;
}

export function PreviewModal({
  shareId,
  shareName,
  entry,
  relPath,
  siblings = [],
  onNavigate,
  onClose,
  onDownload,
}: {
  shareId: string;
  shareName: string;
  entry: FileEntry;
  relPath: string;
  siblings?: PreviewSibling[];
  onNavigate?: (sibling: PreviewSibling) => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  const { t } = useI18n();
  const dlgRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [textTooBig, setTextTooBig] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isFullscreen) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      resetControlsTimer();
    } else {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isFullscreen, resetControlsTimer]);

  const index = siblings.findIndex((s) => s.rel === relPath);
  const canPrev = index > 0;
  const canNext = index >= 0 && index < siblings.length - 1;

  const go = useCallback(
    (dir: -1 | 1) => {
      if (index < 0) return;
      const next = siblings[index + dir];
      if (next) onNavigate?.(next);
    },
    [index, siblings, onNavigate]
  );

  /* Q1: True fullscreen toggle */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      dlgRef.current?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {
        setIsFullscreen((prev) => !prev);
      });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  /* Q29: Back button integration for preview dialog */
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ modal: "preview" }, "", window.location.href);
    const onPop = () => {
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose]);

  /* Resolve the tokenized media URL per file */
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setText(null);
    setTextTooBig(false);
    setHash(null);
    if (entry.kind === "dir") return;
    if (entry.category === "text" || entry.category === "code") {
      if (entry.size > TEXT_LIMIT) {
        setTextTooBig(true);
        return;
      }
      void mediaSrc(shareId, relPath)
        .then((u) => (alive ? fetch(u).then((r) => (r.ok ? r.text() : "")) : ""))
        .then((t) => alive && setText(t))
        .catch(() => alive && setText(null));
    } else {
      void mediaSrc(shareId, relPath).then((u) => alive && setSrc(u));
    }
    return () => {
      alive = false;
    };
  }, [shareId, relPath, entry.category, entry.kind, entry.size]);

  /* Keyboard: navigation + image controls + fullscreen */
  const imageCmdRef = useRef<{ zoom: (d: number) => void; reset: () => void; rotate: (d: number) => void } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && canPrev) { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight" && canNext) { e.preventDefault(); go(1); }
      else if (e.key === "+" || e.key === "=") imageCmdRef.current?.zoom(1);
      else if (e.key === "-") imageCmdRef.current?.zoom(-1);
      else if (e.key === "0") imageCmdRef.current?.reset();
      else if (e.key === "r" || e.key === "R") imageCmdRef.current?.rotate(1);
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, canPrev, canNext, toggleFullscreen]);

  /* Q3: Swipe gesture to navigate between siblings */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) {
      if (dx < 0 && canNext) go(1);
      else if (dx > 0 && canPrev) go(-1);
    }
  };

  const verify = async () => {
    setHashing(true);
    try {
      const res = await Api.fileHash(shareId, relPath);
      setHash(res.sha256);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHashing(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        ref={dlgRef}
        aria-describedby={undefined}
        showCloseButton={false}
        fullscreen={isFullscreen}
        className={cn(
          "ld-preview flex flex-col gap-0 overflow-hidden p-0 transition-all duration-200 bg-[#0b0d12]",
          isFullscreen
            ? "!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !z-[100] !h-screen !h-dvh !w-screen !max-w-none !max-h-none !rounded-none !border-none !translate-x-0 !translate-y-0 !transform-none !m-0 ld-preview-fullscreen"
            : "h-[90dvh] max-w-5xl sm:h-[85vh] sm:max-w-5xl"
        )}
      >
        {/* header */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 border-b py-2.5 ps-3 pe-2.5 sm:ps-5 transition-all duration-300",
            isFullscreen
              ? "absolute top-0 inset-x-0 z-50 bg-gradient-to-b from-black/90 via-black/50 to-transparent border-transparent text-white"
              : "border-border bg-card",
            isFullscreen && !showControls && "opacity-0 pointer-events-none -translate-y-2"
          )}
        >
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{entry.name}</DialogTitle>
            <p className={cn("mt-0.5 truncate text-xs", isFullscreen ? "text-white/70" : "text-muted-foreground")}>
              {formatBytes(entry.size)} · {shareName} · {formatDateTime(entry.modifiedAt)}
              {siblings.length > 1 && index >= 0 && (
                <span className={cn("tnum ms-2 rounded-md px-1.5 py-0.5 font-semibold", isFullscreen ? "bg-white/20 text-white" : "bg-muted text-foreground/70")}>
                  {index + 1} / {siblings.length}
                </span>
              )}
            </p>
          </div>
          {src && (
            <Button
              variant={isFullscreen ? "secondary" : "outline"}
              size="icon"
              className={cn("size-8 shrink-0 rounded-xl", isFullscreen && "bg-white/15 text-white hover:bg-white/25 border-none")}
              onClick={() => window.open(src, "_blank")}
              title="فتح في المتصفح"
              aria-label="فتح في المتصفح"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          )}
          <Button
            variant={isFullscreen ? "secondary" : "outline"}
            size="icon"
            className={cn("size-8 shrink-0 rounded-xl", isFullscreen && "bg-white/15 text-white hover:bg-white/25 border-none")}
            onClick={toggleFullscreen}
            title={isFullscreen ? "إنهاء ملء الشاشة (F)" : "ملء الشاشة (F)"}
            aria-label="ملء الشاشة"
          >
            {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </Button>
          <Button
            variant={isFullscreen ? "secondary" : "outline"}
            size="sm"
            className={cn("h-8 shrink-0 rounded-xl text-xs", isFullscreen && "bg-white/15 text-white hover:bg-white/25 border-none")}
            onClick={onDownload}
          >
            {t.preview.download}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0 rounded-xl hover:text-foreground", isFullscreen ? "text-white/80 hover:bg-white/20 hover:text-white" : "text-muted-foreground")}
            onClick={onClose}
            aria-label={t.preview.closeAria}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* body */}
        <div
          className={cn(
            "ld-preview-body relative flex-1 select-none overflow-hidden bg-[#0b0d12]",
            isFullscreen && "h-full w-full"
          )}
          onMouseMove={resetControlsTimer}
          onClick={resetControlsTimer}
          onTouchStart={(e) => {
            resetControlsTimer();
            onTouchStart(e);
          }}
          onTouchEnd={onTouchEnd}
        >
          {/* navigation arrows */}
          {siblings.length > 1 && (
            <div
              className={cn(
                "transition-opacity duration-300",
                isFullscreen && !showControls && "opacity-0 pointer-events-none"
              )}
            >
              <NavArrow side="prev" disabled={!canPrev} onClick={() => go(-1)} />
              <NavArrow side="next" disabled={!canNext} onClick={() => go(1)} />
            </div>
          )}

          {entry.category === "image" &&
            (src ? (
              <ImageViewer
                src={src}
                alt={entry.name}
                onCmd={(cmd) => (imageCmdRef.current = cmd)}
                isFullscreen={isFullscreen}
                showControls={showControls}
              />
            ) : (
              <CenterSpinner />
            ))}

          {entry.category === "video" &&
            (src ? (
              <VideoPlayer
                src={src}
                shareId={shareId}
                relPath={relPath}
                isFullscreen={isFullscreen}
                toggleFullscreen={toggleFullscreen}
                showControls={showControls}
              />
            ) : (
              <CenterSpinner />
            ))}

          {entry.category === "audio" && (src ? <AudioPlayer src={src} name={entry.name} /> : <CenterSpinner />)}

          {entry.category === "pdf" &&
            (src ? (
              <iframe
                key={src}
                src={src}
                title={t.preview.pdfTitle(entry.name)}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <CenterSpinner />
            ))}

          {(entry.category === "text" || entry.category === "code") &&
            (text !== null ? (
              <TextViewer text={text} filename={entry.name} />
            ) : textTooBig ? (
              <CenterNote>{t.preview.largeFile(formatBytes(entry.size))}</CenterNote>
            ) : (
              <CenterSpinner />
            ))}

          {entry.category === "archive" && <CenterNote>{t.preview.archiveNote}</CenterNote>}
          {entry.category === "apk" && <CenterNote>{t.preview.apkNote}</CenterNote>}
          {entry.category === "other" && (
            <CenterNote>{t.preview.noPreview(entry.mimeType ?? t.preview.unknownType)}</CenterNote>
          )}
        </div>

        {/* Q7: Filmstrip for image siblings */}
        {siblings.length > 1 && entry.category === "image" && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border bg-[#0b0d12] px-3 py-1.5 scrollbar-thin transition-all duration-300",
              isFullscreen && "absolute bottom-16 inset-x-0 z-40 bg-black/75 backdrop-blur-md border-transparent",
              isFullscreen && !showControls && "opacity-0 pointer-events-none translate-y-3"
            )}
          >
            {siblings.map((sib, i) => (
              <button
                key={sib.rel}
                onClick={() => onNavigate?.(sib)}
                className={cn(
                  "relative size-10 shrink-0 overflow-hidden rounded-lg border transition-all",
                  sib.rel === relPath
                    ? "border-primary ring-2 ring-primary/40 scale-105"
                    : "border-white/20 opacity-60 hover:opacity-100"
                )}
                title={sib.entry.name}
              >
                <div className="flex h-full w-full items-center justify-center bg-black/40 text-[9px] font-bold text-white/80">
                  {i + 1}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* footer — hidden in fullscreen to maximize screen area */}
        {!isFullscreen && (
          <div className="flex w-full min-w-0 items-center gap-2 border-t border-border px-3 py-2 sm:px-5">
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-lg text-xs" onClick={verify}>
              <Fingerprint className="size-3.5" />
              <span className="hidden sm:inline">{t.preview.verifySha}</span>
              <span className="sm:hidden">{t.preview.shaLabel}</span>
            </Button>
            {hashing && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
            {hash && (
              <code className="ld-scroll min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {hash}
              </code>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Image viewer — pinch-to-zoom (Q2) / pan / rotate                   */
/* ------------------------------------------------------------------ */

function ImageViewer({
  src,
  alt,
  onCmd,
  isFullscreen,
  showControls = true,
}: {
  src: string;
  alt: string;
  onCmd: (cmd: { zoom: (d: number) => void; reset: () => void; rotate: (d: number) => void } | null) => void;
  isFullscreen?: boolean;
  showControls?: boolean;
}) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(0); // 0 = fit
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Multi-touch tracking for pinch-to-zoom
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  const clampZoom = (z: number) => Math.min(10, Math.max(0.1, z));

  const zoomBy = useCallback((d: number) => {
    setZoom((z) => clampZoom(z === 0 ? (d > 0 ? 1.25 : 0.8) : z * (d > 0 ? 1.25 : 0.8)));
  }, []);

  useEffect(() => {
    onCmd({
      zoom: zoomBy,
      reset: () => { setZoom(0); setPan({ x: 0, y: 0 }); setRot(0); },
      rotate: (d) => setRot((r) => (r + d * 90 + 360) % 360),
    });
    return () => onCmd(null);
  }, [onCmd, zoomBy]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchesRef.current.size === 2) {
      const pts = Array.from(touchesRef.current.values());
      initialPinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialZoomRef.current = zoom === 0 ? 1 : zoom;
      return;
    }
    if (zoom === 0) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (touchesRef.current.has(e.pointerId)) {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (touchesRef.current.size === 2 && initialPinchDistRef.current) {
      const pts = Array.from(touchesRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / initialPinchDistRef.current;
      setZoom(clampZoom(initialZoomRef.current * ratio));
      return;
    }
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    touchesRef.current.delete(e.pointerId);
    if (touchesRef.current.size < 2) {
      initialPinchDistRef.current = null;
    }
    drag.current = null;
    setDragging(false);
  };

  return (
    <div className="relative h-full w-full">
      <div
        ref={wrapRef}
        style={{ touchAction: "none" }}
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden",
          zoom !== 0 && "cursor-grab active:cursor-grabbing"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={() => (zoom === 0 ? setZoom(1.5) : setZoom(0))}
      >
        {!loaded && <Loader2 className="absolute size-7 animate-spin text-white/40" aria-hidden />}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          draggable={false}
          className={cn(
            "max-h-full max-w-full object-contain transition-[opacity] duration-300",
            isFullscreen ? "rounded-none h-full w-full" : "rounded-lg",
            loaded ? "opacity-100" : "opacity-0"
          )}
          style={
            zoom === 0
              ? { transform: `rotate(${rot}deg)` }
              : {
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                  transition: dragging ? "none" : "transform 0.12s ease-out",
                }
          }
        />
      </div>

      {/* control bar */}
      <div
        className={cn(
          "absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/60 p-1 text-white shadow-pop backdrop-blur-md transition-all duration-300",
          isFullscreen && !showControls && "opacity-0 pointer-events-none translate-y-3"
        )}
      >
        <IconBtn label={t.preview.zoomOut} onClick={() => zoomBy(-1)}><Minus className="size-4" /></IconBtn>
        <button
          className="tnum min-w-14 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-white/10"
          onClick={() => setZoom((z) => (z === 0 ? 1 : 0))}
          title={t.preview.fitTitle}
        >
          {zoom === 0 ? t.preview.fit : `${Math.round(zoom * 100)}%`}
        </button>
        <IconBtn label={t.preview.zoomIn} onClick={() => zoomBy(1)}><Plus className="size-4" /></IconBtn>
        <span className="mx-0.5 h-5 w-px bg-white/15" />
        <IconBtn label={t.preview.rotateLeft} onClick={() => setRot((r) => (r + 270) % 360)}><RotateCcw className="size-4" /></IconBtn>
        <IconBtn label={t.preview.rotateRight} onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw className="size-4" /></IconBtn>
        <IconBtn label={t.preview.reset} onClick={() => { setZoom(0); setPan({ x: 0, y: 0 }); setRot(0); }}>
          <Maximize2 className="size-4" />
        </IconBtn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Video player with position memory, speed, PiP, Fullscreen (Q4)     */
/* ------------------------------------------------------------------ */

function VideoPlayer({
  src,
  shareId,
  relPath,
  isFullscreen,
  toggleFullscreen,
  showControls = true,
}: {
  src: string;
  shareId: string;
  relPath: string;
  isFullscreen?: boolean;
  toggleFullscreen?: () => void;
  showControls?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rateIdx, setRateIdx] = useState(2); // 1.0x
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const storageKey = `localdock:videoPos:${shareId}:${relPath}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const sec = parseFloat(saved);
      if (!isNaN(sec) && sec > 0) {
        v.currentTime = sec;
      }
    }

    const onTime = () => {
      if (v.currentTime > 5 && v.duration - v.currentTime > 5) {
        localStorage.setItem(storageKey, String(Math.floor(v.currentTime)));
      } else if (v.ended) {
        localStorage.removeItem(storageKey);
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [storageKey]);

  // Keep screen awake while video is playing (prevents screen blackout / sleep)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let wakeLockSentinel: unknown = null;

    const acquireLock = async () => {
      try {
        if ("wakeLock" in navigator && !v.paused && !v.ended) {
          wakeLockSentinel = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } }).wakeLock.request("screen");
        }
      } catch {}
    };

    const releaseLock = async () => {
      if (wakeLockSentinel && typeof (wakeLockSentinel as { release?: () => Promise<void> }).release === "function") {
        try {
          await (wakeLockSentinel as { release: () => Promise<void> }).release();
        } catch {}
        wakeLockSentinel = null;
      }
    };

    const onPlay = () => void acquireLock();
    const onPause = () => void releaseLock();
    const onEnded = () => void releaseLock();

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);

    if (!v.paused) void acquireLock();

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      void releaseLock();
    };
  }, [src]);

  const toggleRate = () => {
    const next = (rateIdx + 1) % rates.length;
    setRateIdx(next);
    if (videoRef.current) videoRef.current.playbackRate = rates[next];
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {}
  };

  const toggleVideoFullscreen = () => {
    toggleFullscreen?.();
  };

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center",
        isFullscreen ? "p-0" : "p-3 sm:p-6"
      )}
    >
      <video
        ref={videoRef}
        key={src}
        src={src}
        controls
        autoPlay
        playsInline
        className={cn(
          "max-h-full max-w-full bg-black",
          isFullscreen ? "h-full w-full rounded-none" : "rounded-xl shadow-pop",
          fitMode === "cover" ? "object-cover" : "object-contain"
        )}
      />
      <div
        className={cn(
          "absolute top-4 end-4 z-30 flex items-center gap-1 rounded-xl bg-black/70 p-1 text-white backdrop-blur-md transition-all duration-300",
          isFullscreen && !showControls && "opacity-0 pointer-events-none -translate-y-2"
        )}
      >
        <button
          type="button"
          onClick={() => setFitMode((m) => (m === "contain" ? "cover" : "contain"))}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/20 transition-colors"
          title={fitMode === "contain" ? "ملء الشاشة بالكامل (Fill)" : "ملاءمة أبعاد الفيديو (Fit)"}
        >
          {fitMode === "contain" ? "Fill" : "Fit"}
        </button>
        <button
          type="button"
          onClick={toggleRate}
          className="tnum rounded-lg px-2 py-1 text-xs font-bold hover:bg-white/20 transition-colors"
          title="سرعة التشغيل"
        >
          {rates[rateIdx]}×
        </button>
        <button
          type="button"
          onClick={togglePiP}
          className="rounded-lg p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          title="صورة داخل صورة"
        >
          <PictureInPicture2 className="size-4" />
        </button>
        {toggleFullscreen && (
          <button
            type="button"
            onClick={toggleVideoFullscreen}
            className="rounded-lg p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            title={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
          >
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text/Code viewer with Copy, Search, Line numbers, Wrap (Q5)        */
/* ------------------------------------------------------------------ */

function TextViewer({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [query, setQuery] = useState("");

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("تم نسخ محتوى الملف بالكامل");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذر نسخ النص");
    }
  };

  const lines = useMemo(() => text.split("\n"), [text]);

  const matchCount = useMemo(() => {
    if (!query.trim()) return 0;
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return (text.match(re) || []).length;
  }, [text, query]);

  return (
    <div className="flex h-full flex-col bg-[#0b0d12]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0e1117] px-3 py-2 text-white">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث داخل الملف…"
            className="h-7 w-full rounded-lg bg-white/10 ps-8 pe-12 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {query.trim() && (
            <span className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-white/60">
              {matchCount}
            </span>
          )}
        </div>
        <div className="ms-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg text-xs text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setWrap((w) => !w)}
            title="تبديل التفاف الأسطر"
          >
            <WrapText className="size-3.5" />
            <span className="hidden sm:inline">{wrap ? "بدون التفاف" : "التفاف"}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg text-xs text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setShowLines((s) => !s)}
          >
            {showLines ? "#" : "—"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-lg border-white/20 bg-white/5 text-xs text-white hover:bg-white/15"
            onClick={copyAll}
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            <span>{copied ? "تم النسخ" : "نسخ الكل"}</span>
          </Button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="ld-scroll flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed text-[#d6deeb]">
        {lines.map((line, idx) => {
          const isMatch = query.trim() && line.toLowerCase().includes(query.toLowerCase());
          return (
            <div key={idx} className={cn("flex", isMatch && "bg-primary/20 rounded")}>
              {showLines && (
                <span className="me-3 w-8 shrink-0 select-none text-end font-mono text-xs text-white/30">
                  {idx + 1}
                </span>
              )}
              <span className={cn("flex-1", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
                {line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio player — custom controls                                     */
/* ------------------------------------------------------------------ */

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const RATES = [1, 1.25, 1.5, 2, 0.75];

function AudioPlayer({ src, name }: { src: string; name: string }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rateIdx, setRateIdx] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  };
  const skip = (d: number) => {
    const a = audioRef.current;
    if (a && Number.isFinite(a.duration)) a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + d));
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  return (
    <div className="flex h-full w-full items-center justify-center p-4 sm:p-6">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 shadow-pop backdrop-blur-md sm:p-6">
        <div className="relative mx-auto flex size-28 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/80 to-primary/40 text-white shadow-card sm:size-32">
          <span className={cn("text-4xl", playing && "ld-bounce")} aria-hidden>♪</span>
          {playing && (
            <span className="absolute -bottom-1 flex h-3 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="ld-bar w-1 rounded-full bg-white/90" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
          )}
        </div>
        <p className="mt-4 truncate text-center text-sm font-bold text-white">{name}</p>

        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={Math.min(cur, dur || 0)}
          onChange={(e) => {
            const a = audioRef.current;
            const v = Number(e.target.value);
            if (a) a.currentTime = v;
            setCur(v);
          }}
          className="ld-range mt-4 w-full"
          aria-label={t.preview.seekAria}
        />
        <div className="tnum mt-1 flex justify-between text-[11px] font-medium text-white/60">
          <span>{fmtTime(cur)}</span>
          <span>{fmtTime(dur)}</span>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <IconBtn label={t.preview.back10} onClick={() => skip(-10)} dark><Rewind className="size-4 rtl:-scale-x-100" /></IconBtn>
          <button
            onClick={toggle}
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop transition-transform hover:scale-105 active:scale-95"
            aria-label={playing ? t.preview.pauseAria : t.preview.playAria}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-[1px] rtl:-translate-x-[1px] rtl:-scale-x-100" />}
          </button>
          <IconBtn label={t.preview.fwd10} onClick={() => skip(10)} dark><FastForward className="size-4 rtl:-scale-x-100" /></IconBtn>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
          <IconBtn
            label={muted ? t.preview.unmute : t.preview.mute}
            dark
            onClick={() => {
              const a = audioRef.current;
              setMuted((m) => {
                if (a) a.muted = !m;
                return !m;
              });
            }}
          >
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconBtn>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              setMuted(v === 0);
              const a = audioRef.current;
              if (a) { a.volume = v; a.muted = v === 0; }
            }}
            className="ld-range flex-1"
            aria-label={t.preview.volumeAria}
          />
          <button
            className="tnum shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            onClick={() => {
              const next = (rateIdx + 1) % RATES.length;
              setRateIdx(next);
              const a = audioRef.current;
              if (a) a.playbackRate = RATES[next];
            }}
            title={t.preview.speedTitle}
          >
            {RATES[rateIdx]}×
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function IconBtn({
  children,
  label,
  onClick,
  dark = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg transition-colors",
        dark ? "text-white/85 hover:bg-white/10 hover:text-white" : "hover:bg-white/15"
      )}
    >
      {children}
    </button>
  );
}

function NavArrow({ side, disabled, onClick }: { side: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "prev" ? t.preview.prevAria : t.preview.nextAria}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/90 shadow-pop backdrop-blur-md transition-all hover:bg-black/65 hover:text-white active:scale-95",
        side === "prev" ? "start-2 sm:start-3" : "end-2 sm:end-3",
        disabled && "pointer-events-none opacity-0"
      )}
    >
      {side === "prev" ? (
        <ChevronLeft className="size-5 rtl:-scale-x-100" />
      ) : (
        <ChevronRight className="size-5 rtl:-scale-x-100" />
      )}
    </button>
  );
}

function CenterSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-white/40" />
    </div>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/60">
      <div>{children}</div>
    </div>
  );
}
