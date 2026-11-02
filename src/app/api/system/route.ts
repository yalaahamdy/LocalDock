import os from "node:os";
import { jsonOk } from "@/lib/localdock/files";
import {
  diskUsage,
  getSettings,
  listDevices,
  listShares,
  networkInterfaces,
  pickPrimaryLanIp,
  isLoopbackRequest,
  VERSION,
  STARTED_AT,
} from "@/lib/localdock/registry";
import { currentSpeedBps } from "@/lib/localdock/metrics";
import { requireAuth } from "@/lib/localdock/api-helpers";
import { HOME } from "@/lib/localdock/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;

  const isOwner = check.auth.kind === "owner";
  const settings = getSettings();
  const allShares = listShares();
  const devId = check.auth.device?.id;
  const visibleShares = isOwner
    ? allShares
    : allShares.filter((s) => s.allowedDevices === "all" || (Array.isArray(s.allowedDevices) && devId && s.allowedDevices.includes(devId)));

  const devices = listDevices();
  const now = Date.now();
  const storage = await diskUsage(HOME);

  return jsonOk({
    online: true,
    version: VERSION,
    serverId: settings.serverId,
    serverName: settings.serverName,
    startedAt: STARTED_AT,
    uptimeSec: Math.floor((now - STARTED_AT) / 1000),
    devicesOnline: devices.filter((d) => now - d.lastSeenAt < 45_000).length,
    devicesTrusted: isOwner ? devices.length : 1,
    sharesCount: visibleShares.length,
    sharedBytes: visibleShares.reduce((acc, s) => acc + s.sizeBytes, 0),
    transferSpeedBps: currentSpeedBps(),
    activeTransfers: 0, // client-side value merges in the UI
    platform: isOwner ? `${os.type()} ${os.release()}` : "LocalDock",
    hostname: isOwner ? os.hostname() : "LocalDock Host",
    network: isOwner ? networkInterfaces() : [],
    /** Best-guess primary LAN IPv4 — kept fresh for share links / QR codes. */
    lanIp: pickPrimaryLanIp(),
    storage,
    shareStorage: visibleShares.map((s) => ({
      id: s.id,
      name: s.name,
      sizeBytes: s.sizeBytes,
    })),
  });
}
