import { jsonOk } from "@/lib/localdock/files";
import { listDevices } from "@/lib/localdock/registry";
import { requireAuth } from "@/lib/localdock/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const now = Date.now();
  const allDevices = listDevices();
  const filtered = check.auth.kind === "owner"
    ? allDevices
    : allDevices.filter((d) => check.auth.kind === "device" && d.id === check.auth.device?.id);

  return jsonOk({
    devices: filtered.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt,
      online: now - d.lastSeenAt < 45_000,
    })),
  });
}
