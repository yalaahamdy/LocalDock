import { jsonError, jsonOk } from "@/lib/localdock/files";
import { initUpload, gcUploads } from "@/lib/localdock/uploads";
import { readJsonBody, shareGuard } from "@/lib/localdock/api-helpers";
import { trackUploadStart } from "@/lib/localdock/transfer-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  shareId?: string;
  dirPath?: string;
  name?: string;
  size?: number;
  chunkSize?: number;
  overwrite?: boolean;
  resumeUploadId?: string;
}

export async function POST(req: Request) {
  const body = await readJsonBody<Body>(req);
  if (!body?.shareId || !body.name)
    return jsonError(400, "bad-body", "Upload needs a share and a file name.", {
      key: "badBody",
    });

  const guard = await shareGuard(req, body.shareId, "write");
  if ("deny" in guard) return guard.deny;

  // Trigger background garbage collection of stale uploads (A11)
  void gcUploads();

  try {
    const result = await initUpload(guard.share.rootPath, {
      shareId: body.shareId,
      dirRelPath: body.dirPath ?? "",
      name: body.name,
      size: body.size ?? 0,
      chunkSize: body.chunkSize,
      overwrite: body.overwrite,
      resumeUploadId: body.resumeUploadId,
    });
    // Surface this upload to every open device immediately.
    trackUploadStart({
      uploadId: result.uploadId,
      shareId: body.shareId,
      dirPath: body.dirPath ?? "",
      name: result.finalName,
      size: body.size ?? 0,
      auth: guard.auth,
    });
    return jsonOk(result, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "invalid-name")
      return jsonError(400, "bad-name", "This file name cannot be used.", {
        key: "badName",
      });
    if (msg === "invalid-dir")
      return jsonError(400, "bad-path", "Invalid destination folder.", {
        key: "badPath",
      });
    return jsonError(500, "init-failed", "The upload could not be started.", {
        key: "startFailed",
      });
  }
}
