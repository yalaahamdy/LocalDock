"use client";

/**
 * LocalDock — client Transfer Engine.
 *
 * Responsibilities:
 *  - Queue with bounded concurrency (2 parallel files, backpressure per chunk).
 *  - Chunked resumable uploads: init -> missing chunks -> complete(sha256).
 *  - Streaming downloads: File System Access API when available (real disk
 *    streaming + pause/resume + cross-reload resume via IndexedDB handle),
 *    blob fallback for smaller files elsewhere.
 *  - Live speed / ETA per transfer.
 *  - Persistence: the queue survives reloads; upload sessions reconcile
 *    with the server ("resume from 6.2 GB").
 *  - Auto-retry on network blips with capped exponential backoff.
 */
import { create } from "zustand";
import type { TransferItem, TransferStatus } from "../types";
import { Api, getOwnerKey, getDeviceToken, makeApiError } from "./api";
import { activeDictionary } from "../i18n/runtime";

/** Localized transfer-error strings (read at error-creation time). */
const te = () => activeDictionary().transferErrors;

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_PARALLEL = 2;
const MAX_AUTO_RETRIES = 4;
const PERSIST_KEY = "localdock.transfers.v2";
/** Parallel chunk PUTs per upload (keeps the pipe full on Wi-Fi). */
const UPLOAD_PARALLEL = 3;
/** IDM-style parallel range connections per download. */
const DL_MAX_CONNECTIONS = 4;

/**
 * Minimal structural type for FileSystemWritableFileStream — avoids lib.dom
 * variance issues while keeping full type safety at the call sites.
 */
interface WritableLike {
  write(data: Blob | BufferSource | string): Promise<void>;
  seek(position: number): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

interface PersistedTransfer {
  id: string;
  kind: TransferItem["kind"];
  shareId: string;
  shareName: string;
  path: string;
  name: string;
  size: number;
  transferred: number;
  chunkSize: number;
  totalChunks: number;
  uploadId?: string;
  createdAt: number;
  status: TransferStatus;
  error?: string;
  needsFile?: boolean;
}

interface TransfersState {
  items: TransferItem[];
  connected: boolean;
  add: (item: TransferItem) => void;
  patch: (id: string, patch: Partial<TransferItem>) => void;
  remove: (id: string) => void;
  setConnected: (v: boolean) => void;
}

export const useTransfers = create<TransfersState>((set) => ({
  items: [],
  connected: true,
  add: (item) => set((s) => ({ items: [item, ...s.items] })),
  patch: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
  setConnected: (v) => set({ connected: v }),
}));

/**
 * Auth headers for raw (non-Api) transfer fetches. Both identities are sent:
 * the owner key covers the console, the device token covers paired phones —
 * without it, chunk PUTs from a paired device used to 403 mid-transfer.
 */
function transferHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "X-LocalDock-Owner": getOwnerKey() ?? "",
    "X-LocalDock-Device": getDeviceToken() ?? "",
    ...extra,
  };
}

/** Items the floating TransferDock should stay visible for. */
export function selectDockItems(items: TransferItem[]): TransferItem[] {
  return items.filter(
    (i) =>
      i.status === "active" ||
      i.status === "queued" ||
      i.status === "failed" ||
      (i.status === "paused" && i.kind === "upload" && !i.file)
  );
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sliding-window speed sampler (bytes over last 2.5s). */
class Speedometer {
  private samples: { at: number; bytes: number }[] = [];
  push(bytes: number) {
    const now = Date.now();
    this.samples.push({ at: now, bytes });
    while (this.samples.length && now - this.samples[0].at > 2500) this.samples.shift();
  }
  get bps(): number {
    const now = Date.now();
    let bytes = 0;
    for (const s of this.samples) {
      if (now - s.at <= 2500) bytes += s.bytes;
    }
    return Math.round((bytes * 1000) / 2500);
  }
}

/* ------------------------------------------------------------------ */
/* Parallel download planning (IDM-style segmented engine)             */
/* ------------------------------------------------------------------ */

interface DlPlan {
  segSize: number;
  count: number;
  workers: number;
}

/**
 * Split the remaining byte range into segments for parallel downloading.
 * Several connections keep the TCP pipeline full — a single Wi-Fi stream
 * often stalls, which is exactly the "slow & choppy" effect.
 */
function planDownload(total: number, from: number): DlPlan {
  const remaining = Math.max(0, total - from);
  if (remaining <= 8 * 1024 * 1024) {
    return { segSize: Math.max(1, remaining), count: 1, workers: 1 };
  }
  const connections =
    remaining >= 64 * 1024 * 1024 ? DL_MAX_CONNECTIONS : remaining >= 16 * 1024 * 1024 ? 3 : 2;
  // ~6 segments per connection so fast workers never starve; bounded size.
  let segSize = Math.ceil(remaining / (connections * 6));
  segSize = Math.min(Math.max(segSize, 2 * 1024 * 1024), 16 * 1024 * 1024);
  const count = Math.ceil(remaining / segSize);
  return { segSize, count, workers: Math.min(connections, count) };
}

function downloadUrlOf(item: TransferItem): string {
  return `/api/shares/${item.shareId}/download?path=${encodeURIComponent(item.path)}`;
}

function saveBlob(blob: Blob, filename: string) {
  // If running inside LocalDock Android native shell:
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { LocalDockAndroid?: { saveBlob?: (b: string, n: string, m: string) => void } })
      .LocalDockAndroid?.saveBlob === "function"
  ) {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = (reader.result as string) || "";
        const base64 = res.includes(",") ? res.split(",")[1] : res;
        (window as unknown as { LocalDockAndroid: { saveBlob: (b: string, n: string, m: string) => void } })
          .LocalDockAndroid.saveBlob(base64, filename, blob.type || "application/octet-stream");
      };
      reader.readAsDataURL(blob);
      return;
    } catch {
      /* fallback to standard browser download below */
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ------------------------------------------------------------------ */
/* IndexedDB handle storage (cross-reload download resume)             */
/* ------------------------------------------------------------------ */

const idb = {
  async open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return null;
    return new Promise((resolve) => {
      const req = indexedDB.open("localdock", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },
  async put(key: string, value: unknown): Promise<void> {
    const db = await idb.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
  async get<T>(key: string): Promise<T | null> {
    const db = await idb.open();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction("handles", "readonly");
      const req = tx.objectStore("handles").get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  },
  async del(key: string): Promise<void> {
    const db = await idb.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

class TransferEngine {
  private running = 0;
  private speedometers = new Map<string, Speedometer>();
  private booted = false;
  private lastActivityReport = new Map<string, number>();
  private uploadCompletedListeners = new Set<
    (info: { shareId: string; dirPath: string; name: string }) => void
  >();

  /* Download runtime state — session-scoped, never persisted:
   *  - dlSegments: finished in-memory segments (blob path, survives pause/retry)
   *  - dlPlans: the segment plan a pause/resume must stick to
   *  - dlWriters: the ONE open disk writer per active streaming download
   *  - dlWriting: whether the ordered flusher is mid-write (settle signal)
   */
  private dlSegments = new Map<string, Map<number, Blob>>();
  private dlPlans = new Map<string, DlPlan & { base: number }>();
  private dlWriters = new Map<string, { writable: WritableLike; writePos: number }>();
  private dlWriting = new Map<string, boolean>();

  /**
   * Subscribe to upload completions — used by the file browser to refresh the
   * open folder the moment a file lands on disk (no manual re-entry needed).
   * Returns an unsubscribe function.
   */
  onUploadCompleted(
    listener: (info: { shareId: string; dirPath: string; name: string }) => void
  ): () => void {
    this.uploadCompletedListeners.add(listener);
    return () => this.uploadCompletedListeners.delete(listener);
  }

  private notifyUploadCompleted(info: { shareId: string; dirPath: string; name: string }) {
    for (const l of this.uploadCompletedListeners) {
      try {
        l(info);
      } catch {
        /* listener errors must never break the queue */
      }
    }
  }

  /**
   * Cross-device download heartbeat. Throttled to ~1/s (unless `force`); the
   * server exposes these through the ?summary=1 poll, so every other open
   * device sees this download live — the same picture uploads already get.
   * Failures are deliberately swallowed: activity display must never break
   * the actual transfer.
   */
  private reportActivity(
    itemOrId: TransferItem | string,
    status: "active" | "done" | "failed" | "canceled" = "active",
    force = false
  ) {
    if (typeof window === "undefined") return;
    const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
    // Read the FRESH item from the store — the closure reference goes stale
    // after the first patch(), which used to report outdated progress to
    // the other devices.
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const now = Date.now();
    if (!force) {
      const last = this.lastActivityReport.get(item.id) ?? 0;
      if (now - last < 1000) return;
    }
    this.lastActivityReport.set(item.id, now);
    void Api.reportTransfer(item.shareId, {
      key: `dl-${item.id}`.slice(0, 80),
      name: item.name,
      size: item.size,
      transferred: Math.min(item.transferred, item.size),
      status,
    });
    if (status !== "active") this.lastActivityReport.delete(item.id);
  }

  boot() {
    if (this.booted || typeof window === "undefined") return;
    this.booted = true;
    void this.restore();
    window.addEventListener("online", () => this.retryInterrupted());
    window.addEventListener("pagehide", () => this.commitWriters());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.retryInterrupted();
    });
  }

  /**
   * Commit open download writers (swap file → real file) so a reload
   * resumes from real disk state instead of re-downloading the whole run.
   */
  private commitWriters() {
    for (const [id, w] of this.dlWriters) {
      this.dlWriters.delete(id);
      try {
        void w.writable.close().catch(() => undefined);
      } catch {
        /* page is going away */
      }
    }
  }

  get items() {
    return useTransfers.getState().items;
  }

  /* ---------- public API ---------- */

  enqueueUpload(input: {
    shareId: string;
    shareName: string;
    dirPath: string;
    file: File;
  }): string {
    const id = uid();
    const item: TransferItem = {
      id,
      kind: "upload",
      shareId: input.shareId,
      shareName: input.shareName,
      path: input.dirPath,
      name: input.file.name,
      size: input.file.size,
      transferred: 0,
      status: "queued",
      speedBps: 0,
      etaSec: null,
      createdAt: Date.now(),
      chunkSize: CHUNK_SIZE,
      totalChunks: Math.max(1, Math.ceil(input.file.size / CHUNK_SIZE)),
      receivedChunks: new Set<number>(),
      file: input.file,
      controller: new AbortController(),
    };
    useTransfers.getState().add(item);
    this.persist();
    this.pump();
    return id;
  }

  /** Re-attach a picked file to an interrupted (restored) upload, then resume. */
  reattachUpload(id: string, file: File): { ok: boolean; reason?: string } {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.kind !== "upload") return { ok: false, reason: te().notFound };
    if (file.name !== item.name || file.size !== item.size) {
      return {
        ok: false,
        reason: te().wrongFile,
      };
    }
    useTransfers.getState().patch(id, { file, status: "queued", needsFile: false, error: undefined });
    this.persist();
    this.pump();
    return { ok: true };
  }

  enqueueDownload(input: {
    shareId: string;
    shareName: string;
    filePath: string;
    name: string;
    size: number;
  }): string {
    const id = uid();
    const item: TransferItem = {
      id,
      kind: "download",
      shareId: input.shareId,
      shareName: input.shareName,
      path: input.filePath,
      name: input.name,
      size: input.size,
      transferred: 0,
      status: "queued",
      speedBps: 0,
      etaSec: null,
      createdAt: Date.now(),
      chunkSize: CHUNK_SIZE,
      totalChunks: Math.max(1, Math.ceil(input.size / CHUNK_SIZE)),
      receivedChunks: new Set<number>(),
      controller: new AbortController(),
    };
    useTransfers.getState().add(item);
    this.persist();
    this.pump();
    return id;
  }

  pause(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "active" || item.status === "queued") {
      item.controller?.abort();
      useTransfers.getState().patch(id, { status: "paused", speedBps: 0, etaSec: null });
      this.persist();
    }
  }

  resume(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "paused") {
      if (item.kind === "upload" && !item.file) {
        useTransfers.getState().patch(id, { needsFile: true });
        this.persist();
        return;
      }
      useTransfers.getState().patch(id, {
        status: "queued",
        error: undefined,
        controller: new AbortController(),
      });
      this.persist();
      this.pump();
    }
  }

  async cancel(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.controller?.abort();
    if (item.kind === "upload" && item.uploadId) {
      await Api.uploadCancel(item.uploadId).catch(() => undefined);
    }
    if (item.kind === "download") {
      const writer = this.dlWriters.get(id);
      if (writer) {
        this.dlWriters.delete(id);
        try {
          // abort() discards the swap file — nothing partial is committed
          if (writer.writable.abort) await writer.writable.abort();
          else await writer.writable.close();
        } catch {
          /* already closed */
        }
      }
      this.dlSegments.delete(id);
      this.dlPlans.delete(id);
      await idb.del(id);
      this.reportActivity(item, "canceled", true); // vanish instantly elsewhere
    }
    useTransfers.getState().patch(id, { status: "canceled" });
    this.persist();
  }

  retry(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.kind === "upload" && !item.file) {
      useTransfers.getState().patch(id, { needsFile: true });
      this.persist();
      return;
    }
    useTransfers.getState().patch(id, {
      status: "queued",
      transferred: item.kind === "download" ? item.transferred : item.transferred,
      error: undefined,
      controller: new AbortController(),
    });
    this.persist();
    this.pump();
  }

  dismiss(id: string) {
    this.cancel(id).finally(() => {
      setTimeout(() => useTransfers.getState().remove(id), 0);
      this.persist();
    });
  }

  /* ---------- queue machinery ---------- */

  private pump() {
    if (this.running >= MAX_PARALLEL) return;
    const state = useTransfers.getState();
    const next = state.items.find(
      (i) => i.status === "queued" && (i.kind === "download" || !!i.file)
    );
    if (!next) return;
    this.running++;
    useTransfers.getState().patch(next.id, { status: "active", startedAt: Date.now() });
    void this.run(next)
      .catch((err: Error & { code?: string }) => {
        this.handleFailure(next.id, err);
      })
      .finally(() => {
        this.running--;
        this.persist();
        this.pump();
      });
  }

  private handleFailure(id: string, err: Error & { code?: string; friendly?: string }) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const state = useTransfers.getState();
    // paused or canceled by the user? controller abort lands here too.
    if (item.status !== "active") return;

    const networkish =
      err.code === "network" || err.code === "http-0" || !err.code;
    if (networkish) {
      state.setConnected(false);
      state.patch(id, { status: "paused", error: te().connectionLost });
      this.persist();
      setTimeout(() => {
        const cur = this.items.find((i) => i.id === id);
        if (cur && cur.status === "paused") this.retry(id);
      }, 3000);
      return;
    }
    state.patch(id, {
      status: "failed",
      error: err.friendly || err.message || te().generic,
    });
    if (item.kind === "download") this.reportActivity(item, "failed", true);
    this.persist();
  }

  /* ---------- upload runner ---------- */

  private async run(item: TransferItem) {
    useTransfers.getState().setConnected(true);
    if (item.kind === "upload") await this.runUpload(item);
    else await this.runDownload(item);
  }

  private async runUpload(item: TransferItem) {
    const file = item.file!;
    let received = new Set(item.receivedChunks);
    let uploadId = item.uploadId;

    const initOrResume = async (): Promise<void> => {
      const res = await Api.uploadInit({
        shareId: item.shareId,
        dirPath: item.path,
        name: file.name,
        size: file.size,
        chunkSize: item.chunkSize,
        resumeUploadId: uploadId,
      });
      uploadId = res.uploadId;
      item.uploadId = uploadId;
      item.totalChunks = res.totalChunks;
      item.chunkSize = res.chunkSize;
      received = new Set(res.receivedChunks);
      useTransfers.getState().patch(item.id, {
        uploadId,
        totalChunks: res.totalChunks,
        chunkSize: res.chunkSize,
        receivedChunks: received,
        name: res.finalName,
      });
    };

    await this.withRetry(item, initOrResume);
    if (!this.stillActive(item.id)) return;

    const bytesOf = (chunks: Set<number>): number => {
      let sum = 0;
      for (const i of chunks) {
        const isLast = i === item.totalChunks - 1;
        sum += isLast
          ? Math.max(0, item.size - (item.totalChunks - 1) * item.chunkSize)
          : item.chunkSize;
      }
      return sum;
    };

    // chunks already on the server count instantly
    useTransfers.getState().patch(item.id, { transferred: bytesOf(received) });

    const speedo = this.speedo(item.id);

    // Parallel chunk pipeline: N workers pull from the missing-chunks queue.
    // Same philosophy as the parallel download engine — keep the pipe full.
    let pass = 0;
    for (;;) {
      if (!this.stillActive(item.id)) return;
      pass++;
      if (pass > item.totalChunks + 6) {
        throw makeApiError(0, "stalled", te().uploadStalled);
      }
      const missing: number[] = [];
      for (let i = 0; i < item.totalChunks; i++) {
        if (!received.has(i)) missing.push(i);
      }
      if (missing.length === 0) break;

      let cursor = 0;
      let workers = 0;
      const runWorker = async (): Promise<void> => {
        workers++;
        useTransfers.getState().patch(item.id, { connections: Math.max(1, workers) });
        try {
          for (;;) {
            if (!this.stillActive(item.id)) return;
            const my = cursor++;
            if (my >= missing.length) return;
            const index = missing[my];
            const start = index * item.chunkSize;
            const end = Math.min(file.size, start + item.chunkSize);
            const blob = file.slice(start, end);

            await this.withRetry(item, async () => {
              const res = await fetch(
                `/api/upload/chunk?uploadId=${encodeURIComponent(uploadId!)}&index=${index}`,
                {
                  method: "PUT",
                  body: blob,
                  headers: transferHeaders({ "Content-Type": "application/octet-stream" }),
                  signal: item.controller?.signal,
                }
              );
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as
                  | { error?: { code?: string; message?: string } }
                  | null;
                throw makeApiError(
                  res.status,
                  body?.error?.code ?? `http-${res.status}`,
                  body?.error?.message ?? te().chunkFailed
                );
              }
              received.add(index);
              speedo.push(blob.size);
              const transferred = bytesOf(received);
              const bps = speedo.bps;
              useTransfers.getState().patch(item.id, {
                transferred: Math.min(transferred, item.size),
                speedBps: bps,
                etaSec: bps > 0 ? (item.size - transferred) / bps : null,
                receivedChunks: new Set(received),
              });
            });
            this.persistThrottled();
          }
        } finally {
          workers--;
          useTransfers.getState().patch(item.id, { connections: Math.max(0, workers) });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_PARALLEL, missing.length) }, () => runWorker())
      );
    }

    if (!this.stillActive(item.id)) return;

    // Finalize + server-side integrity check
    await this.withRetry(item, async () => {
      const res = await Api.uploadComplete(item.uploadId!);
      if (res.incomplete) {
        const missing = res.missingChunks ?? [];
        received = new Set([...received].filter((i) => !missing.includes(i)));
        return; // loop will resend missing chunks
      }
      const info = res.upload;
      if (!info) {
        // Server confirmed completion but sent no session info — treat as done.
        useTransfers.getState().patch(item.id, {
          status: "completed",
          transferred: item.size,
          speedBps: 0,
          etaSec: null,
          completedAt: Date.now(),
        });
        this.persist();
        this.notifyUploadCompleted({
          shareId: item.shareId,
          dirPath: item.path,
          name: item.name,
        });
        return;
      }
      useTransfers.getState().patch(item.id, {
        status: "completed",
        transferred: item.size,
        speedBps: 0,
        etaSec: null,
        completedAt: Date.now(),
        name: info.finalName,
        hashHex: info.sha256,
      });
      this.persist();
      // Tell the UI (file browser, etc.) that a file just landed on disk.
      this.notifyUploadCompleted({
        shareId: item.shareId,
        dirPath: item.path,
        name: info.finalName,
      });
    });
  }

  /* ---------- download runner (IDM-style parallel segments) ---------- */

  /**
   * Parallel segmented downloads:
   *  - Desktop (File System Access API): up to 4 range connections stream
   *    segments into ONE open writable; an ordered flusher writes them to
   *    disk contiguously. The old code re-opened createWritable() for every
   *    4 MB chunk, forcing the browser to copy the whole file into a swap
   *    file per chunk (O(n²) copying) — the main reason big downloads were
   *    slow and choppy.
   *  - Everywhere else: segments land in memory and assemble into a Blob.
   * Both paths keep pause/resume and the cross-device live heartbeat.
   */
  private async runDownload(item: TransferItem) {
    const speedo = this.speedo(item.id);
    this.reportActivity(item, "active", true); // tell the other devices

    if (item.size <= 0) {
      saveBlob(new Blob([]), item.name);
      useTransfers.getState().patch(item.id, {
        status: "completed",
        transferred: 0,
        speedBps: 0,
        etaSec: null,
        completedAt: Date.now(),
        connections: 0,
      });
      this.reportActivity(item, "done", true);
      this.persist();
      return;
    }

    if (
      typeof window !== "undefined" &&
      typeof (window as unknown as {
        LocalDockAndroid?: {
          downloadDirect?: (u: string, n: string, s: number, d: string, o: string) => void;
        };
      }).LocalDockAndroid?.downloadDirect === "function"
    ) {
      const fullUrl = new URL(downloadUrlOf(item), window.location.origin).href;
      (window as unknown as {
        LocalDockAndroid: {
          downloadDirect: (u: string, n: string, s: number, d: string, o: string) => void;
        };
      }).LocalDockAndroid.downloadDirect(
        fullUrl,
        item.name,
        item.size,
        getDeviceToken() ?? "",
        getOwnerKey() ?? ""
      );
      useTransfers.getState().patch(item.id, {
        status: "completed",
        transferred: item.size,
        speedBps: 0,
        etaSec: null,
        completedAt: Date.now(),
        connections: 0,
      });
      this.reportActivity(item, "done", true);
      this.persist();
      return;
    }

    const canStream =
      typeof window !== "undefined" &&
      "showSaveFilePicker" in window &&
      item.size > 8 * 1024 * 1024;

    if (canStream) {
      await this.downloadToDisk(item, speedo);
      return;
    }
    await this.downloadToBlob(item, speedo);
  }

  /**
   * Shared segment scheduler: N parallel workers each claim the next
   * byte-range segment from `indices` and deliver it to `onSegment`.
   * Retries live inside each segment; abort (pause/cancel) kills all.
   */
  private async runSegments(
    item: TransferItem,
    opts: {
      url: string;
      indices: number[];
      segSize: number;
      base: number;
      workers: number;
      speedo: Speedometer;
      onSegment: (index: number, parts: BlobPart[]) => Promise<void>;
      onBytes: (n: number) => void;
    }
  ): Promise<void> {
    const { url, speedo, onSegment, onBytes } = opts;
    const queue = opts.indices;
    let cursor = 0;
    let workers = 0;

    const runWorker = async (): Promise<void> => {
      workers++;
      useTransfers.getState().patch(item.id, { connections: Math.max(1, workers) });
      try {
        for (;;) {
          if (!this.stillActive(item.id)) return;
          const my = cursor++;
          if (my >= queue.length) return;
          const index = queue[my];
          const start = opts.base + index * opts.segSize;
          const end = Math.min(item.size, start + opts.segSize) - 1;
          await this.withRetry(item, async () => {
            const res = await fetch(url, {
              headers: transferHeaders({ Range: `bytes=${start}-${end}` }),
              signal: item.controller?.signal,
            });
            // A plain 200 (range ignored) is only acceptable when this
            // "segment" is actually the whole file.
            if (
              res.status !== 206 &&
              !(res.status === 200 && start === 0 && end === item.size - 1)
            ) {
              const body = (await res.json().catch(() => null)) as
                | { error?: { message?: string } }
                | null;
              throw makeApiError(
                res.status,
                `http-${res.status}`,
                body?.error?.message ?? te().downloadFailed
              );
            }
            const reader = res.body!.getReader();
            const parts: BlobPart[] = [];
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              parts.push(value as unknown as BlobPart);
              speedo.push(value.byteLength);
              onBytes(value.byteLength);
            }
            const expected = end - start + 1;
            const got = parts.reduce(
              (a, p) => a + (p as ArrayBufferView).byteLength,
              0
            );
            if (got !== expected) {
              throw makeApiError(0, "network", te().segmentDropped);
            }
            await onSegment(index, parts);
          });
        }
      } finally {
        workers--;
        useTransfers.getState().patch(item.id, { connections: Math.max(0, workers) });
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, opts.workers) }, () => runWorker()));
  }

  /* ----- sink 1: streaming to real disk (File System Access API) ----- */

  private async downloadToDisk(item: TransferItem, speedo: Speedometer) {
    const url = downloadUrlOf(item);

    let handle: FileSystemFileHandle | null =
      (await idb.get<FileSystemFileHandle>(item.id)) ?? null;

    try {
      if (!handle) {
        handle = await (window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: item.name,
          types: [{ description: te().fileKind, accept: { "*/*": [`.${this.extOf(item.name) || "bin"}`] } }],
        });
        await idb.put(item.id, handle);
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "AbortError") {
        useTransfers.getState().patch(item.id, { status: "paused", error: undefined });
        this.persist();
        return;
      }
      await this.downloadToBlob(item, speedo);
      return;
    }

    // Settle any writes from a previous run of this item before reading the
    // resume point (pause keeps the writer open — its tail writes may still
    // be flushing).
    let settleGuard = 0;
    while (this.dlWriting.get(item.id) && settleGuard < 400) {
      await new Promise((r) => setTimeout(r, 5));
      settleGuard++;
    }

    // ONE writable for the whole run — kept open across pause/resume within
    // this page session. (Reopening per chunk used to force the browser to
    // copy the entire file into a fresh swap each time.)
    let writer = this.dlWriters.get(item.id);
    if (!writer) {
      let offset = 0;
      try {
        const file = await handle.getFile();
        offset = Math.min(file.size, item.size);
      } catch {
        offset = 0;
      }
      const writable = await (
        handle as FileSystemFileHandle & {
          createWritable: (opts?: { keepExistingData?: boolean }) => Promise<WritableLike>;
        }
      ).createWritable({ keepExistingData: true });
      await writable.seek(offset);
      writer = { writable, writePos: offset };
      this.dlWriters.set(item.id, writer);
    }

    if (writer.writePos >= item.size && item.size > 0) {
      // everything is already on disk (e.g. resumed after a finished run)
      try {
        await writer.writable.close();
      } catch {
        /* already closed */
      }
      this.dlWriters.delete(item.id);
      useTransfers.getState().patch(item.id, {
        status: "completed",
        transferred: item.size,
        completedAt: Date.now(),
        speedBps: 0,
        etaSec: null,
        connections: 0,
      });
      await idb.del(item.id);
      this.reportActivity(item, "done", true);
      this.persist();
      return;
    }
    useTransfers.getState().patch(item.id, {
      transferred: writer.writePos,
      connections: 0,
    });

    const { segSize, count, workers } = planDownload(item.size, writer.writePos);
    const base = writer.writePos;

    // Ordered flusher: segments finish out of order; only a contiguous run
    // is written, so the disk file stays valid & resumable at all times.
    const pending = new Map<number, BlobPart[]>();
    let nextToWrite = 0;
    let writeError: Error | null = null;

    const pumpWrites = async (): Promise<void> => {
      if (this.dlWriting.get(item.id) || !writer) return;
      this.dlWriting.set(item.id, true);
      try {
        for (;;) {
          const parts = pending.get(nextToWrite);
          if (!parts || !writer) break;
          pending.delete(nextToWrite);
          for (const part of parts) await writer.writable.write(part);
          nextToWrite++;
          writer.writePos += parts.reduce(
            (a, p) => a + (p as ArrayBufferView).byteLength,
            0
          );
          useTransfers.getState().patch(item.id, { transferred: writer.writePos });
        }
      } catch (err) {
        writeError = err as Error;
      } finally {
        this.dlWriting.set(item.id, false);
      }
    };

    await this.runSegments(item, {
      url,
      indices: Array.from({ length: count }, (_, i) => i),
      segSize,
      base,
      workers,
      speedo,
      onBytes: () => {
        this.reportActivity(item); // throttled heartbeat for other devices
      },
      onSegment: async (index, parts) => {
        pending.set(index, parts);
        void pumpWrites();
        // wait until THIS segment actually reached the disk (contiguity)
        while (nextToWrite <= index && !writeError && this.stillActive(item.id)) {
          await new Promise((r) => setTimeout(r, 5));
        }
        if (writeError) throw writeError;
        if (!this.stillActive(item.id)) {
          throw makeApiError(0, "aborted", te().stopped);
        }
      },
    });

    if (!this.stillActive(item.id)) {
      // Paused or canceled mid-flight — deliberately leave the writer open
      // in dlWriters: resume() reuses it (no re-copy, no progress loss) and
      // cancel() aborts & discards it.
      return;
    }

    // Drain the tail writes, then commit the file.
    let drainGuard = 0;
    while (this.dlWriting.get(item.id) && drainGuard < 2400) {
      await new Promise((r) => setTimeout(r, 5));
      drainGuard++;
    }
    if (writeError) throw writeError;
    if (nextToWrite < count) {
      throw makeApiError(0, "network", te().downloadInterrupted);
    }

    await writer.writable.close();
    this.dlWriters.delete(item.id);

    useTransfers.getState().patch(item.id, {
      status: "completed",
      transferred: item.size,
      speedBps: 0,
      etaSec: null,
      completedAt: Date.now(),
      connections: 0,
    });
    await idb.del(item.id);
    this.reportActivity(item, "done", true);
    this.persist();
  }

  /* ----- sink 2: in-memory segments → Blob (mobile & other browsers) ----- */

  private async downloadToBlob(item: TransferItem, speedo: Speedometer) {
    const url = downloadUrlOf(item);

    // Finished segments survive pause/retry in memory, so a network blip
    // never re-downloads them. (The old single-stream "resume" actually
    // produced corrupt files after a drop — this replaces it.)
    const segs = this.dlSegments.get(item.id) ?? new Map<number, Blob>();
    this.dlSegments.set(item.id, segs);
    let plan = this.dlPlans.get(item.id);
    if (!plan) {
      plan = { ...planDownload(item.size, 0), base: 0 };
      this.dlPlans.set(item.id, plan);
    }

    let committed = 0;
    const missing: number[] = [];
    for (let i = 0; i < plan.count; i++) {
      const have = segs.get(i);
      if (have) committed += have.size;
      else missing.push(i);
    }
    if (missing.length === 0) {
      this.finishBlobDownload(item, plan.count, segs);
      return;
    }
    useTransfers.getState().patch(item.id, {
      transferred: committed,
      connections: 0,
    });

    let received = committed;
    await this.runSegments(item, {
      url,
      indices: missing,
      segSize: plan.segSize,
      base: plan.base,
      workers: Math.min(plan.workers, missing.length),
      speedo,
      onBytes: (n) => {
        received += n;
        const bps = speedo.bps;
        useTransfers.getState().patch(item.id, {
          transferred: Math.min(received, item.size),
          speedBps: bps,
          etaSec: bps > 0 ? Math.max(0, item.size - received) / bps : null,
        });
        this.reportActivity(item); // throttled heartbeat for other devices
      },
      onSegment: async (index, parts) => {
        segs.set(index, new Blob(parts));
        this.persistThrottled();
      },
    });

    this.finishBlobDownload(item, plan.count, segs);
  }

  private finishBlobDownload(item: TransferItem, count: number, segs: Map<number, Blob>) {
    const ordered: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const part = segs.get(i);
      if (!part) {
        throw makeApiError(0, "internal", te().segmentsIncomplete);
      }
      ordered.push(part);
    }
    saveBlob(new Blob(ordered), item.name);
    this.dlSegments.delete(item.id);
    this.dlPlans.delete(item.id);

    useTransfers.getState().patch(item.id, {
      status: "completed",
      transferred: item.size,
      speedBps: 0,
      etaSec: null,
      completedAt: Date.now(),
      connections: 0,
    });
    this.reportActivity(item, "done", true);
    this.persist();
  }

  /* ---------- helpers ---------- */

  private speedo(id: string): Speedometer {
    let s = this.speedometers.get(id);
    if (!s) {
      s = new Speedometer();
      this.speedometers.set(id, s);
    }
    return s;
  }

  private stillActive(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    return !!item && item.status === "active";
  }

  private extOf(name: string): string {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i + 1) : "";
  }

  private async withRetry(item: TransferItem, fn: () => Promise<void>): Promise<void> {
    let attempt = 0;
    for (;;) {
      try {
        await fn();
        return;
      } catch (err) {
        const e = err as Error & { name?: string; code?: string };
        if (e.name === "AbortError") throw e;
        attempt++;
        if (attempt > MAX_AUTO_RETRIES || (e.code && !["network", "http-0", "http-502", "http-503", "http-504"].includes(e.code))) {
          throw e;
        }
        await new Promise((r) => setTimeout(r, Math.min(800 * 2 ** attempt, 8000)));
        useTransfers.getState().patch(item.id, { speedBps: 0 });
      }
    }
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistThrottled() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 800);
  }

  private persist() {
    if (typeof window === "undefined") return;
    const snapshot: PersistedTransfer[] = this.items
      .filter((i) => ["queued", "active", "paused", "failed"].includes(i.status))
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        shareId: i.shareId,
        shareName: i.shareName,
        path: i.path,
        name: i.name,
        size: i.size,
        transferred: i.transferred,
        chunkSize: i.chunkSize,
        totalChunks: i.totalChunks,
        uploadId: i.uploadId,
        createdAt: i.createdAt,
        status: i.status === "active" ? "paused" : i.status,
        error: i.error,
        needsFile: i.kind === "upload",
      }));
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage full — non-fatal */
    }
  }

  private async restore() {
    let snapshot: PersistedTransfer[] = [];
    try {
      snapshot = JSON.parse(window.localStorage.getItem(PERSIST_KEY) ?? "[]");
    } catch {
      return;
    }
    if (!snapshot.length) return;

    const restored: TransferItem[] = [];
    for (const p of snapshot) {
      if (p.kind === "upload") {
        // Reconcile with the server: is the session still alive?
        let received = 0;
        if (p.uploadId) {
          try {
            const res = await Api.uploadStatus(p.uploadId);
            if (res.session) received = res.session.receivedChunks.length;
          } catch {
            /* server unreachable; keep paused */
          }
        }
        restored.push({
          ...p,
          transferred: received * p.chunkSize,
          receivedChunks: new Set(),
          status: "paused",
          speedBps: 0,
          etaSec: null,
          error: te().reconnectHint,
          file: undefined,
          controller: undefined,
        } as unknown as TransferItem);
      } else {
        // download: try to find a persisted file handle
        const handle = await idb.get<FileSystemFileHandle>(p.id);
        if (!handle) continue; // blob downloads can't resume across reloads
        let transferred = p.transferred;
        try {
          const f = await handle.getFile();
          transferred = Math.min(f.size, p.size);
        } catch {
          /* keep value */
        }
        restored.push({
          ...p,
          transferred,
          receivedChunks: new Set(),
          status: "paused",
          speedBps: 0,
          etaSec: null,
          error: undefined,
          controller: undefined,
        } as unknown as TransferItem);
      }
    }
    if (restored.length) {
      useTransfers.setState((s) => ({ items: [...restored, ...s.items] }));
      this.persist();
    }
  }

  private retryInterrupted() {
    useTransfers.getState().setConnected(true);
    for (const item of this.items) {
      if (item.status === "paused" && item.error?.includes("network")) this.retry(item.id);
    }
  }
}

export const transfers = new TransferEngine();

/* Convenience selectors */
export function selectActiveCount(items: TransferItem[]): number {
  return items.filter((i) => i.status === "active" || i.status === "queued").length;
}
