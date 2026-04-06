import { useGetAssetsLibrary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, FileText, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";

export default function AssetsLibrary() {
  const { data: library, isLoading } = useGetAssetsLibrary();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading asset library...</div>;
  }

  if (!library) {
    return <div className="p-8 text-center text-muted-foreground">Failed to load assets.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Assets Library</h1>
        <p className="text-muted-foreground">Browse all uploaded files across partners and requests.</p>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Partner Brand Assets
          </h2>
          {library.partnerAssets && library.partnerAssets.length > 0 ? (
            <div className="space-y-6">
              {library.partnerAssets.map((group) => (
                <Card key={group.partnerId}>
                  <CardHeader className="pb-3 bg-muted/30">
                    <CardTitle className="text-md">{group.partnerName}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {group.assets.map((asset) => (
                        <a 
                          key={asset.id}
                          href={`/api/storage${asset.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-all"
                        >
                          <div className="aspect-video bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden relative">
                            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                            {/* If we had thumbnails we'd show them here */}
                          </div>
                          <p className="text-sm font-medium truncate" title={asset.fileName}>{asset.fileName}</p>
                          <p className="text-xs text-muted-foreground uppercase">{asset.assetType.replace('_', ' ')}</p>
                          {asset.notes && <p className="text-xs text-muted-foreground truncate mt-1">{asset.notes}</p>}
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded-lg text-center bg-card">
              <p className="text-muted-foreground">No partner assets found.</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Request Uploads
          </h2>
          {library.requestUploads && library.requestUploads.length > 0 ? (
            <div className="space-y-6">
              {library.requestUploads.map((group) => (
                <Card key={group.requestId}>
                  <CardHeader className="pb-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-md">{group.eventName}</CardTitle>
                      <span className="text-sm text-muted-foreground">{group.partnerName}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {group.uploads.map((upload) => (
                        <a 
                          key={upload.id}
                          href={`/api/storage${upload.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted transition-colors"
                        >
                          <div className="h-10 w-10 bg-primary/10 text-primary rounded flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate" title={upload.fileName}>{upload.fileName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{upload.uploadType.replace('_', ' ')}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded-lg text-center bg-card">
              <p className="text-muted-foreground">No request uploads found.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
