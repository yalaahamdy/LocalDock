"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileEntry } from "@/lib/localdock/types";
import { Api, api, getDeviceToken, makeApiError } from "@/lib/localdock/client/api";
import { buildLanUrl } from "@/lib/localdock/client/lan";
import { transfers } from "@/lib/localdock/client/transfer-engine";
import { LogoMark, StatusDot } from "./primitives";
import { FileBrowser, FileIcon } from "./file-browser";
import { formatBytes } from "@/lib/localdock/client/format";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Wifi, ArrowLeft, Search, X, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/localdock/i18n";

/**
 * Guest / paired-device share view — opened from share links (?s=slug) or QRs.
 * Respects the share's access level; private shares show a friendly notice.
 */
export function GuestView({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "denied"; message: string } | {
      kind: "ready";
      share: { id: string; name: string; access: string };
    }
  >({ kind: "loading" });

  useEffect(() => {
    void (async () => {
      try {
        const headers: Record<string, string> = {};
        const token = getDeviceToken();
        if (token) headers["X-LocalDock-Device"] = token;
        const res = await fetch(`/api/guest/${encodeURIComponent(slug)}`, { headers });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setState({ kind: "denied", message: body?.error?.message ?? t.guest.unavailable });
          return;
        }
        const body = (await res.json()) as {
          share: { id: string; name: string; access: string; guestEnabled: boolean };
        };
        setState({ kind: "ready", share: body.share });
      } catch (e) {
        setState({ kind: "denied", message: (e as Error).message });
      }
    })();
  }, [slug]);

  if (state.kind === "loading") {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t.guest.opening}</p>
      </Centered>
    );
  }

  if (state.kind === "denied") {
    return (
      <Centered>
        <LogoMark className="size-12 rounded-2xl shadow-card" />
        <span className="mt-4 flex size-12 items-center justify-center rounded-2xl bg-warning/15 text-warning-foreground">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">{t.guest.privateTitle}</h1>
        <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
          {state.message}
        </p>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot ok pulse={false} className="bg-primary" />
          {t.guest.privateDesc}
        </p>
      </Centered>
    );
  }

  return (
    <GuestShareInner
      shareId={state.share.id}
      shareName={state.share.name}
      access={state.share.access}
    />
  );
}

function GuestShareInner({
  shareId,
  shareName,
  access,
}: {
  shareId: string;
  shareName: string;
  access: string;
}) {
  const { t } = useI18n();
  const writable = access === "readwrite";
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <LogoMark className="size-9 rounded-xl shadow-card" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold tracking-tight">{shareName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <StatusDot ok pulse={false} className="bg-success" />
              {t.guest.sharedFrom} {writable ? t.guest.readWrite : t.guest.readOnly}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <FileBrowser
          key={shareId}
          shareId={shareId}
          shareName={shareName}
          writable={writable}
          embedded
        />
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Pair-claim flow: opens when a device scans the pairing QR (/?pair=CODE).
 * Shows what it found, then registers this browser as a trusted device.
 */
export function PairClaimView({
  code,
  onDone,
  onExit,
}: {
  code: string;
  onDone: () => void;
  onExit: () => void;
}) {
  const [tab, setTab] = useState<"pair" | "owner">("pair");
  const [ownerKeyInput, setOwnerKeyInput] = useState("");
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "invalid"; message: string } | {
      kind: "found";
      serverName: string;
      baseUrl: string;
    } | { kind: "paired"; serverName: string }
  >({ kind: "loading" });
  const [inputCode, setInputCode] = useState(code || "");
  const [deviceName, setDeviceName] = useState("");
  const [pairing, setPairing] = useState(false);
  const { t } = useI18n();

  const platformGuess = /android/i.test(navigator.userAgent)
    ? "android"
    : /iphone|ipad/i.test(navigator.userAgent)
      ? "ios"
      : "web";

  const preview = useCallback(async () => {
    // The QR links to /?pair=CODE on the *server*; the code itself is enough.
    setState({ kind: "loading" });
    try {
      setState({
        kind: "found",
        serverName: t.pairClaim.yourComputer,
        baseUrl: buildLanUrl("/"),
      });
    } catch {
      setState({ kind: "invalid", message: t.pairClaim.incomplete });
    }
  }, [t]);

  useEffect(() => {
    void preview();
    setDeviceName(
      platformGuess === "android"
        ? t.pairClaim.defaultAndroid
        : platformGuess === "ios"
          ? t.pairClaim.defaultIphone
          : t.pairClaim.defaultBrowser
    );
  }, [code, t]);

  const pair = async () => {
    const finalCode = (code || inputCode).trim().toUpperCase();
    if (!finalCode || finalCode.length < 4) return;
    setPairing(true);
    try {
      const res = await Api.pairClaim({
        code: finalCode,
        deviceName: deviceName.trim() || t.pairClaim.defaultDevice,
        platform: platformGuess,
      });
      const { saveDeviceToken } = await import("@/lib/localdock/client/api");
      saveDeviceToken(res.deviceToken);
      setState({ kind: "paired", serverName: res.server.serverName });
      setTimeout(onDone, 1400);
    } catch (e) {
      setState({ kind: "invalid", message: (e as Error).message });
    } finally {
      setPairing(false);
    }
  };

  const loginAsOwner = async () => {
    const k = ownerKeyInput.trim();
    if (!k) return;
    setPairing(true);
    try {
      const { setOwnerKey } = await import("@/lib/localdock/client/api");
      setOwnerKey(k);
      const res = await Api.system();
      setState({ kind: "paired", serverName: res.serverName });
      setTimeout(onDone, 1000);
    } catch {
      const { setOwnerKey } = await import("@/lib/localdock/client/api");
      setOwnerKey(null);
      setState({ kind: "invalid", message: "مفتاح المالك غير صحيح أو غير مسموح به عبر الشبكة." });
    } finally {
      setPairing(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-card p-7 text-center shadow-pop rise">
        <LogoMark className="mx-auto size-12 rounded-2xl shadow-card" />

        {state.kind === "loading" && (
          <div className="mt-6">
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t.pairClaim.reading}</p>
          </div>
        )}

        {state.kind === "found" && (
          <>
            <h1 className="mt-5 text-xl font-bold tracking-tight">{t.pairClaim.title}</h1>
            
            <div className="mt-3 flex rounded-xl border border-border bg-muted/50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTab("pair")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 transition-all",
                  tab === "pair" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                رمز الاقتران
              </button>
              <button
                type="button"
                onClick={() => setTab("owner")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 transition-all",
                  tab === "owner" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                مفتاح المالك
              </button>
            </div>

            {tab === "pair" ? (
              <>
                {code ? (
                  <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold">
                      <Wifi className="size-4 text-success" />
                      {state.serverName}
                    </p>
                    <code className="mt-1.5 block font-mono text-2xl font-bold tracking-[0.3em]">
                      {code}
                    </code>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-start">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      {t.pairClaim.title}
                    </label>
                    <input
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="XXXXXX"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3.5 font-mono text-center text-xl font-bold tracking-[0.25em] uppercase outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
                <label className="mt-4 block text-start">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    {t.pairClaim.deviceName}
                  </span>
                  <input
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <Button
                  size="lg"
                  className="mt-5 w-full rounded-2xl"
                  onClick={pair}
                  disabled={pairing || !deviceName.trim() || !(code || inputCode).trim()}
                >
                  {pairing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t.pairClaim.trust}
                </Button>
              </>
            ) : (
              <div className="mt-4 space-y-4 text-start">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    أدخل مفتاح المالك (Owner Key)
                  </label>
                  <input
                    type="password"
                    value={ownerKeyInput}
                    onChange={(e) => setOwnerKeyInput(e.target.value)}
                    placeholder="مفتاح المالك السري..."
                    className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-xs font-mono outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Button
                  size="lg"
                  className="w-full rounded-2xl"
                  onClick={loginAsOwner}
                  disabled={pairing || !ownerKeyInput.trim()}
                >
                  {pairing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  دخول كمالك للسحابة
                </Button>
              </div>
            )}

            <button
              onClick={onExit}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {t.common.cancel}
            </button>
          </>
        )}

        {state.kind === "paired" && (
          <>
            <span className="mx-auto mt-5 flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
              <Check className="size-6" strokeWidth={2.5} />
            </span>
            <h1 className="mt-4 text-xl font-bold tracking-tight">{t.pairClaim.trustedTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.pairClaim.trustedBody(state.serverName)}
            </p>
          </>
        )}

        {state.kind === "invalid" && (
          <>
            <span className="mx-auto mt-5 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <X className="size-6" strokeWidth={2.5} />
            </span>
            <h1 className="mt-4 text-xl font-bold tracking-tight">{t.pairClaim.failedTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{state.message}</p>
            <Button variant="outline" className="mt-5 w-full rounded-2xl" onClick={onExit}>
              {t.pairClaim.goBack}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
