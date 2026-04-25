import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Users, Loader2, ShieldAlert, Search, Wand2, Combine, Sparkles, X, Undo2, History, Download } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { LABOUR_CATEGORIES, LABOUR_GENDERS, ALL_PLANTS_SENTINEL } from "@shared/schema";

type ReviewRow = {
  name: string;
  count: number;
  earliestDate: string;
  latestDate: string;
  currentContractors: string[];
  currentCategories: string[];
  currentGenders: string[];
  roles: string[];
  needsContractor: boolean;
  needsCategory: boolean;
  shiftLogIds: number[];
};

type LearnedAliasExample = {
  batchId: number;
  from: string;
  to: string;
  actor: string;
  createdAt: string;
};
type LearnedAliasEntry = {
  a: string;
  b: string;
  count: number;
  examples: LearnedAliasExample[];
};
type LearnedAliases = {
  pairs: LearnedAliasEntry[];
  tokenPairs: LearnedAliasEntry[];
};

type CustomAlias = {
  id: number;
  tokenA: string;
  tokenB: string;
  kind: "alias" | "suppress_learned" | "suppress_learned_pair";
  createdBy: string;
  createdAt: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[.,;:!?\-_/\\]+$/g, "")
    .replace(/[.,;:!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > 2) return 99;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

// Phonetic key tuned for transliterated Indian names. Maps common spelling
// variants ("RAJESH"/"RAAJESH", "MOHAMMED"/"MOHAMED", "REDDY"/"REDDI",
// "DINESH"/"DHINESH", "PRAVEEN"/"PRAVIN", "SUNIL"/"SUNEEL", …) to the same
// code so the cluster builder can surface them as likely duplicates even
// when their Levenshtein distance is > 1.
function phoneticToken(t: string): string {
  if (!t) return "";
  let s = t.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  // Common Indian-English digraphs → single canonical sound
  s = s.replace(/PH/g, "F");
  s = s.replace(/CK/g, "K");
  s = s.replace(/CH/g, "S");
  s = s.replace(/SH/g, "S");
  s = s.replace(/TH/g, "T");
  s = s.replace(/DH/g, "D");
  s = s.replace(/BH/g, "B");
  s = s.replace(/GH/g, "G");
  s = s.replace(/KH/g, "K");
  s = s.replace(/JH/g, "J");
  // Single-letter swaps for transliteration drift
  s = s.replace(/Q/g, "K");
  s = s.replace(/X/g, "KS");
  s = s.replace(/W/g, "V");
  s = s.replace(/Z/g, "S");
  // Collapse repeated letters (RAAJESH → RAJESH, MOHAMMED → MOHAMED, ABDULL → ABDUL)
  s = s.replace(/(.)\1+/g, "$1");
  if (!s) return "";
  // Keep the first letter; strip remaining vowels (Y treated as a vowel so
  // REDDY/REDDI/RAVI/RAVY collapse together).
  const first = s[0];
  const rest = s.slice(1).replace(/[AEIOUY]/g, "");
  return (first + rest).replace(/(.)\1+/g, "$1");
}

// Per-token phonetic match. Requires the two names to have the same token
// count and every corresponding token to share the same phonetic key. Skips
// very short names (< 4 letters) to keep the false-positive rate low — RAJ vs
// RAJU shouldn't auto-cluster on phonetics alone.
function isPhoneticDup(a: string, b: string): boolean {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (ta.length === 0 || ta.length !== tb.length) return false;
  const minLetters = Math.min(a.replace(/\s/g, "").length, b.replace(/\s/g, "").length);
  if (minLetters < 4) return false;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    const ka = phoneticToken(ta[i]);
    const kb = phoneticToken(tb[i]);
    if (!ka || !kb || ka !== kb) return false;
    // Require ≥ 2-char key for any non-equal token to avoid R↔R-style trivial collisions.
    if (ka.length < 2) return false;
  }
  return true;
}

// Token-reorder: same multiset of tokens (each ≥ 2 letters) but in a different
// order. Catches "RAVI KUMAR" vs "KUMAR RAVI" without false-firing on
// single-letter initials.
function isTokenReorder(a: string, b: string): boolean {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (ta.length < 2 || ta.length !== tb.length) return false;
  if (ta.some(t => t.length < 2) || tb.some(t => t.length < 2)) return false;
  const sa = [...ta].sort().join("|");
  const sb = [...tb].sort().join("|");
  return sa === sb && a !== b;
}

// Hard-coded short-form aliases common on Indian shift logs. Every variant is
// mapped to the same canonical key — when both names share a canonical-keyed
// first token AND the remaining tokens are identical, we treat them as a dup
// even though edit distance is large.
const SHORT_FORM_GROUPS: string[][] = [
  ["MD", "MOHD", "MOHAMMED", "MOHAMMAD", "MOHAMED", "MOHAMAD", "MUHAMMAD", "MUHAMMED"],
  ["SK", "SHEIKH", "SHAIKH"],
  ["ABDUL", "ABD", "ABDULLA", "ABDULLAH"],
  ["SYED", "SAYED", "SAYYED", "SAIYED"],
  ["SRI", "SHRI", "SHREE"],
  ["MR", "MISTER"],
];
const SHORT_FORM_KEY = new Map<string, string>();
for (const grp of SHORT_FORM_GROUPS) {
  const key = grp[0];
  for (const v of grp) SHORT_FORM_KEY.set(v, key);
}

function shortFormCanonical(token: string): string {
  return SHORT_FORM_KEY.get(token) || token;
}

function isShortFormDup(a: string, b: string): boolean {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (ta.length === 0 || ta.length !== tb.length) return false;
  let usedAlias = false;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    const ka = shortFormCanonical(ta[i]);
    const kb = shortFormCanonical(tb[i]);
    if (ka !== kb) return false;
    if (!SHORT_FORM_KEY.has(ta[i]) && !SHORT_FORM_KEY.has(tb[i])) return false;
    usedAlias = true;
  }
  return usedAlias;
}

// Per-token learned-alias dup. Mirrors isPhoneticDup but uses the historical
// token-pair equivalences mined from past merges instead of phonetic keys.
// Returns the matching learned token-pairs (with confidence count) so the UI
// can show "matched a previously-confirmed pattern (X↔Y, used N×)".
//
// Confidence boost: if every learned token-pair used has count ≥ 2 (the same
// substitution has been confirmed by admins more than once — a "repeat
// pattern"), we relax the requirement that other tokens match exactly and
// allow up to one Levenshtein-1 difference among the remaining tokens. This
// is the "higher confidence over time" lever — well-established patterns get
// applied more aggressively.
function matchLearnedTokenDup(
  a: string,
  b: string,
  learnedTokenCounts: Map<string, number>,
): { matched: boolean; uses: Array<{ a: string; b: string; count: number }> } {
  if (learnedTokenCounts.size === 0) return { matched: false, uses: [] };
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (ta.length === 0 || ta.length !== tb.length) return { matched: false, uses: [] };
  const uses: Array<{ a: string; b: string; count: number }> = [];
  const fuzzyDiffs: number[] = [];
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    const k = ta[i] < tb[i] ? `${ta[i]}||${tb[i]}` : `${tb[i]}||${ta[i]}`;
    const c = learnedTokenCounts.get(k);
    if (c !== undefined) {
      uses.push({ a: ta[i], b: tb[i], count: c });
    } else {
      fuzzyDiffs.push(i);
    }
  }
  if (uses.length === 0) return { matched: false, uses: [] };
  if (fuzzyDiffs.length === 0) return { matched: true, uses };
  // Confidence-boost relaxation: only when every learned use is "repeat"
  // (count ≥ 2), allow one extra Levenshtein-1 token difference.
  const allRepeat = uses.every(u => u.count >= 2);
  if (!allRepeat || fuzzyDiffs.length > 1) return { matched: false, uses: [] };
  const i = fuzzyDiffs[0];
  if (levenshtein(ta[i], tb[i]) > 1) return { matched: false, uses: [] };
  return { matched: true, uses };
}

// Strong shared-context signal: both names share the same single role AND at
// least one real (non-UNKNOWN) contractor AND were entered on at least one
// common shift log. That last constraint is the "dates strongly" half of the
// task — if two name spellings landed on the exact same shift under the same
// role + contractor, it's almost always one worker double-entered (e.g.
// "MD KAREEM" + "MOHAMMED KAREEM" on the same DPR shift). To keep the
// precision high we also require some shared name structure: either two
// ≥3-letter tokens that match (exactly or phonetically) — protecting against
// distinct workers who only share a single common surname.
function detectCoOccurrenceDup(rowA: ReviewRow, rowB: ReviewRow): { sharedShifts: number } | null {
  if (rowA.roles.length !== 1 || rowB.roles.length !== 1) return null;
  if (rowA.roles[0] !== rowB.roles[0]) return null;
  const realContractorsA = rowA.currentContractors.filter(c => c && c !== "UNKNOWN CONTRACTOR");
  const realContractorsB = rowB.currentContractors.filter(c => c && c !== "UNKNOWN CONTRACTOR");
  if (realContractorsA.length === 0 || realContractorsB.length === 0) return null;
  const contractorOverlap = realContractorsA.some(c => realContractorsB.includes(c));
  if (!contractorOverlap) return null;
  // Must have appeared on the same shift log at least once — that's the
  // "shared dates" evidence.
  const idsB = new Set(rowB.shiftLogIds);
  const sharedShifts = rowA.shiftLogIds.filter(id => idsB.has(id)).length;
  if (sharedShifts === 0) return null;
  // Count shared / phonetically-equal ≥3-letter tokens. Single shared-token
  // matches (typically a common surname like "KUMAR") are too noisy on their
  // own — require either two name overlaps or a single overlap backed up by
  // multiple shared shifts.
  const ta = normalizeName(rowA.name).split(" ").filter(t => t.length >= 3);
  const tb = normalizeName(rowB.name).split(" ").filter(t => t.length >= 3);
  if (ta.length === 0 || tb.length === 0) return null;
  let nameOverlaps = 0;
  const usedB = new Set<number>();
  for (const x of ta) {
    const kx = phoneticToken(x);
    for (let j = 0; j < tb.length; j++) {
      if (usedB.has(j)) continue;
      const y = tb[j];
      const ky = phoneticToken(y);
      if (x === y || (kx && ky && kx === ky && kx.length >= 2)) {
        nameOverlaps += 1;
        usedB.add(j);
        break;
      }
    }
  }
  if (nameOverlaps >= 2) return { sharedShifts };
  if (nameOverlaps >= 1 && sharedShifts >= 2) return { sharedShifts };
  return null;
}

// Per-edge dup reason. Keep the strings short — they're rendered as small
// chips on the suggestions panel and as tooltips on the row badge.
type DupReason =
  | { kind: "exact" }
  | { kind: "typo" }
  | { kind: "extraInitial" }
  | { kind: "phonetic" }
  | { kind: "reorder" }
  | { kind: "shortForm" }
  | { kind: "learnedFullPair"; count: number }
  | { kind: "learnedTokenPair"; uses: Array<{ a: string; b: string; count: number }> }
  | { kind: "coOccurrence"; sharedShifts: number };

// A rendered reason chip. `short` is the badge text (kept terse for the
// suggestions panel), `tooltip` is the plain-English explanation shown on
// hover, and `learned` flags chips that come from past-merge history so the
// UI can style them differently.
type ReasonChip = { short: string; tooltip: string; learned?: boolean };

function describeReason(r: DupReason): ReasonChip {
  switch (r.kind) {
    case "exact":
      return {
        short: "exact",
        tooltip: "These names are identical once you ignore case, punctuation, and extra spaces.",
      };
    case "typo":
      return {
        short: "typo",
        tooltip: "The two spellings differ by a single character — almost always a typing mistake.",
      };
    case "extraInitial":
      return {
        short: "extra initial",
        tooltip: "One spelling is the same as the other but with a short initial (≤ 3 letters) added at the end.",
      };
    case "phonetic":
      return {
        short: "phonetic",
        tooltip: "Same name, different spelling of the same sound (for example RAJESH vs RAAJESH, or MOHAMMED vs MOHAMED).",
      };
    case "reorder":
      return {
        short: "reordered",
        tooltip: "Both names use the exact same words, just in a different order (for example RAVI KUMAR vs KUMAR RAVI).",
      };
    case "shortForm":
      return {
        short: "short-form (MD./MOHAMMED)",
        tooltip: "One spelling uses a well-known short form of the other (for example MD. or MOHD. for MOHAMMED, SK for SHEIKH, ABD for ABDUL).",
      };
    case "learnedFullPair":
      return {
        short: r.count >= 2 ? `learned from past merge (${r.count}×)` : "learned from past merge",
        tooltip: r.count >= 2
          ? `An admin has merged these two exact spellings ${r.count} times before, so they are flagged automatically every time they reappear.`
          : "An admin merged these two exact spellings once before, so they are flagged automatically when they reappear.",
        learned: true,
      };
    case "learnedTokenPair": {
      const parts = r.uses.map(u => `${u.a}↔${u.b}${u.count >= 2 ? ` (${u.count}×)` : ""}`).join(", ");
      const anyRepeat = r.uses.some(u => u.count >= 2);
      return {
        short: `learned pattern: ${parts}`,
        tooltip: anyRepeat
          ? `Past admin merges have repeatedly equated these word pairs: ${parts}. Confidence is boosted because the same substitution has been confirmed more than once.`
          : `A past admin merge equated these word pairs: ${parts}.`,
        learned: true,
      };
    }
    case "coOccurrence":
      return {
        short: "same role + contractor",
        tooltip: `Both names share the same role and contractor and appeared together on ${r.sharedShifts} shared shift log${r.sharedShifts === 1 ? "" : "s"} — almost always one worker entered under two spellings.`,
      };
  }
}

function detectDupReason(
  rawA: string,
  rawB: string,
  learnedPairCounts?: Map<string, number>,
  learnedTokenCounts?: Map<string, number>,
): DupReason | null {
  const a = normalizeName(rawA);
  const b = normalizeName(rawB);
  if (!a || !b) return null;
  if (a === b) return { kind: "exact" };
  // Past merges already unified these two names — flag every recurrence.
  if (learnedPairCounts) {
    const c = learnedPairCounts.get(pairKey(a, b));
    if (c !== undefined) return { kind: "learnedFullPair", count: c };
  }
  const partsA = a.split(" ");
  const partsB = b.split(" ");
  if (partsA[0] === partsB[0]) {
    const longer = partsA.length >= partsB.length ? partsA : partsB;
    const shorter = partsA.length >= partsB.length ? partsB : partsA;
    if (shorter.length === 1 && longer.length === 2 && longer[1].length <= 3) return { kind: "extraInitial" };
    if (shorter.length === 2 && longer.length === 3 && longer[2].length <= 3 && shorter[1] === longer[1]) return { kind: "extraInitial" };
  }
  if (levenshtein(a, b) <= 1) return { kind: "typo" };
  if (isPhoneticDup(a, b)) return { kind: "phonetic" };
  if (isTokenReorder(a, b)) return { kind: "reorder" };
  if (isShortFormDup(a, b)) return { kind: "shortForm" };
  if (learnedTokenCounts) {
    const m = matchLearnedTokenDup(a, b, learnedTokenCounts);
    if (m.matched) return { kind: "learnedTokenPair", uses: m.uses };
  }
  return null;
}

type Cluster = {
  key: string;
  names: string[];
  canonical: string;
  // Aggregated reason chips (deduped, ordered) describing why this cluster
  // was suggested. Each chip carries a short badge label and a plain-English
  // tooltip explaining the underlying rule. Rendered as small chips on the
  // suggestion panel and as a hover-tooltip on the per-row "possible dup"
  // badge.
  reasonChips: ReasonChip[];
  // Did any edge in this cluster fire because of a previously-confirmed
  // merge pattern? Used to surface a separate "learned" badge.
  fromLearnedPattern: boolean;
};

function pairKey(a: string, b: string): string {
  const ua = a.toUpperCase().trim();
  const ub = b.toUpperCase().trim();
  return ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
}

function buildClusters(
  rows: ReviewRow[],
  dismissedPairKeys: Set<string>,
  learned: LearnedAliases | null,
  customAliases: CustomAlias[] | null,
): Cluster[] {
  const n = rows.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const learnedPairCounts = new Map<string, number>();
  const learnedTokenCounts = new Map<string, number>();
  // Suppressed token-pair keys (admin-muted learned aliases). Applied AFTER
  // accumulating learned counts so a suppress entry hides the matching mined
  // pair from the suggester without touching the underlying merge history.
  const suppressedTokenKeys = new Set<string>();
  // Suppressed full-name pair keys (admin-muted learned full-name aliases).
  const suppressedFullPairKeys = new Set<string>();
  if (customAliases) {
    for (const c of customAliases) {
      if (c.kind === "suppress_learned") {
        const ua = c.tokenA.toUpperCase().trim();
        const ub = c.tokenB.toUpperCase().trim();
        if (!ua || !ub || ua === ub) continue;
        suppressedTokenKeys.add(ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`);
      } else if (c.kind === "suppress_learned_pair") {
        const ua = c.tokenA.toUpperCase().trim();
        const ub = c.tokenB.toUpperCase().trim();
        if (!ua || !ub || ua === ub) continue;
        suppressedFullPairKeys.add(ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`);
      }
    }
  }
  if (learned) {
    for (const p of learned.pairs) {
      const k = pairKey(p.a, p.b);
      if (suppressedFullPairKeys.has(k)) continue;
      learnedPairCounts.set(k, Math.max(learnedPairCounts.get(k) || 0, p.count || 1));
    }
    for (const p of learned.tokenPairs) {
      const ua = p.a.toUpperCase().trim();
      const ub = p.b.toUpperCase().trim();
      if (!ua || !ub || ua === ub) continue;
      const k = ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
      if (suppressedTokenKeys.has(k)) continue;
      learnedTokenCounts.set(k, Math.max(learnedTokenCounts.get(k) || 0, p.count || 1));
    }
  }
  // Custom admin-added token-equivalences. Stored with count = 2 so they get
  // the same "repeat / confidence-boost" treatment as a learned pair an admin
  // has confirmed more than once — they were explicitly entered, after all.
  if (customAliases) {
    for (const c of customAliases) {
      if (c.kind !== "alias") continue;
      const ua = c.tokenA.toUpperCase().trim();
      const ub = c.tokenB.toUpperCase().trim();
      if (!ua || !ub || ua === ub) continue;
      const k = ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
      learnedTokenCounts.set(k, Math.max(learnedTokenCounts.get(k) || 0, 2));
    }
  }
  // edgeReasons[clusterRoot index] → list of reasons collected. We collect
  // by source-pair index first, then re-bucket by post-union root.
  const edgesByPair: Array<{ i: number; j: number; reason: DupReason }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dismissedPairKeys.has(pairKey(rows[i].name, rows[j].name))) continue;
      let reason = detectDupReason(rows[i].name, rows[j].name, learnedPairCounts, learnedTokenCounts);
      if (!reason) {
        const co = detectCoOccurrenceDup(rows[i], rows[j]);
        if (co) reason = { kind: "coOccurrence", sharedShifts: co.sharedShifts };
      }
      if (!reason) continue;
      union(i, j);
      edgesByPair.push({ i, j, reason });
    }
  }
  const reasonsByRoot = new Map<number, DupReason[]>();
  for (const e of edgesByPair) {
    const r = find(e.i);
    if (!reasonsByRoot.has(r)) reasonsByRoot.set(r, []);
    reasonsByRoot.get(r)!.push(e.reason);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  const clusters: Cluster[] = [];
  Array.from(groups.entries()).forEach(([root, idxs]: [number, number[]]) => {
    if (idxs.length < 2) return;
    const members: ReviewRow[] = idxs.map((i: number) => rows[i]);
    // Canonical: highest count → shortest length → alphabetical
    const sorted = [...members].sort((x, y) => {
      if (y.count !== x.count) return y.count - x.count;
      if (x.name.length !== y.name.length) return x.name.length - y.name.length;
      return x.name.localeCompare(y.name);
    });
    const canonical = sorted[0].name;
    const names = members.map((m: ReviewRow) => m.name).sort();
    const reasons = reasonsByRoot.get(root) || [];
    const seen = new Set<string>();
    const reasonChips: ReasonChip[] = [];
    let fromLearnedPattern = false;
    for (const r of reasons) {
      if (r.kind === "learnedFullPair" || r.kind === "learnedTokenPair") fromLearnedPattern = true;
      const chip = describeReason(r);
      if (!seen.has(chip.short)) { seen.add(chip.short); reasonChips.push(chip); }
    }
    clusters.push({ key: names.join("||"), names, canonical, reasonChips, fromLearnedPattern });
  });
  // Largest clusters first; tie-break: learned-pattern clusters first (most
  // actionable signal).
  clusters.sort((a, b) => {
    if (b.names.length !== a.names.length) return b.names.length - a.names.length;
    if (b.fromLearnedPattern !== a.fromLearnedPattern) return b.fromLearnedPattern ? 1 : -1;
    return a.canonical.localeCompare(b.canonical);
  });
  return clusters;
}

export default function PlantShiftLogManpowerReview() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  // Manpower Review is launched from the Plant Shift Log (which lives on the
  // "operations" tab), so back navigation lands on /plant/dashboard?tab=operations.
  // getPlantBackLink also forwards `role` from the current URL when present.
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const { isAdmin } = useAuth();

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filterText, setFilterText] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  // Plant scope. Empty string = "All plants" (uses ALL_PLANTS_SENTINEL when
  // saving dismissals). All review-list / dismissal queries are scoped to this
  // plant so dismissing "RAJU vs RAJU K" on one site never silences it on
  // another.
  const [plantFilter, setPlantFilter] = useState<string>("");
  const dismissalsScopeKey = plantFilter || ALL_PLANTS_SENTINEL;

  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const [edits, setEdits] = useState<Record<string, { contractor: string; category: string; gender: string }>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [merging, setMerging] = useState(false);

  type DismissedPair = { id: number; nameA: string; nameB: string; dismissedBy: string; dismissedAt: string; plantName: string };
  const [dismissedPairs, setDismissedPairs] = useState<DismissedPair[] | null>(null);
  const [learnedAliases, setLearnedAliases] = useState<LearnedAliases | null>(null);
  const [customAliases, setCustomAliases] = useState<CustomAlias[] | null>(null);
  const [showAliasPanel, setShowAliasPanel] = useState(false);
  const [newAliasA, setNewAliasA] = useState("");
  const [newAliasB, setNewAliasB] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const [deletingAliasId, setDeletingAliasId] = useState<number | null>(null);
  const [suppressingTokenKey, setSuppressingTokenKey] = useState<string | null>(null);
  const [suppressingPairKey, setSuppressingPairKey] = useState<string | null>(null);
  const [savingDismissalKey, setSavingDismissalKey] = useState<string | null>(null);
  const [restoringDismissalId, setRestoringDismissalId] = useState<number | null>(null);
  const [showDismissedList, setShowDismissedList] = useState(false);
  // Filters & bulk-restore controls for the dismissed-pairs panel.
  const [dismissedNameFilter, setDismissedNameFilter] = useState<string>("");
  const [dismissedActorFilter, setDismissedActorFilter] = useState<string>("__all__");
  const [dismissedDateFrom, setDismissedDateFrom] = useState<string>("");
  const [dismissedDateTo, setDismissedDateTo] = useState<string>("");
  const [selectedDismissedIds, setSelectedDismissedIds] = useState<Record<number, boolean>>({});
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [purgeOlderDays, setPurgeOlderDays] = useState<string>("90");

  const { data: vendorNames } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
    enabled: isAdmin,
  });

  const { data: plantNames } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    enabled: isAdmin,
  });

  type RecentMerge = {
    id: number;
    createdAt: string;
    actor: string;
    fromNames: string[];
    toName: string;
    contractorName: string;
    category: string;
    gender: string;
    rowCount: number;
    isMerge: boolean;
  };
  type DupActivity = {
    id: number;
    createdAt: string;
    actor: string;
    plantName: string;
    action: "dismiss" | "restore" | "bulk_restore";
    pairs: Array<[string, string]>;
    pairCount: number;
  };
  type AliasActivity = {
    id: number;
    createdAt: string;
    actor: string;
    action: "add" | "remove";
    kind: "alias" | "suppress_learned" | "suppress_learned_pair";
    tokenA: string;
    tokenB: string;
  };
  // Unified recent-activity feed entry. Merges and dismissal/restore actions
  // share the same row layout; the `kind` discriminator drives which fields
  // are rendered and whether the Undo button is available.
  type RecentActivityEntry =
    | { kind: "merge"; createdAt: string; actor: string; merge: RecentMerge }
    | { kind: "dup"; createdAt: string; actor: string; activity: DupActivity };

  const [recentMerges, setRecentMerges] = useState<RecentMerge[] | null>(null);
  const [recentDupActivity, setRecentDupActivity] = useState<DupActivity[] | null>(null);
  const [recentAliasActivity, setRecentAliasActivity] = useState<AliasActivity[] | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [revertingAliasActivityId, setRevertingAliasActivityId] = useState<number | null>(null);
  const [selectedAliasActivityIds, setSelectedAliasActivityIds] = useState<Record<number, boolean>>({});
  const [bulkRevertingAlias, setBulkRevertingAlias] = useState(false);

  const fetchRecentMerges = async () => {
    if (!isAdmin) return;
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/recent-merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      // Backwards-compatible: older builds returned a bare array of merges.
      if (Array.isArray(body)) {
        setRecentMerges(body as RecentMerge[]);
        setRecentDupActivity([]);
        setRecentAliasActivity([]);
      } else {
        setRecentMerges((body.merges || []) as RecentMerge[]);
        setRecentDupActivity((body.dupActivity || []) as DupActivity[]);
        setRecentAliasActivity((body.aliasActivity || []) as AliasActivity[]);
      }
      setSelectedAliasActivityIds({});
    } catch (err) {
      toast({ title: "Failed to load recent activity", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoadingRecent(false);
    }
  };

  // Combined, newest-first feed of merges/relabels and dismiss/restore actions
  // for the recent-activity card. Memoized so re-renders during Undo don't
  // re-sort on every keystroke.
  const recentActivityFeed = useMemo<RecentActivityEntry[] | null>(() => {
    if (recentMerges === null && recentDupActivity === null) return null;
    const items: RecentActivityEntry[] = [];
    for (const m of recentMerges || []) {
      items.push({ kind: "merge", createdAt: m.createdAt, actor: m.actor, merge: m });
    }
    for (const a of recentDupActivity || []) {
      items.push({ kind: "dup", createdAt: a.createdAt, actor: a.actor, activity: a });
    }
    items.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
    return items;
  }, [recentMerges, recentDupActivity]);

  const fetchLearnedAliases = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/learned-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      setLearnedAliases((await res.json()) as LearnedAliases);
    } catch (err) {
      toast({ title: "Failed to load learned aliases", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const fetchCustomAliases = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/custom-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      setCustomAliases((await res.json()) as CustomAlias[]);
    } catch (err) {
      toast({ title: "Failed to load custom aliases", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  const submitNewAlias = async () => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const a = newAliasA.trim();
    const b = newAliasB.trim();
    if (a.length < 1 || b.length < 1) {
      toast({ title: "Both tokens are required", variant: "destructive" });
      return;
    }
    setSavingAlias(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/add-custom-alias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actor: actor.trim(), tokenA: a, tokenB: b, kind: "alias" }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { added: boolean; alias: CustomAlias | null };
      toast({
        title: result.added ? "Custom alias saved" : "Already saved",
        description: result.added
          ? `${a.toUpperCase()} ↔ ${b.toUpperCase()} will now be suggested as a duplicate.`
          : "That token-pair was already in the custom dictionary.",
      });
      setNewAliasA("");
      setNewAliasB("");
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Failed to save alias", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSavingAlias(false);
    }
  };

  const deleteCustomAlias = async (id: number) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    setDeletingAliasId(id);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/delete-custom-alias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actor: actor.trim(), id }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Removed" });
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Failed to remove", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setDeletingAliasId(null);
    }
  };

  // One-click revert for an entry in the alias-activity audit feed.
  // - For an "add" entry, look up the matching custom-alias row by
  //   (tokenA, tokenB, kind) and delete it via the existing endpoint. The
  //   id is needed because deleteShiftLogManpowerCustomAlias is keyed by id.
  //   If the alias was already removed (e.g. someone hit Remove on the
  //   Manage aliases list), we surface a soft toast instead of failing.
  // - For a "remove" entry, re-add the snapshotted (tokenA, tokenB, kind)
  //   tuple via the existing add-custom-alias endpoint.
  // Each successful revert itself appends a new audit row so the feed
  // continues to be a complete history of every state change.
  const revertAliasActivity = async (a: AliasActivity) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    setRevertingAliasActivityId(a.id);
    try {
      if (a.action === "add") {
        const match = (customAliases || []).find(
          (c) => c.tokenA === a.tokenA && c.tokenB === a.tokenB && c.kind === a.kind
        );
        if (!match) {
          toast({
            title: "Already reverted",
            description: `${a.tokenA} ↔ ${a.tokenB} is no longer in the dictionary.`,
          });
          await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
          return;
        }
        const res = await fetch("/api/plant-module/shift-log-manpower/delete-custom-alias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ actor: actor.trim(), id: match.id }),
        });
        if (res.status === 401) { window.location.assign("/login"); return; }
        if (!res.ok) throw new Error(await res.text());
        toast({
          title: "Reverted",
          description: `Removed ${a.tokenA} ↔ ${a.tokenB} from the alias dictionary.`,
        });
      } else {
        const res = await fetch("/api/plant-module/shift-log-manpower/add-custom-alias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            actor: actor.trim(),
            tokenA: a.tokenA, tokenB: a.tokenB, kind: a.kind,
          }),
        });
        if (res.status === 401) { window.location.assign("/login"); return; }
        if (!res.ok) throw new Error(await res.text());
        const result = (await res.json()) as { added: boolean };
        toast({
          title: result.added ? "Reverted" : "Already restored",
          description: result.added
            ? `Re-added ${a.tokenA} ↔ ${a.tokenB} to the alias dictionary.`
            : `${a.tokenA} ↔ ${a.tokenB} was already in the dictionary.`,
        });
      }
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Revert failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setRevertingAliasActivityId(null);
    }
  };

  const bulkRevertAliasActivity = async () => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const ids = Object.entries(selectedAliasActivityIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter(n => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return;
    const activities = (recentAliasActivity || []).filter(a => ids.includes(a.id));
    if (activities.length === 0) return;
    const ok = window.confirm(
      `Revert ${activities.length} alias change${activities.length === 1 ? "" : "s"}?\n\nThis will undo every checked add/remove in one step. Continue?`
    );
    if (!ok) return;
    setBulkRevertingAlias(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-revert-alias-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actor: actor.trim(),
          activities: activities.map(a => ({
            action: a.action,
            kind: a.kind,
            tokenA: a.tokenA,
            tokenB: a.tokenB,
          })),
        }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { reverted: number; skipped: number };
      toast({
        title: result.reverted > 0 ? "Bulk revert complete" : "Nothing to revert",
        description: result.reverted > 0
          ? `${result.reverted} change${result.reverted === 1 ? "" : "s"} reverted${result.skipped > 0 ? `, ${result.skipped} already undone` : ""}.`
          : "All selected entries were already undone.",
      });
      setSelectedAliasActivityIds({});
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Bulk revert failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBulkRevertingAlias(false);
    }
  };

  const suppressLearnedFullPair = async (a: string, b: string) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const ua = a.toUpperCase().trim();
    const ub = b.toUpperCase().trim();
    const key = ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
    setSuppressingPairKey(key);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/add-custom-alias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actor: actor.trim(), tokenA: a, tokenB: b, kind: "suppress_learned_pair",
        }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { added: boolean };
      toast({
        title: result.added ? "Learned name-pair suppressed" : "Already suppressed",
        description: `${a} ↔ ${b} will no longer trigger duplicate suggestions.`,
      });
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Failed to suppress", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSuppressingPairKey(null);
    }
  };

  const suppressLearnedTokenPair = async (a: string, b: string) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const key = a < b ? `${a}||${b}` : `${b}||${a}`;
    setSuppressingTokenKey(key);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/add-custom-alias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actor: actor.trim(), tokenA: a, tokenB: b, kind: "suppress_learned",
        }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { added: boolean };
      toast({
        title: result.added ? "Learned alias suppressed" : "Already suppressed",
        description: `${a} ↔ ${b} will no longer trigger duplicate suggestions.`,
      });
      await Promise.all([fetchCustomAliases(), fetchRecentMerges()]);
    } catch (err) {
      toast({ title: "Failed to suppress", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSuppressingTokenKey(null);
    }
  };

  const fetchDismissedPairs = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/dismissed-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plantName: dismissalsScopeKey }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      setDismissedPairs((await res.json()) as DismissedPair[]);
    } catch (err) {
      toast({ title: "Failed to load dismissed pairs", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchRecentMerges();
      fetchLearnedAliases();
      fetchCustomAliases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Refetch dismissed pairs whenever the plant scope changes (or on unlock).
  // Also wipe any in-flight bulk-restore selection so a stale checkbox state
  // from the previous plant can't leak into the new scope.
  useEffect(() => {
    if (isAdmin) {
      fetchDismissedPairs();
    }
    setSelectedDismissedIds({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, dismissalsScopeKey]);

  const undoMerge = async (m: RecentMerge) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    if (typeof window !== "undefined") {
      const fromList = m.fromNames.join(", ");
      const ok = window.confirm(
        `Undo this merge?\n\n` +
        `${fromList} → ${m.toName}\n` +
        `${m.rowCount} shift-log row(s) will be reverted to their original worker name, contractor, category and gender.`
      );
      if (!ok) return;
    }
    setUndoingId(m.id);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/undo-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actor: actor.trim(), batchId: m.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { restored: number };
      toast({
        title: "Merge undone",
        description: `Restored ${result.restored} shift-log row(s) to their original worker info.`,
      });
      await Promise.all([fetchRecentMerges(), fetchRows(), fetchLearnedAliases()]);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Undo failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setUndoingId(null);
    }
  };

  const fetchRows = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/review-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({

          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          plantName: plantFilter || undefined,
        }),
      });
      if (res.status === 401) {
        toast({ title: "Admin access required", variant: "destructive" });
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ReviewRow[];
      setRows(data);
      const initial: Record<string, { contractor: string; category: string; gender: string }> = {};
      for (const r of data) {
        const knownContractor = r.currentContractors.find(c => c && c !== "UNKNOWN CONTRACTOR") || "";
        const knownCategory = r.currentCategories.find(c => c && c !== "OTHER") || "";
        const knownGender = r.currentGenders[0] || "MALE";
        initial[r.name] = {
          contractor: knownContractor,
          category: knownCategory,
          gender: knownGender,
        };
      }
      setEdits(initial);
      setSelected({});
      setMergeTarget("");
    } catch (err) {
      toast({ title: "Failed to load list", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const submitOne = async (row: ReviewRow) => {
    if (!isAdmin) return;
    const e = edits[row.name];
    if (!e?.contractor || !e?.category || !e?.gender) {
      toast({ title: "Fill contractor, category and gender", variant: "destructive" });
      return;
    }
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    setSubmitting(row.name);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-relabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({

          actor: actor.trim(),
          name: row.name,
          contractorName: e.contractor.trim(),
          category: e.category,
          gender: e.gender,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { updated: number };
      toast({
        title: "Worker relabeled",
        description: `${row.name}: updated ${result.updated} row(s) → ${e.contractor.trim().toUpperCase()} / ${e.category} / ${e.gender}`,
      });
      // Refresh list
      await Promise.all([fetchRows(), fetchRecentMerges(), fetchLearnedAliases()]);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Relabel failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const submitMerge = async () => {
    if (!isAdmin) return;
    const fromNames = Object.keys(selected).filter(n => selected[n]);
    if (fromNames.length < 2) {
      toast({ title: "Pick at least two name groups to merge", variant: "destructive" });
      return;
    }
    const target = mergeTarget.trim();
    if (!target) {
      toast({ title: "Pick a target name (the spelling to keep)", variant: "destructive" });
      return;
    }
    if (!fromNames.some(n => n.toUpperCase() === target.toUpperCase())) {
      toast({ title: "Target must be one of the selected names", variant: "destructive" });
      return;
    }
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const targetRow = rows?.find(r => r.name.toUpperCase() === target.toUpperCase());
    const targetEdit = targetRow ? edits[targetRow.name] : undefined;
    const pickFirst = (arr: (string | undefined)[], skip: (s: string) => boolean): string => {
      for (const v of arr) {
        if (v && !skip(v)) return v;
      }
      return "";
    };
    const allEdits = fromNames.map(n => edits[n]).filter(Boolean) as { contractor: string; category: string; gender: string }[];
    const contractor = (targetEdit?.contractor && targetEdit.contractor !== "UNKNOWN CONTRACTOR" ? targetEdit.contractor : "")
      || pickFirst(allEdits.map(e => e.contractor), s => !s || s === "UNKNOWN CONTRACTOR");
    const category = (targetEdit?.category && targetEdit.category !== "OTHER" ? targetEdit.category : "")
      || pickFirst(allEdits.map(e => e.category), s => !s || s === "OTHER");
    const gender = targetEdit?.gender || pickFirst(allEdits.map(e => e.gender), s => !s) || "MALE";
    if (!contractor || !category || !gender) {
      toast({ title: "Fill contractor + category on the target row first", variant: "destructive" });
      return;
    }
    setMerging(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-relabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({

          actor: actor.trim(),
          fromNames,
          toName: target,
          contractorName: contractor.trim(),
          category,
          gender,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { updated: number };
      toast({
        title: "Names merged",
        description: `${fromNames.length} name(s) → ${target.toUpperCase()} · ${result.updated} row(s) updated`,
      });
      await Promise.all([fetchRows(), fetchRecentMerges(), fetchLearnedAliases()]);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Merge failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = filterText.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(r => r.name.includes(q));
  }, [rows, filterText]);

  const dismissedPairKeys = useMemo(() => {
    const s = new Set<string>();
    for (const p of dismissedPairs || []) s.add(pairKey(p.nameA, p.nameB));
    return s;
  }, [dismissedPairs]);
  const clusters = useMemo(
    () => (rows ? buildClusters(rows, dismissedPairKeys, learnedAliases, customAliases) : []),
    [rows, dismissedPairKeys, learnedAliases, customAliases]
  );
  const visibleClusters = clusters;
  const nameToCluster = useMemo(() => {
    const m = new Map<string, Cluster>();
    for (const c of visibleClusters) {
      for (const n of c.names) m.set(n, c);
    }
    return m;
  }, [visibleClusters]);

  const acceptCluster = (c: Cluster) => {
    const next: Record<string, boolean> = {};
    for (const n of c.names) next[n] = true;
    setSelected(next);
    setMergeTarget(c.canonical);
    if (typeof window !== "undefined") {
      const el = document.querySelector('[data-testid="merge-bar"]');
      if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const dismissCluster = async (c: Cluster) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    // Persist every pair-edge in this cluster so it stays dismissed across
    // sessions. For a cluster {A,B,C} we save AB, AC and BC — that way
    // suppressing one pair never accidentally re-merges the others.
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < c.names.length; i++) {
      for (let j = i + 1; j < c.names.length; j++) {
        pairs.push([c.names[i], c.names[j]]);
      }
    }
    setSavingDismissalKey(c.key);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/dismiss-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actor: actor.trim(), pairs, plantName: dismissalsScopeKey }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { added: number };
      toast({
        title: "Suggestion dismissed",
        description: result.added > 0
          ? `Saved ${result.added} name-pair${result.added === 1 ? "" : "s"} as 'not a duplicate'.`
          : "These names were already marked as 'not a duplicate'.",
      });
      await fetchDismissedPairs();
      // Also clear any selection that came from this cluster
      setSelected(prev => {
        const next = { ...prev };
        let touched = false;
        for (const n of c.names) {
          if (next[n]) {
            delete next[n];
            touched = true;
          }
        }
        return touched ? next : prev;
      });
      if (c.names.includes(mergeTarget)) setMergeTarget("");
    } catch (err) {
      toast({ title: "Failed to dismiss suggestion", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSavingDismissalKey(null);
    }
  };

  const bulkRestoreDismissed = async (opts: { ids?: number[]; olderThanDays?: number; description: string }) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(`${opts.description}\n\nThese name-pairs will be allowed to suggest themselves again. Continue?`);
      if (!ok) return;
    }
    setBulkRestoring(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-restore-dismissed-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({

          actor: actor.trim(),
          plantName: dismissalsScopeKey,
          ids: opts.ids,
          olderThanDays: opts.olderThanDays,
        }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { removed: number };
      toast({
        title: result.removed > 0 ? "Dismissals restored" : "No dismissals matched",
        description: result.removed > 0
          ? `${result.removed} name-pair${result.removed === 1 ? "" : "s"} can suggest themselves again.`
          : "Nothing matched the selected criteria.",
      });
      setSelectedDismissedIds({});
      await fetchDismissedPairs();
    } catch (err) {
      toast({ title: "Bulk restore failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBulkRestoring(false);
    }
  };

  const restoreDismissedPair = async (p: DismissedPair) => {
    if (!isAdmin) return;
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    setRestoringDismissalId(p.id);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/restore-dismissed-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actor: actor.trim(), id: p.id }),
      });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error(await res.text());
      toast({
        title: "Dismissal removed",
        description: `${p.nameA} ↔ ${p.nameB} can suggest itself again.`,
      });
      await fetchDismissedPairs();
    } catch (err) {
      toast({ title: "Failed to restore", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setRestoringDismissalId(null);
    }
  };

  const dismissedActors = useMemo(() => {
    const set = new Set<string>();
    for (const p of dismissedPairs || []) {
      if (p.dismissedBy) set.add(p.dismissedBy);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dismissedPairs]);

  const filteredDismissedPairs = useMemo(() => {
    if (!dismissedPairs) return [];
    const q = dismissedNameFilter.trim().toUpperCase();
    const fromTs = dismissedDateFrom ? new Date(dismissedDateFrom + "T00:00:00").getTime() : null;
    // dateTo is inclusive — include the entire day
    const toTs = dismissedDateTo ? new Date(dismissedDateTo + "T23:59:59.999").getTime() : null;
    return dismissedPairs.filter((p) => {
      if (q && !(p.nameA.toUpperCase().includes(q) || p.nameB.toUpperCase().includes(q))) return false;
      if (dismissedActorFilter !== "__all__" && p.dismissedBy !== dismissedActorFilter) return false;
      if (fromTs !== null || toTs !== null) {
        const ts = new Date(p.dismissedAt).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [dismissedPairs, dismissedNameFilter, dismissedActorFilter, dismissedDateFrom, dismissedDateTo]);

  const selectedDismissedCount = useMemo(
    () => Object.values(selectedDismissedIds).filter(Boolean).length,
    [selectedDismissedIds],
  );

  const selectedAliasActivityCount = useMemo(
    () => Object.values(selectedAliasActivityIds).filter(Boolean).length,
    [selectedAliasActivityIds],
  );

  // Export the currently filtered dismissed-pairs list to a CSV that opens
  // cleanly in Excel / Google Sheets. Columns mirror the on-screen list:
  // name A, name B, dismissed by, dismissed at (ISO), plant. Honors the
  // active plant scope and all panel filters because the source list
  // (`filteredDismissedPairs`) already does.
  const downloadDismissedPairsCsv = () => {
    const rowsToExport = filteredDismissedPairs;
    if (rowsToExport.length === 0) {
      toast({ title: "Nothing to export", description: "No dismissed pairs match the current filters.", variant: "destructive" });
      return;
    }
    const escape = (v: string | number) => {
      let s = String(v ?? "");
      // Defuse spreadsheet formula-injection: a cell that starts with =, +,
      // -, @, tab or CR is interpreted as a formula by Excel/Sheets. Prefix
      // with a single quote so it shows as plain text.
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const plantLabel = (name: string) =>
      name === ALL_PLANTS_SENTINEL ? "All plants" : name;
    const header = ["Name A", "Name B", "Dismissed by", "Dismissed at", "Plant"];
    const lines = [header.join(",")];
    for (const p of rowsToExport) {
      lines.push([
        escape(p.nameA),
        escape(p.nameB),
        escape(p.dismissedBy),
        escape(new Date(p.dismissedAt).toISOString()),
        escape(plantLabel(p.plantName || dismissalsScopeKey)),
      ].join(","));
    }
    // BOM so Excel detects UTF-8 for non-ASCII names.
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const scopeSlug = (dismissalsScopeKey === ALL_PLANTS_SENTINEL ? "all-plants" : dismissalsScopeKey)
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      || "plant";
    const a = document.createElement("a");
    a.href = url;
    a.download = `dismissed-name-pairs_${scopeSlug}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: `Exported ${rowsToExport.length} dismissed pair${rowsToExport.length === 1 ? "" : "s"}`,
    });
  };

  const totals = useMemo(() => {
    if (!rows) return { workers: 0, items: 0 };
    return { workers: rows.length, items: rows.reduce((a, r) => a + r.count, 0) };
  }, [rows]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Admin access required</h2>
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
        <Link href={backLink}>
          <Button variant="outline" data-testid="button-back-no-access">Go back</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Users className="w-6 h-6 text-amber-700 dark:text-amber-500" />
        <h1 className="text-2xl font-bold flex-1">Review UNKNOWN-tagged Shift-Log Workers</h1>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
        <div>
          <div className="font-semibold text-amber-800 dark:text-amber-300">Admin only — clean up legacy plant shift-log workers.</div>
          <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            These workers were auto-tagged <span className="font-mono">UNKNOWN CONTRACTOR</span> or
            <span className="font-mono"> OTHER</span> when historical shift logs were back-filled.
            Pick the real contractor / category / gender for each name and apply — every shift-log row of that
            worker (across all dates) is updated in one go. Once cleaned, they drop off this list.
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Plant (site)</Label>
            <Select value={plantFilter || "__all__"} onValueChange={(v) => setPlantFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger data-testid="select-plant-filter">
                <SelectValue placeholder="All plants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All plants</SelectItem>
                {(plantNames || []).map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] text-muted-foreground">
              Dismissals are remembered per plant — switching here changes which 'not a duplicate' decisions are loaded.
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Date from</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div className="space-y-1.5">
            <Label>Date to</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
          <div className="space-y-1.5">
            <Label>Filter by name</Label>
            <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="e.g. RAJU" data-testid="input-filter-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Operator name (audit log)</Label>
            <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. Ramesh K." data-testid="input-actor" />
          </div>
          <div className="md:col-span-4 flex gap-2">
            <Button onClick={fetchRows} disabled={loading} data-testid="button-load">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Load workers needing review
            </Button>
            {rows && (
              <div className="text-sm text-muted-foreground self-center" data-testid="text-totals">
                {totals.workers} worker name(s) · {totals.items} shift-log row(s)
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-recent-merges">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            Recent activity (last 30 days)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchRecentMerges}
            disabled={loadingRecent}
            data-testid="button-refresh-recent-merges"
          >
            {loadingRecent ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Every merge, relabel, "not a duplicate" dismissal and restore done from this screen
            shows up here. Hit Undo within 30 days to restore every affected shift-log row to its
            original worker name, contractor, category and gender.
          </div>
          {recentActivityFeed === null ? (
            <div className="text-sm text-muted-foreground py-2" data-testid="text-recent-merges-loading">
              Loading…
            </div>
          ) : recentActivityFeed.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2" data-testid="text-recent-merges-empty">
              No merges, dismissals or restores in the last 30 days.
            </div>
          ) : (
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b">
                  <tr>
                    <th className="text-left p-2">When</th>
                    <th className="text-left p-2">By</th>
                    <th className="text-left p-2">Action</th>
                    <th className="text-left p-2">Rows</th>
                    <th className="text-left p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivityFeed.map(entry => {
                    const when = new Date(entry.createdAt);
                    if (entry.kind === "merge") {
                      const m = entry.merge;
                      const fromList = m.fromNames.join(", ");
                      return (
                        <tr key={`m-${m.id}`} className="border-b last:border-0 align-top" data-testid={`row-recent-merge-${m.id}`}>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {when.toLocaleDateString()}<br />
                            <span className="text-muted-foreground">{when.toLocaleTimeString()}</span>
                          </td>
                          <td className="p-2 text-xs">{m.actor}</td>
                          <td className="p-2 text-xs">
                            <div className="font-medium">
                              {m.isMerge ? "Merge" : "Relabel"}: <span className="font-mono">{fromList}</span> → <span className="font-mono">{m.toName}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {m.contractorName} · {m.category} · {m.gender}
                            </div>
                          </td>
                          <td className="p-2 tabular-nums">{m.rowCount}</td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-400 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                              disabled={undoingId === m.id || actor.trim().length < 2}
                              onClick={() => undoMerge(m)}
                              data-testid={`button-undo-merge-${m.id}`}
                            >
                              {undoingId === m.id
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Undo2 className="w-4 h-4 mr-2" />}
                              Undo
                            </Button>
                          </td>
                        </tr>
                      );
                    }
                    const a = entry.activity;
                    const plantText = a.plantName === ALL_PLANTS_SENTINEL ? "All plants" : a.plantName;
                    const actionLabel =
                      a.action === "dismiss" ? "Marked not-a-duplicate"
                      : a.action === "restore" ? "Restored dismissal"
                      : "Bulk restored dismissals";
                    const actionColor =
                      a.action === "dismiss" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
                    // Single-pair actions get the full "A ↔ B" rendered. Bulk
                    // actions are summarised as a count, with the first few
                    // pairs shown for context — same row, no extra UI.
                    const previewPairs = a.pairs.slice(0, 3);
                    const overflow = a.pairs.length - previewPairs.length;
                    return (
                      <tr key={`d-${a.id}`} className="border-b last:border-0 align-top" data-testid={`row-recent-dup-${a.id}`}>
                        <td className="p-2 text-xs whitespace-nowrap">
                          {when.toLocaleDateString()}<br />
                          <span className="text-muted-foreground">{when.toLocaleTimeString()}</span>
                        </td>
                        <td className="p-2 text-xs">{a.actor}</td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${actionColor}`}>
                              {actionLabel}
                            </span>
                            {a.action === "bulk_restore" && (
                              <span className="text-muted-foreground text-[11px]">
                                {a.pairCount} pair{a.pairCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {previewPairs.map((p, i) => (
                              <div key={i} className="font-mono text-xs">
                                {p[0]} <span className="text-muted-foreground">↔</span> {p[1]}
                              </div>
                            ))}
                            {overflow > 0 && (
                              <div className="text-muted-foreground text-[11px]">
                                + {overflow} more pair{overflow === 1 ? "" : "s"}
                              </div>
                            )}
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">
                            scope: {plantText}
                          </div>
                        </td>
                        <td className="p-2 tabular-nums text-muted-foreground">—</td>
                        <td className="p-2"></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-manage-aliases">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-700 dark:text-purple-300" />
            Manage aliases
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAliasPanel(s => !s)}
            data-testid="button-toggle-alias-panel"
          >
            {showAliasPanel ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showAliasPanel && (
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Teach the duplicate-suggester new short forms or local nicknames (e.g.
              <span className="font-mono"> CHIKKU ↔ CHANDRA</span>) without doing a merge first.
              Custom aliases are applied alongside the built-in dictionary
              (MD./MOHAMMED, SK/SHEIKH, …) and the patterns mined from past merges.
              You can also mute a noisy auto-mined alias to suppress it without
              having to undo the merge that created it.
            </div>

            <div className="rounded-md border border-purple-300 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/40 p-3">
              <div className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">
                Add a custom alias
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Token A</Label>
                  <Input
                    value={newAliasA}
                    onChange={(e) => setNewAliasA(e.target.value)}
                    placeholder="e.g. CHIKKU"
                    className="h-8 text-xs uppercase w-40"
                    data-testid="input-new-alias-a"
                  />
                </div>
                <span className="text-muted-foreground pb-2">↔</span>
                <div className="space-y-1">
                  <Label className="text-xs">Token B</Label>
                  <Input
                    value={newAliasB}
                    onChange={(e) => setNewAliasB(e.target.value)}
                    placeholder="e.g. CHANDRA"
                    className="h-8 text-xs uppercase w-40"
                    data-testid="input-new-alias-b"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={submitNewAlias}
                  disabled={
                    savingAlias
                    || !newAliasA.trim()
                    || !newAliasB.trim()
                    || actor.trim().length < 2
                  }
                  className="h-8 bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="button-add-custom-alias"
                >
                  {savingAlias
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <Combine className="w-3.5 h-3.5 mr-1" />}
                  Add alias
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Tokens are case-insensitive and stored UPPER-cased. Punctuation/spaces are stripped.
              </div>
            </div>

            <div data-testid="section-recent-alias-changes">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-semibold">
                  Recent alias changes ({(recentAliasActivity || []).length})
                </div>
                <div className="flex items-center gap-1.5">
                  {(recentAliasActivity || []).length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={loadingRecent || bulkRevertingAlias}
                        onClick={() => {
                          const all = recentAliasActivity || [];
                          const allSelected = all.length > 0 && all.every(a => selectedAliasActivityIds[a.id]);
                          const next: Record<number, boolean> = {};
                          if (!allSelected) {
                            for (const a of all) next[a.id] = true;
                          }
                          setSelectedAliasActivityIds(next);
                        }}
                        data-testid="button-alias-activity-toggle-all"
                      >
                        {(recentAliasActivity || []).every(a => selectedAliasActivityIds[a.id])
                          ? "Unselect all"
                          : "Select all"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px] border-purple-400 text-purple-800 dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-purple-950"
                        disabled={bulkRevertingAlias || selectedAliasActivityCount === 0 || actor.trim().length < 2}
                        onClick={bulkRevertAliasActivity}
                        data-testid="button-alias-activity-bulk-revert"
                      >
                        {bulkRevertingAlias
                          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          : <Undo2 className="w-3.5 h-3.5 mr-1" />}
                        Revert selected ({selectedAliasActivityCount})
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={fetchRecentMerges}
                    disabled={loadingRecent}
                    data-testid="button-refresh-recent-alias-changes"
                  >
                    {loadingRecent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Refresh"}
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                Last 30 days of add / remove / mute / unmute actions in the alias dictionary.
                Check rows and hit Revert selected to undo many changes in one step.
              </div>
              {recentAliasActivity === null ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-recent-alias-changes-loading">
                  Loading…
                </div>
              ) : recentAliasActivity.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-recent-alias-changes-empty">
                  No alias add/remove/mute actions in the last 30 days.
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-auto" data-testid="list-recent-alias-changes">
                  {recentAliasActivity.map(a => {
                    const when = new Date(a.createdAt);
                    const isAdd = a.action === "add";
                    // Map (action, kind) to a human label and badge tone. Mute
                    // = add of a suppress_learned* row; Unmute = remove of one.
                    const isMute = a.kind !== "alias";
                    const label = isMute
                      ? (isAdd ? "Muted learned alias" : "Unmuted learned alias")
                      : (isAdd ? "Added custom alias" : "Removed custom alias");
                    const badgeTone = isAdd
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
                    const revertLabel = isAdd ? "Remove" : "Re-add";
                    return (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-purple-900/20 rounded px-2 py-1 text-xs border border-purple-200 dark:border-purple-800"
                        data-testid={`alias-activity-${a.id}`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer shrink-0"
                          checked={!!selectedAliasActivityIds[a.id]}
                          onChange={(ev) => {
                            const checked = ev.target.checked;
                            setSelectedAliasActivityIds(prev => {
                              const next = { ...prev };
                              if (checked) next[a.id] = true;
                              else delete next[a.id];
                              return next;
                            });
                          }}
                          data-testid={`checkbox-alias-activity-${a.id}`}
                          aria-label={`Select ${a.tokenA} ↔ ${a.tokenB}`}
                        />
                        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeTone}`}>
                          {label}
                        </span>
                        <span className="font-mono">{a.tokenA}</span>
                        <span className="text-muted-foreground">↔</span>
                        <span className="font-mono">{a.tokenB}</span>
                        <span className="text-muted-foreground ml-2">
                          by {a.actor} · {when.toLocaleDateString()} {when.toLocaleTimeString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 ml-auto text-purple-800 dark:text-purple-200"
                          disabled={revertingAliasActivityId === a.id || bulkRevertingAlias || actor.trim().length < 2}
                          onClick={() => revertAliasActivity(a)}
                          data-testid={`button-revert-alias-activity-${a.id}`}
                          title={isAdd
                            ? `Remove ${a.tokenA} ↔ ${a.tokenB} from the dictionary`
                            : `Re-add ${a.tokenA} ↔ ${a.tokenB} to the dictionary`}
                        >
                          {revertingAliasActivityId === a.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Undo2 className="w-3.5 h-3.5 mr-1" />{revertLabel}</>}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold mb-1.5">
                Custom aliases ({(customAliases || []).filter(c => c.kind === "alias").length})
              </div>
              {customAliases === null ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-custom-aliases-loading">Loading…</div>
              ) : customAliases.filter(c => c.kind === "alias").length === 0 ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-custom-aliases-empty">
                  No custom aliases yet. Add one above to teach the suggester a new equivalence.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-auto" data-testid="list-custom-aliases">
                  {customAliases.filter(c => c.kind === "alias").map(c => {
                    const when = new Date(c.createdAt);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-purple-900/20 rounded px-2 py-1 text-xs border border-purple-200 dark:border-purple-800"
                        data-testid={`custom-alias-${c.id}`}
                      >
                        <span className="font-mono">{c.tokenA}</span>
                        <span className="text-muted-foreground">↔</span>
                        <span className="font-mono">{c.tokenB}</span>
                        <span className="text-muted-foreground ml-2">
                          by {c.createdBy} · {when.toLocaleDateString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 ml-auto text-rose-700 dark:text-rose-300"
                          disabled={deletingAliasId === c.id || actor.trim().length < 2}
                          onClick={() => deleteCustomAlias(c.id)}
                          data-testid={`button-delete-custom-alias-${c.id}`}
                        >
                          {deletingAliasId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><X className="w-3.5 h-3.5 mr-1" />Remove</>}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold mb-1.5">
                Auto-learned full-name pairs ({learnedAliases?.pairs.length || 0})
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                Whole-name equivalences mined from past merges. Click <span className="font-mono">Mute</span> to
                stop a noisy pattern from biasing future suggestions without undoing the merges that taught it.
              </div>
              {!learnedAliases ? (
                <div className="text-xs text-muted-foreground py-2">Loading…</div>
              ) : learnedAliases.pairs.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-learned-full-pairs-empty">
                  No learned full-name pairs yet. They appear here automatically as you confirm merges.
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-auto" data-testid="list-learned-full-pairs">
                  {learnedAliases.pairs.map(p => {
                    const ua = p.a.toUpperCase().trim();
                    const ub = p.b.toUpperCase().trim();
                    const fullKey = ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
                    const suppressed = (customAliases || []).some(
                      c => c.kind === "suppress_learned_pair"
                        && ((c.tokenA === ua && c.tokenB === ub) || (c.tokenA === ub && c.tokenB === ua))
                    );
                    return (
                      <div
                        key={fullKey}
                        className={
                          "rounded px-2 py-1 text-xs border " +
                          (suppressed
                            ? "bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 opacity-70"
                            : "bg-white/70 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900")
                        }
                        data-testid={`learned-full-pair-${fullKey}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono">{p.a}</span>
                          <span className="text-muted-foreground">↔</span>
                          <span className="font-mono">{p.b}</span>
                          <span className="text-muted-foreground ml-2">
                            confirmed {p.count}× by past merge{p.count === 1 ? "" : "s"}
                          </span>
                          {suppressed && (
                            <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              muted
                            </span>
                          )}
                          {!suppressed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 ml-auto text-amber-700 dark:text-amber-300"
                              disabled={suppressingPairKey === fullKey || actor.trim().length < 2}
                              onClick={() => suppressLearnedFullPair(p.a, p.b)}
                              data-testid={`button-suppress-learned-pair-${fullKey}`}
                            >
                              {suppressingPairKey === fullKey
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <><X className="w-3.5 h-3.5 mr-1" />Mute</>}
                            </Button>
                          )}
                        </div>
                        {p.examples && p.examples.length > 0 && (
                          <div className="mt-1 pl-2 border-l border-emerald-200 dark:border-emerald-900 space-y-0.5">
                            {p.examples.map(ex => {
                              const when = new Date(ex.createdAt);
                              return (
                                <div
                                  key={ex.batchId}
                                  className="text-[11px] text-muted-foreground"
                                  data-testid={`learned-full-pair-example-${fullKey}-${ex.batchId}`}
                                >
                                  e.g. <span className="font-mono">{ex.from}</span> →{" "}
                                  <span className="font-mono">{ex.to}</span>
                                  <span> · by {ex.actor} on {when.toLocaleDateString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold mb-1.5">
                Auto-learned token aliases ({learnedAliases?.tokenPairs.length || 0})
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                Token equivalences mined from past merges. Click <span className="font-mono">Mute</span> to
                suppress a noisy one without undoing the merge that created it.
              </div>
              {!learnedAliases ? (
                <div className="text-xs text-muted-foreground py-2">Loading…</div>
              ) : learnedAliases.tokenPairs.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2" data-testid="text-learned-token-pairs-empty">
                  No learned token-pairs yet. They appear here automatically as you confirm merges.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-auto" data-testid="list-learned-token-pairs">
                  {learnedAliases.tokenPairs.map(p => {
                    const ua = p.a.toUpperCase().trim();
                    const ub = p.b.toUpperCase().trim();
                    const tokenKey = ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
                    const suppressed = (customAliases || []).some(
                      c => c.kind === "suppress_learned"
                        && ((c.tokenA === ua && c.tokenB === ub) || (c.tokenA === ub && c.tokenB === ua))
                    );
                    return (
                      <div
                        key={tokenKey}
                        className={
                          "rounded px-2 py-1 text-xs border " +
                          (suppressed
                            ? "bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 opacity-70"
                            : "bg-white/70 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900")
                        }
                        data-testid={`learned-token-pair-${tokenKey}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono">{p.a}</span>
                          <span className="text-muted-foreground">↔</span>
                          <span className="font-mono">{p.b}</span>
                          <span className="text-muted-foreground ml-2">
                            confirmed {p.count}× by past merge{p.count === 1 ? "" : "s"}
                          </span>
                          {suppressed && (
                            <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              muted
                            </span>
                          )}
                          {!suppressed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 ml-auto text-amber-700 dark:text-amber-300"
                              disabled={suppressingTokenKey === tokenKey || actor.trim().length < 2}
                              onClick={() => suppressLearnedTokenPair(p.a, p.b)}
                              data-testid={`button-suppress-learned-${tokenKey}`}
                            >
                              {suppressingTokenKey === tokenKey
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <><X className="w-3.5 h-3.5 mr-1" />Mute</>}
                            </Button>
                          )}
                        </div>
                        {p.examples && p.examples.length > 0 && (
                          <div className="mt-1 pl-2 border-l border-emerald-200 dark:border-emerald-900 space-y-0.5">
                            {p.examples.map(ex => {
                              const when = new Date(ex.createdAt);
                              return (
                                <div
                                  key={ex.batchId}
                                  className="text-[11px] text-muted-foreground"
                                  data-testid={`learned-token-pair-example-${tokenKey}-${ex.batchId}`}
                                >
                                  e.g. <span className="font-mono">{ex.from}</span> →{" "}
                                  <span className="font-mono">{ex.to}</span>
                                  <span> · by {ex.actor} on {when.toLocaleDateString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(customAliases || []).some(c => c.kind === "suppress_learned" || c.kind === "suppress_learned_pair") && (
              <div>
                <div className="text-sm font-semibold mb-1.5">
                  Muted learned aliases ({(customAliases || []).filter(c => c.kind === "suppress_learned" || c.kind === "suppress_learned_pair").length})
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">
                  These auto-mined patterns (token-pairs and full-name pairs) are currently
                  suppressed. Remove a row to let them trigger duplicate suggestions again.
                </div>
                <div className="space-y-1 max-h-48 overflow-auto" data-testid="list-suppressed-learned">
                  {(customAliases || []).filter(c => c.kind === "suppress_learned" || c.kind === "suppress_learned_pair").map(c => {
                    const when = new Date(c.createdAt);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-slate-800/40 rounded px-2 py-1 text-xs border border-slate-300 dark:border-slate-700"
                        data-testid={`suppressed-learned-${c.id}`}
                      >
                        <span className="font-mono">{c.tokenA}</span>
                        <span className="text-muted-foreground">↔</span>
                        <span className="font-mono">{c.tokenB}</span>
                        <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {c.kind === "suppress_learned_pair" ? "full name" : "token"}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          muted by {c.createdBy} · {when.toLocaleDateString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 ml-auto text-emerald-700 dark:text-emerald-300"
                          disabled={deletingAliasId === c.id || actor.trim().length < 2}
                          onClick={() => deleteCustomAlias(c.id)}
                          data-testid={`button-unmute-${c.id}`}
                        >
                          {deletingAliasId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Undo2 className="w-3.5 h-3.5 mr-1" />Unmute</>}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dismissedPairs && dismissedPairs.length > 0 && (
              <div
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 text-xs"
                data-testid="dismissed-pairs-panel"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Undo2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                  <span className="font-medium text-slate-800 dark:text-slate-200" data-testid="text-dismissed-pairs-count">
                    {dismissedPairs.length} name-pair{dismissedPairs.length === 1 ? "" : "s"} marked 'not a duplicate'
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 ml-auto text-slate-700 dark:text-slate-300"
                    onClick={() => setShowDismissedList(s => !s)}
                    data-testid="button-toggle-dismissed-list"
                  >
                    {showDismissedList ? "Hide" : "Show / restore"}
                  </Button>
                </div>
                {showDismissedList && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Filter by name</Label>
                        <Input
                          value={dismissedNameFilter}
                          onChange={(e) => setDismissedNameFilter(e.target.value)}
                          placeholder="e.g. RAJU"
                          className="h-8 text-xs"
                          data-testid="input-dismissed-filter-name"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Dismissed by</Label>
                        <Select value={dismissedActorFilter} onValueChange={setDismissedActorFilter}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-dismissed-actor-filter">
                            <SelectValue placeholder="Any operator" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Any operator</SelectItem>
                            {dismissedActors.map(a => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">From date</Label>
                        <Input
                          type="date"
                          value={dismissedDateFrom}
                          onChange={(e) => setDismissedDateFrom(e.target.value)}
                          className="h-8 text-xs"
                          data-testid="input-dismissed-date-from"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">To date</Label>
                        <Input
                          type="date"
                          value={dismissedDateTo}
                          onChange={(e) => setDismissedDateTo(e.target.value)}
                          className="h-8 text-xs"
                          data-testid="input-dismissed-date-to"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground" data-testid="text-dismissed-filtered-count">
                        Showing {filteredDismissedPairs.length} of {dismissedPairs.length}
                      </span>
                      {(dismissedNameFilter || dismissedActorFilter !== "__all__" || dismissedDateFrom || dismissedDateTo) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setDismissedNameFilter("");
                            setDismissedActorFilter("__all__");
                            setDismissedDateFrom("");
                            setDismissedDateTo("");
                          }}
                          data-testid="button-dismissed-clear-filters"
                        >
                          Clear filters
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={filteredDismissedPairs.length === 0}
                          onClick={downloadDismissedPairsCsv}
                          data-testid="button-dismissed-download-csv"
                          title="Download the currently filtered dismissed-pairs list as a CSV (opens in Excel / Google Sheets)"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Download CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={filteredDismissedPairs.length === 0}
                          onClick={() => {
                            const next: Record<number, boolean> = { ...selectedDismissedIds };
                            const allSelected = filteredDismissedPairs.every(p => next[p.id]);
                            for (const p of filteredDismissedPairs) {
                              if (allSelected) delete next[p.id];
                              else next[p.id] = true;
                            }
                            setSelectedDismissedIds(next);
                          }}
                          data-testid="button-dismissed-toggle-all"
                        >
                          {filteredDismissedPairs.length > 0 && filteredDismissedPairs.every(p => selectedDismissedIds[p.id])
                            ? "Unselect all (filtered)"
                            : "Select all (filtered)"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-emerald-400 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          disabled={
                            bulkRestoring
                            || selectedDismissedCount === 0
                            || actor.trim().length < 2
                          }
                          onClick={() => {
                            const ids = Object.entries(selectedDismissedIds)
                              .filter(([, v]) => v)
                              .map(([k]) => Number(k))
                              .filter(n => Number.isFinite(n));
                            bulkRestoreDismissed({
                              ids,
                              description: `Bulk-restore ${ids.length} selected dismissal${ids.length === 1 ? "" : "s"}.`,
                            });
                          }}
                          data-testid="button-dismissed-bulk-restore"
                        >
                          {bulkRestoring
                            ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            : <Undo2 className="w-3.5 h-3.5 mr-1" />}
                          Restore selected ({selectedDismissedCount})
                        </Button>
                        <div className="flex items-center gap-1">
                          <Label className="text-[11px] whitespace-nowrap">Clear older than</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={purgeOlderDays}
                            onChange={(e) => setPurgeOlderDays(e.target.value)}
                            className="h-7 w-16 text-xs"
                            data-testid="input-dismissed-purge-days"
                          />
                          <span className="text-[11px] text-muted-foreground">days</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-rose-400 text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950"
                            disabled={
                              bulkRestoring
                              || actor.trim().length < 2
                              || !(Number.isFinite(Number(purgeOlderDays)) && Number(purgeOlderDays) >= 0)
                            }
                            onClick={() => {
                              const days = Number(purgeOlderDays);
                              bulkRestoreDismissed({
                                olderThanDays: days,
                                description: `Clear every dismissal older than ${days} day${days === 1 ? "" : "s"} for the current plant scope.`,
                              });
                            }}
                            data-testid="button-dismissed-purge-old"
                          >
                            {bulkRestoring
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <X className="w-3.5 h-3.5 mr-1" />}
                            Purge old
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-60 overflow-auto">
                      {filteredDismissedPairs.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground px-2 py-3 text-center" data-testid="text-dismissed-empty">
                          No dismissed pairs match the current filters.
                        </div>
                      ) : filteredDismissedPairs.map(p => {
                        const when = new Date(p.dismissedAt);
                        return (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-slate-800/40 rounded px-2 py-1"
                            data-testid={`dismissed-pair-${p.id}`}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 cursor-pointer"
                              checked={!!selectedDismissedIds[p.id]}
                              onChange={(ev) => {
                                const checked = ev.target.checked;
                                setSelectedDismissedIds(prev => {
                                  const next = { ...prev };
                                  if (checked) next[p.id] = true;
                                  else delete next[p.id];
                                  return next;
                                });
                              }}
                              data-testid={`checkbox-dismissed-${p.id}`}
                              aria-label={`Select ${p.nameA} ↔ ${p.nameB}`}
                            />
                            <span className="font-mono">{p.nameA}</span>
                            <span className="text-muted-foreground">↔</span>
                            <span className="font-mono">{p.nameB}</span>
                            <span className="text-muted-foreground ml-2" data-testid={`text-dismissed-meta-${p.id}`}>
                              by {p.dismissedBy} · {when.toLocaleDateString()} {when.toLocaleTimeString()}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 ml-auto text-emerald-700 dark:text-emerald-300"
                              disabled={restoringDismissalId === p.id || actor.trim().length < 2}
                              onClick={() => restoreDismissedPair(p)}
                              data-testid={`button-restore-dismissed-${p.id}`}
                            >
                              {restoringDismissalId === p.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <><Undo2 className="w-3.5 h-3.5 mr-1" />Restore</>}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {visibleClusters.length > 0 && (
              <div className="rounded-md border border-purple-300 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-800 p-3 space-y-2" data-testid="suggestions-panel">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                  <div className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                    {visibleClusters.length} suggested duplicate group{visibleClusters.length === 1 ? "" : "s"}
                  </div>
                  <div className="text-xs text-purple-900/70 dark:text-purple-200/70">
                    (typos, phonetic spellings, reordered tokens, short-form aliases like MD./MOHAMMED, prior-merge patterns, or shared role + contractor with overlapping name tokens)
                  </div>
                </div>
                <div className="space-y-1.5">
                  {visibleClusters.map(c => (
                    <div
                      key={c.key}
                      className="flex flex-wrap items-center gap-2 text-xs bg-white/60 dark:bg-purple-900/30 rounded px-2 py-1.5"
                      data-testid={`suggestion-${c.canonical}`}
                    >
                      <span className="font-medium">Keep <span className="font-mono">{c.canonical}</span>, merge:</span>
                      <span className="font-mono">{c.names.filter(n => n !== c.canonical).join(", ")}</span>
                      {c.reasonChips.length > 0 && (
                        <div className="basis-full flex flex-wrap gap-1 mt-0.5" data-testid={`suggestion-reasons-${c.canonical}`}>
                          <span className="text-[10px] uppercase tracking-wide text-purple-900/70 dark:text-purple-200/70 mr-1">Why:</span>
                          {c.reasonChips.map((chip, idx) => (
                            <span
                              key={idx}
                              className={
                                chip.learned
                                  ? "text-[10px] rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700 cursor-help"
                                  : "text-[10px] rounded px-1.5 py-0.5 bg-purple-100/70 text-purple-900 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800 cursor-help"
                              }
                              title={chip.tooltip}
                              data-testid={`suggestion-reason-chip-${c.canonical}-${idx}`}
                            >
                              {chip.short}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 border-purple-400 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900"
                          onClick={() => acceptCluster(c)}
                          data-testid={`button-accept-suggestion-${c.canonical}`}
                        >
                          <Combine className="w-3.5 h-3.5 mr-1" />
                          Pre-select
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-muted-foreground"
                          onClick={() => dismissCluster(c)}
                          disabled={savingDismissalKey === c.key || actor.trim().length < 2}
                          title={actor.trim().length < 2 ? "Enter operator name first" : "Mark as 'not a duplicate' (saved permanently)"}
                          data-testid={`button-dismiss-suggestion-${c.canonical}`}
                          aria-label="Dismiss suggestion"
                        >
                          {savingDismissalKey === c.key
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const selectedNames = Object.keys(selected).filter(n => selected[n]);
              if (selectedNames.length < 2) return null;
              return (
                <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 p-3 flex flex-wrap items-end gap-3" data-testid="merge-bar">
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Merge {selectedNames.length} duplicate name(s) into one
                    </div>
                    <div className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-0.5">
                      Selected: {selectedNames.join(", ")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Keep this spelling</Label>
                    <Select value={mergeTarget} onValueChange={setMergeTarget}>
                      <SelectTrigger className="min-w-[180px]" data-testid="select-merge-target">
                        <SelectValue placeholder="Pick canonical name" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedNames.map(n => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={submitMerge}
                    disabled={merging || !mergeTarget || actor.trim().length < 2}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-merge"
                  >
                    {merging
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Combine className="w-4 h-4 mr-2" />}
                    Merge into {mergeTarget || "…"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setSelected({}); setMergeTarget(""); }}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                </div>
              );
            })()}
            {filteredRows.length === 0 ? (
              <div className="p-3 text-center text-muted-foreground text-sm" data-testid="text-empty">
                Nothing to clean up — every worker already has a real contractor and category. Nice.
              </div>
            ) : (
              <div className="overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-8" title="Select to merge">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="text-left p-2">Worker name</th>
                      <th className="text-left p-2">Rows</th>
                      <th className="text-left p-2">Date range</th>
                      <th className="text-left p-2">Current</th>
                      <th className="text-left p-2 min-w-[180px]">New contractor</th>
                      <th className="text-left p-2 min-w-[140px]">Category</th>
                      <th className="text-left p-2 min-w-[110px]">Gender</th>
                      <th className="text-left p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(r => {
                      const e = edits[r.name] || { contractor: "", category: "", gender: "MALE" };
                      const setField = (patch: Partial<typeof e>) => {
                        setEdits(prev => ({ ...prev, [r.name]: { ...e, ...patch } }));
                      };
                      return (
                        <tr key={r.name} className="border-b last:border-0 align-top" data-testid={`row-worker-${r.name}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={!!selected[r.name]}
                              onChange={(ev) => {
                                const checked = ev.target.checked;
                                setSelected(prev => ({ ...prev, [r.name]: checked }));
                                if (!checked && mergeTarget === r.name) setMergeTarget("");
                              }}
                              data-testid={`checkbox-select-${r.name}`}
                              aria-label={`Select ${r.name} for merge`}
                            />
                          </td>
                          <td className="p-2 font-medium">
                            {r.name}
                            {(() => {
                              const c = nameToCluster.get(r.name);
                              if (!c) return null;
                              const why = c.reasonChips.length > 0
                                ? `Why: ${c.reasonChips.map(rc => `${rc.short} — ${rc.tooltip}`).join("\n")}`
                                : "";
                              if (c.canonical === r.name) {
                                return (
                                  <div
                                    className="inline-flex items-center gap-1 ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200"
                                    data-testid={`badge-canonical-${r.name}`}
                                    title={why || "Suggested canonical spelling"}
                                  >
                                    <Sparkles className="w-3 h-3" /> suggested keep
                                  </div>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 flex-wrap">
                                  <span
                                    className="inline-flex items-center gap-1 ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700"
                                    data-testid={`badge-dup-${r.name}`}
                                    title={why ? `Possible duplicate of ${c.canonical}\n${why}` : `Possible duplicate of ${c.canonical}`}
                                  >
                                    possible dup of {c.canonical}
                                  </span>
                                  {c.fromLearnedPattern && (
                                    <span
                                      className="inline-flex items-center gap-1 align-middle text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700"
                                      data-testid={`badge-learned-${r.name}`}
                                      title={why || "Matched a previously-confirmed merge pattern"}
                                    >
                                      <Sparkles className="w-3 h-3" /> learned
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                            {r.roles.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">role: {r.roles.join(", ")}</div>
                            )}
                          </td>
                          <td className="p-2 tabular-nums">{r.count}</td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {r.earliestDate}<br />→ {r.latestDate}
                          </td>
                          <td className="p-2 text-xs">
                            <div className={r.needsContractor ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                              {r.currentContractors.join(", ") || "—"}
                            </div>
                            <div className={r.needsCategory ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}>
                              {r.currentCategories.join(", ") || "—"} · {r.currentGenders.join(", ") || "—"}
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              value={e.contractor}
                              onChange={(ev) => setField({ contractor: ev.target.value })}
                              placeholder="Contractor name"
                              list="contractor-options"
                              data-testid={`input-contractor-${r.name}`}
                            />
                          </td>
                          <td className="p-2">
                            <Select value={e.category} onValueChange={(v) => setField({ category: v })}>
                              <SelectTrigger data-testid={`select-category-${r.name}`}>
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {LABOUR_CATEGORIES.map(c => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select value={e.gender} onValueChange={(v) => setField({ gender: v })}>
                              <SelectTrigger data-testid={`select-gender-${r.name}`}>
                                <SelectValue placeholder="Gender" />
                              </SelectTrigger>
                              <SelectContent>
                                {LABOUR_GENDERS.map(g => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              disabled={submitting === r.name || !e.contractor || !e.category || !e.gender || actor.trim().length < 2}
                              onClick={() => submitOne(r)}
                              data-testid={`button-apply-${r.name}`}
                            >
                              {submitting === r.name
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Wand2 className="w-4 h-4 mr-2" />}
                              Apply to {r.count}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="contractor-options">
                  {(vendorNames || []).map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
