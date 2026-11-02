import { jsonError, jsonOk } from "@/lib/localdock/files";
import { getShareBySlug } from "@/lib/localdock/registry";
import { getAuth } from "@/lib/localdock/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Guest device/web discovery of a shared folder by its link slug.
 * Only succeeds when the share explicitly allows guest access.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const share = getShareBySlug(slug);
  if (!share) {
    return jsonError(404, "not-found", "This link does not match any shared folder.", {
      key: "badSlug",
    });
  }
  // If this share is locked to specific devices, guest access is 100% prohibited.
  if (share.allowedDevices !== "all") {
    const auth = getAuth(req);
    if (
      auth.kind !== "device" ||
      !auth.device ||
      !Array.isArray(share.allowedDevices) ||
      !share.allowedDevices.includes(auth.device.id)
    ) {
      return jsonError(
        403,
        "restricted-device",
        "This shared folder is strictly restricted to specific paired devices.",
        { key: "privatePair" }
      );
    }
  }

  if (!share.guestEnabled || share.allowedDevices !== "all") {
    return jsonError(
      403,
      "guest-disabled",
      "This folder is private. Pair your device with the computer to access it.",
      { key: "privatePair" }
    );
  }
  return jsonOk({
    share: {
      id: share.id,
      name: share.name,
      slug: share.slug,
      access: share.access,
      guestEnabled: share.guestEnabled,
    },
  });
}
