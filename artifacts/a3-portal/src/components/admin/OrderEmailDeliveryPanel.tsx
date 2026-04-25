import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, AlertTriangle, FileText, Loader2, RefreshCw } from "lucide-react";

const RETRYABLE_TYPES = new Set([
  "order_confirmation",
  "order_ops_forward",
  "order_finance_notification",
  "order_partner_contact_notification",
  "order_vendor_notification",
]);

/**
 * Section 28 — per-order email delivery panel.
 * Reads `usage_events` rows for this order via /api/orders/:id/email-events
 * and renders a compact, color-coded timeline so admins can see at a glance
 * whether the customer + ops + finance + partner-contact + vendor sends
 * actually went through, who they reached, and any error string returned by
 * Resend. No new schema — purely a read over the existing usage event log
 * that the email pipeline already emits to.
 */
type EventRow = {
  id: number;
  eventType: string;
  occurredAt: string;
  meta: any;
};

const TYPE_LABELS: Record<string, string> = {
  order_confirmation: "Customer confirmation",
  order_ops_forward: "Internal / ops forward",
  order_finance_notification: "Finance notification",
  order_partner_contact_notification: "Partner contact",
  order_vendor_notification: "Vendor notification",
};

function fmtRecipients(to: unknown): string {
  if (!to) return "—";
  if (Array.isArray(to)) return to.join(", ") || "—";
  return String(to);
}

export default function OrderEmailDeliveryPanel({ orderId }: { orderId: number }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ events: EventRow[] }>({
    queryKey: [`/api/orders/${orderId}/email-events`],
    queryFn: () => apiFetch(`/api/orders/${orderId}/email-events`),
    enabled: Number.isFinite(orderId),
  });

  const [retryFeedback, setRetryFeedback] = useState<{ id: number; ok: boolean; text: string } | null>(null);
  const retryMutation = useMutation({
    mutationFn: (eventId: number) => apiFetch(`/api/admin/email-readiness/retry/${eventId}`, { method: "POST" }),
    onSuccess: (r: any, eventId) => setRetryFeedback({
      id: eventId,
      ok: !!r.ok,
      text: r.ok ? `Resent — provider id ${r.providerId || "—"}` : `Retry failed: ${r.error || "unknown error"}`,
    }),
    onError: (e: any, eventId) => setRetryFeedback({
      id: eventId,
      ok: false,
      text: e?.message || "Retry request failed.",
    }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/email-events`] });
    },
  });
  const events = data?.events || [];
  const emailEvents = events.filter(e => e.eventType === "email.sent" || e.eventType === "email.failed");
  const pdfEvents = events.filter(e => e.eventType.startsWith("pdf."));

  // Roll up the latest result per audience so the header shows a clear
  // success/failure summary even when the timeline below is long.
  const latestByType = new Map<string, EventRow>();
  for (const e of emailEvents) {
    const t = e.meta?.type;
    if (typeof t !== "string") continue;
    if (!latestByType.has(t)) latestByType.set(t, e);
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />Email delivery
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading…</div>
      ) : emailEvents.length === 0 ? (
        <div className="text-xs text-muted-foreground">No email activity recorded yet for this order.</div>
      ) : (
        <>
          {/* Per-audience status pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(TYPE_LABELS).map(([key, label]) => {
              const ev = latestByType.get(key);
              if (!ev) return null;
              const ok = ev.eventType === "email.sent";
              return (
                <Badge
                  key={key}
                  variant={ok ? "default" : "destructive"}
                  className="text-[10px] font-normal"
                  title={ok ? `Sent ${new Date(ev.occurredAt).toLocaleString()}` : ev.meta?.error || "Failed"}
                >
                  {ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                  {label}
                </Badge>
              );
            })}
          </div>

          {/* Detailed timeline */}
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {emailEvents.map(ev => {
              const ok = ev.eventType === "email.sent";
              const m = ev.meta || {};
              const canRetry = !ok && typeof m.type === "string" && RETRYABLE_TYPES.has(m.type);
              const fb = retryFeedback?.id === ev.id ? retryFeedback : null;
              return (
                <div key={ev.id} className={`text-xs rounded-md border p-2 ${ok ? "bg-emerald-50/40 border-emerald-200" : "bg-rose-50/40 border-rose-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      {ok ? <CheckCircle2 className="h-3 w-3 text-emerald-700" /> : <AlertTriangle className="h-3 w-3 text-rose-700" />}
                      {TYPE_LABELS[m.type] || m.type || "Email"}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(ev.occurredAt).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">To: <span className="text-foreground">{fmtRecipients(m.to)}</span></div>
                  {m.subject && <div className="text-muted-foreground truncate" title={m.subject}>Subject: {m.subject}</div>}
                  {ok && m.attached && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                    <div className="text-muted-foreground"><FileText className="h-3 w-3 inline mr-1" />Attached: {m.attachments.join(", ")}</div>
                  )}
                  {!ok && m.error && <div className="text-rose-700 mt-0.5">Error: {m.error}</div>}
                  {canRetry && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        disabled={retryMutation.isPending && retryMutation.variables === ev.id}
                        onClick={() => retryMutation.mutate(ev.id)}
                        title="Rebuild this email from the current order data and resend it."
                      >
                        {retryMutation.isPending && retryMutation.variables === ev.id
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <RefreshCw className="h-3 w-3 mr-1" />}
                        Retry send
                      </Button>
                      {fb && (
                        <span className={fb.ok ? "text-emerald-700 text-[11px]" : "text-rose-700 text-[11px]"}>{fb.text}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pdfEvents.length > 0 && (
            <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground">
              {pdfEvents.length} PDF render{pdfEvents.length === 1 ? "" : "s"} logged ({pdfEvents.filter(e => e.eventType === "pdf.failed").length} failed).
            </div>
          )}
        </>
      )}
    </Card>
  );
}
