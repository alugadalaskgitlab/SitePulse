/** Display-only number, based on the requisition date (not purchase/fill date). */
export function dieselRequisitionNo(requirement: { id: number; date: string }): string {
  const year = Number(requirement.date.slice(0, 4));
  const month = Number(requirement.date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  const fy = `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
  return `DSL-REQ/${fy}/${String(requirement.id).padStart(4, "0")}`;
}
