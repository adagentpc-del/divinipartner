import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Circle, Clock, MinusCircle, Loader2 } from "lucide-react";

type Item = {
  id: number; itemKey: string; label: string; status: string;
  assignedTo?: string | null; notes?: string | null; sortOrder: number;
  completedAt?: string | null;
};

const STATUS_META: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground", label: "Pending" },
  in_progress: { icon: Clock, color: "text-blue-600", label: "In Progress" },
  done: { icon: Check, color: "text-green-600", label: "Done" },
  skipped: { icon: MinusCircle, color: "text-muted-foreground/60", label: "Skipped" },
};

const NEXT_STATUS: Record<string, string> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
  skipped: "pending",
};

export function ActivationChecklist({ accountId, items, pct, total, done, onChange }: {
  accountId: number;
  items: Item[];
  pct: number;
  total: number;
  done: number;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiFetch(apiUrl(`/api/sales/activation-items/${id}`), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation", accountId] });
      onChange?.();
      setBusyId(null);
    },
    onError: () => setBusyId(null),
  });

  const seed = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(apiUrl(`/api/sales/accounts/${accountId}/activation/seed`), { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activation", accountId] }),
  });

  if (!items.length) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">No activation checklist yet.</p>
        <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
          {seed.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Seed default activation checklist
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium">Activation progress</span>
            <span className="text-muted-foreground">{done} of {total} ({pct}%)</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const meta = STATUS_META[item.status] ?? STATUS_META.pending;
          const Icon = meta.icon;
          const isBusy = busyId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={isBusy}
              onClick={() => {
                setBusyId(item.id);
                update.mutate({ id: item.id, status: NEXT_STATUS[item.status] });
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
            >
              <Icon className={`h-5 w-5 shrink-0 ${meta.color} ${isBusy ? "animate-pulse" : ""}`} />
              <div className="flex-1">
                <div className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                  {item.label}
                </div>
                {item.assignedTo && <div className="text-xs text-muted-foreground mt-0.5">Owner: {item.assignedTo}</div>}
              </div>
              <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
