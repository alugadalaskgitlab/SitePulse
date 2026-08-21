/**
 * Batch 06V — DPR server error normalisation.
 *
 * `parseApiError` in queryClient already splits `"NNN: <body>"` into
 * status + JSON body; this module builds on that to give DPR-specific
 * human-readable messages and scroll/highlight targets.
 *
 * Rules:
 *  - Never surface raw JSON or numeric error codes to the end-user.
 *  - DPR_NOT_READY: extract the exact row description from the server's
 *    `issues[].description` array and return each one verbatim.
 *  - Every other code: return the server's plain `error` or `message` field
 *    if present; otherwise fall back to a context-appropriate generic.
 */

import { parseApiError } from "./apiError";

export interface DprErrorResult {
  /** Human-readable one-liner for a toast title or inline banner. */
  title: string;
  /** Optional detail lines (one per mandatory issue on DPR_NOT_READY). */
  lines: string[];
  /**
   * When DPR_NOT_READY references an exact activity row, this is the
   * identifying label so the caller can scroll/highlight it.
   * Format: the `activity` string from the first issues row, or null.
   */
  highlightActivity: string | null;
}

/**
 * Turn any error thrown by an `apiRequest` DPR save/submit call into a
 * DprErrorResult suitable for display.  Never returns raw JSON or code.
 */
export function parseDprError(error: unknown): DprErrorResult {
  const parsed = parseApiError(error);
  const { status, code, message } = parsed;

  // ── DPR_NOT_READY (server-side submit readiness backstop) ─────────────────
  if (code === "DPR_NOT_READY" || message?.includes("DPR_NOT_READY")) {
    // The server body shape is:
    //   { error: "DPR_NOT_READY", issues: [ { section, description, activity? } ] }
    // Try to parse it from the original error message body.
    const issues = extractDprNotReadyIssues(error);
    if (issues.length > 0) {
      const highlightActivity = issues[0].activity ?? null;
      const lines = issues.map((iss) =>
        iss.activity ? `${iss.activity} — ${iss.description}` : iss.description,
      );
      return {
        title: "DPR is not ready to submit",
        lines,
        highlightActivity,
      };
    }
    return {
      title: "DPR is not ready to submit",
      lines: ["Complete all mandatory fields before submitting."],
      highlightActivity: null,
    };
  }

  // ── PROGRAMME_LINK_INVALID ─────────────────────────────────────────────────
  if (code === "PROGRAMME_LINK_INVALID") {
    const m = message || "A progress row has an invalid programme link or missing chainage.";
    return { title: "Programme link invalid", lines: [m], highlightActivity: null };
  }

  // ── OVERRIDE_REASON_REQUIRED ──────────────────────────────────────────────
  if (code === "OVERRIDE_REASON_REQUIRED") {
    const m = message || "A reason is required for the out-of-range chainage before submitting.";
    return { title: "Reason required", lines: [m], highlightActivity: null };
  }

  // ── Generic HTTP-level errors ──────────────────────────────────────────────
  if (status === 400) {
    return {
      title: "Submission blocked",
      lines: [message || "The server rejected this report. Check all required fields."],
      highlightActivity: null,
    };
  }
  if (status === 403) {
    return {
      title: "Permission denied",
      lines: ["You don't have permission to submit this report."],
      highlightActivity: null,
    };
  }
  if (status === 409) {
    return {
      title: "Conflict",
      lines: [message || "A conflicting record already exists."],
      highlightActivity: null,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return {
    title: "Failed to save report",
    lines: [message || "An unexpected error occurred. Please try again."],
    highlightActivity: null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface DprIssue {
  section?: string;
  description: string;
  activity?: string | null;
}

function extractDprNotReadyIssues(error: unknown): DprIssue[] {
  if (!(error instanceof Error)) return [];
  // The error message is  "NNN: <raw JSON body>"
  const match = error.message.match(/^\d{3}:\s*([\s\S]*)$/);
  if (!match) return [];
  try {
    const json = JSON.parse(match[1].trim());
    if (Array.isArray(json.issues)) {
      return json.issues.map((iss: any) => ({
        section: typeof iss.section === "string" ? iss.section : undefined,
        description: typeof iss.description === "string" ? iss.description : String(iss),
        activity: typeof iss.activity === "string" ? iss.activity : null,
      }));
    }
    if (Array.isArray(json.mandatory)) {
      return json.mandatory.map((iss: any) => {
        const section = typeof iss.section === "string" ? iss.section : undefined;
        return {
          section,
          description: typeof iss.message === "string" ? iss.message
            : typeof iss.description === "string" ? iss.description
            : typeof iss.label === "string" ? iss.label : "This row needs attention.",
          activity: typeof iss.activity === "string" ? iss.activity
            : section === "activities" && typeof iss.label === "string" ? iss.label : null,
        };
      });
    }
  } catch {
    // not JSON — leave issues empty
  }
  return [];
}
