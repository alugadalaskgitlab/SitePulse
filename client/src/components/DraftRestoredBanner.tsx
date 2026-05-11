import { RotateCcw, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

interface DraftRestoredBannerProps {
  show: boolean;
  draftSavedAt: Date | null;
  onDismiss: () => void;
  onDiscard?: () => void;
  discardLabel?: string;
}

/**
 * DraftRestoredBanner — amber alert shown when useFormDraft restores a saved draft.
 *
 * Usage:
 *   const [draftRestored, setDraftRestored] = useState(false);
 *   const { clearDraft, wasRestoredRef, draftSavedAt } = useFormDraft(..., (data) => {
 *     // populate form fields from data
 *     setDraftRestored(true);
 *   }, ...);
 *
 *   // Auto-dismiss after 8 seconds (optional):
 *   useEffect(() => {
 *     if (!draftRestored) return;
 *     const t = setTimeout(() => setDraftRestored(false), 8000);
 *     return () => clearTimeout(t);
 *   }, [draftRestored]);
 *
 *   <DraftRestoredBanner
 *     show={draftRestored}
 *     draftSavedAt={draftSavedAt}
 *     onDismiss={() => setDraftRestored(false)}
 *     onDiscard={() => { clearDraft(); setDraftRestored(false); resetForm(); }}
 *   />
 */
export function DraftRestoredBanner({
  show,
  draftSavedAt,
  onDismiss,
  onDiscard,
  discardLabel = "Discard draft",
}: DraftRestoredBannerProps) {
  if (!show) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 text-sm"
      data-testid="banner-draft-restored"
    >
      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1 text-amber-800 dark:text-amber-200">
        Draft restored{draftSavedAt ? ` from ${formatDistanceToNow(draftSavedAt, { addSuffix: true })}` : ""} — your unsaved changes have been recovered. Save to keep them{onDiscard ? ", or discard to start fresh" : ""}.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {onDiscard && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70"
            onClick={onDiscard}
            data-testid="button-discard-draft"
          >
            {discardLabel}
          </Button>
        )}
        <button
          className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
          onClick={onDismiss}
          aria-label="Dismiss"
          data-testid="button-dismiss-draft-banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
