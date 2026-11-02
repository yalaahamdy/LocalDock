/**
 * LocalDock — Client-safe file extension & category classifier.
 * Used by LocalDevicePlayer, PreviewModal, and Pro Players.
 */
import type { FileCategory, FileEntry } from "../types";

export type DocumentSubKind =
  | "pdf"
  | "docx"
  | "rtf"
  | "csv"
  | "markdown"
  | "json"
  | "subtitle"
  | "code"
  | "plain";

const IMAGE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
  ".heic", ".heif", ".jfif", ".tif", ".tiff",
]);

const VIDEO_EXTS = new Set([
  ".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".3gp", ".ogv", ".flv",
  ".wmv", ".mpeg", ".mpg",
]);

const AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".opus", ".wma", ".amr",
  ".weba",
]);

const ARCHIVE_EXTS = new Set([
  ".zip", ".rar", ".7z", ".tar", ".gz", ".iso", ".dmg",
]);

const CODE_EXTS = new Set([
  ".html", ".htm", ".css", ".scss", ".less", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".kt", ".kts", ".c", ".h",
  ".cpp", ".hpp", ".cs", ".php", ".rb", ".swift", ".dart", ".lua", ".sh",
  ".bash", ".bat", ".ps1", ".sql",
]);

const TEXT_EXTS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".srt", ".vtt", ".sub",
  ".docx", ".doc", ".rtf", ".odt",
  ".json", ".jsonl", ".xml", ".log", ".yml", ".yaml", ".ini", ".conf", ".cfg",
  ".env", ".toml", ".gitignore", ".license",
]);

export function getFileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i).toLowerCase() : "";
}

export function classifyFileCategory(name: string, mimeType?: string): FileCategory {
  const ext = getFileExt(name);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === ".pdf") return "pdf";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  if (ext === ".apk") return "apk";
  if (CODE_EXTS.has(ext)) return "code";
  if (TEXT_EXTS.has(ext)) return "text";

  if (mimeType) {
    const m = mimeType.toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    if (m.startsWith("audio/")) return "audio";
    if (m === "application/pdf") return "pdf";
    if (m.includes("wordprocessingml") || m.includes("msword") || m.includes("rtf") || m.startsWith("text/") || m.includes("json") || m.includes("xml") || m.includes("csv")) {
      return "text";
    }
  }
  return "other";
}

export function classifyDocumentSubKind(name: string, category: FileCategory): DocumentSubKind {
  const ext = getFileExt(name);
  if (category === "pdf" || ext === ".pdf") return "pdf";
  if (ext === ".docx" || ext === ".doc" || ext === ".odt") return "docx";
  if (ext === ".rtf") return "rtf";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".json" || ext === ".jsonl") return "json";
  if (ext === ".srt" || ext === ".vtt" || ext === ".sub") return "subtitle";
  if (category === "code" || CODE_EXTS.has(ext)) return "code";
  return "plain";
}

export function fileToLocalEntry(file: File): FileEntry {
  return {
    name: file.name,
    kind: "file",
    size: file.size,
    modifiedAt: file.lastModified || Date.now(),
    mimeType: file.type || undefined,
    category: classifyFileCategory(file.name, file.type),
  };
}

/** Convert SRT subtitle text to WebVTT format for HTML5 <track> or custom overlay */
export function parseSubtitles(raw: string): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = [];
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);

  const parseTime = (t: string): number => {
    const clean = t.trim().replace(",", ".");
    const parts = clean.split(":");
    if (parts.length === 3) {
      return (
        parseInt(parts[0], 10) * 3600 +
        parseInt(parts[1], 10) * 60 +
        parseFloat(parts[2])
      );
    }
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    }
    return 0;
  };

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;
    let timeLineIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;
    const [startStr, endPart] = lines[timeLineIdx].split("-->");
    const endStr = (endPart || "").trim().split(/\s+/)[0];
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    const text = lines
      .slice(timeLineIdx + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!Number.isNaN(start) && !Number.isNaN(end) && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

/**
 * Smart text decoder that automatically handles UTF-8, UTF-16LE/BE,
 * and legacy Arabic Windows-1256 (common in .srt subtitles, .txt, and .csv files).
 */
export function decodeTextSmart(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buf);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(buf);
    }
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

/**
 * Fallback text extractor for legacy binary Word 97-2003 (.doc) files
 * when mammoth (.docx ZIP parser) cannot open them.
 */
export function extractLegacyDocText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];

  // 1. Try extracting UTF-16LE runs (Word stores Unicode text streams as UTF-16LE)
  let currentU16 = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    const isReadable =
      code === 0x000a ||
      code === 0x000d ||
      code === 0x0009 ||
      (code >= 0x0020 && code <= 0x007e) ||
      (code >= 0x0600 && code <= 0x06ff);
    if (isReadable) {
      currentU16 += String.fromCharCode(code);
    } else {
      if (currentU16.trim().length >= 12) {
        chunks.push(currentU16.trim());
      }
      currentU16 = "";
    }
  }
  if (currentU16.trim().length >= 12) chunks.push(currentU16.trim());

  if (chunks.join("\n").length > 60) {
    return chunks.join("\n\n");
  }

  // 2. Fallback to Windows-1256 / ASCII printable runs
  const decoded = decodeTextSmart(buf);
  const clean = decoded
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 4);
  return clean.join("\n") || "تعذر استخراج نص واضح من ملف .doc القديم.";
}

