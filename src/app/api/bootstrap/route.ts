import { ensureSeeded } from "@/lib/localdock/seed";
import { getSettings, pickPrimaryLanIp, serverBaseUrlFrom, VERSION, isLoopbackRequest } from "@/lib/localdock/registry";
import { jsonOk } from "@/lib/localdock/files";
import { DESKTOP_MODE } from "@/lib/localdock/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bootstrap: provisions the LocalDock home (first run), returns identity +
 * owner credentials for the console. In the packaged desktop build this
 * endpoint is loopback-only (settings.allowRemoteOwner = false).
 */
export async function GET(req: Request) {
  await ensureSeeded();
  const settings = getSettings();
  const lanIp = pickPrimaryLanIp();
  const isLoopback = isLoopbackRequest(req);
  return jsonOk({
    version: VERSION,
    serverId: settings.serverId,
    serverName: settings.serverName,
    // The master ownerKey is exclusively returned to the local host machine (loopback).
    // It is NEVER transmitted across the local network to remote devices or browsers.
    ownerKey: isLoopback ? settings.ownerKey : "",
    onboarded: settings.onboarded,
    baseUrl: serverBaseUrlFrom(req),
    /** First non-loopback IPv4 — used to build QR & share links for other devices. */
    lanIp,
    /** True under the Windows/Tauri shell — unlocks native folder picker etc. */
    desktop: isLoopback && DESKTOP_MODE,
  });
}
