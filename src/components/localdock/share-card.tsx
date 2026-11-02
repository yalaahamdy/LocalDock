"use client";

import { useState, useEffect } from "react";
import type { Device, Share } from "@/lib/localdock/types";
import { Api } from "@/lib/localdock/client/api";
import { useRefresh } from "./data-hooks";
import { useNav } from "./nav";
import { QrDialog } from "./qr-dialog";
import { formatBytes } from "@/lib/localdock/client/format";
import { buildLanUrl } from "@/lib/localdock/client/lan";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Copy,
  Check,
  FolderHeart,
  FolderOpen,
  Loader2,
  QrCode,
  Settings2,
  Trash2,
  Eye,
  Pencil,
  Share2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/localdock/i18n";

/** Share card + its manage sheet (access, guest, devices, danger zone). */
export function ShareCard({ share, className }: { share: Share; className?: string }) {
  const { t } = useI18n();
  const [qrOpen, setQrOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const openFiles = useNav((s) => s.openFiles);

  // Always hand out the LAN-reachable address (never 127.0.0.1 — the desktop
  // webview runs on loopback, but phones need the machine's real IP).
  const link = buildLanUrl(`/?s=${share.slug}`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t.shareCard.copiedToast);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.shareCard.copyFailToast);
    }
  };

  const shareNative = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: share.name,
          text: `LocalDock: ${share.name}`,
          url: link,
        });
        return;
      } catch {
        /* canceled by user */
      }
    }
    await copy();
  };

  return (
    <>
      <div
        className={cn(
          "card-lift group flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-card",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/70 text-accent-foreground">
            <FolderHeart className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight">{share.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatBytes(share.sizeBytes)} · {t.shareCard.nItems(share.itemCount)}
            </p>
          </div>
          <button
            onClick={() => setManageOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground opacity-80 transition-all hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
            aria-label={t.shareCard.manageAria(share.name)}
          >
            <Settings2 className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge ok>{share.access === "read" ? t.shareCard.readOnly : t.shareCard.readWrite}</Badge>
          <Badge ok={share.guestEnabled}>
            {share.guestEnabled ? t.shareCard.guestOn : t.shareCard.devicesOnly}
          </Badge>
          {share.guestExpiresAt && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Clock className="size-3" />
              مؤقت
            </span>
          )}
        </div>

        <code dir="ltr" className="mt-3 block truncate rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          /?s={share.slug}
        </code>

        <div className="mt-3.5 flex items-center gap-1.5">
          <Button size="sm" className="h-8 flex-1 rounded-xl" onClick={() => openFiles(share.id, "")}>
            <FolderOpen className="size-4" />
            {t.shareCard.open}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl"
            onClick={() => void shareNative()}
            title="مشاركة أو نسخ الرابط"
          >
            {copied ? <Check className="size-4 text-success" /> : <Share2 className="size-4" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl"
            onClick={() => setQrOpen(true)}
            aria-label={t.shareCard.qrAria}
          >
            <QrCode className="size-4" />
          </Button>
        </div>
      </div>

      <QrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        title={t.shareCard.qrTitle(share.name)}
        description={t.shareCard.qrHint}
        qrUrl={`/api/qr?text=${encodeURIComponent(link)}`}
        link={link}
      />

      <ShareManageDialog share={share} open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        ok ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function ShareManageDialog({
  share,
  open,
  onOpenChange,
}: {
  share: Share;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(share.name);
  const [access, setAccess] = useState<"read" | "readwrite">(share.access);
  const [guest, setGuest] = useState(share.guestEnabled);
  const [rotateSlug, setRotateSlug] = useState(false);
  const [guestExpiryOption, setGuestExpiryOption] = useState<"keep" | "none" | "1h" | "24h" | "7d">("keep");
  const [deviceMode, setDeviceMode] = useState<"all" | "custom">(
    share.allowedDevices === "all" ? "all" : "custom"
  );
  const [selected, setSelected] = useState<string[]>(
    share.allowedDevices === "all" ? [] : share.allowedDevices
  );
  const [devices, setDevices] = useState<(Device & { online: boolean })[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = useRefresh();

  // load devices when the dialog opens
  useEffect(() => {
    if (!open) return;
    void Api.devices()
      .then((res) => setDevices(res.devices))
      .catch(() => undefined);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      let guestExpiresAt: number | null | undefined = undefined;
      if (!guest) {
        guestExpiresAt = null;
      } else if (guestExpiryOption === "none") {
        guestExpiresAt = null;
      } else if (guestExpiryOption === "1h") {
        guestExpiresAt = Date.now() + 3600_000;
      } else if (guestExpiryOption === "24h") {
        guestExpiresAt = Date.now() + 86400_000;
      } else if (guestExpiryOption === "7d") {
        guestExpiresAt = Date.now() + 7 * 86400_000;
      }

      const isCustomDevices = deviceMode === "custom";
      await Api.updateShare(share.id, {
        name: name.trim() || share.name,
        access,
        guestEnabled: isCustomDevices ? false : guest,
        allowedDevices: isCustomDevices ? selected : "all",
        guestExpiresAt: isCustomDevices ? null : guestExpiresAt,
        rotateSlug,
      });
      toast.success(t.shareCard.updatedToast);
      refresh.refreshShares();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await Api.deleteShare(share.id);
      toast.success(t.shareCard.stoppedToast);
      refresh.refreshShares();
      refresh.refreshSystem();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-4 text-primary" />
              {t.shareCard.manageTitle(share.name)}
            </DialogTitle>
            <DialogDescription>
              {t.shareCard.manageDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="ld-scroll max-h-[65vh] space-y-5 overflow-y-auto pe-1">
            <div className="space-y-2">
              <Label htmlFor="m-name" className="text-xs font-semibold">
                {t.shareCard.nameLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t.shareCard.accessLabel}</Label>
              <RadioGroup value={access} onValueChange={(v) => setAccess(v as "read" | "readwrite")}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-3",
                    access === "readwrite" ? "border-primary/60 bg-accent/40" : "border-border"
                  )}
                >
                  <RadioGroupItem value="readwrite" id="m-rw" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{t.shareCard.readWriteTitle}</p>
                    <p className="text-xs text-muted-foreground">{t.shareCard.readWriteDesc}</p>
                  </div>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-3",
                    access === "read" ? "border-primary/60 bg-accent/40" : "border-border"
                  )}
                >
                  <RadioGroupItem value="read" id="m-ro" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{t.shareCard.readOnlyTitle}</p>
                    <p className="text-xs text-muted-foreground">{t.shareCard.readOnlyDesc}</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-3 rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{t.shareCard.guestTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.shareCard.guestDesc}</p>
                  {deviceMode === "custom" && (
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-1">
                      ⚠️ وصول الضيوف معطّل تلقائياً لحماية المجلد لأنك اخترت أجهزة محددة فقط.
                    </p>
                  )}
                </div>
                <Switch
                  checked={deviceMode === "custom" ? false : guest}
                  disabled={deviceMode === "custom"}
                  onCheckedChange={setGuest}
                />
              </div>

              {guest && (
                <div className="space-y-2.5 border-t border-border/70 pt-2.5">
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground">صلاحية رابط الضيف</Label>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                      {[
                        { id: "keep", label: "الحالي" },
                        { id: "none", label: "بلا انتهاء" },
                        { id: "24h", label: "يوم واحد" },
                        { id: "7d", label: "أسبوع" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setGuestExpiryOption(item.id as typeof guestExpiryOption)}
                          className={cn(
                            "rounded-lg border px-1.5 py-1 text-center text-[11px] font-semibold transition-colors",
                            guestExpiryOption === item.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2">
                    <span className="text-xs">تدوير الرمز وإلغاء الرابط القديم</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={rotateSlug ? "destructive" : "outline"}
                      className="h-7 text-xs rounded-lg"
                      onClick={() => setRotateSlug((v) => !v)}
                    >
                      <RefreshCw className={cn("size-3.5", rotateSlug && "animate-spin")} />
                      {rotateSlug ? "سيتم التدوير" : "تدوير الرابط"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <Label className="text-xs font-semibold">{t.shareCard.deviceAccess}</Label>
              <RadioGroup
                value={deviceMode}
                onValueChange={(v) => {
                  const m = v as "all" | "custom";
                  setDeviceMode(m);
                  if (m === "custom") {
                    setGuest(false);
                  }
                }}
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <RadioGroupItem value="all" id="dev-all" />
                  <span className="text-sm">{t.shareCard.allDevices}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <RadioGroupItem value="custom" id="dev-custom" />
                  <span className="text-sm">{t.shareCard.specificDevices}</span>
                </label>
              </RadioGroup>

              {deviceMode === "custom" && (
                <div className="ld-scroll max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2">
                  {devices.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {t.shareCard.noDevices}
                    </p>
                  )}
                  {devices.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={selected.includes(d.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) =>
                            v ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="text-[11px] text-muted-foreground">{d.platform}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-3.5">
              <p className="text-sm font-semibold">{t.shareCard.stopSharing}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.shareCard.stopSharingNote}
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-2.5 rounded-xl"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                {t.shareCard.stopTitle}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              {t.common.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.shareCard.stopConfirmTitle(share.name)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.shareCard.stopConfirmDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.shareCard.keepSharing}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void remove()}
            >
              {t.shareCard.stopSharing}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
