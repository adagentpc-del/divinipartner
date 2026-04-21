import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";

export default function SalesShowcase() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-showcase"],
    queryFn: async () => (await apiFetch(apiUrl("/api/sales/showcase"))).json(),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlayCircle className="h-4 w-4" /> Demo & showcase
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Showcase Routes</h1>
        <p className="text-muted-foreground mt-1">Curated previews for sales calls, white-label demos, and investor walkthroughs.</p>
      </div>

      <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm text-amber-900">
        <div className="flex gap-2 items-start">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Tip:</strong> Toggle <strong>Demo Mode</strong> in the header before opening a preview to hide internal financial details, monetization notes, and operational badges that shouldn't appear in front of a prospect.
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data?.presets ?? []).map((s: any) => (
          <Card key={s.key} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
            <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.audience}</div>
            <h3 className="font-semibold text-lg">{s.title}</h3>
            <p className="text-sm text-muted-foreground flex-1">{s.description}</p>
            <Link href={s.targetPath}>
              <Button variant="outline" className="w-full mt-2">
                Open preview <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
