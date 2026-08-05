// ─── Instruction 031: shared DPR ↔ programme-bar linking logic ───────────────
// Single source of truth used by BOTH DPR entry screens (SiteEntry "Detailed"
// and GuidedDpr "Guided") AND the server-side validator, so the rules can never
// drift apart between separately-maintained copies (the Work Programme overlap
// check already suffered that fate once — see workTypeRecipes/programmeSequencer).
//
// Covers: DPR-side normalisation, chainage containment, auto-match candidate
// selection (Part C), bar-scoped balance figures (Part D), and the per-row
// validation used by validateProgressProgrammeLinks (Parts B/F/G), including
// draft-lenient mode so drafts keep their programmeBarId (Part B) while final
// submission stays strict.

import {
  isBarSide,
  isDprSideCompatible,
  barSideLabel,
  parseChainageKm,
  type BarSide,
} from "./barSide";

/** Minimal bar shape the link logic needs (subset of work_program_bars / PickerBar). */
export type LinkableBar = {
  id: number;
  boqItemId?: number;
  side: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  startDate?: string | null;
  endDate?: string | null;
  planningMode?: string | null;
  plannedQty?: number;
  reportedQty?: number;
  remainingQty?: number;
  unit?: string | null;
};

/**
 * Normalise a DPR side value (display label "LHS" / "Full Width", or key
 * "lhs") to the canonical BarSide key. Returns null for empty input.
 * Mirrors — and now replaces — the inline normalisation previously embedded
 * in server/routes.ts validateProgressProgrammeLinks.
 */
export function normalizeDprSideKey(raw: string | null | undefined): BarSide | string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  if (isBarSide(s)) return s;
  const lower = s.toLowerCase();
  if (lower === "lhs") return "lhs";
  if (lower === "rhs") return "rhs";
  if (/full/i.test(s)) return "full_width";
  if (/both/i.test(s)) return "both_sides";
  return lower.replace(/\s+/g, "_");
}

/** True when the entered km range falls (even partly) outside the bar's planned range. */
export function chainageOutsideBar(
  fromKm: number | null | undefined,
  toKm: number | null | undefined,
  bar: Pick<LinkableBar, "chainageFrom" | "chainageTo">,
  epsilon = 1e-6,
): boolean {
  if (fromKm == null || toKm == null) return false; // incomplete ≠ outside
  if (bar.chainageFrom == null || bar.chainageTo == null) return false;
  return fromKm < bar.chainageFrom - epsilon || toKm > bar.chainageTo + epsilon;
}

// ─── Part C: automatic programme-bar matching (build once, use in both) ──────

export type AutoMatchInput = {
  dprDate?: string | null;      // yyyy-MM-dd; bars not active on this date are de-prioritised
  sideKey?: string | null;      // normalised DPR side key (or null if not yet chosen)
  fromKm?: number | null;
  toKm?: number | null;
};

export type AutoMatchResult =
  | { kind: "auto"; bar: LinkableBar; candidates: LinkableBar[] }
  | { kind: "choose"; candidates: LinkableBar[] }
  | { kind: "none"; candidates: LinkableBar[] };

function isBarActiveOn(bar: LinkableBar, date: string | null | undefined): boolean {
  if (!date || !bar.startDate || !bar.endDate) return true;
  return date >= bar.startDate && date <= bar.endDate;
}

/**
 * Compatibility for the PRIMARY candidate list: side-compatible AND (when a
 * chainage range is entered) containing that range. Incompatible-side bars are
 * excluded entirely (reachable only via an explicit "Show other reaches" UI).
 */
export function isBarCompatible(bar: LinkableBar, input: AutoMatchInput): boolean {
  if (input.sideKey && !isDprSideCompatible(bar.side, input.sideKey)) return false;
  // Reverse check: if the bar is side-specific and the user picked an
  // incompatible side, exclude. If user picked no side yet, side-specific bars
  // remain candidates (side gets prefilled from the bar on link).
  if (input.fromKm != null && input.toKm != null) {
    if (chainageOutsideBar(input.fromKm, input.toKm, bar)) return false;
  } else if (input.fromKm != null) {
    if (bar.chainageFrom != null && bar.chainageTo != null) {
      const eps = 1e-6;
      if (input.fromKm < bar.chainageFrom - eps || input.fromKm > bar.chainageTo + eps) return false;
    }
  }
  return true;
}

/**
 * Part C matching: exactly one compatible bar (preferring bars active on the
 * DPR date) → auto-link; several → user picks among them; none → unplanned.
 */
export function autoMatchBar(bars: LinkableBar[], input: AutoMatchInput): AutoMatchResult {
  const compatible = bars.filter((b) => isBarCompatible(b, input));
  const active = compatible.filter((b) => isBarActiveOn(b, input.dprDate));
  const pool = active.length > 0 ? active : compatible;
  if (pool.length === 1) return { kind: "auto", bar: pool[0], candidates: compatible };
  if (pool.length > 1) return { kind: "choose", candidates: pool };
  return { kind: "none", candidates: [] };
}

// ─── Part D: bar-scoped balance figures ──────────────────────────────────────

export type BalanceFigures = { currentQty: number; totalActual: number; balance: number; unit: string };

/** Balance figures scoped to ONE bar (from /api/dpr/programme-bars fields). */
export function barBalanceFigures(bar: LinkableBar): BalanceFigures | null {
  if (bar.plannedQty == null) return null;
  const reported = bar.reportedQty ?? 0;
  return {
    currentQty: Math.round(bar.plannedQty * 1000) / 1000,
    totalActual: Math.round(reported * 1000) / 1000,
    balance: Math.round((bar.remainingQty ?? Math.max(0, bar.plannedQty - reported)) * 1000) / 1000,
    unit: bar.unit ?? "",
  };
}

// ─── Parts B/F: per-row programme-link validation (client preview + server) ──

export type LinkRowInput = {
  activity?: string | null;
  side?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  chainageFromKm?: number | null;
  chainageToKm?: number | null;
  chainageOverrideReason?: string | null;
  boqItemId?: number | null;
};

export type LinkRowOptions = {
  /**
   * Draft-lenient mode (Part B/F): a draft may be saved with incomplete
   * chainage or a still-missing out-of-range reason WITHOUT losing its
   * programmeBarId. Structural errors (wrong project/item, side conflict on an
   * explicitly-chosen side) still fail even for drafts.
   */
  draft?: boolean;
};

/**
 * Validates one progress row against its linked bar. Returns an error message
 * or null. This is the exact rule set the server enforces — run it client-side
 * first for friendly messaging, but never rely on UI-only validation.
 */
export function checkProgrammeLinkRow(
  row: LinkRowInput,
  bar: LinkableBar,
  opts: LinkRowOptions = {},
): string | null {
  const name = row.activity ?? "";
  const draft = opts.draft === true;

  // Side compatibility — an explicitly stated side must always be compatible,
  // draft or not (a wrong side is a structural error, not an incomplete field).
  const dprSideKey = normalizeDprSideKey(row.side);
  const plannedSide = bar.side ?? null;
  if (plannedSide) {
    if (!dprSideKey) {
      if (!draft) {
        return `Progress entry "${name}": the selected bar is planned ${barSideLabel(plannedSide)} — the DPR entry must state the executed side explicitly`;
      }
    } else if (!isDprSideCompatible(plannedSide, dprSideKey)) {
      return `Progress entry "${name}": executed side ${barSideLabel(dprSideKey)} is not compatible with the bar's planned side ${barSideLabel(plannedSide)}`;
    }
  }

  // Chainage validity for linear work.
  const isPointWork = bar.planningMode === "structure_location";
  if (!isPointWork) {
    const fromKm = row.chainageFromKm != null ? Number(row.chainageFromKm) : parseChainageKm(row.chainageFrom);
    const toKm = row.chainageToKm != null ? Number(row.chainageToKm) : parseChainageKm(row.chainageTo);
    if (fromKm == null || toKm == null) {
      if (draft) return null; // incomplete draft rows keep their link (Part B)
      return `Progress entry "${name}": chainage From and To are required for linear work against a programme bar`;
    }
    if (!(toKm > fromKm)) {
      if (draft) return null;
      return `Progress entry "${name}": chainage To must be greater than From`;
    }
    if (chainageOutsideBar(fromKm, toKm, bar)) {
      const reason = (row.chainageOverrideReason ?? "").toString().trim();
      if (!reason && !draft) {
        return `Progress entry "${name}": actual range Km ${fromKm}–${toKm} lies outside the bar's planned range Km ${bar.chainageFrom}–${bar.chainageTo}. Enter an override reason to record a legitimate extension.`;
      }
    }
  }
  return null;
}

// ─── Part G: review-required derivation ──────────────────────────────────────

export const CHAINAGE_REVIEW_REQUIRED = "review_required";
export const CHAINAGE_REVIEW_APPROVED = "approved";

/**
 * A linked row whose complete chainage range falls outside the bar is marked
 * "Outside planned reach — review required": it is preserved with its reason
 * but does NOT count toward the bar's completed quantity until reviewed.
 */
export function deriveChainageReviewStatus(
  row: LinkRowInput,
  bar: LinkableBar | null | undefined,
): string | null {
  if (!bar) return null;
  if (bar.planningMode === "structure_location") return null;
  const fromKm = row.chainageFromKm != null ? Number(row.chainageFromKm) : parseChainageKm(row.chainageFrom);
  const toKm = row.chainageToKm != null ? Number(row.chainageToKm) : parseChainageKm(row.chainageTo);
  return chainageOutsideBar(fromKm, toKm, bar) ? CHAINAGE_REVIEW_REQUIRED : null;
}

// (The old suggestQuantitySource UOM-guessing helper was removed: quantity
// source is now real, verified state — see shared/dprGeometry.ts.)
