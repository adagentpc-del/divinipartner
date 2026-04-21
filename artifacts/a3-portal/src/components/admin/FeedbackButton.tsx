import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus } from "lucide-react";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("ux");
  const [severity, setSeverity] = useState("medium");
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => apiFetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterUserId: user?.id ?? null,
        submitterRole: "admin",
        screenPath: location,
        category, severity, message,
      }),
    }),
    onSuccess: () => {
      toast({ title: "Feedback submitted", description: "Thanks — the team will review shortly." });
      setMessage(""); setOpen(false);
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (e: any) => toast({ title: "Couldn't submit", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 shadow-md gap-2"
        data-testid="feedback-button"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" /> Feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>Tell us what's slow, confusing, broken, or missing on this screen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ux">UX / confusion</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="performance">Slow screen</SelectItem>
                    <SelectItem value="missing_feature">Missing feature</SelectItem>
                    <SelectItem value="data">Data / accuracy</SelectItem>
                    <SelectItem value="onboarding">Onboarding unclear</SelectItem>
                    <SelectItem value="billing">Billing confusion</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Severity</label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">What happened?</label>
              <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Be specific — which step, what you expected, what happened…" />
            </div>
            <div className="text-xs text-muted-foreground">Linked to: <code>{location}</code></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={!message.trim() || submit.isPending}>
              {submit.isPending ? "Sending…" : "Submit feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
