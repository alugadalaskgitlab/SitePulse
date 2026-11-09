import { and, eq } from "drizzle-orm";
import { appSettings, snlItems, snlSources } from "@shared/schema";
import {
  DEFAULT_NORM_BOOK_CODE,
  MORTH_SDB_DISPLAY_NAME,
  MORTH_SDB_SOURCE_CODE,
  NORM_BOOK_SETTING_KEY,
} from "@shared/normBook";
import { db } from "./db";

export async function getNormBookState() {
  const [setting] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, NORM_BOOK_SETTING_KEY))
    .limit(1);
  const code = setting?.value || DEFAULT_NORM_BOOK_CODE;
  const [source] = await db.select({
    id: snlSources.id,
    code: snlSources.code,
    name: snlSources.name,
  }).from(snlSources).where(and(eq(snlSources.code, code), eq(snlSources.isActive, true))).limit(1);
  return {
    code,
    sourceId: source?.id ?? null,
    name: code === MORTH_SDB_SOURCE_CODE ? MORTH_SDB_DISPLAY_NAME : source?.name ?? code,
  };
}

export async function getNormBookSourceId(): Promise<number | null> {
  return (await getNormBookState()).sourceId;
}

export async function isSnlItemInNormBook(snlItemId: number): Promise<boolean> {
  const [row] = await db.select({ id: snlItems.id })
    .from(snlItems)
    .innerJoin(snlSources, eq(snlSources.id, snlItems.sourceId))
    .where(and(
      eq(snlItems.id, snlItemId),
      eq(snlItems.isActive, true),
      eq(snlSources.isActive, true),
      eq(snlSources.code, (await getNormBookState()).code),
    ))
    .limit(1);
  return !!row;
}

export async function isSnlItemFromActiveSource(snlItemId: number): Promise<boolean> {
  const [row] = await db.select({ id: snlItems.id })
    .from(snlItems)
    .innerJoin(snlSources, eq(snlSources.id, snlItems.sourceId))
    .where(and(
      eq(snlItems.id, snlItemId),
      eq(snlItems.isActive, true),
      eq(snlSources.isActive, true),
    ))
    .limit(1);
  return !!row;
}

export async function isSnlItemFromSourceCode(snlItemId: number, sourceCode: string): Promise<boolean> {
  const [row] = await db.select({ id: snlItems.id })
    .from(snlItems)
    .innerJoin(snlSources, eq(snlSources.id, snlItems.sourceId))
    .where(and(
      eq(snlItems.id, snlItemId),
      eq(snlItems.isActive, true),
      eq(snlSources.isActive, true),
      eq(snlSources.code, sourceCode),
    ))
    .limit(1);
  return !!row;
}
