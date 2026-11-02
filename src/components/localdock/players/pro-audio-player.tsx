"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Activity,
  FastForward,
  ListMusic,
  Moon,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/localdock/client/format";

export type EqPreset = "flat" | "bass" | "vocal" | "treble";
export type VisualizerStyle = "bars" | "wave" | "circle";

export interface AudioTrackItem {
  name: string;
  size: number;
  rel: string;
}

export interface ProAudioPlayerProps {
  src: string;
  fileName: string;
  fileSize: number;
  storageKey: string;
  tracks?: AudioTrackItem[];
  currentRel?: string;
  onSelectTrack?: (rel: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
}

const EQ_PRESETS: Record<EqPreset, { label: string; bass: number; mid: number; treble: number }> = {
  flat: { label: "طبيعي (Flat)", bass: 0, mid: 0, treble: 0 },
  bass: { label: "تعزيز الباس (Bass)", bass: 8, mid: 0, treble: 2 },
  vocal: { label: "صوت وبودكاست (Vocal)", bass: -3, mid: 6, treble: 3 },
  treble: { label: "نقاء عالي (Crystal)", bass: 1, mid: 2, treble: 8 },
};

export function ProAudioPlayer({
  src,
  fileName,
  fileSize,
  storageKey,
  tracks = [],
  currentRel,
  onSelectTrack,
  onNext,
  onPrev,
}: ProAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Playback modes
  const [repeatMode, setRepeatMode] = useState<"all" | "one" | "off">("all");
  const [shuffle, setShuffle] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  // Visualizer & Equalizer
  const [visStyle, setVisStyle] = useState<VisualizerStyle>("bars");
  const [eqPreset, setEqPreset] = useState<EqPreset>("flat");
  const [showPlaylist, setShowPlaylist] = useState(false);

  // Sleep Timer (minutes remaining)
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  // Web Audio API refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceConnectedRef = useRef<boolean>(false);
  const filtersRef = useRef<{
    bass: BiquadFilterNode;
    mid: BiquadFilterNode;
    treble: BiquadFilterNode;
  } | null>(null);

  // Setup Web Audio API safely once
  const ensureAudioGraph = useCallback(() => {
    if (sourceConnectedRef.current || !audioRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const bass = ctx.createBiquadFilter();
      bass.type = "lowshelf";
      bass.frequency.value = 180;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1200;
      mid.Q.value = 1;

      const treble = ctx.createBiquadFilter();
      treble.type = "highshelf";
      treble.frequency.value = 4500;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;

      source.connect(bass);
      bass.connect(mid);
      mid.connect(treble);
      treble.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      filtersRef.current = { bass, mid, treble };
      sourceConnectedRef.current = true;
    } catch {
      // Fallback if Web Audio API fails
    }
  }, []);

  // Apply Equalizer Preset
  useEffect(() => {
    if (!filtersRef.current) return;
    const p = EQ_PRESETS[eqPreset];
    filtersRef.current.bass.gain.value = p.bass;
    filtersRef.current.mid.gain.value = p.mid;
    filtersRef.current.treble.gain.value = p.treble;
  }, [eqPreset]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Sleep Timer countdown
  useEffect(() => {
    if (sleepMinutes === null) {
      setSleepRemainingSec(null);
      return;
    }
    setSleepRemainingSec(sleepMinutes * 60);
    const id = setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          audioRef.current?.pause();
          setIsPlaying(false);
          setSleepMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sleepMinutes]);

  // MediaSession API for Lock Screen & Notification controls
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: fileName.replace(/\.[^.]+$/, ""),
        artist: "LocalDock Audio Studio",
        album: "Local Cloud / Device",
      });
      navigator.mediaSession.setActionHandler("play", () => {
        audioRef.current?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
        }
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.min(
            audioRef.current.duration || 0,
            audioRef.current.currentTime + 10
          );
        }
      });
      navigator.mediaSession.setActionHandler("previoustrack", onPrev ? () => onPrev() : null);
      navigator.mediaSession.setActionHandler("nexttrack", onNext ? () => onNext() : null);
    } catch {}
  }, [fileName, onNext, onPrev]);

  // Visualizer Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (analyserRef.current && isPlaying) {
        analyserRef.current.getByteFrequencyData(dataArray);
      } else if (isPlaying) {
        // Synthetic fallback wave if AudioContext isn't active
        phase += 0.08;
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.floor(80 + 60 * Math.sin(phase + i * 0.25));
        }
      } else {
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.max(6, Math.floor(dataArray[i] * 0.88));
        }
      }

      if (visStyle === "bars") {
        const barCount = 40;
        const gap = 4;
        const barWidth = (w - gap * (barCount - 1)) / barCount;
        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i] || 8;
          const barHeight = Math.max(6, (val / 255) * (h * 0.85));
          const x = i * (barWidth + gap);
          const y = h - barHeight;
          const grad = ctx.createLinearGradient(0, y, 0, h);
          grad.addColorStop(0, "#2dd4bf");
          grad.addColorStop(1, "#0f766e");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 4);
          ctx.fill();
        }
      } else if (visStyle === "wave") {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#2dd4bf";
        ctx.beginPath();
        const slice = w / (bufferLength - 1);
        for (let i = 0; i < bufferLength; i++) {
          const v = (dataArray[i] || 128) / 255;
          const y = h / 2 + (v - 0.35) * (h * 0.65) * Math.sin(i * 0.3 + phase);
          const x = i * slice;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // Circle pulse
        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.min(w, h) * 0.24;
        const avg =
          dataArray.slice(0, 20).reduce((acc, v) => acc + v, 0) / 20 / 255;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR + avg * 24, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(45, 212, 191, 0.14)";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#2dd4bf";
        ctx.stroke();

        const rays = 36;
        for (let i = 0; i < rays; i++) {
          const angle = (i / rays) * Math.PI * 2;
          const amp = ((dataArray[i] || 10) / 255) * 32;
          const x1 = cx + Math.cos(angle) * (baseR + 4);
          const y1 = cy + Math.sin(angle) * (baseR + 4);
          const x2 = cx + Math.cos(angle) * (baseR + 8 + amp);
          const y2 = cy + Math.sin(angle) * (baseR + 8 + amp);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, visStyle]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (a.paused) {
      a.play().catch(() => {});
      setIsPlaying(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  const seek = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
    a.currentTime = next;
    setCurrentTime(next);
  };

  const handleTrackEnded = () => {
    if (repeatMode === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }
    if (shuffle && tracks.length > 1 && onSelectTrack) {
      const others = tracks.filter((t) => t.rel !== currentRel);
      const pick = others[Math.floor(Math.random() * others.length)];
      if (pick) {
        onSelectTrack(pick.rel);
        return;
      }
    }
    if (repeatMode === "all" && onNext) {
      onNext();
      return;
    }
    setIsPlaying(false);
  };

  return (
    <div className="flex size-full flex-col items-center justify-between overflow-y-auto bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-4 text-white select-none sm:p-6">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => {
          ensureAudioGraph();
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          if (loopA !== null && loopB !== null && t >= loopB) {
            e.currentTarget.currentTime = loopA;
          }
          if (Math.floor(t) % 3 === 0 && t > 1) {
            try {
              localStorage.setItem(`localdock.audio.${storageKey}`, String(t));
            } catch {}
          }
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(d);
          try {
            const saved = localStorage.getItem(`localdock.audio.${storageKey}`);
            if (saved) {
              const t = parseFloat(saved);
              if (t > 2 && t < d - 3) e.currentTarget.currentTime = t;
            }
          } catch {}
          e.currentTarget.play().catch(() => {});
        }}
        onEnded={handleTrackEnded}
      />

      {/* Top Pills: Equalizer, Visualizer Style, Sleep Timer, Playlist */}
      <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const order: EqPreset[] = ["flat", "bass", "vocal", "treble"];
              setEqPreset(order[(order.indexOf(eqPreset) + 1) % order.length]);
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-teal-300 hover:bg-white/10"
          >
            <Sliders className="size-3.5" />
            <span>{EQ_PRESETS[eqPreset].label}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const styles: VisualizerStyle[] = ["bars", "wave", "circle"];
              setVisStyle(styles[(styles.indexOf(visStyle) + 1) % styles.length]);
            }}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            <Activity className="size-3.5 text-sky-400" />
            <span>
              {visStyle === "bars" ? "طيف" : visStyle === "wave" ? "موجة" : "نبض"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const opts = [null, 15, 30, 60];
              const idx = opts.indexOf(sleepMinutes);
              setSleepMinutes(opts[(idx + 1) % opts.length]);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              sleepMinutes
                ? "border-amber-400/40 bg-amber-500/20 text-amber-300"
                : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
            )}
          >
            <Moon className="size-3.5" />
            <span>
              {sleepRemainingSec !== null
                ? `${Math.ceil(sleepRemainingSec / 60)} د`
                : "مؤقت النوم"}
            </span>
          </button>
        </div>

        {tracks.length > 1 && (
          <button
            type="button"
            onClick={() => setShowPlaylist((s) => !s)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              showPlaylist
                ? "border-primary bg-primary/30 text-white"
                : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            )}
          >
            <ListMusic className="size-3.5" />
            <span>القائمة ({tracks.length})</span>
          </button>
        )}
      </div>

      {/* Center Visualizer & Track Artwork Card */}
      <div className="my-auto flex w-full max-w-xl flex-col items-center gap-4 py-4">
        <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/50 p-4 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={520}
            height={160}
            className="h-full w-full object-contain"
          />
          {!isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 backdrop-blur-xs">
                <Music2 className="size-8" />
              </div>
            </div>
          )}
        </div>

        {/* Track Title & Meta */}
        <div className="w-full text-center">
          <h3 className="truncate px-2 text-base font-bold text-white sm:text-lg" dir="auto">
            {fileName}
          </h3>
          <p className="mt-0.5 text-xs text-white/50">
            {formatBytes(fileSize)} · سرعة {playbackRate}x
            {loopA !== null && ` · تكرار A-B مفعل`}
          </p>
        </div>

        {/* Collapsible Playlist Drawer */}
        {showPlaylist && tracks.length > 1 && (
          <div className="max-h-44 w-full overflow-y-auto rounded-2xl border border-white/10 bg-black/60 p-2">
            {tracks.map((item, idx) => {
              const active = item.rel === currentRel;
              return (
                <button
                  key={item.rel || idx}
                  type="button"
                  onClick={() => onSelectTrack?.(item.rel)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                    active
                      ? "bg-teal-500/25 font-semibold text-teal-200"
                      : "text-white/75 hover:bg-white/10"
                  )}
                >
                  <span className="truncate" dir="auto">
                    {idx + 1}. {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/45">
                    {formatBytes(item.size)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Audio Controls */}
      <div className="w-full max-w-xl space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        {/* Seek bar */}
        <div className="flex items-center gap-3 text-xs text-white/80">
          <span className="w-10 text-right font-mono text-[11px]">
            {formatAudioTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setCurrentTime(v);
              if (audioRef.current) audioRef.current.currentTime = v;
            }}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-white/25 accent-teal-400"
          />
          <span className="w-10 font-mono text-[11px]">{formatAudioTime(duration)}</span>
        </div>

        {/* Transport buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Shuffle & Repeat */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "text-white/75 hover:bg-white/15",
                shuffle && "bg-teal-500/25 text-teal-300"
              )}
              onClick={() => setShuffle((s) => !s)}
              title="تشغيل عشوائي (Shuffle)"
            >
              <Shuffle className="size-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "text-white/75 hover:bg-white/15",
                repeatMode !== "off" && "bg-teal-500/25 text-teal-300"
              )}
              onClick={() =>
                setRepeatMode((m) => (m === "all" ? "one" : m === "one" ? "off" : "all"))
              }
              title={
                repeatMode === "all"
                  ? "تكرار القائمة"
                  : repeatMode === "one"
                  ? "تكرار الملف الحالي"
                  : "بدون تكرار"
              }
            >
              {repeatMode === "one" ? (
                <Repeat1 className="size-4" />
              ) : (
                <Repeat className="size-4" />
              )}
            </Button>

            {/* A-B Loop */}
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 px-2 text-[11px] text-white/80 hover:bg-white/15",
                (loopA !== null || loopB !== null) && "bg-amber-500/25 text-amber-300"
              )}
              onClick={() => {
                if (loopA === null) setLoopA(currentTime);
                else if (loopB === null && currentTime > loopA + 0.5) setLoopB(currentTime);
                else {
                  setLoopA(null);
                  setLoopB(null);
                }
              }}
              title="تكرار مقطع A-B"
            >
              {loopA === null ? "A-B" : loopB === null ? "A.." : "A-B 🔁"}
            </Button>
          </div>

          {/* Center: Prev, -10s, Play/Pause, +10s, Next */}
          <div className="flex items-center gap-1.5">
            {onPrev && (
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/15"
                onClick={onPrev}
                title="السابق"
              >
                <SkipBack className="size-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/15"
              onClick={() => seek(-10)}
              title="-10 ثوانٍ"
            >
              <Rewind className="size-4" />
            </Button>
            <Button
              size="icon"
              className="size-11 rounded-full bg-teal-500 text-black hover:bg-teal-400"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/15"
              onClick={() => seek(10)}
              title="+10 ثوانٍ"
            >
              <FastForward className="size-4" />
            </Button>
            {onNext && (
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/15"
                onClick={onNext}
                title="التالي"
              >
                <SkipForward className="size-4" />
              </Button>
            )}
          </div>

          {/* Right: Speed & Volume */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 font-mono text-xs text-white/85 hover:bg-white/15"
              onClick={() => {
                const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
                const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length] || 1;
                setPlaybackRate(next);
                if (audioRef.current) audioRef.current.playbackRate = next;
              }}
              title="سرعة الصوت"
            >
              {playbackRate}x
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="text-white/85 hover:bg-white/15"
              onClick={() => {
                const nextMute = !isMuted;
                setIsMuted(nextMute);
                if (audioRef.current) audioRef.current.muted = nextMute;
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
                if (audioRef.current) {
                  audioRef.current.volume = val;
                  audioRef.current.muted = val === 0;
                }
              }}
              className="hidden sm:block w-16 h-1 cursor-pointer appearance-none rounded-lg bg-white/25 accent-teal-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAudioTime(sec: number): string {
  if (!sec || Number.isNaN(sec) || !Number.isFinite(sec)) return "00:00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
