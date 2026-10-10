/**
 * LocalDock — API route helpers (auth guards, body parsing, errors).
 */
import { getAuth, isOwner, isAuth, type ShareAction } from "./auth";
import { jsonError } from "./files";
import type { AuthContext, Share } from "./types";
import { getShare, getDeviceById, logActivity } from "./registry";
import { canAccessShare } from "./auth";
import { resolveLinkToken } from "./link-tokens";

export async function requireOwner(req: Request): Promise<Response | null> {
  const auth = getAuth(req);
  if (!isOwner(auth)) {
    return jsonError(
      401,
      "unauthorized",
      "This operation requires the LocalDock owner console.",
      { key: "unauthorized" }
    );
  }
  return null;
}

export async function requireAuth(
  req: Request
): Promise<{ auth: AuthContext } | { deny: Response }> {
  const auth = getAuth(req);
  if (!isAuth(auth)) {
    return {
      deny: jsonError(
        401,
        "unauthorized",
        "Please pair this device with LocalDock or log in as owner.",
        { key: "unauthorized" }
      ),
    };
  }
  return { auth };
}

export async function shareGuard(
  req: Request,
  shareId: string,
  action: ShareAction
): Promise<{ share: Share; auth: AuthContext } | { deny: Response }> {
  const share = getShare(shareId);
  if (!share) {
    return {
      deny: jsonError(
        404,
        "share-not-found",
        "This shared folder no longer exists.",
        { key: "shareNotFound" }
      ),
    };
  }
  const auth = getAuth(req);
  let effectiveAuth: AuthContext = auth;
  if (auth.kind === "none") {
    // Header-less media loads (<img>/<video>/<iframe> src) authenticate via a
    // short-lived share-scoped link token (?t=…) issued to an authorized
    // identity — the token inherits exactly that identity's access.
    const token = new URL(req.url).searchParams.get("t") ?? "";
    const tokenAuth = token ? resolveLinkToken(token, shareId) : null;
    if (tokenAuth) {
      if (tokenAuth.kind === "device" && tokenAuth.device) {
        const stillTrusted = getDeviceById(tokenAuth.device.id);
        if (!stillTrusted) {
          effectiveAuth = { kind: "none" };
        } else {
          effectiveAuth = tokenAuth;
        }
      } else {
        effectiveAuth = tokenAuth;
      }
    }
  }

  // Check guest expiration if this is accessed as guest
  const isGuestAccess = effectiveAuth.kind === "none" || effectiveAuth.kind === "guest";
  if (isGuestAccess && share.guestEnabled && share.guestExpiresAt && Date.now() > share.guestExpiresAt) {
    return {
      deny: jsonError(
        403,
        "guest-link-expired",
        "The guest link for this shared folder has expired.",
        { key: "forbidden" }
      ),
    };
  }

  if (!canAccessShare(effectiveAuth, share, action)) {
    void logActivity(
      "security.denied",
      `Denied ${action} on “${share.name}”`,
      { identity: effectiveAuth.kind },
      { key: "denied", params: { action: String(action), name: share.name } }
    );
    return {
      deny: jsonError(
        403,
        "forbidden",
        share.guestEnabled
          ? "Your access level does not allow this action on this folder."
          : "This folder is private. Pair your device or ask the owner to enable guest access.",
        { key: share.guestEnabled ? "forbidden" : "privateFolder" }
      ),
    };
  }
  return { share, auth: effectiveAuth };
}

export async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
