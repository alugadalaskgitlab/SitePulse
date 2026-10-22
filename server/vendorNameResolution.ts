import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { vendorAliases, vendors } from "../shared/schema";

export type VendorNameMatch = {
  vendorId: number;
  canonicalName: string;
  variants: string[];
};

const nameKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Resolve only a unique Vendor Master. Free-text values that are unknown or
 * ambiguous remain unresolved, so callers can preserve their old exact-text
 * behavior. Alias records point to the canonical Vendor Master name.
 */
export async function resolveVendorNameMatch(
  value: string | null | undefined,
  executor: any = db,
): Promise<VendorNameMatch | null> {
  const key = nameKey(value);
  if (!key) return null;

  const [masters, aliases] = await Promise.all([
    executor.select({ id: vendors.id, name: vendors.name }).from(vendors),
    executor.select({ canonicalName: vendorAliases.canonicalName, alias: vendorAliases.alias }).from(vendorAliases),
  ]);

  const canonicalKeys = new Set<string>();
  for (const master of masters) {
    if (nameKey(master.name) === key) canonicalKeys.add(nameKey(master.name));
  }
  for (const alias of aliases) {
    if (nameKey(alias.alias) === key || nameKey(alias.canonicalName) === key) {
      canonicalKeys.add(nameKey(alias.canonicalName));
    }
  }

  const matchingMasters = masters.filter((master: { id: number; name: string }) => canonicalKeys.has(nameKey(master.name)));
  const uniqueIds = new Set(matchingMasters.map((master: { id: number }) => Number(master.id)));
  if (uniqueIds.size !== 1) return null;

  const master = matchingMasters[0];
  const canonicalKey = nameKey(master.name);
  const variants = new Set<string>([key, canonicalKey]);
  for (const alias of aliases) {
    if (nameKey(alias.canonicalName) === canonicalKey) variants.add(nameKey(alias.alias));
  }
  return { vendorId: Number(master.id), canonicalName: master.name, variants: Array.from(variants) };
}

/**
 * Match either the confirmed vendor ID or a saved vendor/supplier spelling in
 * the resolved alias family. Callers keep their existing exact predicate when
 * this resolver returns null.
 */
export function vendorNameIdentityCondition(
  nameColumn: any,
  vendorIdColumn: any,
  match: VendorNameMatch,
) {
  const variants = match.variants.map(nameKey).filter(Boolean);
  const textMatch = variants.length
    ? sql`UPPER(TRIM(${nameColumn})) IN (${sql.join(variants.map(value => sql`${value}`), sql`, `)})`
    : sql`false`;
  return sql`(${vendorIdColumn} = ${match.vendorId} OR (${vendorIdColumn} IS NULL AND ${textMatch}))`;
}

export async function currentVendorNamesByIds(
  ids: Array<number | null | undefined>,
  executor: any = db,
): Promise<Map<number, string>> {
  const uniqueIds = Array.from(new Set(ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)));
  if (!uniqueIds.length) return new Map();
  const rows = await executor.select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(inArray(vendors.id, uniqueIds));
  return new Map(rows.map((row: { id: number; name: string }) => [Number(row.id), row.name]));
}

export async function resolveVendorNameMatchById(
  vendorId: number,
  executor: any = db,
): Promise<{ id: number; name: string } | null> {
  const [row] = await executor.select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.isActive, true)))
    .limit(1);
  return row ? { id: Number(row.id), name: row.name } : null;
}
