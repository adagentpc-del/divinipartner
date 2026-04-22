import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

// Lightweight, non-blocking banner that surfaces email-config gaps at the top
// of the admin layout. Hidden when everything is healthy. Polls infrequently
// so it stays cheap.
export default function EmailReadinessBanner() {
  const { data } = useQuery<{ summary: { ready: number; warning: number; incomplete: number }; system: { resendKeyConfigured: boolean; publicUrl: { isCustomDomain: boolean; source: string } } }>({
    queryKey: ["/api/admin/email-readiness/summary"],
    queryFn: () => apiFetch("/api/admin/email-readiness").then((r: any) => ({ summary: r.summary, system: r.system })),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!data) return null;

  const systemBroken = !data.system.resendKeyConfigured;
  const systemWarn = data.system.publicUrl.source !== "PUBLIC_APP_URL" || !data.system.publicUrl.isCustomDomain;
  const incomplete = data.summary.incomplete;
  const warnings = data.summary.warning;

  if (!systemBroken && !systemWarn && incomplete === 0 && warnings === 0) return null;

  const tone = systemBroken || incomplete > 0 ? "bad" : "warn";
  const cls = tone === "bad"
    ? "bg-red-50 border-b-red-200 text-red-900"
    : "bg-amber-50 border-b-amber-200 text-amber-900";

  const messages: string[] = [];
  if (systemBroken) messages.push("email provider not configured");
  if (!data.system.resendKeyConfigured) {
    // covered above
  } else if (systemWarn) messages.push("public domain is not a verified custom domain — branded links may look untrusted");
  if (incomplete > 0) messages.push(`${incomplete} partner${incomplete === 1 ? "" : "s"} missing critical email config`);
  if (warnings > 0) messages.push(`${warnings} partner${warnings === 1 ? "" : "s"} have email warnings`);

  return (
    <div className={`border-b text-xs px-4 py-2 flex items-center gap-2 ${cls}`}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        Email readiness: {messages.join(" · ")}.
      </span>
      <Link href="/admin/email-readiness">
        <span className="font-semibold underline cursor-pointer">Open Email Readiness</span>
      </Link>
    </div>
  );
}
