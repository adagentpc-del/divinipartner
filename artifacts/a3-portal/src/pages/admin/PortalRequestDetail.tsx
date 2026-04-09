import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, Loader2, User, Mail, Phone, Calendar, MapPin, Clock,
  FileText, Globe, MessageSquare, ShoppingBag, Palette, Hammer, Sparkles,
  Download, ExternalLink, Pencil, Save
} from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  "new", "reviewing", "quoted", "awaiting artwork", "in production", "completed", "archived"
];

const STATUS_STYLES: Record<string, string> = {
  "new": "bg-blue-50 text-blue-700 border-blue-200",
  "reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "quoted": "bg-violet-50 text-violet-700 border-violet-200",
  "awaiting artwork": "bg-orange-50 text-orange-700 border-orange-200",
  "in production": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "completed": "bg-green-50 text-green-700 border-green-200",
  "archived": "bg-gray-50 text-gray-600 border-gray-200",
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border ${STATUS_STYLES[request.status] || "bg-muted"}`}>
                  {request.status}
                </span>
              </div>
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
