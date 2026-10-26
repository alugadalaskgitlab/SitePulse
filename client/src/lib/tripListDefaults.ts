export type TripListRoleFilter = "all" | "unresolved";

export function tripListDefaultsFromSearch(search: string, today: string) {
  const params = new URLSearchParams(search);
  const requestedDate = params.get("hireDate") || "";
  const hireDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
  const requestedFrom = params.get("dateFrom") || "";
  const requestedTo = params.get("dateTo") || "";
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom) ? requestedFrom : hireDate;
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(requestedTo) ? requestedTo : hireDate;
  const roleFilter: TripListRoleFilter = params.get("hireRole") === "unresolved"
    ? "unresolved"
    : "all";
  const supplierFilter = params.get("hireSupplier")?.trim() || "";

  return { hireDate, dateFrom, dateTo, supplierFilter, roleFilter };
}
