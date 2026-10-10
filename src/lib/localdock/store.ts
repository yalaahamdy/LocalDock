/**
 * LocalDock — persistent JSON store with atomic writes.
 * The filesystem is the product's real database; these files hold only metadata.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * LocalDock home directory.
 *  - Desktop build (Tauri shell): LOCALDOCK_HOME points at %APPDATA%/LocalDock
 *    so user data survives app updates and stays out of Program Files.
 *  - Web/dev: defaults to `<cwd>/localdock` next to the project.
 */
export const HOME = process.env.LOCALDOCK_HOME
  ? path.resolve(process.env.LOCALDOCK_HOME)
  : path.join(process.cwd(), "localdock");

/** True when running under the Windows/Tauri desktop shell. */
export const DESKTOP_MODE = process.env.LOCALDOCK_DESKTOP === "1";
export const DATA_DIR = path.join(HOME, "data");
export const SHARES_DIR = path.join(HOME, "Shares");
export const SITES_DIR = path.join(HOME, "Websites");
export const UPLOADS_DIR = path.join(HOME, ".uploads");

export const FILES = {
  settings: path.join(DATA_DIR, "settings.json"),
  shares: path.join(DATA_DIR, "shares.json"),
  devices: path.join(DATA_DIR, "devices.json"),
  websites: path.join(DATA_DIR, "websites.json"),
  activity: path.join(DATA_DIR, "activity.json"),
  pairing: path.join(DATA_DIR, "pairing.json"),
} as const;

export function ensureHomeLayout(): void {
  for (const dir of [HOME, DATA_DIR, UPLOADS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const cache = new Map<string, { mtime: number; data: unknown }>();

export function invalidateJsonCache(file?: string): void {
  if (file) cache.delete(file);
  else cache.clear();
}

/** Atomic write: write tmp file, fsync, then rename (same dir => same filesystem). */
export async function writeJson(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fh = await fsp.open(tmp, "w");
  try {
    await fh.writeFile(JSON.stringify(data, null, 2), "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, file);
  invalidateJsonCache(file);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const st = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit.data as T;
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw) as T;
    cache.set(file, { mtime: st.mtimeMs, data });
    return data;
  } catch {
    return fallback;
  }
}

/** Serialize mutations per file to avoid lost updates under concurrency. */
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}
