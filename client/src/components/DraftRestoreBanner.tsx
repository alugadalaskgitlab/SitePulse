import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Save, X, RotateCcw } from "lucide-react";

interface DraftRestoreBannerProps {
  draftAge: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRestoreBanner({ draftAge, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-900/20">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Save className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Unsaved draft found
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Last saved {draftAge}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={onDiscard}
              className="flex-1 sm:flex-none gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              data-testid="button-discard-draft"
            >
              <X className="w-4 h-4" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={onRestore}
              className="flex-1 sm:flex-none gap-1 bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-restore-draft"
            >
              <RotateCcw className="w-4 h-4" />
              Restore
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
