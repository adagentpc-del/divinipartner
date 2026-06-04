import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUpdatePartnerWalkthrough, getGetPartnerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveBranding } from "@/components/branding/usePartnerBranding";
import { PartnerWalkthrough } from "@/components/branding/PartnerWalkthrough";
import { generatePortalWalkthroughScript } from "@/lib/walkthrough";
import { PlayCircle, Upload, Loader2, RefreshCw, Save, Wand2 } from "lucide-react";

interface PartnerLike {
  id: number;
  companyName: string;
  introHeadline?: string | null;
  introText?: string | null;
  thankYouText?: string | null;
  partnerType?: string | null;
  portalMode?: string | null;
  pricingDisplayEnabled?: boolean | null;
  theme?: unknown;
  walkthroughEnabled?: boolean | null;
  walkthroughVideoUrl?: string | null;
  walkthroughVideoPosterUrl?: string | null;
  walkthroughVideoStatus?: string | null;
  walkthroughGeneratedAt?: string | null;
}

async function uploadFile(file: File): Promise<string> {
  const r = await fetch("/api/storage/public-uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("Could not get upload URL");
  const { uploadURL, publicUrl } = await r.json();
  const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!put.ok) throw new Error("File upload failed");
  return publicUrl as string;
}

/**
 * Admin control for a partner's auto-generated walkthrough. Lets the admin
 * enable/disable it, preview the live interactive experience, regenerate the
 * persisted script snapshot, and optionally override it with a custom video.
 */
export function PartnerWalkthroughPanel({ partner }: { partner: PartnerLike }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const update = useUpdatePartnerWalkthrough();

  const [enabled, setEnabled] = useState(partner.walkthroughEnabled ?? true);
  const [videoUrl, setVideoUrl] = useState(partner.walkthroughVideoUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(partner.walkthroughVideoPosterUrl ?? "");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEnabled(partner.walkthroughEnabled ?? true);
    setVideoUrl(partner.walkthroughVideoUrl ?? "");
    setPosterUrl(partner.walkthroughVideoPosterUrl ?? "");
  }, [partner.id, partner.walkthroughEnabled, partner.walkthroughVideoUrl, partner.walkthroughVideoPosterUrl]);

  const branding = resolveBranding((partner.theme as any) || null);
  const status = partner.walkthroughVideoStatus || (videoUrl ? "video_ready" : "interactive_ready");

  // The preview always reflects the live deterministic script (admin parity).
  const script = generatePortalWalkthroughScript({
    companyName: partner.companyName,
    introHeadline: partner.introHeadline,
    introText: partner.introText,
    thankYouText: partner.thankYouText,
    portalMode: partner.portalMode,
    partnerType: partner.partnerType,
    pricingDisplayEnabled: partner.pricingDisplayEnabled,
  });

  async function handleUpload(kind: "video" | "poster", file: File | null) {
    if (!file) return;
    const setBusy = kind === "video" ? setUploadingVideo : setUploadingPoster;
    setBusy(true);
    try {
      const path = await uploadFile(file);
      if (kind === "video") setVideoUrl(path);
      else setPosterUrl(path);
      toast({ title: kind === "video" ? "Video uploaded" : "Poster uploaded" });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function persist(opts: { regenerate?: boolean } = {}) {
    try {
      await update.mutateAsync({
        id: partner.id,
        data: {
          walkthroughEnabled: enabled,
          walkthroughVideoUrl: videoUrl.trim() || null,
          walkthroughVideoPosterUrl: posterUrl.trim() || null,
          // Persist a fresh snapshot of the deterministic script so the admin
          // model matches what visitors see.
          walkthroughScript: script as any,
          regenerate: opts.regenerate || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetPartnerQueryKey(partner.id) });
      toast({ title: opts.regenerate ? "Walkthrough regenerated" : "Walkthrough saved" });
    } catch (e: any) {
      toast({ title: e?.message || "Save failed", variant: "destructive" });
    }
  }

  return (
    <Card id="sec-walkthrough" className="scroll-mt-20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4" /> Branded Walkthrough
          <Badge variant={status === "video_ready" ? "default" : "secondary"} className="ml-2 text-[10px]">
            {status === "video_ready" ? "Custom video" : "Interactive"}
          </Badge>
          <span className="text-xs font-normal text-muted-foreground ml-auto">Auto-generated</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          An interactive walkthrough is generated automatically from this portal's live data — no
          AI, no setup. Optionally override it with a custom walkthrough video. Disable to hide the
          "Watch Walkthrough" button on the portal.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Show walkthrough on portal</Label>
            <p className="text-xs text-muted-foreground">
              {partner.walkthroughGeneratedAt
                ? `Last generated ${new Date(partner.walkthroughGeneratedAt).toLocaleString()}`
                : "Not yet generated — save to create a snapshot."}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-walkthrough-enabled" />
        </div>

        <div className="space-y-2">
          <Label>Custom walkthrough video URL (optional override)</Label>
          <div className="flex gap-2">
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Leave empty to use the interactive walkthrough"
              data-testid="input-walkthrough-video-url"
            />
            <Button type="button" variant="outline" onClick={() => videoRef.current?.click()} disabled={uploadingVideo}>
              {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
            <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => handleUpload("video", e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Video poster image (optional)</Label>
          <div className="flex gap-2">
            <Input
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="Thumbnail shown before play"
              data-testid="input-walkthrough-poster-url"
            />
            <Button type="button" variant="outline" onClick={() => posterRef.current?.click()} disabled={uploadingPoster}>
              {uploadingPoster ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
            <input ref={posterRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload("poster", e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} data-testid="button-preview-walkthrough">
            <PlayCircle className="h-4 w-4 mr-1.5" /> Preview
          </Button>
          <Button type="button" variant="outline" onClick={() => persist({ regenerate: true })} disabled={update.isPending} data-testid="button-regenerate-walkthrough">
            {update.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />} Regenerate
          </Button>
          <Button type="button" onClick={() => persist()} disabled={update.isPending} data-testid="button-save-walkthrough" className="ml-auto">
            {update.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save walkthrough
          </Button>
        </div>
      </CardContent>

      <PartnerWalkthrough
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        script={script}
        branding={branding}
        videoUrl={videoUrl || null}
        videoPosterUrl={posterUrl || null}
        videoStatus={videoUrl ? "video_ready" : "interactive_ready"}
      />
    </Card>
  );
}
