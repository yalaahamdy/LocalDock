import fsp from "node:fs/promises";
import path from "node:path";
import { jsonError, jsonOk } from "@/lib/localdock/files";
import {
  createShare,
  listShares,
  logActivity,
  setShareStats,
  isLoopbackRequest,
} from "@/lib/localdock/registry";
import { readJsonBody, requireAuth } from "@/lib/localdock/api-helpers";
import { measureDir, resolveNativeFolder } from "@/lib/localdock/files";
import { sanitizeName, uniquifyPath } from "@/lib/localdock/paths";
import { HOME, SHARES_DIR } from "@/lib/localdock/store";
import { resolveSafe } from "@/lib/localdock/paths";
import type { ShareAccess } from "@/lib/localdock/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const allShares = listShares();

  // Only the host console on loopback gets to view every share without restriction
  if (check.auth.kind === "owner" && isLoopbackRequest(req)) {
    return jsonOk({ shares: allShares });
  }

  // Any caller on the network (paired device) only sees shares it is explicitly authorized to view
  const deviceId = check.auth.device?.id;
  const allowed = allShares.filter((s) => {
    if (s.allowedDevices === "all") return true;
    if (Array.isArray(s.allowedDevices) && deviceId && s.allowedDevices.includes(deviceId)) {
      return true;
    }
    return false;
  });
  return jsonOk({ shares: allowed });
}

interface CreateBody {
  name?: string;
  /** Either an absolute path inside the LocalDock home (from the folder browser), */
  homeDirRel?: string;
  /**
   * Absolute OS path picked through the native folder dialog (desktop shell
   * only — rejected outright in web deployments).
   */
  absPath?: string;
  /**
   * Companion-device flow: the folder lives on the CALLING device, so the
   * server creates an empty managed folder (Shares/From Devices/<name>) and
   * the device uploads its content right after. No server path is needed.
   */
  viaUpload?: boolean;
  access?: ShareAccess;
  guestEnabled?: boolean;
}

export async function POST(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const body = await readJsonBody<CreateBody>(req);
  if (!body?.name || !body.name.trim()) {
    return jsonError(400, "bad-name", "Please give this folder a name.", {
      key: "needFolderName",
    });
  }

  if (check.auth.kind === "device" && !body.viaUpload) {
    return jsonError(
      403,
      "forbidden",
      "Companion devices can only create shares via folder upload.",
      { key: "forbidden" }
    );
  }

  let rootAbs: string;
  if (body.viaUpload) {
    // Companion device: the content will be uploaded — create a clean,
    // unique managed folder under Shares/From Devices.
    const base = sanitizeName(body.name) ?? "Shared folder";
    const fromDevices = path.join(SHARES_DIR, "From Devices");
    rootAbs = uniquifyPath(fromDevices, base, true);
    await fsp.mkdir(rootAbs, { recursive: true });
  } else {
    const rawPath = (body.absPath || body.homeDirRel || "").trim();
    if (!rawPath) {
      return jsonError(400, "bad-path", "Please select or enter a folder path to share.", {
      key: "chooseFolder",
    });
    }

    if (path.isAbsolute(rawPath)) {
      const native = await resolveNativeFolder(rawPath);
      if (!native.ok) return jsonError(400, native.code, native.message);
      rootAbs = native.abs;
    } else {
      const resolved = resolveSafe(SHARES_DIR, rawPath);
      if (resolved.ok && resolved.abs) {
        rootAbs = resolved.abs;
      } else {
        const native = await resolveNativeFolder(path.resolve(rawPath));
        if (!native.ok) return jsonError(400, native.code, native.message);
        rootAbs = native.abs;
      }
    }
  }

  const share = await createShare({
    name: body.name,
    rootPath: rootAbs,
    access: body.access === "readwrite" ? "readwrite" : "read",
    guestEnabled: !!body.guestEnabled,
  });

  // compute initial stats asynchronously (fire and forget)
  void measureDir(share.rootPath).then(({ sizeBytes, itemCount }) =>
    setShareStats(share.id, sizeBytes, itemCount)
  );

  await logActivity(
    "share.created",
    body.viaUpload
      ? `Started sharing “${share.name}” — content uploading from a device`
      : `Started sharing “${share.name}”`,
    {
      access: share.access,
      guest: share.guestEnabled,
    },
    { key: "shareCreated", params: { name: share.name } }
  );
  return jsonOk({ share }, 201);
}
