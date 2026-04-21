import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Sparkles, Building2, Palette, MapPin, Package, Truck, DollarSign, Eye, Rocket } from "lucide-react";

const STEPS = [
  { key: "intro", title: "Welcome", icon: Sparkles, description: "Quick orientation." },
  { key: "partner", title: "Create your first partner", icon: Building2, description: "A partner is the brand whose customers place orders.", action: { label: "Open partners", href: "/admin/partners" } },
  { key: "branding", title: "Configure branding", icon: Palette, description: "Logo, colors, intro copy, and landing-page sections.", action: { label: "Open partners", href: "/admin/partners" } },
  { key: "venues", title: "Add cities & venues", icon: MapPin, description: "Required for ordering portals — drives shipping and event creation.", action: { label: "Cities & venues", href: "/admin/cities" } },
  { key: "catalog", title: "Set up packages & products", icon: Package, description: "Define what clients can order.", action: { label: "Packages", href: "/admin/packages" } },
  { key: "suppliers", title: "Configure supplier defaults", icon: Truck, description: "Set the default supplier and per-partner routing rules.", action: { label: "Suppliers", href: "/admin/suppliers" } },
  { key: "billing", title: "Pick a billing model", icon: DollarSign, description: "Decide who issues invoices: A3, partner, or external.", action: { label: "Billing", href: "/admin/billing" } },
  { key: "preview", title: "Preview the portal", icon: Eye, description: "Walk through the public portal as a client would.", action: { label: "Open portal", href: "/admin/partners" } },
  { key: "launch", title: "Activate the partner", icon: Rocket, description: "Move from Draft → Live from the partner's rollout checklist.", action: { label: "Partners", href: "/admin/partners" } },
];

export default function LaunchWizard() {
  const [stepIdx, setStepIdx] = useState(0);
  const { data: platform } = useQuery({ queryKey: ["launch-platform"], queryFn: () => apiFetch<any>("/api/launch/platform") });
  const { data: partners } = useQuery({ queryKey: ["partners-light"], queryFn: () => apiFetch<any[]>("/api/partners") });

  const step = STEPS[stepIdx];
  const StepIcon = step.icon;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Launch wizard</h1>
        <p className="text-sm text-muted-foreground">Get the platform from setup to a live partner without missing a beat.</p>
      </div>

      {platform && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Platform readiness</CardTitle>
              <Badge variant={platform.blockerCount === 0 ? "default" : "destructive"}>
                {platform.completionPct}% · {platform.blockerCount} blocker(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={platform.completionPct} />
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div><span className="text-muted-foreground">Partners:</span> <strong>{platform.partnerCount}</strong></div>
              <div><span className="text-muted-foreground">Live:</span> <strong>{platform.livePartnerCount}</strong></div>
              <div><span className="text-muted-foreground">Draft:</span> <strong>{platform.draftPartnerCount}</strong></div>
              <div><span className="text-muted-foreground">Demo:</span> <strong>{platform.demoPartnerCount}</strong></div>
            </div>
            <div className="grid gap-1.5">
              {platform.items.map((it: any) => (
                <div key={it.key} className="flex items-center gap-2 text-sm">
                  {it.status === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className={`h-4 w-4 ${it.severity === "blocker" ? "text-rose-500" : "text-amber-500"}`} />}
                  <span className={it.status === "complete" ? "line-through text-muted-foreground" : ""}>{it.label}</span>
                  {it.status !== "complete" && it.link && <Link href={it.link} className="ml-auto text-xs text-blue-600 hover:underline">Go →</Link>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card>
          <CardContent className="p-3">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const I = s.icon;
                const active = i === stepIdx;
                const done = i < stepIdx;
                return (
                  <li key={s.key}>
                    <button onClick={() => setStepIdx(i)} className={`w-full rounded-md px-2 py-1.5 text-left text-sm flex items-center gap-2 ${active ? "bg-primary text-primary-foreground" : done ? "text-muted-foreground" : "hover:bg-muted"}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <I className="h-3.5 w-3.5" />}
                      <span className="truncate">{i + 1}. {s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2.5"><StepIcon className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>Step {stepIdx + 1} of {STEPS.length}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{step.description}</p>

            {step.key === "intro" && (
              <div className="space-y-2 text-sm">
                <p>This wizard walks you through everything needed to bring your first partner live. You can leave and come back anytime — your progress is reflected in the platform readiness card above.</p>
                <p className="text-muted-foreground">Each step links to the relevant area of the app. Blocker items must be resolved before you can launch a partner; warnings will let you proceed with an override note.</p>
              </div>
            )}
            {step.key === "partner" && partners && (
              <div className="space-y-2">
                <p className="text-sm">{partners.length === 0 ? "No partners yet — create one to begin." : `${partners.length} partner(s) so far.`}</p>
                {partners.length > 0 && (
                  <div className="grid gap-1.5">
                    {partners.slice(0, 5).map((p: any) => (
                      <Link key={p.id} href={`/admin/partners/${p.id}/edit`} className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted">
                        <span>{p.companyName}</span>
                        <Badge variant={p.launchStatus === "live" ? "default" : p.launchStatus === "paused" ? "destructive" : "secondary"}>{p.launchStatus || "draft"}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {step.action && (
              <Link href={step.action.href}><Button>{step.action.label}</Button></Link>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="outline" disabled={stepIdx === 0} onClick={() => setStepIdx(i => i - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>
              <Button disabled={stepIdx === STEPS.length - 1} onClick={() => setStepIdx(i => i + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
