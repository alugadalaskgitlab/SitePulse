/**
 * Task #1409 — DPR photos grouped by activity.
 *
 * dpr_progress attachments may carry a progressEntryKey linking them to a
 * specific progress row (Guided DPR per-activity photos). This component does
 * ONE fetch (same query key as AttachmentGallery, so caches are shared) and
 * renders a section per activity that has photos, then the general
 * DPR-level photos (legacy + deliberate site-wide shots).
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { groupDprPhotos } from "@shared/dprPhotos";
import { AttachmentGrid } from "@/components/AttachmentGallery";
import type { Attachment } from "@shared/schema";

type ProgressRowLike = {
  entryKey?: string | null;
  activity?: string | null;
  side?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
};

export function DprPhotoGroups({
  dprId,
  progress,
  allowDelete = false,
  emptyText = "No photos attached to this report.",
}: {
  dprId: number;
  progress: ProgressRowLike[];
  allowDelete?: boolean;
  emptyText?: string;
}) {
  const { data: items, isLoading } = useQuery<Attachment[]>({
    queryKey: ["/api/attachments", "dpr_progress", dprId],
    queryFn: async () => {
      const params = new URLSearchParams({ moduleType: "dpr_progress", linkedRecordId: String(dprId) });
      const res = await apiRequest("GET", `/api/attachments?${params.toString()}`);
      return res.json();
    },
    enabled: Number.isFinite(dprId) && dprId > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
      </div>
    );
  }
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="text-no-attachments">{emptyText}</p>;
  }

  const { general, byEntryKey } = groupDprPhotos(items);
  const rowLabel = (p: ProgressRowLike) => {
    const ch = p.chainageFrom && p.chainageTo ? ` · Ch ${p.chainageFrom}–${p.chainageTo}` : "";
    return `${p.activity ?? "Activity"}${p.side ? ` · ${p.side}` : ""}${ch}`;
  };
  // Keyed photos whose progress row no longer exists (row deleted after
  // upload) still show, under an "Other activity photos" heading.
  const knownKeys = new Set((progress ?? []).map((p) => p.entryKey).filter(Boolean) as string[]);
  const orphaned = Array.from(byEntryKey.entries()).filter(([k]) => !knownKeys.has(k)).flatMap(([, v]) => v);

  return (
    <div className="space-y-4">
      {(progress ?? []).map((p, i) => {
        const key = p.entryKey ?? "";
        const photos = key ? byEntryKey.get(key) : undefined;
        if (!photos || photos.length === 0) return null;
        return (
          <div key={key || i} data-testid={`photo-group-${i}`}>
            <p className="text-sm font-medium mb-1.5">{rowLabel(p)}</p>
            <AttachmentGrid items={photos} allowDelete={allowDelete} moduleType="dpr_progress" linkedRecordId={dprId} />
          </div>
        );
      })}
      {orphaned.length > 0 && (
        <div data-testid="photo-group-orphaned">
          <p className="text-sm font-medium mb-1.5">Other activity photos</p>
          <AttachmentGrid items={orphaned} allowDelete={allowDelete} moduleType="dpr_progress" linkedRecordId={dprId} />
        </div>
      )}
      {general.length > 0 && (
        <div data-testid="photo-group-general">
          {(byEntryKey.size > 0) && <p className="text-sm font-medium mb-1.5">General site photos</p>}
          <AttachmentGrid items={general} allowDelete={allowDelete} moduleType="dpr_progress" linkedRecordId={dprId} />
        </div>
      )}
    </div>
  );
}
