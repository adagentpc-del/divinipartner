import { useParams, Link } from "wouter";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { FileText, Download, MessageSquare, Clock, Building2, User, Phone, Mail, Calendar, MapPin, Loader2, Sparkles } from "lucide-react";

const STATUS_OPTIONS = [
  "New", "Reviewing", "Waiting for files", "Waiting for dimensions", 
  "Quote prep", "Quote sent", "Follow up", "Closed won", "Closed lost"
];

export default function RequestDetail() {
  const { id } = useParams();
  const requestId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: request, isLoading } = useGetRequest(requestId, {
    query: { enabled: !!requestId }
  });

  const { data: notes } = useListRequestNotes(requestId, {
    query: { enabled: !!requestId }
  });

  const updateMutation = useUpdateRequest();
  const createNoteMutation = useCreateRequestNote();
  const regenerateAiSummaryMutation = useRegenerateAiSummary();
  const regeneratePdfMutation = useRegeneratePdf();

  const [newNote, setNewNote] = useState("");
  const [internalSummary, setInternalSummary] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!request) return <div>Request not found.</div>;

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{request.eventName}</h1>
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {request.estimatedScopeLevel || "Unscoped"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Submitted by {request.contactName} ({request.companyName}) on {format(new Date(request.createdAt), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={() => regeneratePdfMutation.mutate({ id: requestId }, {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
                toast({ title: "PDF regenerated" });
              }
            })}
            disabled={regeneratePdfMutation.isPending}
          >
            {regeneratePdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            Refresh PDF
          </Button>

          {request.pdfSummaryUrl && (
            <Button asChild>
              <a href={request.pdfSummaryUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Summary & Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {request.aiSummary ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p>{request.aiSummary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No AI summary generated.</p>
                )}
                
                {request.recommendedUpsellsJson && request.recommendedUpsellsJson.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-2">Recommended Upsells:</h4>
                    <div className="flex flex-wrap gap-2">
                      {request.recommendedUpsellsJson.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => regenerateAiSummaryMutation.mutate({ id: requestId }, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
                      toast({ title: "AI Summary regenerated" });
                    }
                  })}
                  disabled={regenerateAiSummaryMutation.isPending}
                >
                  {regenerateAiSummaryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Sparkles className="h-3 w-3 mr-2" />}
                  Regenerate Analysis
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Internal Summary (Editable)
              </CardTitle>
              {!isEditingSummary && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setInternalSummary(request.internalSummary || "");
                  setIsEditingSummary(true);
                }}>
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingSummary ? (
                <div className="space-y-3">
                  <Textarea 
                    value={internalSummary} 
                    onChange={(e) => setInternalSummary(e.target.value)}
                    className="min-h-[150px]"
                    placeholder="Add internal notes and scoping details here..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingSummary(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveSummary} disabled={updateMutation.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert min-h-[100px] bg-muted/30 p-4 rounded-md border border-dashed">
                  {request.internalSummary ? (
                    <p className="whitespace-pre-wrap">{request.internalSummary}</p>
                  ) : (
                    <p className="text-muted-foreground italic">No internal summary yet. Click edit to add one.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Requested Services</CardTitle>
            </CardHeader>
            <CardContent>
              {request.items && request.items.length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(
                    request.items.reduce((acc: any, item) => {
                      if (!acc[item.category]) acc[item.category] = [];
                      acc[item.category].push(item);
                      return acc;
                    }, {})
                  ).map(([category, items]: [string, any]) => (
                    <div key={category}>
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">{category}</h4>
                      <ul className="space-y-2">
                        {items.map((item: any) => (
                          <li key={item.id} className="flex justify-between items-center bg-muted/50 p-2 px-3 rounded-md">
                            <div>
                              <span className="font-medium">{item.itemName}</span>
                              {(item.quantityNote || item.sizeNote) && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({item.quantityNote && `Qty: ${item.quantityNote}`}{item.quantityNote && item.sizeNote && ', '}{item.sizeNote && `Size: ${item.sizeNote}`})
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
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
              <CardTitle className="text-lg">Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              {request.uploads && request.uploads.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {request.uploads.map((upload) => (
                    <a 
                      key={upload.id} 
                      href={`/api/storage${upload.fileUrl}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted transition-colors"
                    >
                      <div className="h-10 w-10 bg-primary/10 text-primary rounded flex items-center justify-center shrink-0">
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
              <CardTitle className="text-lg">Client Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{request.contactName}</p>
                  <p className="text-muted-foreground">{request.companyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${request.email}`} className="text-primary hover:underline">{request.email}</a>
              </div>
              {request.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${request.phone}`} className="hover:underline">{request.phone}</a>
                </div>
              )}
              
              <Separator className="my-2" />
              
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Event Date</p>
                  <p className="text-muted-foreground">{request.eventDate ? format(new Date(request.eventDate), 'PPP') : 'TBD'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Venue</p>
                  <p className="text-muted-foreground">{request.venueName || 'TBD'}</p>
                  <p className="text-xs text-muted-foreground">{request.venueAddress}</p>
                </div>
              </div>
              
              <Separator className="my-2" />
              
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="space-y-2 w-full">
                  <div>
                    <p className="font-medium">Install</p>
                    <p className="text-muted-foreground">{request.installDatetime ? format(new Date(request.installDatetime), 'PPP p') : 'TBD'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Removal</p>
                    <p className="text-muted-foreground">{request.removalDatetime ? format(new Date(request.removalDatetime), 'PPP p') : 'TBD'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Post-Event Disposition</p>
                    <p className="text-muted-foreground">{request.postEventDisposition || 'TBD'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Internal Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-4 max-h-[300px] overflow-y-auto pr-2">
                {notes && notes.length > 0 ? (
                  notes.map(note => (
                    <div key={note.id} className="bg-muted p-3 rounded-lg text-sm space-y-1">
                      <p className="text-xs text-muted-foreground">{format(new Date(note.createdAt), 'MMM d, h:mm a')}</p>
                      <p className="whitespace-pre-wrap">{note.noteBody}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
                )}
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Textarea 
                  placeholder="Type a new note..." 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="min-h-[80px] text-sm"
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
