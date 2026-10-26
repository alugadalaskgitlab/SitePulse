export type TripListRoleFilter = "all" | "unresolved";

export function tripListDefaultsFromSearch(search: string, today: string) {
  const params = new URLSearchParams(search);
  const requestedDate = params.get("hireDate") || "";
  const hireDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
  const roleFilter: TripListRoleFilter = params.get("hireRole") === "unresolved"
    ? "unresolved"
    : "all";

  return { hireDate, roleFilter };
}
