import { useDemoMode } from "@/contexts/DemoModeContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Eye, X } from "lucide-react";

export function DemoModeBanner() {
  const { demoMode, setDemoMode } = useDemoMode();
  if (!demoMode) return null;
  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 text-sm flex items-center justify-between sticky top-0 z-40 shadow-md">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="font-semibold">Demo Mode active</span>
        <span className="opacity-90 hidden sm:inline">— internal financial details, monetization notes, and operational noise are hidden.</span>
      </div>
      <Button size="sm" variant="ghost" className="h-7 text-white hover:bg-white/20" onClick={() => setDemoMode(false)}>
        <X className="h-3 w-3 mr-1" /> Exit
      </Button>
    </div>
  );
}

export function DemoModeToggle() {
  const { demoMode, toggle } = useDemoMode();
  return (
    <div className="flex items-center gap-2 px-2">
      <Switch checked={demoMode} onCheckedChange={toggle} id="demo-mode-toggle" />
      <label htmlFor="demo-mode-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
        Demo mode
      </label>
    </div>
  );
}
