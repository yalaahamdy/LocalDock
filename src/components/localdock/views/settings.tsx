"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSystem, useDevices, useShares, useActivity, useRefresh } from "../data-hooks";
import { useNav } from "../nav";
import { Api, apiErrorMessage } from "@/lib/localdock/client/api";
import { formatBytes, formatSpeed } from "@/lib/localdock/client/format";
import { useI18n } from "@/lib/localdock/i18n/provider";
import { LOCALE_LIST, LOCALES, type Locale } from "@/lib/localdock/i18n/locales";
import { THEME_PACK_LIST, THEME_PACKS, useThemePack } from "@/lib/localdock/i18n/themes";
import { activityMessage } from "@/lib/localdock/i18n/activity";
import { StatusDot, LogoMark } from "../primitives";
import { Desktop, desktopMode } from "@/lib/localdock/client/desktop";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings as SettingsIcon,
  Laptop,
  ShieldCheck,
  ServerCog,
  Network,
  HardDrive,
  ScrollText,
  Loader2,
  Check,
  MonitorSmartphone,
  Eye,
  Wifi,
  Info,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { LocalDockSettings } from "@/lib/localdock/types";

export function SettingsView() {
  const { t, locale, setLocale } = useI18n();
  const { pack, setPack } = useThemePack();
  const system = useSystem();
  const devices = useDevices();
  const shares = useShares();
  const activity = useActivity(60);
  const refresh = useRefresh();
  const { theme, setTheme } = useTheme();
  const go = useNav((s) => s.go);
  const [settings, setSettings] = useState<LocalDockSettings | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearingLog, setClearingLog] = useState(false);

  const guestSharesCount = shares.data?.filter((s) => s.guestEnabled).length ?? 0;

  useEffect(() => {
    void (async () => {
      try {
        const body = await Api.settings();
        if (body.settings) {
          setSettings(body.settings);
          setName(body.settings.serverName);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const save = async (patch: Partial<LocalDockSettings>, quiet = false) => {
    setSaving(true);
    try {
      const res = await Api.updateSettings(patch);
      setSettings(res.settings);
      // Desktop shell: keep the real Windows registry entry in sync.
      if (typeof patch.startWithWindows === "boolean") {
        await Desktop.setStartWithWindows(patch.startWithWindows);
      }
      if (!quiet) toast.success(t.settings.savedToast);
      refresh.refreshSystem();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="rounded-2xl bg-muted/70 p-1">
        <TabsTrigger value="general" className="rounded-xl">
          <SettingsIcon className="size-4" />
          {t.settings.tabGeneral}
        </TabsTrigger>
        <TabsTrigger value="security" className="rounded-xl">
          <ShieldCheck className="size-4" />
          {t.settings.tabSecurity}
        </TabsTrigger>
        <TabsTrigger value="system" className="rounded-xl">
          <ServerCog className="size-4" />
          {t.settings.tabSystem}
        </TabsTrigger>
      </TabsList>

      {/* ---------------- General ---------------- */}
      <TabsContent value="general" className="mt-5 space-y-4">
        <SectionCard
          icon={<Laptop className="size-4" />}
          title={t.settings.identityTitle}
          desc={t.settings.identityDesc}
        >
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="server-name" className="text-xs font-semibold">
                  {t.settings.serverName}
                </Label>
                <Input
                  id="server-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl"
                  placeholder={t.settings.serverNamePlaceholder}
                />
              </div>
              <Button
                className="rounded-xl"
                disabled={saving || !name.trim() || name === settings?.serverName}
                onClick={() => save({ serverName: name })}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t.common.save}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.serverNameHint}
            </p>
          </div>
        </SectionCard>

        <SectionCard
          icon={<MonitorSmartphone className="size-4" />}
          title={t.settings.appearanceTitle}
          desc={t.settings.appearanceDesc}
        >
          <div className="space-y-4">
            {/* Mode: light / dark / system */}
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setTheme(m);
                    void save({ theme: m }, true);
                  }}
                  className={cn(
                    "rounded-2xl border p-3 text-sm font-medium transition-all",
                    theme === m
                      ? "border-primary/60 bg-accent/50 text-accent-foreground"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {m === "light"
                    ? t.settings.modeLight
                    : m === "dark"
                      ? t.settings.modeDark
                      : t.settings.modeSystem}
                </button>
              ))}
            </div>

            {/* Theme packs: 4 palettes × the two modes above = 8 looks */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t.settings.themePacksTitle}
                <span className="font-normal"> — {t.settings.themePacksDesc}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {THEME_PACK_LIST.map((id) => {
                  const meta = THEME_PACKS[id];
                  const active = pack === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setPack(id)}
                      aria-pressed={active}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border p-2 text-start transition-all",
                        active
                          ? "border-primary/60 bg-accent/50 text-accent-foreground shadow-card"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <span
                        className="block h-9 w-full rounded-xl"
                        style={{
                          background: `linear-gradient(135deg, ${meta.swatch[0]}, ${meta.swatch[1]} 55%, ${meta.swatch[2]})`,
                        }}
                      />
                      <span className="mt-2 flex items-center justify-between gap-1 px-0.5 pb-0.5">
                        <span className="truncate text-xs font-semibold">
                          {t.themePacks[id]}
                        </span>
                        {active && <Check className="size-3.5 shrink-0 text-primary" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t.settings.languageTitle}
                <span className="font-normal"> — {t.settings.languageDesc}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LOCALE_LIST.map((l: Locale) => {
                  const meta = LOCALES[l];
                  const active = locale === l;
                  return (
                    <button
                      key={l}
                      onClick={() => setLocale(l)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-2xl border p-3 transition-all",
                        active
                          ? "border-primary/60 bg-accent/50 text-accent-foreground"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {meta.nativeName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {meta.name} · {meta.dir.toUpperCase()}
                        </span>
                      </span>
                      {active && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={<Laptop className="size-4" />}
          title={t.settings.startupTitle}
          desc={t.settings.startupDesc}
        >
          <label className="flex items-center justify-between rounded-xl border border-border p-3.5">
            <div className="pe-3">
              <p className="text-sm font-semibold">{t.settings.startWithWindows}</p>
              <p className="text-xs text-muted-foreground">
                {t.settings.startupNote}
              </p>
            </div>
            <Switch
              checked={settings?.startWithWindows ?? false}
              onCheckedChange={(v) => save({ startWithWindows: v })}
            />
          </label>
        </SectionCard>
      </TabsContent>

      {/* ---------------- Security ---------------- */}
      <TabsContent value="security" className="mt-5 space-y-4">
        <div className="rise rounded-3xl border border-success/25 bg-success/[0.05] p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-success/15 text-success">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">{t.settings.securityTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.settings.securityDesc}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label={t.settings.trustedDevices} value={`${devices.data?.length ?? 0}`} />
            <MiniStat label={t.settings.guestShares} value={`${guestSharesCount}`} />
            <MiniStat label={t.settings.server} value={system.data?.online ? t.status.online : t.status.offline} ok={system.data?.online} />
          </div>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => go("devices")}>
            <Eye className="size-4" />
            {t.settings.manageDevices}
          </Button>
        </div>

        <SectionCard
          icon={<ServerCog className="size-4" />}
          title={t.settings.ownerTitle}
          desc={t.settings.ownerDesc}
        >
          <label className="flex items-center justify-between rounded-xl border border-border p-3.5">
            <div className="pe-3">
              <p className="text-sm font-semibold">{t.settings.allowRemote}</p>
              <p className="text-xs text-muted-foreground">
                {t.settings.allowRemoteNote}
              </p>
            </div>
            <Switch
              checked={settings?.allowRemoteOwner ?? true}
              onCheckedChange={(v) => save({ allowRemoteOwner: v })}
            />
          </label>
        </SectionCard>

        <SectionCard
          icon={<ShieldCheck className="size-4" />}
          title={t.settings.protectionsTitle}
          desc={t.settings.protectionsDesc}
        >
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {t.settings.protections.map((item) => (
              <li key={item} className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </TabsContent>

      {/* ---------------- System ---------------- */}
      <TabsContent value="system" className="mt-5 space-y-4">
        <SectionCard
          icon={<ServerCog className="size-4" />}
          title={t.settings.statusTitle}
          desc={t.settings.statusDesc}
        >
          {system.isLoading || !system.data ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <StatusRow label={t.settings.server} value={t.status.online} ok />
              <StatusRow label={t.settings.network} value={system.data.network.length > 0 ? t.settings.nInterfaces(system.data.network.length) : t.settings.localOnly} ok={system.data.network.length > 0} />
              <StatusRow label={t.settings.storageRow} value={t.settings.storageFree(formatBytes(system.data.storage.freeBytes))} ok />
              <StatusRow label={t.settings.transfers} value={formatSpeed(system.data.transferSpeedBps)} />
              <StatusRow label={t.settings.trustedDevices} value={t.settings.devicesOnlineTrusted(system.data.devicesOnline, system.data.devicesTrusted)} />
              <StatusRow label={t.settings.platform} value={system.data.platform} />
              <StatusRow label="الإصدار" value={(system.data as { version?: string })?.version ?? "1.0.0"} />
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<Network className="size-4" />}
          title={t.settings.netTitle}
          desc={t.settings.netDesc}
        >
          <div className="space-y-2">
            {(system.data?.network ?? []).map((nic) => (
              <div key={`${nic.name}-${nic.address}`} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
                <Wifi className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{nic.name}</span>
                <code className="ms-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                  {nic.address}
                </code>
              </div>
            ))}
            {(system.data?.network ?? []).length === 0 && (
              <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground">
                {t.settings.netEmpty}
              </p>
            )}
            <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {t.settings.netNote}
            </div>
          </div>
        </SectionCard>

        {desktopMode() && (
          <SectionCard
            icon={<MonitorSmartphone className="size-4" />}
            title={t.settings.desktopTitle}
            desc={t.settings.desktopDesc}
          >
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {t.settings.desktopTray}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {t.settings.desktopRegistry}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {t.settings.desktopMdns}
              </li>
            </ul>
            <Button
              variant="outline"
              className="mt-4 rounded-xl"
              onClick={() => void Desktop.openInBrowser()}
            >
              <Eye className="size-4" />
              {t.settings.openInBrowser}
            </Button>
          </SectionCard>
        )}

        <SectionCard
          icon={<ScrollText className="size-4" />}
          title={t.settings.logTitle}
          desc={t.settings.logDesc}
        >
          <div className="ld-scroll max-h-80 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {(activity.data ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60">
                <StatusDot ok pulse={false} className="bg-primary/70" />
                <span className="min-w-0 flex-1 truncate text-foreground/90">{activityMessage(entry, t.activity)}</span>
                <code className="shrink-0 text-[10px] text-muted-foreground">{entry.type}</code>
              </div>
            ))}
            {(activity.data ?? []).length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t.settings.logEmpty}
              </p>
            )}
          </div>
          {(activity.data ?? []).length > 0 && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                disabled={clearingLog}
                onClick={async () => {
                  setClearingLog(true);
                  try {
                    await Api.clearActivity();
                    toast.success("تم تفريغ سجل الأنشطة بنجاح");
                    refresh.refreshActivity();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setClearingLog(false);
                  }
                }}
              >
                {clearingLog ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                مسح السجل
              </Button>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<HardDrive className="size-4" />}
          title={t.settings.storageTitle}
          desc={t.settings.storageDesc}
        >
          <div className="space-y-1.5 rounded-xl bg-muted/50 p-3.5 font-mono text-xs text-muted-foreground">
            <p><span className="font-semibold text-foreground">{t.settings.storageHome}</span> ./localdock</p>
            <p><span className="font-semibold text-foreground">{t.settings.storageShares}</span> localdock/Shares/*</p>
            <p><span className="font-semibold text-foreground">{t.settings.storageWebsites}</span> localdock/Websites/*</p>
            <p><span className="font-semibold text-foreground">{t.settings.storageRegistry}</span> localdock/data/*.json</p>
          </div>

          {(system.data as { shareStorage?: { shares: { id: string; name: string; bytes: number }[] } })?.shareStorage?.shares &&
           (system.data as { shareStorage?: { shares: { id: string; name: string; bytes: number }[] } }).shareStorage!.shares.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
              <p className="text-xs font-semibold">توزيع استهلاك المشاركات للمساحة:</p>
              <div className="space-y-1.5">
                {(system.data as { shareStorage?: { shares: { id: string; name: string; bytes: number }[] } }).shareStorage!.shares.map((sh) => (
                  <div key={sh.id} className="flex items-center justify-between text-xs">
                    <span className="max-w-[200px] truncate text-muted-foreground">{sh.name}</span>
                    <span className="font-mono text-[11px] font-semibold">{formatBytes(sh.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </TabsContent>
    </Tabs>
  );
}

function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/60 text-accent-foreground">
          {icon}
        </span>
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl bg-background/70 px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="tnum mt-0.5 flex items-center gap-1.5 text-sm font-bold">
        {ok !== undefined && <StatusDot ok={ok} />}
        {value}
      </p>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {ok !== undefined && <StatusDot ok={ok} />}
        {value}
      </span>
    </div>
  );
}
