"use client";

import { useState } from "react";
import { type UpdateInfo, installUpdate } from "@/lib/localdock/client/updater";
import { formatBytes } from "@/lib/localdock/client/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Download, ExternalLink, CheckCircle2, Loader2, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

export function UpdateModal({
  update,
  open,
  onOpenChange,
}: {
  update: UpdateInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  if (!update) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const res = await installUpdate(update);
      toast.success(res.message);
      setInstalled(true);
      setTimeout(() => {
        onOpenChange(false);
      }, 2500);
    } catch (err) {
      toast.error((err as Error).message || "فشل بدء التحديث");
    } finally {
      setInstalling(false);
    }
  };

  const assetSize = update.apkAsset?.size || update.exeAsset?.size || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border-border/70">
        <DialogHeader className="text-start space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-6 text-primary" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                تحديث جديد متوفر
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  v{update.latestVersion}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                الإصدار الحالي: v{update.currentVersion}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {update.releaseNotes ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">ما الجديد في هذا التحديث:</p>
              <div className="ld-scroll max-h-48 overflow-y-auto rounded-2xl bg-muted/40 p-3.5 text-xs text-foreground/90 whitespace-pre-line border border-border/50">
                {update.releaseNotes}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/30 p-3.5 text-xs text-muted-foreground border border-border/40">
              يتضمن هذا التحديث تحسينات في الأداء وإصلاحات لمشاكل التحميل ومشغل الفيديو.
            </div>
          )}

          {assetSize > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>حجم الحزمة:</span>
              <span className="font-mono font-medium">{formatBytes(assetSize)}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => window.open(update.releaseUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-3.5" />
            عرض على GitHub
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => onOpenChange(false)}
            >
              لاحقاً
            </Button>
            <Button
              size="sm"
              className="rounded-xl text-xs gap-2 font-semibold shadow-sm"
              disabled={installing || installed}
              onClick={() => void handleInstall()}
            >
              {installing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  جارٍ التنزيل…
                </>
              ) : installed ? (
                <>
                  <CheckCircle2 className="size-3.5 text-success" />
                  تم البدء
                </>
              ) : (
                <>
                  <ArrowUpCircle className="size-3.5" />
                  تحديث وتثبيت الآن
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
