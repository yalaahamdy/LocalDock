"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Grid,
  Info,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, formatDateTime } from "@/lib/localdock/client/format";
import { toast } from "sonner";

export interface ProImageViewerProps {
  src: string;
  fileName: string;
  fileSize: number;
  modifiedAt: number;
  showControls: boolean;
  onUserActivity: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasMultiple?: boolean;
}

export function ProImageViewer({
  src,
  fileName,
  fileSize,
  modifiedAt,
  showControls,
  onUserActivity,
  onNext,
  onPrev,
  hasMultiple = false,
}: ProImageViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [backdropMode, setBackdropMode] = useState<"dark" | "checker" | "light">("dark");

  // Live Filters
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [grayscale, setGrayscale] = useState(false);
  const [invert, setInvert] = useState(false);
  const [sepia, setSepia] = useState(false);

  // Info panel & Natural Dimensions
  const [showInfo, setShowInfo] = useState(false);
  const [naturalDim, setNaturalDim] = useState<{ w: number; h: number } | null>(null);

  // Slideshow
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowIntervalSec, setSlideshowIntervalSec] = useState(4);

  // Touch / Mouse drag & pinch
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Reset transforms on image change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setNaturalDim(null);
  }, [src]);

  // Slideshow timer
  useEffect(() => {
    if (!slideshowActive || !onNext) return;
    const id = setInterval(() => {
      onNext();
    }, slideshowIntervalSec * 1000);
    return () => clearInterval(id);
  }, [slideshowActive, slideshowIntervalSec, onNext]);

  const filterCss = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
    grayscale ? "grayscale(100%)" : "",
    invert ? "invert(100%)" : "",
    sepia ? "sepia(85%)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hasCustomFilters =
    brightness !== 100 ||
    contrast !== 100 ||
    saturate !== 100 ||
    grayscale ||
    invert ||
    sepia ||
    rotation !== 0 ||
    flipH ||
    flipV;

  const resetAll = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setGrayscale(false);
    setInvert(false);
    setSepia(false);
  };

  const handleSaveEditedImage = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    try {
      const rot = ((rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? img.naturalHeight : img.naturalWidth;
      canvas.height = swap ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.filter = filterCss;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const dataUrl = canvas.toDataURL("image/png");
      const outName = `${fileName.replace(/\.[^.]+$/, "")}-edited.png`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = typeof window !== "undefined" ? (window as any).LocalDockAndroid : null;
      if (bridge && typeof bridge.saveBlob === "function") {
        bridge.saveBlob(dataUrl, outName, "image/png");
        toast.success("تم حفظ الصورة المعدلة في التنزيلات");
        return;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("تم تصدير الصورة المعدلة بنجاح");
    } catch {
      toast.error("تعذر تصدير الصورة المعدلة");
    }
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    onUserActivity();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else {
          setZoom(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (zoom > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: t.clientX - pan.x, y: t.clientY - pan.y };
      } else {
        swipeStartRef.current = { x: t.clientX, y: t.clientY, time: now };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchDistRef.current;
      setZoom((z) => {
        const next = Math.min(8, Math.max(0.5, +(z * scale).toFixed(2)));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
      pinchDistRef.current = dist;
    } else if (e.touches.length === 1 && isDragging && zoom > 1) {
      const t = e.touches[0];
      setPan({
        x: t.clientX - dragStartRef.current.x,
        y: t.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    pinchDistRef.current = null;
    setIsDragging(false);
    if (zoom <= 1 && swipeStartRef.current && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartRef.current.x;
      const dy = t.clientY - swipeStartRef.current.y;
      const dt = Date.now() - swipeStartRef.current.time;
      if (dt < 500 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        if (dx < 0 && onNext) onNext();
        if (dx > 0 && onPrev) onPrev();
      }
    }
    swipeStartRef.current = null;
  };

  return (
    <div
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden select-none",
        backdropMode === "dark" && "bg-black/90",
        backdropMode === "light" && "bg-zinc-100",
        backdropMode === "checker" &&
          "bg-[linear-gradient(45deg,#27272a_25%,transparent_25%),linear-gradient(-45deg,#27272a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#27272a_75%),linear-gradient(-45deg,transparent_75%,#27272a_75%)] bg-[size:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] bg-zinc-900"
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseMove={(e) => {
        onUserActivity();
        if (isDragging && zoom > 1) {
          setPan({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y,
          });
        }
      }}
      onMouseDown={(e) => {
        if (zoom > 1) {
          setIsDragging(true);
          dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onWheel={(e) => {
        if (e.ctrlKey || zoom > 1 || Math.abs(e.deltaY) > 0) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.2 : -0.2;
          setZoom((z) => {
            const next = Math.min(8, Math.max(0.25, +(z + delta).toFixed(2)));
            if (next <= 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={fileName}
        draggable={false}
        onLoad={(e) => {
          setNaturalDim({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          });
        }}
        onDoubleClick={() => {
          if (zoom > 1) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          } else {
            setZoom(2.5);
          }
        }}
        style={{
          filter: filterCss,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${
            flipH ? -1 : 1
          }) scaleY(${flipV ? -1 : 1})`,
          cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
        }}
        className="max-h-full max-w-full object-contain transition-transform duration-75"
      />

      {/* Slideshow active badge */}
      {slideshowActive && (
        <div className="absolute top-14 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/40 bg-black/80 px-4 py-1.5 text-xs font-medium text-emerald-300 shadow-lg backdrop-blur-md">
          <span className="size-2 animate-ping rounded-full bg-emerald-400" />
          <span>عرض الشرائح التلقائي ({slideshowIntervalSec} ثوانٍ)</span>
          <button
            type="button"
            onClick={() => setSlideshowIntervalSec((s) => (s === 3 ? 5 : s === 5 ? 8 : 3))}
            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white hover:bg-white/20"
          >
            تغيير السرعة
          </button>
        </div>
      )}

      {/* Image Details / EXIF Info Floating Card */}
      {showInfo && (
        <div
          dir="rtl"
          className="absolute top-14 left-4 z-30 w-72 rounded-2xl border border-white/15 bg-black/85 p-4 text-xs text-white shadow-2xl backdrop-blur-md"
        >
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 font-semibold">
            <span className="flex items-center gap-1.5">
              <Info className="size-4 text-sky-400" /> تفاصيل الصورة
            </span>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-1.5 text-white/85">
            <div className="flex justify-between gap-2">
              <span className="text-white/50">الاسم:</span>
              <span className="truncate font-medium" dir="ltr">
                {fileName}
              </span>
            </div>
            {naturalDim && (
              <>
                <div className="flex justify-between">
                  <span className="text-white/50">الأبعاد الحقيقية:</span>
                  <span className="font-mono" dir="ltr">
                    {naturalDim.w} × {naturalDim.h} px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">الدقة (Megapixels):</span>
                  <span className="font-mono" dir="ltr">
                    {((naturalDim.w * naturalDim.h) / 1_000_000).toFixed(2)} MP
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-white/50">الحجم:</span>
              <span className="font-mono" dir="ltr">
                {formatBytes(fileSize)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">التعديل:</span>
              <span dir="ltr">{formatDateTime(modifiedAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Filters Popover Panel */}
      {showFilterPanel && (
        <div
          dir="rtl"
          className="absolute bottom-20 left-1/2 z-30 w-80 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/90 p-4 text-xs text-white shadow-2xl backdrop-blur-md"
        >
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <span className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="size-4 text-amber-400" /> استوديو تحسين وفلاتر الصورة
            </span>
            <button
              type="button"
              onClick={resetAll}
              className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-white/20"
            >
              إعادة ضبط
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-16 text-white/75">السطوع</span>
              <input
                type="range"
                min={30}
                max={200}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="h-1.5 flex-1 accent-primary"
              />
              <span className="w-9 text-left font-mono text-[11px]">{brightness}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-white/75">التباين</span>
              <input
                type="range"
                min={30}
                max={200}
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="h-1.5 flex-1 accent-primary"
              />
              <span className="w-9 text-left font-mono text-[11px]">{contrast}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-white/75">التشبع</span>
              <input
                type="range"
                min={0}
                max={250}
                value={saturate}
                onChange={(e) => setSaturate(Number(e.target.value))}
                className="h-1.5 flex-1 accent-primary"
              />
              <span className="w-9 text-left font-mono text-[11px]">{saturate}%</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setGrayscale((g) => !g)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                  grayscale
                    ? "border-primary bg-primary/30 text-white"
                    : "border-white/15 bg-white/5 text-white/75"
                )}
              >
                أبيض وأسود
              </button>
              <button
                type="button"
                onClick={() => setSepia((s) => !s)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                  sepia
                    ? "border-amber-400 bg-amber-500/30 text-amber-200"
                    : "border-white/15 bg-white/5 text-white/75"
                )}
              >
                دافئ (Sepia)
              </button>
              <button
                type="button"
                onClick={() => setInvert((v) => !v)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                  invert
                    ? "border-sky-400 bg-sky-500/30 text-sky-200"
                    : "border-white/15 bg-white/5 text-white/75"
                )}
              >
                عكس الألوان (Invert)
              </button>
            </div>

            {hasCustomFilters && (
              <Button
                size="sm"
                className="mt-2 w-full gap-1.5 text-xs"
                onClick={handleSaveEditedImage}
              >
                <Download className="size-3.5" />
                حفظ نسخة بالتعديلات والفلاتر
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Toolbar */}
      <div
        className={cn(
          "absolute bottom-4 left-1/2 z-20 flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/15 bg-black/80 px-2.5 py-1.5 text-white shadow-2xl backdrop-blur-md transition-opacity duration-300",
          !showControls && "pointer-events-none opacity-0"
        )}
      >
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={() => {
            setZoom((z) => {
              const n = Math.max(0.25, +(z - 0.25).toFixed(2));
              if (n <= 1) setPan({ x: 0, y: 0 });
              return n;
            });
          }}
          title="تصغير"
        >
          <Minus className="size-4" />
        </Button>

        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="min-w-12 px-1 text-center font-mono text-xs font-semibold hover:text-primary"
          title="إعادة التكبير إلى 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={() => setZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)))}
          title="تكبير (حتى 800%)"
        >
          <Plus className="size-4" />
        </Button>

        <div className="mx-0.5 h-4 w-px bg-white/20" />

        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={() => setRotation((r) => r - 90)}
          title="تدوير لليسار 90°"
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={() => setRotation((r) => r + 90)}
          title="تدوير لليمين 90°"
        >
          <RotateCw className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn("text-white hover:bg-white/20", flipH && "bg-white/20 text-sky-300")}
          onClick={() => setFlipH((f) => !f)}
          title="قلب أفقي (Mirror)"
        >
          <FlipHorizontal2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn("text-white hover:bg-white/20", flipV && "bg-white/20 text-sky-300")}
          onClick={() => setFlipV((f) => !f)}
          title="قلب عمودي"
        >
          <FlipVertical2 className="size-4" />
        </Button>

        <div className="mx-0.5 h-4 w-px bg-white/20" />

        {/* Filters studio toggle */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "text-white hover:bg-white/20",
            (showFilterPanel || hasCustomFilters) && "bg-amber-500/30 text-amber-300"
          )}
          onClick={() => setShowFilterPanel((s) => !s)}
          title="فلاتر وتحسين الصورة"
        >
          <SlidersHorizontal className="size-4" />
        </Button>

        {/* Backdrop toggle for transparent PNG/SVG */}
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={() =>
            setBackdropMode((m) =>
              m === "dark" ? "checker" : m === "checker" ? "light" : "dark"
            )
          }
          title="تغيير خلفية الشفافية (داكن / شبكي / فاتح)"
        >
          <Grid className="size-4" />
        </Button>

        {/* Slideshow toggle */}
        {hasMultiple && onNext && (
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "text-white hover:bg-white/20",
              slideshowActive && "bg-emerald-500/30 text-emerald-300"
            )}
            onClick={() => setSlideshowActive((s) => !s)}
            title={slideshowActive ? "إيقاف العرض التلقائي" : "تشغيل عرض الشرائح التلقائي"}
          >
            {slideshowActive ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        )}

        {/* Info toggle */}
        <Button
          size="icon"
          variant="ghost"
          className={cn("text-white hover:bg-white/20", showInfo && "bg-sky-500/30 text-sky-300")}
          onClick={() => setShowInfo((s) => !s)}
          title="تفاصيل وأبعاد الصورة"
        >
          <Info className="size-4" />
        </Button>

        {hasCustomFilters && (
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={resetAll}
            title="إعادة ضبط العرض"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
