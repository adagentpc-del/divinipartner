import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useGetSiteSettings, useUpdateSiteSettings } from "@workspace/api-client-react";
import { PortalVideoPlayer } from "@/components/branding/PortalVideoPlayer";
import { Film, Upload, Loader2, Save } from "lucide-react";

interface DemoForm {
  mainDemoVideoEnabled: boolean;
  mainDemoVideoUrl: string;
  mainDemoVideoPosterUrl: string;
  mainDemoVideoTitle: string;
  mainDemoVideoDescription: string;
}

const EMPTY: DemoForm = {
  mainDemoVideoEnabled: true,
  mainDemoVideoUrl: "",
  mainDemoVideoPosterUrl: "",
  mainDemoVideoTitle: "",
  mainDemoVideoDescription: "",
};

/** Upload a file to object storage and return its public object path. */
async function uploadFile(file: File): Promise<string> {
  const r = await fetch("/api/storage/public-uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("Could not get upload URL");
  const { uploadURL, publicUrl } = await r.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("File upload failed");
  return publicUrl as string;
}

export function DemoVideoSettings() {
  const { toast } = useToast();
  const { data, isLoading } = useGetSiteSettings();
  const update = useUpdateSiteSettings();
  const [form, setForm] = useState<DemoForm>(EMPTY);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      mainDemoVideoEnabled: data.mainDemoVideoEnabled ?? true,
      mainDemoVideoUrl: data.mainDemoVideoUrl ?? "",
      mainDemoVideoPosterUrl: data.mainDemoVideoPosterUrl ?? "",
      mainDemoVideoTitle: data.mainDemoVideoTitle ?? "",
      mainDemoVideoDescription: data.mainDemoVideoDescription ?? "",
    });
  }, [data]);

  const set = <K extends keyof DemoForm>(key: K, value: DemoForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleUpload(kind: "video" | "poster", file: File | null) {
    if (!file) return;
    const setBusy = kind === "video" ? setUploadingVideo : setUploadingPoster;
    setBusy(true);
    try {
      const path = await uploadFile(file);
      if (kind === "video") set("mainDemoVideoUrl", path);
      else set("mainDemoVideoPosterUrl", path);
      toast({ title: kind === "video" ? "Video uploaded" : "Poster uploaded" });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    try {
      await update.mutateAsync({
        data: {
          mainDemoVideoEnabled: form.mainDemoVideoEnabled,
          mainDemoVideoUrl: form.mainDemoVideoUrl.trim() || null,
          mainDemoVideoPosterUrl: form.mainDemoVideoPosterUrl.trim() || null,
          mainDemoVideoTitle: form.mainDemoVideoTitle.trim() || null,
          mainDemoVideoDescription: form.mainDemoVideoDescription.trim() || null,
        },
      });
      toast({ title: "Demo video settings saved" });
    } catch (e: any) {
      toast({ title: e?.message || "Save failed", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5 text-[#C99A2E]" /> Front-Page Demo Video
        </CardTitle>
        <CardDescription>
          Control the demo video shown on the public home page. Upload a file or paste a Vimeo,
          YouTube, or direct video URL. When disabled, the section is hidden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Show demo section</Label>
                <p className="text-xs text-muted-foreground">Toggle visibility on the home page.</p>
              </div>
              <Switch
                checked={form.mainDemoVideoEnabled}
                onCheckedChange={(v) => set("mainDemoVideoEnabled", v)}
                data-testid="switch-demo-enabled"
              />
            </div>

            <div className="space-y-2">
              <Label>Video URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.mainDemoVideoUrl}
                  onChange={(e) => set("mainDemoVideoUrl", e.target.value)}
                  placeholder="https://vimeo.com/… or uploaded file path"
                  data-testid="input-demo-video-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => videoRef.current?.click()}
                  disabled={uploadingVideo}
                >
                  {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">Upload</span>
                </Button>
                <input
                  ref={videoRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => handleUpload("video", e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Poster image URL (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.mainDemoVideoPosterUrl}
                  onChange={(e) => set("mainDemoVideoPosterUrl", e.target.value)}
                  placeholder="Thumbnail shown before play"
                  data-testid="input-demo-poster-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => posterRef.current?.click()}
                  disabled={uploadingPoster}
                >
                  {uploadingPoster ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">Upload</span>
                </Button>
                <input
                  ref={posterRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleUpload("poster", e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.mainDemoVideoTitle}
                onChange={(e) => set("mainDemoVideoTitle", e.target.value)}
                placeholder="See What A3 Visual Can Activate"
                data-testid="input-demo-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.mainDemoVideoDescription}
                onChange={(e) => set("mainDemoVideoDescription", e.target.value)}
                placeholder="Short paragraph shown under the title."
                rows={3}
                data-testid="input-demo-description"
              />
            </div>

            {(form.mainDemoVideoUrl || form.mainDemoVideoPosterUrl) && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview</Label>
                <div className="overflow-hidden rounded-lg border">
                  <PortalVideoPlayer
                    src={form.mainDemoVideoUrl || null}
                    poster={form.mainDemoVideoPosterUrl || null}
                    title={form.mainDemoVideoTitle || "Demo video"}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={save} disabled={update.isPending} data-testid="button-save-demo">
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1.5">Save demo settings</span>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
