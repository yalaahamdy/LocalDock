import { jsonError, jsonOk } from "@/lib/localdock/files";
import {
  addDevice,
  consumePairingCode,
  getSettings,
  logActivity,
  serverBaseUrlFrom,
  listShares,
  VERSION,
} from "@/lib/localdock/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  code?: string;
  deviceName?: string;
  platform?: string;
}

let consecutiveFails = 0;
let lastFailAt = 0;

/**
 * Claim a pairing code -> become a trusted device.
 * Returns a persistent device token (stored hashed on the server).
 */
export async function POST(req: Request) {
  const now = Date.now();
  if (now - lastFailAt > 60_000) consecutiveFails = 0;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.code || typeof body.code !== "string") {
    return jsonError(400, "bad-body", "A pairing code is required.", { key: "needCode" });
  }

  const claimed = await consumePairingCode(body.code.trim().toUpperCase());
  if (!claimed) {
    consecutiveFails++;
    lastFailAt = now;
    // Progressive delay on failed guesses
    if (consecutiveFails > 2) {
      await new Promise((r) => setTimeout(r, Math.min(consecutiveFails * 250, 2000)));
    }
    return jsonError(
      401,
      "invalid-code",
      "That code is invalid or expired. Generate a new one on the computer.",
      { key: "badCode" }
    );
  }

  consecutiveFails = 0;

  const { device, token } = await addDevice({
    name: (body.deviceName ?? "").trim() || "My device",
    platform: (body.platform ?? "").trim() || "web",
  });
  const settings = getSettings();
  await logActivity(
    "device.paired",
    `Paired a new device: “${device.name}”`,
    { platform: device.platform },
    { key: "devicePaired", params: { name: device.name } }
  );

  return jsonOk({
    device: { id: device.id, name: device.name, pairedAt: device.pairedAt },
    deviceToken: token,
    server: {
      serverId: settings.serverId,
      serverName: settings.serverName,
      baseUrl: serverBaseUrlFrom(req),
      version: VERSION,
    },
    // visibility of what this device can reach (per-share rules still apply)
    shares: listShares()
      .filter(
        (s) =>
          s.allowedDevices === "all" ||
          (Array.isArray(s.allowedDevices) && s.allowedDevices.includes(device.id))
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        access: s.access,
      })),
  });
}
