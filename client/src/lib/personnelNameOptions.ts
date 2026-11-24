type PersonnelNameRecord = {
  name?: string | null;
  isActive?: boolean | number | null;
};

/** Active master names are pickable; a saved legacy name stays visible on edit. */
export function personnelNameOptions(
  personnel: PersonnelNameRecord[],
  savedName = "",
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const person of personnel) {
    const name = person.name?.trim();
    if (Number(person.isActive) !== 1 || !name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  const preserved = savedName.trim();
  if (preserved && !seen.has(preserved)) names.push(preserved);
  return names;
}
