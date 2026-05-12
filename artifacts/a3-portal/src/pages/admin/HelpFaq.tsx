import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import type { FaqEntry as Faq } from "@workspace/db/schema";
type Constants = { audiences: string[]; categories: { key: string; label: string }[] };

const AUDIENCE_LABEL: Record<string, string> = {
  internal: "Internal sales",
  partner: "Partner-facing",
  client: "Client-facing",
};

export default function HelpFaq() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [audience, setAudience] = useState("internal");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Faq> | null>(null);

  const constantsQ = useQuery<Constants>({ queryKey: ["faq-constants"], queryFn: () => apiFetch("/api/faq/constants") });
  const listQ = useQuery<Faq[]>({ queryKey: ["faq", audience], queryFn: () => apiFetch(`/api/faq?audience=${audience}`) });

  const saveMut = useMutation({
    mutationFn: async (body: Partial<Faq>) => {
      if (body.id) return apiFetch(`/api/faq/${body.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch(`/api/faq`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["faq"] }); toast({ title: "Saved" }); setOpen(false); },
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => apiFetch(`/api/faq/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["faq"] }); toast({ title: "Deleted" }); },
  });

  const open_ = (f?: Partial<Faq>) => {
    setEditing(f ?? { audience, category: "setup", question: "", answer: "", sortOrder: 0, isActive: true });
    setOpen(true);
  };
  const setF = (k: keyof Faq, v: any) => setEditing(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help & FAQ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Maintain buyer-safe and internal explanations. Audiences are kept strictly separate.
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button onClick={() => open_()}><Plus className="h-4 w-4 mr-1" /> Add entry</Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>{editing?.id ? "Edit FAQ" : "New FAQ entry"}</SheetTitle></SheetHeader>
            {editing && (
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Audience</label>
                    <Select value={editing.audience} onValueChange={v => setF("audience", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{constantsQ.data?.audiences.map(a => <SelectItem key={a} value={a}>{AUDIENCE_LABEL[a] || a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Category</label>
                    <Select value={editing.category} onValueChange={v => setF("category", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{constantsQ.data?.categories.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Question</label>
                  <Input value={editing.question ?? ""} onChange={e => setF("question", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Answer</label>
                  <Textarea rows={6} value={editing.answer ?? ""} onChange={e => setF("answer", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Sort order</label>
                    <Input type="number" value={editing.sortOrder ?? 0} onChange={e => setF("sortOrder", Number(e.target.value))} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editing.isActive ?? true} onChange={e => setF("isActive", e.target.checked)} />
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => saveMut.mutate(editing)} disabled={!editing.question || !editing.answer}>
                    {editing.id ? "Save" : "Create"}
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      <Tabs value={audience} onValueChange={setAudience}>
        <TabsList>
          <TabsTrigger value="internal">{AUDIENCE_LABEL.internal}</TabsTrigger>
          <TabsTrigger value="partner">{AUDIENCE_LABEL.partner}</TabsTrigger>
          <TabsTrigger value="client">{AUDIENCE_LABEL.client}</TabsTrigger>
        </TabsList>
        {["internal", "partner", "client"].map(a => (
          <TabsContent key={a} value={a}>
            <Card>
              <CardContent className="p-0 divide-y">
                {(listQ.data ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">No entries for this audience yet.</p>}
                {listQ.data?.map(it => (
                  <div key={it.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => open_(it)}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="capitalize">{it.category.replace("_", " ")}</Badge>
                          {!it.isActive && <Badge variant="secondary">Hidden</Badge>}
                        </div>
                        <div className="font-medium text-sm">{it.question}</div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{it.answer}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => delMut.mutate(it.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
