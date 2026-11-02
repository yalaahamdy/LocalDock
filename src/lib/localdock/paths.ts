/**
 * LocalDock — Path security core.
 *
 * Every filesystem access in the product MUST go through `resolveSafe`.
 * Design goals:
 *  - Never escape `root`, no matter how the client composes the path.
 *  - Reject/sanitize hostile file names (traversal, control chars, reserved names).
 *  - No exceptions thrown for ordinary "not found" cases (return typed results).
 */
import path from "node:path";
import type { FileCategory } from "./types";

export interface ResolveResult {
  ok: boolean;
  /** Absolute, normalized path inside root (only when ok). */
  abs?: string;
  /** Normalized relative path (only when ok). */
  rel?: string;
  reason?: string;
}

const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Control characters, quotes and characters that break Windows/Android filesystems. */
const NAME_FORBIDDEN = /[\u0000-\u001f\u007f"*/:<>?\\|]/g;

/**
 * Resolve `relPath` inside `root`. Accepts "", ".", "/", nested segments,
 * URL-encoded junk is expected to be decoded by the caller (URL API does it).
 */
export function resolveSafe(root: string, relPath: string): ResolveResult {
  if (typeof relPath !== "string") return { ok: false, reason: "invalid-path" };
  if (relPath.includes("\u0000")) return { ok: false, reason: "null-byte" };

  // Normalize separators coming from any platform/client.
  const unified = relPath.replace(/\\/g, "/");
  if (unified.includes("\u0000")) return { ok: false, reason: "null-byte" };

  // Absolute paths are never accepted as client input.
  if (/^[/\\]/.test(unified) || /^[a-zA-Z]:/.test(unified)) {
    return { ok: false, reason: "absolute-path" };
  }

  const relNormalized = path.posix.normalize(unified);
  if (relNormalized === "." || relNormalized === "./") {
    return { ok: true, abs: root, rel: "" };
  }
  if (
    relNormalized.startsWith("..") ||
    relNormalized === ".." ||
    relNormalized.includes("/../") ||
    path.isAbsolute(relNormalized)
  ) {
    return { ok: false, reason: "path-traversal" };
  }

  const abs = path.resolve(root, relNormalized);
  const rootAbs = path.resolve(root);
  // Defense in depth: the resolved path must stay inside root.
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    return { ok: false, reason: "path-escape" };
  }
  return { ok: true, abs, rel: relNormalized };
}

/** Resolve and additionally require the result to be strictly inside root (not root itself). */
export function resolveSafeInside(
  root: string,
  relPath: string
): ResolveResult {
  const r = resolveSafe(root, relPath);
  if (!r.ok) return r;
  if (!r.rel || r.rel === "") return { ok: false, reason: "root-not-allowed" };
  return r;
}

/**
 * Sanitize a user-provided file/folder name for creation on any platform.
 * Returns null when the name is unusable.
 */
export function sanitizeName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  if (raw.includes("\u0000")) return null; // never let NUL reach the filesystem
  let name = raw
    .trim()
    .replace(NAME_FORBIDDEN, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\.+$/, "");
  if (!name || name === "." || name === "..") return null;
  // dotfiles are hidden-state surprises; reject leading dots for created items
  if (name.startsWith(".")) return null;
  const upper = name.replace(/\.[^.]*$/, "").toUpperCase();
  if (WINDOWS_RESERVED.has(upper)) return null;
  if (name.length > 180) name = name.slice(0, 180);
  return name;
}

/** For uploads: keep extension, sanitize base, guarantee non-empty, never hidden. */
export function sanitizeUploadName(raw: string): string | null {
  const name = sanitizeName(raw);
  if (!name) return null;
  return name;
}

const RESERVED_SLUGS = new Set(["api", "sites", "s", "pair", "admin", "localdock"]);

export function slugify(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "share";
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

/* ---------- MIME / category mapping ---------- */

const MIME: Record<string, string> = {
  // images
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".bmp": "image/bmp", ".ico": "image/x-icon", ".avif": "image/avif",
  ".heic": "image/heic", ".heif": "image/heif", ".jfif": "image/jpeg",
  ".tif": "image/tiff", ".tiff": "image/tiff",
  // video
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".m4v": "video/x-m4v",
  ".3gp": "video/3gpp", ".ogv": "video/ogg", ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv", ".mpeg": "video/mpeg", ".mpg": "video/mpeg",
  // audio
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".m4a": "audio/mp4", ".flac": "audio/flac", ".aac": "audio/aac",
  ".opus": "audio/opus", ".wma": "audio/x-ms-wma", ".amr": "audio/amr",
  ".weba": "audio/webm",
  // docs
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".tsv": "text/tab-separated-values; charset=utf-8",
  ".srt": "text/plain; charset=utf-8", ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8", ".tsx": "text/plain; charset=utf-8",
  // archives
  ".zip": "application/zip", ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed", ".tar": "application/x-tar",
  ".gz": "application/gzip",
  // android
  ".apk": "application/vnd.android.package-archive",
  // binaries
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
  ".iso": "application/x-iso9660-image",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

const TEXTUAL = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".srt", ".vtt", ".sub",
  ".docx", ".doc", ".rtf", ".odt",
  ".json", ".jsonl", ".xml", ".log", ".yml", ".yaml", ".ini", ".conf", ".cfg",
  ".env", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".css", ".scss", ".less",
  ".html", ".htm", ".py", ".go", ".rs", ".java", ".kt", ".kts", ".c", ".h",
  ".cpp", ".hpp", ".cs", ".php", ".rb", ".swift", ".dart", ".lua", ".r",
  ".sh", ".bash", ".bat", ".ps1", ".sql", ".toml", ".gitignore", ".license",
]);

const CODE_EXTS = new Set([
  ".html", ".htm", ".css", ".scss", ".less", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".kt", ".kts", ".c", ".h",
  ".cpp", ".hpp", ".cs", ".php", ".rb", ".swift", ".dart", ".lua", ".sh",
  ".bash", ".bat", ".ps1", ".sql",
]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i).toLowerCase() : "";
}

export function mimeOf(name: string): string {
  return MIME[extOf(name)] ?? "application/octet-stream";
}

export function categoryOf(name: string): FileCategory {
  const ext = extOf(name);
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif", ".heic", ".heif", ".jfif", ".tif", ".tiff"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".3gp", ".ogv", ".flv", ".wmv", ".mpeg", ".mpg"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".opus", ".wma", ".amr", ".weba"].includes(ext)) return "audio";
  if (ext === ".pdf") return "pdf";
  if ([".zip", ".rar", ".7z", ".tar", ".gz", ".iso", ".dmg"].includes(ext)) return "archive";
  if (ext === ".apk") return "apk";
  if (TEXTUAL.has(ext)) return CODE_EXTS.has(ext) ? "code" : "text";
  return "other";
}

/** Build a non-conflicting destination path: "file.txt" -> "file (1).txt". */
export function uniquifyPath(dirAbs: string, name: string, isDir = false): string {
  let candidate = path.join(dirAbs, name);
  if (!existsSyncSafe(candidate)) return candidate;
  const ext = isDir ? "" : extOf(name);
  const base = isDir ? name : name.slice(0, name.length - ext.length) || name;
  for (let i = 1; i < 1000; i++) {
    candidate = path.join(dirAbs, `${base} (${i})${ext}`);
    if (!existsSyncSafe(candidate)) return candidate;
  }
  return path.join(dirAbs, `${base}-${Date.now()}${ext}`);
}

function existsSyncSafe(p: string): boolean {
  try {
    // lazy require to keep this module importable in edge-ish tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").existsSync(p);
  } catch {
    return false;
  }
}
