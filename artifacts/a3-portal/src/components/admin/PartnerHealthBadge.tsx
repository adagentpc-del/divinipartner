import { Badge } from "@/components/ui/badge";

const META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-700" },
  onboarding: { label: "Onboarding", cls: "bg-blue-100 text-blue-700" },
  live_fragile: { label: "Live · fragile", cls: "bg-amber-100 text-amber-700" },
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  healthy: { label: "Healthy", cls: "bg-emerald-200 text-emerald-900" },
  at_risk: { label: "At risk", cls: "bg-rose-100 text-rose-700" },
};

export function PartnerHealthBadge({ status, score }: { status: string; score?: number }) {
  const m = META[status] || META.onboarding;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}{typeof score === "number" && <span className="opacity-70">· {score}</span>}
    </span>
  );
}
