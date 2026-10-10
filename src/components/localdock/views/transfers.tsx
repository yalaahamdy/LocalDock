"use client";

import { transfers, useTransfers } from "@/lib/localdock/client/transfer-engine";
import { TransferRow } from "../transfer-row";
import { EmptyState } from "../empty-state";
import { ArrowLeftRight, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { formatSpeed } from "@/lib/localdock/client/format";
import { useI18n, Ltr } from "@/lib/localdock/i18n/provider";
import { Button } from "@/components/ui/button";

export function TransfersView() {
  const { t } = useI18n();
  const items = useTransfers((s) => s.items);
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const totalActiveSpeed = items
    .filter((i) => i.status === "active")
    .reduce((acc, i) => acc + i.speedBps, 0);

  const failedItems = items.filter((i) => i.status === "failed");
  const completedItems = items.filter((i) => i.status === "completed" || i.status === "canceled");

  const clearCompleted = () => {
    for (const it of completedItems) {
      transfers.dismiss(it.id);
    }
  };

  const retryAllFailed = () => {
    for (const it of failedItems) {
      transfers.retry(it.id);
    }
  };

  const SECTIONS = [
    { label: t.transfersView.active, hint: t.transfersView.activeHint, test: (s: string) => s === "active" || s === "queued" },
    { label: t.transfersView.paused, hint: t.transfersView.pausedHint, test: (s: string) => s === "paused" },
    { label: t.transfersView.completed, hint: t.transfersView.completedHint, test: (s: string) => s === "completed" },
    { label: t.transfersView.failed, hint: t.transfersView.failedHint, test: (s: string) => s === "failed" || s === "canceled" },
  ];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={t.transfersView.emptyTitle}
        description={t.transfersView.emptyDesc}
      />
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {totalActiveSpeed > 0 ? (
            <>
              {t.transfersView.movingAtPrefix}{" "}
              <Ltr className="tnum font-semibold text-foreground">
                {formatSpeed(totalActiveSpeed)}
              </Ltr>{" "}
              {t.transfersView.movingAtSuffix}
            </>
          ) : (
            t.transfersView.allSettled
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {failedItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={retryAllFailed}
            >
              <RotateCcw className="size-3.5" />
              إعادة محاولة الكل ({failedItems.length})
            </Button>
          )}
          {completedItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              onClick={clearCompleted}
            >
              <Trash2 className="size-3.5" />
              مسح المكتملة ({completedItems.length})
            </Button>
          )}
          {completedItems.length > 0 && (
            <span className="text-xs text-muted-foreground sm:inline hidden">
              {t.transfersView.nCompleted(items.filter((i) => i.status === "completed").length)}
            </span>
          )}
        </div>
      </div>

      {SECTIONS.map((section) => {
        const list = sorted.filter((i) => section.test(i.status));
        if (list.length === 0) return null;
        return (
          <section key={section.label} aria-label={section.label}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h2 className="text-sm font-bold tracking-tight">{section.label}</h2>
              <span className="tnum text-xs text-muted-foreground">{list.length}</span>
              <span className="text-xs text-muted-foreground">· {section.hint}</span>
            </div>
            <div className="space-y-2">
              {list.map((item) => (
                <TransferRow key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}

      {items.every((i) => i.status === "completed") && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-success/25 bg-success/[0.06] py-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" />
          {t.transfersView.allDone}
        </div>
      )}
    </div>
  );
}
