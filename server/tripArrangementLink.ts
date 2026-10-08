import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { siteMaterialTrips, earthworkArrangements, boqProjects, sites, auditLogs } from "../shared/schema";
import { bulkTripConditions } from "./siteMaterialTripFilters";
import type { BulkTripArrangementInput } from "../shared/tripArrangementLink";
import { canLinkTripArrangement } from "../shared/tripArrangementLink";

const siteMatch = (name: string) => sql`UPPER(TRIM(${sites.name})) = ${name.trim().toUpperCase()}`;
export async function tripArrangementOptions(site: string) {
  return db.select({
    id: earthworkArrangements.id, agencyName: earthworkArrangements.agencyName,
    materialLabel: earthworkArrangements.materialLabel, reachLabel: earthworkArrangements.reachLabel,
    chainageFrom: earthworkArrangements.chainageFrom, chainageTo: earthworkArrangements.chainageTo,
    projectName: boqProjects.name,
    status: earthworkArrangements.status, revisionHistory: earthworkArrangements.revisionHistory,
  }).from(earthworkArrangements)
    .innerJoin(boqProjects, eq(boqProjects.id, earthworkArrangements.boqProjectId))
    .innerJoin(sites, eq(sites.id, boqProjects.siteId)).where(siteMatch(site));
}

type Actor = { userId: number; userName: string; userRole?: string | null };
/** Preview and write deliberately share the entire selection, including locks.
 * A changed set/old link invalidates the confirmation rather than widening it.
 */
export async function bulkLinkTripArrangement(
  input: BulkTripArrangementInput & { permittedSiteNames?: string[] },
  actor?: Actor,
) {
  return db.transaction(async tx => {
    const [arrangement] = await tx.select({ id: earthworkArrangements.id, status: earthworkArrangements.status, revisionHistory: earthworkArrangements.revisionHistory })
      .from(earthworkArrangements)
      .innerJoin(boqProjects, eq(boqProjects.id, earthworkArrangements.boqProjectId))
      .innerJoin(sites, eq(sites.id, boqProjects.siteId))
      .where(and(eq(earthworkArrangements.id, input.earthworkArrangementId), siteMatch(input.site)))
      .for("share", { of: earthworkArrangements });
    if (!arrangement) throw Object.assign(new Error("Choose an arrangement from this site's BOQ project."), {status:400});
    const matched = await tx.select({
      id: siteMaterialTrips.id, previous: siteMaterialTrips.earthworkArrangementId, date: siteMaterialTrips.date,
    }).from(siteMaterialTrips).where(and(...bulkTripConditions(input, true)))
      .orderBy(siteMaterialTrips.id).for("update");
    const candidates = matched.filter(row =>
      row.previous !== input.earthworkArrangementId &&
      (!(input.onlyUnlinked || input.onlyWithoutArrangement) || row.previous == null));
    const selected = candidates.filter(row => canLinkTripArrangement(arrangement, row.date));
    const excludedCount = candidates.length - selected.length;
    const preview = {
      excludedCount,
      exclusionMessage: excludedCount ? `${excludedCount} trips excluded: the arrangement was not commercially valid on their trip dates. Their links remain unchanged.` : "",
      eligibleCount: selected.length,
      overwriteCount: selected.filter(row => row.previous != null).length,
      alreadyLinkedCount: matched.filter(row => row.previous != null).length,
      previewToken: createHash("sha256").update(JSON.stringify({
        ...input, previewToken: undefined, selected, candidates, arrangement,
      })).digest("hex"),
    };
    if (!actor) return preview;
    if (!selected.length && excludedCount) throw Object.assign(new Error(preview.exclusionMessage + " Nothing was changed."), {status:400, code:"ARRANGEMENT_NOT_VALID_ON_TRIP_DATE"});
    if (!selected.length) throw Object.assign(new Error("No trips match these filters and linking options. Nothing was changed."), {status:409, code:"NO_MATCHING_TRIPS"});
    if (input.previewToken !== preview.previewToken) throw Object.assign(new Error("The eligible trips changed. Review the refreshed count and confirm again."), {status:409, code:"TRIP_SELECTION_CHANGED"});
    await tx.update(siteMaterialTrips).set({earthworkArrangementId: input.earthworkArrangementId})
      .where(inArray(siteMaterialTrips.id, selected.map(row => row.id)));
    await tx.insert(auditLogs).values(selected.map(row => ({
      module: "site_material_trips", transactionId: row.id, action: "edit",
      ...actor, oldValues: {earthworkArrangementId: row.previous},
      newValues: {earthworkArrangementId: input.earthworkArrangementId},
      reason: "Explicit bulk arrangement link",
    })));
    return {...preview, updatedCount: selected.length};
  });
}
