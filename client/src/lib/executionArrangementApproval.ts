export function canShowExecutionArrangementApprove(
  status: string | null | undefined,
  canEditArrangements: boolean,
): boolean {
  return status === "submitted" && canEditArrangements;
}

export async function approveExecutionArrangement(arrangementId: number, effectiveFrom: string): Promise<unknown> {
  const res = await fetch(`/api/earthwork-arrangements/${arrangementId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved", effectiveFrom }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
  }
  return data;
}