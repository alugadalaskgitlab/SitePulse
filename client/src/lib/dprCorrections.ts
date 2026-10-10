import { parseDprError } from "@/lib/dprErrors";
import { parseApiError } from "@/lib/apiError";

export interface DprCorrectionChange {
  section: string;
  rowId: string | number | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  requiresApproval: boolean;
}

export interface DprCorrectionReview {
  baseHash: string;
  revision: number;
  changes: DprCorrectionChange[];
  blocked: Array<{ section: string; rowId: string | number | null; field: string; message: string }>;
  requiresApproval: boolean;
  impact: string[];
}

export interface DprCorrectionRequest {
  id: number;
  requestedBy: number;
  requestedByName: string;
  status: string;
  requestReason: string;
  changes: DprCorrectionChange[];
  impact: string[];
  createdAt: string;
  approverName?: string | null;
  approverNote?: string | null;
  usedAt?: string | null;
}

export type DprCorrectionForm = {
  header: Record<string, unknown>;
  workType: string;
  structureItems: unknown[];
  progress: unknown[];
  equipment: unknown[];
  labour: unknown[];
  materials: unknown[];
  sitePurchases: unknown[];
};

/** Preserve the raw editor state, including row identities, blanks and zeroes.
 * Never run ordinary DPR payload normalization on a historical correction. */
export function snapshotCorrectionForm(form: DprCorrectionForm): DprCorrectionForm {
  return structuredClone({ ...form, structureItems: form.workType === "structure" ? form.structureItems : [] });
}

export function correctionValue(value: unknown): string {
  if (value == null || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function correctionCanSubmit(review: DprCorrectionReview | null, reason: string, confirmed: boolean): boolean {
  return !!review && review.changes.length > 0 && review.blocked.length === 0 && !!reason.trim() && confirmed;
}

export function canReviewCorrection(isAdmin: boolean, userId: number | undefined, request: DprCorrectionRequest): boolean {
  return isAdmin && userId != null && Number(userId) !== Number(request.requestedBy) && request.status === "pending";
}

export function correctionErrorMessage(error: unknown): string {
  const api = parseApiError(error);
  // The generic DPR parser replaces 403 messages with draft-submit copy.
  // Correction authority failures should retain the server's actual reason.
  if (api.status === 403 && api.message && !api.message.startsWith("{")) return api.message;
  const parsed = parseDprError(error);
  return [parsed.title, ...parsed.lines].filter(Boolean).join(" · ");
}
