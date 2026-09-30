import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function resolveEquipmentRemovalIndex<T, I>(rows: readonly T[], identity: I, getIdentity: (row: T) => I): number {
  if (identity == null || rows.length <= 1) return -1;
  return rows.findIndex(row => getIdentity(row) === identity);
}

/** Only a committed, exactly-one-row removal may shift index-based auxiliary UI state. */
export function committedEquipmentRemovalIndex<T, I>(
  before: readonly T[], after: readonly T[], identity: I, getIdentity: (row: T) => I,
): number {
  const index = resolveEquipmentRemovalIndex(before, identity, getIdentity);
  if (index < 0 || before.length !== after.length + 1) return -1;
  return before.every((row, i) => i === index || getIdentity(row) === getIdentity(after[i < index ? i : i - 1]))
    ? index : -1;
}

/** Confirmation belongs to a row identity, never to its current list position. */
export function EquipmentRowRemove({ identity, label, disabled, onRemove, index, children }: {
  identity: symbol | string | number | undefined;
  label: string;
  disabled: boolean;
  onRemove: () => void;
  index: number;
  children: (controls: { action: ReactNode; prompt: ReactNode; dismiss: () => void }) => ReactNode;
}) {
  const [confirmingIdentity, setConfirmingIdentity] = useState<typeof identity>(undefined);
  const confirming = identity != null && confirmingIdentity === identity;
  useEffect(() => {
    if (!confirming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmingIdentity(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  const action = <Button type="button" size="icon" variant="ghost"
    aria-label={`Remove ${label}`} aria-expanded={confirming}
    onClick={event => { event.stopPropagation(); if (!disabled) setConfirmingIdentity(identity); }}
    disabled={disabled} className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
    data-testid={`button-remove-equipment-${index}`}>
    <Trash2 className="h-4 w-4" />
  </Button>;
  const prompt = confirming && !disabled && <div role="group" aria-label={`Remove ${label}?`}
    className="grid grid-cols-2 items-center gap-2 border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-sm sm:flex sm:flex-wrap"
    data-testid={`confirm-remove-equipment-${index}`}>
    <span className="col-span-2 min-w-0 break-words sm:flex-1">Remove {label} row?</span>
    <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto"
      onClick={event => { event.stopPropagation(); setConfirmingIdentity(undefined); }}>Cancel</Button>
    <Button type="button" variant="destructive" className="min-h-11 w-full sm:w-auto"
      onClick={event => { event.stopPropagation(); setConfirmingIdentity(undefined); onRemove(); }}>Remove row</Button>
  </div>;
  return <>{children({ action, prompt, dismiss: () => setConfirmingIdentity(undefined) })}</>;
}