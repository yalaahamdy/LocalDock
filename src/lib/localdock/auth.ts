/**
 * LocalDock — request authentication & share authorization.
 *
 * Three identities:
 *  - owner   : the dashboard console (carries the owner key). In the packaged
 *              desktop build this is restricted to the server machine itself.
 *  - device  : a paired device carrying its persistent token.
 *  - guest   : unpaired visitor — only allowed where a share explicitly
 *              enables guest access.
 *
 * Safe by default: when in doubt, access is denied.
 */
import type { AuthContext, Share, ShareAccess } from "./types";
import {
  getSettings,
  findDeviceByToken,
  isLoopbackRequest,
  touchDevice,
} from "./registry";

const OWNER_HEADER = "x-localdock-owner";
const DEVICE_HEADER = "x-localdock-device";

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const res: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      res[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return res;
}

export function getAuth(req: Request): AuthContext {
  const cookies = parseCookies(req.headers.get("cookie"));
  let urlParams: URLSearchParams | null = null;
  try {
    urlParams = new URL(req.url).searchParams;
  } catch {
    /* relative or malformed URL fallback */
  }

  const ownerKey =
    req.headers.get(OWNER_HEADER) ||
    cookies["localdock_owner"];

  if (ownerKey) {
    const settings = getSettings();
    if (ownerKey === settings.ownerKey) {
      return { kind: "owner" };
    }
  }

  const deviceToken =
    req.headers.get(DEVICE_HEADER) ||
    cookies["localdock_device"];

  if (deviceToken) {
    const device = findDeviceByToken(deviceToken);
    if (device) {
      // fire-and-forget presence update
      void touchDevice(device.id);
      return { kind: "device", device };
    }
  }
  return { kind: "none" };
}

export function isOwner(auth: AuthContext): boolean {
  return auth.kind === "owner";
}

export function isAuth(auth: AuthContext): boolean {
  return auth.kind === "owner" || auth.kind === "device";
}

export type ShareAction =
  | "list"       // browse directories
  | "read"       // download / preview
  | "write"      // upload, create folder
  | "rename"
  | "delete";

const ACCESS_MATRIX: Record<ShareAction, ShareAccess> = {
  list: "read",
  read: "read",
  write: "readwrite",
  rename: "readwrite",
  delete: "readwrite",
};

/**
 * Decide whether `auth` may perform `action` on `share`.
 * Owner: always. Device: must be allowed by the share's device list.
 * Guest: only when guestEnabled, and only with the share's access level.
 */
export function canAccessShare(
  auth: AuthContext,
  share: Share,
  action: ShareAction
): boolean {
  const required = ACCESS_MATRIX[action];

  // 1. Strict specific device isolation (100% airtight)
  // When a share restricts access to specific devices (allowedDevices !== "all"):
  if (share.allowedDevices !== "all") {
    // Unpaired devices, phantom/fake devices, guests, or anonymous callers are 100% BLOCKED.
    if (auth.kind !== "device" && auth.kind !== "owner") {
      return false;
    }

    // For paired devices, the device ID MUST be explicitly listed in allowedDevices
    if (auth.kind === "device") {
      if (
        !auth.device ||
        !Array.isArray(share.allowedDevices) ||
        !share.allowedDevices.includes(auth.device.id)
      ) {
        return false;
      }
      return meetsLevel(share.access, required);
    }

    // The host console (owner) is allowed to manage all shares locally
    if (auth.kind === "owner") {
      return true;
    }

    return false;
  }

  // 2. Shares open to all paired devices (allowedDevices === "all")
  if (auth.kind === "owner") return true;

  if (auth.kind === "device" && auth.device) {
    return meetsLevel(share.access, required);
  }

  // 3. Guest / anonymous access (only allowed when allowedDevices is "all" AND guestEnabled is true)
  if (auth.kind === "none" || (auth as { kind: string }).kind === "guest") {
    if (!share.guestEnabled) return false;
    return meetsLevel(share.access, required);
  }

  return false;
}

function meetsLevel(shareLevel: ShareAccess, required: ShareAccess): boolean {
  if (required === "read") return true;
  return shareLevel === "readwrite";
}
