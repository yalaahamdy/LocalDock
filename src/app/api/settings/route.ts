import { jsonError, jsonOk } from "@/lib/localdock/files";
import { getSettings, updateSettings } from "@/lib/localdock/registry";
import { readJsonBody, requireAuth, requireOwner } from "@/lib/localdock/api-helpers";
import type { LocalDockSettings } from "@/lib/localdock/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await requireAuth(req);
  if ("deny" in check) return check.deny;
  const s = getSettings();
  return jsonOk({ settings: check.auth.kind === "owner" ? s : { ...s, ownerKey: "" } });
}

interface PatchBody {
  serverName?: string;
  startWithWindows?: boolean;
  allowRemoteOwner?: boolean;
  onboarded?: boolean;
  theme?: LocalDockSettings["theme"];
}

export async function PATCH(req: Request) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const body = await readJsonBody<PatchBody>(req);
  if (!body)
    return jsonError(400, "bad-body", "Invalid request body.", { key: "badBody" });

  const patch: Partial<LocalDockSettings> = {};
  if (typeof body.serverName === "string") {
    const name = body.serverName.trim().slice(0, 40);
    if (!name)
    return jsonError(400, "bad-name", "Server name cannot be empty.", {
      key: "emptyServerName",
    });
    patch.serverName = name;
  }
  if (typeof body.startWithWindows === "boolean") patch.startWithWindows = body.startWithWindows;
  if (typeof body.allowRemoteOwner === "boolean") patch.allowRemoteOwner = body.allowRemoteOwner;
  if (typeof body.onboarded === "boolean") patch.onboarded = body.onboarded;
  if (body.theme === "light" || body.theme === "dark" || body.theme === "system") patch.theme = body.theme;

  const next = await updateSettings(patch);
  return jsonOk({ settings: next });
}
