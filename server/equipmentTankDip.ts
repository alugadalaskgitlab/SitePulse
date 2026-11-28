import { eq, sql } from "drizzle-orm";
import { equipmentMaster, auditLogs } from "@shared/schema";
import { equipmentFillingRate } from "@shared/equipmentTankDip";

export async function useEquipmentFillingRate(tx: any, id: number, reading: unknown, actor: {
  id: number; fullName: string; isOwner: boolean;
}) {
  if (!actor.isOwner) throw Object.assign(new Error("Only the Owner can use this figure."), { status: 403 });
  const rate = equipmentFillingRate(reading);
  const [before] = await tx.select({ id: equipmentMaster.id, dipLitersPerCm: equipmentMaster.dipLitersPerCm })
    .from(equipmentMaster).where(eq(equipmentMaster.id, id)).for("update");
  if (!before) throw Object.assign(new Error("Equipment not found"), { status: 404 });
  const [saved] = await tx.update(equipmentMaster).set({ dipLitersPerCm: rate }).where(eq(equipmentMaster.id, id))
    .returning({ id: equipmentMaster.id, dipLitersPerCm: equipmentMaster.dipLitersPerCm });
  if (!saved) throw new Error("Equipment calibration was not updated.");
  await tx.insert(auditLogs).values({
    module: "equipment_master", transactionId: id, action: "DIP_CALIBRATION",
    userId: actor.id, userName: actor.fullName, userRole: "owner",
    reason: "Owner used the filling-check figure", oldValues: { dipLitersPerCm: before.dipLitersPerCm },
    newValues: { dipLitersPerCm: saved.dipLitersPerCm, fillingCheck: reading },
  });
  return saved;
}

/** Read-only physical dip continuity; never infer a dip from a calculated closing. */
export async function lastEquipmentDieselDip(executor: any, input: {
  equipmentId: number; equipmentName: string; beforeDate: string;
  site?: string; plant?: string; permittedSites: string[] | null;
  excludeSource?: string; excludeId?: number;
}) {
  const { equipmentId, equipmentName, beforeDate, site, plant, permittedSites, excludeSource = "", excludeId = 0 } = input;
  const sites = permittedSites == null ? null : JSON.stringify(permittedSites);
  const result = await executor.execute(sql`
    SELECT cm, litres, date FROM (
      SELECT u.closing_dip_cm AS cm, COALESCE(u.diesel_balance_in_tank, u.closing_diesel) AS litres,
        u.date::text AS date, u.created_at AS recorded_at, u.id
      FROM equipment_usage u
      WHERE u.equipment_id = ${equipmentId} AND u.closing_dip_cm IS NOT NULL
        AND u.date <= ${beforeDate}::date
        AND (${site ?? null}::text IS NULL OR lower(u.destination_site) = lower(${site ?? null}) OR lower(u.site_name) = lower(${site ?? null}))
        AND (${plant ?? null}::text IS NULL OR u.plant_name = ${plant ?? null})
        AND (${sites}::jsonb IS NULL OR COALESCE(u.destination_site, u.site_name) IN (SELECT jsonb_array_elements_text(${sites}::jsonb)))
        AND NOT (${excludeSource} = 'usage' AND u.id = ${excludeId})
        AND NOT (${excludeSource} = 'heating' AND COALESCE(u.source_heating_session_id, 0) = ${excludeId})
      UNION ALL
      SELECT e.closing_dip_cm, e.diesel_balance_in_tank, d.date::text, d.created_at, e.id
      FROM equipment_logs e JOIN dprs d ON d.id = e.dpr_id
      WHERE e.equipment_id = ${equipmentId} AND e.closing_dip_cm IS NOT NULL
        AND d.date <= ${beforeDate}::date AND d.dpr_status <> 'draft'
        AND NOT COALESCE(d.is_deleted, false) AND NOT COALESCE(d.is_superseded, false)
        AND (${site ?? null}::text IS NULL OR lower(d.site) = lower(${site ?? null}))
        AND (${plant ?? null}::text IS NULL)
        AND (${sites}::jsonb IS NULL OR d.site IN (SELECT jsonb_array_elements_text(${sites}::jsonb)))
        AND NOT (${excludeSource} = 'dpr' AND e.id = ${excludeId})
      UNION ALL
      SELECT g.closing_dip_cm, g.closing_diesel, g.date::text, g.created_at, g.id
      FROM generator_logs g
      WHERE lower(trim(g.generator_name)) = lower(trim(${equipmentName}))
        AND g.closing_dip_cm IS NOT NULL AND g.date <= ${beforeDate}::date
        AND ${site ?? null}::text IS NULL AND g.plant_name = ${plant ?? null}
        AND NOT (${excludeSource} = 'generator' AND g.id = ${excludeId})
        AND NOT (${excludeSource} = 'heating' AND COALESCE(g.source_heating_session_id, 0) = ${excludeId})
      UNION ALL
      SELECT h.dg_closing_dip_cm, h.dg_closing_diesel, h.date::text, h.created_at, h.id
      FROM bitumen_heating_sessions h
      WHERE lower(trim(h.dg_generator_name)) = lower(trim(${equipmentName}))
        AND h.dg_mode = 'inline' AND h.dg_closing_dip_cm IS NOT NULL AND h.date <= ${beforeDate}::date
        AND ${site ?? null}::text IS NULL AND h.plant_name = ${plant ?? null}
        AND NOT (${excludeSource} = 'heating' AND h.id = ${excludeId})
    ) candidates ORDER BY date DESC, recorded_at DESC NULLS LAST, id DESC LIMIT 1
  `);
  return result.rows[0] ?? null;
}
