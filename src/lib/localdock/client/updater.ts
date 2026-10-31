/**
 * LocalDock — Auto Updater & Release Checker
 * Connects directly to GitHub Releases to check for and apply updates.
 */

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  apkAsset?: ReleaseAsset;
  exeAsset?: ReleaseAsset;
}

const GITHUB_REPO = "yalaahamdy/LocalDock";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Compare two semver version strings (e.g. "1.2.0" vs "1.1.0").
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, "").trim().split(/[-+]/)[0];
  const clean2 = v2.replace(/^v/, "").trim().split(/[-+]/)[0];

  const p1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const p2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Checks GitHub for the latest release and determines if an update is available.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(GITHUB_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const data = await res.json();
    const tagName = String(data.tag_name || "").trim();
    const latestVersion = tagName.replace(/^v/, "");

    const assets = Array.isArray(data.assets) ? data.assets : [];

    let apkAsset: ReleaseAsset | undefined;
    let exeAsset: ReleaseAsset | undefined;

    for (const a of assets) {
      const name = String(a.name || "");
      const downloadUrl = String(a.browser_download_url || "");
      const size = Number(a.size || 0);

      if (name.toLowerCase().endsWith(".apk") && !apkAsset) {
        apkAsset = { name, url: downloadUrl, size };
      }
      if (
        (name.toLowerCase().endsWith(".exe") ||
          name.toLowerCase().includes("setup") ||
          name.toLowerCase().includes("installer")) &&
        !exeAsset
      ) {
        exeAsset = { name, url: downloadUrl, size };
      }
    }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseName: data.name || tagName,
      releaseNotes: data.body || "",
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: data.published_at || new Date().toISOString(),
      apkAsset,
      exeAsset,
    };
  } catch (err) {
    console.warn("[LocalDock AutoUpdater] Failed to check for updates:", err);
    return null;
  }
}

/**
 * Execute update action depending on current client platform.
 */
export async function installUpdate(update: UpdateInfo): Promise<{ started: boolean; message: string }> {
  const isAndroidNative = typeof window !== "undefined" && Boolean((window as unknown as { LocalDockAndroid?: unknown }).LocalDockAndroid);
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // 1. Native Android App: download APK and trigger package installer
  if (isAndroidNative && update.apkAsset) {
    const androidBridge = (window as unknown as {
      LocalDockAndroid?: {
        downloadDirect?: (url: string, filename: string, size: number, devToken: string, owner: string) => void;
      };
    }).LocalDockAndroid;

    if (typeof androidBridge?.downloadDirect === "function") {
      androidBridge.downloadDirect(
        update.apkAsset.url,
        update.apkAsset.name || `LocalDock-v${update.latestVersion}.apk`,
        update.apkAsset.size || -1,
        "",
        ""
      );
      return {
        started: true,
        message: "جارٍ تنزيل حزمة التحديث (APK). سيتم فتح مثبت الحزم تلقائياً عند الاكتمال.",
      };
    }
  }

  // 2. Mobile Browser: directly trigger download of APK
  if (isMobile && update.apkAsset) {
    window.location.href = update.apkAsset.url;
    return {
      started: true,
      message: "جارٍ تنزيل تحديث أندرويد (APK)...",
    };
  }

  // 3. Desktop Windows (EXE setup)
  if (update.exeAsset) {
    const link = document.createElement("a");
    link.href = update.exeAsset.url;
    link.download = update.exeAsset.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return {
      started: true,
      message: "جارٍ تنزيل برنامج التثبيت لويندوز (EXE)...",
    };
  }

  // Fallback: open release page
  window.open(update.releaseUrl, "_blank", "noopener,noreferrer");
  return {
    started: true,
    message: "تم فتح صفحة التحديث على GitHub.",
  };
}
