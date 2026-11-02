"use client";

/**
 * LocalDock — All-in-One Pro Media & Document Preview Studio.
 * Supports both LocalDock Cloud Server files AND Local Device Storage files.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry } from "@/lib/localdock/types";
import { Api } from "@/lib/localdock/client/api";
import { getMediaToken, mediaSrc, mediaSrcSync } from "@/lib/localdock/client/media";
import { formatBytes, formatDateTime } from "@/lib/localdock/client/format";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  Loader2,
  Maximize,
  Minimize,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/localdock/i18n";
import { ProVideoPlayer } from "./players/pro-video-player";
import { ProImageViewer } from "./players/pro-image-viewer";
import { ProAudioPlayer } from "./players/pro-audio-player";
import { ProDocumentReader } from "./players/pro-document-reader";

export interface PreviewSibling {
  entry: FileEntry;
  rel: string;
  localFile?: File;
  localUrl?: string;
}

export function PreviewModal({
  shareId,
  shareName,
  entry,
  relPath,
  siblings = [],
  localFile = null,
  localUrl = null,
  onNavigate,
  onClose,
  onDownload,
}: {
  shareId: string;
  shareName: string;
  entry: FileEntry;
  relPath: string;
  siblings?: PreviewSibling[];
  localFile?: File | null;
  localUrl?: string | null;
  onNavigate?: (sibling: PreviewSibling) => void;
  onClose: () => void;
  onDownload?: () => void;
}) {
  const { t } = useI18n();
  const dlgRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string>("");
  const [hash, setHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isLocalDeviceMode = Boolean(localFile || localUrl || shareId === "__local__");

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isFullscreen) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3400);
    }
  }, [isFullscreen]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isFullscreen, resetControlsTimer]);

  // Resolve source URL (either local ObjectURL or authenticated Server mediaSrc)
  useEffect(() => {
    let cancelled = false;
    setHash(null);
    if (localUrl) {
      setSrc(localUrl);
      return;
    }
    if (localFile) {
      const u = URL.createObjectURL(localFile);
      setSrc(u);
      return () => URL.revokeObjectURL(u);
    }
    setSrc(null);
    getMediaToken(shareId)
      .then((tok) => {
        if (cancelled) return;
        setShareToken(tok);
      })
      .catch(() => {});
    mediaSrc(shareId, relPath)
      .then((resolved) => {
        if (!cancelled) setSrc(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shareId, relPath, entry, localFile, localUrl]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!dlgRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await dlgRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Sibling navigation
  const currentIndex = useMemo(
    () => siblings.findIndex((s) => s.rel === relPath),
    [siblings, relPath]
  );
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < siblings.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev && onNavigate) onNavigate(siblings[currentIndex - 1]);
  }, [hasPrev, onNavigate, siblings, currentIndex]);

  const goNext = useCallback(() => {
    if (hasNext && onNavigate) onNavigate(siblings[currentIndex + 1]);
  }, [hasNext, onNavigate, siblings, currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "f" || e.key === "F") {
        if (entry.category === "video" || entry.category === "image") {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, entry.category, toggleFullscreen]);

  // Auto-detect matching subtitle sibling (.srt / .vtt) for video
  const siblingSubtitleUrl = useMemo(() => {
    if (entry.category !== "video" || siblings.length === 0) return null;
    const baseName = entry.name.replace(/\.[^.]+$/, "").toLowerCase();
    const match = siblings.find((s) => {
      const n = s.entry.name.toLowerCase();
      return (
        (n.endsWith(".srt") || n.endsWith(".vtt")) &&
        n.replace(/\.[^.]+$/, "") === baseName
      );
    });
    if (!match) return null;
    if (match.localUrl) return match.localUrl;
    if (!isLocalDeviceMode) return mediaSrcSync(shareId, match.rel, shareToken);
    return null;
  }, [entry, siblings, shareId, shareToken, isLocalDeviceMode]);

  // Audio playlist siblings
  const audioTracks = useMemo(() => {
    if (entry.category !== "audio") return [];
    return siblings
      .filter((s) => s.entry.category === "audio")
      .map((s) => ({
        name: s.entry.name,
        size: s.entry.size,
        rel: s.rel,
      }));
  }, [entry.category, siblings]);

  async function computeHash() {
    setHashing(true);
    try {
      if (localFile) {
        const buf = await localFile.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setHash(hex);
      } else {
        const r = await Api.fileHash(shareId, relPath);
        setHash(r.sha256);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SHA-256 failed");
    } finally {
      setHashing(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        ref={dlgRef}
        showCloseButton={false}
        onMouseMove={resetControlsTimer}
        onTouchStart={resetControlsTimer}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 transition-all duration-200",
          isFullscreen
            ? "!fixed !inset-0 !top-0 !left-0 !z-50 !h-dvh !w-dvw !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 bg-black text-white"
            : "max-w-[96vw] sm:max-w-5xl h-[90dvh] rounded-2xl border bg-background shadow-2xl"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-4 py-2.5 transition-opacity duration-300 z-30",
            isFullscreen
              ? "absolute top-0 left-0 right-0 bg-gradient-to-b from-black/85 to-transparent border-transparent text-white"
              : "bg-card/90 backdrop-blur-md",
            isFullscreen && !showControls && "opacity-0 pointer-events-none"
          )}
        >
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold" dir="auto">
              {entry.name}
            </DialogTitle>
            <p
              className={cn(
                "truncate text-xs",
                isFullscreen ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {shareName} · {formatBytes(entry.size)} ·{" "}
              {formatDateTime(entry.modifiedAt)}
              {siblings.length > 1 && currentIndex >= 0 && (
                <span>
                  {" "}
                  · {currentIndex + 1} / {siblings.length}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {src && !isLocalDeviceMode && (
              <Button
                size="icon"
                variant="ghost"
                className={cn("size-8", isFullscreen && "text-white hover:bg-white/20")}
                onClick={() => window.open(src, "_blank", "noopener")}
                title={t.common.open}
              >
                <ExternalLink className="size-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className={cn("size-8", isFullscreen && "text-white hover:bg-white/20")}
              onClick={toggleFullscreen}
              title={t.preview.fitTitle}
            >
              {isFullscreen ? (
                <Minimize className="size-4" />
              ) : (
                <Maximize className="size-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn("size-8", isFullscreen && "text-white hover:bg-white/20")}
              onClick={onClose}
              aria-label={t.preview.closeAria}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Main Viewport Body */}
        <div
          className={cn(
            "relative flex flex-1 items-center justify-center overflow-hidden",
            isFullscreen ? "bg-black h-full w-full" : "bg-muted/30"
          )}
        >
          {/* Floating Left / Right Sibling Navigation Arrows */}
          {hasPrev && entry.category !== "pdf" && (
            <Button
              size="icon"
              variant="secondary"
              onClick={goPrev}
              className={cn(
                "absolute left-3 z-20 size-9 rounded-full bg-black/55 text-white hover:bg-black/80 border border-white/10 shadow-lg transition-opacity duration-300",
                !showControls && "opacity-0 pointer-events-none"
              )}
              title={t.preview.prevAria}
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}
          {hasNext && entry.category !== "pdf" && (
            <Button
              size="icon"
              variant="secondary"
              onClick={goNext}
              className={cn(
                "absolute right-3 z-20 size-9 rounded-full bg-black/55 text-white hover:bg-black/80 border border-white/10 shadow-lg transition-opacity duration-300",
                !showControls && "opacity-0 pointer-events-none"
              )}
              title={t.preview.nextAria}
            >
              <ChevronRight className="size-5" />
            </Button>
          )}

          {/* 1. Pro Image Studio */}
          {entry.category === "image" && src && (
            <ProImageViewer
              src={src}
              fileName={entry.name}
              fileSize={entry.size}
              modifiedAt={entry.modifiedAt}
              showControls={showControls}
              onUserActivity={resetControlsTimer}
              onNext={hasNext ? goNext : undefined}
              onPrev={hasPrev ? goPrev : undefined}
              hasMultiple={siblings.length > 1}
            />
          )}

          {/* 2. Pro Video Cinema Player */}
          {entry.category === "video" && src && (
            <ProVideoPlayer
              src={src}
              fileName={entry.name}
              storageKey={`${shareId}.${relPath}`}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              showControls={showControls}
              onUserActivity={resetControlsTimer}
              siblingSubtitleUrl={siblingSubtitleUrl}
              onNext={hasNext ? goNext : undefined}
              onPrev={hasPrev ? goPrev : undefined}
            />
          )}

          {/* 3. Pro Audio & Music Studio */}
          {entry.category === "audio" && src && (
            <ProAudioPlayer
              src={src}
              fileName={entry.name}
              fileSize={entry.size}
              storageKey={`${shareId}.${relPath}`}
              tracks={audioTracks}
              currentRel={relPath}
              onSelectTrack={(targetRel) => {
                const found = siblings.find((s) => s.rel === targetRel);
                if (found && onNavigate) onNavigate(found);
              }}
              onNext={hasNext ? goNext : undefined}
              onPrev={hasPrev ? goPrev : undefined}
            />
          )}

          {/* 4. Pro Document, PDF, Word (.docx), Spreadsheet (.csv) & Text/Code Studio */}
          {(entry.category === "pdf" ||
            entry.category === "text" ||
            entry.category === "code") &&
            src && (
              <ProDocumentReader
                src={src}
                fileName={entry.name}
                fileSize={entry.size}
                category={entry.category}
                localFile={localFile}
              />
            )}

          {/* 5. Other / Binary / Archive Fallback */}
          {(entry.category === "archive" ||
            entry.category === "apk" ||
            entry.category === "other") && (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-medium">
                {entry.category === "archive"
                  ? t.preview.archiveNote
                  : entry.category === "apk"
                  ? t.preview.apkNote
                  : t.preview.noPreview(entry.mimeType ?? t.preview.unknownType)}
              </p>
              {onDownload && (
                <Button size="sm" onClick={onDownload} className="mt-2 gap-1.5">
                  <Download className="size-4" />
                  {t.preview.download}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Sibling Thumbnails Strip (for image/video galleries) */}
        {!isFullscreen &&
          siblings.length > 1 &&
          (entry.category === "image" || entry.category === "video") && (
            <div className="flex items-center gap-2 overflow-x-auto border-t bg-muted/20 px-4 py-2 no-scrollbar">
              {siblings.map((s) => {
                const active = s.rel === relPath;
                const thumbUrl =
                  s.entry.category === "image"
                    ? s.localUrl ||
                      (!isLocalDeviceMode
                        ? `/api/shares/${shareId}/thumb?path=${encodeURIComponent(s.rel)}&s=96${
                            shareToken ? `&t=${shareToken}` : ""
                          }`
                        : null)
                    : null;
                return (
                  <button
                    key={s.rel}
                    type="button"
                    onClick={() => onNavigate?.(s)}
                    className={cn(
                      "group relative flex shrink-0 items-center gap-2 rounded-lg border p-1 text-xs transition-all",
                      active
                        ? "border-primary bg-primary/15 text-primary font-semibold ring-1 ring-primary"
                        : "border-border/60 bg-card hover:bg-muted text-muted-foreground"
                    )}
                  >
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt={s.entry.name}
                        loading="lazy"
                        className="size-8 rounded object-cover"
                      />
                    ) : (
                      <span className="max-w-28 truncate px-1.5 py-0.5" dir="auto">
                        {s.entry.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        {/* Footer (Hidden in Fullscreen) */}
        {!isFullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-2.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              {hash ? (
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <Fingerprint className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate max-w-[36ch]">
                    {t.preview.shaLabel}: {hash}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    onClick={() => {
                      navigator.clipboard?.writeText(hash);
                      toast.success(t.common.copy);
                    }}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  onClick={computeHash}
                  disabled={hashing}
                >
                  {hashing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Fingerprint className="size-3" />
                  )}
                  {t.preview.verifySha}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onDownload && (
                <Button size="sm" onClick={onDownload}>
                  {t.preview.download}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
