import { useParams } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, Loader2, User, Mail, Phone, Calendar, MapPin, Clock,
  FileText, Globe, MessageSquare, ShoppingBag, Palette, Hammer, Sparkles,
  Download, ExternalLink, Pencil, Save, DollarSign, Truck, Flag,
  ClipboardCopy, ChevronDown, ChevronRight, AlertCircle
} from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  "new", "reviewing", "quoted", "awaiting artwork", "in production", "completed", "archived"
];

const QUOTE_STATUS_OPTIONS = [
  "needs_review", "quoting", "quote_sent", "awaiting_approval", "approved", "declined"
];

const PRIORITY_OPTIONS = ["normal", "high", "urgent"];

const STATUS_STYLES: Record<string, string> = {
  "new": "bg-blue-50 text-blue-700 border-blue-200",
  "reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "quoted": "bg-violet-50 text-violet-700 border-violet-200",
  "awaiting artwork": "bg-orange-50 text-orange-700 border-orange-200",
  "in production": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "completed": "bg-green-50 text-green-700 border-green-200",
  "archived": "bg-gray-50 text-gray-600 border-gray-200",
};

const QUOTE_STATUS_STYLES: Record<string, string> = {
  "needs_review": "bg-slate-50 text-slate-700 border-slate-200",
  "quoting": "bg-amber-50 text-amber-700 border-amber-200",
  "quote_sent": "bg-violet-50 text-violet-700 border-violet-200",
  "awaiting_approval": "bg-orange-50 text-orange-700 border-orange-200",
  "approved": "bg-green-50 text-green-700 border-green-200",
  "declined": "bg-red-50 text-red-700 border-red-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  "normal": "bg-slate-50 text-slate-600",
  "high": "bg-amber-50 text-amber-700",
  "urgent": "bg-red-50 text-red-700",
};

const TYPE_ICONS: Record<string, any> = {
  portal: MessageSquare,
  product: ShoppingBag,
  branding: MapPin,
  event_materials: Palette,
  immersive: Sparkles,
  fabrication: Hammer,
  open_request: MessageSquare,
};

export default function PortalRequestDetail() {
  const params = useParams();
  const requestType = params.type as string;
  const requestId = parseInt(params.id || "0");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  const [quoteOpen, setQuoteOpen] = useState(true);
  const [productionOpen, setProductionOpen] = useState(false);

  const [quoteFields, setQuoteFields] = useState({
    estimatedPrice: "",
    costNotes: "",
    quoteSummary: "",
    turnaroundNotes: "",
    quoteReady: false,
    quoteStatus: "needs_review",
  });

  const [prodFields, setProdFields] = useState({
    productionOwner: "",
    installRequired: "",
    productionNotes: "",
    fulfillmentNotes: "",
    vendorNotes: "",
    productionDeadline: "",
    priority: "normal",
    recurringEvent: false,
  });

  const endpointMap: Record<string, string> = {
    portal: "portal-requests",
    product: "product-requests",
    branding: "branding-requests",
  };

  useEffect(() => {
    const endpoint = endpointMap[requestType];
    if (!endpoint) { setLoading(false); return; }

    fetch(`/api/${endpoint}/${requestId}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => {
        setRequest(data);
        setAdminNotes(data.adminNotes || "");
        setQuoteFields({
          estimatedPrice: data.estimatedPrice || "",
          costNotes: data.costNotes || "",
          quoteSummary: data.quoteSummary || "",
          turnaroundNotes: data.turnaroundNotes || "",
          quoteReady: data.quoteReady || false,
          quoteStatus: data.quoteStatus || "needs_review",
        });
        setProdFields({
          productionOwner: data.productionOwner || "",
          installRequired: data.installRequired || "",
          productionNotes: data.productionNotes || "",
          fulfillmentNotes: data.fulfillmentNotes || "",
          vendorNotes: data.vendorNotes || "",
          productionDeadline: data.productionDeadline || "",
          priority: data.priority || "normal",
          recurringEvent: data.recurringEvent || false,
        });
        if (data.partnerId) {
          fetch(`/api/partners/${data.partnerId}`)
            .then(r => r.ok ? r.json() : null)
            .then(p => { if (p) setPartner(p); })
            .catch(() => {});
        }
        setLoading(false);
      })
      .catch(() => { setRequest(null); setLoading(false); });
  }, [requestType, requestId]);

  const handleStatusChange = async (newStatus: string) => {
    const endpoint = endpointMap[requestType];
    const res = await fetch(`/api/${endpoint}/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequest((prev: any) => ({ ...prev, ...updated }));
      toast({ title: "Status updated" });
    } else {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    const endpoint = endpointMap[requestType];
    const res = await fetch(`/api/${endpoint}/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNotes }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequest((prev: any) => ({ ...prev, ...updated }));
      setEditingNotes(false);
      toast({ title: "Notes saved" });
    } else {
      toast({ title: "Failed to save notes", variant: "destructive" });
    }
    setSaving(false);
  };

  const patchFields = useCallback(async (fields: Record<string, any>, label: string) => {
    setSaving(true);
    const endpoint = endpointMap[requestType];
    const res = await fetch(`/api/${endpoint}/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequest((prev: any) => ({ ...prev, ...updated }));
      toast({ title: `${label} saved` });
    } else {
      toast({ title: `Failed to save ${label.toLowerCase()}`, variant: "destructive" });
    }
    setSaving(false);
  }, [requestType, requestId]);

  const handleSaveQuote = () => {
    const payload = {
      ...quoteFields,
      estimatedPrice: quoteFields.estimatedPrice || null,
    };
    patchFields(payload, "Quote details");
  };
  const handleSaveProduction = () => {
    const payload = {
      ...prodFields,
      productionOwner: prodFields.productionOwner || null,
      productionNotes: prodFields.productionNotes || null,
      fulfillmentNotes: prodFields.fulfillmentNotes || null,
      vendorNotes: prodFields.vendorNotes || null,
      productionDeadline: prodFields.productionDeadline || null,
      installRequired: prodFields.installRequired || null,
    };
    patchFields(payload, "Production details");
  };

  const generateQuoteSummary = useCallback(() => {
    const r = request;
    if (!r) return;
    const lines: string[] = [];
    lines.push("=== QUOTE SUMMARY ===");
    lines.push("");
    lines.push(`Client: ${r.mainContactName || r.contactName || "—"}`);
    if (r.companyName) lines.push(`Company: ${r.companyName}`);
    if (partner) lines.push(`Partner: ${partner.companyName}`);
    lines.push(`Request Type: ${requestType === "product" ? "Product Order" : requestType === "branding" ? "Venue Branding" : (r.requestType || "Portal Request").replace(/_/g, " ")}`);
    if (r.eventName) lines.push(`Event: ${r.eventName}`);
    if (r.eventDate) lines.push(`Event Date: ${r.eventDate}`);
    if (r.neededByDate) lines.push(`Needed By: ${r.neededByDate}`);
    lines.push("");
    if (requestType === "product" && r.product) {
      lines.push("--- Product ---");
      lines.push(`Product: ${r.product.name}`);
      if (r.product.category) lines.push(`Category: ${r.product.category}`);
      if (r.quantity) lines.push(`Quantity: ${r.quantity}`);
      if (r.selectedSize) lines.push(`Size: ${r.selectedSize}`);
      if (r.selectedOptionsJson && Object.keys(r.selectedOptionsJson).length > 0) {
        lines.push(`Options: ${Object.entries(r.selectedOptionsJson).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      }
      lines.push("");
    }
    if (requestType === "branding" && r.location) {
      lines.push("--- Branding Location ---");
      lines.push(`Location: ${r.location.name}`);
      if (r.location.category) lines.push(`Category: ${r.location.category}`);
      if (r.location.sizeWidth && r.location.sizeHeight) {
        lines.push(`Dimensions: ${r.location.sizeWidth} x ${r.location.sizeHeight} ${r.location.sizeUnit || "inches"}`);
      }
      lines.push("");
    }
    if (requestType === "portal" && r.requestCategory) {
      lines.push(`Section: ${(r.requestCategory || "").replace(/_/g, " ")}`);
      lines.push("");
    }
    lines.push("--- Scope ---");
    if (r.description || r.notes) lines.push(`Description: ${r.description || r.notes}`);
    lines.push(`Design Help: ${r.designHelpNeeded ? "Yes" : "No"}`);
    if (r.artworkStatus) lines.push(`Artwork: ${r.artworkStatus.replace(/_/g, " ")}`);
    if (r.budgetRange) lines.push(`Client Budget: ${r.budgetRange}`);
    lines.push("");
    lines.push("--- Pricing ---");
    lines.push(`Estimated Total: ${quoteFields.estimatedPrice ? `$${quoteFields.estimatedPrice}` : "TBD"}`);
    if (quoteFields.costNotes) lines.push(`Cost Notes: ${quoteFields.costNotes}`);
    if (quoteFields.turnaroundNotes) lines.push(`Turnaround: ${quoteFields.turnaroundNotes}`);
    lines.push("");
    lines.push(`Quote Status: ${(quoteFields.quoteStatus || "needs_review").replace(/_/g, " ")}`);
    lines.push(`Quote Ready: ${quoteFields.quoteReady ? "Yes" : "No"}`);
    lines.push("");
    lines.push("--- Next Steps ---");
    if (quoteFields.quoteStatus === "needs_review") lines.push("• Review request details and prepare pricing");
    if (quoteFields.quoteStatus === "quoting") lines.push("• Finalize pricing and send quote to client");
    if (quoteFields.quoteStatus === "quote_sent") lines.push("• Awaiting client response to quote");
    if (quoteFields.quoteStatus === "approved") lines.push("• Begin production planning");
    lines.push("");
    lines.push(`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`);

    const summary = lines.join("\n");
    setQuoteFields(prev => ({ ...prev, quoteSummary: summary }));
    toast({ title: "Quote summary generated" });
  }, [request, partner, requestType, quoteFields]);

  const copyQuoteSummary = useCallback(() => {
    if (quoteFields.quoteSummary) {
      navigator.clipboard.writeText(quoteFields.quoteSummary);
      toast({ title: "Copied to clipboard" });
    }
  }, [quoteFields.quoteSummary]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!request) return <div className="text-center py-12 text-muted-foreground">Request not found.</div>;

  const TypeIcon = TYPE_ICONS[requestType] || TYPE_ICONS[request.requestType] || FileText;
  const typeLabel = requestType === "portal"
    ? (request.requestType || "Portal Request").replace(/_/g, " ")
    : requestType === "product" ? "Product Order" : "Venue Branding";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/requests">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> All Requests
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium capitalize">{typeLabel}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <TypeIcon className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight capitalize">{typeLabel}</h1>
            <Badge variant="secondary" className="text-xs capitalize">{requestType}</Badge>
            {request.product && (
              <Badge variant="outline" className="text-xs gap-1">
                <ShoppingBag className="h-3 w-3" /> {request.product.name}
              </Badge>
            )}
            {request.location && (
              <Badge variant="outline" className="text-xs gap-1">
                <MapPin className="h-3 w-3" /> {request.location.name}
              </Badge>
            )}
            {request.priority && request.priority !== "normal" && (
              <Badge className={`text-xs gap-1 ${PRIORITY_STYLES[request.priority] || ""}`}>
                <Flag className="h-3 w-3" /> {request.priority}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            From <span className="font-medium text-foreground">{request.mainContactName || request.contactName}</span>
            {partner && <span> · <span className="font-medium text-foreground">{partner.companyName}</span></span>}
            {" · "}
            {format(new Date(request.createdAt), "MMMM d, yyyy 'at' h:mm a")}
          </p>
          {(request.eventDate || request.neededByDate) && (
            <div className="flex gap-4 mt-1.5 text-xs">
              {request.eventDate && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Event: <span className="font-medium text-foreground">{request.eventDate}</span>
                </span>
              )}
              {request.neededByDate && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="h-3 w-3" /> Due: <span className="font-medium">{request.neededByDate}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={request.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{request.mainContactName || request.contactName}</p>
                </div>
                {(request.companyName) && (
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="font-medium">{request.companyName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <a href={`mailto:${request.email}`} className="font-medium text-primary hover:underline">{request.email}</a>
                </div>
                {request.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{request.phone}</p>
                  </div>
                )}
                {request.websiteUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a href={request.websiteUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1">
                      {request.websiteUrl} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {request.eventPageUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground">Event Page</p>
                    <a href={request.eventPageUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1">
                      {request.eventPageUrl} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Event Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {request.eventName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Event Name</p>
                    <p className="font-medium">{request.eventName}</p>
                  </div>
                )}
                {request.eventDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Event Date</p>
                    <p className="font-medium">{request.eventDate}</p>
                  </div>
                )}
                {request.neededByDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Needed By</p>
                    <p className="font-medium">{request.neededByDate}</p>
                  </div>
                )}
                {request.venueName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Venue</p>
                    <p className="font-medium">{request.venueName}</p>
                  </div>
                )}
                {request.venueLocation && (
                  <div>
                    <p className="text-xs text-muted-foreground">Venue Location</p>
                    <p className="font-medium">{request.venueLocation}</p>
                  </div>
                )}
                {request.attendeeCount && (
                  <div>
                    <p className="text-xs text-muted-foreground">Attendees</p>
                    <p className="font-medium">{request.attendeeCount}</p>
                  </div>
                )}
                {request.budgetRange && (
                  <div>
                    <p className="text-xs text-muted-foreground">Budget Range</p>
                    <p className="font-medium">{request.budgetRange}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {requestType === "product" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> Product Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {request.product && (
                  <div className="flex items-start gap-4 mb-4 pb-4 border-b">
                    {request.product.imageUrl && (
                      <img src={request.product.imageUrl} alt={request.product.name} className="w-20 h-14 object-cover rounded border" />
                    )}
                    <div>
                      <p className="font-semibold">{request.product.name}</p>
                      <p className="text-xs text-muted-foreground">{request.product.category}</p>
                    </div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  {request.productId && !request.product && (
                    <div>
                      <p className="text-xs text-muted-foreground">Product ID</p>
                      <p className="font-medium">#{request.productId}</p>
                    </div>
                  )}
                  {request.quantity && (
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="font-medium">{request.quantity}</p>
                    </div>
                  )}
                  {request.selectedSize && (
                    <div>
                      <p className="text-xs text-muted-foreground">Selected Size</p>
                      <p className="font-medium">{request.selectedSize}</p>
                    </div>
                  )}
                  {request.selectedOptionsJson && Object.keys(request.selectedOptionsJson).length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Selected Options</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(request.selectedOptionsJson).map(([key, val]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {val as string}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {requestType === "branding" && request.location && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Branding Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  {request.location.previewImageUrl && (
                    <img src={request.location.previewImageUrl} alt={request.location.name} className="w-24 h-16 object-cover rounded border" />
                  )}
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{request.location.name}</p>
                    <p className="text-xs text-muted-foreground">{request.location.category}</p>
                    {request.location.sizeWidth && request.location.sizeHeight && (
                      <p className="text-xs text-muted-foreground">
                        {request.location.sizeWidth} x {request.location.sizeHeight} {request.location.sizeUnit || "inches"}
                      </p>
                    )}
                    {request.location.description && (
                      <p className="text-xs text-muted-foreground mt-1">{request.location.description}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {requestType === "portal" && request.requestCategory && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TypeIcon className="h-4 w-4" /> Request Category
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">{(request.requestType || "").replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="font-medium capitalize">{(request.requestCategory || "").replace(/_/g, " ")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(request.description || request.notes) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Description / Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{request.description || request.notes}</p>
              </CardContent>
            </Card>
          )}

          {request.designHelpNeeded && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4 text-amber-600" /> Design Assistance Requested
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {request.artworkStatus && (
                  <div>
                    <p className="text-xs text-muted-foreground">Artwork Status</p>
                    <p className="font-medium capitalize">{request.artworkStatus.replace(/_/g, " ")}</p>
                  </div>
                )}
                {request.designBrief && (
                  <div>
                    <p className="text-xs text-muted-foreground">Design Brief</p>
                    <p className="whitespace-pre-wrap">{request.designBrief}</p>
                  </div>
                )}
                {request.styleNotes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Style Notes</p>
                    <p className="whitespace-pre-wrap">{request.styleNotes}</p>
                  </div>
                )}
                {request.proofDeadline && (
                  <div>
                    <p className="text-xs text-muted-foreground">Proof Deadline</p>
                    <p className="font-medium">{request.proofDeadline}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {request.files && request.files.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Uploaded Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-3">
                  {request.files.map((file: any) => (
                    <a
                      key={file.id}
                      href={file.fileUrl.startsWith("http") ? file.fileUrl : `/api/storage/objects/${file.fileUrl.replace(/^\/+/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-all group"
                    >
                      <div className="h-9 w-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="overflow-hidden flex-1">
                        <p className="text-sm font-medium truncate">{file.fileName}</p>
                        {file.label && <p className="text-xs text-muted-foreground">{file.label}</p>}
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-emerald-200">
            <CardHeader className="pb-3 cursor-pointer" onClick={() => setQuoteOpen(!quoteOpen)}>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" /> Quote & Pricing
                  {request.quoteReady && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Ready</Badge>}
                </span>
                {quoteOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {quoteOpen && (
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quote Status</Label>
                    <Select value={quoteFields.quoteStatus} onValueChange={v => setQuoteFields(p => ({ ...p, quoteStatus: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTE_STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estimated Price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={quoteFields.estimatedPrice}
                      onChange={e => setQuoteFields(p => ({ ...p, estimatedPrice: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cost Notes (internal)</Label>
                  <Textarea
                    value={quoteFields.costNotes}
                    onChange={e => setQuoteFields(p => ({ ...p, costNotes: e.target.value }))}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Internal cost breakdown, vendor pricing..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Turnaround Notes</Label>
                  <Textarea
                    value={quoteFields.turnaroundNotes}
                    onChange={e => setQuoteFields(p => ({ ...p, turnaroundNotes: e.target.value }))}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Production timeline, lead times..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={quoteFields.quoteReady}
                    onCheckedChange={v => setQuoteFields(p => ({ ...p, quoteReady: v }))}
                  />
                  <Label className="text-sm">Quote Ready to Send</Label>
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Quote Summary</Label>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={generateQuoteSummary}>
                        <Sparkles className="h-3 w-3" /> Generate
                      </Button>
                      {quoteFields.quoteSummary && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyQuoteSummary}>
                          <ClipboardCopy className="h-3 w-3" /> Copy
                        </Button>
                      )}
                    </div>
                  </div>
                  <Textarea
                    value={quoteFields.quoteSummary}
                    onChange={e => setQuoteFields(p => ({ ...p, quoteSummary: e.target.value }))}
                    className="min-h-[120px] text-sm resize-none font-mono text-xs"
                    placeholder="Click Generate to create a structured quote summary, or type manually..."
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSaveQuote} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Quote Details
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-indigo-200">
            <CardHeader className="pb-3 cursor-pointer" onClick={() => setProductionOpen(!productionOpen)}>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-indigo-600" /> Production & Handoff
                </span>
                {productionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {productionOpen && (
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Production Owner</Label>
                    <Input
                      value={prodFields.productionOwner}
                      onChange={e => setProdFields(p => ({ ...p, productionOwner: e.target.value }))}
                      placeholder="Assigned team member"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select value={prodFields.priority} onValueChange={v => setProdFields(p => ({ ...p, priority: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map(p => (
                          <SelectItem key={p} value={p}>
                            <span className="capitalize">{p}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Install Required</Label>
                    <Select value={prodFields.installRequired || "tbd"} onValueChange={v => setProdFields(p => ({ ...p, installRequired: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tbd">TBD</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Production Deadline</Label>
                    <Input
                      type="date"
                      value={prodFields.productionDeadline}
                      onChange={e => setProdFields(p => ({ ...p, productionDeadline: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Production Notes</Label>
                  <Textarea
                    value={prodFields.productionNotes}
                    onChange={e => setProdFields(p => ({ ...p, productionNotes: e.target.value }))}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Internal production instructions..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fulfillment Notes</Label>
                  <Textarea
                    value={prodFields.fulfillmentNotes}
                    onChange={e => setProdFields(p => ({ ...p, fulfillmentNotes: e.target.value }))}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Shipping, delivery, on-site logistics..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Vendor Notes</Label>
                  <Textarea
                    value={prodFields.vendorNotes}
                    onChange={e => setProdFields(p => ({ ...p, vendorNotes: e.target.value }))}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Third-party vendor details..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={prodFields.recurringEvent}
                    onCheckedChange={v => setProdFields(p => ({ ...p, recurringEvent: v }))}
                  />
                  <Label className="text-sm">Recurring Event</Label>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSaveProduction} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Production Details
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border ${STATUS_STYLES[request.status] || "bg-muted"}`}>
                  {request.status}
                </span>
                {request.quoteStatus && request.quoteStatus !== "needs_review" && (
                  <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-medium border ${QUOTE_STATUS_STYLES[request.quoteStatus] || "bg-muted"}`}>
                    {(request.quoteStatus || "").replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {request.estimatedPrice && (
                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-semibold text-emerald-700">${parseFloat(request.estimatedPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {request.productionOwner && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Owner: <span className="font-medium text-foreground">{request.productionOwner}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Created: {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
                </div>
                {request.updatedAt && request.updatedAt !== request.createdAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Updated: {format(new Date(request.updatedAt), "MMM d, yyyy h:mm a")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {partner && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Source Partner</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="flex items-center gap-3">
                  {partner.logoUrl ? (
                    <img src={partner.logoUrl} alt={partner.companyName} className="h-8 w-12 object-contain" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {partner.companyName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{partner.companyName}</p>
                    <Link href={`/admin/partners/${partner.id}/edit`}>
                      <span className="text-xs text-primary hover:underline cursor-pointer">View Partner</span>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Admin Notes
              </CardTitle>
              {!editingNotes && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7" onClick={() => setEditingNotes(true)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    className="min-h-[100px] text-sm resize-none"
                    placeholder="Internal notes about this request..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditingNotes(false); setAdminNotes(request.adminNotes || ""); }}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveNotes} disabled={saving} className="gap-1">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="min-h-[60px] bg-muted/30 p-3 rounded-lg border border-dashed text-sm">
                  {request.adminNotes ? (
                    <p className="whitespace-pre-wrap">{request.adminNotes}</p>
                  ) : (
                    <p className="text-muted-foreground italic">No admin notes yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
