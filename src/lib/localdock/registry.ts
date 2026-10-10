/**
 * LocalDock — Registry: settings, shares, devices, websites, activity, pairing codes.
 * All mutations go through `withLock` so concurrent API calls never lose updates.
 */
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  DATA_DIR,
  FILES,
  ensureHomeLayout,
  readJson,
  withLock,
  writeJson,
} from "./store";
import { slugify, validateSlug } from "./paths";
import type {
  ActivityEntry,
  ActivityType,
  Device,
  LocalDockSettings,
  Share,
  ShareAccess,
  Website,
} from "./types";

export const VERSION = "1.1.0";
export const STARTED_AT = Date.now();

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function getSettings(): LocalDockSettings {
  ensureHomeLayout();
  const existing = readJson<LocalDockSettings | null>(FILES.settings, null);
  if (existing && existing.serverId && existing.ownerKey) return existing;

  const settings: LocalDockSettings = {
    serverId: existing?.serverId ?? crypto.randomUUID(),
    serverName: existing?.serverName ?? "My PC",
    ownerKey: existing?.ownerKey ?? crypto.randomBytes(24).toString("hex"),
    createdAt: existing?.createdAt ?? Date.now(),
    onboarded: existing?.onboarded ?? false,
    startWithWindows: existing?.startWithWindows ?? false,
    allowRemoteOwner: existing?.allowRemoteOwner ?? false,
    theme: existing?.theme ?? "system",
  };
  writeJson(FILES.settings, settings);
  return settings;
}

export async function updateSettings(
  patch: Partial<LocalDockSettings>
): Promise<LocalDockSettings> {
  return withLock("settings", async () => {
    const current = getSettings();
    const next: LocalDockSettings = { ...current, ...patch };
    // serverId/ownerKey are immutable through this API
    next.serverId = current.serverId;
    next.ownerKey = current.ownerKey;
    await writeJson(FILES.settings, next);
    return next;
  });
}

/* ------------------------------------------------------------------ */
/* Shares                                                              */
/* ------------------------------------------------------------------ */

export function listShares(): Share[] {
  ensureHomeLayout();
  return readJson<Share[]>(FILES.shares, []);
}

export function getShare(id: string): Share | undefined {
  return listShares().find((s) => s.id === id);
}

export function getShareBySlug(slug: string): Share | undefined {
  return listShares().find((s) => s.slug === slug);
}

async function persistShares(shares: Share[]): Promise<void> {
  await writeJson(FILES.shares, shares);
}

export async function createShare(input: {
  name: string;
  rootPath: string;
  access?: ShareAccess;
  guestEnabled?: boolean;
  allowedDevices?: "all" | string[];
}): Promise<Share> {
  return withLock("shares", async () => {
    const shares = listShares();
    const name = input.name.trim().slice(0, 60) || "Shared folder";
    const slug = uniqueSlug(shares.map((s) => s.slug), slugify(name));
    const share: Share = {
      id: crypto.randomUUID(),
      name,
      slug,
      rootPath: input.rootPath,
      createdAt: Date.now(),
      access: input.access ?? "read",
      guestEnabled: input.guestEnabled ?? false,
      allowedDevices: input.allowedDevices ?? "all",
      sizeBytes: 0,
      itemCount: 0,
      lastScanAt: null,
    };
    shares.push(share);
    await persistShares(shares);
    return share;
  });
}

export async function updateShare(
  id: string,
  patch: Partial<Pick<Share, "name" | "access" | "guestEnabled" | "allowedDevices" | "guestExpiresAt">> & {
    rotateSlug?: boolean;
  }
): Promise<Share | undefined> {
  return withLock("shares", async () => {
    const shares = listShares();
    const idx = shares.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    const next: Share = { ...shares[idx], ...patch };
    if (patch.name) {
      next.name = patch.name.trim().slice(0, 60) || shares[idx].name;
      // keep slug stable on rename (links must not break)
    }
    if (patch.rotateSlug) {
      next.slug = crypto.randomBytes(6).toString("hex");
    }
    shares[idx] = next;
    await persistShares(shares);
    return next;
  });
}

export async function deleteShare(id: string): Promise<boolean> {
  return withLock("shares", async () => {
    const shares = listShares();
    const idx = shares.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    shares.splice(idx, 1);
    await persistShares(shares);
    return true;
  });
}

export async function setShareStats(
  id: string,
  sizeBytes: number,
  itemCount: number
): Promise<void> {
  return withLock("shares", async () => {
    const shares = listShares();
    const idx = shares.findIndex((s) => s.id === id);
    if (idx === -1) return;
    shares[idx] = { ...shares[idx], sizeBytes, itemCount, lastScanAt: Date.now() };
    await persistShares(shares);
  });
}

function uniqueSlug(existing: string[], base: string): string {
  if (!RESERVED.has(base) && !existing.includes(base)) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`;
    if (!RESERVED.has(candidate) && !existing.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const RESERVED = new Set(["api", "sites", "s", "pair", "admin", "localdock"]);

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export function listDevices(): Device[] {
  ensureHomeLayout();
  return readJson<Device[]>(FILES.devices, []);
}

export function getDeviceById(id: string): Device | undefined {
  return listDevices().find((d) => d.id === id);
}

export function findDeviceByToken(rawToken: string): Device | undefined {
  if (!rawToken) return undefined;
  const hash = sha256(rawToken);
  return listDevices().find((d) => d.tokenHash === hash);
}

export async function addDevice(input: {
  name: string;
  platform: string;
}): Promise<{ device: Device; token: string }> {
  return withLock("devices", async () => {
    const devices = listDevices();
    const token = crypto.randomBytes(32).toString("hex");
    const device: Device = {
      id: crypto.randomUUID(),
      name: input.name.trim().slice(0, 60) || "New device",
      platform: input.platform.slice(0, 40) || "unknown",
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      tokenHash: sha256(token),
    };
    devices.push(device);
    await writeJson(FILES.devices, devices);
    return { device, token };
  });
}

export async function touchDevice(id: string): Promise<void> {
  const current = listDevices().find((d) => d.id === id);
  if (current && Date.now() - current.lastSeenAt < 20_000) return;
  return withLock("devices", async () => {
    const devices = listDevices();
    const idx = devices.findIndex((d) => d.id === id);
    if (idx === -1) return;
    if (Date.now() - devices[idx].lastSeenAt < 20_000) return;
    devices[idx] = { ...devices[idx], lastSeenAt: Date.now() };
    await writeJson(FILES.devices, devices);
  });
}

export async function updateDevice(
  id: string,
  patch: { name?: string }
): Promise<Device | undefined> {
  return withLock("devices", async () => {
    const devices = listDevices();
    const idx = devices.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    if (patch.name) {
      devices[idx] = { ...devices[idx], name: patch.name.trim().slice(0, 60) || devices[idx].name };
      await writeJson(FILES.devices, devices);
    }
    return devices[idx];
  });
}

export async function revokeDevice(id: string): Promise<boolean> {
  return withLock("devices", async () => {
    const devices = listDevices();
    const idx = devices.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    devices.splice(idx, 1);
    await writeJson(FILES.devices, devices);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Pairing codes (single-use, short TTL)                               */
/* ------------------------------------------------------------------ */

interface PairingCode {
  code: string;
  createdAt: number;
  expiresAt: number;
}

const PAIRING_TTL_MS = 5 * 60 * 1000;

export async function createPairingCode(): Promise<PairingCode> {
  return withLock("pairing", async () => {
    const all = readJson<PairingCode[]>(FILES.pairing, []);
    const now = Date.now();
    const alive = all.filter((p) => p.expiresAt > now);
    const code = randomCode();
    const entry: PairingCode = {
      code,
      createdAt: now,
      expiresAt: now + PAIRING_TTL_MS,
    };
    alive.push(entry);
    await writeJson(FILES.pairing, alive);
    return entry;
  });
}

export async function consumePairingCode(
  code: string
): Promise<PairingCode | undefined> {
  return withLock("pairing", async () => {
    const all = readJson<PairingCode[]>(FILES.pairing, []);
    const now = Date.now();
    const idx = all.findIndex(
      (p) => p.code === code && p.expiresAt > now
    );
    if (idx === -1) return undefined;
    const [entry] = all.splice(idx, 1);
    await writeJson(FILES.pairing, all);
    return entry;
  });
}

function randomCode(): string {
  // 6 chars from an unambiguous alphabet
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/* ------------------------------------------------------------------ */
/* Websites                                                            */
/* ------------------------------------------------------------------ */

export function listWebsites(): Website[] {
  ensureHomeLayout();
  return readJson<Website[]>(FILES.websites, []);
}

export function getWebsite(id: string): Website | undefined {
  return listWebsites().find((w) => w.id === id);
}

export function getWebsiteBySlug(slug: string): Website | undefined {
  return listWebsites().find((w) => w.slug === slug && w.enabled);
}

export async function createWebsite(input: {
  name: string;
  rootPath: string;
  slug?: string;
}): Promise<Website> {
  return withLock("websites", async () => {
    const sites = listWebsites();
    const name = input.name.trim().slice(0, 60) || "Website";
    let slug = input.slug ? slugify(input.slug) : slugify(name);
    if (!validateSlug(slug) || sites.some((w) => w.slug === slug)) {
      slug = uniqueSlug(
        sites.map((w) => w.slug),
        slug || "site"
      );
    }
    const site: Website = {
      id: crypto.randomUUID(),
      name,
      slug,
      rootPath: input.rootPath,
      enabled: true,
      createdAt: Date.now(),
    };
    sites.push(site);
    await writeJson(FILES.websites, sites);
    return site;
  });
}

export async function updateWebsite(
  id: string,
  patch: Partial<Pick<Website, "name" | "enabled">>
): Promise<Website | undefined> {
  return withLock("websites", async () => {
    const sites = listWebsites();
    const idx = sites.findIndex((w) => w.id === id);
    if (idx === -1) return undefined;
    sites[idx] = { ...sites[idx], ...patch };
    await writeJson(FILES.websites, sites);
    return sites[idx];
  });
}

export async function deleteWebsite(id: string): Promise<boolean> {
  return withLock("websites", async () => {
    const sites = listWebsites();
    const idx = sites.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    sites.splice(idx, 1);
    await writeJson(FILES.websites, sites);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Activity log (ring buffer)                                          */
/* ------------------------------------------------------------------ */

const ACTIVITY_MAX = 300;

export async function logActivity(
  type: ActivityType,
  message: string,
  meta?: Record<string, string | number | boolean | null>,
  loc?: { key: string; params?: Record<string, string | number> }
): Promise<void> {
  try {
    await withLock("activity", async () => {
      const entries = readJson<ActivityEntry[]>(FILES.activity, []);
      entries.unshift({
        id: crypto.randomUUID(),
        type,
        message,
        at: Date.now(),
        meta: meta ?? undefined,
        loc,
      });
      if (entries.length > ACTIVITY_MAX) entries.length = ACTIVITY_MAX;
      await writeJson(FILES.activity, entries);
    });
  } catch {
    // activity logging must never break a user operation
  }
}

export async function clearActivity(): Promise<void> {
  await withLock("activity", async () => {
    await writeJson(FILES.activity, []);
  });
}

export function listActivity(limit = 60): ActivityEntry[] {
  return readJson<ActivityEntry[]>(FILES.activity, []).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function serverBaseUrlFrom(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function requestIsLocal(req: Request): boolean {
  const fwd =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";
  const first = fwd.split(",")[0].trim();
  if (!first) return true; // direct local connection
  return isPrivateIp(first);
}

export function isLoopbackIp(ipOrHost: string): boolean {
  const h = ipOrHost.toLowerCase().trim();
  return h === "127.0.0.1" || h.startsWith("127.") || h === "localhost" || h === "::1" || h === "[::1]";
}

export function isLoopbackRequest(req: Request): boolean {
  const fwd =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (!isLoopbackIp(first)) return false;
  }
  const host = req.headers.get("host") ?? "";
  const hostName = host.split(":")[0].toLowerCase();
  return isLoopbackIp(hostName);
}

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

export async function diskUsage(dir: string): Promise<{ freeBytes: number; totalBytes: number }> {
  try {
    const stats = await fsp.statfs(dir);
    return {
      freeBytes: Number(stats.bsize) * Number(stats.bavail),
      totalBytes: Number(stats.bsize) * Number(stats.blocks),
    };
  } catch {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

export function networkInterfaces(): { name: string; address: string }[] {
  const out: { name: string; address: string }[] = [];
  const nets = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        out.push({ name, address: addr.address });
      }
    }
  }
  return out;
}

/**
 * Pick the LAN IPv4 most likely to be reachable by phones on the Wi-Fi.
 * Scoring prioritizes real hardware interfaces (Wi-Fi, Ethernet, WLAN) and
 * heavily penalizes virtual / container adapters (VirtualBox, VMware, WSL,
 * Hyper-V, Docker, TAP, Tailscale), so QR codes and LAN links always point to
 * the real host interface accessible by phones.
 */
export function pickPrimaryLanIp(): string | null {
  const nics = networkInterfaces();
  if (nics.length === 0) return null;

  const score = (nic: { name: string; address: string }): number => {
    const name = nic.name.toLowerCase();
    const ip = nic.address;

    // Check for virtual/dummy adapters
    const isVirtual =
      name.includes("virtual") ||
      name.includes("vbox") ||
      name.includes("vmware") ||
      name.includes("wsl") ||
      name.includes("docker") ||
      name.includes("vethernet") ||
      name.includes("hyper-v") ||
      name.includes("tap") ||
      name.includes("tun") ||
      name.includes("pseudo") ||
      name.includes("npcap") ||
      name.includes("tailscale") ||
      name.includes("zerotier");

    if (isVirtual) return -50;

    let pts = 0;

    // Favor real physical adapters
    if (name.includes("wi-fi") || name.includes("wifi") || name.includes("wireless") || name.includes("wlan")) {
      pts += 100;
    } else if (name.includes("ethernet") || name.includes("eth") || name.includes("lan")) {
      pts += 80;
    }

    // Typical VirtualBox host-only subnet
    if (ip.startsWith("192.168.56.")) {
      return -30;
    }

    // IP subnet scoring
    if (/^192\.168\./.test(ip)) pts += 40; // home/office Wi-Fi
    else if (/^10\./.test(ip)) pts += 30; // corporate / hotspot ranges
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) pts += 10;
    else pts += 5;

    return pts;
  };

  let best = nics[0];
  let bestScore = score(best);

  for (let i = 1; i < nics.length; i++) {
    const s = score(nics[i]);
    if (s > bestScore) {
      best = nics[i];
      bestScore = s;
    }
  }

  return best.address;
}

export function dataDirExists(): boolean {
  try {
    return !!DATA_DIR;
  } catch {
    return false;
  }
}

export const DATA_PATH = DATA_DIR;
export const PATH_HELPERS = { path };
