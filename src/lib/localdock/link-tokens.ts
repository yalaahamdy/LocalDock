/**
 * LocalDock — short-lived scoped link tokens ("presigned URLs", LAN edition).
 *
 * <img>/<video>/<iframe> tags cannot send auth headers, so previews and
 * thumbnails on private shares would always 403. Instead the client asks for
 * a random, share-scoped token (authorized request) and appends it as `?t=`.
 *
 * Properties:
 *  - Random 256-bit, in-memory only, survives nothing.
 *  - Scoped to exactly one share's READ access.
 *  - 15-minute sliding expiry — every authenticated use extends it, so a
 *    video that is actively streaming never expires mid-playback.
 */
import type { AuthContext } from "./types";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const HARD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1-hour hard ceiling
const MAX_TOKENS = 4096;

interface LinkToken {
  shareId: string;
  auth: AuthContext;
  expiresAt: number;
  hardExpiresAt: number;
}

const tokens = new Map<string, LinkToken>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (now > v.expiresAt || now > v.hardExpiresAt) tokens.delete(k);
  }
  while (tokens.size > MAX_TOKENS) {
    const oldest = tokens.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    tokens.delete(oldest);
  }
}

export function issueLinkToken(shareId: string, auth: AuthContext): string {
  sweep();
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  tokens.set(token, {
    shareId,
    auth,
    expiresAt: now + TOKEN_TTL_MS,
    hardExpiresAt: now + HARD_TOKEN_TTL_MS,
  });
  return token;
}

/** Validate + slide. Returns the issuer's auth snapshot when valid. */
export function resolveLinkToken(
  token: string,
  shareId: string
): AuthContext | null {
  const entry = token ? tokens.get(token) : undefined;
  if (!entry || entry.shareId !== shareId) return null;
  const now = Date.now();
  if (now > entry.expiresAt || now > entry.hardExpiresAt) {
    tokens.delete(token);
    return null;
  }
  entry.expiresAt = Math.min(now + TOKEN_TTL_MS, entry.hardExpiresAt); // sliding within hard cap
  return entry.auth;
}
