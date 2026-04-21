import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useDemoMode } from "@/contexts/DemoModeContext";

type FaqEntry = {
  id: number; audience: string; category: string; question: string; answer: string; isActive: boolean;
};

type Props = {
  audience?: "internal" | "partner" | "client";
  triggerLabel?: string;
  variant?: "button" | "icon";
};

export function BuyerHelpDrawer({ audience, triggerLabel = "Help", variant = "button" }: Props) {
  const { demoMode } = useDemoMode();
  // Hard clamp: in demo mode, internal content is never surfaced — collapse to client.
  // Outside demo mode, default to internal when no audience prop is given.
  const requested = audience ?? (demoMode ? "client" : "internal");
  const effectiveAudience = demoMode && requested === "internal" ? "client" : requested;
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<FaqEntry[]>({
    queryKey: ["faq", effectiveAudience],
    queryFn: () => apiFetch(`/api/faq?audience=${effectiveAudience}&activeOnly=true`),
    enabled: open,
  });

  const grouped = (data ?? []).reduce<Record<string, FaqEntry[]>>((acc, e) => {
    (acc[e.category] ||= []).push(e);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" aria-label="Help">
            <HelpCircle className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <HelpCircle className="h-4 w-4 mr-2" />
            {triggerLabel}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Help & FAQ
            <Badge variant="outline" className="text-[10px] capitalize">{effectiveAudience}</Badge>
          </SheetTitle>
          <SheetDescription>
            Quick answers to common questions. Buyer-safe explanations are separated from internal operational notes.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No help content for this audience yet.</p>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="mb-6">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{cat.replace("_", " ")}</h4>
              <Accordion type="multiple" className="w-full">
                {items.map((it) => (
                  <AccordionItem key={it.id} value={`f-${it.id}`}>
                    <AccordionTrigger className="text-sm text-left">{it.question}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                      {it.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
