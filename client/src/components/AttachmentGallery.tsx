import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, FileText, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Attachment, AttachmentModuleType } from "@shared/schema";

interface AttachmentGalleryProps {
  moduleType: AttachmentModuleType;
  linkedRecordId: number;
  /** Allow deleting attachments from this gallery. Default true. */
  allowDelete?: boolean;
  emptyText?: string;
  className?: string;
}

/**
 * Reusable attachment display grid backed by the common `attachments`
 * table/API — pairs with AttachmentUploader. Do not build per-module
 * gallery components (Task #1249).
 */
export function AttachmentGallery({
  moduleType,
  linkedRecordId,
  allowDelete = true,
  emptyText = "No attachments yet.",
  className,
}: AttachmentGalleryProps) {
  const { toast } = useToast();
  const { data: items, isLoading } = useQuery<Attachment[]>({
    queryKey: ["/api/attachments", moduleType, linkedRecordId],
    enabled: Number.isFinite(linkedRecordId) && linkedRecordId > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attachments", moduleType, linkedRecordId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete attachment", description: err?.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading attachments…
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="text-no-attachments">{emptyText}</p>;
  }

  return (
    <div className={className ?? "grid grid-cols-3 sm:grid-cols-4 gap-2"}>
      {items.map((att) => {
        const isImage = (att.mimeType || "").startsWith("image/");
        return (
          <div
            key={att.id}
            className="relative group border rounded-md overflow-hidden bg-muted aspect-square"
            data-testid={`card-attachment-${att.id}`}
          >
            <a href={att.objectPath} target="_blank" rel="noreferrer" className="block h-full w-full">
              {isImage ? (
                <img
                  src={att.objectPath}
                  alt={att.caption || att.fileName}
                  className="h-full w-full object-cover"
                  data-testid={`img-attachment-${att.id}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full w-full gap-1 p-2 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs truncate w-full">{att.fileName}</span>
                </div>
              )}
            </a>
            {allowDelete && (
              <button
                type="button"
                className="absolute top-1 right-1 bg-background/90 rounded-full p-1 opacity-80 hover:opacity-100"
                onClick={() => deleteMutation.mutate(att.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-attachment-${att.id}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
