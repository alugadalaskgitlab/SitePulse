import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Users, Loader2, ShieldAlert, Search, Wand2, Combine, Sparkles, X, Undo2, History } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
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

function isLikelyDup(rawA: string, rawB: string): boolean {
  const a = normalizeName(rawA);
  const b = normalizeName(rawB);
  if (!a || !b) return false;
  if (a === b) return true;
  const partsA = a.split(" ");
  const partsB = b.split(" ");
  // Same first token + the other has just one extra short trailing token (initial / suffix)
  if (partsA[0] === partsB[0]) {
    const longer = partsA.length >= partsB.length ? partsA : partsB;
    const shorter = partsA.length >= partsB.length ? partsB : partsA;
    if (shorter.length === 1 && longer.length === 2 && longer[1].length <= 3) return true;
    if (shorter.length === 2 && longer.length === 3 && longer[2].length <= 3 && shorter[1] === longer[1]) return true;
  }
  // Levenshtein distance ≤ 1 between normalized full strings
  if (levenshtein(a, b) <= 1) return true;
  // Phonetic match for Indian-name spelling variants ≥ 2 edits apart
  if (isPhoneticDup(a, b)) return true;
  return false;
}

type Cluster = { key: string; names: string[]; canonical: string };

function pairKey(a: string, b: string): string {
  const ua = a.toUpperCase().trim();
  const ub = b.toUpperCase().trim();
  return ua < ub ? `${ua}||${ub}` : `${ub}||${ua}`;
}

function buildClusters(rows: ReviewRow[], dismissedPairKeys: Set<string>): Cluster[] {
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
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!isLikelyDup(rows[i].name, rows[j].name)) continue;
      if (dismissedPairKeys.has(pairKey(rows[i].name, rows[j].name))) continue;
      union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  const clusters: Cluster[] = [];
  Array.from(groups.values()).forEach((idxs: number[]) => {
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
    clusters.push({ key: names.join("||"), names, canonical });
  });
  // Largest clusters first
  clusters.sort((a, b) => b.names.length - a.names.length);
  return clusters;
}

export default function PlantShiftLogManpowerReview() {
  const { toast } = useToast();
  const [adminPin, setAdminPin] = useState<string | null>(null);

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

  type DismissedPair = { id: number; nameA: string; nameB: string; dismissedBy: string; dismissedAt: string };
  const [dismissedPairs, setDismissedPairs] = useState<DismissedPair[] | null>(null);
  const [savingDismissalKey, setSavingDismissalKey] = useState<string | null>(null);
  const [restoringDismissalId, setRestoringDismissalId] = useState<number | null>(null);
  const [showDismissedList, setShowDismissedList] = useState(false);

  const { data: vendorNames } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
    enabled: !!adminPin,
  });

  const { data: plantNames } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    enabled: !!adminPin,
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
  const [recentMerges, setRecentMerges] = useState<RecentMerge[] | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [undoingId, setUndoingId] = useState<number | null>(null);

  const fetchRecentMerges = async () => {
    if (!adminPin) return;
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/recent-merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: adminPin }),
      });
      if (res.status === 401) { setAdminPin(null); return; }
      if (!res.ok) throw new Error(await res.text());
      setRecentMerges((await res.json()) as RecentMerge[]);
    } catch (err) {
      toast({ title: "Failed to load recent merges", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoadingRecent(false);
    }
  };

  const fetchDismissedPairs = async () => {
    if (!adminPin) return;
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/dismissed-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: adminPin, plantName: dismissalsScopeKey }),
      });
      if (res.status === 401) { setAdminPin(null); return; }
      if (!res.ok) throw new Error(await res.text());
      setDismissedPairs((await res.json()) as DismissedPair[]);
    } catch (err) {
      toast({ title: "Failed to load dismissed pairs", description: getErrorMessage(err), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (adminPin) {
      fetchRecentMerges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPin]);

  // Refetch dismissed pairs whenever the plant scope changes (or on unlock).
  useEffect(() => {
    if (adminPin) {
      fetchDismissedPairs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPin, dismissalsScopeKey]);

  const undoMerge = async (m: RecentMerge) => {
    if (!adminPin) return;
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
        body: JSON.stringify({ pin: adminPin, actor: actor.trim(), batchId: m.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { restored: number };
      toast({
        title: "Merge undone",
        description: `Restored ${result.restored} shift-log row(s) to their original worker info.`,
      });
      await Promise.all([fetchRecentMerges(), fetchRows()]);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Undo failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setUndoingId(null);
    }
  };

  const fetchRows = async () => {
    if (!adminPin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/review-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pin: adminPin,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          plantName: plantFilter || undefined,
        }),
      });
      if (res.status === 401) {
        setAdminPin(null);
        toast({ title: "Admin PIN required", variant: "destructive" });
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
    if (!adminPin) return;
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
          pin: adminPin,
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
      await Promise.all([fetchRows(), fetchRecentMerges()]);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Relabel failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const submitMerge = async () => {
    if (!adminPin) return;
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
          pin: adminPin,
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
      await Promise.all([fetchRows(), fetchRecentMerges()]);
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
    () => (rows ? buildClusters(rows, dismissedPairKeys) : []),
    [rows, dismissedPairKeys]
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
    if (!adminPin) return;
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
        body: JSON.stringify({ pin: adminPin, actor: actor.trim(), pairs, plantName: dismissalsScopeKey }),
      });
      if (res.status === 401) { setAdminPin(null); return; }
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

  const restoreDismissedPair = async (p: DismissedPair) => {
    if (!adminPin) return;
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
        body: JSON.stringify({ pin: adminPin, actor: actor.trim(), id: p.id }),
      });
      if (res.status === 401) { setAdminPin(null); return; }
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

  const totals = useMemo(() => {
    if (!rows) return { workers: 0, items: 0 };
    return { workers: rows.length, items: rows.reduce((a, r) => a + r.count, 0) };
  }, [rows]);

  if (!adminPin) {
    return (
      <PinAuth
        targetRole="admin"
        onSuccess={(_role, pin) => setAdminPin(pin)}
        onClose={() => { window.history.back(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/plant">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Users className="w-6 h-6 text-amber-700 dark:text-amber-500" />
        <h1 className="text-2xl font-bold flex-1">Review UNKNOWN-tagged Shift-Log Workers</h1>
        <Button variant="ghost" size="sm" onClick={() => setAdminPin(null)} data-testid="button-lock">
          Lock
        </Button>
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
            Recent merges (last 30 days)
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
            Did you merge the wrong two names? Hit Undo within 30 days to restore every affected
            shift-log row to its original worker name, contractor, category and gender.
          </div>
          {recentMerges === null ? (
            <div className="text-sm text-muted-foreground py-2" data-testid="text-recent-merges-loading">
              Loading…
            </div>
          ) : recentMerges.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2" data-testid="text-recent-merges-empty">
              No merges or relabels in the last 30 days.
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
                  {recentMerges.map(m => {
                    const when = new Date(m.createdAt);
                    const fromList = m.fromNames.join(", ");
                    return (
                      <tr key={m.id} className="border-b last:border-0 align-top" data-testid={`row-recent-merge-${m.id}`}>
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
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
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
                <div className="flex items-center gap-2">
                  <Undo2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
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
                  <div className="mt-2 space-y-1 max-h-60 overflow-auto">
                    {dismissedPairs.map(p => {
                      const when = new Date(p.dismissedAt);
                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center gap-2 bg-white/70 dark:bg-slate-800/40 rounded px-2 py-1"
                          data-testid={`dismissed-pair-${p.id}`}
                        >
                          <span className="font-mono">{p.nameA}</span>
                          <span className="text-muted-foreground">↔</span>
                          <span className="font-mono">{p.nameB}</span>
                          <span className="text-muted-foreground ml-2">
                            by {p.dismissedBy} · {when.toLocaleDateString()}
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
                    (trailing punctuation, single trailing token, or 1-character typo)
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
                              if (c.canonical === r.name) {
                                return (
                                  <div
                                    className="inline-flex items-center gap-1 ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200"
                                    data-testid={`badge-canonical-${r.name}`}
                                  >
                                    <Sparkles className="w-3 h-3" /> suggested keep
                                  </div>
                                );
                              }
                              return (
                                <div
                                  className="inline-flex items-center gap-1 ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700"
                                  data-testid={`badge-dup-${r.name}`}
                                  title={`Possible duplicate of ${c.canonical}`}
                                >
                                  possible dup of {c.canonical}
                                </div>
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
