import { Link, useLocation } from "wouter";
import { useListPartners } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Users, ExternalLink, Copy, Eye, Boxes, Rocket } from "lucide-react";
import { EmptyStateCard } from "@/components/admin/EmptyStateCard";
import PartnerStatusBadges from "@/components/admin/PartnerStatusBadges";
import { fetchPublicConfig, publicLinkFrom, type PublicConfig } from "@/lib/publicUrl";

function PartnerShareLink({ slug }: { slug: string }) {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const { toast } = useToast();
  useEffect(() => { fetchPublicConfig().then(setCfg).catch(() => {}); }, []);
  const fullUrl = publicLinkFrom(cfg, `/${slug}`);
  const display = cfg?.publicAppUrlConfigured
    ? `${cfg.publicHost}/${slug}`
    : `/${slug}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(fullUrl); toast({ title: "Link copied", description: fullUrl }); }
    catch { toast({ title: "Couldn't copy", variant: "destructive" }); }
  };
  return (
    <div className="flex items-center gap-1">
      <a href={fullUrl} target="_blank" rel="noopener noreferrer"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1 font-mono">
        {display}
        <ExternalLink className="h-3 w-3" />
      </a>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copy} title="Copy share link">
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

const LAUNCH_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  live:          { label: "Live",          variant: "default" },
  preview:       { label: "Preview",       variant: "outline",     className: "border-blue-300 text-blue-700" },
  internal_only: { label: "Internal only", variant: "outline",     className: "border-violet-300 text-violet-700" },
  draft:         { label: "Draft",         variant: "secondary" },
  paused:        { label: "Paused",        variant: "destructive" },
};

export default function PartnersList() {
  const { data: partners, isLoading, refetch } = useListPartners();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [duplicating, setDuplicating] = useState<number | null>(null);

  const handleDuplicate = async (id: number) => {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/partners/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        const newPartner = await res.json();
        toast({ title: "Partner duplicated" });
        refetch();
        navigate(`/admin/partners/${newPartner.id}/edit`);
      } else {
        toast({ title: "Failed to duplicate partner", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to duplicate partner", variant: "destructive" });
    }
    setDuplicating(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
          <p className="text-muted-foreground mt-1">{partners?.length || 0} partner{partners?.length !== 1 ? "s" : ""} configured</p>
        </div>
        <Link href="/admin/partners/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Partner
          </Button>
        </Link>
      </div>

      {partners && partners.length > 0 ? (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold">Company</TableHead>
                <TableHead className="font-semibold">Portal URL</TableHead>
                <TableHead className="font-semibold">Contact</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partner) => (
                <TableRow key={partner.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground uppercase shrink-0">
                        {partner.companyName?.slice(0, 2)}
                      </div>
                      <span className="font-medium">{partner.companyName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PartnerShareLink slug={partner.slug} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{partner.contactName}</p>
                      <p className="text-xs text-muted-foreground">{partner.contactEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const ls = (partner as any).launchStatus || "draft";
                      const cfg = LAUNCH_BADGE[ls] || LAUNCH_BADGE.draft;
                      return (
                        <div className="flex flex-col gap-1">
                          <Badge variant={cfg.variant} className={`text-xs ${cfg.className ?? ""}`}>{cfg.label}</Badge>
                          <PartnerStatusBadges partner={partner as any} />
                          {!(partner as any).archivedAt && partner.isActive && <></>}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/partner/${partner.slug}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" title="Preview portal">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                        title="Duplicate partner"
                        onClick={() => handleDuplicate(partner.id)}
                        disabled={duplicating === partner.id}
                      >
                        {duplicating === partner.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Link href={`/admin/partners/${partner.id}/committed-inventory`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" title="Committed inventory">
                          <Boxes className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Link href={`/admin/partners/${partner.id}/edit`}>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">Edit</Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyStateCard
          icon={Users}
          title="No partners yet"
          description="Create your first partner to start configuring portals, branding, and rollout readiness."
          actions={[
            { label: "Add Partner", href: "/admin/partners/new" },
            { label: "Open Launch Wizard", href: "/admin/launch", variant: "outline" },
          ]}
          tips={[
            "Each partner gets their own portal URL, branding, and product overrides.",
            "New partners start in Draft — promote to Preview or Live from the Rollout tab.",
          ]}
        />
      )}
    </div>
  );
}
