import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { snlItems, snlRememberedLinks, users } from "@shared/schema";

export type RememberedSnlLink = {
  id: number;
  normalizedBoqWording: string;
  displayBoqWording: string;
  snlItemId: number;
  itemCode: string;
  itemTitle: string;
  unit: string;
  confirmedBy: string | null;
  confirmedAt: Date;
  createdAt: Date;
};

export function normalizeRememberedBoqWording(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bwmm\b/g, "wet mix macadam")
    .replace(/\bgsb\b/g, "granular sub base")
    .replace(/\b(?:dgbm|dbm)\b/g, "dense graded bituminous macadam")
    .replace(/\bbc\b/g, "bituminous concrete")
    .replace(/\bpcc\b/g, "plain cement concrete")
    .replace(/\b(?:chainage|ch\.?)\s*[:#-]?\s*\d+(?:\/\d+)*(?:\.\d+)?\s*(?:to|[-–—])\s*\d+(?:\/\d+)*(?:\.\d+)?\b/gi, " ")
    .replace(/\b(?:boq\s*)?(?:qty|quantity)\s*[:#=-]?\s*[\d,]+(?:\.\d+)?(?:\s*[a-z]+)?\b/gi, " ")
    .replace(/\bsl\.?\s*no\.?\s*[:#.-]?\s*\d+(?:\.\d+)*(?:-[a-z0-9]+)?\b/gi, " ")
    .replace(/\b(?:sl|serial|item)\s*(?:no\.?|number|#)?\s*[:#.-]?\s*\d+(?:\.\d+)*(?:-[a-z0-9]+)?\b/gi, " ")
    .replace(/^\s*\d+(?:\.\d+)+(?:-[a-z0-9]+)*\s*[-:.)]?\s*/, "")
    .replace(/\b[\d,]+(?:\.\d+)?\s*(?:cum|cu\.?\s*m|sqm|sq\.?\s*m|m3|mt|kg|kl|lit(?:re|er)s?|l|hours?|hr|days?|nos|each|km|metres?|meters?)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSimilarity(left: string, right: string): number {
  const a = new Set(normalizeRememberedBoqWording(left).split(" ").filter(Boolean));
  const b = new Set(normalizeRememberedBoqWording(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of Array.from(a)) if (b.has(token)) shared++;
  return shared / new Set([...Array.from(a), ...Array.from(b)]).size;
}

export function matchRememberedSnlLinks(
  wording: string,
  records: RememberedSnlLink[],
  minimumSimilarity = 0.8,
): RememberedSnlLink[] {
  const normalized = normalizeRememberedBoqWording(wording);
  if (!normalized) return [];
  const scored = records
    .map(record => ({
      record,
      score: record.normalizedBoqWording === normalized
        ? 1
        : wordSimilarity(normalized, record.normalizedBoqWording),
    }))
    .filter(entry => entry.score >= minimumSimilarity)
    .sort((a, b) => b.score - a.score || a.record.id - b.record.id);
  if (!scored.length) return [];
  const best = scored[0].score;
  const seenTargets = new Set<number>();
  const matches: RememberedSnlLink[] = [];
  for (const entry of scored.filter(row => Math.abs(row.score - best) < 0.001)) {
    if (seenTargets.has(entry.record.snlItemId)) continue;
    seenTargets.add(entry.record.snlItemId);
    matches.push(entry.record);
  }
  return matches;
}

export async function getRememberedSnlLinks(sourceId: number): Promise<RememberedSnlLink[]> {
  const rows = await db
    .select({
      id: snlRememberedLinks.id,
      normalizedBoqWording: snlRememberedLinks.normalizedBoqWording,
      displayBoqWording: snlRememberedLinks.displayBoqWording,
      snlItemId: snlRememberedLinks.snlItemId,
      itemCode: snlItems.itemCode,
      itemTitle: snlItems.description,
      unit: snlItems.unit,
      confirmedBy: users.fullName,
      confirmedAt: snlRememberedLinks.confirmedAt,
      createdAt: snlRememberedLinks.createdAt,
    })
    .from(snlRememberedLinks)
    .innerJoin(snlItems, eq(snlItems.id, snlRememberedLinks.snlItemId))
    .leftJoin(users, eq(users.id, snlRememberedLinks.confirmedByUserId))
    .where(and(eq(snlItems.sourceId, sourceId), eq(snlItems.isActive, true)))
    .orderBy(desc(snlRememberedLinks.confirmedAt));
  return rows;
}

export async function rememberSnlLink(input: {
  wording: string;
  snlItemId: number;
  confirmedByUserId: number | null;
}): Promise<void> {
  const displayBoqWording = input.wording.trim().replace(/\s+/g, " ");
  const normalizedBoqWording = normalizeRememberedBoqWording(displayBoqWording);
  if (!normalizedBoqWording) return;
  await db.insert(snlRememberedLinks).values({
    normalizedBoqWording,
    displayBoqWording,
    snlItemId: input.snlItemId,
    confirmedByUserId: input.confirmedByUserId,
    confirmedAt: new Date(),
  }).onConflictDoUpdate({
    target: [snlRememberedLinks.normalizedBoqWording, snlRememberedLinks.snlItemId],
    set: {
      displayBoqWording,
      confirmedByUserId: input.confirmedByUserId,
      confirmedAt: new Date(),
    },
  });
}

export async function removeRememberedSnlLink(id: number): Promise<boolean> {
  const removed = await db.delete(snlRememberedLinks)
    .where(eq(snlRememberedLinks.id, id))
    .returning({ id: snlRememberedLinks.id });
  return removed.length > 0;
}
