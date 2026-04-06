import { useGetAssetsLibrary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, FileText, Image as ImageIcon, Loader2 } from "lucide-react";

export default function AssetsLibrary() {
  const { data: library, isLoading } = useGetAssetsLibrary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!library) {
    return <div className="text-center py-12 text-muted-foreground">Failed to load assets.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets Library</h1>
        <p className="text-muted-foreground mt-1">Browse all uploaded files across partners and requests.</p>
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            Partner Brand Assets
          </h2>
          {library.partnerAssets && library.partnerAssets.length > 0 ? (
            <div className="space-y-4">
              {library.partnerAssets.map((group) => (
                <Card key={group.partnerId} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/30 border-b">
                    <CardTitle className="text-sm font-semibold">{group.partnerName}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {group.assets.map((asset) => (
                        <a 
                          key={asset.id}
                          href={`/api/storage${asset.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col p-3 rounded-lg border hover:border-primary/30 hover:bg-muted/50 transition-all group"
                        >
                          <div className="aspect-video bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden">
                            <ImageIcon className="h-6 w-6 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
                          </div>
                          <p className="text-xs font-medium truncate" title={asset.fileName}>{asset.fileName}</p>
                          <p className="text-[11px] text-muted-foreground uppercase">{asset.assetType.replace('_', ' ')}</p>
                          {asset.notes && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{asset.notes}</p>}
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 border-2 border-dashed rounded-xl bg-card">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <FolderOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No partner assets</p>
              <p className="text-sm text-muted-foreground mt-1">Brand assets will appear here when uploaded.</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            Request Uploads
          </h2>
          {library.requestUploads && library.requestUploads.length > 0 ? (
            <div className="space-y-4">
              {library.requestUploads.map((group) => (
                <Card key={group.requestId} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/30 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{group.eventName}</CardTitle>
                      <span className="text-xs text-muted-foreground">{group.partnerName}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.uploads.map((upload) => (
                        <a 
                          key={upload.id}
                          href={`/api/storage${upload.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/30 transition-all group"
                        >
                          <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate" title={upload.fileName}>{upload.fileName}</p>
                            <p className="text-[11px] text-muted-foreground capitalize">{upload.uploadType.replace('_', ' ')}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 border-2 border-dashed rounded-xl bg-card">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No request uploads</p>
              <p className="text-sm text-muted-foreground mt-1">Files will appear here when submitted with requests.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
