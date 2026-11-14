export const FUND_PLANNER_WORK_GROUPS = [
  { id: "earthwork", label: "Earthwork" },
  { id: "base", label: "Base" },
  { id: "bituminous", label: "Bituminous" },
  { id: "structures", label: "CD / structures" },
  { id: "furniture", label: "Furniture" },
] as const;

export type FundPlannerWorkGroup = (typeof FUND_PLANNER_WORK_GROUPS)[number]["id"];

export function fundPlannerWorkGroup(input: {
  description?: string | null;
  categoryName?: string | null;
  workCategory?: string | null;
  planningWorkType?: string | null;
  layerType?: string | null;
  mixType?: string | null;
}): FundPlannerWorkGroup | null {
  const category = `${input.categoryName ?? ""} ${input.workCategory ?? ""}`.trim().toLowerCase();
  const layer = String(input.layerType ?? "").trim().toLowerCase();
  const mix = String(input.mixType ?? "").trim().toLowerCase();
  const description = String(input.description ?? "").trim().toLowerCase();

  if (/road furniture|furniture|road safety|safety intervention|traffic sign|road marking/.test(category)) {
    return "furniture";
  }
  if (/cd works|structure|culvert|bridge|drain|pipe/.test(category) ||
      /^(structure|non_linear)$/.test(layer) ||
      String(input.planningWorkType ?? "").toLowerCase() === "structure") {
    return "structures";
  }
  if (/^(earthwork|earth|soil)$/.test(layer)) return "earthwork";
  if (/^(granular|base|sub_base|subbase)$/.test(layer) || /\b(wmm|gsb|granular|sub-base|subbase)\b/.test(mix)) {
    return "base";
  }
  if (/^(bituminous|spray_coat|spray coat)$/.test(layer) ||
      /\b(bituminous|bitumen|asphalt|dgbm|dbm|sdbc|bc)\b/.test(mix)) {
    return "bituminous";
  }

  // BOQ categories are often only "Road Works"; use the item wording when a
  // recipe layer has not yet been saved, without relying on BOQ item IDs.
  if (/clearing|grubbing|scarifying|excavation for road|embankment|earthen shoulder|shoulder|subgrade/.test(description)) {
    return "earthwork";
  }
  if (/\b(wmm|gsb|granular|sub-base|subbase)\b/.test(description)) return "base";
  if (/\b(prime coat|tack coat|bituminous|bitumen|asphalt|dgbm|dbm|bm|sdbc|bc)\b/.test(description)) {
    return "bituminous";
  }
  return null;
}
