"use client";

import { useEffect, useRef, useState } from "react";
import { setOwnerKey, getOwnerKey, Api, loadDeviceToken, saveDeviceToken, clearDeviceToken } from "@/lib/localdock/client/api";
import { setLanIp } from "@/lib/localdock/client/lan";
import { isDesktop } from "@/lib/localdock/client/desktop";
import { transfers } from "@/lib/localdock/client/transfer-engine";
import { useI18n } from "@/lib/localdock/i18n/provider";
import { AppShell } from "./app-shell";
import { Onboarding } from "./onboarding";
import { GuestView } from "./guest-view";
import { PairClaimView } from "./pair-claim-view";
import { QueryProvider } from "./data-hooks";
import { Loader2 } from "lucide-react";
import { LogoMark } from "./primitives";
import type { BootstrapInfo } from "@/lib/localdock/client/api";

type Mode = "boot" | "boot-failed" | "onboarding" | "shell" | "guest" | "pair-claim";

export default function LocalDockApp() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("boot");
  const [bootError, setBootError] = useState("");
  const [guestSlug, setGuestSlug] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const boot = async () => {
    loadDeviceToken();
    transfers.boot();
    // yield first: URL-redirect modes below must not setState synchronously
    await Promise.resolve();

    const params = new URLSearchParams(window.location.search);
    const pair = params.get("pair");
    const s = params.get("s");
    if (pair) {
      setPairCode(pair);
      setMode("pair-claim");
      window.history.replaceState(null, "", "/");
      return;
    }
    if (s) {
      setGuestSlug(s);
      setMode("guest");
      window.history.replaceState(null, "", "/");
      return;
    }

    try {
      const info: BootstrapInfo = await Api.bootstrap();
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || isDesktop();
      
      // If server authorized and returned ownerKey (loopback or allowRemoteOwner=true), adopt it!
      const effectiveOwnerKey = info.ownerKey || getOwnerKey() || null;
      setOwnerKey(effectiveOwnerKey);

      // Server-reported desktop flag AND Tauri presence (belt & suspenders).
      (window as { __LOCALDOCK_DESKTOP__?: boolean }).__LOCALDOCK_DESKTOP__ =
        !!(info.desktop && isDesktop());

      // Inject the real LAN IP so QR codes / share links use the reachable address.
      if (info.lanIp) {
        setLanIp(info.lanIp);
      }

      // If not owner, verify device pairing token
      if (!effectiveOwnerKey) {
        const token = loadDeviceToken();
        if (!token) {
          setPairCode("");
          setMode("pair-claim");
          return;
        }

        // Verify token against server - if invalid or revoked (401), clear and show pairing
        try {
          await Api.system();
        } catch (err: unknown) {
          const apiErr = err as { status?: number; code?: string };
          if (apiErr?.status === 401 || apiErr?.code === "unauthorized") {
            clearDeviceToken();
            setPairCode("");
            setMode("pair-claim");
            return;
          }
        }
      }

      if (!info.onboarded) {
        setMode("onboarding");
      } else {
        setMode("shell");
      }
    } catch (e) {
      setBootError((e as Error).message);
      setMode("boot-failed");
    }
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    // defer: boot() updates React state, so it must not run synchronously here
    const t = setTimeout(() => void boot(), 0);
    return () => clearTimeout(t);
     
  }, []);

  if (mode === "boot") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <LogoMark className="size-12 rounded-2xl shadow-card" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t.boot.starting}
        </div>
      </div>
    );
  }

  if (mode === "boot-failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <LogoMark className="size-12 rounded-2xl shadow-card" />
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {t.boot.title}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {bootError || t.boot.desc}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
        >
          {t.common.tryAgain}
        </button>
      </div>
    );
  }

  if (mode === "guest" && guestSlug) {
    return <GuestView slug={guestSlug} />;
  }

  if (mode === "pair-claim") {
    return (
      <PairClaimView
        code={pairCode ?? ""}
        onDone={() => {
          setPairCode(null);
          setMode("boot");
          void boot();
        }}
        onExit={() => {
          setPairCode(null);
          setMode("boot");
          void boot();
        }}
      />
    );
  }

  if (mode === "onboarding") {
    return (
      <Onboarding
        onDone={() => setMode("shell")}
      />
    );
  }

  return (
    <QueryProvider>
      <AppShell
        onPairSuccess={() => {
          /* a device paired from another screen — nothing to do here */
        }}
      />
    </QueryProvider>
  );
}

export { saveDeviceToken, clearDeviceToken };
