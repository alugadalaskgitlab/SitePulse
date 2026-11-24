export type MaterialMasterFieldGroup =
  | "choose-category"
  | "aggregate"
  | "bitumen"
  | "emulsion"
  | "fuel"
  | "store";

export function materialMasterFieldGroup(category: string | null | undefined, _name = ""): MaterialMasterFieldGroup {
  const selectedCategory = (category ?? "").trim().toLowerCase();
  if (!selectedCategory) return "choose-category";
  const materialName = _name.trim().toLowerCase();

  if (["ldo", "diesel", "hsd"].includes(materialName) || /\b(ldo|diesel|hsd|fuel)\b/.test(selectedCategory)) return "fuel";
  if (/^emulsion$/.test(materialName) || /\bemulsion\b/.test(selectedCategory)) return "emulsion";
  if (/\bbitumen\b/.test(selectedCategory)) return "bitumen";
  if (selectedCategory === "other" && /\b(aggregate|granular|soil|earth|sand|dust|filler|gsb|wmm)\b/.test(materialName)) return "aggregate";
  if (/\b(aggregate|granular|soil|earth|sand|dust|filler|gsb|wmm)\b/.test(selectedCategory)) return "aggregate";
  if (materialName === "bitumen") return "bitumen";
  return "store";
}

export function materialMasterDefaultUom(group: MaterialMasterFieldGroup): string | null {
  if (group === "bitumen" || group === "emulsion" || group === "aggregate") return "MT";
  if (group === "fuel") return "Liters";
  return null;
}

export function materialAliasesText(savedAliases: string | null | undefined): string {
  if (!savedAliases) return "";
  try {
    const parsed = JSON.parse(savedAliases);
    if (Array.isArray(parsed)) return parsed.map(value => String(value)).join("\n");
    if (typeof parsed === "string") return parsed;
  } catch {
    // Older rows may contain a plain text alias list rather than JSON.
  }
  return savedAliases;
}

export function materialAliasesJson(aliasText: string): string | null {
  const aliases = aliasText
    .split(/[\n,;]/)
    .map(alias => alias.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = aliases.filter(alias => {
    const key = alias.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length ? JSON.stringify(unique) : null;
}

export function materialTankLabel(
  materialName: string | null | undefined,
  tankNumber: number,
  category?: string | null,
): string {
  const categoryValue = category?.trim().toLowerCase() ?? "";
  const name = (materialName ?? "").trim().toLowerCase();
  if (categoryValue.includes("emulsion") || name === "emulsion") return `Emulsion tank ${tankNumber}`;
  if (categoryValue.includes("bitumen") || name === "bitumen" || (!categoryValue && /\bbitumen\b/.test(name))) return `Bitumen tank ${tankNumber}`;
  if (categoryValue.includes("ldo") || name === "ldo" || (!categoryValue && /light diesel oil/.test(name))) {
    return tankNumber === 1 ? "Tank 1 (small vertical)" : "Tank 2 (big horizontal)";
  }
  return `Tank ${tankNumber}`;
}
