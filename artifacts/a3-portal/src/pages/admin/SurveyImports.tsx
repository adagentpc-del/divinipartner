import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Check, X, Trash2, Pencil } from "lucide-react";

type SurveyAsset = {
  id: number;
  partnerId: number;
  externalAssetId: string | null;
  name: string;
  description: string | null;
  category: string | null;
  venueName: string | null;
  cityName: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  materialOverrideMode: "per_item" | "global" | "custom";
  approvedMaterialsJson: string[] | null;
  customApprovedMaterialsJson: string[] | null;
  publicPhotoUrl: string | null;
  publicPhotosJson: Array<{ url: string; caption?: string }> | null;
  internalPhotosJson: Array<{ url: string; caption?: string }> | null;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  diameterIn: number | null;
  areaSqft: number | null;
  shape: string | null;
  measurementUnit: string | null;
  orientation: string | null;
  surfaceMaterial: string | null;
  environment: string | null;
  zoneName: string | null;
  primaryApplicationsJson: string[] | null;
  recommendedApplicationsJson: string[] | null;
  alternateApplicationsJson: string[] | null;
  visibilityTier: string | null;
  publicStatus: string | null;
  publicDeckInclude: boolean;
  portalVisible: boolean;
  netsuiteInclude: boolean;
  designNeeded: boolean;
  commissionEligible: boolean;
  opsOwner: string | null;
  surveyorName: string | null;
  installNotes: string | null;
  productionNotes: string | null;
  internalNotes: string | null;
  netsuiteAssetNumber: string | null;
  netsuiteVenueNumber: string | null;
  rejectedReason: string | null;
  ingestedAt: string;
};

type ApprovedMaterial = { id: number; name: string; category: string | null; isActive: boolean };
type Partner = { id: number; companyName: string };

const STATUS_TONE: Record<SurveyAsset["approvalStatus"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

type AssetPatch = Partial<Pick<SurveyAsset,
  "approvalStatus" | "rejectedReason" | "name" | "description" | "category" |
  "approvedMaterialsJson" | "customApprovedMaterialsJson" | "materialOverrideMode" |
  "internalNotes" | "installNotes" | "productionNotes"
>>;

export default function SurveyImports() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [partnerFilter, setPartnerFilter] = useState<string>("");

  const partners = useQuery<Partner[]>({ queryKey: ["/api/admin/partners"], queryFn: () => apiFetch("/api/admin/partners") });
  const materials = useQuery<ApprovedMaterial[]>({
    queryKey: ["/api/admin/approved-materials"],
    queryFn: () => apiFetch<{ materials: ApprovedMaterial[] }>("/api/admin/approved-materials").then(r => r.materials),
  });
  const assets = useQuery<SurveyAsset[]>({
    queryKey: ["/api/admin/survey-assets", statusFilter, partnerFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (partnerFilter) params.set("partnerId", partnerFilter);
      return apiFetch<{ assets: SurveyAsset[] }>(`/api/admin/survey-assets?${params.toString()}`).then(r => r.assets);
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: number; patch: AssetPatch }) =>
      apiFetch(`/api/admin/survey-assets/${vars.id}`, { method: "PATCH", body: JSON.stringify(vars.patch) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/survey-assets"] }); toast({ title: "Updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/survey-assets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/survey-assets"] }); toast({ title: "Deleted" }); },
  });
  const pull = useMutation({
    mutationFn: (partnerId: number) => apiFetch<{ created: number; updated: number }>(`/api/admin/integrations/asset-survey/pull/${partnerId}`, { method: "POST", body: "{}" }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["/api/admin/survey-assets"] }); toast({ title: "Pull complete", description: `${r.created} new, ${r.updated} updated` }); },
    onError: (e: Error) => toast({ title: "Pull failed", description: e.message, variant: "destructive" }),
  });

  const partnersById = new Map((partners.data ?? []).map(p => [p.id, p.companyName]));
  const allMaterialNames = (materials.data ?? []).filter(m => m.isActive).map(m => m.name);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Venue Asset Survey Imports</h1>
        <p className="text-sm text-muted-foreground mt-1">Approve assets pulled from the Venue Asset Survey app before they appear on partner portals.</p>
      </div>

      <Card className="p-4">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Approval status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Partner</Label>
            <Select value={partnerFilter || "all"} onValueChange={(v) => setPartnerFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                {(partners.data ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button variant="outline" disabled={!partnerFilter || pull.isPending} onClick={() => partnerFilter && pull.mutate(Number(partnerFilter))}>
              {pull.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-sync from survey
            </Button>
          </div>
        </div>
      </Card>

      {assets.isLoading ? (
        <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
      ) : assets.data?.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No assets match the current filter.</Card>
      ) : (
        <div className="space-y-6">
          {(() => {
            // Group by partner so the inbox is scannable when assets stream in
            // from multiple partners at once. Per the spec, ops triages by
            // partner first (one curation pass = one Asset_Master section).
            const groups = new Map<number, SurveyAsset[]>();
            for (const a of assets.data ?? []) {
              const arr = groups.get(a.partnerId) ?? [];
              arr.push(a);
              groups.set(a.partnerId, arr);
            }
            return Array.from(groups.entries()).map(([partnerId, list]) => (
              <div key={partnerId} className="space-y-3">
                <div className="flex items-baseline gap-3 border-b pb-1">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    {partnersById.get(partnerId) ?? `Partner #${partnerId}`}
                  </h2>
                  <span className="text-xs text-muted-foreground">{list.length} asset{list.length === 1 ? "" : "s"}</span>
                </div>
                {list.map(a => (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    partnerName={partnersById.get(a.partnerId) ?? `Partner #${a.partnerId}`}
                    allMaterials={allMaterialNames}
                    onPatch={(patch) => update.mutate({ id: a.id, patch })}
                    onDelete={() => { if (confirm(`Delete "${a.name}"?`)) remove.mutate(a.id); }}
                    busy={update.isPending || remove.isPending}
                  />
                ))}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function AssetRow({ asset, partnerName, allMaterials, onPatch, onDelete, busy }: {
  asset: SurveyAsset;
  partnerName: string;
  allMaterials: string[];
  onPatch: (patch: AssetPatch) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [overrideMode, setOverrideMode] = useState<SurveyAsset["materialOverrideMode"]>(asset.materialOverrideMode);
  // Per-item default: union of recommended + alternate applications from the
  // survey workbook, falling back to whatever was previously persisted.
  const surveyDefaults = Array.from(new Set([
    ...(asset.recommendedApplicationsJson ?? []),
    ...(asset.alternateApplicationsJson ?? []),
  ]));
  const [customMats, setCustomMats] = useState<string[]>(
    asset.customApprovedMaterialsJson ?? surveyDefaults,
  );
  const [perItemMats, setPerItemMats] = useState<string[]>(
    (asset.approvedMaterialsJson && asset.approvedMaterialsJson.length > 0)
      ? asset.approvedMaterialsJson
      : surveyDefaults,
  );
  const [rejectedReason, setRejectedReason] = useState(asset.rejectedReason ?? "");
  // Inline edit of customer-facing fields (Task #5 step 5: admin must be able
  // to clean up Public Title / Description before the asset goes live).
  const [editingPublic, setEditingPublic] = useState(false);
  const [publicName, setPublicName] = useState(asset.name);
  const [publicDesc, setPublicDesc] = useState(asset.description ?? "");

  const toggleCustom = (m: string) => setCustomMats(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  const togglePerItem = (m: string) => setPerItemMats(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const photos = asset.publicPhotosJson?.map(p => p.url) ?? (asset.publicPhotoUrl ? [asset.publicPhotoUrl] : []);
  const internalPhotos = asset.internalPhotosJson?.map(p => p.url) ?? [];

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {editingPublic ? (
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider">Public title</Label>
                <Input value={publicName} onChange={(e) => setPublicName(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider">Public description</Label>
                <Textarea value={publicDesc} onChange={(e) => setPublicDesc(e.target.value)} rows={2} className="text-sm" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { onPatch({ name: publicName.trim() || asset.name, description: publicDesc.trim() || null }); setEditingPublic(false); }} disabled={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setPublicName(asset.name); setPublicDesc(asset.description ?? ""); setEditingPublic(false); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-base font-semibold flex items-center gap-2">
                {asset.name}
                <Button size="sm" variant="ghost" onClick={() => setEditingPublic(true)} className="h-6 w-6 p-0">
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {partnerName}{asset.venueName ? ` · ${asset.venueName}` : ""}{asset.cityName ? ` · ${asset.cityName}` : ""}
                {asset.externalAssetId && <> · ext id <code>{asset.externalAssetId}</code></>}
              </div>
            </>
          )}
        </div>
        <Badge variant="outline" className={`${STATUS_TONE[asset.approvalStatus]} text-[11px] font-semibold`}>{asset.approvalStatus}</Badge>
      </div>

      {(photos.length > 0 || internalPhotos.length > 0) && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {photos.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Public photos</div>
              <div className="flex gap-2 flex-wrap">
                {photos.slice(0, 4).map(u => <img key={u} src={u} alt={asset.name} className="h-20 w-20 object-cover rounded border" />)}
              </div>
            </div>
          )}
          {internalPhotos.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Internal marked photos (admin only)</div>
              <div className="flex gap-2 flex-wrap">
                {internalPhotos.slice(0, 4).map(u => <img key={u} src={u} alt="internal" className="h-20 w-20 object-cover rounded border border-amber-300" />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {(() => {
          const unit = asset.measurementUnit ?? "in";
          const g = unit === "in" ? "″" : ` ${unit}`;
          const areaUnit = unit === "cm" ? "sq m" : "sq ft";
          return <>
            {(asset.widthIn != null && asset.heightIn != null) && (
              <div><strong>Dimensions:</strong> {asset.widthIn}{g} × {asset.heightIn}{g}{asset.depthIn != null ? ` × ${asset.depthIn}${g}` : ""}</div>
            )}
            {asset.areaSqft != null && <div><strong>Area:</strong> {asset.areaSqft} {areaUnit}</div>}
          </>;
        })()}
        {asset.shape && <div><strong>Shape:</strong> {asset.shape}</div>}
        {asset.orientation && <div><strong>Orientation:</strong> {asset.orientation}</div>}
        {asset.surfaceMaterial && <div><strong>Surface:</strong> {asset.surfaceMaterial}</div>}
        {asset.environment && <div><strong>Environment:</strong> {asset.environment}</div>}
        {asset.zoneName && <div><strong>Zone:</strong> {asset.zoneName}</div>}
        {asset.visibilityTier && <div><strong>Tier:</strong> {asset.visibilityTier}</div>}
        {asset.publicStatus && <div><strong>Public status:</strong> {asset.publicStatus}</div>}
        {asset.opsOwner && <div><strong>Ops owner:</strong> {asset.opsOwner}</div>}
        {asset.surveyorName && <div><strong>Surveyor:</strong> {asset.surveyorName}</div>}
        {asset.netsuiteAssetNumber && <div><strong>NS Asset:</strong> <code>{asset.netsuiteAssetNumber}</code></div>}
        {asset.netsuiteVenueNumber && <div><strong>NS Venue:</strong> <code>{asset.netsuiteVenueNumber}</code></div>}
        {(asset.designNeeded || asset.commissionEligible || asset.netsuiteInclude || !asset.publicDeckInclude || !asset.portalVisible) && (
          <div className="sm:col-span-2 flex flex-wrap gap-1 mt-1">
            {asset.designNeeded && <Badge variant="outline" className="text-[10px]">Design needed</Badge>}
            {asset.commissionEligible && <Badge variant="outline" className="text-[10px]">Commission eligible</Badge>}
            {asset.netsuiteInclude && <Badge variant="outline" className="text-[10px]">NetSuite include</Badge>}
            {!asset.publicDeckInclude && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Excluded from deck</Badge>}
            {!asset.portalVisible && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Portal hidden</Badge>}
          </div>
        )}
        {(asset.recommendedApplicationsJson?.length || asset.alternateApplicationsJson?.length) && (
          <div className="sm:col-span-2">
            {asset.recommendedApplicationsJson?.length ? <div><strong>Recommended applications:</strong> {asset.recommendedApplicationsJson.join(", ")}</div> : null}
            {asset.alternateApplicationsJson?.length ? <div><strong>Alternate applications:</strong> {asset.alternateApplicationsJson.join(", ")}</div> : null}
          </div>
        )}
      </div>

      {asset.description && <div className="mt-2 text-sm">{asset.description}</div>}
      {asset.installNotes && <div className="mt-1 text-xs text-amber-800"><strong>Install:</strong> {asset.installNotes}</div>}
      {asset.productionNotes && <div className="mt-1 text-xs text-amber-800"><strong>Production:</strong> {asset.productionNotes}</div>}

      <div className="mt-4 grid sm:grid-cols-2 gap-4 border-t pt-3">
        <div>
          <Label className="text-xs">Material override mode</Label>
          <Select value={overrideMode} onValueChange={(v) => setOverrideMode(v as SurveyAsset["materialOverrideMode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global list (all approved materials)</SelectItem>
              <SelectItem value="per_item">Per-item list (Recommended + Alternate from survey)</SelectItem>
              <SelectItem value="custom">Custom subset (curate below)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {overrideMode === "custom" && (
          <div className="sm:col-span-2">
            <Label className="text-xs">Custom approved materials</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {allMaterials.map(m => (
                <button key={m} type="button" onClick={() => toggleCustom(m)}
                  className={`px-2 py-1 text-xs rounded border ${customMats.includes(m) ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:border-slate-500"}`}>
                  {m}
                </button>
              ))}
              {allMaterials.length === 0 && <span className="text-xs text-muted-foreground">No approved materials configured. Add some in the Approved Materials list.</span>}
            </div>
          </div>
        )}
        {overrideMode === "per_item" && (
          <div className="sm:col-span-2">
            <Label className="text-xs">Per-item materials (from survey)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {allMaterials.map(m => (
                <button key={m} type="button" onClick={() => togglePerItem(m)}
                  className={`px-2 py-1 text-xs rounded border ${perItemMats.includes(m) ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:border-slate-500"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        {asset.approvalStatus === "rejected" && (
          <div className="sm:col-span-2">
            <Label className="text-xs">Rejection reason</Label>
            <Textarea value={rejectedReason} onChange={(e) => setRejectedReason(e.target.value)} rows={2} />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPatch({ approvalStatus: "rejected", rejectedReason: rejectedReason || "Rejected by admin" })} disabled={busy}>
          <X className="h-3.5 w-3.5 mr-1" /> Reject
        </Button>
        <Button size="sm" onClick={() => onPatch({
          approvalStatus: "approved",
          materialOverrideMode: overrideMode,
          customApprovedMaterialsJson: overrideMode === "custom" ? customMats : null,
          approvedMaterialsJson: overrideMode === "per_item" ? perItemMats : asset.approvedMaterialsJson,
          rejectedReason: null,
        })} disabled={busy}>
          <Check className="h-3.5 w-3.5 mr-1" /> Approve
        </Button>
      </div>
    </Card>
  );
}
