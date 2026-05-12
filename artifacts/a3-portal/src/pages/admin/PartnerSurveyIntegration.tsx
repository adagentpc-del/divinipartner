import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Copy, Wifi } from "lucide-react";

type IntegrationResponse = {
  integration: {
    id: number;
    partnerId: number;
    isEnabled: boolean;
    autoApprove: boolean;
    apiBaseUrl: string | null;
    apiKeySecretName: string | null;
    apiKeyPresent: boolean;
    externalPartnerId: string | null;
    notes: string | null;
    webhookSecretMasked: string | null;
    lastWebhookAt: string | null;
    lastPullAt: string | null;
    lastPullStatus: string | null;
    lastPullError: string | null;
  } | null;
  webhookUrl: string | null;
};

type SaveBody = {
  isEnabled?: boolean;
  apiBaseUrl?: string | null;
  apiKeySecretName?: string | null;
  externalPartnerId?: string | null;
  rotateSecret?: boolean;
};

export default function PartnerSurveyIntegration() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, params] = useRoute("/admin/partners/:id/survey-integration");
  const partnerId = Number(params?.id);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKeySecretName, setApiKeySecretName] = useState("");
  const [externalPartnerId, setExternalPartnerId] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const integration = useQuery<IntegrationResponse>({
    queryKey: [`/api/admin/partners/${partnerId}/integrations/asset-survey`],
    queryFn: () => apiFetch(`/api/admin/partners/${partnerId}/integrations/asset-survey`),
    enabled: !!partnerId,
  });

  useEffect(() => {
    const i = integration.data?.integration;
    if (i) {
      setApiBaseUrl(i.apiBaseUrl ?? "");
      setApiKeySecretName(i.apiKeySecretName ?? "");
      setExternalPartnerId(i.externalPartnerId ?? "");
      setIsEnabled(i.isEnabled);
    }
  }, [integration.data]);

  const save = useMutation({
    mutationFn: (body: SaveBody) => apiFetch<{ ok: true; newWebhookSecret?: string }>(`/api/admin/partners/${partnerId}/integrations/asset-survey`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [`/api/admin/partners/${partnerId}/integrations/asset-survey`] });
      if (r.newWebhookSecret) {
        setRevealedSecret(r.newWebhookSecret);
        toast({ title: "New webhook secret generated", description: "Copy it now — it won't be shown again." });
      } else {
        toast({ title: "Saved" });
      }
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const pull = useMutation({
    mutationFn: () => apiFetch<{ created: number; updated: number }>(`/api/admin/integrations/asset-survey/pull/${partnerId}`, { method: "POST", body: "{}" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [`/api/admin/partners/${partnerId}/integrations/asset-survey`] });
      toast({ title: "Pull complete", description: `${r.created} new, ${r.updated} updated` });
    },
    onError: (e: Error) => toast({ title: "Pull failed", description: e.message, variant: "destructive" }),
  });
  const testConn = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; status?: number; message?: string; error?: string; apiKeyPresent?: boolean }>(`/api/admin/integrations/asset-survey/test/${partnerId}`, { method: "POST", body: "{}" }),
    onSuccess: (r) => {
      toast({
        title: r.ok ? "Survey app reachable" : "Test failed",
        description: r.message ?? r.error ?? `HTTP ${r.status}`,
        variant: r.ok ? "default" : "destructive",
      });
    },
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  if (integration.isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const data = integration.data;
  const webhookUrl = data?.webhookUrl
    ? `${window.location.origin}${data.webhookUrl}`
    : `${window.location.origin}/api/public/integrations/asset-survey/<partner-slug>`;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Venue Asset Survey Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect this partner to A3's Venue Asset Survey app via webhook (push) or admin pull.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="font-semibold text-sm">Webhook (push)</div>
        <div>
          <Label className="text-xs">Endpoint URL</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "Copied" }); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Sign requests with HMAC-SHA256 of the raw body, header <code>X-Survey-Signature</code>.</p>
        </div>
        <div>
          <Label className="text-xs">Webhook secret</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={revealedSecret ?? data?.integration?.webhookSecretMasked ?? "(none — generate one below)"} className="font-mono text-xs" />
            {revealedSecret && (
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(revealedSecret); toast({ title: "Copied" }); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => save.mutate({ rotateSecret: true })} disabled={save.isPending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> {data?.integration?.webhookSecretMasked ? "Rotate secret" : "Generate secret"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-semibold text-sm">Admin pull (optional)</div>
        <div>
          <Label className="text-xs">Survey app API base URL</Label>
          <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://venue-survey.example.com/api" className="font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs">
            API key secret name
            {data?.integration?.apiKeyPresent
              ? <span className="text-emerald-700 font-normal"> (resolved at runtime ✓)</span>
              : data?.integration?.apiKeySecretName
                ? <span className="text-amber-700 font-normal"> (env var not set on this server)</span>
                : null}
          </Label>
          <Input value={apiKeySecretName} onChange={(e) => setApiKeySecretName(e.target.value.toUpperCase())} placeholder="VENUE_SURVEY_API_KEY" className="font-mono text-xs" />
          <p className="text-[11px] text-muted-foreground mt-1">Reference an env var / Replit Secret by name (UPPER_SNAKE_CASE). The actual key value is never stored in the database.</p>
        </div>
        <div>
          <Label className="text-xs">External partner id (optional)</Label>
          <Input value={externalPartnerId} onChange={(e) => setExternalPartnerId(e.target.value)} placeholder="Partner id in the survey app" className="font-mono text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="enabled" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          <label htmlFor="enabled" className="text-sm">Integration enabled</label>
        </div>
        <div className="flex justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            <Button variant="outline" disabled={!data?.integration?.apiBaseUrl || pull.isPending} onClick={() => pull.mutate()}>
              {pull.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Pull now
            </Button>
            <Button variant="outline" disabled={!data?.integration?.apiBaseUrl || testConn.isPending} onClick={() => testConn.mutate()}>
              {testConn.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
              Test connection
            </Button>
          </div>
          <Button onClick={() => save.mutate({
            isEnabled,
            apiBaseUrl: apiBaseUrl || null,
            apiKeySecretName: apiKeySecretName || null,
            externalPartnerId: externalPartnerId || null,
          })} disabled={save.isPending}>
            Save
          </Button>
        </div>
        {data?.integration?.lastPullAt && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Last pull: {new Date(data.integration.lastPullAt).toLocaleString()} · status <code>{data.integration.lastPullStatus}</code>
            {data.integration.lastPullError && <div className="text-rose-700 mt-1">{data.integration.lastPullError}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
