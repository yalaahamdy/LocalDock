"use client";

/**
 * LocalDock — media URL helpers.
 *
 * <img>/<video>/<iframe> tags can't send auth headers, so on private shares
 * every media element authenticates with a short-lived share-scoped token
 * (?t=…). Tokens are cached per share and refreshed ahead of expiry; if the
 * token can't be obtained (guest shares don't need one) the plain URL is
 * returned and works exactly as before.
 */
import { Api } from "./api";

const REFRESH_AFTER_MS = 10 * 60 * 1000; // server slides 15 min per use

interface TokenState {
  token: string;
  issuedAt: number;
  inflight: Promise<string> | null;
}

const states = new Map<string, TokenState>();

export async function getMediaToken(shareId: string): Promise<string> {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  let s = states.get(shareId);
  if (!s) {
    s = { token: "", issuedAt: 0, inflight: null };
    states.set(shareId, s);
  }
  if (s.token && now - s.issuedAt < REFRESH_AFTER_MS) return s.token;
  if (!s.inflight) {
    s.inflight = Api.createLinkToken(shareId)
      .then((r) => {
        s!.token = r.token;
        s!.issuedAt = Date.now();
        return r.token;
      })
      .catch(() => s!.token /* keep previous; guest shares work anyway */)
      .finally(() => {
        s!.inflight = null;
      });
  }
  return s.inflight;
}

/** Full-quality file URL (previews: image / video / audio / pdf). */
export async function mediaSrc(shareId: string, relPath: string): Promise<string> {
  const base = `/api/shares/${shareId}/file?path=${encodeURIComponent(relPath)}`;
  const t = await getMediaToken(shareId);
  return t ? `${base}&t=${t}` : base;
}

/** Small cached thumbnail URL (grid/list tiles). */
export async function thumbSrc(shareId: string, relPath: string, size = 320): Promise<string> {
  const base = `/api/shares/${shareId}/thumb?path=${encodeURIComponent(relPath)}&s=${size}`;
  const t = await getMediaToken(shareId);
  return t ? `${base}&t=${t}` : base;
}

/** Synchronous variant when a token is already known (e.g. after prefetch). */
export function mediaSrcSync(shareId: string, relPath: string, token: string): string {
  const base = `/api/shares/${shareId}/file?path=${encodeURIComponent(relPath)}`;
  return token ? `${base}&t=${token}` : base;
}

/** Direct authenticated streaming download URL (attachment header for fast native download). */
export async function downloadSrc(shareId: string, relPath: string): Promise<string> {
  const base = `/api/shares/${shareId}/download?path=${encodeURIComponent(relPath)}`;
  const t = await getMediaToken(shareId);
  return t ? `${base}&t=${t}` : base;
}

