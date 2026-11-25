import { and, eq, notInArray, sql } from "drizzle-orm";
import { levelSheetDesignRows } from "@shared/schema";
import { designChainageKey } from "@shared/levelSheets";

/** One transaction, bounded batches and one audit event per layer. No startup work. */
export async function saveLevelDesignImport(database: any, req: any, siteId: number,
  layers: Array<{ layerName: string; rows: any[]; skippedChainages?: number[] }>, replace: boolean, audit: any, authorizeOverwrite: () => boolean) {
  return database.transaction(async (tx: any) => {
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(7603, ${siteId}) AS locked`);
    if (!lock.rows?.[0]?.locked) throw Object.assign(new Error("An import is already running for this site. Try again when it finishes."), { status: 409 });
    const imported: any[] = [];
    const skipped: number[] = [];
    const summaries: any[] = [];
    for (const layer of layers) {
      const predicate = and(eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, layer.layerName));
      const old = await tx.select().from(levelSheetDesignRows).where(predicate);
      const byChainage = new Map(old.map((row: any) => [designChainageKey(row.chainageOursKm), row]));
      const chosen = layer.rows.filter(row => {
        if (!replace && (byChainage.get(designChainageKey(row.chainageOursKm)) as any)?.source === "TYPED") { skipped.push(row.chainageOursKm); return false; }
        return true;
      });
      if ((replace || chosen.some(row => byChainage.has(designChainageKey(row.chainageOursKm)))) && !authorizeOverwrite()) {
        throw Object.assign(new Error("You do not have permission to replace design rows."), { status: 403 });
      }
      if (replace && chosen.length) await tx.delete(levelSheetDesignRows).where(layer.skippedChainages?.length
        ? and(predicate, notInArray(levelSheetDesignRows.chainageOursKm, layer.skippedChainages)) : predicate);
      const savedRows: any[] = [];
      for (let start = 0; start < chosen.length; start += 500) {
        const batch = chosen.slice(start, start + 500).map(row => ({
          ...row, siteId, layerName: layer.layerName, source: "EXCEL",
          createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id,
        }));
        const saved = await tx.insert(levelSheetDesignRows).values(batch).onConflictDoUpdate({
          target: [levelSheetDesignRows.siteId, levelSheetDesignRows.layerName, levelSheetDesignRows.chainageOursKm],
          set: {
            centreLevel: sql`excluded.centre_level`, crossfallLeftPct: sql`excluded.crossfall_left_pct`,
            crossfallRightPct: sql`excluded.crossfall_right_pct`, topWidthLeftM: sql`excluded.top_width_left_m`,
            topWidthRightM: sql`excluded.top_width_right_m`, updatedByUserId: req.authUser.id, updatedAt: new Date(),
          },
        }).returning();
        if (saved.length !== batch.length) throw new Error("Some design rows were not saved. Nothing was imported.");
        savedRows.push(...saved);
      }
      const chainages = chosen.map(row => row.chainageOursKm);
      const summary = { layerName: layer.layerName, count: savedRows.length, fromKm: chainages.length ? Math.min(...chainages) : null,
        toKm: chainages.length ? Math.max(...chainages) : null, fileName: String(req.body.fileName ?? "").slice(0, 255) };
      await audit(tx, req, siteId, "design_layer_import", { count: old.length }, { ...summary, replace });
      imported.push(...savedRows); summaries.push(summary);
    }
    return { imported, skipped, layers: summaries };
  });
}
