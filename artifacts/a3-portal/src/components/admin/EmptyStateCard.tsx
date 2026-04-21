import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { type LucideIcon } from "lucide-react";

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary";
}

interface Props {
  icon?: LucideIcon;
  title: string;
  description: string;
  actions?: Action[];
  tips?: string[];
  children?: ReactNode;
}

export function EmptyStateCard({ icon: Icon, title, description, actions = [], tips, children }: Props) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        {Icon && (
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {actions.map((a, i) => {
              const btn = (
                <Button key={i} variant={a.variant || (i === 0 ? "default" : "outline")} size="sm" onClick={a.onClick}>
                  {a.label}
                </Button>
              );
              return a.href ? <Link key={i} href={a.href}>{btn}</Link> : btn;
            })}
          </div>
        )}
        {tips && tips.length > 0 && (
          <ul className="mt-2 max-w-md space-y-1 text-left text-xs text-muted-foreground">
            {tips.map((t, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{t}</span></li>)}
          </ul>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
