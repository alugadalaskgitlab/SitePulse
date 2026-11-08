/** True only for norm rows that represent equipment operating hours. */
export function isSnlEquipmentHoursUnit(unit: unknown): boolean {
  return /^(?:hr|hrs|hour|hours)$/i.test(String(unit ?? "").trim());
}
