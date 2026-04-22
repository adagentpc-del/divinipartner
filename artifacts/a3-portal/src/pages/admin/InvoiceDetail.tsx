import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Link, useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Send, Save, Plus, Trash2, RotateCcw, ExternalLink, Printer } from "lucide-react";
import TaskPanel from "@/components/admin/TaskPanel";

const STATUSES = ["draft", "ready", "sent", "partially_paid", "paid", "overdue", "cancelled"];
const TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partially_paid: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  ready: "bg-indigo-100 text-indigo-800",
  draft: "bg-zinc-100 text-zinc-700",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-200 text-zinc-600",
};
const tone = (s: string) => TONE[s] || "bg-zinc-100 text-zinc-700";
import { formatMoney } from "@/lib/currency";
const money = (v: any, currency: string = "USD") => formatMoney(v ?? 0, currency) || "—";

export default function InvoiceDetail() {
  const [, params] = useRoute("/admin/invoices/:id");
  const id = parseInt(params?.id || "0");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: inv, isLoading } = useQuery<any>({ queryKey: [`/api/invoices/${id}`], queryFn: () => apiFetch(`/api/invoices/${id}`), enabled: !!id });
  const [edit, setEdit] = useState<any>(null);
  useEffect(() => {
    if (inv && !edit) setEdit({
      issueDate: inv.issueDate || "", dueDate: inv.dueDate || "",
      subtotal: inv.subtotal || "0", tax: inv.tax || "0", totalAmount: inv.totalAmount || "0",
      depositAmount: inv.depositAmount || "", paymentInstructions: inv.paymentInstructions || "",
      externalInvoiceRef: inv.externalInvoiceRef || "", paymentLinkPlaceholder: inv.paymentLinkPlaceholder || "",
      billingEntity: inv.billingEntity || "", notes: inv.notes || "",
    });
  }, [inv]);

  const update = useMutation({
    mutationFn: (patch: any) => apiFetch(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(patch), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Saved" }); qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/invoices"] }); qc.invalidateQueries({ queryKey: ["/api/billing/summary"] }); },
  });
  const regen = useMutation({
    mutationFn: () => apiFetch(`/api/invoices/${id}/regenerate`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Regenerated from order" }); qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] }); },
  });
  const addPayment = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/invoices/${id}/payments`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { toast({ title: "Payment recorded" }); qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] }); setPay({ amount: "", paidDate: new Date().toISOString().slice(0,10), method: "ach", reference: "", isDeposit: false }); },
  });
  const delPayment = useMutation({
    mutationFn: (pid: number) => apiFetch(`/api/invoices/${id}/payments/${pid}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Removed" }); qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] }); },
  });

  const [pay, setPay] = useState<any>({ amount: "", paidDate: new Date().toISOString().slice(0,10), method: "ach", reference: "", isDeposit: false });

  if (isLoading || !inv || !edit) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const isOverdue = inv.status === "sent" && inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <TaskPanel invoiceId={inv.id} orderId={inv.orderId ?? inv.order?.id} partnerId={inv.partnerId ?? undefined} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/billing"><Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-2"><ArrowLeft className="h-4 w-4" /> Back to Billing</Button></Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6" /> {inv.invoiceNumber}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={tone(isOverdue ? "overdue" : inv.status)}>{isOverdue ? "overdue" : inv.status}</Badge>
            <span className="text-sm text-muted-foreground">{inv.billingExecModel.replace(/_/g, " ")}</span>
            {inv.order && <Link href={`/admin/orders/${inv.order.id}`}><Button variant="ghost" size="sm" className="gap-1 h-7"><ExternalLink className="h-3 w-3" /> Order {inv.order.orderNumber}</Button></Link>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => window.open(`/invoice/${inv.publicToken}`, "_blank")} className="gap-2"><ExternalLink className="h-4 w-4" /> Client view</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
          {inv.status === "draft" && <>
            <Button variant="outline" size="sm" onClick={() => regen.mutate()} className="gap-2"><RotateCcw className="h-4 w-4" /> Regenerate from order</Button>
            <Button size="sm" onClick={() => update.mutate({ status: "ready" })}>Mark ready</Button>
          </>}
          {inv.status === "ready" && <Button size="sm" onClick={() => update.mutate({ status: "sent" })} className="gap-2"><Send className="h-4 w-4" /> Mark sent</Button>}
          {(inv.status === "sent" || inv.status === "partially_paid" || inv.status === "overdue") && <Button size="sm" onClick={() => update.mutate({ status: "paid" })}>Mark paid</Button>}
          {inv.status !== "cancelled" && <Button size="sm" variant="destructive" onClick={() => { if (confirm("Cancel invoice?")) update.mutate({ status: "cancelled" }); }}>Cancel</Button>}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Line items</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {(inv.lineItemsJson || []).map((li: any, i: number) => (
                  <TableRow key={i}><TableCell className="text-sm">{li.description}</TableCell><TableCell className="text-right text-sm">{li.quantity}</TableCell><TableCell className="text-right text-sm">{money(li.unitPrice, inv.currency)}</TableCell><TableCell className="text-right text-sm font-medium">{money(li.amount, inv.currency)}</TableCell></TableRow>
                ))}
                {(!inv.lineItemsJson || inv.lineItemsJson.length === 0) && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No line items</TableCell></TableRow>}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end">
              <div className="space-y-1 text-right text-sm w-72">
                <div className="flex justify-between"><span className="text-muted-foreground">{inv.taxInclusive ? "Net subtotal" : "Subtotal"}</span><span>{money(inv.subtotal, inv.currency)}</span></div>
                {parseFloat(inv.tax || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{inv.taxLabel || "Tax"}{inv.taxRate ? ` (${Number(inv.taxRate)}%${inv.taxInclusive ? ", incl." : ""})` : ""}</span>
                    <span>{money(inv.tax, inv.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Total <span className="text-xs font-normal text-muted-foreground ml-1">{inv.currency || "USD"}</span></span><span>{money(inv.totalAmount, inv.currency)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{money(inv.amountPaid, inv.currency)}</span></div>
                <div className="flex justify-between font-semibold"><span>Balance</span><span className={parseFloat(inv.balanceDue || "0") > 0 ? "text-amber-700" : ""}>{money(inv.balanceDue, inv.currency)}</span></div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-3">Payments</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead></TableHead><TableHead className="w-9"></TableHead></TableRow></TableHeader>
              <TableBody>
                {(inv.payments || []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.paidDate || p.createdAt?.slice(0,10)}</TableCell>
                    <TableCell className="text-sm font-medium">{money(p.amount, inv.currency)}</TableCell>
                    <TableCell className="text-sm">{p.method || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference || "—"}</TableCell>
                    <TableCell className="text-xs">{p.isDeposit && <Badge variant="outline">deposit</Badge>}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Remove?")) delPayment.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div><Label className="text-xs">Amount</Label><Input value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} placeholder="0.00" /></div>
              <div><Label className="text-xs">Date</Label><Input type="date" value={pay.paidDate} onChange={e => setPay({ ...pay, paidDate: e.target.value })} /></div>
              <div><Label className="text-xs">Method</Label><Select value={pay.method} onValueChange={v => setPay({ ...pay, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["ach","check","wire","card","cash","other"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Reference</Label><Input value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={pay.isDeposit} onChange={e => setPay({ ...pay, isDeposit: e.target.checked })} />Deposit</label>
              <Button size="sm" disabled={!pay.amount} onClick={() => addPayment.mutate(pay)} className="gap-1"><Plus className="h-3.5 w-3.5" />Record</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Bill to</h2>
            <div className="text-sm">
              <div className="font-medium">{inv.billingEntity || inv.partner?.companyName || "—"}</div>
              {inv.billingContactJson && <>
                <div>{inv.billingContactJson.name}</div>
                <div className="text-muted-foreground">{inv.billingContactJson.email}</div>
                <div className="text-muted-foreground">{inv.billingContactJson.phone}</div>
              </>}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Edit</h2>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Issue</Label><Input type="date" value={edit.issueDate} onChange={e => setEdit({ ...edit, issueDate: e.target.value })} /></div>
              <div><Label className="text-xs">Due</Label><Input type="date" value={edit.dueDate} onChange={e => setEdit({ ...edit, dueDate: e.target.value })} /></div>
              <div><Label className="text-xs">Subtotal</Label><Input value={edit.subtotal} onChange={e => setEdit({ ...edit, subtotal: e.target.value })} /></div>
              <div><Label className="text-xs">Tax</Label><Input value={edit.tax} onChange={e => setEdit({ ...edit, tax: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Total</Label><Input value={edit.totalAmount} onChange={e => setEdit({ ...edit, totalAmount: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Deposit amount</Label><Input value={edit.depositAmount} onChange={e => setEdit({ ...edit, depositAmount: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Billing entity</Label><Input value={edit.billingEntity} onChange={e => setEdit({ ...edit, billingEntity: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">External invoice ref</Label><Input value={edit.externalInvoiceRef} onChange={e => setEdit({ ...edit, externalInvoiceRef: e.target.value })} placeholder="QuickBooks / NetSuite #" /></div>
              <div className="col-span-2"><Label className="text-xs">Payment link (placeholder)</Label><Input value={edit.paymentLinkPlaceholder} onChange={e => setEdit({ ...edit, paymentLinkPlaceholder: e.target.value })} placeholder="https://…" /></div>
              <div className="col-span-2"><Label className="text-xs">Payment instructions</Label><Textarea value={edit.paymentInstructions} onChange={e => setEdit({ ...edit, paymentInstructions: e.target.value })} rows={3} /></div>
              <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={2} /></div>
            </div>
            <Button onClick={() => update.mutate(edit)} disabled={update.isPending} className="w-full gap-2"><Save className="h-4 w-4" /> Save</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
