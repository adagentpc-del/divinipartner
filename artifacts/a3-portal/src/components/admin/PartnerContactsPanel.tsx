import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Star, Trash2, Mail, Phone, Users, Pencil, X, Check } from "lucide-react";

export const PARTNER_CONTACT_ROLES = [
  { value: "primary",          label: "Primary contact",   color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "billing",          label: "Billing",           color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "graphic_designer", label: "Graphic designer",  color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" },
  { value: "support",          label: "Support",           color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "onsite",           label: "Onsite / event",    color: "bg-violet-100 text-violet-800 border-violet-200" },
  { value: "project",          label: "Project",           color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  { value: "other",            label: "Other",             color: "bg-muted text-muted-foreground border-muted-foreground/20" },
] as const;

export type PartnerContact = {
  id: number;
  partnerId: number;
  role: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isPrimary: boolean;
  isActive: boolean;
  sortOrder: number;
};

export function partnerContactRoleMeta(role: string) {
  return PARTNER_CONTACT_ROLES.find(r => r.value === role) || PARTNER_CONTACT_ROLES[PARTNER_CONTACT_ROLES.length - 1];
}

export default function PartnerContactsPanel({ partnerId }: { partnerId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = [`/api/partners/${partnerId}/contacts`];
  const { data: contacts = [], isLoading } = useQuery<PartnerContact[]>({
    queryKey, queryFn: () => apiFetch(`/api/partners/${partnerId}/contacts`),
  });

  const [draft, setDraft] = useState({ role: "primary", fullName: "", email: "", phone: "", notes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: string; fullName: string; email: string; phone: string; notes: string }>({ role: "other", fullName: "", email: "", phone: "", notes: "" });
  const invalidate = () => qc.invalidateQueries({ queryKey });
  const onErr = (label: string) => (e: any) =>
    toast({ title: label, description: e?.body?.error || e?.message || String(e), variant: "destructive" });

  const create = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/partners/${partnerId}/contacts`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate();
      setDraft({ role: "primary", fullName: "", email: "", phone: "", notes: "" });
      toast({ title: "Contact added" });
    },
    onError: onErr("Couldn't add contact"),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/api/partner-contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: onErr("Couldn't save changes"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/partner-contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
    onError: onErr("Couldn't remove contact"),
  });
  const makePrimary = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/partner-contacts/${id}/make-primary`, { method: "POST" }),
    onSuccess: () => invalidate(),
    onError: onErr("Couldn't update primary contact"),
  });

  function startEdit(c: PartnerContact) {
    setEditingId(c.id);
    setEditDraft({ role: c.role, fullName: c.fullName, email: c.email || "", phone: c.phone || "", notes: c.notes || "" });
  }
  function saveEdit() {
    if (editingId == null) return;
    if (!editDraft.fullName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    patch.mutate({
      id: editingId,
      body: {
        role: editDraft.role,
        fullName: editDraft.fullName.trim(),
        email: editDraft.email.trim() || null,
        phone: editDraft.phone.trim() || null,
        notes: editDraft.notes.trim() || null,
      },
    });
  }

  const grouped = PARTNER_CONTACT_ROLES.map(r => ({
    role: r,
    contacts: contacts.filter(c => c.role === r.value),
  })).filter(g => g.contacts.length > 0);

  return (
    <Card id="sec-contacts" className="scroll-mt-20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Partner Contacts</CardTitle>
        <CardDescription className="text-xs">
          Role-based people directory. Used by order handling, exception follow-ups, and the artwork-needed flow to route the right human.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : contacts.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No contacts yet — add the partner's primary contact below to get started.</div>
        ) : (
          <div className="space-y-4">
            {grouped.map(g => (
              <div key={g.role.value} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide font-semibold ${g.role.color}`}>{g.role.label}</span>
                  <span className="text-[11px] text-muted-foreground">{g.contacts.length} {g.contacts.length === 1 ? "contact" : "contacts"}</span>
                </div>
                <div className="grid gap-2">
                  {g.contacts.map(c => editingId === c.id ? (
                    <div key={c.id} className="border-2 border-primary/40 rounded-lg p-3 bg-primary/5 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Role</Label>
                          <Select value={editDraft.role} onValueChange={v => setEditDraft(d => ({ ...d, role: v }))}>
                            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PARTNER_CONTACT_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Full name</Label>
                          <Input className="h-9 mt-1" value={editDraft.fullName} onChange={e => setEditDraft(d => ({ ...d, fullName: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input className="h-9 mt-1" type="email" value={editDraft.email} onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input className="h-9 mt-1" type="tel" value={editDraft.phone} onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Textarea className="mt-1" rows={2} value={editDraft.notes} onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={patch.isPending}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={patch.isPending}>
                          {patch.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} className={`border rounded-lg p-3 ${!c.isActive ? "opacity-60 bg-muted/40" : "bg-card"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{c.fullName}</span>
                            {c.isPrimary && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><Star className="h-3 w-3 fill-current" /> Primary</span>}
                            {!c.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">Inactive</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" /> {c.email}</a>}
                            {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" /> {c.phone}</a>}
                          </div>
                          {c.notes && <div className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{c.notes}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => startEdit(c)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          {!c.isPrimary && c.isActive && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => makePrimary.mutate(c.id)} disabled={makePrimary.isPending}>
                              <Star className="h-3 w-3 mr-1" /> Make primary
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => patch.mutate({ id: c.id, body: { isActive: !c.isActive } })} disabled={patch.isPending}>
                            {c.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => { if (confirm(`Remove ${c.fullName}?`)) remove.mutate(c.id); }} disabled={remove.isPending}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add a contact</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={draft.role} onValueChange={v => setDraft(d => ({ ...d, role: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNER_CONTACT_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Full name</Label>
              <Input className="h-9 mt-1" value={draft.fullName} onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input className="h-9 mt-1" type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="jane@partner.example" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input className="h-9 mt-1" type="tel" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="+1 (555) 123-4567" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea className="mt-1" rows={2} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="When to use this contact, hours, language, etc." />
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" disabled={!draft.fullName.trim() || create.isPending}
              onClick={() => create.mutate({ ...draft, email: draft.email || null, phone: draft.phone || null, notes: draft.notes || null })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {create.isPending ? "Adding…" : "Add contact"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
