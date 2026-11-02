import { jsonOk } from "@/lib/localdock/files";
import { listActivity, clearActivity, listShares, isLoopbackRequest } from "@/lib/localdock/registry";
import { requireAuth, requireOwner } from "@/lib/localdock/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 200);
  const all = listActivity(limit * 2);

  if (check.auth.kind === "owner" && isLoopbackRequest(req)) {
    return jsonOk({ activity: all.slice(0, limit) });
  }

  // Filter for paired devices so they only see activity relevant to accessible shares
  const devId = check.auth.device?.id;
  const allowedShareNames = new Set(
    listShares()
      .filter((s) => s.allowedDevices === "all" || (Array.isArray(s.allowedDevices) && devId && s.allowedDevices.includes(devId)))
      .map((s) => s.name)
  );

  const filtered = all.filter((entry) => {
    const shareName = entry.meta?.shareName ?? entry.loc?.params?.name;
    if (typeof shareName === "string" && !allowedShareNames.has(shareName)) {
      return false;
    }
    return true;
  });

  return jsonOk({ activity: filtered.slice(0, limit) });
}

export async function DELETE(req: Request) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  await clearActivity();
  return jsonOk({ ok: true });
}
