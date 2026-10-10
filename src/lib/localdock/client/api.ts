"use client";

/**
 * LocalDock — client API wrapper.
 * Injects the owner key for the console and normalizes server errors into
 * friendly, actionable messages (UX rule 5: what happened, why, what to do).
 */
import type {
  ActivityEntry,
  Device,
  FileEntry,
  LocalDockSettings,
  Share,
  SystemStatus,
  TransferActivity,
  UploadSessionInfo,
  Website,
} from "../types";
import { activeDictionary } from "../i18n/runtime";

export interface ApiError extends Error {
  code: string;
  status: number;
  friendly: string;
  /** Optional structured localization hint from the server. */
  loc?: { key: string; params?: Record<string, string | number> };
}

export function makeApiError(
  status: number,
  code: string,
  message: string,
  loc?: { key: string; params?: Record<string, string | number> }
): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  err.friendly = message;
  err.loc = loc;
  return err;
}

/**
 * Best-effort localized text for any thrown error: uses the server's `loc`
 * hint when present, else the raw message (already localized for errors we
 * create client-side). Falls back to a generic localized line.
 */
export function apiErrorMessage(e: unknown): string {
  const errors = activeDictionary().apiErrors;
  const err = e as ApiError | undefined;
  if (err && typeof err === "object" && err.loc) {
    const value = (errors as Record<string, unknown>)[err.loc.key];
    if (typeof value === "function") {
      const name = err.loc.params?.name;
      return (value as (n: string) => string)(
        typeof name === "string" ? name : ""
      );
    }
    if (typeof value === "string") return value;
  }
  if (err && err instanceof Error && err.message) return err.message;
  return errors.generic;
}

let ownerKey: string | null = null;
export function setOwnerKey(key: string | null) {
  ownerKey = key;
  if (typeof document !== "undefined") {
    if (key) {
      document.cookie = `localdock_owner=${encodeURIComponent(key)}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `localdock_owner=; path=/; max-age=0; SameSite=Lax`;
    }
  }
}
export function getOwnerKey() {
  return ownerKey;
}

let deviceToken: string | null = null;
const DEVICE_TOKEN_KEY = "localdock.deviceToken";
export function loadDeviceToken() {
  if (typeof window === "undefined") return null;
  deviceToken = window.localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken && typeof document !== "undefined") {
    document.cookie = `localdock_device=${encodeURIComponent(deviceToken)}; path=/; max-age=31536000; SameSite=Lax`;
  }
  return deviceToken;
}
export function saveDeviceToken(token: string) {
  if (typeof window === "undefined") return;
  deviceToken = token;
  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  if (typeof document !== "undefined") {
    document.cookie = `localdock_device=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
  }
}
export function clearDeviceToken() {
  if (typeof window === "undefined") return;
  deviceToken = null;
  window.localStorage.removeItem(DEVICE_TOKEN_KEY);
  if (typeof document !== "undefined") {
    document.cookie = `localdock_device=; path=/; max-age=0; SameSite=Lax`;
  }
}
export function getDeviceToken() {
  return deviceToken;
}

/**
 * Stable per-browser id — lets a device recognize its own transfer activity
 * (and filter it out of the "other devices" tray). Persisted once.
 */
const CLIENT_ID_KEY = "localdock.clientId";
let clientIdValue: string | null = null;
export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  if (clientIdValue) return clientIdValue;
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id || !/^[a-zA-Z0-9_-]{4,80}$/.test(id)) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  clientIdValue = id;
  return id;
}

/** Friendly name this device reports for itself (browser + OS hints). */
export function selfDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone"
      : /Macintosh|Mac OS/i.test(ua)
        ? "Mac"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua) && !/Chromium/.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [os, browser].filter(Boolean).join(" · ");
}

export async function api<T>(
  path: string,
  init?: RequestInit & { raw?: boolean }
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (ownerKey) headers.set("X-LocalDock-Owner", ownerKey);
  if (deviceToken) headers.set("X-LocalDock-Device", deviceToken);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    const errors = activeDictionary().apiErrors;
    throw makeApiError(0, "network", errors.network);
  }

  if (init?.raw) return res as unknown as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const err = (body as {
      error?: {
        code?: string;
        message?: string;
        loc?: { key: string; params?: Record<string, string | number> };
      };
    })?.error;
    const errors = activeDictionary().apiErrors;
    throw makeApiError(
      res.status,
      err?.code ?? `http-${res.status}`,
      err?.message ?? errors.generic,
      err?.loc
    );
  }
  return body as T;
}

/* ---------------- typed endpoints ---------------- */

export interface BootstrapInfo {
  version: string;
  serverId: string;
  serverName: string;
  ownerKey: string;
  onboarded: boolean;
  baseUrl: string;
  /** First non-loopback LAN IPv4 — used to build QR & share links for other devices. */
  lanIp?: string | null;
  /** True under the Windows/Tauri desktop shell. */
  desktop?: boolean;
}

export const Api = {
  bootstrap: () => api<BootstrapInfo>("/api/bootstrap"),

  system: () => api<SystemStatus>("/api/system"),

  activity: (limit = 40) => api<{ activity: ActivityEntry[] }>(`/api/activity?limit=${limit}`),

  settings: () => api<{ settings: LocalDockSettings }>("/api/settings"),

  updateSettings: (patch: Partial<LocalDockSettings>) =>
    api<{ settings: LocalDockSettings }>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  shares: () => api<{ shares: Share[] }>("/api/shares"),
  createShare: (input: {
    name: string;
    /** Folder inside the LocalDock home (web folder browser). */
    homeDirRel?: string;
    /** Absolute OS path from the native dialog (desktop build only). */
    absPath?: string;
    /**
     * Companion-device flow: create the share inside the server-managed
     * "From Devices" area; the caller uploads the content right after.
     */
    viaUpload?: boolean;
    access: "read" | "readwrite";
    guestEnabled: boolean;
  }) =>
    api<{ share: Share }>("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateShare: (
    id: string,
    patch: Partial<Pick<Share, "name" | "access" | "guestEnabled" | "allowedDevices" | "guestExpiresAt">> & {
      rotateSlug?: boolean;
    }
  ) =>
    api<{ share: Share }>(`/api/shares/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteShare: (id: string) =>
    api<{ ok: boolean }>(`/api/shares/${id}`, { method: "DELETE" }),
  updateDevice: (id: string, name: string) =>
    api<{ device: Device }>(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  clearActivity: () =>
    api<{ ok: boolean }>("/api/activity", { method: "DELETE" }),

  browse: (shareId: string, path: string) =>
    api<{ path: string; entries: FileEntry[] }>(
      `/api/shares/${shareId}/browse?path=${encodeURIComponent(path)}`
    ),
  /** Cheap directory fingerprint for live-refresh polling (+ live activity). */
  browseSummary: (shareId: string, path: string) =>
    api<{
      path: string;
      summary: { count: number; size: number; latest: number };
      activity?: TransferActivity[];
    }>(
      `/api/shares/${shareId}/browse?path=${encodeURIComponent(path)}&summary=1`
    ),
  /**
   * Download heartbeat so OTHER devices see this download live.
   * Throttled by the transfer engine (~1/s) — failures are swallowed.
   */
  reportTransfer: (
    shareId: string,
    input: {
      key: string;
      name: string;
      size: number;
      transferred: number;
      status: "active" | "done" | "failed" | "canceled";
    }
  ) =>
    fetch(`/api/shares/${shareId}/transfer-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LocalDock-Owner": getOwnerKey() ?? "",
        "X-LocalDock-Device": getDeviceToken() ?? "",
      },
      body: JSON.stringify({
        ...input,
        clientId: getClientId(),
        deviceName: selfDeviceName(),
      }),
    }).catch(() => undefined),
  search: (shareId: string, q: string, path = "") =>
    api<{ results: FileEntry[] }>(
      `/api/shares/${shareId}/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(path)}`
    ),
  createFolder: (shareId: string, path: string, name: string) =>
    api<{ ok: boolean; name: string }>(`/api/shares/${shareId}/folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name }),
    }),
  renameEntry: (shareId: string, path: string, name: string) =>
    api<{ ok: boolean }>(`/api/shares/${shareId}/entry`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name }),
    }),
  deleteEntry: (shareId: string, path: string) =>
    api<{ ok: boolean }>(
      `/api/shares/${shareId}/entry?path=${encodeURIComponent(path)}`,
      { method: "DELETE" }
    ),
  fileHash: (shareId: string, path: string) =>
    api<{ sha256: string; size: number }>(
      `/api/shares/${shareId}/hash?path=${encodeURIComponent(path)}`
    ),
  /** Short-lived share-scoped token for header-less <img>/<video> loads. */
  createLinkToken: (shareId: string) =>
    api<{ token: string; expiresInSec: number }>(
      `/api/shares/${shareId}/link-token`,
      { method: "POST" }
    ),

  uploadInit: (input: {
    shareId: string;
    dirPath: string;
    name: string;
    size: number;
    chunkSize?: number;
    overwrite?: boolean;
    resumeUploadId?: string;
  }) =>
    api<{ uploadId: string; chunkSize: number; totalChunks: number; receivedChunks: number[]; finalName: string }>(
      "/api/upload/init",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    ),
  uploadStatus: (uploadId: string) =>
    api<{ session: UploadSessionInfo | null }>(
      `/api/upload/status?uploadId=${encodeURIComponent(uploadId)}`
    ),
  uploadComplete: (uploadId: string) =>
    api<{
      upload?: UploadSessionInfo;
      incomplete?: boolean;
      missingChunks?: number[];
    }>("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    }),
  uploadCancel: (uploadId: string) =>
    api<{ ok: boolean }>("/api/upload/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    }),

  devices: () =>
    api<{ devices: (Device & { online: boolean })[] }>("/api/devices"),
  revokeDevice: (id: string) =>
    api<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" }),

  pairStart: () =>
    api<{
      code: string;
      expiresAt: number;
      claimUrl: string;
      qrUrl: string;
    }>("/api/pair/start", { method: "POST" }),
  pairClaim: (input: { code: string; deviceName: string; platform: string }) =>
    api<{
      device: { id: string; name: string; pairedAt: number };
      deviceToken: string;
      server: { serverId: string; serverName: string; baseUrl: string };
      shares: { id: string; name: string; slug: string; access: string }[];
    }>("/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  websites: () => api<{ websites: Website[] }>("/api/websites"),
  hostWebsite: (input: { name: string; homeDirRel?: string; absPath?: string; slug?: string }) =>
    api<{ website: Website }>("/api/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateWebsite: (id: string, patch: { name?: string; enabled?: boolean }) =>
    api<{ website: Website }>(`/api/websites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteWebsite: (id: string) =>
    api<{ ok: boolean }>(`/api/websites/${id}`, { method: "DELETE" }),

  fsBrowse: (path: string, mode: "shares" | "websites") =>
    api<{
      cwd: string;
      parent?: string | null;
      base?: string;
      hasIndexHtml?: boolean;
      dirs: { name: string; path: string; kind?: "drive" | "shortcut" | "dir" }[];
    }>(`/api/fs/browse?mode=${mode}&path=${encodeURIComponent(path)}`),
  fsCreate: (path: string, name: string, mode: "shares" | "websites") =>
    api<{ ok: boolean; path: string; name: string }>("/api/fs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name, mode }),
    }),

  guestShare: (slug: string) =>
    api<{
      share: { id: string; name: string; slug: string; access: string; guestEnabled: boolean };
    }>(`/api/guest/${encodeURIComponent(slug)}`),
};
