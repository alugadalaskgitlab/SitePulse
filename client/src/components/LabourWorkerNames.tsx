import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

let labourRowSequence = 0;
export const newLabourRowKey = () => `labour-new-${++labourRowSequence}`;

type LabourIdentity = { persistedId?: number; editCreationKey?: string };
/** Adopt only the ID of the row actually sent; keep any edits made while saving. */
export function adoptLabourRowIds<T extends LabourIdentity>(
  current: T[], sent: LabourIdentity[], saved: Array<{ id: number }>,
): T[] {
  if (sent.length !== saved.length || saved.some(row => !Number.isSafeInteger(row.id) || row.id <= 0)) {
    throw new Error("Saved labour row identities could not be verified. Reload before saving again.");
  }
  const identity = (row: LabourIdentity) => row.persistedId != null
    ? `saved:${row.persistedId}` : row.editCreationKey != null ? `new:${row.editCreationKey}` : undefined;
  const mapping = new Map<string, number>();
  sent.forEach((row, index) => {
    const key = identity(row);
    if (key == null || mapping.has(key)) throw new Error("Saved labour row identities are ambiguous. Reload before saving again.");
    mapping.set(key, saved[index].id);
  });
  return current.map(row => {
    const key = identity(row);
    const savedId = key == null ? undefined : mapping.get(key);
    return savedId == null ? row : { ...row, persistedId: savedId };
  });
}

/** An omitted list means that an older client has not edited this row's names. */
export function readLabourWorkerNames(row: { workerNames?: unknown; workers?: unknown }): string[] | undefined {
  if (Array.isArray(row.workerNames)) return row.workerNames.filter((name): name is string => typeof name === "string");
  if (Array.isArray(row.workers)) return row.workers.map((worker: any) => worker?.name).filter((name): name is string => typeof name === "string");
  return undefined;
}

export function cleanLabourWorkerNames(names: string[]): string[] {
  return names.map(name => name.trim()).filter(Boolean);
}

export function prepareLabourWorkerRow<T extends { workerNames?: string[]; persistedId?: number; id?: number; editCreationKey?: string }>(row: T): Omit<T, "editCreationKey"> {
  const { editCreationKey: _localKey, ...payload } = row;
  // An untouched NEW row must explicitly have zero names: omission is reserved
  // for identified historical rows whose names this client did not edit.
  if (row.workerNames === undefined) {
    return row.persistedId != null || row.id != null ? payload : { ...payload, workerNames: [] };
  }
  return { ...payload, workerNames: cleanLabourWorkerNames(row.workerNames) };
}

export function LabourWorkerNames({ names, count, onChange, rowIndex }: {
  names?: string[];
  count: number | null;
  onChange: (names: string[]) => void;
  rowIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const existing = names ?? [];
  const filled = cleanLabourWorkerNames(existing).length;
  return (
    <div className="min-w-0" data-testid={`labour-workers-${rowIndex}`}>
      <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-muted-foreground"
        aria-expanded={open} data-testid={`button-labour-workers-${rowIndex}`}
        onClick={() => setOpen(!open)}>
        {filled ? `Worker names (${filled})` : "+ Add worker names"}
      </Button>
      {open && (
        <div className="space-y-2 rounded-md border p-2" data-testid={`labour-workers-editor-${rowIndex}`}>
          {existing.map((name, index) => (
            <div key={index} className="flex min-w-0 gap-2">
              <Input aria-label={`Worker name ${index + 1}`} placeholder="Worker name" value={name}
                data-testid={`input-labour-worker-${rowIndex}-${index}`}
                onChange={event => onChange(existing.map((value, i) => i === index ? event.target.value : value))} />
              <Button type="button" size="icon" variant="ghost" className="h-11 w-11 shrink-0"
                aria-label={`Remove worker name ${index + 1}`}
                data-testid={`button-remove-labour-worker-${rowIndex}-${index}`}
                onClick={() => onChange(existing.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="min-h-11"
            data-testid={`button-add-labour-worker-${rowIndex}`}
            onClick={() => onChange([...existing, ""])}><Plus className="mr-1 h-4 w-4" /> Add name</Button>
        </div>
      )}
      {filled > Number(count ?? 0) && count != null && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400" role="status">
          {filled} names entered; headcount is {count}. Headcount reporting still uses {count}.
        </p>
      )}
    </div>
  );
}

export function LabourWorkerNamesReadOnly({ row }: { row: { workerNames?: unknown; workers?: unknown } }) {
  const names = cleanLabourWorkerNames(readLabourWorkerNames(row) ?? []);
  return names.length ? (
    <div className="mt-1 min-w-0 break-words text-xs font-normal text-muted-foreground" data-testid="labour-worker-names">
      Workers: {names.join(", ")}
    </div>
  ) : null;
}