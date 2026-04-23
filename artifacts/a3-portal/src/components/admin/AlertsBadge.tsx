import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/api";

// Compact alert counter for the admin header. Hidden when no alerts.
export default function AlertsBadge() {
  const { data } = useQuery<{ summary: { total: number; bySeverity: { critical: number; warning: number; info: number } } }>({
    queryKey: ["/api/admin/alerts/summary"],
    queryFn: () => apiFetch("/api/admin/alerts/summary"),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });
  const total = data?.summary?.total ?? 0;
  const critical = data?.summary?.bySeverity?.critical ?? 0;
  const warning = data?.summary?.bySeverity?.warning ?? 0;

  return (
    <Link href="/admin/alerts">
      <button
        type="button"
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
        title={total === 0 ? "No active alerts" : `${total} active alert${total === 1 ? "" : "s"}${critical > 0 ? ` (${critical} critical)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center text-white ${critical > 0 ? "bg-red-600" : warning > 0 ? "bg-amber-500" : "bg-sky-500"}`}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
    </Link>
  );
}
