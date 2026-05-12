import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";

import type { ApprovedMaterial as Material } from "@workspace/db/schema";

export default function ApprovedMaterials() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  const list = useQuery<Material[]>({
    queryKey: ["/api/admin/approved-materials"],
    queryFn: () => apiFetch<{ materials: Material[] }>("/api/admin/approved-materials").then(r => r.materials),
  });

  const create = useMutation({
    mutationFn: (body: { name: string; category: string | null }) =>
      apiFetch("/api/admin/approved-materials", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/approved-materials"] }); setName(""); setCategory(""); toast({ title: "Added" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<Pick<Material, "name" | "category" | "description" | "sortOrder" | "isActive">> }) =>
      apiFetch(`/api/admin/approved-materials/${vars.id}`, { method: "PATCH", body: JSON.stringify(vars.patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/approved-materials"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/approved-materials/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/approved-materials"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Approved Materials</h1>
        <p className="text-sm text-muted-foreground mt-1">Master list of substrates customers can choose for survey-based assets.</p>
      </div>

      <Card className="p-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Material name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 13oz Vinyl Mesh" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Category (optional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Outdoor" />
          </div>
          <Button onClick={() => name.trim() && create.mutate({ name: name.trim(), category: category.trim() || null })} disabled={!name.trim() || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </Card>

      <Card>
        <div className="divide-y">
          {(list.data ?? []).map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="font-medium text-sm">{m.name}</div>
                {m.category && <div className="text-xs text-muted-foreground">{m.category}</div>}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span>{m.isActive ? "Active" : "Inactive"}</span>
                <Switch checked={m.isActive} onCheckedChange={(v) => update.mutate({ id: m.id, patch: { isActive: v } })} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Delete ${m.name}?`)) remove.mutate(m.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {list.data?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No materials configured.</div>}
        </div>
      </Card>
    </div>
  );
}
