import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, Mail, Palette, X } from "lucide-react";

export const EXCEPTION_STATES = [
  { value: "none", label: "No exception", className: "bg-muted text-muted-foreground" },
  { value: "warning", label: "Warning", className: "bg-amber-100 text-amber-800 border border-amber-200" },
  { value: "exception", label: "Exception flagged", className: "bg-red-100 text-red-800 border border-red-200" },
  { value: "waiting_client", label: "Waiting on client", className: "bg-blue-100 text-blue-800 border border-blue-200" },
  { value: "waiting_internal", label: "Waiting on internal review", className: "bg-violet-100 text-violet-800 border border-violet-200" },
  { value: "resolved", label: "Resolved", className: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
] as const;

export const EXCEPTION_TYPES = [
  { value: "missing_artwork", label: "Missing artwork" },
  { value: "artwork_creation_needed", label: "Artwork creation needed" },
  { value: "wrong_file_or_spec_format", label: "Wrong file or spec format" },
  { value: "missing_dimensions", label: "Missing dimensions" },
  { value: "missing_contact_info", label: "Missing contact info" },
  { value: "unclear_order_notes", label: "Unclear order notes" },
  { value: "custom_review_needed", label: "Custom review needed" },
  { value: "rush_request", label: "Rush request" },
  { value: "incomplete_package_selection", label: "Incomplete package selection" },
  { value: "asset_mismatch", label: "Asset mismatch" },
  { value: "manual_follow_up_required", label: "Manual follow-up required" },
] as const;

export function exceptionStateMeta(state: string | null | undefined) {
  return EXCEPTION_STATES.find(s => s.value === state) || EXCEPTION_STATES[0];
}
export function exceptionTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return EXCEPTION_TYPES.find(t => t.value === type)?.label || type;
}

interface OrderLike {
  id: number;
  orderNumber: string;
  contactEmail: string;
  contactName: string;
  exceptionState: string | null;
  exceptionType: string | null;
  exceptionMessage: string | null;
  exceptionUpdatedAt: string | null;
  artworkNeededFlag: boolean;
  artworkBrief: string | null;
  artworkContactName: string | null;
  artworkContactEmail: string | null;
}

export default function OrderExceptionPanel({
  order,
  partnerDesignContactName,
  partnerDesignContactEmail,
}: {
  order: OrderLike;
  partnerDesignContactName?: string | null;
  partnerDesignContactEmail?: string | null;
}) {
  const qc = useQueryClient();
  const meta = exceptionStateMeta(order.exceptionState);

  const [state, setState] = useState(order.exceptionState || "none");
  const [type, setType] = useState<string>(order.exceptionType || "");
  const [message, setMessage] = useState(order.exceptionMessage || "");

  const [artworkOpen, setArtworkOpen] = useState(order.artworkNeededFlag);
  const [brief, setBrief] = useState(order.artworkBrief || "");
  const [designName, setDesignName] = useState(order.artworkContactName || partnerDesignContactName || "");
  const [designEmail, setDesignEmail] = useState(order.artworkContactEmail || partnerDesignContactEmail || "");

  const exception = useMutation({
    mutationFn: (vars: { state: string; type?: string | null; message?: string | null }) =>
      apiFetch(`/api/orders/${order.id}/exception`, {
        method: "POST",
        body: JSON.stringify({ state: vars.state, type: vars.type || null, message: vars.message || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/orders/${order.id}`] });
      qc.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
  const artwork = useMutation({
    mutationFn: (vars: { flag: boolean; brief?: string; contactName?: string; contactEmail?: string }) =>
      apiFetch(`/api/orders/${order.id}/artwork-needed`, {
        method: "POST",
        body: JSON.stringify({
          flag: vars.flag,
          brief: vars.brief || null,
          contactName: vars.contactName || null,
          contactEmail: vars.contactEmail || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/orders/${order.id}`] });
      qc.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });

  const dirty = state !== (order.exceptionState || "none")
    || type !== (order.exceptionType || "")
    || message !== (order.exceptionMessage || "");

  // Communications drafts — pre-fill mailto: links so admin can fire off the
  // standard requests without leaving the page. These compose against the
  // contacts already present on the order; no new infra needed.
  const draftLinks = useMemo(() => {
    const subj = (s: string) => encodeURIComponent(`[${order.orderNumber}] ${s}`);
    const body = (lines: string[]) => encodeURIComponent(lines.join("\n\n"));
    return {
      missingAsset: order.contactEmail ? `mailto:${order.contactEmail}?subject=${subj("We need a couple of files to finish your order")}&body=${body([
        `Hi ${order.contactName || "there"},`,
        `We're getting ${order.orderNumber} ready and need a couple of items to move forward:`,
        `• [list missing assets here]`,
        `Could you reply with these as soon as you can? Once we have them we'll proceed straight to production.`,
        `Thanks!`,
      ])}` : "",
      artworkNeeded: (designEmail || order.contactEmail) ? `mailto:${designEmail || order.contactEmail}?subject=${subj("Artwork needed")}&body=${body([
        `Hi ${designName || order.contactName || "there"},`,
        `${order.orderNumber} needs artwork created. Brief:`,
        brief || "[describe what needs to be designed]",
        `Please confirm timing and reply with proofs when ready.`,
      ])}` : "",
      clarification: order.contactEmail ? `mailto:${order.contactEmail}?subject=${subj("Quick clarification on your order")}&body=${body([
        `Hi ${order.contactName || "there"},`,
        `Before we kick off ${order.orderNumber} we want to confirm a couple of details:`,
        `• [list questions here]`,
        `Reply when you have a moment and we'll move forward.`,
      ])}` : "",
    };
  }, [order, designEmail, designName, brief]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Exceptions & follow-ups
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Use this when an order isn't ready to fulfill — missing files, unclear specs, rush handling, etc.</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${meta.className}`}>{meta.label}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">State</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXCEPTION_STATES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={type || "__none__"} onValueChange={v => setType(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {EXCEPTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">What's wrong / what you need</Label>
        <Textarea className="mt-1" rows={3} value={message} onChange={e => setMessage(e.target.value)}
          placeholder="e.g. Missing back wall artwork; client said they'd send a vector file by Friday." />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!dirty || exception.isPending}
          onClick={() => exception.mutate({ state, type, message })}>
          {exception.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" disabled={exception.isPending}
          onClick={() => { setState("waiting_client"); exception.mutate({ state: "waiting_client", type, message }); }}>
          <Clock className="h-3.5 w-3.5 mr-1" /> Waiting on client
        </Button>
        <Button size="sm" variant="outline" disabled={exception.isPending}
          onClick={() => { setState("waiting_internal"); exception.mutate({ state: "waiting_internal", type, message }); }}>
          <Clock className="h-3.5 w-3.5 mr-1" /> Waiting internal
        </Button>
        <Button size="sm" variant="outline" disabled={exception.isPending}
          onClick={() => { setState("resolved"); exception.mutate({ state: "resolved", type, message }); }}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark resolved
        </Button>
        {state !== "none" && (
          <Button size="sm" variant="ghost" disabled={exception.isPending}
            onClick={() => { setState("none"); setType(""); setMessage(""); exception.mutate({ state: "none" }); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>
      {order.exceptionUpdatedAt && (
        <div className="text-[11px] text-muted-foreground">Last updated {new Date(order.exceptionUpdatedAt).toLocaleString()}</div>
      )}

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-fuchsia-500" />
            <span className="font-medium text-sm">Artwork needs to be created</span>
            {order.artworkNeededFlag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200 uppercase tracking-wide">on</span>}
          </div>
          <Button size="sm" variant={artworkOpen ? "secondary" : "outline"} onClick={() => setArtworkOpen(o => !o)}>
            {artworkOpen ? "Hide" : (order.artworkNeededFlag ? "Edit" : "Open")}
          </Button>
        </div>
        {artworkOpen && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Brief — what needs to be designed</Label>
              <Textarea className="mt-1" rows={3} value={brief} onChange={e => setBrief(e.target.value)}
                placeholder="e.g. New 8' backdrop with the spring conference logo + sponsor lockup." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Design contact name</Label>
                <Input className="mt-1 h-9" value={designName} onChange={e => setDesignName(e.target.value)}
                  placeholder={partnerDesignContactName || "Designer name"} />
              </div>
              <div>
                <Label className="text-xs">Design contact email</Label>
                <Input className="mt-1 h-9" type="email" value={designEmail} onChange={e => setDesignEmail(e.target.value)}
                  placeholder={partnerDesignContactEmail || "designer@partner.example"} />
              </div>
            </div>
            {partnerDesignContactEmail && !designEmail && (
              <div className="text-[11px] text-muted-foreground">Partner default design contact: <button className="underline" onClick={() => { setDesignName(partnerDesignContactName || ""); setDesignEmail(partnerDesignContactEmail || ""); }}>{partnerDesignContactName || partnerDesignContactEmail}</button></div>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={artwork.isPending}
                onClick={() => artwork.mutate({ flag: true, brief, contactName: designName, contactEmail: designEmail })}>
                {order.artworkNeededFlag ? "Update artwork request" : "Mark artwork needed"}
              </Button>
              {order.artworkNeededFlag && (
                <Button size="sm" variant="ghost" disabled={artwork.isPending}
                  onClick={() => { artwork.mutate({ flag: false }); setArtworkOpen(false); }}>
                  Clear artwork request
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Send a follow-up</div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" disabled={!draftLinks.missingAsset}>
            <a href={draftLinks.missingAsset || "#"}><Mail className="h-3.5 w-3.5 mr-1" /> Request missing assets</a>
          </Button>
          <Button asChild size="sm" variant="outline" disabled={!draftLinks.artworkNeeded}>
            <a href={draftLinks.artworkNeeded || "#"}><Palette className="h-3.5 w-3.5 mr-1" /> Request artwork creation</a>
          </Button>
          <Button asChild size="sm" variant="outline" disabled={!draftLinks.clarification}>
            <a href={draftLinks.clarification || "#"}><Mail className="h-3.5 w-3.5 mr-1" /> Ask for clarification</a>
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">Opens your email client with a pre-filled draft using the order's contact info.</div>
      </div>
    </Card>
  );
}
