/**
 * Instruction 031 Part I — "Same as yesterday" STRUCTURE-ONLY copy, shared by
 * both DPR screens (Guided + Detailed/SiteEntry).
 *
 * Copies: work items (activity, BOQ item, programme-bar link, side, uom),
 * equipment (machine/vehicle/operator/task) and labour (category/count/
 * contractor/task = agency).
 * Never copies: chainage, quantities, measurements, photos, readings, remarks,
 * or submit status — today's actuals are always entered fresh.
 */

export type YesterdayProgressSeed = {
  activity: string;
  boqItemId: number | null;
  programmeBarId: number | null;
  side: string;
  uom: string;
};
export type YesterdayEquipmentSeed = { machine: string; vehicleNo: string; operator: string; task: string };
export type YesterdayLabourSeed = { category: string; count: number | null; contractor: string; task: string };

export type YesterdayStructure = {
  progress: YesterdayProgressSeed[];
  equipment: YesterdayEquipmentSeed[];
  labour: YesterdayLabourSeed[];
};

export function extractYesterdayStructure(dpr: {
  progress?: any[] | null;
  equipment?: any[] | null;
  labour?: any[] | null;
}): YesterdayStructure {
  return {
    progress: (dpr.progress ?? [])
      .filter((p: any) => !p.noSiteWork && p.activity)
      .map((p: any) => ({
        activity: p.activity,
        boqItemId: p.boqItemId ?? null,
        programmeBarId: p.programmeBarId ?? null,
        side: p.side ?? "",
        uom: p.uom ?? "",
      })),
    equipment: (dpr.equipment ?? [])
      .filter((e: any) => e.machine)
      .map((e: any) => ({
        machine: e.machine,
        vehicleNo: e.vehicleNo ?? "",
        operator: e.operator ?? "",
        task: e.task ?? "",
      })),
    labour: (dpr.labour ?? [])
      .filter((l: any) => l.category)
      .map((l: any) => ({
        category: l.category,
        count: l.count ?? null,
        contractor: l.contractor ?? "",
        task: l.task ?? "",
      })),
  };
}
