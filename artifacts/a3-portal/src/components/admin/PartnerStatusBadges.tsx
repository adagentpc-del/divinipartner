import { Badge } from "@/components/ui/badge";

interface Props {
  partner: {
    isActive?: boolean;
    archivedAt?: string | null;
    launchStatus?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  };
  staleSetupDays?: number;
  size?: "xs" | "sm";
}

const DAY = 24 * 60 * 60 * 1000;

// Reusable inline status pills for inactive / archived / stale-setup partners.
// Mirrors the same rules used by the alerts deriver on the backend so the UI
// never disagrees with the alert center.
export default function PartnerStatusBadges({ partner, staleSetupDays = 30, size = "xs" }: Props) {
  const cls = size === "xs" ? "text-[10px]" : "text-xs";
  const out: React.ReactNode[] = [];

  if (partner.archivedAt) {
    out.push(
      <Badge key="archived" variant="outline" className={`${cls} border-red-300 bg-red-50 text-red-700`}>
        Archived
      </Badge>
    );
  } else if (partner.isActive === false) {
    out.push(
      <Badge key="inactive" variant="outline" className={`${cls} border-red-300 bg-red-50 text-red-700`}>
        Inactive
      </Badge>
    );
  }

  if (!partner.archivedAt && partner.isActive !== false) {
    const ls = partner.launchStatus ?? "draft";
    if (ls === "draft" || ls === "preview") {
      const base = partner.updatedAt || partner.createdAt;
      if (base) {
        const ageDays = (Date.now() - new Date(base).getTime()) / DAY;
        if (ageDays > staleSetupDays) {
          out.push(
            <Badge key="stale" variant="outline" className={`${cls} border-amber-300 bg-amber-50 text-amber-800`}>
              Stale setup
            </Badge>
          );
        }
      }
    }
  }

  return out.length === 0 ? null : <div className="inline-flex gap-1 flex-wrap">{out}</div>;
}
