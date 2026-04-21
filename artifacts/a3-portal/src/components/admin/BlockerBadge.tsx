import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";

type Props = { score: number; goLiveReady: boolean; blockerCount?: number };

export function BlockerBadge({ score, goLiveReady, blockerCount = 0 }: Props) {
  if (goLiveReady && blockerCount === 0) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Go-live ready · {score}%
      </Badge>
    );
  }
  if (blockerCount > 0) {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200">
        <AlertOctagon className="h-3 w-3 mr-1" /> {blockerCount} blocker{blockerCount === 1 ? "" : "s"} · {score}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200">
      <AlertTriangle className="h-3 w-3 mr-1" /> Warnings only · {score}%
    </Badge>
  );
}
