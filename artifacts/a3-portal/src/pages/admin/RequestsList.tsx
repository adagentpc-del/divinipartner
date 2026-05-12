import { Link } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Loader2, FileText, ArrowUpRight, Search, ShoppingBag, MapPin, Palette, MessageSquare, Filter, Flag } from "lucide-react";
import type {
  Request as IntakeRequest,
  PortalRequest,
  ProductRequest,
  BrandingLocationRequest,
} from "@workspace/db/schema";
import type { SerializedRow } from "@/lib/schemaRow";

// Each tab's row shape is sourced from the underlying schema (with `Date`
// columns serialized to ISO strings on the wire). Tabs are unified via a
// discriminated union on `type`, plus per-tab joined fields the server
// returns alongside the row (`partnerName`, `productName`, `locationName`).
type IntakeRow = SerializedRow<
  Pick<
    IntakeRequest,
    | "id"
    | "partnerId"
    | "contactName"
    | "companyName"
    | "email"
    | "eventName"
    | "eventDate"
    | "status"
    | "createdAt"
  >
> & { type: "intake"; partnerName?: string };

type PortalRow = SerializedRow<
  Pick<
    PortalRequest,
    | "id"
    | "partnerId"
    | "mainContactName"
    | "companyName"
    | "email"
    | "eventName"
    | "eventDate"
    | "neededByDate"
    | "status"
    | "requestType"
    | "quoteStatus"
    | "priority"
    | "createdAt"
  >
> & { type: "portal"; partnerName?: string };

type ProductRow = SerializedRow<
  Pick<
    ProductRequest,
    | "id"
    | "partnerId"
    | "mainContactName"
    | "companyName"
    | "email"
    | "eventName"
    | "eventDate"
    | "neededByDate"
    | "status"
    | "quoteStatus"
    | "priority"
    | "createdAt"
  >
> & { type: "product"; partnerName?: string; productName?: string | null };

type BrandingRow = SerializedRow<
  Pick<
    BrandingLocationRequest,
    | "id"
    | "partnerId"
    | "mainContactName"
    | "companyName"
    | "email"
    | "eventName"
    | "eventDate"
    | "neededByDate"
    | "status"
    | "quoteStatus"
    | "priority"
    | "createdAt"
  >
> & { type: "branding"; partnerName?: string; locationName?: string | null };

type UnifiedRequest = IntakeRow | PortalRow | ProductRow | BrandingRow;

function rowContactName(r: UnifiedRequest): string {
  return r.type === "intake" ? r.contactName : r.mainContactName;
}
function rowNeededBy(r: UnifiedRequest): string | null {
  return r.type === "intake" ? null : (r.neededByDate ?? null);
}
function rowQuoteStatus(r: UnifiedRequest): string | null {
  return r.type === "intake" ? null : r.quoteStatus;
}
function rowPriority(r: UnifiedRequest): string | null {
  return r.type === "intake" ? null : r.priority;
}
function rowSubject(r: UnifiedRequest): string | null {
  if (r.eventName) return r.eventName;
  if (r.type === "portal") return r.requestType ?? null;
  return null;
}
function rowProductName(r: UnifiedRequest): string | null {
  return r.type === "product" ? (r.productName ?? null) : null;
}
function rowLocationName(r: UnifiedRequest): string | null {
  return r.type === "branding" ? (r.locationName ?? null) : null;
}

const STATUS_STYLES: Record<string, string> = {
  "new": "bg-blue-50 text-blue-700 border-blue-200",
  "New": "bg-blue-50 text-blue-700 border-blue-200",
  "reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "Reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "quoted": "bg-violet-50 text-violet-700 border-violet-200",
  "Quote prep": "bg-violet-50 text-violet-700 border-violet-200",
  "Quote sent": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "awaiting artwork": "bg-orange-50 text-orange-700 border-orange-200",
  "Waiting for files": "bg-orange-50 text-orange-700 border-orange-200",
  "Waiting for dimensions": "bg-orange-50 text-orange-700 border-orange-200",
  "in production": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "completed": "bg-green-50 text-green-700 border-green-200",
  "Closed won": "bg-green-50 text-green-700 border-green-200",
  "archived": "bg-gray-50 text-gray-600 border-gray-200",
  "Closed lost": "bg-red-50 text-red-700 border-red-200",
  "Follow up": "bg-sky-50 text-sky-700 border-sky-200",
};

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  intake: { label: "Intake", icon: FileText, color: "text-slate-600 bg-slate-50 border-slate-200" },
  portal: { label: "Portal", icon: MessageSquare, color: "text-purple-600 bg-purple-50 border-purple-200" },
  product: { label: "Product", icon: ShoppingBag, color: "text-amber-600 bg-amber-50 border-amber-200" },
  branding: { label: "Branding", icon: MapPin, color: "text-teal-600 bg-teal-50 border-teal-200" },
};

export default function RequestsList() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<UnifiedRequest[]>([]);
  const [partners, setPartners] = useState<{ id: number; companyName: string }[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [filterPartner, setFilterPartner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/partners").then(r => r.json()),
      fetch("/api/requests").then(r => r.json()),
      fetch("/api/portal-requests").then(r => r.json()),
      fetch("/api/product-requests").then(r => r.json()),
      fetch("/api/branding-requests").then(r => r.json()),
    ]).then(([partnerData, intakeData, portalData, productData, brandingData]) => {
      const partnerList = partnerData.partners || partnerData || [];
      setPartners(partnerList);
      const partnerMap = new Map<number, string>(partnerList.map((p: any) => [p.id, p.companyName]));

      const unified: UnifiedRequest[] = [];

      const intakeRequests = intakeData.requests || intakeData || [];
      for (const r of intakeRequests as Array<Omit<IntakeRow, "type"> & { partnerName?: string }>) {
        unified.push({
          ...r,
          type: "intake",
          partnerName: r.partnerName || partnerMap.get(r.partnerId) || "Unknown",
        });
      }

      for (const r of (portalData || []) as Array<Omit<PortalRow, "type">>) {
        unified.push({
          ...r,
          type: "portal",
          partnerName: partnerMap.get(r.partnerId) || "Unknown",
        });
      }

      for (const r of (productData || []) as Array<Omit<ProductRow, "type">>) {
        unified.push({
          ...r,
          type: "product",
          partnerName: partnerMap.get(r.partnerId) || "Unknown",
        });
      }

      for (const r of (brandingData || []) as Array<Omit<BrandingRow, "type">>) {
        unified.push({
          ...r,
          type: "branding",
          partnerName: partnerMap.get(r.partnerId) || "Unknown",
        });
      }

      unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(unified);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const allStatuses = useMemo(() => {
    const s = new Set(requests.map(r => r.status));
    return Array.from(s).sort();
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (activeTab !== "all" && r.type !== activeTab) return false;
      if (filterPartner && r.partnerId !== parseInt(filterPartner)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = [rowContactName(r), r.companyName, r.eventName, r.email, r.partnerName]
          .filter(Boolean).some(v => v!.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [requests, activeTab, filterPartner, filterStatus, searchTerm]);

  const counts = useMemo(() => {
    const c = { all: requests.length, intake: 0, portal: 0, product: 0, branding: 0 };
    for (const r of requests) c[r.type]++;
    return c;
  }, [requests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getDetailPath = (r: UnifiedRequest) => {
    if (r.type === "intake") return `/admin/requests/${r.id}`;
    return `/admin/portal-requests/${r.type}/${r.id}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Requests</h1>
        <p className="text-muted-foreground mt-1">{requests.length} total across all types</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="intake">Intake ({counts.intake})</TabsTrigger>
          <TabsTrigger value="portal">Portal ({counts.portal})</TabsTrigger>
          <TabsTrigger value="product">Product ({counts.product})</TabsTrigger>
          <TabsTrigger value="branding">Branding ({counts.branding})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search contact, company, event..."
            className="pl-9"
          />
        </div>
        <Select value={filterPartner} onValueChange={v => setFilterPartner(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Partners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {allStatuses.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterPartner || filterStatus || searchTerm) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterPartner(""); setFilterStatus(""); setSearchTerm(""); }}>
            Clear filters
          </Button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold w-[80px]">Type</TableHead>
                <TableHead className="font-semibold">Contact</TableHead>
                <TableHead className="font-semibold">Partner</TableHead>
                <TableHead className="font-semibold">Event / Subject</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="text-right font-semibold w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const typeInfo = TYPE_LABELS[r.type];
                const TypeIcon = typeInfo.icon;
                return (
                  <TableRow key={`${r.type}-${r.id}`} className="group">
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${typeInfo.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {typeInfo.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link href={getDetailPath(r)}>
                        <span className="font-medium text-primary hover:underline cursor-pointer text-sm">{rowContactName(r)}</span>
                      </Link>
                      {r.companyName && <p className="text-xs text-muted-foreground">{r.companyName}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.partnerName}</TableCell>
                    <TableCell>
                      <span className="text-sm">{rowSubject(r) || "—"}</span>
                      {rowProductName(r) && <p className="text-[11px] text-muted-foreground">{rowProductName(r)}</p>}
                      {rowLocationName(r) && <p className="text-[11px] text-muted-foreground">{rowLocationName(r)}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border w-fit ${STATUS_STYLES[r.status] || "bg-muted text-muted-foreground border-border"}`}>
                          {r.status}
                        </span>
                        {rowQuoteStatus(r) && rowQuoteStatus(r) !== "needs_review" && (
                          <span className="text-[10px] text-muted-foreground">{rowQuoteStatus(r)!.replace(/_/g, " ")}</span>
                        )}
                        {rowPriority(r) && rowPriority(r) !== "normal" && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${rowPriority(r) === "urgent" ? "text-red-600" : "text-amber-600"}`}>
                            <Flag className="h-2.5 w-2.5" /> {rowPriority(r)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      <span className="text-muted-foreground">{format(new Date(r.createdAt), "MMM d, yyyy")}</span>
                      {rowNeededBy(r) && (
                        <p className="text-amber-600 font-medium mt-0.5">Due: {rowNeededBy(r)}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={getDetailPath(r)}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-card">
          <Filter className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">No requests match your filters</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  );
}
