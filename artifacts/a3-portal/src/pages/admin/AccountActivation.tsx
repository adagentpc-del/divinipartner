import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Rocket, Settings, Loader2 } from "lucide-react";
import { ActivationChecklist } from "@/components/sales/ActivationChecklist";

const STATUSES = ["lead", "proposal_prepared", "in_review", "approved", "activating", "active", "paused", "suspended"];
const STATUS_BADGE: Record<string, string> = {
  lead: "bg-slate-100 text-slate-700",
  proposal_prepared: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  approved: "bg-emerald-100 text-emerald-700",
  activating: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
};

export default function AccountActivation() {
  const [, params] = useRoute("/admin/sales/activation/:accountId");
  const [, setLocation] = useLocation();
  const accountId = Number(params?.accountId);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["activation", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const res = await apiFetch(apiUrl(`/api/sales/accounts/${accountId}/activation`));
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
  });

  const advance = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiFetch(apiUrl(`/api/sales/accounts/${accountId}/activation/advance`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation", accountId] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found.</div>;

  const { account, progress } = data;

  return (
    <div className="space-y-6 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/sales")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to sales
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Rocket className="h-4 w-4" /> Activation workflow
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{account.name}</h1>
          <p className="text-muted-foreground mt-1 capitalize">
            {account.accountType.replace(/_/g, " ")} · {account.whiteLabelLevel !== "none" ? `${account.whiteLabelLevel} white-label` : "standard branding"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/commercial/accounts/${accountId}`}>
            <Button variant="outline"><Settings className="h-4 w-4 mr-2" /> Account settings</Button>
          </Link>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Activation status</div>
            <Badge className={`${STATUS_BADGE[account.activationStatus] ?? ""} text-base mt-1 capitalize`}>
              {account.activationStatus.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Advance to:</span>
            <Select onValueChange={(v) => advance.mutate(v)} disabled={advance.isPending}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Choose new status…" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            {advance.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </div>
        {advance.error && <p className="text-sm text-red-600 mt-3">{(advance.error as Error).message}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-4">Activation checklist</h2>
        <ActivationChecklist
          accountId={accountId}
          items={progress.items}
          pct={progress.pct}
          total={progress.total}
          done={progress.done}
        />
      </Card>
    </div>
  );
}
