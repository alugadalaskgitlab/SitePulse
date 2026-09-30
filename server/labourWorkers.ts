import { eq, inArray } from "drizzle-orm";
import { labourLogs, labourLogWorkers } from "../shared/schema";

export function cleanWorkerNames(names: unknown): string[] | undefined {
  if (names === undefined) return undefined;
  if (!Array.isArray(names) || names.some(name => typeof name !== "string")) {
    throw Object.assign(new Error("Worker names must be a list of text names."), { status: 422 });
  }
  return names.map(name => name.trim()).filter(Boolean);
}

export async function readWorkerNames(tx: any, rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const workers = await tx.select().from(labourLogWorkers)
    .where(inArray(labourLogWorkers.labourLogId, rows.map(row => row.id)))
    .orderBy(labourLogWorkers.id);
  const names = new Map<number, string[]>();
  for (const worker of workers) {
    const current = names.get(worker.labourLogId) ?? [];
    current.push(worker.name);
    names.set(worker.labourLogId, current);
  }
  return rows.map(row => ({ ...row, workerNames: names.get(row.id) ?? [] }));
}

/** Replacing DPR parents must remap children by an explicit saved row identity. */
export async function insertLabourWithWorkers(tx: any, dprId: number, inputs: any[], oldRows: any[] = []): Promise<any[]> {
  if (!inputs.length) return [];
  const oldById = new Map(oldRows.map(row => [row.id, row]));
  const used = new Set<number>();
  const names = inputs.map(input => {
    const explicit = cleanWorkerNames(input.workerNames);
    const key = input.persistedId ?? input.id;
    if (key != null && oldRows.length && !oldById.has(key)) {
      throw Object.assign(new Error("A saved labour row no longer belongs to this DPR."), { status: 409 });
    }
    if (key != null && used.has(key)) throw Object.assign(new Error("Duplicate saved labour row reference."), { status: 409 });
    if (key != null) used.add(key);
    return explicit ?? (key != null ? oldById.get(key)?.workerNames ?? [] : []);
  });
  // An unidentified legacy row cannot safely inherit a named row's children.
  // Refuse ambiguous replacement rather than assigning names by position or category.
  if (oldRows.some(row => row.workerNames?.length && !used.has(row.id)) &&
      inputs.some(input => input.workerNames === undefined && input.persistedId == null && input.id == null)) {
    throw Object.assign(new Error("Reload saved labour row identities before replacing named labour rows."), { status: 409 });
  }
  const values = inputs.map(({ workerNames: _workers, persistedId: _persisted, id: _id, dprId: _dpr, ...row }) =>
    ({ ...row, dprId }));
  const inserted = await tx.insert(labourLogs).values(values).returning();
  const children = inserted.flatMap((row: any, index: number) =>
    names[index].map((name: string) => ({ labourLogId: row.id, name })));
  if (children.length) await tx.insert(labourLogWorkers).values(children);
  return inserted;
}

export async function replaceLabourWorkers(tx: any, rows: any[], inputs: any[]): Promise<void> {
  for (let index = 0; index < rows.length; index++) {
    const names = cleanWorkerNames(inputs[index].workerNames);
    if (names === undefined) continue; // Legacy client: no child intent.
    await tx.delete(labourLogWorkers).where(eq(labourLogWorkers.labourLogId, rows[index].id));
    if (names.length) await tx.insert(labourLogWorkers).values(names.map(name => ({
      labourLogId: rows[index].id, name,
    })));
  }
}