export interface BoqProjectEditForm {
  name: string;
  contractNo: string;
  client: string;
  contractor: string;
  siteId: string;
  roadLengthKm: string;
  startDate: string;
  totalMonths: string;
  status: string;
}

export const PROGRAM_SETTINGS_START_DATE_MESSAGE =
  "Change the programme start date through Program Settings so existing schedule dates and calendar indices stay aligned.";

function normaliseDate(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

export function prepareBoqProjectUpdate(
  originalStartDate: string | null | undefined,
  form: BoqProjectEditForm,
): { ok: true; payload: Record<string, unknown> } | { ok: false; message: string } {
  if (normaliseDate(form.startDate) !== normaliseDate(originalStartDate)) {
    return { ok: false, message: PROGRAM_SETTINGS_START_DATE_MESSAGE };
  }

  return {
    ok: true,
    payload: {
      name: form.name.trim(),
      contractNo: form.contractNo.trim() || null,
      client: form.client.trim() || null,
      contractor: form.contractor.trim() || null,
      siteId: form.siteId ? parseInt(form.siteId) : null,
      roadLengthKm: form.roadLengthKm ? parseFloat(form.roadLengthKm) : null,
      totalMonths: form.totalMonths ? parseInt(form.totalMonths) : null,
      status: form.status,
    },
  };
}

export function boqProjectUpdateErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to update project";

  const raw = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const body = JSON.parse(raw);
    if (typeof body?.message === "string" && body.message.trim()) return body.message;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Non-JSON errors are already suitable for display.
  }
  return raw || "Failed to update project";
}