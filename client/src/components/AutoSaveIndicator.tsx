import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSaveIndicatorProps {
  lastSavedAt: Date | null;
  className?: string;
}

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
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;

    setLabel(formatSavedTime(lastSavedAt));
    setVisible(true);
    setFadeOut(false);

    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 4000);

    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 4600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [lastSavedAt]);

  if (!visible) return null;

  return (
    <span
      data-testid="autosave-indicator"
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground transition-opacity duration-500",
        fadeOut ? "opacity-0" : "opacity-100",
        className
      )}
    >
      <Check className="w-3 h-3 text-green-500 shrink-0" />
      {label}
    </span>
  );
}
