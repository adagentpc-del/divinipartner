import { Link } from "wouter";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { ALERT_TYPE_LABEL, SEVERITY_PILL, type Alert } from "@/lib/alertTypes";

interface Props {
  alerts: Alert[];
  emptyText?: string;
  compact?: boolean;
  showPartner?: boolean;
}

// Reusable list renderer used by AlertCenter, dashboard widget, and per-entity panels.
export default function AlertList({ alerts, emptyText = "No active alerts.", compact = false, showPartner = true }: Props) {
  if (alerts.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyText}</div>;
  }
  return (
    <ul className="divide-y">
      {alerts.map(a => {
        const body = (
          <div className={`flex items-start gap-3 ${compact ? "py-2" : "py-3"}`}>
            <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded border ${SEVERITY_PILL[a.severity]}`} title={a.severity}>
              <AlertTriangle className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{a.title}</span>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${SEVERITY_PILL[a.severity]}`}>
                  {ALERT_TYPE_LABEL[a.type]}
                </span>
                {showPartner && a.partnerName && (
                  <span className="text-[11px] text-muted-foreground">· {a.partnerName}</span>
                )}
              </div>
              {a.detail && <div className={`text-xs text-muted-foreground ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{a.detail}</div>}
              {!compact && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {a.occurredAt ? new Date(a.occurredAt).toLocaleString() : ""}
                </div>
              )}
            </div>
            {a.link && <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />}
          </div>
        );
        return (
          <li key={a.key}>
            {a.link ? (
              <Link href={a.link}>
                <div className="px-3 hover:bg-muted/40 cursor-pointer">{body}</div>
              </Link>
            ) : (
              <div className="px-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
