import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AttachmentModuleType } from "@shared/schema";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED_TYPES = "image/*,application/pdf";

interface AttachmentUploaderProps {
  moduleType: AttachmentModuleType;
  linkedRecordId: number;
  siteId?: number | null;
  boqProjectId?: number | null;
  boqItemId?: number | null;
  structureId?: string | null;
  equipmentId?: number | null;
  materialId?: number | null;
  caption?: string;
  /** Tags the upload as e.g. "challan" | "dc" | "invoice" | "bill" | "receipt" | "photo" | "other",
   * used to compute missing-document indicators in the Draft/Pending Document workflow. */
  docType?: string;
  /** Hide the camera-capture button (e.g. on desktop-only forms). Default true (shown). */
  showCamera?: boolean;
  label?: string;
  className?: string;
  onUploaded?: () => void;
}

/**
 * Reusable attachment capture control backed by the common `attachments`
 * table/API. Do not build module-specific upload UIs — extend moduleType
 * on this component instead so every module shares one storage/permission
 * path (Task #1249).
 */
export function AttachmentUploader({
  moduleType,
  linkedRecordId,
  siteId,
  boqProjectId,
  boqItemId,
  structureId,
  equipmentId,
  materialId,
  caption,
  docType,
  showCamera = true,
  label = "Add Photo",
  className,
  onUploaded,
}: AttachmentUploaderProps) {
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  const [busy, setBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds the 15MB limit.`,
            variant: "destructive",
          });
          continue;
        }
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
          toast({
            title: "Unsupported file type",
            description: `${file.name} must be an image or PDF.`,
            variant: "destructive",
          });
          continue;
        }
        const uploadResponse = await uploadFile(file);
        if (!uploadResponse) {
          toast({ title: "Upload failed", description: file.name, variant: "destructive" });
          continue;
        }
        await apiRequest("POST", "/api/attachments", {
          moduleType,
          linkedRecordId,
          siteId: siteId ?? null,
          boqProjectId: boqProjectId ?? null,
          boqItemId: boqItemId ?? null,
          structureId: structureId ?? null,
          equipmentId: equipmentId ?? null,
          materialId: materialId ?? null,
          fileName: file.name,
          objectPath: uploadResponse.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          caption: caption ?? null,
          docType: docType ?? null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/attachments", moduleType, linkedRecordId] });
      onUploaded?.();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {showCamera && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="input-attachment-camera"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              data-testid="button-attachment-camera"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Camera
            </Button>
          </>
        )}
        <input
          ref={galleryInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          data-testid="input-attachment-gallery"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => galleryInputRef.current?.click()}
          data-testid="button-attachment-gallery"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {label}
        </Button>
      </div>
    </div>
  );
}
