import { ensureSeeded } from "@/lib/localdock/seed";
import { getSettings, pickPrimaryLanIp, serverBaseUrlFrom, VERSION, isLocalOrHostRequest } from "@/lib/localdock/registry";
import { jsonOk } from "@/lib/localdock/files";
import { DESKTOP_MODE } from "@/lib/localdock/store";
import { getAuth } from "@/lib/localdock/auth";

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
  const isLoopback = isLocalOrHostRequest(req);
  const auth = getAuth(req);
  const allowOwner = isLoopback || !!settings.allowRemoteOwner || auth.kind === "owner";

  return jsonOk({
    version: VERSION,
    serverId: settings.serverId,
    serverName: settings.serverName,
    ownerKey: allowOwner ? settings.ownerKey : "",
    onboarded: settings.onboarded,
    baseUrl: serverBaseUrlFrom(req),
    /** First non-loopback IPv4 — used to build QR & share links for other devices. */
    lanIp,
    /** True under the Windows/Tauri shell — unlocks native folder picker etc. */
    desktop: isLoopback && DESKTOP_MODE,
  });
}
