import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSaveIndicatorProps {
  lastSavedAt: Date | null;
  className?: string;
}

const JUST_NOW_THRESHOLD_MS = 5000;
const REFRESH_INTERVAL_MS = 30000;

function formatSavedTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 5) return "Draft saved just now";
  if (diffSecs < 60) return `Draft saved ${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins === 1) return "Draft saved 1 min ago";
  return `Draft saved ${diffMins} mins ago`;
}

export function AutoSaveIndicator({ lastSavedAt, className }: AutoSaveIndicatorProps) {
  const [label, setLabel] = useState<string>("");
  const [isJustNow, setIsJustNow] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;

    setLabel(formatSavedTime(lastSavedAt));
    const isRecent = Date.now() - lastSavedAt.getTime() < JUST_NOW_THRESHOLD_MS;
    setIsJustNow(isRecent);

    const justNowTimer = setTimeout(() => {
      setIsJustNow(false);
      setLabel(formatSavedTime(lastSavedAt));
    }, JUST_NOW_THRESHOLD_MS);

    return () => clearTimeout(justNowTimer);
  }, [lastSavedAt]);

  useEffect(() => {
    if (!lastSavedAt) return;

    const interval = setInterval(() => {
      setLabel(formatSavedTime(lastSavedAt));
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [lastSavedAt]);

  if (!lastSavedAt) return null;

  return (
    <span
      data-testid="autosave-indicator"
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      {isJustNow ? (
        <Check className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
      {label}
    </span>
  );
}
