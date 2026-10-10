import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import fs from "node:fs";
import { createRequire } from "node:module";
import { jsonError } from "@/lib/localdock/files";
import { resolveSafeInside } from "@/lib/localdock/paths";
import { logActivity } from "@/lib/localdock/registry";
import { shareGuard } from "@/lib/localdock/api-helpers";

const reqModule = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = reqModule("archiver") as typeof import("archiver");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stream an entire folder as a ZIP archive (Q11).
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await shareGuard(req, id, "read");
  if ("deny" in guard) return guard.deny;

  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  const resolved = resolveSafeInside(guard.share.rootPath, rel);
  if (!resolved.ok || !resolved.abs) {
    return jsonError(400, "bad-path", "Invalid folder path.", { key: "badPath" });
  }

  try {
    const stat = await fs.promises.stat(resolved.abs);
    if (!stat.isDirectory()) {
      return jsonError(400, "not-a-directory", "Target path is not a folder.");
    }
  } catch {
    return jsonError(404, "not-found", "Folder not found.");
  }

  const folderName = path.basename(resolved.abs) || guard.share.name;
  const zipFilename = `${folderName.replace(/[\\/:*?"<>|]/g, "_")}.zip`;

  const archive = archiver("zip", { zlib: { level: 5 } });
  const passThrough = new PassThrough();

  archive.on("error", (err) => {
    passThrough.destroy(err);
  });

  archive.pipe(passThrough);
  archive.directory(resolved.abs, false);
  void archive.finalize();

  void logActivity(
    "file.downloaded",
    `Downloaded folder archive “${zipFilename}” from “${guard.share.name}”`,
    undefined,
    {
      key: "fileDownloaded",
      params: {
        name: zipFilename,
        share: guard.share.name,
      },
    }
  );

  return new Response(Readable.toWeb(passThrough) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zipFilename)}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
      "Cache-Control": "no-store",
    },
  });
}
