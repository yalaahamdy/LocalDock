import { jsonError, jsonOk } from "@/lib/localdock/files";
import {
  deleteShare,
  getShare,
  logActivity,
  updateShare,
} from "@/lib/localdock/registry";
import { readJsonBody, requireOwner, shareGuard } from "@/lib/localdock/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await shareGuard(req, id, "list");
  if ("deny" in guard) return guard.deny;
  return jsonOk({ share: guard.share });
}

interface PatchBody {
  name?: string;
  access?: "read" | "readwrite";
  guestEnabled?: boolean;
  guestExpiresAt?: number | null;
  allowedDevices?: "all" | string[];
  rotateSlug?: boolean;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJsonBody<PatchBody>(req);
  if (!body) return jsonError(400, "bad-body", "Invalid request body.");
  const share = await updateShare(id, body);
  if (!share)
    return jsonError(404, "share-not-found", "Shared folder not found.", {
      key: "shareNotFound",
    });
  await logActivity(
    "share.updated",
    `Updated sharing settings for “${share.name}”`,
    undefined,
    { key: "shareUpdated", params: { name: share.name } }
  );
  return jsonOk({ share });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const share = getShare(id);
  if (!share)
    return jsonError(404, "share-not-found", "Shared folder not found.", {
      key: "shareNotFound",
    });
  const ok = await deleteShare(id);
  if (!ok) return jsonError(404, "share-not-found", "Shared folder not found.");
  await logActivity(
    "share.deleted",
    `Stopped sharing “${share.name}” (files kept on disk)`,
    undefined,
    { key: "shareDeleted", params: { name: share.name } }
  );
  return jsonOk({ ok: true });
}
