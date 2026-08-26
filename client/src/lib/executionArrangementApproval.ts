export function canShowExecutionArrangementApprove(
  status: string | null | undefined,
  canEditArrangements: boolean,
): boolean {
  return status === "submitted" && canEditArrangements;
}

export async function approveExecutionArrangement(arrangementId: number): Promise<unknown> {
  const res = await fetch(`/api/earthwork-arrangements/${arrangementId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
  }
  return data;
}