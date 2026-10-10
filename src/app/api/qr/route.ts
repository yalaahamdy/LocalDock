import QRCode from "qrcode";
import { getAuth } from "@/lib/localdock/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastRequestTime = 0;
let requestCount = 0;

/** Render any text/URL as a crisp SVG QR code. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const text = url.searchParams.get("text") ?? "";
  if (!text || text.length > 1024) {
    return new Response("text query param required (max 1024 chars)", { status: 400 });
  }

  const auth = getAuth(req);
  if (auth.kind === "none") {
    const now = Date.now();
    if (now - lastRequestTime > 10_000) {
      requestCount = 0;
      lastRequestTime = now;
    }
    requestCount++;
    if (requestCount > 30) {
      return new Response("Too many requests", { status: 429 });
    }
  }

  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}
