export interface EquipmentVendorOption {
  id: number;
  name: string;
  isActive: boolean;
  aliases: string[];
}

export function buildEquipmentVendorOptions(
  vendorRows: Array<{ id: number; name: string; isActive: boolean }>,
  aliases: Array<{ alias: string; canonicalName: string }>,
): EquipmentVendorOption[] {
  const vendors = vendorRows.map(vendor => ({ ...vendor, aliases: [] as string[] }));
  const byCanonicalName = new Map<string, typeof vendors>();
  for (const vendor of vendors) {
    const key = vendor.name.trim().toLocaleLowerCase();
    byCanonicalName.set(key, [...(byCanonicalName.get(key) ?? []), vendor]);
  }

  for (const alias of aliases) {
    const matches = byCanonicalName.get(alias.canonicalName.trim().toLocaleLowerCase()) ?? [];
    if (matches.length !== 1 || !alias.alias.trim()) continue;
    const target = matches[0];
    if (!target.aliases.some(value => value.toLocaleLowerCase() === alias.alias.trim().toLocaleLowerCase())) {
      target.aliases.push(alias.alias.trim());
    }
  }

  return vendors
    .map(vendor => ({ ...vendor, aliases: vendor.aliases.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}
