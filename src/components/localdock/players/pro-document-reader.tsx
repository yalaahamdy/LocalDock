"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlignLeft,
  AlignRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCw,
  Search,
  Square,
  Sun,
  Table as TableIcon,
  Volume2,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  classifyDocumentSubKind,
  decodeTextSmart,
  extractLegacyDocText,
  type DocumentSubKind,
} from "@/lib/localdock/client/file-classify";
import type { FileCategory } from "@/lib/localdock/types";

export type ReadingTheme = "dark" | "sepia" | "light" | "ide";

export interface ProDocumentReaderProps {
  src: string;
  fileName: string;
  fileSize: number;
  category: FileCategory;
  localFile?: File | null;
}

const THEME_CLASSES: Record<
  ReadingTheme,
  { wrap: string; bar: string; text: string; label: string }
> = {
  dark: {
    wrap: "bg-zinc-950 text-zinc-100",
    bar: "bg-zinc-900/95 border-zinc-800 text-zinc-100",
    text: "text-zinc-100",
    label: "ليلي (AMOLED)",
  },
  sepia: {
    wrap: "bg-[#f4ecd8] text-[#3b2f2f]",
    bar: "bg-[#eadec2] border-[#d6c5a3] text-[#3b2f2f]",
    text: "text-[#3b2f2f]",
    label: "ورقي دافئ (Sepia)",
  },
  light: {
    wrap: "bg-white text-zinc-900",
    bar: "bg-zinc-100 border-zinc-200 text-zinc-900",
    text: "text-zinc-900",
    label: "نهاري (Light)",
  },
  ide: {
    wrap: "bg-[#0d1117] text-[#e6edf3]",
    bar: "bg-[#161b22] border-[#30363d] text-[#e6edf3]",
    text: "text-[#e6edf3]",
    label: "برمجي (IDE)",
  },
};

export function ProDocumentReader({
  src,
  fileName,
  fileSize,
  category,
  localFile,
}: ProDocumentReaderProps) {
  const subKind: DocumentSubKind = useMemo(
    () => classifyDocumentSubKind(fileName, category),
    [fileName, category]
  );

  if (subKind === "pdf") {
    return <PdfCanvasReader src={src} fileName={fileName} localFile={localFile} />;
  }

  return (
    <RichTextAndDocReader
      src={src}
      fileName={fileName}
      fileSize={fileSize}
      subKind={subKind}
      localFile={localFile}
    />
  );
}

/* ============================================================================
 * 1. Native Canvas PDF Reader (100% Offline LAN & Android WebView Compatible)
 * ========================================================================== */
function PdfCanvasReader({
  src,
  fileName,
  localFile,
}: {
  src: string;
  fileName: string;
  localFile?: File | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [pdfTheme, setPdfTheme] = useState<"normal" | "night" | "sepia">("normal");
  const [viewAllPages, setViewAllPages] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchDistRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadPdf() {
      try {
        // Dynamically import local offline pdf.min.mjs at runtime in browser
        const importRuntimeModule = new Function("u", "return import(u)") as (
          u: string
        ) => Promise<{
          GlobalWorkerOptions?: { workerSrc: string };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<any> };
        }>;
        const pdfjs = await importRuntimeModule("/pdfjs/pdf.min.mjs");
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        }

        let data: ArrayBuffer;
        if (localFile) {
          data = await localFile.arrayBuffer();
        } else {
          const res = await fetch(src, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.arrayBuffer();
        }

        const loadingTask = pdfjs.getDocument({ data });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "تعذر فتح ملف PDF");
        setLoading(false);
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [src, localFile]);

  const pagesToRender = useMemo(() => {
    if (!numPages) return [];
    if (!viewAllPages) return [currentPage];
    // Render up to 60 pages in continuous scroll, or current window for huge PDFs
    const maxContinuous = Math.min(numPages, 50);
    return Array.from({ length: maxContinuous }, (_, i) => i + 1);
  }, [numPages, viewAllPages, currentPage]);

  return (
    <div className="flex size-full flex-col overflow-hidden bg-zinc-900 text-white">
      {/* Top PDF Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-950/90 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15"
            disabled={currentPage <= 1}
            onClick={() => {
              const prev = Math.max(1, currentPage - 1);
              setCurrentPage(prev);
              document
                .getElementById(`pdf-page-${prev}`)
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-mono text-xs">
            صفحة{" "}
            <input
              type="number"
              min={1}
              max={numPages || 1}
              value={currentPage}
              onChange={(e) => {
                const p = Math.max(1, Math.min(numPages || 1, Number(e.target.value) || 1));
                setCurrentPage(p);
                document
                  .getElementById(`pdf-page-${p}`)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-12 rounded border border-white/20 bg-white/10 px-1 py-0.5 text-center text-white"
            />{" "}
            / {numPages || "…"}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15"
            disabled={currentPage >= numPages}
            onClick={() => {
              const next = Math.min(numPages, currentPage + 1);
              setCurrentPage(next);
              document
                .getElementById(`pdf-page-${next}`)
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Zoom, Rotate, Reading Mode */}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            title="تصغير"
          >
            <Minus className="size-3.5" />
          </Button>
          <button
            type="button"
            onClick={() => setScale(1.25)}
            className="px-1.5 font-mono text-xs text-teal-300"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15"
            onClick={() => setScale((s) => Math.min(3.0, +(s + 0.2).toFixed(2)))}
            title="تكبير"
          >
            <Plus className="size-3.5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="تدوير الصفحة 90°"
          >
            <RotateCw className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-white/85 hover:bg-white/15"
            onClick={() => setViewAllPages((v) => !v)}
          >
            {viewAllPages ? "تمرير مستمر" : "صفحة مفردة"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-amber-300 hover:bg-white/15"
            onClick={() =>
              setPdfTheme((m) =>
                m === "normal" ? "night" : m === "night" ? "sepia" : "normal"
              )
            }
            title="وضع القراءة المريح للعين"
          >
            {pdfTheme === "normal" ? (
              <>
                <Sun className="size-3.5" /> عادي
              </>
            ) : pdfTheme === "night" ? (
              <>
                <Moon className="size-3.5" /> ليلي
              </>
            ) : (
              <>
                <BookOpen className="size-3.5" /> دافئ
              </>
            )}
          </Button>
        </div>
      </div>

      {/* PDF Pages Viewport (supports 2-finger pinch-to-zoom) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-3 sm:p-6"
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchDistRef.current = Math.hypot(dx, dy);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchDistRef.current !== null) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (Math.abs(dist - pinchDistRef.current) > 18) {
              const ratio = dist / pinchDistRef.current;
              setScale((s) => Math.min(3.0, Math.max(0.5, +(s * ratio).toFixed(2))));
              pinchDistRef.current = dist;
            }
          }
        }}
        onTouchEnd={() => {
          pinchDistRef.current = null;
        }}
        onScroll={(e) => {
          if (!viewAllPages) return;
          const el = e.currentTarget;
          const children = Array.from(el.querySelectorAll("[data-page-num]"));
          for (const child of children) {
            const rect = child.getBoundingClientRect();
            if (rect.top >= 0 && rect.top <= window.innerHeight * 0.6) {
              const p = Number(child.getAttribute("data-page-num"));
              if (p && p !== currentPage) setCurrentPage(p);
              break;
            }
          }
        }}
      >
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
            <Loader2 className="size-8 animate-spin text-teal-400" />
            <p className="text-sm">جارٍ تجهيز صفحات مستند PDF بدقة عالية…</p>
          </div>
        )}

        {error && (
          <div className="mx-auto my-12 max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
            <p className="mb-3 text-sm text-rose-300">
              تعذر عرض ملف PDF بالعارض المدمج ({error})
            </p>
            <iframe
              src={src}
              title={fileName}
              className="h-[65vh] w-full rounded-xl border border-white/10 bg-white"
            />
          </div>
        )}

        {!loading && !error && (
          <div className="mx-auto flex flex-col items-center gap-5">
            {pagesToRender.map((pageNum) => (
              <PdfPageCanvas
                key={pageNum}
                pdfDoc={pdfDocRef.current}
                pageNum={pageNum}
                scale={scale}
                rotation={rotation}
                pdfTheme={pdfTheme}
              />
            ))}
            {viewAllPages && numPages > 50 && (
              <div className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white/80">
                يتم عرض أول 50 صفحة في وضع التمرير المستمر. استخدم وضع &quot;صفحة مفردة&quot;
                للتنقل في المستندات الضخمة ({numPages} صفحة).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPageCanvas({
  pdfDoc,
  pageNum,
  scale,
  rotation,
  pdfTheme,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any;
  pageNum: number;
  scale: number;
  rotation: number;
  pdfTheme: "normal" | "night" | "sepia";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any = null;

    pdfDoc
      .getPage(pageNum)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((page: any) => {
        if (cancelled || !canvasRef.current) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr, rotation });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        renderTask = page.render({ canvasContext: ctx, viewport });
        return renderTask.promise;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (renderTask?.cancel) {
        try {
          renderTask.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNum, scale, rotation]);

  return (
    <div
      id={`pdf-page-${pageNum}`}
      data-page-num={pageNum}
      className="relative max-w-full overflow-x-auto rounded-lg shadow-2xl ring-1 ring-white/15"
    >
      <canvas
        ref={canvasRef}
        style={{
          filter:
            pdfTheme === "night"
              ? "invert(92%) hue-rotate(180deg) contrast(95%)"
              : pdfTheme === "sepia"
              ? "sepia(45%) brightness(97%)"
              : undefined,
        }}
        className="block max-w-full bg-white"
      />
      <span className="absolute right-2 bottom-2 rounded bg-black/65 px-2 py-0.5 font-mono text-[10px] text-white/80">
        {pageNum}
      </span>
    </div>
  );
}

/* ============================================================================
 * 2. Word (.docx/.rtf), Spreadsheet (.csv/.tsv), Markdown, JSON & Text Studio
 * ========================================================================== */
function RichTextAndDocReader({
  src,
  fileName,
  fileSize,
  subKind,
  localFile,
}: {
  src: string;
  fileName: string;
  fileSize: number;
  subKind: DocumentSubKind;
  localFile?: File | null;
}) {
  const [loading, setLoading] = useState(true);
  const [rawText, setRawText] = useState<string>("");
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reading customization
  const [theme, setTheme] = useState<ReadingTheme>(subKind === "code" ? "ide" : "dark");
  const [fontSize, setFontSize] = useState(15);
  const [wordWrap, setWordWrap] = useState(true);
  const [dirMode, setDirMode] = useState<"auto" | "rtl" | "ltr">("auto");
  const [renderedMode, setRenderedMode] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Text-to-Speech (Read Aloud)
  const [isSpeaking, setIsSpeaking] = useState(false);

  // CSV sorting
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocxHtml(null);
    setRawText("");

    async function loadContent() {
      try {
        if (subKind === "docx") {
          let buf: ArrayBuffer;
          if (localFile) {
            buf = await localFile.arrayBuffer();
          } else {
            const res = await fetch(src, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            buf = await res.arrayBuffer();
          }
          try {
            const mammoth = await import("mammoth");
            const result = await mammoth.convertToHtml({ arrayBuffer: buf });
            const rawRes = await mammoth.extractRawText({ arrayBuffer: buf });
            if (cancelled) return;
            setDocxHtml(result.value || "<p>المستند فارغ</p>");
            setRawText(rawRes.value || "");
            setLoading(false);
            return;
          } catch {
            // Legacy .doc binary fallback
            if (cancelled) return;
            const extracted = extractLegacyDocText(buf);
            setRawText(extracted);
            setDocxHtml(
              `<div class="space-y-2">${extracted
                .split("\n")
                .map((p) => `<p>${p.replace(/</g, "&lt;")}</p>`)
                .join("")}</div>`
            );
            setLoading(false);
            return;
          }
        }

        // Text-based files (.txt, .md, .csv, .json, .rtf, code, etc.) with Smart Encoding Detection
        let buf: ArrayBuffer;
        if (localFile) {
          buf = await localFile.arrayBuffer();
        } else {
          const res = await fetch(src, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = await res.arrayBuffer();
        }
        if (cancelled) return;

        let txt = decodeTextSmart(buf);
        if (subKind === "rtf") {
          txt = stripRtfToPlainText(txt);
        }
        setRawText(txt);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "تعذر قراءة الملف");
        setLoading(false);
      }
    }

    loadContent();
    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [src, subKind, localFile]);

  // Statistics
  const stats = useMemo(() => {
    if (!rawText) return { lines: 0, words: 0, chars: 0, readMin: 1 };
    const lines = rawText.split("\n").length;
    const words = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
    const chars = rawText.length;
    const readMin = Math.max(1, Math.ceil(words / 200));
    return { lines, words, chars, readMin };
  }, [rawText]);

  // CSV Table parsing
  const csvData = useMemo(() => {
    if (subKind !== "csv" || !rawText) return null;
    const sep = fileName.toLowerCase().endsWith(".tsv")
      ? "\t"
      : rawText.split("\n")[0]?.includes(";") && !rawText.split("\n")[0]?.includes(",")
      ? ";"
      : ",";
    const rows = parseCsvRows(rawText, sep);
    if (rows.length === 0) return null;
    const headers = rows[0];
    let body = rows.slice(1);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      body = body.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));
    }
    if (sortCol !== null) {
      body = [...body].sort((a, b) => {
        const va = a[sortCol] ?? "";
        const vb = b[sortCol] ?? "";
        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "") {
          return sortAsc ? na - nb : nb - na;
        }
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return { headers, body };
  }, [subKind, rawText, fileName, searchQuery, sortCol, sortAsc]);

  // Text-to-Speech handler
  const toggleSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("القراءة الصوتية غير مدعومة على هذا المتصفح");
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const textToRead = rawText.slice(0, 12000).trim();
    if (!textToRead) {
      toast.error("لا يوجد نص لقراءته");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(textToRead);
    const hasArabic = /[\u0600-\u06FF]/.test(textToRead);
    utter.lang = hasArabic ? "ar-SA" : "en-US";
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
    setIsSpeaking(true);
    toast.success(hasArabic ? "جاري القراءة الصوتية بالعربية" : "Reading aloud...");
  }, [isSpeaking, rawText]);

  const currentTheme = THEME_CLASSES[theme];

  return (
    <div className={cn("flex size-full flex-col overflow-hidden", currentTheme.wrap)}>
      {/* Top Studio Toolbar */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs",
          currentTheme.bar
        )}
      >
        {/* Left: Search & Mode Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 opacity-50" />
            <input
              type="text"
              placeholder="بحث داخل المستند..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-36 rounded-lg border border-current/15 bg-black/10 pr-2 pl-7 text-xs focus:w-48 focus:outline-none transition-all sm:w-44"
            />
          </div>

          {(subKind === "csv" || subKind === "markdown" || subKind === "json") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setRenderedMode((m) => !m)}
            >
              {renderedMode ? (
                <>
                  <Code2 className="size-3.5" /> نص خام
                </>
              ) : (
                <>
                  <Eye className="size-3.5" /> عرض منسق
                </>
              )}
            </Button>
          )}
        </div>

        {/* Right: Theme, Font Size, RTL/LTR, Wrap, TTS, Copy */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Theme Switcher */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              const order: ReadingTheme[] = ["dark", "sepia", "light", "ide"];
              setTheme(order[(order.indexOf(theme) + 1) % order.length]);
            }}
            title="تغيير سمة القراءة"
          >
            <Palette className="size-3.5" />
            <span className="hidden sm:inline">{currentTheme.label}</span>
          </Button>

          {/* Font Size */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFontSize((s) => Math.max(11, s - 1))}
            title="تصغير الخط"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="px-1 font-mono text-[11px]">{fontSize}px</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFontSize((s) => Math.min(28, s + 1))}
            title="تكبير الخط"
          >
            <Plus className="size-3.5" />
          </Button>

          {/* Direction RTL/LTR */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 font-mono text-[11px]"
            onClick={() =>
              setDirMode((d) => (d === "auto" ? "rtl" : d === "rtl" ? "ltr" : "auto"))
            }
            title="اتجاه النص (تلقائي / يمين لليسار / يسار لليمين)"
          >
            {dirMode === "rtl" ? (
              <AlignRight className="size-3.5" />
            ) : dirMode === "ltr" ? (
              <AlignLeft className="size-3.5" />
            ) : (
              "Auto"
            )}
          </Button>

          {/* Word Wrap */}
          <Button
            size="icon"
            variant="ghost"
            className={cn(wordWrap && "bg-current/10")}
            onClick={() => setWordWrap((w) => !w)}
            title="التفاف الأسطر"
          >
            <WrapText className="size-3.5" />
          </Button>

          {/* Read Aloud (TTS) */}
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              isSpeaking && "bg-emerald-500/25 text-emerald-400"
            )}
            onClick={toggleSpeech}
            title="القراءة الصوتية للنص (Read Aloud)"
          >
            {isSpeaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
            <span className="hidden md:inline">{isSpeaking ? "إيقاف" : "قراءة صوتية"}</span>
          </Button>

          {/* Copy Text */}
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(rawText);
                setCopied(true);
                toast.success("تم نسخ النص بالكامل");
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("تعذر نسخ النص");
              }
            }}
            title="نسخ النص"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6" dir={dirMode}>
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 opacity-70">
            <Loader2 className="size-7 animate-spin" />
            <p className="text-sm">جارٍ قراءة وتنسيق المستند…</p>
          </div>
        )}

        {error && (
          <div className="mx-auto my-10 max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm">
            تعذر فتح المستند: {error}
          </div>
        )}

        {/* 1. Word (.docx) Rendered View */}
        {!loading && !error && subKind === "docx" && docxHtml && (
          <div
            style={{ fontSize: `${fontSize}px` }}
            className="prose prose-invert mx-auto max-w-3xl leading-relaxed [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-current/20 [&_td]:p-2 [&_th]:border [&_th]:border-current/20 [&_th]:bg-current/10 [&_th]:p-2"
            dangerouslySetInnerHTML={{
              __html: highlightHtmlSearch(docxHtml, searchQuery),
            }}
          />
        )}

        {/* 2. Spreadsheet (.csv / .tsv) Interactive Table View */}
        {!loading && !error && subKind === "csv" && renderedMode && csvData && (
          <div className="overflow-x-auto rounded-xl border border-current/15">
            <table
              style={{ fontSize: `${Math.max(12, fontSize - 2)}px` }}
              className="w-full border-collapse text-left"
            >
              <thead>
                <tr className="border-b border-current/20 bg-current/10">
                  <th className="w-10 px-2.5 py-2 text-center font-mono text-[11px] opacity-60">
                    #
                  </th>
                  {csvData.headers.map((h, i) => (
                    <th
                      key={i}
                      onClick={() => {
                        if (sortCol === i) setSortAsc((a) => !a);
                        else {
                          setSortCol(i);
                          setSortAsc(true);
                        }
                      }}
                      className="cursor-pointer px-3 py-2 font-semibold select-none hover:bg-current/10"
                    >
                      <div className="flex items-center gap-1">
                        <span>{h || `عمود ${i + 1}`}</span>
                        {sortCol === i && <span>{sortAsc ? "▲" : "▼"}</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.body.slice(0, 500).map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-b border-current/10 hover:bg-current/[0.04]"
                  >
                    <td className="px-2.5 py-1.5 text-center font-mono text-[11px] opacity-50">
                      {rIdx + 1}
                    </td>
                    {csvData.headers.map((_, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5" dir="auto">
                        {row[cIdx] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Markdown Rendered View */}
        {!loading && !error && subKind === "markdown" && renderedMode && (
          <div
            style={{ fontSize: `${fontSize}px` }}
            className="mx-auto max-w-3xl space-y-3 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: renderSimpleMarkdown(rawText, searchQuery),
            }}
          />
        )}

        {/* 4. Plain Text / Code / JSON / Raw Fallback */}
        {!loading &&
          !error &&
          subKind !== "docx" &&
          !(subKind === "csv" && renderedMode && csvData) &&
          !(subKind === "markdown" && renderedMode) && (
            <PlainOrCodeContent
              rawText={
                subKind === "json" && renderedMode ? formatPrettyJson(rawText) : rawText
              }
              fontSize={fontSize}
              wordWrap={wordWrap}
              searchQuery={searchQuery}
              showLineNumbers={subKind === "code" || subKind === "json"}
            />
          )}
      </div>

      {/* Bottom Statistics Bar */}
      <div
        dir="rtl"
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t px-4 py-1.5 text-[11px] opacity-80",
          currentTheme.bar
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-medium">
            {subKind === "csv" ? (
              <FileSpreadsheet className="size-3.5" />
            ) : (
              <FileText className="size-3.5" />
            )}
            {subKind.toUpperCase()}
          </span>
          <span>{stats.words.toLocaleString()} كلمة</span>
          <span>{stats.chars.toLocaleString()} حرف</span>
          <span>{stats.lines.toLocaleString()} سطر</span>
        </div>
        <div>وقت القراءة المقدر: ~{stats.readMin} دقيقة</div>
      </div>
    </div>
  );
}

function PlainOrCodeContent({
  rawText,
  fontSize,
  wordWrap,
  searchQuery,
  showLineNumbers,
}: {
  rawText: string;
  fontSize: number;
  wordWrap: boolean;
  searchQuery: string;
  showLineNumbers: boolean;
}) {
  const [visibleLimit, setVisibleLimit] = useState(1500);
  const lines = useMemo(() => rawText.split("\n"), [rawText]);

  useEffect(() => {
    setVisibleLimit(1500);
  }, [rawText]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) {
      return lines.slice(0, visibleLimit).map((text, idx) => ({ text, num: idx + 1 }));
    }
    const q = searchQuery.toLowerCase();
    const matches: { text: string; num: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push({ text: lines[i], num: i + 1 });
        if (matches.length >= visibleLimit) break;
      }
    }
    return matches;
  }, [lines, searchQuery, visibleLimit]);

  return (
    <div>
      <pre
        style={{ fontSize: `${fontSize}px` }}
        className={cn(
          "font-mono leading-relaxed",
          wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        )}
      >
        {filteredLines.map((item) => (
          <div key={item.num} className="flex hover:bg-current/[0.05]">
            {showLineNumbers && (
              <span className="mr-4 w-10 shrink-0 text-right font-mono text-[0.8em] opacity-40 select-none">
                {item.num}
              </span>
            )}
            <span className="flex-1" dir="auto">
              {searchQuery ? highlightLine(item.text, searchQuery) : item.text || " "}
            </span>
          </div>
        ))}
      </pre>
      {!searchQuery && lines.length > visibleLimit && (
        <div className="mt-4 flex justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVisibleLimit((v) => v + 1500)}
          >
            عرض المزيد من الأسطر ({visibleLimit.toLocaleString()} /{" "}
            {lines.length.toLocaleString()})
          </Button>
        </div>
      )}
    </div>
  );
}

function highlightLine(line: string, query: string) {
  if (!query.trim()) return line;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = line.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber-400 px-0.5 text-black">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function highlightHtmlSearch(html: string, query: string): string {
  if (!query.trim()) return html;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(
    new RegExp(`(${escaped})(?![^<]*>)`, "gi"),
    '<mark class="bg-amber-400 text-black px-0.5 rounded">$1</mark>'
  );
}

function formatPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function stripRtfToPlainText(rtf: string): string {
  if (!rtf.trim().startsWith("{\\rtf")) return rtf;
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function parseCsvRows(text: string, sep: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        row.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    result.push(row);
  }
  return result;
}

function renderSimpleMarkdown(md: string, query: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = esc
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-5 mb-2 border-b border-current/15 pb-1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-extrabold mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-current/15 px-1.5 py-0.5 font-mono text-[0.9em]">$1</code>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n{2,}/g, "</p><p class='mb-3'>");
  return highlightHtmlSearch(`<p class="mb-3">${html}</p>`, query);
}
