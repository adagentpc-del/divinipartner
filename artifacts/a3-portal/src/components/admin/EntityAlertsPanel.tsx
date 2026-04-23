import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import AlertList from "@/components/admin/AlertList";
import type { AlertsResponse } from "@/lib/alertTypes";

interface Props {
  scope: "partner" | "order";
  id: number;
  title?: string;
}

// Embed in PartnerForm / OrderDetail to surface entity-scoped alerts inline.
// Hidden when there are no active alerts so it doesn't clutter clean entities.
export default function EntityAlertsPanel({ scope, id, title }: Props) {
  const url = scope === "partner" ? `/api/admin/alerts/partner/${id}` : `/api/admin/alerts/order/${id}`;
  const { data } = useQuery<AlertsResponse>({
    queryKey: [url],
    queryFn: () => apiFetch(url),
    staleTime: 30 * 1000,
    retry: false,
  });
  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;
  const heading = title ?? (scope === "partner" ? "Partner alerts" : "Order alerts");
  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-amber-600" />{heading} ({alerts.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <AlertList alerts={alerts} compact showPartner={scope === "order"} />
      </CardContent>
    </Card>
  );
}
