export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "failed_email"
  | "missing_artwork"
  | "order_exception"
  | "inactive_partner"
  | "stale_partner_setup"
  | "unresolved_support_issue"
  | "missing_contact_config"
  | "asset_issue"
  | "manual_followup";

export interface Alert {
  key: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  partnerId: number | null;
  partnerName: string | null;
  orderId: number | null;
  assetId: number | null;
  link: string | null;
  occurredAt: string;
  meta?: Record<string, unknown>;
}

export interface AlertsResponse {
  alerts: Alert[];
  summary: {
    total: number;
    bySeverity: Record<AlertSeverity, number>;
    byType: Record<AlertType, number>;
  };
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  failed_email: "Failed email",
  missing_artwork: "Missing artwork",
  order_exception: "Order exception",
  inactive_partner: "Inactive partner",
  stale_partner_setup: "Stale partner setup",
  unresolved_support_issue: "Unresolved support issue",
  missing_contact_config: "Missing contact config",
  asset_issue: "Asset issue",
  manual_followup: "Manual follow-up",
};

export const SEVERITY_PILL: Record<AlertSeverity, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-sky-100 text-sky-800 border-sky-200",
};
