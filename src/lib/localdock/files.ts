/**
 * LocalDock — filesystem browsing, stats and streaming responses.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { categoryOf, mimeOf, resolveSafe } from "./paths";
import { DESKTOP_MODE } from "./store";
import type { FileEntry } from "./types";

export async function listDir(
  rootAbs: string,
  relDir: string
): Promise<{ entries: FileEntry[] } | { error: string }> {
  const resolved = resolveSafe(rootAbs, relDir);
  if (!resolved.ok || resolved.abs === undefined) return { error: resolved.reason ?? "invalid-path" };
  let names: string[];
  try {
    names = await fsp.readdir(resolved.abs, { withFileTypes: false });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { error: code === "ENOENT" ? "not-found" : code === "EACCES" ? "permission" : "read-failed" };
  }
  const entries: FileEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue; // hidden system files stay invisible
    const abs = path.join(resolved.abs, name);
    let stat: fs.Stats | null = null;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      entries.push({ name, kind: "dir", size: 0, modifiedAt: stat.mtimeMs, category: "other" });
    } else if (stat.isFile()) {
      entries.push({
        name,
        kind: "file",
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        mimeType: mimeOf(name),
        category: categoryOf(name),
      });
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return { entries };
}

/** Recursive search with hard limits (depth 6, 2000 files scanned, 100 results). */
export async function searchDir(
  rootAbs: string,
  relDir: string,
  query: string
): Promise<FileEntry[]> {
  const resolved = resolveSafe(rootAbs, relDir);
  if (!resolved.ok || resolved.abs === undefined) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: FileEntry[] = [];
  let scanned = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 6 || scanned > 2000 || results.length >= 100) return;
    let dirents: fs.Dirent[];
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (scanned > 2000 || results.length >= 100) return;
      if (dirent.name.startsWith(".")) continue;
      scanned++;
      const abs = path.join(dir, dirent.name);
      if (dirent.name.toLowerCase().includes(q)) {
        try {
          const stat = await fsp.stat(abs);
          const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
          results.push(
            stat.isDirectory()
              ? { name: dirent.name, kind: "dir", size: 0, modifiedAt: stat.mtimeMs, category: "other", relPath: rel }
              : {
                  name: dirent.name,
                  kind: "file",
                  size: stat.size,
                  modifiedAt: stat.mtimeMs,
                  mimeType: mimeOf(dirent.name),
                  category: categoryOf(dirent.name),
                  relPath: rel,
                }
          );
        } catch {
          /* ignore */
        }
      }
      if (dirent.isDirectory()) await walk(abs, depth + 1);
    }
  };

  await walk(resolved.abs, 0);
  return results;
}

/** Folder stats (size + item count) with hard caps so huge trees can't stall the API. */
export async function measureDir(
  rootAbs: string,
  maxFiles = 20000
): Promise<{ sizeBytes: number; itemCount: number }> {
  let sizeBytes = 0;
  let itemCount = 0;
  let aborted = false;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (aborted || depth > 8) return;
    let dirents: fs.Dirent[];
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (itemCount >= maxFiles) {
        aborted = true;
        return;
      }
      if (d.name.startsWith(".")) continue;
      itemCount++;
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) await walk(abs, depth + 1);
      else if (d.isFile()) {
        try {
          const s = await fsp.stat(abs);
          sizeBytes += s.size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  await walk(rootAbs, 0);
  return { sizeBytes, itemCount };
}

/* ------------------------------------------------------------------ */
/* Streaming                                                           */
/* ------------------------------------------------------------------ */

export interface RangeSpec {
  start: number;
  end: number; // inclusive
}

export function parseRange(
  header: string | null,
  size: number
): RangeSpec | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === "" && rawEnd === "") return undefined;
  if (rawStart === "") {
    // suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return undefined;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return undefined;
  }
  return { start, end };
}

/**
 * Stream a file (or a byte range) as a web Response. Never reads the whole
 * file into memory — suitable for 50 GB files.
 */
export async function streamFileResponse(
  absPath: string,
  opts: {
    method?: "GET" | "HEAD";
    rangeHeader?: string | null;
    mime: string;
    download?: boolean;
    filename?: string;
  }
): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    return jsonError(404, "not-found", "This file no longer exists on the server.", { key: "notFound" });
  }
  if (!stat.isFile()) {
    return jsonError(400, "not-a-file", "The requested path is not a file.", { key: "notFile" });
  }
  const size = stat.size;
  const range = parseRange(opts.rangeHeader ?? null, size);

  const headers = new Headers();
  headers.set("Content-Type", opts.mime);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (opts.download) {
    const name = (opts.filename ?? path.basename(absPath)).replace(/["\\]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
    );
  }

  if (opts.method === "HEAD") {
    headers.set("Content-Length", String(size));
    return new Response(null, { status: 200, headers });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(0, size - 1);
  if (range) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
  } else {
    headers.set("Content-Length", String(size));
  }

  if (size === 0) return new Response(null, { status: range ? 416 : 200, headers });

  const node = fs.createReadStream(absPath, { start, end, highWaterMark: 1024 * 512 });
  const web = Readable.toWeb(node) as ReadableStream;
  return new Response(web, { status: range ? 206 : 200, headers });
}

/**
 * Validate a folder path picked through the OS-native dialog (desktop shell).
 *
 * Security contract:
 *  - Only honoured when the server runs with LOCALDOCK_DESKTOP=1 (the Tauri
 *    shell), so plain web deployments can never register arbitrary folders.
 *  - The path must be absolute, exist, and be a directory.
 *  - It is canonicalized with realpath so symlinks cannot disguise the real
 *    target — the canonical path is what gets stored and sandboxed afterwards.
 *  - Owner authentication is enforced by the caller (requireOwner).
 */
export async function resolveNativeFolder(
  raw: unknown
): Promise<{ ok: true; abs: string } | { ok: false; code: string; message: string }> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, code: "bad-path", message: "Choose a folder first." };
  }
  let trimmed = raw.trim().replace(/^["']|["']$/g, ""); // strip quotes if user pasted with quotes
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, code: "bad-path", message: "The selected path must be an absolute path (e.g. D:\\MyFolder or C:\\Users\\...)." };
  }
  if (trimmed.includes("\u0000")) {
    return { ok: false, code: "bad-path", message: "Invalid folder path." };
  }
  // Normalize Windows paths (e.g. forward slashes or trailing slashes)
  trimmed = path.normalize(trimmed);

  let real: string;
  try {
    real = await fsp.realpath(trimmed);
  } catch {
    // If it doesn't exist, try creating it on the disk
    try {
      await fsp.mkdir(trimmed, { recursive: true });
      real = await fsp.realpath(trimmed);
    } catch (e) {
      return { ok: false, code: "not-found", message: `Could not access or create folder at "${trimmed}".` };
    }
  }
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(real);
  } catch {
    return { ok: false, code: "not-found", message: "That folder no longer exists." };
  }
  if (!stat.isDirectory()) {
    return { ok: false, code: "not-a-dir", message: "The selected path is not a folder." };
  }
  return { ok: true, abs: real };
}

export interface ErrorLoc {
  /** Key into the client i18n `apiErrors` dictionary. */
  key: string;
  /** Optional interpolation params (e.g. { name }). */
  params?: Record<string, string | number>;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  loc?: ErrorLoc
): Response {
  return Response.json({ error: { code, message, loc } }, { status });
}

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data as Record<string, unknown>, { status });
}
