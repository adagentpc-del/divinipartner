import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchPublicConfig, type PublicConfig } from "@/lib/publicUrl";
import { Globe, ShieldCheck, AlertTriangle, Copy, ExternalLink, Loader2 } from "lucide-react";
import { DemoVideoSettings } from "@/components/admin/DemoVideoSettings";

export default function Settings() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicConfig()
      .then((c) => { setCfg(c); setLoading(false); })
      .catch((e) => { setError(e?.message || "Failed to load"); setLoading(false); });
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace configuration & deployment domains.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Public domain</CardTitle>
          <CardDescription>The canonical URL used in customer-facing emails, links, and metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {cfg && (
            <>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Active public URL</div>
                    <div className="font-mono text-base mt-1 break-all">{cfg.publicAppUrl}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copy(cfg.publicAppUrl)} className="gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy</Button>
                    <Button variant="outline" size="sm" asChild><a href={cfg.publicAppUrl} target="_blank" rel="noreferrer" className="gap-1.5 inline-flex items-center"><ExternalLink className="h-3.5 w-3.5" /> Open</a></Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={cfg.publicAppUrlConfigured ? "default" : "secondary"}>
                    Source: {cfg.source}
                  </Badge>
                  {cfg.isCustomDomain ? (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="h-3 w-3" /> Custom domain</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300"><AlertTriangle className="h-3 w-3" /> Replit fallback</Badge>
                  )}
                </div>
              </div>

              {!cfg.publicAppUrlConfigured && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-2">
                  <div className="font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> PUBLIC_APP_URL is not set</div>
                  <p className="text-amber-900">
                    Customer-facing links will fall back to the Replit deployment URL. To use your custom domain in
                    emails, order confirmations, and shareable links, set the <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-xs">PUBLIC_APP_URL</code> environment
                    variable to your full origin (e.g. <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-xs">https://portal.a3visual.com</code>) and restart the API server.
                  </p>
                </div>
              )}

              {cfg.fallbackHosts.length > 0 && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Internal / fallback hosts</div>
                  <p className="text-xs text-muted-foreground">These Replit-managed hostnames remain reachable for internal use. Requests to these hosts on the deployed app will redirect to the canonical public URL above when a custom domain is configured.</p>
                  <ul className="space-y-1">
                    {cfg.fallbackHosts.map((h) => (
                      <li key={h} className="font-mono text-xs flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/40">
                        <span className="break-all">{h}</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy(h)}><Copy className="h-3 w-3" /></Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Where this URL is used</div>
                <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
                  <li>Admin notification emails (e.g. new request alerts)</li>
                  <li>Shareable onboarding links</li>
                  <li>Future order confirmations and invoice public URLs</li>
                  <li>Canonical-host redirect on the deployed app</li>
                </ul>
              </div>
            </>
          )}

          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Override (read-only)</div>
            <Input value={cfg?.publicAppUrl || ""} readOnly className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground mt-2">To change this value, update the <code className="font-mono">PUBLIC_APP_URL</code> environment secret and restart the API server.</p>
          </div>
        </CardContent>
      </Card>

      <DemoVideoSettings />
    </div>
  );
}
