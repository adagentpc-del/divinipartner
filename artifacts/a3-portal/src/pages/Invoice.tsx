import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { formatMoney } from "@/lib/currency";

const TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partially_paid: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
  ready: "bg-indigo-100 text-indigo-800",
  draft: "bg-zinc-100 text-zinc-700",
};

export default function PublicInvoice() {
  const [, params] = useRoute("/invoice/:token");
  const token = params?.token;
  const { data: inv, isLoading, error } = useQuery<any>({ queryKey: [`/api/invoices/public/${token}`], queryFn: () => apiFetch(`/api/invoices/public/${token}`), enabled: !!token });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (error || !inv) return <div className="p-12 text-center text-muted-foreground">Invoice not found.</div>;

  const cur = inv.currency || "USD";
  const money = (v: any) => formatMoney(v, cur);
  const taxLine = inv.taxLabel || "Tax";
  const taxRateNum = parseFloat(inv.taxRate || "0");
  const taxLabelDisplay = taxLine + (taxRateNum > 0 ? ` (${taxRateNum}%${inv.taxInclusive ? " incl." : ""})` : "");

  return (
    <div className="min-h-screen bg-zinc-100 py-8">
      <div className="max-w-3xl mx-auto bg-white shadow-sm rounded-lg overflow-hidden print:shadow-none print:rounded-none">
        <div className="p-8 border-b flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {inv.partnerLogoUrl ? <img src={inv.partnerLogoUrl} alt="" className="h-12 w-auto" /> : <div className="h-12 w-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">A3</div>}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Invoice</h1>
              <div className="text-sm text-muted-foreground">{inv.invoiceNumber} · {cur}</div>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </div>

        <div className="p-8 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bill to</div>
            <div className="font-medium">{inv.billingEntity || "—"}</div>
            {inv.billingContact && <>
              {inv.billingContact.name && <div className="text-sm">{inv.billingContact.name}</div>}
              {inv.billingContact.email && <div className="text-sm text-muted-foreground">{inv.billingContact.email}</div>}
              {inv.billingContact.phone && <div className="text-sm text-muted-foreground">{inv.billingContact.phone}</div>}
              {inv.billingContact.address && <div className="text-sm text-muted-foreground whitespace-pre-line">{inv.billingContact.address}</div>}
            </>}
          </div>
          <div className="text-right space-y-1">
            <div><span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">Status</span><Badge className={TONE[inv.status] || "bg-zinc-100"}>{inv.status}</Badge></div>
            <div className="text-sm"><span className="text-muted-foreground">Issued:</span> {inv.issueDate || "—"}</div>
            <div className="text-sm"><span className="text-muted-foreground">Due:</span> {inv.dueDate || "—"}</div>
          </div>
        </div>

        <div className="px-8 pb-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Items</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-2 font-medium">Description</th><th className="text-right py-2 font-medium">Qty</th><th className="text-right py-2 font-medium">Unit</th><th className="text-right py-2 font-medium">Amount</th></tr></thead>
            <tbody>
              {(inv.lineItems || []).map((li: any, i: number) => (
                <tr key={i} className="border-b border-zinc-100"><td className="py-2">{li.description}</td><td className="py-2 text-right">{li.quantity}</td><td className="py-2 text-right">{money(li.unitPrice)}</td><td className="py-2 text-right font-medium">{money(li.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(inv.subtotal)}</span></div>
            {parseFloat(inv.tax || "0") > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{taxLabelDisplay}</span><span>{money(inv.tax)}</span></div>}
            <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>{money(inv.totalAmount)}</span></div>
            <div className="flex justify-between text-emerald-700"><span>Amount paid</span><span>{money(inv.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Balance due</span><span className={parseFloat(inv.balanceDue || "0") > 0 ? "text-amber-700" : "text-emerald-700"}>{money(inv.balanceDue)}</span></div>
          </div>
        </div>

        {(inv.paymentInstructions || inv.paymentLinkPlaceholder) && (
          <div className="px-8 pb-8">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Payment</div>
            {inv.paymentLinkPlaceholder && <a href={inv.paymentLinkPlaceholder} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-blue-700 hover:underline mb-2">Pay online →</a>}
            {inv.paymentInstructions && <div className="text-sm whitespace-pre-line bg-zinc-50 rounded p-3">{inv.paymentInstructions}</div>}
          </div>
        )}

        {inv.notes && (
          <div className="px-8 pb-8">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Notes</div>
            <div className="text-sm whitespace-pre-line">{inv.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
