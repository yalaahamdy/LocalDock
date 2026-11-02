"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Captions,
  Camera,
  FastForward,
  Lock,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Rewind,
  RotateCw,
  Scaling,
  SkipBack,
  SkipForward,
  Smartphone,
  Sun,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { decodeTextSmart, parseSubtitles } from "@/lib/localdock/client/file-classify";

export type VideoFitMode = "contain" | "cover" | "fill" | "16:9" | "4:3";

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface ProVideoPlayerProps {
  src: string;
  fileName: string;
  storageKey: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showControls: boolean;
  onUserActivity: () => void;
  siblingSubtitleUrl?: string | null;
  onNext?: () => void;
  onPrev?: () => void;
}

export function ProVideoPlayer({
  src,
  fileName,
  storageKey,
  isFullscreen,
  onToggleFullscreen,
  showControls,
  onUserActivity,
  siblingSubtitleUrl,
  onNext,
  onPrev,
}: ProVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [fitMode, setFitMode] = useState<VideoFitMode>("contain");
  const [videoRotation, setVideoRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Pro tools: Lock, Loop, A-B Repeat, Subtitles, Long-press 2x
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockPill, setShowUnlockPill] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [autoNext, setAutoNext] = useState(false);
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const prevRateRef = useRef(1);

  // Subtitles
  const [subCues, setSubCues] = useState<SubtitleCue[]>([]);
  const [subEnabled, setSubEnabled] = useState(true);
  const [subName, setSubName] = useState<string | null>(null);
  const [activeSubText, setActiveSubText] = useState<string>("");

  // HUD feedback
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const hudTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Gesture refs
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    vol: number;
    bright: number;
    curTime: number;
    mode: "none" | "volume" | "brightness" | "seek" | "pan";
  } | null>(null);
  const pinchDistRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unlockPillTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showHud = useCallback((msg: string, ms = 1100) => {
    setHudMessage(msg);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudMessage(null), ms);
  }, []);

  // Load sibling subtitle if available (using smart UTF-8 / Windows-1256 decoder)
  useEffect(() => {
    setMediaError(null);
    setSubCues([]);
    setSubName(null);
    setActiveSubText("");
    if (!siblingSubtitleUrl) return;
    let cancelled = false;
    fetch(siblingSubtitleUrl, { credentials: "include" })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (cancelled || !buf) return;
        const txt = decodeTextSmart(buf);
        const parsed = parseSubtitles(txt);
        if (parsed.length > 0) {
          setSubCues(parsed);
          setSubName("ترجمة تلقائية");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siblingSubtitleUrl, src]);

  // WakeLock to keep screen awake during playback
  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && isPlaying) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        // ignore
      }
    };
    if (isPlaying) {
      requestWakeLock();
    }
    const onVis = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isPlaying]);

  // Sync current subtitle cue & A-B loop
  useEffect(() => {
    if (loopA !== null && loopB !== null && currentTime >= loopB) {
      if (videoRef.current) {
        videoRef.current.currentTime = loopA;
      }
    }
    if (!subEnabled || subCues.length === 0) {
      setActiveSubText("");
      return;
    }
    const cue = subCues.find((c) => currentTime >= c.start && currentTime <= c.end);
    setActiveSubText(cue ? cue.text : "");
  }, [currentTime, loopA, loopB, subCues, subEnabled]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      const next = Math.max(
        0,
        Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + delta)
      );
      videoRef.current.currentTime = next;
      setCurrentTime(next);
      showHud(`${delta > 0 ? "+" : ""}${delta}s`);
    },
    [showHud]
  );

  const cycleSpeed = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length] || 1;
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    showHud(`السرعة: ${next}x`);
  };

  const cycleFitMode = () => {
    const modes: VideoFitMode[] = ["contain", "cover", "fill", "16:9", "4:3"];
    const labels: Record<VideoFitMode, string> = {
      contain: "ملائم (Fit)",
      cover: "ملء وتوسيع (Crop)",
      fill: "تمديد كامل (Stretch)",
      "16:9": "أبعاد 16:9",
      "4:3": "أبعاد 4:3",
    };
    const next = modes[(modes.indexOf(fitMode) + 1) % modes.length];
    setFitMode(next);
    showHud(labels[next]);
  };

  const handleRotateScreen = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orientation = (screen as any)?.orientation;
      if (orientation?.lock) {
        const curType = String(orientation.type || "");
        if (curType.startsWith("landscape")) {
          await orientation.unlock?.();
          showHud("إلغاء قفل الدوران");
          return;
        } else {
          await orientation.lock("landscape");
          showHud("الوضع الأفقي (Landscape)");
          return;
        }
      }
    } catch {
      // Fallback to in-player rotation
    }
    const nextRot = (videoRotation + 90) % 360;
    setVideoRotation(nextRot);
    showHud(`تدوير الفيديو ${nextRot}°`);
  };

  const handleToggleABLoop = () => {
    if (loopA === null) {
      setLoopA(currentTime);
      showHud(`نقطة البداية A (${formatTime(currentTime)})`);
    } else if (loopB === null) {
      if (currentTime <= loopA + 0.5) {
        setLoopA(null);
        showHud("إلغاء تكرار A-B");
      } else {
        setLoopB(currentTime);
        showHud(`تكرار المقطع (${formatTime(loopA)} - ${formatTime(currentTime)})`);
      }
    } else {
      setLoopA(null);
      setLoopB(null);
      showHud("إيقاف تكرار A-B");
    }
  };

  const handleSnapshot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      toast.error("الفيديو غير جاهز لالتقاط صورة بعد");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const snapName = `${baseName}-frame-${Math.floor(currentTime)}s.png`;

      // Support Android Native bridge if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = typeof window !== "undefined" ? (window as any).LocalDockAndroid : null;
      if (bridge && typeof bridge.saveBlob === "function") {
        bridge.saveBlob(dataUrl, snapName, "image/png");
        showHud("تم حفظ لقطة الشاشة في التنزيلات");
        return;
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = snapName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showHud("تم التقاط وحفظ الصورة");
    } catch {
      toast.error("تعذر التقاط صورة من هذا الفيديو");
    }
  };

  const handleSubtitleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const txt = decodeTextSmart(buf);
      const parsed = parseSubtitles(txt);
      if (parsed.length === 0) {
        toast.error("لم يتم العثور على نصوص ترجمة صالحة في الملف");
        return;
      }
      setSubCues(parsed);
      setSubName(file.name);
      setSubEnabled(true);
      showHud(`تم تحميل الترجمة (${parsed.length} سطر)`);
    } catch {
      toast.error("تعذر قراءة ملف الترجمة");
    } finally {
      e.target.value = "";
    }
  };

  // Touch gestures handler
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isLocked) {
      setShowUnlockPill(true);
      if (unlockPillTimerRef.current) clearTimeout(unlockPillTimerRef.current);
      unlockPillTimerRef.current = setTimeout(() => setShowUnlockPill(false), 3000);
      return;
    }
    onUserActivity();

    if (e.touches.length === 2) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      const dt = now - lastTapRef.current.time;

      if (dt < 280 && Math.abs(t.clientX - lastTapRef.current.x) < 90) {
        // Double tap: left third -> -10s, right third -> +10s, center -> play/pause or reset zoom
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        const w = e.currentTarget.clientWidth;
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          showHud("100%");
        } else if (t.clientX < w * 0.36) {
          seek(-10);
        } else if (t.clientX > w * 0.64) {
          seek(10);
        } else {
          togglePlay();
        }
        lastTapRef.current = { time: 0, x: 0 };
        return;
      }

      lastTapRef.current = { time: now, x: t.clientX };

      touchStartRef.current = {
        x: t.clientX,
        y: t.clientY,
        time: now,
        vol: volume,
        bright: brightness,
        curTime: currentTime,
        mode: zoom > 1 ? "pan" : "none",
      };

      // Long press for 2x speed
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) {
          prevRateRef.current = videoRef.current.playbackRate;
          videoRef.current.playbackRate = 2.0;
          setSpeedBoostActive(true);
        }
      }, 480);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isLocked) return;

    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchDistRef.current;
      setZoom((z) => {
        const next = Math.min(4, Math.max(1, +(z * scale).toFixed(2)));
        showHud(`${Math.round(next * 100)}%`);
        return next;
      });
      pinchDistRef.current = dist;
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current && !speedBoostActive) {
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      if (touchStartRef.current.mode === "pan" && zoom > 1) {
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        touchStartRef.current.x = t.clientX;
        touchStartRef.current.y = t.clientY;
        return;
      }

      if (touchStartRef.current.mode === "none") {
        if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          touchStartRef.current.mode = "seek";
        } else if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          const w = e.currentTarget.clientWidth;
          touchStartRef.current.mode =
            touchStartRef.current.x < w / 2 ? "brightness" : "volume";
        }
      }

      const mode = touchStartRef.current.mode;
      if (mode === "brightness") {
        const delta = -dy / 220;
        const nextB = Math.max(0.25, Math.min(1.6, touchStartRef.current.bright + delta));
        setBrightness(nextB);
        showHud(`السطوع: ${Math.round(nextB * 100)}%`);
      } else if (mode === "volume") {
        const delta = -dy / 220;
        const nextV = Math.max(0, Math.min(1, touchStartRef.current.vol + delta));
        setVolume(nextV);
        setIsMuted(nextV === 0);
        if (videoRef.current) {
          videoRef.current.volume = nextV;
          videoRef.current.muted = nextV === 0;
        }
        showHud(`الصوت: ${Math.round(nextV * 100)}%`);
      } else if (mode === "seek" && videoRef.current && duration > 0) {
        const seekDelta = (dx / e.currentTarget.clientWidth) * Math.min(duration, 120);
        const target = Math.max(0, Math.min(duration, touchStartRef.current.curTime + seekDelta));
        videoRef.current.currentTime = target;
        setCurrentTime(target);
        const sign = seekDelta >= 0 ? "+" : "";
        showHud(`${formatTime(target)} (${sign}${Math.round(seekDelta)}s)`);
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (speedBoostActive && videoRef.current) {
      videoRef.current.playbackRate = prevRateRef.current;
      setSpeedBoostActive(false);
    }
    pinchDistRef.current = null;
    touchStartRef.current = null;
  };

  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden bg-black select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseMove={onUserActivity}
    >
      {/* Hidden subtitle picker */}
      <input
        ref={subInputRef}
        type="file"
        accept=".srt,.vtt,.sub,.txt"
        className="hidden"
        onChange={handleSubtitleFile}
      />

      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        playsInline
        loop={isLooping}
        onClick={() => {
          if (isLocked) {
            setShowUnlockPill(true);
            return;
          }
          togglePlay();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          if (Math.floor(t) % 3 === 0 && t > 1) {
            try {
              localStorage.setItem(`localdock.video.${storageKey}`, String(t));
            } catch {}
          }
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(d);
          try {
            const saved = localStorage.getItem(`localdock.video.${storageKey}`);
            if (saved) {
              const t = parseFloat(saved);
              if (t > 2 && t < d - 3) {
                e.currentTarget.currentTime = t;
                showHud(`▶️ استكمال من ${formatTime(t)}`, 1800);
              }
            }
          } catch {}
          e.currentTarget.play().catch(() => {});
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (autoNext && onNext) {
            onNext();
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setMediaError("ترميز هذا الفيديو غير مدعوم مباشرة في عارض النظام الحالي.");
        }}
        style={{
          filter: `brightness(${brightness})`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${videoRotation}deg)`,
          objectFit:
            fitMode === "contain" || fitMode === "16:9" || fitMode === "4:3"
              ? "contain"
              : fitMode === "cover"
              ? "cover"
              : "fill",
          aspectRatio:
            fitMode === "16:9" ? "16 / 9" : fitMode === "4:3" ? "4 / 3" : undefined,
        }}
        className={cn(
          "transition-transform duration-75",
          fitMode === "16:9" || fitMode === "4:3"
            ? "max-h-full max-w-full"
            : "h-full w-full"
        )}
      />

      {/* Speed Boost 2.0x Pill */}
      {speedBoostActive && (
        <div className="pointer-events-none absolute top-14 left-1/2 z-40 -translate-x-1/2 animate-pulse rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-bold text-black shadow-lg">
          سرعة مضاعفة 2.0x
        </div>
      )}

      {/* Codec Error Fallback */}
      {mediaError && (
        <div
          dir="rtl"
          className="absolute inset-x-4 top-1/2 z-40 mx-auto max-w-md -translate-y-1/2 rounded-2xl border border-rose-500/30 bg-black/90 p-5 text-center text-white shadow-2xl backdrop-blur-md"
        >
          <p className="mb-2 text-sm font-semibold text-rose-300">{mediaError}</p>
          <p className="mb-4 text-xs text-white/65">
            قد يحتوي هذا الملف على ترميز خاص (مثل HEVC 10-bit أو AC3). يمكنك فتحه في نافذة خارجية أو تحميله.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => {
              setMediaError(null);
              videoRef.current?.load();
              videoRef.current?.play().catch(() => {});
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* Center HUD Indicator */}
      {hudMessage && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-black/80 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md">
          {hudMessage}
        </div>
      )}

      {/* Subtitle Overlay */}
      {subEnabled && activeSubText && (
        <div
          className={cn(
            "pointer-events-none absolute right-4 left-4 z-30 flex justify-center text-center transition-all",
            showControls && !isLocked ? "bottom-28" : "bottom-8"
          )}
        >
          <div
            dir="auto"
            className="max-w-2xl rounded-xl bg-black/75 px-4 py-1.5 text-sm font-medium leading-relaxed text-white shadow-lg backdrop-blur-xs sm:text-base md:text-lg"
          >
            {activeSubText.split("\n").map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Screen Floating Unlock Button */}
      {isLocked && showUnlockPill && (
        <button
          type="button"
          onClick={() => {
            setIsLocked(false);
            setShowUnlockPill(false);
            showHud("تم فتح قفل الشاشة");
          }}
          className="absolute bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/50 bg-black/85 px-5 py-2.5 text-sm font-semibold text-amber-300 shadow-2xl backdrop-blur-md active:scale-95"
        >
          <Unlock className="size-4" />
          <span>إلغاء قفل اللمس</span>
        </button>
      )}

      {/* Main Bottom Video Controls */}
      {!isLocked && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-10 transition-opacity duration-300 sm:p-4",
            !showControls && isPlaying && "pointer-events-none opacity-0"
          )}
        >
          {/* Progress Bar with A-B Loop markers */}
          <div className=" flex items-center gap-2.5 text-xs text-white/90">
            <span className="w-11 text-right font-mono text-[11px]">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex flex-1 items-center">
              {loopA !== null && duration > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 z-10 h-3 w-1 -translate-y-1/2 rounded-full bg-amber-400"
                  style={{ left: `${(loopA / duration) * 100}%` }}
                  title={`A: ${formatTime(loopA)}`}
                />
              )}
              {loopB !== null && duration > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 z-10 h-3 w-1 -translate-y-1/2 rounded-full bg-emerald-400"
                  style={{ left: `${(loopB / duration) * 100}%` }}
                  title={`B: ${formatTime(loopB)}`}
                />
              )}
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/25 accent-primary hover:h-2 transition-all"
              />
            </div>
            <span className="w-11 font-mono text-[11px]">{formatTime(duration)}</span>
          </div>

          {/* Primary & Pro Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-white">
            {/* Left group: Play, Prev/Next, Seek, Volume */}
            <div className="flex items-center gap-1">
              {onPrev && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-white hover:bg-white/20"
                  onClick={onPrev}
                  title="الفيديو السابق"
                >
                  <SkipBack className="size-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={togglePlay}
                title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              {onNext && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-white hover:bg-white/20"
                  onClick={onNext}
                  title="الفيديو التالي"
                >
                  <SkipForward className="size-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={() => seek(-10)}
                title="-10 ثوانٍ"
              >
                <Rewind className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={() => seek(10)}
                title="+10 ثوانٍ"
              >
                <FastForward className="size-4" />
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => {
                    const nextMute = !isMuted;
                    setIsMuted(nextMute);
                    if (videoRef.current) videoRef.current.muted = nextMute;
                  }}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="size-4 text-rose-400" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    setIsMuted(val === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = val;
                      videoRef.current.muted = val === 0;
                    }
                  }}
                  className="hidden sm:block w-16 h-1 cursor-pointer appearance-none rounded-lg bg-white/30 accent-primary"
                />
              </div>
            </div>

            {/* Right group: Pro tools */}
            <div className="flex flex-wrap items-center gap-1">
              {/* Lock Touch */}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white/90 hover:bg-white/20"
                onClick={() => {
                  setIsLocked(true);
                  setShowUnlockPill(true);
                  showHud("تم قفل اللمس");
                }}
                title="قفل الشاشة واللمس"
              >
                <Lock className="size-3.5" />
              </Button>

              {/* Speed */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 font-mono text-xs text-white hover:bg-white/20"
                onClick={cycleSpeed}
                title="سرعة التشغيل"
              >
                {playbackRate}x
              </Button>

              {/* Aspect / Fit mode */}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={cycleFitMode}
                title="تغيير أبعاد العرض (Fit / Fill / Stretch)"
              >
                <Scaling className="size-3.5" />
              </Button>

              {/* Rotate / Landscape */}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={handleRotateScreen}
                title="تدوير العرض / الوضع الأفقي"
              >
                <Smartphone className="size-3.5" />
              </Button>

              {/* Zoom Reset if zoomed */}
              {zoom > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5 text-[11px] text-amber-300 hover:bg-white/20"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <ZoomIn className="mr-1 size-3" />
                  {Math.round(zoom * 100)}%
                </Button>
              )}

              {/* A-B Loop */}
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 px-2 text-[11px] text-white hover:bg-white/20",
                  (loopA !== null || loopB !== null) && "bg-amber-500/30 text-amber-300"
                )}
                onClick={handleToggleABLoop}
                title="تكرار مقطع A-B"
              >
                {loopA === null ? "A-B" : loopB === null ? "A.." : "A-B تكرار"}
              </Button>

              {/* Loop video */}
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "text-white hover:bg-white/20",
                  isLooping && "bg-primary/30 text-primary-foreground"
                )}
                onClick={() => {
                  setIsLooping((l) => !l);
                  showHud(!isLooping ? "تكرار الفيديو: مفعّل" : "تكرار الفيديو: معطّل");
                }}
                title="تكرار الفيديو"
              >
                <Repeat className="size-3.5" />
              </Button>

              {/* Subtitles (.srt / .vtt) */}
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "text-white hover:bg-white/20",
                  subCues.length > 0 && subEnabled && "bg-sky-500/30 text-sky-300"
                )}
                onClick={() => {
                  if (subCues.length > 0) {
                    setSubEnabled((s) => !s);
                    showHud(!subEnabled ? `إظهار الترجمة (${subName})` : "إخفاء الترجمة");
                  } else {
                    subInputRef.current?.click();
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  subInputRef.current?.click();
                }}
                title="ملف الترجمة (.srt / .vtt) — انقر لتحميل أو تفعيل الترجمة"
              >
                <Captions className="size-4" />
              </Button>

              {/* Snapshot */}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={handleSnapshot}
                title="التقاط صورة من الفيديو (Snapshot)"
              >
                <Camera className="size-3.5" />
              </Button>

              {/* Brightness reset / boost */}
              <Button
                size="icon"
                variant="ghost"
                className="hidden sm:inline-flex text-white hover:bg-white/20"
                onClick={() => {
                  const next = brightness >= 1.3 ? 0.7 : brightness < 1 ? 1 : 1.35;
                  setBrightness(next);
                  showHud(`السطوع: ${Math.round(next * 100)}%`);
                }}
                title="تغيير السطوع"
              >
                <Sun className="size-3.5" />
              </Button>

              {/* PiP */}
              <Button
                size="icon"
                variant="ghost"
                className="hidden sm:inline-flex text-white hover:bg-white/20"
                onClick={() => {
                  if (!videoRef.current) return;
                  if (document.pictureInPictureElement) {
                    document.exitPictureInPicture().catch(() => {});
                  } else {
                    videoRef.current.requestPictureInPicture?.().catch(() => {});
                  }
                }}
                title="صورة داخل صورة (PiP)"
              >
                <PictureInPicture2 className="size-3.5" />
              </Button>

              {/* Fullscreen */}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-white hover:bg-white/20"
                onClick={onToggleFullscreen}
                title="ملء الشاشة"
              >
                {isFullscreen ? (
                  <Minimize className="size-4" />
                ) : (
                  <Maximize className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  if (!sec || Number.isNaN(sec) || !Number.isFinite(sec)) return "00:00";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
