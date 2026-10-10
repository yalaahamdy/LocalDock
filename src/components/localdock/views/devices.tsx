"use client";

import { useCallback, useEffect, useState } from "react";
import { Api } from "@/lib/localdock/client/api";
import { useDevices, useRefresh } from "../data-hooks";
import { EmptyState } from "../empty-state";
import { QrDialog } from "../qr-dialog";
import { timeAgo } from "@/lib/localdock/client/format";
import { useI18n } from "@/lib/localdock/i18n/provider";
import { apiErrorMessage } from "@/lib/localdock/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  QrCode,
  Plus,
  ScanLine,
  Loader2,
  ShieldOff,
  Wifi,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Device } from "@/lib/localdock/types";

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("android")) return Smartphone;
  if (p.includes("ios") || p.includes("iphone") || p.includes("ipad")) return Tablet;
  if (p.includes("web") || p.includes("browser")) return Monitor;
  return Laptop;
}

export function AddDeviceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const res = await Api.pairStart();
      setQrUrl(res.qrUrl);
      setCode(res.code);
      setClaimUrl(res.claimUrl);
      setExpiresAt(res.expiresAt);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void start();
  }, [open, start]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const expired = expiresAt !== null && remaining <= 0;

  return (
    <QrDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.devicesView.title}
      description={
        expired
          ? t.devicesView.qrExpired
          : t.devicesView.qrHint
      }
      qrUrl={qrUrl ?? "/api/qr?text=loading"}
      link={claimUrl}
      expiresInSec={expired ? 0 : remaining}
      onRefresh={start}
    />
  );
}

/* ------------------------------------------------------------------ */

export function DevicesView({ onPairSuccess }: { onPairSuccess?: () => void }) {
  const { t } = useI18n();
  const devices = useDevices();
  const refresh = useRefresh();
  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<(Device & { online: boolean }) | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Device | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const claim = async () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await Api.pairClaim({
        code,
        deviceName: t.devicesView.thisBrowser,
        platform: /android/i.test(navigator.userAgent)
          ? "android"
          : /iphone|ipad/i.test(navigator.userAgent)
            ? "ios"
            : "web",
      });
      const { saveDeviceToken } = await import("@/lib/localdock/client/api");
      saveDeviceToken(res.deviceToken);
      toast.success(t.devicesView.pairedToast(res.server.serverName));
      setManualCode("");
      onPairSuccess?.();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const saveDeviceName = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    try {
      await Api.updateDevice(renameTarget.id, renameName.trim());
      toast.success("تم تحديث اسم الجهاز");
      setRenameTarget(null);
      refresh.refreshDevices();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setRenaming(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await Api.revokeDevice(revokeTarget.id);
      toast.success(t.devicesView.revokeToast(revokeTarget.name));
      refresh.refreshDevices();
      refresh.refreshSystem();
      refresh.refreshActivity();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t.devicesView.title2}</h2>
          <p className="text-sm text-muted-foreground">
            {t.devicesView.subtitle}
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setAddOpen(true)}>
          <QrCode className="size-4" />
          {t.devicesView.addDevice}
        </Button>
      </div>

      {/* Pair via code (for devices without a camera) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ScanLine className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {t.devicesView.cameraHint}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualCode.trim()) {
                void claim();
              }
            }}
            placeholder={t.devicesView.codePlaceholder}
            maxLength={6}
            dir="ltr"
            className="w-24 rounded-xl border border-border bg-background px-3 py-1.5 text-center font-mono text-sm font-bold uppercase tracking-[0.25em]"
            aria-label={t.devicesView.codeAria}
          />
          <Button size="sm" variant="outline" className="rounded-xl" onClick={claim} disabled={!manualCode.trim()}>
            {t.devicesView.pair}
          </Button>
        </div>
      </div>

      {devices.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (devices.data ?? []).length === 0 ? (
        <EmptyState
          icon={Laptop}
          title={t.devicesView.emptyTitle}
          description={t.devicesView.emptyDesc}
          actionLabel={t.devicesView.showQr}
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(devices.data ?? []).map((device, idx) => {
            const Icon = platformIcon(device.platform);
            return (
              <div
                key={device.id}
                className={cn(
                  "card-lift rise flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-card",
                  `rise-${Math.min(idx + 1, 4)}`
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/70 text-accent-foreground">
                  <Icon className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{device.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {device.online ? (
                      <>
                        <Wifi className="size-3 text-success" />
                        <span className="font-medium text-success">{t.devicesView.onlineNow}</span>
                      </>
                    ) : (
                      <>{t.devicesView.lastSeen(timeAgo(device.lastSeenAt))}</>
                    )}
                    <span>{t.devicesView.pairedAgo(timeAgo(device.pairedAt))}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setRenameTarget(device);
                      setRenameName(device.name);
                    }}
                    title="تعديل اسم الجهاز"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive px-2 sm:px-3"
                    onClick={() => setRevokeTarget(device)}
                    title={t.devicesView.revoke}
                    aria-label={t.devicesView.revoke}
                  >
                    <ShieldOff className="size-4 shrink-0" />
                    <span className="hidden sm:inline ms-1">{t.devicesView.revoke}</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddDeviceDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>إعادة تسمية الجهاز</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveDeviceName()}
              placeholder="اسم الجهاز الجديد"
              className="rounded-xl"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void saveDeviceName()} disabled={renaming || !renameName.trim()}>
              {renaming ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.devicesView.revokeTitle(revokeTarget?.name ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.devicesView.revokeDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void revoke()}
              disabled={revoking}
            >
              {revoking ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
              {t.devicesView.revokeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
