import { useParams } from "wouter";
import { 
  useGetRequest, 
  useUpdateRequest, 
  useListRequestNotes, 
  useCreateRequestNote,
  useRegenerateAiSummary,
  useRegeneratePdf,
  getGetRequestQueryKey,
  getListRequestNotesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { FileText, Download, MessageSquare, Clock, User, Phone, Mail, Calendar, MapPin, Loader2, Sparkles, ArrowLeft, Pencil } from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  "New", "Reviewing", "Waiting for files", "Waiting for dimensions", 
  "Quote prep", "Quote sent", "Follow up", "Closed won", "Closed lost"
];

const STATUS_STYLES: Record<string, string> = {
  "New": "bg-blue-50 text-blue-700 border-blue-200",
  "Reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "Quote prep": "bg-violet-50 text-violet-700 border-violet-200",
  "Quote sent": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Closed won": "bg-green-50 text-green-700 border-green-200",
  "Closed lost": "bg-red-50 text-red-700 border-red-200",
};

export default function RequestDetail() {
  const { id } = useParams();
  const requestId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: request, isLoading } = useGetRequest(requestId, {
    query: { queryKey: [`/api/requests/${requestId}`], enabled: !!requestId }
  });

  const { data: notes } = useListRequestNotes(requestId, {
    query: { queryKey: [`/api/requests/${requestId}/notes`], enabled: !!requestId }
  });

  const updateMutation = useUpdateRequest();
  const createNoteMutation = useCreateRequestNote();
  const regenerateAiSummaryMutation = useRegenerateAiSummary();
  const regeneratePdfMutation = useRegeneratePdf();

  const [newNote, setNewNote] = useState("");
  const [internalSummary, setInternalSummary] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!request) return <div className="text-center py-12 text-muted-foreground">Request not found.</div>;

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: requestId, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
        toast({ title: "Status updated" });
      }
    });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNoteMutation.mutate({ id: requestId, data: { noteBody: newNote } }, {
      onSuccess: () => {
        setNewNote("");
        queryClient.invalidateQueries({ queryKey: getListRequestNotesQueryKey(requestId) });
        toast({ title: "Note added" });
      }
    });
  };

  const handleSaveSummary = () => {
    updateMutation.mutate({ id: requestId, data: { internalSummary } }, {
      onSuccess: () => {
        setIsEditingSummary(false);
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
        toast({ title: "Summary updated" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/requests">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Requests
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{request.eventName}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{request.eventName}</h1>
            {request.estimatedScopeLevel && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {request.estimatedScopeLevel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Submitted by {request.contactName} ({request.companyName}) on {format(new Date(request.createdAt), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Select value={request.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => regeneratePdfMutation.mutate({ id: requestId }, {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
                toast({ title: "PDF regenerated" });
              }
            })}
            disabled={regeneratePdfMutation.isPending}
          >
            {regeneratePdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span className="sr-only">Refresh PDF</span>
          </Button>

          {request.pdfSummaryUrl && (
            <Button size="sm" asChild>
              <a href={request.pdfSummaryUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 bg-primary/5 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Summary & Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="space-y-4">
                {request.aiSummary ? (
                  <p className="text-sm leading-relaxed">{request.aiSummary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No AI summary generated yet.</p>
                )}
                
                {request.recommendedUpsellsJson && request.recommendedUpsellsJson.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recommended Upsells</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {request.recommendedUpsellsJson.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5"
                  onClick={() => regenerateAiSummaryMutation.mutate({ id: requestId }, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
                      toast({ title: "AI Summary regenerated" });
                    }
                  })}
                  disabled={regenerateAiSummaryMutation.isPending}
                >
                  {regenerateAiSummaryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Internal Summary
              </CardTitle>
              {!isEditingSummary && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => {
                  setInternalSummary(request.internalSummary || "");
                  setIsEditingSummary(true);
                }}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingSummary ? (
                <div className="space-y-3">
                  <Textarea 
                    value={internalSummary} 
                    onChange={(e) => setInternalSummary(e.target.value)}
                    className="min-h-[150px] text-sm"
                    placeholder="Add internal notes and scoping details..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingSummary(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveSummary} disabled={updateMutation.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="min-h-[80px] bg-muted/30 p-4 rounded-lg border border-dashed text-sm">
                  {request.internalSummary ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{request.internalSummary}</p>
                  ) : (
                    <p className="text-muted-foreground italic">No internal summary yet. Click edit to add one.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Requested Services</CardTitle>
            </CardHeader>
            <CardContent>
              {request.items && request.items.length > 0 ? (
                <div className="space-y-5">
                  {Object.entries(
                    request.items.reduce((acc: any, item) => {
                      if (!acc[item.category]) acc[item.category] = [];
                      acc[item.category].push(item);
                      return acc;
                    }, {})
                  ).map(([category, items]: [string, any]) => (
                    <div key={category}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{category}</h4>
                      <div className="space-y-1.5">
                        {items.map((item: any) => (
                          <div key={item.id} className="flex justify-between items-center bg-muted/40 px-3 py-2.5 rounded-lg text-sm">
                            <span className="font-medium">{item.itemName}</span>
                            {(item.quantityNote || item.sizeNote) && (
                              <span className="text-xs text-muted-foreground">
                                {item.quantityNote && `Qty: ${item.quantityNote}`}{item.quantityNote && item.sizeNote && ' · '}{item.sizeNote && `Size: ${item.sizeNote}`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No specific services selected.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              {request.uploads && request.uploads.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {request.uploads.map((upload) => (
                    <a 
                      key={upload.id} 
                      href={`/api/storage${upload.fileUrl}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/30 transition-all group"
                    >
                      <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium truncate">{upload.fileName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{upload.uploadType.replace('_', ' ')}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No files uploaded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Client Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{request.contactName}</p>
                  <p className="text-muted-foreground text-xs">{request.companyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <a href={`mailto:${request.email}`} className="text-primary hover:underline text-xs break-all">{request.email}</a>
              </div>
              {request.phone && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <a href={`tel:${request.phone}`} className="hover:underline">{request.phone}</a>
                </div>
              )}
              
              <div className="h-px bg-border my-1" />
              
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Event Date</p>
                  <p className="font-medium">{request.eventDate ? format(new Date(request.eventDate), 'PPP') : 'TBD'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Venue</p>
                  <p className="font-medium">{request.venueName || 'TBD'}</p>
                  {request.venueAddress && <p className="text-xs text-muted-foreground mt-0.5">{request.venueAddress}</p>}
                </div>
              </div>
              
              <div className="h-px bg-border my-1" />
              
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-3 w-full">
                  <div>
                    <p className="text-xs text-muted-foreground">Install</p>
                    <p className="font-medium">{request.installDatetime ? format(new Date(request.installDatetime), 'PPP p') : 'TBD'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Removal</p>
                    <p className="font-medium">{request.removalDatetime ? format(new Date(request.removalDatetime), 'PPP p') : 'TBD'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Post-Event</p>
                    <p className="font-medium">{request.postEventDisposition || 'TBD'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4 max-h-[320px] overflow-y-auto pr-1">
                {notes && notes.length > 0 ? (
                  notes.map(note => (
                    <div key={note.id} className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">{format(new Date(note.createdAt), 'MMM d, h:mm a')}</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{note.noteBody}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
                )}
              </div>
              <div className="space-y-2 pt-3 border-t">
                <Textarea 
                  placeholder="Add a note..." 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="min-h-[72px] text-sm resize-none"
                />
                <Button size="sm" className="w-full" onClick={handleAddNote} disabled={!newNote.trim() || createNoteMutation.isPending}>
                  Add Note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
