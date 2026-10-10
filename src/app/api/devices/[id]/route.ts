import { jsonError, jsonOk } from "@/lib/localdock/files";
import { getDeviceById, logActivity, revokeDevice, updateDevice } from "@/lib/localdock/registry";
import { requireAuth, requireOwner, readJsonBody } from "@/lib/localdock/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const { id } = await ctx.params;
  const isSelf = check.auth.kind === "device" && check.auth.device?.id === id;
  const isOwner = check.auth.kind === "owner";
  if (!isSelf && !isOwner) {
    return jsonError(403, "forbidden", "You cannot rename this device.");
  }
  const body = await readJsonBody<{ name?: string }>(req);
  const name = body?.name?.trim();
  if (!name) {
    return jsonError(400, "bad-name", "Device name cannot be empty.");
  }
  const updated = await updateDevice(id, { name });
  if (!updated) return jsonError(404, "not-found", "Device not found.");
  return jsonOk({ device: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const device = getDeviceById(id);
  if (!device)
    return jsonError(404, "not-found", "Device not found.", { key: "deviceNotFound" });
  await revokeDevice(id);
  await logActivity(
    "device.revoked",
    `Revoked trusted device “${device.name}”`,
    undefined,
    { key: "deviceRevoked", params: { name: device.name } }
  );
  return jsonOk({ ok: true });
}
