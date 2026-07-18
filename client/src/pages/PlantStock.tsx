import { useState, useMemo, useCallback } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch, useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Layers, Package, Loader2, Search, Calendar, Download, Printer, RefreshCw, ArrowRightLeft, MoveHorizontal, X, RotateCcw, ClipboardList, GitCompare, ExternalLink, AlertTriangle, ShieldAlert } from "lucide-react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { NegativeBalanceBannerMulti } from "@/components/NegativeBalanceBanner";
import type { Party, PlantMaterial, StockLedgerEntry } from "@shared/schema";

type StockBalanceAsOf = {
  materialId: number;
  partyId: number | null;
  uom: string;
  totalIn: number;
  totalOut: number;
  t1TotalIn: number;
  t1TotalOut: number;
  t2TotalIn: number;
  t2TotalOut: number;
};

type ProcessedLedgerEntry = StockLedgerEntry & {
  calculatedBalance: number;
  partyBalance?: number;
  t1BalanceAfter?: number;
  t2BalanceAfter?: number;
  isSynthetic?: boolean;
  _mergedDelta?: number;
  _originalQtyOut?: number;
};

const n = (v: unknown): number | null => (v == null ? null : Number(v));
const normLedger = (e: StockLedgerEntry): StockLedgerEntry => ({
  ...e,
  quantityIn: n(e.quantityIn) as typeof e.quantityIn,
  quantityOut: n(e.quantityOut) as typeof e.quantityOut,
  balanceAfter: n(e.balanceAfter) as typeof e.balanceAfter,
});

export default function PlantStock() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const { companyName, logoFile } = useFeatureFlags();
  const canExport = sectionCan("plant_stock", "view_reports");
  const canReconcile = isAdmin;
  const { getPlantBackLink, appendPlantContext } = useOrigin();
  const queryClient = useQueryClient();
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const [, navigate] = useLocation();
  const [confirmAction, setConfirmAction] = useState<null | "reconcile" | "fix-phantom" | "rebuild" | "reassign">(null);
  const searchString = useSearch();
  const scrollToId = useMemo(() => {
    const sp = new URLSearchParams(searchString);
    const v = sp.get("scrollTo");
    return v ? parseInt(v, 10) : null;
  }, [searchString]);

  const scrollTargetCallbackRef = useCallback((node: HTMLTableRowElement | null) => {
    if (!node || scrollToId == null) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("bg-yellow-100", "dark:bg-yellow-900/30");
    setTimeout(() => {
      node.classList.remove("bg-yellow-100", "dark:bg-yellow-900/30");
      const url = new URL(window.location.href);
      url.searchParams.delete("scrollTo");
      history.replaceState(null, "", url.toString());
    }, 2000);
  }, [scrollToId]);

  const buildLedgerReturnTo = (entryId: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("scrollTo", String(entryId));
    return encodeURIComponent(url.pathname + url.search);
  };

  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_STOCK_FILTER_URL_KEYS = [
    "dateFrom", "dateTo", "selectedPartyId", "selectedMaterialId", "selectedTransactionType", "issuedToFilter",
  ];
  const urlHasStockFilterParams = (() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return PLANT_STOCK_FILTER_URL_KEYS.some((k) => sp.has(k));
  })();
  const [persistedFilters, setPersistedFilters, resetPersistedFilters] = usePersistedFilters(
    "plant-stock:last-filters:v2",
    {
      dateFrom: "",
      dateTo: "",
      selectedPartyId: "all",
      selectedMaterialId: "all",
      selectedTransactionType: "all",
      issuedToFilter: "all",
    },
    { shouldHydrate: !urlHasStockFilterParams },
  );
  const { dateFrom, dateTo, selectedPartyId, selectedMaterialId, selectedTransactionType, issuedToFilter } = persistedFilters;
  const setDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, dateFrom: v }));
  const setDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, dateTo: v }));
  const setSelectedPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, selectedPartyId: v }));
  const setSelectedMaterialId = (v: string) => setPersistedFilters((f) => ({ ...f, selectedMaterialId: v }));
  const setSelectedTransactionType = (v: string) => setPersistedFilters((f) => ({ ...f, selectedTransactionType: v }));
  const setIssuedToFilter = (v: string) => setPersistedFilters((f) => ({ ...f, issuedToFilter: v }));


  // Reconciliation mutation to backfill missing ledger entries
  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/plant-module/reconcile-equipment-usage-ledger', { method: 'POST' });
      if (!res.ok) throw new Error('Reconciliation failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      const created = data.ledgerEntries?.created || 0;
      const cleaned = data.ledgerEntries?.cleaned || 0;
      let description = "";
      if (created > 0) description += `Created ${created} ledger entries. `;
      if (cleaned > 0) description += `Cleaned ${cleaned} orphan entries. `;
      description += "Stock balances updated.";
      toast({
        title: "Data Reconciled",
        description: description.trim(),
      });
    },
    onError: () => {
      toast({
        title: "Reconciliation Failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const [activeTab, setActiveTab] = useState("summary");
  const [selectedTank, setSelectedTank] = useState<"all" | "1" | "2">("all");

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  const { data: allStockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
    select: (rows) => rows.map(r => ({ ...r, balance: Number(r.balance) })),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: allTemplateComponents } = useQuery<{ id: number; templateId: number; materialId: number; percent: number | null; moistureContent?: number | null; wastageFactor?: number | null }[]>({
    queryKey: ["/api/plant-module/mix-template-components"],
  });

  // Filtered ledger URL (with date filter) for Stock Summary and Ledger Details tabs
  const buildLedgerUrl = () => {
    const params = new URLSearchParams();
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/plant-module/stock-ledger?${params.toString()}`;
  };

  // All-time ledger URL (NO date filter) for Current Balances - shows true balances from beginning
  const buildAllTimeLedgerUrl = () => {
    const params = new URLSearchParams();
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    // No date filters - fetch ALL entries from beginning
    return `/api/plant-module/stock-ledger-all?${params.toString()}`;
  };

  // Balance-as-of URL: aggregate query returning per-(material,party,uom) sums up to dateFrom
  const buildBalanceAsOfUrl = () => {
    if (!dateFrom) return null;
    const params = new URLSearchParams({ date: dateFrom });
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    return `/api/plant-module/stock-balance-as-of?${params.toString()}`;
  };

  // Party Statement state
  const [stmtPartyId, setStmtPartyId] = useState<string>("all");
  const [stmtMaterialId, setStmtMaterialId] = useState<string>("all");
  const [stmtDateFrom, setStmtDateFrom] = useState<string>("");
  const [stmtDateTo, setStmtDateTo] = useState<string>("");
  const [stmtEnabled, setStmtEnabled] = useState(false);

  // HLC Reconciliation state — shares selectors with Party Statement
  const [reconEnabled, setReconEnabled] = useState(false);

  const buildStmtUrl = () => {
    if (!stmtEnabled || stmtPartyId === "all" || stmtMaterialId === "all") return null;
    const p = new URLSearchParams({ partyId: stmtPartyId, materialId: stmtMaterialId });
    if (stmtDateFrom) p.set("dateFrom", stmtDateFrom);
    if (stmtDateTo) p.set("dateTo", stmtDateTo);
    return `/api/plant-module/party-statement?${p.toString()}`;
  };
  const stmtUrl = buildStmtUrl();

  const buildReconUrl = () => {
    if (!reconEnabled || stmtPartyId === "all" || stmtMaterialId === "all") return null;
    const p = new URLSearchParams({ partyId: stmtPartyId, materialId: stmtMaterialId });
    if (stmtDateFrom) p.set("dateFrom", stmtDateFrom);
    if (stmtDateTo) p.set("dateTo", stmtDateTo);
    return `/api/plant-module/hlc-borrow-reconciliation?${p.toString()}`;
  };
  const reconUrl = buildReconUrl();

  type PartyStatementResult = {
    summary: { totalReceived: number; dispatchedOwn: number; borrowedFromHlc: number; replenishedToHlc: number; outstanding: number; uom: string };
    entries: (StockLedgerEntry & { displayType: string; borrowedQty: number; runningBalance: number; templateQty?: number; ownQty?: number })[];
  };
  type HlcReconResult = {
    uom: string;
    rows: { date: string; site: string; partyStatementBorrowed: number; hlcLedgerDispatched: number | null; delta: number | null; isLegacy: boolean }[];
    totals: { partyStatementBorrowed: number; hlcLedgerDispatched: number; delta: number };
  };
  const { data: stmtData, isLoading: stmtLoading, refetch: refetchStmt } = useQuery<PartyStatementResult>({
    queryKey: [stmtUrl],
    enabled: !!stmtUrl,
    select: (d) => ({
      summary: {
        totalReceived: Number(d.summary.totalReceived),
        dispatchedOwn: Number(d.summary.dispatchedOwn),
        borrowedFromHlc: Number(d.summary.borrowedFromHlc),
        replenishedToHlc: Number(d.summary.replenishedToHlc),
        outstanding: Number(d.summary.outstanding),
        uom: d.summary.uom,
      },
      entries: d.entries.map(e => ({
        ...normLedger(e as StockLedgerEntry),
        displayType: e.displayType,
        borrowedQty: Number(e.borrowedQty),
        runningBalance: Number(e.runningBalance),
        templateQty: e.templateQty == null ? undefined : Number(e.templateQty),
        ownQty: e.ownQty == null ? undefined : Number(e.ownQty),
      })),
    }),
  });
  const { data: reconData, isLoading: reconLoading, refetch: refetchRecon } = useQuery<HlcReconResult>({
    queryKey: [reconUrl],
    enabled: !!reconUrl,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<StockLedgerEntry[]>({ 
    queryKey: [buildLedgerUrl()],
    select: (rows) => rows.map(normLedger),
  });

  // All-time ledger for Current Balances tab — only fetched when that tab is active
  const { data: allTimeLedger, isLoading: allTimeLedgerLoading } = useQuery<StockLedgerEntry[]>({ 
    queryKey: [buildAllTimeLedgerUrl()],
    enabled: activeTab === "balances",
    select: (rows) => rows.map(normLedger),
  });

  // Aggregate opening-balance query — used instead of full allTimeLedger when dateFrom is set
  const balanceAsOfUrl = buildBalanceAsOfUrl();
  const { data: balanceAsOf, isLoading: balanceAsOfLoading } = useQuery<StockBalanceAsOf[]>({
    queryKey: [balanceAsOfUrl],
    enabled: !!balanceAsOfUrl,
    select: (rows) => rows.map(r => ({
      ...r,
      totalIn: Number(r.totalIn), totalOut: Number(r.totalOut),
      t1TotalIn: Number(r.t1TotalIn), t1TotalOut: Number(r.t1TotalOut),
      t2TotalIn: Number(r.t2TotalIn), t2TotalOut: Number(r.t2TotalOut),
    })),
  });

  const getMaterialName = (id: number) => materials?.find((m) => m.id === id)?.name || `Material ${id}`;
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name || `Party ${id}` : "Unknown";

  // Detect if the currently selected material tracks per-tank stock (Bitumen or LDO).
  // When true: tank filter is visible and T1/T2 balances are shown in the Balance column.
  const isTankedMaterial = (() => {
    if (selectedMaterialId === "all") return false;
    const mat = materials?.find(m => String(m.id) === selectedMaterialId);
    return mat ? /bitumen|ldo/i.test(mat.name) : false;
  })();

  // Filter out old equipment_issue entries (legacy - no longer created) and calculate running balances
  const processedLedger = useMemo(() => {
    if (!ledger) return [];

    // In all-party mode the global physical running balance uses materialId as key;
    // per-party mode uses materialId-partyId (original behaviour).
    const isAllParty = selectedPartyId === "all";
    
    // Exclude old equipment_issue entries - they are legacy and should not affect calculations
    const validEntries = ledger.filter(e => e.transactionType !== 'equipment_issue');
    
    // Transaction type priority: opening/receipt first, then issues/dispatches
    const getTypePriority = (type: string) => {
      switch (type) {
        case 'opening': return 1;
        case 'receipt': return 2;
        case 'adjustment': return 3;
        case 'return': return 4;
        case 'transfer': return 4;
        case 'tank_transfer': return 4;
        case 'direct_purchase': return 5;
        case 'equipment_usage': return 6;
        case 'dpr_equipment_usage': return 6;
        case 'ldo_dip_consumption': return 6;
        case 'ldo_shift_consumption': return 6;
        case 'ldo_heating_consumption': return 6;
        case 'issue': return 7;
        case 'dispatch': return 8;
        default: return 9;
      }
    };
    
    // Sort chronologically (oldest first) for running balance calculation
    const sorted = [...validEntries].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // Within same date, sort by transaction type priority (receipts before issues)
      const typePriorityA = getTypePriority(a.transactionType);
      const typePriorityB = getTypePriority(b.transactionType);
      if (typePriorityA !== typePriorityB) return typePriorityA - typePriorityB;
      // Then by creation time
      const aCreated = a.createdAt ? String(a.createdAt) : '';
      const bCreated = b.createdAt ? String(b.createdAt) : '';
      return aCreated.localeCompare(bCreated);
    });
    
    // Helper to convert quantity based on entry UOM vs material conversion settings
    const getConvertedQty = (entry: StockLedgerEntry, qty: number | null): number => {
      if (!qty) return 0;
      const material = materials?.find(m => m.id === entry.materialId);
      if (!material?.conversionFactor || !material?.conversionFromUom || !material?.conversionToUom) {
        return qty;
      }
      // Only convert if entry UOM matches the source UOM (e.g., CFT)
      if (entry.uom?.toUpperCase() === material.conversionFromUom.toUpperCase()) {
        return qty * material.conversionFactor;
      }
      return qty;
    };

    // Round to avoid floating-point accumulation errors (e.g. 1.14e-13 instead of 0)
    const roundBalance = (val: number) => Math.round(val * 1e9) / 1e9;
    
    // When a date filter is applied, seed running balances from the balance-as-of aggregate
    // (server-side SUM query). Returns zeros until the aggregate resolves, then updates.
    // groupBalances: keyed by matKey (all-party mode) or partyKey (single-party mode)
    const groupBalances: Record<string, number> = {};
    // partyBalances: always keyed by partyKey — secondary attribution tracked in all-party mode
    const partyBalances: Record<string, number> = {};

    // Per-tank opening balances derived from the aggregate (for B/F row when filtering by tank)
    const t1GroupBalances: Record<string, number> = {};
    const t2GroupBalances: Record<string, number> = {};

    if (dateFrom && balanceAsOf) {
      // Use the efficient server-side aggregate — one row per (material, party, uom)
      balanceAsOf.forEach(row => {
        const partyKey = `${row.materialId}-${row.partyId ?? 0}`;
        const matKey = String(row.materialId);
        const globalKey = isAllParty ? matKey : partyKey;
        const material = materials?.find(m => m.id === row.materialId);
        const factor = (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom &&
          row.uom?.toUpperCase() === material.conversionFromUom.toUpperCase())
          ? material.conversionFactor : 1;
        const contribution = roundBalance((row.totalIn * factor) - (row.totalOut * factor));
        if (groupBalances[globalKey] === undefined) groupBalances[globalKey] = 0;
        groupBalances[globalKey] = roundBalance(groupBalances[globalKey] + contribution);
        // Always maintain per-party attribution (for Party Balance column in all-party mode)
        if (partyBalances[partyKey] === undefined) partyBalances[partyKey] = 0;
        partyBalances[partyKey] = roundBalance(partyBalances[partyKey] + contribution);
        // Per-tank opening balances (also apply conversion factor, use globalKey).
        // Entries with no tankNumber ("untagged") are distributed evenly between T1 and T2
        // so that T1+T2 always equals Global Balance — no drift possible.
        if (t1GroupBalances[globalKey] === undefined) t1GroupBalances[globalKey] = 0;
        if (t2GroupBalances[globalKey] === undefined) t2GroupBalances[globalKey] = 0;
        const t1Seed = roundBalance((row.t1TotalIn - row.t1TotalOut) * factor);
        const t2Seed = roundBalance((row.t2TotalIn - row.t2TotalOut) * factor);
        const untaggedSeed = roundBalance(contribution - t1Seed - t2Seed);
        t1GroupBalances[globalKey] = roundBalance(t1GroupBalances[globalKey] + t1Seed + untaggedSeed / 2);
        t2GroupBalances[globalKey] = roundBalance(t2GroupBalances[globalKey] + t2Seed + untaggedSeed / 2);
      });
    }

    // Build synthetic opening-balance rows so the ledger always shows a "B/F" line
    // when a date filter is active.
    // All-party mode → one combined row per material (global opening balance).
    // Party mode     → one row per material+party group (original behaviour).
    const syntheticRows: ProcessedLedgerEntry[] = [];

    if (dateFrom && balanceAsOf) {
      if (isAllParty) {
        const materialGroups = new Set(sorted.map(e => e.materialId));
        for (const materialId of materialGroups) {
          const matKey = String(materialId);
          const openingBalance = groupBalances[matKey] ?? 0;
          const t1Opening = t1GroupBalances[matKey] ?? 0;
          const t2Opening = t2GroupBalances[matKey] ?? 0;
          const material = materials?.find(m => m.id === materialId);
          const targetUom = material?.conversionToUom || material?.defaultUom || 'Ton';
          syntheticRows.push({
            id: -(materialId * 10000),
            date: dateFrom,
            partyId: null,
            materialId,
            transactionType: 'opening_balance',
            referenceId: null,
            quantityIn: openingBalance >= 0 ? openingBalance : null,
            quantityOut: openingBalance < 0 ? Math.abs(openingBalance) : null,
            balanceAfter: openingBalance,
            uom: targetUom,
            notes: `Opening balance (B/F) as of ${dateFrom} — all parties combined`,
            createdAt: null,
            calculatedBalance: openingBalance,
            partyBalance: openingBalance,
            t1BalanceAfter: t1Opening,
            t2BalanceAfter: t2Opening,
            isSynthetic: true,
          } as ProcessedLedgerEntry);
        }
      } else {
        const filteredGroups = new Set(sorted.map(e => `${e.materialId}-${e.partyId ?? 0}`));
        for (const key of filteredGroups) {
          const [materialIdStr, partyIdStr] = key.split('-');
          const materialId = Number(materialIdStr);
          const partyId = Number(partyIdStr) === 0 ? null : Number(partyIdStr);
          const openingBalance = groupBalances[key] ?? 0;
          const t1Opening = t1GroupBalances[key] ?? 0;
          const t2Opening = t2GroupBalances[key] ?? 0;
          const material = materials?.find(m => m.id === materialId);
          const targetUom = material?.conversionToUom || material?.defaultUom || 'Ton';
          syntheticRows.push({
            id: -(materialId * 10000 + (partyId ?? 0)),
            date: dateFrom,
            partyId,
            materialId,
            transactionType: 'opening_balance',
            referenceId: null,
            quantityIn: openingBalance >= 0 ? openingBalance : null,
            quantityOut: openingBalance < 0 ? Math.abs(openingBalance) : null,
            balanceAfter: openingBalance,
            uom: targetUom,
            notes: `Opening balance (B/F) as of ${dateFrom}`,
            createdAt: null,
            calculatedBalance: openingBalance,
            partyBalance: openingBalance,
            t1BalanceAfter: t1Opening,
            t2BalanceAfter: t2Opening,
            isSynthetic: true,
          } as ProcessedLedgerEntry);
        }
      }
    }

    // ── Delta-merge pre-scan ────────────────────────────────────────────────────
    // Rebuild delta rows are written alongside unmatched (Path B) original dispatch
    // entries. We absorb them into the parent dispatch row so that only ONE merged
    // row appears per dispatch. Two matching strategies:
    //   Part A: original entry already has referenceId = dispatch.id → direct map lookup
    //   Part B: original entry has referenceId = null → sequential queue by date|mat|party
    const isRebuildNoteStr = (n: string) =>
      n.includes('[rebuild delta]') || n.includes('[rebuild delta reversal]');

    // Step 1: referenceIds present on non-delta dispatch rows (Part A originals)
    const ledgerLinkedRefIds = new Set<number>();
    for (const e of sorted) {
      if (!isRebuildNoteStr(e.notes ?? '') && e.referenceId != null && e.transactionType === 'dispatch') {
        ledgerLinkedRefIds.add(e.referenceId);
      }
    }

    // Step 2: classify delta rows and collect IDs to skip
    const rawDeltaForRef = new Map<number, number>();   // Part A: refId → raw delta sum
    const rawDeltaQueue  = new Map<string, number[]>(); // Part B: "date|mat|party" → queue
    const ledgerDeltaIds = new Set<number>();

    for (const e of sorted) {
      if (!isRebuildNoteStr(e.notes ?? '')) continue;
      ledgerDeltaIds.add(e.id);
      if (e.referenceId == null) continue;
      const rawDelta = e.transactionType === 'dispatch'
        ? (e.quantityOut || 0)
        : -(e.quantityIn || 0);
      if (ledgerLinkedRefIds.has(e.referenceId)) {
        rawDeltaForRef.set(e.referenceId, (rawDeltaForRef.get(e.referenceId) ?? 0) + rawDelta);
      } else {
        const qkey = `${e.date}|${e.materialId}|${e.partyId ?? 0}`;
        const q = rawDeltaQueue.get(qkey) ?? [];
        q.push(rawDelta);
        rawDeltaQueue.set(qkey, q);
      }
    }

    // ── Main accumulation loop ──────────────────────────────────────────────────
    const mainRows: ProcessedLedgerEntry[] = [];
    const t1Balances: Record<string, number> = {};
    const t2Balances: Record<string, number> = {};

    for (const entry of sorted) {
      // Skip rebuild delta rows entirely — their quantity is absorbed below
      if (ledgerDeltaIds.has(entry.id)) continue;

      const partyKey = `${entry.materialId}-${entry.partyId ?? 0}`;
      const globalKey = isAllParty ? String(entry.materialId) : partyKey;

      if (groupBalances[globalKey] === undefined) groupBalances[globalKey] = 0;
      if (partyBalances[partyKey] === undefined) partyBalances[partyKey] = 0;
      if (t1Balances[globalKey] === undefined) t1Balances[globalKey] = 0;
      if (t2Balances[globalKey] === undefined) t2Balances[globalKey] = 0;

      let convertedIn  = getConvertedQty(entry, entry.quantityIn);
      let convertedOut = getConvertedQty(entry, entry.quantityOut);
      let rawDelta = 0;
      const originalRawOut = entry.quantityOut || 0;

      if (entry.transactionType === 'dispatch') {
        if (entry.referenceId != null) {
          rawDelta = rawDeltaForRef.get(entry.referenceId) ?? 0;
        } else {
          const dkey = `${entry.date}|${entry.materialId}|${entry.partyId ?? 0}`;
          const q = rawDeltaQueue.get(dkey);
          if (q && q.length > 0) rawDelta = q.shift()!;
        }
        if (rawDelta !== 0) {
          const mergedRaw = Math.max(0, originalRawOut + rawDelta);
          convertedOut = getConvertedQty(entry, mergedRaw);
        }
      }

      groupBalances[globalKey] = roundBalance(groupBalances[globalKey] + convertedIn - convertedOut);
      partyBalances[partyKey]  = roundBalance(partyBalances[partyKey]  + convertedIn - convertedOut);

      // Per-tank running balances.
      // Tagged entries move only their assigned tank; untagged (tankNumber=null) entries are
      // split proportionally across T1 and T2 (by positive balances, 50/50 fallback) so that
      // T1+T2 always equals Global Balance — no drift possible.
      const tankDelta = convertedIn - convertedOut;
      if (entry.tankNumber === 1) {
        t1Balances[globalKey] = roundBalance(t1Balances[globalKey] + tankDelta);
      } else if (entry.tankNumber === 2) {
        t2Balances[globalKey] = roundBalance(t2Balances[globalKey] + tankDelta);
      } else if (tankDelta !== 0) {
        const pos1 = Math.max(t1Balances[globalKey], 0);
        const pos2 = Math.max(t2Balances[globalKey], 0);
        const posTotal = pos1 + pos2;
        const r1 = posTotal > 0 ? pos1 / posTotal : 0.5;
        t1Balances[globalKey] = roundBalance(t1Balances[globalKey] + tankDelta * r1);
        t2Balances[globalKey] = roundBalance(t2Balances[globalKey] + tankDelta * (1 - r1));
      }

      const row: ProcessedLedgerEntry = {
        ...entry,
        calculatedBalance: groupBalances[globalKey],
        partyBalance: partyBalances[partyKey],
        t1BalanceAfter: t1Balances[globalKey],
        t2BalanceAfter: t2Balances[globalKey],
      };
      if (rawDelta !== 0) {
        row.quantityOut = Math.max(0, originalRawOut + rawDelta);
        row._mergedDelta = rawDelta;
        row._originalQtyOut = originalRawOut;
      }
      mainRows.push(row);
    }

    // Synthetic rows come first (oldest); they appear last when the display reverses the array
    return [...syntheticRows, ...mainRows];
  }, [ledger, balanceAsOf, materials, dateFrom, selectedPartyId]);

  // For display, reverse to show most recent first and filter by transaction type + issuedTo search + tank
  const ledgerForDisplay = useMemo(() => {
    // Consolidate multiple ldo_dip_consumption rows for the same date into ONE clean daily row.
    // processedLedger is oldest-first; after reversal the FIRST occurrence of a date = the row
    // that was processed LAST = carries the correct end-of-day balance.
    const preReversed = [...processedLedger].reverse();
    const consolidated: typeof preReversed = [];
    const seenDipDates = new Map<string, number>(); // date → index in consolidated
    for (const entry of preReversed) {
      if (entry.transactionType === 'ldo_dip_consumption') {
        const key = `${entry.date}|${entry.materialId}|${entry.partyId ?? 0}`;
        const idx = seenDipDates.get(key);
        if (idx !== undefined) {
          // Merge into the existing consolidated row (add to Out total)
          const existing = consolidated[idx];
          consolidated[idx] = { ...existing, quantityOut: (existing.quantityOut ?? 0) + (entry.quantityOut ?? 0) };
        } else {
          seenDipDates.set(key, consolidated.length);
          consolidated.push({
            ...entry,
            notes: 'Actual Consumption from LDO Tracker (dip-based)',
          });
        }
      } else {
        consolidated.push(entry);
      }
    }

    let entries = consolidated;
    if (selectedTransactionType !== "all") {
      // "ldo_consumption" is the unified filter option covering ldo_dip_consumption
      const filterType = selectedTransactionType === 'ldo_consumption' ? 'ldo_dip_consumption' : selectedTransactionType;
      // Always keep synthetic opening_balance rows — they're context, not real transactions
      entries = entries.filter(e => e.transactionType === filterType || e.transactionType === 'opening_balance');
    }
    if (issuedToFilter !== "all") {
      // Keep all non-dispatch rows (receipts, issues, opening balance, etc.) unchanged;
      // only filter dispatch rows by their delivery location.
      entries = entries.filter(e =>
        e.transactionType !== 'dispatch' ||
        (e.notes || "").includes(" \u2014 " + issuedToFilter)
      );
    }
    if (isTankedMaterial && selectedTank !== "all") {
      const tankNum = Number(selectedTank);
      // Keep the synthetic B/F row, entries matching the chosen tank, AND entries with no
      // tankNumber at all (untagged consumptions like equipment-usage or un-backfilled dispatches
      // must not disappear — they affect the overall balance and the user should see them).
      entries = entries.filter(e => e.transactionType === 'opening_balance' || e.tankNumber === tankNum || e.tankNumber == null).map(e => {
        if (e.transactionType !== 'opening_balance') return e;
        // For the B/F row: use the per-tank opening balance so the running total is coherent
        const tankBalance = tankNum === 1 ? (e.t1BalanceAfter ?? 0) : (e.t2BalanceAfter ?? 0);
        return {
          ...e,
          calculatedBalance: tankBalance,
          quantityIn: tankBalance >= 0 ? tankBalance : null,
          quantityOut: tankBalance < 0 ? Math.abs(tankBalance) : null,
          notes: `Opening balance (B/F) as of ${e.date} — Tank ${tankNum} only`,
        };
      });
    }
    return entries;
  }, [processedLedger, selectedTransactionType, issuedToFilter, isTankedMaterial, selectedTank]);

  // Distinct delivery locations from dispatch entries for the "Dispatched To" dropdown
  const dispatchedToOptions = useMemo(() => {
    const locs = new Set<string>();
    for (const entry of processedLedger) {
      if (entry.transactionType === 'dispatch' && entry.notes) {
        const sep = entry.notes.indexOf(' \u2014 ');
        if (sep !== -1) {
          const loc = entry.notes.slice(sep + 3).trim();
          if (loc) locs.add(loc);
        }
      }
    }
    return [...locs].sort();
  }, [processedLedger]);

  // Calculate totals for filtered ledger data - with UOM conversion (exclude synthetic opening_balance rows)
  const ledgerTotals = useMemo(() => {
    if (!ledgerForDisplay?.length || !materials) return { totalIn: 0, totalOut: 0, netChange: 0 };
    
    return ledgerForDisplay.filter(e => e.transactionType !== 'opening_balance').reduce((acc, entry) => {
      const material = materials.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor;
      const convFromUom = material?.conversionFromUom;
      const convToUom = material?.conversionToUom;
      
      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const needsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      const qtyIn = needsConversion ? (entry.quantityIn || 0) * convFactor : (entry.quantityIn || 0);
      const qtyOut = needsConversion ? (entry.quantityOut || 0) * convFactor : (entry.quantityOut || 0);
      
      return {
        totalIn: acc.totalIn + qtyIn,
        totalOut: acc.totalOut + qtyOut,
        netChange: acc.netChange + qtyIn - qtyOut
      };
    }, { totalIn: 0, totalOut: 0, netChange: 0 });
  }, [ledgerForDisplay, materials]);

  const computeStockSummary = () => {
    if (!ledger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      openingStock: number;
      received: number;
      consumed: number;
      closing: number;
      conversionFactor: number | null;
      conversionFromUom: string | null;
      conversionToUom: string | null;
      convertedOpening: number | null;
      convertedReceived: number | null;
      convertedConsumed: number | null;
      convertedClosing: number | null;
    }> = {};

    // Use processedLedger which excludes equipment_issue entries
    processedLedger.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      const material = materials?.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor || null;
      const convFromUom = material?.conversionFromUom || null;
      const convToUom = material?.conversionToUom || null;
      
      if (!summaryMap[key]) {
        // Use target UOM if material has conversion, otherwise use entry UOM
        const targetUom = convToUom || entry.uom || "Ton";
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: targetUom,
          openingStock: 0,
          received: 0,
          consumed: 0,
          closing: 0,
          conversionFactor: convFactor,
          conversionFromUom: convFromUom,
          conversionToUom: convToUom,
          convertedOpening: null,
          convertedReceived: null,
          convertedConsumed: null,
          convertedClosing: null,
        };
      }

      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const entryNeedsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      // Get quantity, converting if needed
      const getConvertedQty = (qty: number | null) => {
        if (!qty) return 0;
        return entryNeedsConversion ? qty * convFactor : qty;
      };

      // Synthetic opening balance row (B/F) prepended when date filter is active
      if (entry.transactionType === "opening_balance") {
        const bfBalance = (entry.quantityIn || 0) - (entry.quantityOut || 0);
        summaryMap[key].openingStock += bfBalance;
      }
      // Opening stock entries (from Masters -> Opening Stock)
      else if (entry.transactionType === "opening") {
        summaryMap[key].openingStock += getConvertedQty(entry.quantityIn);
      }
      // Receipts (from Material Receipts) and adjustments
      else if (entry.transactionType === "receipt" || entry.transactionType === "adjustment") {
        summaryMap[key].received += getConvertedQty(entry.quantityIn);
      }
      // Returns: materials returned from site back to stock — treated as received (add-back)
      else if (entry.transactionType === "return") {
        summaryMap[key].received += getConvertedQty(Math.abs(entry.quantityIn || 0));
      }
      // Transfers: quantityIn = stock arriving (add to received), quantityOut = stock leaving (add to consumed)
      else if (entry.transactionType === "transfer") {
        if ((entry.quantityIn || 0) > 0) summaryMap[key].received += getConvertedQty(entry.quantityIn);
        if ((entry.quantityOut || 0) > 0) summaryMap[key].consumed += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Tank transfer: LDO/Diesel moved from store drums into boiler/dryer tank.
      // This is a store→tank movement — treat the same as a regular inter-party transfer
      // (stock leaves the drum store, but is NOT counted as theoretical consumption).
      else if (entry.transactionType === "tank_transfer") {
        if ((entry.quantityOut || 0) > 0) summaryMap[key].consumed += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Consumed: dispatch, issue, equipment_usage; ldo_dip_consumption is the only
      // actual LDO deduction — flow meter (ldo_shift_consumption) and heating
      // (ldo_heating_consumption) are reference-only and never created in the ledger.
      else if (entry.transactionType === "dispatch" || entry.transactionType === "issue" || entry.transactionType === "equipment_usage" || entry.transactionType === "dpr_equipment_usage" || entry.transactionType === "ldo_dip_consumption") {
        summaryMap[key].consumed += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Direct purchases bypass plant stock - tracked but no balance impact
      // (quantityIn and quantityOut are equal, net effect is zero)
    });

    // Calculate closing balance - round to eliminate floating-point accumulation errors
    Object.values(summaryMap).forEach((item) => {
      const raw = item.openingStock + item.received - item.consumed;
      item.closing = Math.round(raw * 1e9) / 1e9;
      if (Math.abs(item.closing) < 1e-9) item.closing = 0;
    });

    return Object.values(summaryMap);
  };

  const stockSummary = computeStockSummary();

  // Compute ALL-TIME balances from allTimeLedger (no date filter) for Current Balances tab
  // This shows Total Receipts, Total Issues, and Balance from the very beginning
  const allTimeBalances = useMemo(() => {
    if (!allTimeLedger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      totalReceipts: number;
      totalIssues: number;
      balance: number;
      conversionFactor: number | null;
      conversionFromUom: string | null;
      conversionToUom: string | null;
      convertedBalance: number | null;
    }> = {};

    // Filter out legacy equipment_issue entries
    const validEntries = allTimeLedger.filter(e => e.transactionType !== 'equipment_issue');

    validEntries.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      // Get material conversion info
      const material = materials.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor || null;
      const convFromUom = material?.conversionFromUom || null;
      const convToUom = material?.conversionToUom || null;
      
      if (!summaryMap[key]) {
        // Use target UOM if material has conversion, otherwise use entry UOM
        const targetUom = convToUom || entry.uom || "Ton";
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: targetUom,
          totalReceipts: 0,
          totalIssues: 0,
          balance: 0,
          conversionFactor: convFactor,
          conversionFromUom: convFromUom,
          conversionToUom: convToUom,
          convertedBalance: null,
        };
      }

      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const entryNeedsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      // Get quantity, converting if needed
      const getConvertedQty = (qty: number | null) => {
        if (!qty) return 0;
        return entryNeedsConversion ? qty * convFactor : qty;
      };

      // Receipts: opening, receipt, adjustment, return
      if (entry.transactionType === "opening" || entry.transactionType === "receipt" || entry.transactionType === "adjustment") {
        summaryMap[key].totalReceipts += getConvertedQty(entry.quantityIn);
      }
      // Returns: material returned from site reduces net issues (adds back to receipts side)
      if (entry.transactionType === "return") {
        summaryMap[key].totalReceipts += getConvertedQty(Math.abs(entry.quantityIn || 0));
      }
      // Transfers: quantityIn = stock arriving (add to receipts), quantityOut = stock leaving (add to issues)
      if (entry.transactionType === "transfer") {
        if ((entry.quantityIn || 0) > 0) summaryMap[key].totalReceipts += getConvertedQty(entry.quantityIn);
        if ((entry.quantityOut || 0) > 0) summaryMap[key].totalIssues += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Tank transfer: LDO/Diesel moved from store drums into boiler/dryer tank — reduces store balance
      if (entry.transactionType === "tank_transfer") {
        if ((entry.quantityOut || 0) > 0) summaryMap[key].totalIssues += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Issues: dispatch, issue, equipment_usage, dpr_equipment_usage
      if (entry.transactionType === "dispatch" || entry.transactionType === "issue" || entry.transactionType === "equipment_usage" || entry.transactionType === "dpr_equipment_usage") {
        summaryMap[key].totalIssues += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Direct purchases bypass plant stock - not counted in balance
      // (quantityIn and quantityOut are equal, net effect is zero)
    });

    // Calculate balance - round to eliminate floating-point accumulation errors
    Object.values(summaryMap).forEach((item) => {
      const rawBalance = item.totalReceipts - item.totalIssues;
      item.balance = Math.round(rawBalance * 1e9) / 1e9;
      // Treat sub-epsilon values as exactly 0
      if (Math.abs(item.balance) < 1e-9) item.balance = 0;
    });

    return Object.values(summaryMap);
  }, [allTimeLedger, materials, parties]);

  // Filter all-time balances based on party/material selection (but NOT date - always all-time)
  const filteredBalances = allTimeBalances?.filter((b) => {
    // Hide phantom cards where a party has only 0-qty marker rows (no real receipts or issues).
    // These arise from the borrowing system writing 0-quantity dispatch marker rows for parties
    // with no own stock. They are needed for party statement tracking but should not show as cards.
    if (b.totalReceipts === 0 && b.totalIssues === 0) return false;
    if (selectedPartyId !== "all" && String(b.partyId ?? "") !== selectedPartyId && selectedPartyId !== "common") return false;
    if (selectedPartyId === "common" && b.partyId !== null) return false;
    if (selectedMaterialId !== "all" && b.materialId !== Number(selectedMaterialId)) return false;
    return true;
  });

  // Handler to jump to ledger tab with material/party filter
  const jumpToLedger = (materialId: number, partyId: number | null) => {
    setSelectedMaterialId(String(materialId));
    if (partyId !== null) {
      setSelectedPartyId(String(partyId));
    }
    setActiveTab("ledger");
  };

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = dateFrom || "All";
    const toDate = dateTo || "All";
    const partyFilter = selectedPartyId !== "all" 
      ? (selectedPartyId === "common" ? "PlantCommon" : parties?.find(p => p.id === parseInt(selectedPartyId))?.name?.replace(/\s+/g, '') || "")
      : "";
    const materialFilter = selectedMaterialId !== "all" 
      ? materials?.find(m => m.id === parseInt(selectedMaterialId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = [partyFilter, materialFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Stock_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
  };

  // Universal download function that works on all devices including iPad
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Helper to get converted quantities for export/print
  const getConvertedEntryData = (entry: typeof processedLedger[0]) => {
    const material = materials?.find(m => m.id === entry.materialId);
    const convFactor = material?.conversionFactor;
    const convFromUom = material?.conversionFromUom;
    const convToUom = material?.conversionToUom;
    const hasConversion = convFactor && convFromUom && convToUom;
    const needsConversion = hasConversion && entry.uom?.toUpperCase() === convFromUom.toUpperCase();
    
    const displayIn = needsConversion ? (entry.quantityIn ?? 0) * convFactor : (entry.quantityIn ?? 0);
    const displayOut = needsConversion ? (entry.quantityOut ?? 0) * convFactor : (entry.quantityOut ?? 0);
    // calculatedBalance is already converted to target UOM
    const displayBalance = entry.calculatedBalance ?? 0;
    // Use target UOM for In/Out only when converted, otherwise use entry's original UOM
    // For balance, always use target UOM if material has conversion (since balance is accumulated in target UOM)
    const displayUom = needsConversion ? convToUom : entry.uom;
    const balanceUom = hasConversion ? convToUom : entry.uom;
    
    return { displayIn, displayOut, displayBalance, displayUom, balanceUom };
  };

  const exportToExcel = async () => {
    try {
      const summaryData = stockSummary.map(item => ({
        Material: item.materialName,
        "Stock Owner": item.partyName,
        Opening: item.openingStock.toFixed(3),
        Received: item.received.toFixed(3),
        Consumed: item.consumed.toFixed(3),
        Closing: item.closing.toFixed(3),
        UOM: item.uom,
      }));
      
      const isRowTanked = (matId: number) => {
        const mat = materials?.find(m => m.id === matId);
        return mat ? /bitumen|ldo/i.test(mat.name) : false;
      };
      const ledgerRows = ledgerForDisplay;
      const hasTankedRows = ledgerRows.filter(e => e.transactionType !== 'opening_balance').some(e => isRowTanked(e.materialId));
      const ledgerData = ledgerRows.map(entry => {
        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
        const row: Record<string, string> = {
          Date: entry.date,
          Material: getMaterialName(entry.materialId),
          "Stock Owner": getPartyName(entry.partyId),
          Type: entry.transactionType === 'opening_balance' ? 'B/F Opening Bal.' : entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : entry.transactionType === 'issue' ? 'Issue' : entry.transactionType === 'tank_transfer' ? '→ Boiler Tank' : entry.transactionType === 'opening' ? 'Opening' : entry.transactionType === 'adjustment' ? 'Adjustment' : entry.transactionType === 'return' ? 'Return' : entry.transactionType === 'transfer' ? 'Transfer' : entry.transactionType === 'equipment_usage' ? 'Equip. Usage' : entry.transactionType === 'dpr_equipment_usage' ? 'DPR Equip. Usage' : entry.transactionType === 'direct_purchase' ? 'Direct Site Purchase' : entry.transactionType === 'ldo_dip_consumption' ? 'Actual Consumption' : entry.transactionType,
          "Issued To": entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
            ? entry.notes.replace('Diesel issued to ', '')
            : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
            ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
            : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
            ? entry.notes.replace('Direct purchase at ', '')
            : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
            ? entry.notes.replace('Issue to ', '').split(' - ')[0]
            : entry.notes || '-',
          In: displayIn > 0 ? displayIn.toFixed(3) : "-",
          Out: displayOut > 0 ? displayOut.toFixed(3) : "-",
          Balance: displayBalance.toFixed(3),
          UOM: balanceUom,
        };
        if (hasTankedRows) {
          const tanked = isRowTanked(entry.materialId);
          row["T1 Balance"] = tanked && entry.t1BalanceAfter != null ? entry.t1BalanceAfter.toFixed(3) : "";
          row["T2 Balance"] = tanked && entry.t2BalanceAfter != null ? entry.t2BalanceAfter.toFixed(3) : "";
        }
        return row;
      });
      
      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Stock Summary");
      XLSX.utils.book_append_sheet(wb, wsLedger, "Stock Ledger");
      
      const filename = buildFilename("xlsx");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Excel Files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          await writable.write(buffer);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerDownload(blob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Stock Balances & Ledger Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 28);
      
      // Stock Summary section
      doc.setFontSize(12);
      doc.text("Stock Summary", 14, 36);
      
      const summaryTableData = stockSummary.map(item => [
        item.materialName,
        item.partyName,
        item.openingStock.toFixed(3),
        item.received.toFixed(3),
        item.consumed.toFixed(3),
        item.closing.toFixed(3),
        item.uom,
      ]);
      
      autoTable(doc, {
        startY: 40,
        head: [["Material", "Stock Owner", "Opening", "Received", "Consumed", "Closing", "UOM"]],
        body: summaryTableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      
      // Ledger Details section on new page
      doc.addPage();
      doc.setFontSize(12);
      doc.text("Ledger Details", 14, 15);
      
      const getTransactionTypeLabel = (type: string) => {
        switch(type) {
          case 'receipt': return 'Receipt';
          case 'dispatch': return 'Dispatch';
          case 'issue': return 'Issue';
          case 'tank_transfer': return '→ Boiler Tank';
          case 'opening': return 'Opening';
          case 'adjustment': return 'Adjustment';
          case 'return': return 'Return';
          case 'transfer': return 'Transfer';
          case 'equipment_usage': return 'Equip. Usage';
          case 'dpr_equipment_usage': return 'DPR Equip. Usage';
          case 'direct_purchase': return 'Direct Site Purchase';
          case 'ldo_shift_consumption': return 'LDO Shift Meter';
          case 'ldo_heating_consumption': return 'LDO Heating';
          case 'ldo_dip_consumption': return 'LDO Dip';
          case 'opening_balance': return 'B/F Opening Bal.';
          default: return type;
        }
      };
      
      const isPdfRowTanked = (matId: number) => {
        const mat = materials?.find(m => m.id === matId);
        return mat ? /bitumen|ldo/i.test(mat.name) : false;
      };
      const pdfLedgerRows = [...ledgerForDisplay].reverse();
      const pdfHasTankedRows = pdfLedgerRows.filter(e => e.transactionType !== 'opening_balance').some(e => isPdfRowTanked(e.materialId));

      const ledgerTableData = pdfLedgerRows.map(entry => {
        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
        const mergedDelta = entry._mergedDelta;
        const origQtyOut = entry._originalQtyOut;
        const isRevision = mergedDelta != null && mergedDelta !== 0;
        const revisionSuffix = isRevision
          ? ` (was ${(origQtyOut ?? 0).toFixed(3)}T, ${mergedDelta >= 0 ? '+' : ''}${mergedDelta.toFixed(3)}T \u2192 ${(entry.quantityOut || 0).toFixed(3)}T)`
          : '';
        const row: (string)[] = [
          entry.date,
          getMaterialName(entry.materialId),
          getPartyName(entry.partyId),
          entry.transactionType === 'opening_balance' ? 'B/F Opening Bal.' : isRevision ? 'Dispatch Revision' : getTransactionTypeLabel(entry.transactionType),
          entry.transactionType === 'opening_balance'
            ? (entry.notes || '-')
            : isRevision
            ? (entry.notes || '-') + revisionSuffix
            : entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
            ? entry.notes.replace('Diesel issued to ', '').replace(' (backfilled)', '')
            : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
            ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
            : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
            ? entry.notes.replace('Direct purchase at ', '')
            : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
            ? entry.notes.replace('Issue to ', '').split(' - ')[0]
            : entry.notes || '-',
          displayIn > 0 ? displayIn.toFixed(3) : "-",
          displayOut > 0 ? displayOut.toFixed(3) : "-",
          displayBalance.toFixed(3),
          balanceUom,
        ];
        if (pdfHasTankedRows) {
          const tanked = isPdfRowTanked(entry.materialId);
          row.push(tanked && entry.t1BalanceAfter != null ? entry.t1BalanceAfter.toFixed(3) : "");
          row.push(tanked && entry.t2BalanceAfter != null ? entry.t2BalanceAfter.toFixed(3) : "");
        }
        return row;
      });

      const pdfLedgerHead = ["Date", "Material", "Stock Owner", "Type", "Notes/Issued To", "In", "Out", "Balance", "UOM"];
      if (pdfHasTankedRows) {
        pdfLedgerHead.push("T1 Balance", "T2 Balance");
      }
      
      autoTable(doc, {
        startY: 20,
        head: [pdfLedgerHead],
        body: ledgerTableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
      
      const filename = buildFilename("pdf");
      
      // Standard download - works reliably across all browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const getTransactionTypeLabel = (type: string) => {
      switch(type) {
        case 'receipt': return 'Receipt';
        case 'dispatch': return 'Dispatch';
        case 'issue': return 'Issue';
        case 'tank_transfer': return '→ Boiler Tank';
        case 'opening': return 'Opening';
        case 'adjustment': return 'Adjustment';
        case 'equipment_usage': return 'Equip. Usage';
        case 'dpr_equipment_usage': return 'DPR Equip. Usage';
        case 'direct_purchase': return 'Direct Site Purchase';
        case 'ldo_shift_consumption': return 'LDO Shift Meter';
        case 'ldo_heating_consumption': return 'LDO Heating';
        case 'ldo_dip_consumption': return 'LDO Dip';
        default: return type;
      }
    };
    
    const isPrintRowTanked = (matId: number) => {
      const mat = materials?.find(m => m.id === matId);
      return mat ? /bitumen|ldo/i.test(mat.name) : false;
    };
    const printLedgerRows = [...ledgerForDisplay].reverse();
    const printHasTankedRows = printLedgerRows
      .filter(e => e.transactionType !== 'opening_balance')
      .some(e => isPrintRowTanked(e.materialId));

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stock Balances & Ledger Report</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 10px; }
            .header { margin-bottom: 10px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 16px; }
            h2 { color: #333; margin: 20px 0 5px 0; font-size: 14px; page-break-before: always; }
            h2:first-of-type { page-break-before: avoid; }
            .date { color: #666; margin: 0; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 4px 3px; text-align: left; font-size: 8px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .text-right { text-align: right; }
            .text-green { color: #16a34a; }
            .text-red { color: #dc2626; }
            .section-title { font-size: 12px; font-weight: bold; margin: 15px 0 5px 0; color: #333; }
            .bf-row { background-color: #fffbeb !important; font-weight: bold; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 8px;">
            <img src="${window.location.origin}/${logoFile}" style="height: 40px; margin-bottom: 3px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 12px; font-weight: bold;">${companyName}</h2>
          </div>
          <div class="header">
            <h1>Stock Balances & Ledger Report</h1>
            <p class="date">Period: ${dateFrom} to ${dateTo} | Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
          </div>
          
          <div class="section-title">Stock Summary</div>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock Owner</th>
                <th class="text-right">Opening</th>
                <th class="text-right">Received</th>
                <th class="text-right">Consumed</th>
                <th class="text-right">Closing</th>
                <th>UOM</th>
              </tr>
            </thead>
            <tbody>
              ${stockSummary.map(item => `
                <tr>
                  <td>${item.materialName}</td>
                  <td>${item.partyName}</td>
                  <td class="text-right">${item.openingStock.toFixed(3)}</td>
                  <td class="text-right text-green">+${item.received.toFixed(3)}</td>
                  <td class="text-right text-red">-${item.consumed.toFixed(3)}</td>
                  <td class="text-right"><strong>${item.closing.toFixed(3)}</strong></td>
                  <td>${item.uom}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h2>Ledger Details</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Stock Owner</th>
                <th>Type</th>
                <th>Notes/Issued To</th>
                <th class="text-right">In</th>
                <th class="text-right">Out</th>
                <th class="text-right">Balance</th>
                <th>UOM</th>
                ${printHasTankedRows ? '<th class="text-right">T1 Balance</th><th class="text-right">T2 Balance</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${printLedgerRows.map(entry => {
                const convData = getConvertedEntryData(entry);
                const isBF = entry.transactionType === 'opening_balance';
                const mDelta = entry._mergedDelta;
                const mOrigOut = entry._originalQtyOut;
                const isRevision = mDelta != null && mDelta !== 0;
                const revSuffix = isRevision
                  ? ` (was ${(mOrigOut ?? 0).toFixed(3)}T, ${mDelta >= 0 ? '+' : ''}${mDelta.toFixed(3)}T \u2192 ${(entry.quantityOut || 0).toFixed(3)}T)`
                  : '';
                const typeLabel = isBF ? 'B/F Opening Bal.'
                  : isRevision ? 'Dispatch Revision'
                  : getTransactionTypeLabel(entry.transactionType);
                const notes = isBF
                  ? (entry.notes || '-')
                  : isRevision
                  ? (entry.notes || '-') + revSuffix
                  : entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
                  ? entry.notes.replace('Diesel issued to ', '').replace(' (backfilled)', '')
                  : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
                  ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
                  : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
                  ? entry.notes.replace('Direct purchase at ', '')
                  : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
                  ? entry.notes.replace('Issue to ', '').split(' - ')[0]
                  : entry.transactionType === 'tank_transfer' && entry.notes?.startsWith('Transfer to ')
                  ? entry.notes.replace('Transfer to ', '')
                  : entry.notes || '-';
                const tanked = isPrintRowTanked(entry.materialId);
                const t1Cell = printHasTankedRows
                  ? `<td class="text-right">${tanked && entry.t1BalanceAfter != null ? entry.t1BalanceAfter.toFixed(3) : ''}</td>`
                  : '';
                const t2Cell = printHasTankedRows
                  ? `<td class="text-right">${tanked && entry.t2BalanceAfter != null ? entry.t2BalanceAfter.toFixed(3) : ''}</td>`
                  : '';
                return `
                <tr${isBF ? ' class="bf-row"' : ''}>
                  <td>${entry.date}</td>
                  <td>${getMaterialName(entry.materialId)}</td>
                  <td>${getPartyName(entry.partyId)}</td>
                  <td>${typeLabel}</td>
                  <td>${notes}</td>
                  <td class="text-right text-green">${convData.displayIn > 0 ? convData.displayIn.toFixed(3) : '-'}</td>
                  <td class="text-right text-red">${convData.displayOut > 0 ? convData.displayOut.toFixed(3) : '-'}</td>
                  <td class="text-right"><strong>${convData.displayBalance.toFixed(3)}</strong></td>
                  <td>${convData.balanceUom}</td>
                  ${t1Cell}${t2Cell}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
        </body>
      </html>
    `;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  };

  const handleExportExcelClick = () => exportToExcel();
  const handleExportPdfClick = () => exportToPDF();
  const handlePrintClick = () => handlePrint();
  const handleReconcileClick = () => reconcileMutation.mutate();

    const fixOrphanMutation = useMutation({
      mutationFn: async () => {
        const res = await apiRequest("POST", "/api/admin/fix-orphan-stock-balances", {});
        return res.json();
      },
      onSuccess: (data: { fixed: number; details: { party: string; material: string; corrected: number; uom: string }[] }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
        queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
        if (data.fixed === 0) {
          toast({ title: "No orphan balances found", description: "All negative balances have backing ledger entries." });
        } else {
          const lines = data.details.map(d => `${d.party} – ${d.material}: +${d.corrected.toFixed(3)} ${d.uom}`).join(", ");
          toast({ title: `${data.fixed} orphan balance${data.fixed > 1 ? "s" : ""} fixed`, description: lines });
        }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      },
    });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <NegativeBalanceBannerMulti
        balances={allStockBalances ?? []}
        parties={parties}
        materials={materials}
        testid="banner-negative-stock"
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Stock Balances & Ledger</h1>
            <p className="text-muted-foreground">View party-wise and plant-common stock</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link href={appendPlantContext("/plant/stock-transfer", { defaultTab: "stock" })}>
              <Button size="sm" variant="outline" className="gap-1 border-blue-300 text-blue-700 dark:text-blue-400" data-testid="link-stock-transfer">
                <MoveHorizontal className="w-4 h-4" /> Stock Transfer
              </Button>
            </Link>
            {canExport && (
              <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!stockSummary.length} data-testid="button-export-excel">
                <Download className="w-4 h-4" /> Export Excel
              </Button>
            )}
            {canExport && (
              <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!stockSummary.length} data-testid="button-export-pdf">
                <Download className="w-4 h-4" /> Export PDF
              </Button>
            )}
            {canExport && (
              <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
                <Printer className="w-4 h-4" /> Print
              </Button>
            )}
          </div>
          {canReconcile && (
            <div className="flex items-center gap-2 flex-wrap justify-end rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mr-1" data-testid="label-advanced-tools">
                <ShieldAlert className="w-3.5 h-3.5" />
                Advanced
              </span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => setConfirmAction("reconcile")}
                disabled={reconcileMutation.isPending}
                data-testid="button-reconcile-data"
              >
                {reconcileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reconcile Data
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => setConfirmAction("fix-phantom")}
                disabled={fixOrphanMutation.isPending}
                data-testid="button-fix-orphan-balances"
                title="Find negative stock balances with no backing ledger entries and zero them out"
              >
                {fixOrphanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Fix Phantom Balances
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => setConfirmAction("reassign")}
                data-testid="link-stock-reassign"
              >
                <ArrowRightLeft className="w-4 h-4" /> Reassign Ledger
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => setConfirmAction("rebuild")}
                data-testid="link-ledger-rebuild"
              >
                <RotateCcw className="w-4 h-4" /> Rebuild Ledger
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Filters
            </CardTitle>
            {(dateFrom || dateTo || selectedPartyId !== "all" || selectedMaterialId !== "all" || selectedTransactionType !== "all" || issuedToFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetPersistedFilters}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label>Party / Stock Owner</Label>
              <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger data-testid="select-filter-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Type</Label>
              <Select value={selectedTransactionType} onValueChange={setSelectedTransactionType}>
                <SelectTrigger data-testid="select-filter-transaction-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="equipment_usage">Equip. Usage</SelectItem>
                  <SelectItem value="dpr_equipment_usage">DPR Equip. Usage</SelectItem>
                  <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                  <SelectItem value="ldo_consumption">LDO Consumption</SelectItem>
                  <SelectItem value="issue">Issue</SelectItem>
                  <SelectItem value="tank_transfer">→ Boiler Tank</SelectItem>
                  <SelectItem value="dispatch">Dispatch</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
          </div>
          {activeTab === "ledger" && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Dispatched To</Label>
                <Select value={issuedToFilter} onValueChange={setIssuedToFilter}>
                  <SelectTrigger data-testid="select-filter-dispatched-to">
                    <SelectValue placeholder="All Sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {dispatchedToOptions.map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isTankedMaterial && (
                <div>
                  <Label>Tank</Label>
                  <Select value={selectedTank} onValueChange={(v) => setSelectedTank(v as "all" | "1" | "2")}>
                    <SelectTrigger data-testid="select-filter-tank">
                      <SelectValue placeholder="All Tanks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tanks</SelectItem>
                      <SelectItem value="1">Tank 1</SelectItem>
                      <SelectItem value="2">Tank 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-5' : (isAdmin || canExport) ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="summary" className="gap-2 text-sm sm:text-sm">
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Stock Summary</span>
            <span className="sm:hidden">Summary</span>
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-2 text-sm sm:text-sm">
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Current Balances</span>
            <span className="sm:hidden">Balances</span>
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2 text-sm sm:text-sm">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Ledger Details</span>
            <span className="sm:hidden">Ledger</span>
          </TabsTrigger>
          {(isAdmin || canExport) && (
            <TabsTrigger value="statement" className="gap-2 text-sm sm:text-sm" data-testid="tab-party-statement">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Party Statement</span>
              <span className="sm:hidden">Statement</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="hlc-recon" className="gap-2 text-sm sm:text-sm" data-testid="tab-hlc-recon">
              <GitCompare className="w-4 h-4" />
              <span className="hidden sm:inline">HLC Reconciliation</span>
              <span className="sm:hidden">Recon</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Stock Summary (Period: {dateFrom} to {dateTo})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : stockSummary.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No stock movements found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Material</th>
                        <th className="text-left py-3 px-2">Stock Owner</th>
                        <th className="text-right py-3 px-2">Opening</th>
                        <th className="text-right py-3 px-2">Received</th>
                        <th className="text-right py-3 px-2">Consumed</th>
                        <th className="text-right py-3 px-2">Closing</th>
                        <th className="text-left py-3 px-2">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPartyId === "all" ? (() => {
                        // Merge per-party rows into one global row per material, with indented breakdown
                        const matMap = new Map<number, typeof stockSummary[0] & { _rows: typeof stockSummary }>();
                        for (const item of stockSummary) {
                          if (!matMap.has(item.materialId)) {
                            matMap.set(item.materialId, { ...item, partyName: 'All Parties', partyId: null, _rows: [item] });
                          } else {
                            const g = matMap.get(item.materialId)!;
                            g.openingStock += item.openingStock;
                            g.received += item.received;
                            g.consumed += item.consumed;
                            g._rows.push(item);
                          }
                        }
                        for (const g of matMap.values()) {
                          g.closing = Math.round((g.openingStock + g.received - g.consumed) * 1e9) / 1e9;
                        }
                        return Array.from(matMap.values()).flatMap((global, gIdx) => {
                          const rows = [];
                          rows.push(
                            <tr key={`g-${gIdx}`} className="border-b bg-muted/20 font-semibold">
                              <td className="py-3 px-2 font-semibold">{global.materialName}</td>
                              <td className="py-3 px-2">
                                <span className="px-2 py-0.5 text-sm rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  All Parties
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right">
                                {dateFrom && balanceAsOfLoading ? (
                                  <div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto animate-pulse" />
                                ) : global.openingStock.toFixed(3)}
                              </td>
                              <td className="py-3 px-2 text-right text-green-600 dark:text-green-400">+{global.received.toFixed(3)}</td>
                              <td className="py-3 px-2 text-right text-red-600 dark:text-red-400">-{global.consumed.toFixed(3)}</td>
                              <td className="py-3 px-2 text-right font-bold">{global.closing.toFixed(3)}</td>
                              <td className="py-3 px-2">{global.uom}</td>
                            </tr>
                          );
                          global._rows.forEach((item, idx) => {
                            rows.push(
                              <tr key={`g-${gIdx}-p-${idx}`} className="border-b last:border-0 text-muted-foreground">
                                <td className="py-2 pl-6 pr-2 text-sm">↳ {item.materialName}</td>
                                <td className="py-2 px-2">
                                  <span className={`px-2 py-0.5 text-sm rounded ${
                                    item.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                                    'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                  }`}>
                                    {item.partyName}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-right text-sm">
                                  {dateFrom && balanceAsOfLoading ? (
                                    <div className="h-3 w-12 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto animate-pulse" />
                                  ) : item.openingStock.toFixed(3)}
                                </td>
                                <td className="py-2 px-2 text-right text-sm text-green-600 dark:text-green-400">+{item.received.toFixed(3)}</td>
                                <td className="py-2 px-2 text-right text-sm text-red-600 dark:text-red-400">-{item.consumed.toFixed(3)}</td>
                                <td className="py-2 px-2 text-right text-sm font-medium">{item.closing.toFixed(3)}</td>
                                <td className="py-2 px-2 text-sm">{item.uom}</td>
                              </tr>
                            );
                          });
                          return rows;
                        });
                      })() : stockSummary.map((item, idx) => {
                        const hasConversion = item.conversionFactor && item.convertedClosing !== null;
                        return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-3 px-2 font-medium">{item.materialName}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 text-sm rounded ${
                                item.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                                'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                              }`}>
                                {item.partyName}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {dateFrom && balanceAsOfLoading ? (
                                <div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto animate-pulse" data-testid={`skeleton-opening-${idx}`} />
                              ) : hasConversion ? (
                                <span title={`${item.openingStock.toFixed(3)} ${item.uom}`}>
                                  {item.convertedOpening?.toFixed(3)}
                                </span>
                              ) : item.openingStock.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right text-green-600 dark:text-green-400">
                              +{hasConversion ? item.convertedReceived?.toFixed(3) : item.received.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right text-red-600 dark:text-red-400">
                              -{hasConversion ? item.convertedConsumed?.toFixed(3) : item.consumed.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right font-bold">
                              {hasConversion ? item.convertedClosing?.toFixed(3) : item.closing.toFixed(3)}
                            </td>
                            <td className="py-3 px-2">
                              {hasConversion ? item.conversionToUom : item.uom}
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
        </TabsContent>

        <TabsContent value="balances" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Current Stock Balances
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                All-time stock positions. Click on a card to view ledger details.
              </p>
            </CardHeader>
            <CardContent>
              {allTimeLedgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !filteredBalances?.length ? (
                <p className="text-muted-foreground text-center py-8">No stock balances found.</p>
              ) : (
                <div className="space-y-6">
                  {selectedPartyId === "all" ? (() => {
                    // Build global aggregate per material, then show per-party cards grouped below
                    const matMap = new Map<number, { materialId: number; materialName: string; uom: string; totalReceipts: number; totalIssues: number; balance: number }>();
                    for (const b of filteredBalances) {
                      if (!matMap.has(b.materialId)) {
                        matMap.set(b.materialId, { materialId: b.materialId, materialName: b.materialName, uom: b.uom, totalReceipts: b.totalReceipts, totalIssues: b.totalIssues, balance: b.balance });
                      } else {
                        const g = matMap.get(b.materialId)!;
                        g.totalReceipts += b.totalReceipts;
                        g.totalIssues += b.totalIssues;
                        g.balance = Math.round((g.balance + b.balance) * 1e9) / 1e9;
                      }
                    }
                    return Array.from(matMap.values()).map((global) => {
                      const partyCards = filteredBalances.filter(b => b.materialId === global.materialId);
                      const isGlobalTank = /bitumen|ldo/i.test(global.materialName);
                      return (
                        <div key={global.materialId}>
                          {/* Global aggregate card */}
                          <div
                            className={`p-4 rounded-lg border mb-3 ${
                              !isGlobalTank && global.balance < 0
                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                                : !isGlobalTank && global.balance < 10
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                : 'bg-primary/5 border-primary/30'
                            }`}
                            data-testid={`card-global-balance-${global.materialId}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-foreground">{global.materialName}</h3>
                              <span className="px-2 py-0.5 text-sm rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                                {isGlobalTank ? 'PHYSICAL TANK BALANCE' : 'BOOK / THEORETICAL BALANCE'}
                              </span>
                            </div>
                            {!isGlobalTank && global.balance < 0 && (
                              <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                                Reconciliation Required — book balance based on theoretical dispatch consumption.
                              </p>
                            )}
                            <div className={`text-2xl font-bold mb-3 ${
                              !isGlobalTank && global.balance < 0 ? 'text-amber-600 dark:text-amber-400' :
                              !isGlobalTank && global.balance < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
                            }`}>
                              {Math.abs(global.balance) < 1e-9 ? '0.000' : global.balance.toFixed(3)} <span className="text-base font-normal text-muted-foreground">{global.uom}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                                <div className="text-sm text-muted-foreground">Total Receipts</div>
                                <div className="font-semibold text-green-600 dark:text-green-400">+{global.totalReceipts.toFixed(3)}</div>
                              </div>
                              <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                                <div className="text-sm text-muted-foreground">Total Issues</div>
                                <div className="font-semibold text-red-600 dark:text-red-400">-{global.totalIssues.toFixed(3)}</div>
                              </div>
                            </div>
                          </div>
                          {/* Per-party breakdown cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-4 border-l-2 border-primary/20">
                            {partyCards.map((b, idx) => (
                              <div
                                key={idx}
                                onClick={() => jumpToLedger(b.materialId, b.partyId)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all hover-elevate ${
                                  b.balance < 0 && !/bitumen|ldo/i.test(b.materialName)
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    : 'bg-card border-border hover:border-primary/30'
                                }`}
                                data-testid={`card-balance-${b.materialId}-${b.partyId}`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`px-2 py-0.5 text-sm rounded ${
                                    b.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                                    'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                  }`}>
                                    {b.partyName}
                                  </span>
                                  {b.balance < 0 && !/bitumen|ldo/i.test(b.materialName) && (
                                    <span className="px-1.5 py-0.5 text-sm rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">Recon.</span>
                                  )}
                                </div>
                                <div className={`text-lg font-bold mb-2 ${b.balance < 0 && !/bitumen|ldo/i.test(b.materialName) ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                  {Math.abs(b.balance) < 1e-9 ? '0.000' : b.balance.toFixed(3)} <span className="text-sm font-normal text-muted-foreground">{b.uom}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-muted-foreground">
                                  <span className="text-green-600 dark:text-green-400">+{b.totalReceipts.toFixed(3)}</span>
                                  <span className="text-red-600 dark:text-red-400">-{b.totalIssues.toFixed(3)}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-sm"
                                    onClick={(e) => { e.stopPropagation(); jumpToLedger(b.materialId, b.partyId); }}
                                    data-testid={`button-view-ledger-${b.materialId}-${b.partyId}`}
                                  >
                                    Ledger
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })() : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBalances.map((b, idx) => (
                    <div 
                      key={idx}
                      onClick={() => jumpToLedger(b.materialId, b.partyId)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        b.balance < 0 && !/bitumen|ldo/i.test(b.materialName)
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                          : b.balance < 10 && !/bitumen|ldo/i.test(b.materialName)
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-card border-border hover:border-primary/30'
                      }`}
                      data-testid={`card-balance-${b.materialId}-${b.partyId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-foreground">{b.materialName}</h3>
                        {b.balance < 0 && !/bitumen|ldo/i.test(b.materialName) ? (
                          <span className="px-2 py-0.5 text-sm rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">
                            RECON. REQUIRED
                          </span>
                        ) : b.balance < 10 ? (
                          <span className="px-2 py-0.5 text-sm rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium">
                            LOW
                          </span>
                        ) : null}
                      </div>
                      {b.balance < 0 && !/bitumen|ldo/i.test(b.materialName) && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                          Reconciliation Required — book balance based on theoretical dispatch consumption. Enter opening stock in Material Masters to resolve.
                        </p>
                      )}
                      
                      <div className={`text-2xl font-bold ${b.convertedBalance !== null ? 'mb-1' : 'mb-3'} ${
                        b.balance < 0 && !/bitumen|ldo/i.test(b.materialName) ? 'text-amber-600 dark:text-amber-400' : 
                        b.balance < 10 && !/bitumen|ldo/i.test(b.materialName) ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
                      }`}>
                        {Math.abs(b.balance) < 1e-9 ? '0.000' : b.balance.toFixed(3)} <span className="text-base font-normal text-muted-foreground">{b.uom}</span>
                      </div>
                      {b.convertedBalance !== null && b.conversionToUom && (
                        <div className="text-sm text-muted-foreground mb-3">
                          = {b.convertedBalance.toFixed(3)} {b.conversionToUom}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                          <div className="text-sm text-muted-foreground">Total Receipts</div>
                          <div className="font-semibold text-green-600 dark:text-green-400">+{b.totalReceipts.toFixed(3)}</div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <div className="text-sm text-muted-foreground">Total Issues</div>
                          <div className="font-semibold text-red-600 dark:text-red-400">-{b.totalIssues.toFixed(3)}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 text-sm rounded ${
                          b.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                          'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        }`}>
                          {b.partyName}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpToLedger(b.materialId, b.partyId);
                          }}
                          data-testid={`button-view-ledger-${b.materialId}`}
                        >
                          View Ledger
                        </Button>
                      </div>
                    </div>
                  ))}
                  </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Transaction Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !ledgerForDisplay?.length && !(dateFrom && balanceAsOfLoading) ? (
                <p className="text-muted-foreground text-center py-8">No transactions found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-semibold">Date</th>
                        <th className="text-left p-3 font-semibold">Material</th>
                        <th className="text-left p-3 font-semibold">Stock Owner</th>
                        <th className="text-left p-3 font-semibold">Type</th>
                        <th className="text-left p-3 font-semibold">Issued To</th>
                        <th className="text-right p-3 font-semibold text-green-600 dark:text-green-400">In</th>
                        <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Out</th>
                        <th className="text-right p-3 font-semibold">{selectedPartyId === "all" ? "Global Balance" : isTankedMaterial ? "Physical Tank Balance" : "Book Balance"}</th>
                        {selectedPartyId === "all" && (
                          <th className="text-right p-3 font-semibold text-muted-foreground">Party Balance</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dateFrom && balanceAsOfLoading && (
                        <tr className="border-b bg-amber-50 dark:bg-amber-900/20 animate-pulse">
                          <td className="p-3"><div className="h-4 w-20 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-24 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-5 w-28 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-32 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-14 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-6 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                          {selectedPartyId === "all" && <td className="p-3 text-right"><div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>}
                        </tr>
                      )}
                      {ledgerForDisplay.slice(0, 100).filter(entry => {
                        // Suppress stale opening_balance rows while the fresh balance query is loading
                        // to prevent transient zero/stale B/F values appearing alongside the skeleton
                        if (entry.transactionType === 'opening_balance' && dateFrom && balanceAsOfLoading) return false;
                        return true;
                      }).map((entry) => {
                        // Use the same helper as exports for consistency
                        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
                        const isBF = entry.transactionType === 'opening_balance';
                        
                        return (
                        <tr
                          key={entry.id}
                          data-row-id={entry.id}
                          ref={entry.id === scrollToId ? scrollTargetCallbackRef : undefined}
                          className={`border-b ${isBF ? 'bg-amber-50 dark:bg-amber-900/20 font-semibold' : 'hover:bg-muted/30'}`}
                        >
                          <td className="p-3">{entry.date}</td>
                          <td className="p-3 font-medium">{getMaterialName(entry.materialId)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-sm rounded ${
                              isBF && selectedPartyId === "all"
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                : entry.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                                'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            }`}>
                              {isBF && selectedPartyId === "all" ? "All Parties" : getPartyName(entry.partyId)}
                            </span>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const isRebuildDelta = !!entry._mergedDelta;
                              const badgeClass = isBF
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : isRebuildDelta
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : entry.transactionType === 'receipt' || entry.transactionType === 'opening' || entry.transactionType === 'adjustment'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : entry.transactionType === 'return'
                                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                                : entry.transactionType === 'issue'
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                : entry.transactionType === 'tank_transfer'
                                ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                                : entry.transactionType === 'equipment_usage' || entry.transactionType === 'dpr_equipment_usage'
                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                                : entry.transactionType === 'ldo_dip_consumption'
                                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                                : entry.transactionType === 'transfer'
                                ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                                : entry.transactionType === 'direct_purchase'
                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
                              const label = isBF ? 'B/F Opening Bal.'
                                : isRebuildDelta ? 'Dispatch Revision'
                                : entry.transactionType === 'receipt' ? 'Receipt'
                                : entry.transactionType === 'dispatch' ? 'Dispatch'
                                : entry.transactionType === 'issue' ? 'Issue'
                                : entry.transactionType === 'tank_transfer' ? '→ Boiler Tank'
                                : entry.transactionType === 'opening' ? 'Opening'
                                : entry.transactionType === 'adjustment' ? 'Adjustment'
                                : entry.transactionType === 'return' ? 'Return'
                                : entry.transactionType === 'transfer' ? 'Transfer'
                                : entry.transactionType === 'equipment_usage' ? 'Equip. Usage'
                                : entry.transactionType === 'dpr_equipment_usage' ? 'DPR Equip. Usage'
                                : entry.transactionType === 'direct_purchase' ? 'Direct Site Purchase'
                                : entry.transactionType === 'ldo_dip_consumption' ? 'Actual Consumption'
                                : entry.transactionType;
                              return <span className={`px-2 py-0.5 text-sm rounded ${badgeClass}`}>{label}</span>;
                            })()}
                          </td>
                          <td className="p-3 text-muted-foreground text-sm">
                            <div className="flex items-center gap-1.5">
                              <span>
                                {(() => {
                                  if (isBF) return entry.notes;
                                  const mDelta = entry._mergedDelta;
                                  const mOrigOut = entry._originalQtyOut;
                                  if (mDelta != null && mDelta !== 0) {
                                    const suffix = ` (was ${(mOrigOut ?? 0).toFixed(3)}T, ${mDelta >= 0 ? '+' : ''}${mDelta.toFixed(3)}T \u2192 ${(entry.quantityOut || 0).toFixed(3)}T)`;
                                    return (entry.notes || '-') + suffix;
                                  }
                                  if (entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to '))
                                    return entry.notes.replace('Diesel issued to ', '');
                                  if (entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to '))
                                    return entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)';
                                  if (entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at '))
                                    return entry.notes.replace('Direct purchase at ', '');
                                  if (entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to '))
                                    return entry.notes.replace('Issue to ', '').split(' - ')[0];
                                  if (entry.transactionType === 'tank_transfer' && entry.notes?.startsWith('Transfer to '))
                                    return entry.notes.replace('Transfer to ', '');
                                  return entry.notes || '-';
                                })()}
                              </span>
                              {!isBF && (entry.transactionType === 'equipment_usage' || entry.transactionType === 'dpr_equipment_usage') && (
                                  <Link href={`/plant/equipment-usage?dateFrom=${entry.date}&dateTo=${entry.date}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer" title="View equipment usage for this date">
                                      <ClipboardList className="w-3.5 h-3.5" />
                                      <span>View</span>
                                    </span>
                                  </Link>
                                )}
                              {!isBF && entry.transactionType === 'receipt' && entry.referenceId != null && (
                                <Link href={`/plant/material-receipts?edit=${entry.referenceId}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <ExternalLink className="w-4 h-4 text-primary hover:text-primary/80 flex-shrink-0 cursor-pointer" title="Open & edit this receipt" />
                                </Link>
                              )}
                              {!isBF && entry.transactionType === 'dispatch' && entry.referenceId != null && !entry._mergedDelta && (
                                <Link href={`/plant/dispatches?edit=${entry.referenceId}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <ExternalLink className="w-4 h-4 text-primary hover:text-primary/80 flex-shrink-0 cursor-pointer" title="Open & edit this dispatch" />
                                </Link>
                              )}
                              {!isBF && (entry.transactionType === 'issue' || entry.transactionType === 'tank_transfer') && entry.referenceId != null && (
                                <Link href={`/plant/material-issues?highlight=${entry.referenceId}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <ExternalLink className="w-4 h-4 text-primary hover:text-primary/80 flex-shrink-0 cursor-pointer" title="View this issue" />
                                </Link>
                              )}
                              {!isBF && entry.transactionType === 'return' && entry.referenceId != null && (
                                <Link href={`/plant/material-returns?highlight=${entry.referenceId}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <ExternalLink className="w-4 h-4 text-primary hover:text-primary/80 flex-shrink-0 cursor-pointer" title="View this return" />
                                </Link>
                              )}
                              {!isBF && entry.transactionType === 'transfer' && entry.referenceId != null && (
                                <Link href={`/plant/stock-transfer?returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <ExternalLink className="w-4 h-4 text-primary hover:text-primary/80 flex-shrink-0 cursor-pointer" title="View stock transfer" />
                                </Link>
                              )}
                              {!isBF && entry.transactionType === 'direct_purchase' && (
                                <Link href={`/plant/equipment-usage?dateFrom=${entry.date}&dateTo=${entry.date}&returnTo=${buildLedgerReturnTo(entry.id)}`}>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer" title="View equipment usage for this date">
                                    <ClipboardList className="w-3.5 h-3.5" />
                                    <span>View</span>
                                  </span>
                                </Link>
                              )}
                              {!isBF && entry.transactionType === 'ldo_dip_consumption' && (
                                <Link href={`/plant/ldo-logs`}>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer" title="View detailed LDO consumption logs">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>LDO Logs</span>
                                  </span>
                                </Link>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                            {isBF ? (displayBalance >= 0 ? displayBalance.toFixed(3) : '-') : (displayIn > 0 ? `${displayIn.toFixed(3)}` : '-')}
                          </td>
                          <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isBF && isTankedMaterial && entry.tankNumber != null && displayOut > 0 && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 text-sm font-bold rounded border ${entry.tankNumber === 1 ? 'bg-white dark:bg-transparent border-current text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-transparent border-current text-purple-600 dark:text-purple-400'}`}>
                                  T{entry.tankNumber}
                                </span>
                              )}
                              {isBF ? (displayBalance < 0 ? Math.abs(displayBalance).toFixed(3) : '-') : (displayOut > 0 ? displayOut.toFixed(3) : '-')}
                            </div>
                          </td>
                          <td className={`p-3 text-right font-bold ${displayBalance < -1e-9 && !isTankedMaterial ? 'text-red-600 dark:text-red-400' : ''}`}>
                            <span>
                              {Math.abs(displayBalance) < 1e-9 ? '0.000' : displayBalance.toFixed(3)} {balanceUom}
                            </span>
                            {!isBF && isTankedMaterial && ((entry.t1BalanceAfter ?? 0) !== 0 || (entry.t2BalanceAfter ?? 0) !== 0) && (
                              <div className="flex items-center justify-end gap-2 mt-0.5 text-sm font-normal">
                                <span className="text-blue-600 dark:text-blue-400">T1: {(entry.t1BalanceAfter ?? 0).toFixed(3)} {balanceUom}</span>
                                <span className="text-purple-600 dark:text-purple-400">T2: {(entry.t2BalanceAfter ?? 0).toFixed(3)} {balanceUom}</span>
                              </div>
                            )}
                            {displayBalance < -1e-9 && !isBF && !isTankedMaterial && (
                              <span className="ml-1 px-1.5 py-0.5 text-sm rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">Recon.</span>
                            )}
                          </td>
                          {selectedPartyId === "all" && (() => {
                            const pb = entry.partyBalance ?? 0;
                            const isPartyNeg = pb < -1e-9;
                            const rowPartyName = entry.partyId ? (parties?.find((p: any) => p.id === entry.partyId)?.name ?? '') : '';
                            const rowPartyAbbr = rowPartyName
                              ? rowPartyName.split(/[\s\-]+/).filter(Boolean).map((w: string) => w[0]).join('').slice(0, 3).toUpperCase()
                              : '';
                            return (
                              <td className={`p-3 text-right text-sm ${isPartyNeg ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>
                                {isBF ? (
                                  <span className="text-sm italic">combined</span>
                                ) : (
                                  <>
                                    {rowPartyAbbr && (
                                      <span className="mr-1 px-1 py-0.5 text-sm rounded bg-muted text-muted-foreground font-mono" title={rowPartyName}>{rowPartyAbbr}</span>
                                    )}
                                    <span className={isPartyNeg ? 'font-semibold' : ''}>
                                      {Math.abs(pb) < 1e-9 ? '0.000' : pb.toFixed(3)}
                                    </span>
                                    {isPartyNeg && (
                                      <span className="ml-1 px-1 py-0.5 text-sm rounded bg-red-100 dark:bg-red-900/40 font-medium">borrowed</span>
                                    )}
                                  </>
                                )}
                              </td>
                            );
                          })()}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/70 border-t-2">
                      <tr>
                        <td colSpan={5} className="p-3 font-bold text-right">Filtered Totals:</td>
                        <td className="p-3 text-right text-green-600 dark:text-green-400 font-bold">
                          {ledgerTotals.totalIn.toFixed(3)}
                        </td>
                        <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">
                          {ledgerTotals.totalOut.toFixed(3)}
                        </td>
                        <td className="p-3 text-right font-bold">
                          Net: {ledgerTotals.netChange >= 0 ? '+' : ''}{ledgerTotals.netChange.toFixed(3)}
                        </td>
                        {selectedPartyId === "all" && <td />}
                      </tr>
                    </tfoot>
                  </table>
                  {ledgerForDisplay.length > 100 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Showing first 100 of {ledgerForDisplay.length} transactions
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HLC Borrow Reconciliation ── */}
        {isAdmin && (
        <TabsContent value="hlc-recon" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="w-5 h-5" />
                HLC Borrow Reconciliation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Compares "borrowed from HLC" as computed by the Party Statement against what HLC's own stock ledger recorded at dispatch time. Any mismatch (delta ≠ 0) may require a stock correction.
              </p>
            </CardHeader>
            <CardContent>
              {/* Selectors — shared with Party Statement */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Party</Label>
                  <Select value={stmtPartyId} onValueChange={(v) => { setStmtPartyId(v); setReconEnabled(false); }}>
                    <SelectTrigger data-testid="recon-select-party"><SelectValue placeholder="Select party" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">— Select party —</SelectItem>
                      {parties?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material</Label>
                  <Select value={stmtMaterialId} onValueChange={(v) => { setStmtMaterialId(v); setReconEnabled(false); }}>
                    <SelectTrigger data-testid="recon-select-material"><SelectValue placeholder="Select material" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">— Select material —</SelectItem>
                      {materials?.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input type="date" value={stmtDateFrom} onChange={e => { setStmtDateFrom(e.target.value); setReconEnabled(false); }} data-testid="recon-input-date-from" />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input type="date" value={stmtDateTo} onChange={e => { setStmtDateTo(e.target.value); setReconEnabled(false); }} data-testid="recon-input-date-to" />
                </div>
              </div>
              <Button
                disabled={stmtPartyId === "all" || stmtMaterialId === "all" || reconLoading}
                onClick={() => { setReconEnabled(true); if (reconEnabled) refetchRecon(); }}
                data-testid="btn-generate-recon"
                className="mb-6"
              >
                {reconLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Run Reconciliation
              </Button>

              {reconData && (() => {
                const { uom, rows, totals } = reconData;
                const partyName = parties?.find(p => String(p.id) === stmtPartyId)?.name ?? "Party";
                const materialName = materials?.find(m => String(m.id) === stmtMaterialId)?.name ?? "Material";
                const dateRange = [stmtDateFrom, stmtDateTo].filter(Boolean).join(' to ') || 'All Dates';
                const hasMismatches = rows.some(r => r.delta != null && Math.abs(r.delta) > 0.001);
                const hasLegacy = rows.some(r => r.isLegacy);
                const PROJECT_NAME = companyName;

                const escapeHtml = (s: string) =>
                  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

                const handlePrintRecon = () => {
                  const tableRows = rows.map(r => {
                    const isMismatch = r.delta != null && Math.abs(r.delta) > 0.001;
                    const deltaStr = r.delta != null
                      ? (r.delta >= 0 ? `+${r.delta.toFixed(3)}` : r.delta.toFixed(3))
                      : 'N/A';
                    const hlcStr = r.hlcLedgerDispatched != null ? r.hlcLedgerDispatched.toFixed(3) : 'unlinked';
                    const rowBg = r.isLegacy ? '#f8fafc' : isMismatch ? '#fef3c7' : '';
                    return `<tr${rowBg ? ` style="background:${rowBg}"` : ''}>
                      <td>${escapeHtml(r.date)}</td>
                      <td>${escapeHtml(r.site || '-')}</td>
                      <td style="text-align:right">${r.partyStatementBorrowed.toFixed(3)}</td>
                      <td style="text-align:right">${escapeHtml(hlcStr)}</td>
                      <td style="text-align:right;font-weight:${isMismatch ? 'bold' : 'normal'};color:${isMismatch ? (r.delta! > 0 ? '#b45309' : '#dc2626') : 'inherit'}">${escapeHtml(deltaStr)}</td>
                    </tr>`;
                  }).join('');
                  const w = window.open('', '_blank');
                  if (!w) return;
                  w.document.write(`<!DOCTYPE html><html><head><title>HLC Borrow Reconciliation &#8212; ${escapeHtml(partyName)}</title>
                    <style>body{font-family:sans-serif;padding:20px;font-size:11px}
                    h1{margin-bottom:2px;font-size:16px}h2{margin-bottom:4px;font-size:13px}p{margin:2px 0}
                    table{width:100%;border-collapse:collapse;margin-top:12px}
                    th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
                    th{background:#f5f5f5;font-size:10px}
                    .note{font-size:10px;color:#555;margin-top:6px}
                    .mismatch-banner{background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:6px 10px;margin:8px 0;font-weight:bold}</style></head><body>
                    <h1>${escapeHtml(PROJECT_NAME)}</h1>
                    <h2>HLC Borrow Reconciliation</h2>
                    <p><strong>Party:</strong> ${escapeHtml(partyName)} &nbsp;|&nbsp; <strong>Material:</strong> ${escapeHtml(materialName)} &nbsp;|&nbsp; <strong>Period:</strong> ${escapeHtml(dateRange)}</p>
                    ${hasMismatches ? '<div class="mismatch-banner">&#9888; Mismatches detected &#8212; highlighted rows require review</div>' : '<p style="color:#059669;font-weight:bold">&#10003; No mismatches detected &#8212; ledgers are reconciled</p>'}
                    <table><thead><tr>
                      <th>Date</th><th>Dispatch Site</th>
                      <th style="text-align:right">Party Stmt Borrowed (${escapeHtml(uom)})</th>
                      <th style="text-align:right">HLC Ledger Dispatched (${escapeHtml(uom)})</th>
                      <th style="text-align:right">Delta (${escapeHtml(uom)})</th>
                    </tr></thead>
                    <tbody>${tableRows}</tbody>
                    <tfoot><tr>
                      <td colspan="2"><strong>Totals</strong></td>
                      <td style="text-align:right"><strong>${totals.partyStatementBorrowed.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${totals.hlcLedgerDispatched.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${escapeHtml((totals.delta >= 0 ? '+' : '') + totals.delta.toFixed(3))}</strong></td>
                    </tr></tfoot>
                    </table>
                    <p class="note">* Delta = Party Statement Borrowed &#8722; HLC Ledger Dispatched. Positive = party owes more than HLC ledger shows; Negative = HLC ledger over-charges.</p>
                    </body></html>`);
                  w.document.close();
                  w.print();
                };

                const handlePdfRecon = () => {
                  const doc = new jsPDF({ orientation: 'landscape' });
                  doc.setFontSize(16);
                  doc.text(PROJECT_NAME, 14, 13);
                  doc.setFontSize(12);
                  doc.text('HLC Borrow Reconciliation', 14, 20);
                  doc.setFontSize(9);
                  doc.text(`Party: ${partyName}   |   Material: ${materialName}   |   Period: ${dateRange}`, 14, 27);
                  doc.text(hasMismatches ? '⚠ Mismatches detected — highlighted rows require review' : '✓ No mismatches — ledgers are reconciled', 14, 33);
                  autoTable(doc, {
                    startY: 38,
                    head: [['Date', 'Dispatch Site', `Party Stmt Borrowed\n(${uom})`, `HLC Ledger Dispatched\n(${uom})`, `Delta\n(${uom})`, 'Status']],
                    body: rows.map(r => [
                      r.date,
                      r.site || '-',
                      r.partyStatementBorrowed.toFixed(3),
                      r.hlcLedgerDispatched != null ? r.hlcLedgerDispatched.toFixed(3) : 'unlinked',
                      r.delta != null ? ((r.delta >= 0 ? '+' : '') + r.delta.toFixed(3)) : 'N/A',
                      r.isLegacy ? 'Legacy' : (r.delta != null && Math.abs(r.delta) > 0.001 ? (r.delta > 0 ? 'Party owes more' : 'HLC over-charges') : 'Match'),
                    ]),
                    foot: [['', 'Totals (reconcilable)',
                      totals.partyStatementBorrowed.toFixed(3),
                      totals.hlcLedgerDispatched.toFixed(3),
                      (totals.delta >= 0 ? '+' : '') + totals.delta.toFixed(3),
                      '',
                    ]],
                    theme: 'striped',
                    headStyles: { fillColor: [99, 102, 241] },
                    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
                    styles: { fontSize: 7.5 },
                    margin: { left: 10, right: 10 },
                    didParseCell: (data) => {
                      if (data.section === 'body') {
                        const row = rows[data.row.index];
                        if (row?.isLegacy) {
                          data.cell.styles.fillColor = [248, 250, 252];
                        } else if (row && row.delta != null && Math.abs(row.delta) > 0.001) {
                          data.cell.styles.fillColor = [254, 243, 199];
                        }
                      }
                    },
                  });
                  const ts = format(new Date(), 'yyyyMMdd_HHmm');
                  const blob = doc.output('blob');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `HLCRecon_${partyName.replace(/\s+/g, '')}_${materialName}_${ts}.pdf`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 100);
                  toast({ title: "PDF download started" });
                };

                return (
                  <div>
                    {/* Status banner */}
                    {hasMismatches ? (
                      <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-amber-700 dark:text-amber-300 text-sm font-medium">
                        <span className="text-base">⚠</span>
                        Mismatches detected — {rows.filter(r => r.delta != null && Math.abs(r.delta) > 0.001).length} dispatch(es) have a discrepancy between the party statement and HLC ledger.
                      </div>
                    ) : !hasLegacy ? (
                      <div className="mb-2 flex items-center gap-2 rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 px-4 py-2 text-green-700 dark:text-green-300 text-sm font-medium">
                        <span className="text-base">✓</span>
                        No mismatches — party statement and HLC ledger are fully reconciled for this selection.
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/20 px-4 py-2 text-slate-600 dark:text-slate-400 text-sm font-medium">
                        <span className="text-base">✓</span>
                        No mismatches in linked dispatches — reconciliation complete for trackable entries.
                      </div>
                    )}
                    {hasLegacy && (
                      <div className="mb-4 flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/20 px-4 py-2 text-slate-600 dark:text-slate-400 text-sm">
                        <span>ℹ</span>
                        {rows.filter(r => r.isLegacy).length} legacy (unlinked) dispatch(es) require manual verification — these predate referenceId tracking and cannot be automatically matched to HLC ledger entries.
                      </div>
                    )}

                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="rounded-lg border p-3 text-center border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                        <p className="text-sm text-muted-foreground mb-1">Party Stmt Borrowed</p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-300">{totals.partyStatementBorrowed.toFixed(3)}</p>
                        <p className="text-sm text-muted-foreground">{uom}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20">
                        <p className="text-sm text-muted-foreground mb-1">HLC Ledger Dispatched</p>
                        <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{totals.hlcLedgerDispatched.toFixed(3)}</p>
                        <p className="text-sm text-muted-foreground">{uom}</p>
                      </div>
                      <div className={`rounded-lg border p-3 text-center ${Math.abs(totals.delta) > 0.001 ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20' : 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'}`}>
                        <p className="text-sm text-muted-foreground mb-1">Net Delta</p>
                        <p className={`text-lg font-bold ${Math.abs(totals.delta) > 0.001 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                          {(totals.delta >= 0 ? '+' : '')}{totals.delta.toFixed(3)}
                        </p>
                        <p className="text-sm text-muted-foreground">{uom}</p>
                      </div>
                    </div>

                    {/* Export buttons */}
                    <div className="flex gap-2 mb-4">
                      <Button variant="outline" size="sm" onClick={handlePdfRecon} data-testid="btn-recon-pdf">
                        <Download className="w-4 h-4 mr-1" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={handlePrintRecon} data-testid="btn-recon-print">
                        <Printer className="w-4 h-4 mr-1" /> Print
                      </Button>
                    </div>

                    {/* Reconciliation table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold">Date</th>
                            <th className="text-left p-3 font-semibold">Dispatch Site</th>
                            <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Party Stmt Borrowed ({uom})</th>
                            <th className="text-right p-3 font-semibold text-indigo-600 dark:text-indigo-400">HLC Ledger Dispatched ({uom})</th>
                            <th className="text-right p-3 font-semibold">Delta ({uom})</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => {
                            const isMismatch = r.delta != null && Math.abs(r.delta) > 0.001;
                            const deltaPositive = r.delta != null && r.delta > 0.001;
                            const deltaStr = r.delta != null
                              ? (r.delta >= 0 ? '+' : '') + r.delta.toFixed(3)
                              : 'N/A';
                            return (
                              <tr key={idx} className={`border-b hover:bg-muted/30 ${r.isLegacy ? 'bg-slate-50/60 dark:bg-slate-900/20' : isMismatch ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`} data-testid={`recon-row-${idx}`}>
                                <td className="p-3 whitespace-nowrap">{r.date}</td>
                                <td className="p-3 text-muted-foreground">{r.site || '-'}</td>
                                <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">
                                  {r.partyStatementBorrowed.toFixed(3)}
                                </td>
                                <td className="p-3 text-right text-indigo-600 dark:text-indigo-400 font-medium">
                                  {r.hlcLedgerDispatched != null ? r.hlcLedgerDispatched.toFixed(3) : <span className="text-muted-foreground italic text-sm">unlinked</span>}
                                </td>
                                <td className={`p-3 text-right font-medium ${r.isLegacy ? 'text-muted-foreground' : isMismatch ? (deltaPositive ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400') : 'text-green-600 dark:text-green-400'}`}>
                                  {r.isLegacy ? <span className="italic text-sm">N/A</span> : (isMismatch ? <strong>{deltaStr}</strong> : deltaStr)}
                                </td>
                                <td className="p-3">
                                  {r.isLegacy ? (
                                    <span className="px-2 py-0.5 text-sm rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Legacy — verify manually</span>
                                  ) : isMismatch ? (
                                    <span className="px-2 py-0.5 text-sm rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                      {deltaPositive ? 'Party owes more' : 'HLC over-charges'}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-sm rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Match</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {rows.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No dispatch entries found for this selection.</td></tr>
                          )}
                        </tbody>
                        <tfoot className="bg-muted/70 border-t-2">
                          <tr>
                            <td colSpan={2} className="p-3 font-bold">Totals</td>
                            <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">{totals.partyStatementBorrowed.toFixed(3)}</td>
                            <td className="p-3 text-right text-indigo-600 dark:text-indigo-400 font-bold">{totals.hlcLedgerDispatched.toFixed(3)}</td>
                            <td className={`p-3 text-right font-bold ${Math.abs(totals.delta) > 0.001 ? 'text-amber-700 dark:text-amber-300' : 'text-green-600 dark:text-green-400'}`}>
                              {(totals.delta >= 0 ? '+' : '')}{totals.delta.toFixed(3)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <p className="text-sm text-muted-foreground mt-3">
                      * Delta = Party Statement Borrowed − HLC Ledger Dispatched (reconcilable rows only). <strong>Positive</strong> = party owes more than HLC's ledger shows; <strong>Negative</strong> = HLC ledger over-charges the party. Totals exclude legacy/unlinked rows. Any non-zero delta should be investigated and corrected via a stock correction.
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ── Party Supply Obligation Statement ── */}
        {(isAdmin || canExport) && (
        <TabsContent value="statement" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Party Supply Obligation Statement
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Select a party and material to see what they supplied, what was borrowed from HLC, and what is still outstanding.
              </p>
            </CardHeader>
            <CardContent>
              {/* Selectors */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Party</Label>
                  <Select value={stmtPartyId} onValueChange={(v) => { setStmtPartyId(v); setStmtEnabled(false); }}>
                    <SelectTrigger data-testid="stmt-select-party"><SelectValue placeholder="Select party" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">— Select party —</SelectItem>
                      {parties?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material</Label>
                  <Select value={stmtMaterialId} onValueChange={(v) => { setStmtMaterialId(v); setStmtEnabled(false); }}>
                    <SelectTrigger data-testid="stmt-select-material"><SelectValue placeholder="Select material" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">— Select material —</SelectItem>
                      {materials?.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input type="date" value={stmtDateFrom} onChange={e => { setStmtDateFrom(e.target.value); setStmtEnabled(false); }} data-testid="stmt-input-date-from" />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input type="date" value={stmtDateTo} onChange={e => { setStmtDateTo(e.target.value); setStmtEnabled(false); }} data-testid="stmt-input-date-to" />
                </div>
              </div>
              <Button
                disabled={stmtPartyId === "all" || stmtMaterialId === "all" || stmtLoading}
                onClick={() => { setStmtEnabled(true); if (stmtEnabled) refetchStmt(); }}
                data-testid="btn-generate-statement"
                className="mb-6"
              >
                {stmtLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Generate Statement
              </Button>

              {stmtData && (() => {
                const { summary, entries } = stmtData;
                const partyName = parties?.find(p => String(p.id) === stmtPartyId)?.name ?? "Party";
                const materialName = materials?.find(m => String(m.id) === stmtMaterialId)?.name ?? "Material";
                const uom = summary.uom;
                const isSettled = summary.outstanding <= 0.001;
                const finalBalance = entries.length > 0 ? entries[entries.length - 1].runningBalance ?? 0 : 0;
                const totalOut = summary.dispatchedOwn + summary.borrowedFromHlc;

                const typeLabel = (dt: string) => {
                  switch (dt) {
                    case 'opening': return 'Opening Stock';
                    case 'receipt': return 'Material Received';
                    case 'own_dispatch': return 'Material Consumed';
                    case 'correction': return 'Stock Correction';
                    case 'return': return 'Material Return';
                    case 'replenishment': return 'Replenishment to HLC';
                    case 'transfer_in': return 'Transfer Received';
                    default: return 'Other';
                  }
                };
                const typeBadgeClass = (dt: string) => {
                  switch (dt) {
                    case 'receipt': case 'opening': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
                    case 'own_dispatch': return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300';
                    case 'replenishment': return 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300';
                    case 'correction': case 'return': case 'transfer_in': return 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300';
                    default: return 'bg-muted text-muted-foreground';
                  }
                };

                const PROJECT_NAME = companyName;

                const handlePrintStmt = () => {
                  const dateRange = [stmtDateFrom, stmtDateTo].filter(Boolean).join(' to ') || 'All Dates';
                  const rows = entries.map(e => {
                    const qIn = (e.quantityIn || 0);
                    const isDispatch = e.displayType === 'own_dispatch';
                    const hasBorrow = isDispatch && (e.borrowedQty ?? 0) > 0.001;
                    const tplQty = isDispatch && e.templateQty != null ? e.templateQty.toFixed(3) : '-';
                    const ownQtyStr = isDispatch && e.ownQty != null ? e.ownQty.toFixed(3) : '-';
                    const borrowedStr = isDispatch ? (e.borrowedQty ?? 0).toFixed(3) : '-';
                    return `<tr${hasBorrow ? ' style="background:#fffbeb"' : ''}>
                      <td>${e.date}</td>
                      <td>${typeLabel(e.displayType)}</td>
                      <td>${materialName}</td>
                      <td style="text-align:right">${qIn > 0 ? qIn.toFixed(3) : '-'}</td>
                      <td style="text-align:right">${tplQty}</td>
                      <td style="text-align:right">${ownQtyStr}</td>
                      <td style="text-align:right">${hasBorrow ? `<strong>${borrowedStr}</strong>` : borrowedStr}</td>
                      <td style="text-align:right">${(e.runningBalance ?? 0).toFixed(3)}</td>
                      <td>${e.notes || '-'}</td>
                    </tr>`;
                  }).join('');
                  const w = window.open('', '_blank');
                  if (!w) return;
                  w.document.write(`<!DOCTYPE html><html><head><title>Party Statement — ${partyName}</title>
                    <style>body{font-family:sans-serif;padding:20px;font-size:11px}
                    h1{margin-bottom:2px;font-size:16px}h2{margin-bottom:4px;font-size:13px}p{margin:2px 0}
                    .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}
                    .card{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}
                    .card-label{font-size:10px;color:#666;margin-bottom:4px}
                    .card-value{font-size:14px;font-weight:bold}
                    .outstanding{background:#fef3c7;border-color:#fbbf24}
                    .settled{background:#d1fae5;border-color:#34d399}
                    table{width:100%;border-collapse:collapse;margin-top:12px}
                    th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
                    th{background:#f5f5f5;font-size:10px}
                    .note{font-size:10px;color:#555;margin-top:6px}</style></head><body>
                    <h1>${PROJECT_NAME}</h1>
                    <h2>Party Supply Obligation Statement</h2>
                    <p><strong>Party:</strong> ${partyName} &nbsp;|&nbsp; <strong>Material:</strong> ${materialName} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRange}</p>
                    <div class="summary">
                      <div class="card"><div class="card-label">Total Received</div><div class="card-value">${summary.totalReceived.toFixed(3)} ${uom}</div></div>
                      <div class="card"><div class="card-label">From Own Stock</div><div class="card-value">${summary.dispatchedOwn.toFixed(3)} ${uom}</div></div>
                      <div class="card"><div class="card-label">Borrowed from HLC</div><div class="card-value">${summary.borrowedFromHlc.toFixed(3)} ${uom}</div></div>
                      <div class="card"><div class="card-label">Replenished to HLC</div><div class="card-value">${summary.replenishedToHlc.toFixed(3)} ${uom}</div></div>
                      <div class="card ${isSettled ? 'settled' : 'outstanding'}"><div class="card-label">Still Outstanding</div><div class="card-value">${summary.outstanding.toFixed(3)} ${uom}</div></div>
                    </div>
                    <table><thead><tr>
                      <th>Date</th><th>Type</th><th>Material</th>
                      <th>Received (${uom})</th>
                      <th>Template Qty (${uom})</th>
                      <th>From Own Stock (${uom})</th>
                      <th>Borrowed from HLC (${uom})</th>
                      <th>Own Stock Balance</th>
                      <th>Notes</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr>
                      <td colspan="3"><strong>Totals</strong></td>
                      <td style="text-align:right"><strong>${summary.totalReceived.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${totalOut.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${summary.dispatchedOwn.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${summary.borrowedFromHlc.toFixed(3)}</strong></td>
                      <td style="text-align:right"><strong>${finalBalance.toFixed(3)}</strong></td>
                      <td></td>
                    </tr></tfoot>
                    </table>
                    <p class="note">* Template Qty = full material consumption per dispatch as per mix template. From Own Stock = supplied from party's own inventory. Borrowed from HLC = balance covered by HLC. Outstanding = total borrowed − replenished to HLC.</p>
                    </body></html>`);
                  w.document.close();
                  w.print();
                };

                const handlePdfStmt = () => {
                  const doc = new jsPDF({ orientation: 'landscape' });
                  const dateRange = [stmtDateFrom, stmtDateTo].filter(Boolean).join(' to ') || 'All Dates';
                  doc.setFontSize(16);
                  doc.text(PROJECT_NAME, 14, 13);
                  doc.setFontSize(12);
                  doc.text(`Party Supply Obligation Statement`, 14, 20);
                  doc.setFontSize(9);
                  doc.text(`Party: ${partyName}   |   Material: ${materialName}   |   Period: ${dateRange}`, 14, 27);
                  doc.text([
                    `Received: ${summary.totalReceived.toFixed(3)} ${uom}`,
                    `From Own Stock: ${summary.dispatchedOwn.toFixed(3)} ${uom}`,
                    `Borrowed from HLC: ${summary.borrowedFromHlc.toFixed(3)} ${uom}`,
                    `Replenished to HLC: ${summary.replenishedToHlc.toFixed(3)} ${uom}`,
                    `Outstanding: ${summary.outstanding.toFixed(3)} ${uom}`,
                  ].join('    '), 14, 33);
                  autoTable(doc, {
                    startY: 38,
                    head: [[
                      'Date', 'Type', 'Material',
                      `Received\n(${uom})`,
                      `Template Qty\n(${uom})`,
                      `From Own\nStock (${uom})`,
                      `Borrowed\nfrom HLC (${uom})`,
                      'Own Stock\nBalance',
                      'Notes',
                    ]],
                    body: entries.map(e => {
                      const isDispatch = e.displayType === 'own_dispatch';
                      return [
                        e.date,
                        typeLabel(e.displayType),
                        materialName,
                        (e.quantityIn || 0) > 0 ? (e.quantityIn || 0).toFixed(3) : '-',
                        isDispatch && e.templateQty != null ? e.templateQty.toFixed(3) : '-',
                        isDispatch && e.ownQty != null ? e.ownQty.toFixed(3) : '-',
                        isDispatch ? (e.borrowedQty ?? 0).toFixed(3) : '-',
                        (e.runningBalance ?? 0).toFixed(3),
                        e.notes || '-',
                      ];
                    }),
                    foot: [[
                      '', 'Totals', materialName,
                      summary.totalReceived.toFixed(3),
                      totalOut.toFixed(3),
                      summary.dispatchedOwn.toFixed(3),
                      summary.borrowedFromHlc.toFixed(3),
                      finalBalance.toFixed(3),
                      '',
                    ]],
                    theme: 'striped',
                    headStyles: { fillColor: [59, 130, 246] },
                    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
                    styles: { fontSize: 6.5 },
                    margin: { left: 10, right: 10 },
                    didParseCell: (data) => {
                      if (data.section === 'body') {
                        const rowEntry = entries[data.row.index];
                        if (rowEntry?.displayType === 'own_dispatch' && (rowEntry?.borrowedQty ?? 0) > 0.001) {
                          data.cell.styles.fillColor = [255, 251, 235];
                        }
                      }
                    },
                  });
                  const ts = format(new Date(), 'yyyyMMdd_HHmm');
                  const blob = doc.output('blob');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `PartyStatement_${partyName.replace(/\s+/g,'')}_${materialName}_${ts}.pdf`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 100);
                  toast({ title: "PDF download started" });
                };

                const matId = parseInt(stmtMaterialId);
                const hasAdjustments = allTemplateComponents?.some(
                  c => c.materialId === matId && ((c.moistureContent ?? 0) > 0 || (c.wastageFactor ?? 0) > 0)
                ) ?? false;

                return (
                  <div>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                      {[
                        { label: 'Total Received', value: summary.totalReceived, color: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20', textColor: 'text-green-700 dark:text-green-300' },
                        { label: 'Dispatched (Own Stock)', value: summary.dispatchedOwn, color: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20', textColor: 'text-orange-700 dark:text-orange-300' },
                        { label: 'Borrowed from HLC', value: summary.borrowedFromHlc, color: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20', textColor: 'text-red-700 dark:text-red-300' },
                        { label: 'Replenished to HLC', value: summary.replenishedToHlc, color: 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20', textColor: 'text-sky-700 dark:text-sky-300' },
                        { label: 'Still Outstanding', value: summary.outstanding, color: isSettled ? 'border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30' : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20', textColor: isSettled ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300' },
                      ].map(card => (
                        <div key={card.label} className={`rounded-lg border p-3 text-center ${card.color}`}>
                          <p className="text-sm text-muted-foreground mb-1">{card.label}</p>
                          <p className={`text-lg font-bold ${card.textColor}`}>{card.value.toFixed(3)}</p>
                          <p className="text-sm text-muted-foreground">{uom}</p>
                        </div>
                      ))}
                    </div>

                    {/* Export buttons */}
                    <div className="flex gap-2 mb-4">
                      <Button variant="outline" size="sm" onClick={handlePdfStmt} data-testid="btn-stmt-pdf">
                        <Download className="w-4 h-4 mr-1" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={handlePrintStmt} data-testid="btn-stmt-print">
                        <Printer className="w-4 h-4 mr-1" /> Print
                      </Button>
                    </div>

                    {/* Detail table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold">Date</th>
                            <th className="text-left p-3 font-semibold">Type</th>
                            <th className="text-left p-3 font-semibold">Material</th>
                            <th className="text-right p-3 font-semibold text-green-600 dark:text-green-400">Received ({uom})</th>
                            <th className="text-right p-3 font-semibold text-blue-600 dark:text-blue-400">Template Qty ({uom})</th>
                            <th className="text-right p-3 font-semibold text-orange-600 dark:text-orange-400">From Own Stock ({uom})</th>
                            <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Borrowed from HLC ({uom})</th>
                            <th className="text-right p-3 font-semibold">Own Balance</th>
                            <th className="text-left p-3 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(e => {
                            const isDispatch = e.displayType === 'own_dispatch';
                            const hasBorrow = isDispatch && (e.borrowedQty ?? 0) > 0.001;
                            return (
                            <tr key={e.id} className={`border-b hover:bg-muted/30 ${hasBorrow ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                              <td className="p-3 whitespace-nowrap">{e.date}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 text-sm rounded ${typeBadgeClass(e.displayType)}`}>
                                  {typeLabel(e.displayType)}
                                </span>
                              </td>
                              <td className="p-3 text-muted-foreground">{materialName}</td>
                              <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                                {(e.quantityIn || 0) > 0 ? (e.quantityIn || 0).toFixed(3) : '-'}
                              </td>
                              <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-medium">
                                {isDispatch && e.templateQty != null ? e.templateQty.toFixed(3) : '-'}
                              </td>
                              <td className="p-3 text-right text-orange-600 dark:text-orange-400 font-medium">
                                {isDispatch && e.ownQty != null ? e.ownQty.toFixed(3) : '-'}
                              </td>
                              <td className={`p-3 text-right font-medium ${hasBorrow ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                {isDispatch ? (e.borrowedQty ?? 0).toFixed(3) : '-'}
                              </td>
                              <td className={`p-3 text-right font-medium ${(e.runningBalance ?? 0) < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                {(e.runningBalance ?? 0).toFixed(3)}
                              </td>
                              <td className="p-3 text-muted-foreground text-sm">{e.notes || '-'}</td>
                            </tr>
                            );
                          })}
                          {entries.length === 0 && (
                            <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No entries found for this selection.</td></tr>
                          )}
                        </tbody>
                        <tfoot className="bg-muted/70 border-t-2">
                          <tr>
                            <td colSpan={2} className="p-3 font-bold">Totals</td>
                            <td className="p-3 text-muted-foreground">{materialName}</td>
                            <td className="p-3 text-right text-green-600 dark:text-green-400 font-bold">{summary.totalReceived.toFixed(3)}</td>
                            <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-bold">{totalOut.toFixed(3)}</td>
                            <td className="p-3 text-right text-orange-600 dark:text-orange-400 font-bold">{summary.dispatchedOwn.toFixed(3)}</td>
                            <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">{summary.borrowedFromHlc.toFixed(3)}</td>
                            <td className={`p-3 text-right font-bold ${finalBalance < 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{finalBalance.toFixed(3)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Footnote */}
                    <p className="text-sm text-muted-foreground mt-3">
                      * Template Qty = material consumption per dispatch as per mix template{hasAdjustments ? ", adjusted for moisture content and wastage factor" : ""}. From Own Stock = supplied from party's own inventory. Borrowed from HLC = balance covered by HLC. Outstanding = total borrowed − replenished to HLC.
                    </p>
                    {hasAdjustments && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                        ⚠ Moisture content and/or wastage factor is set for this material in the mix template. Template Qty figures include the upward adjustment — the party must supply more wet material than the base mix design quantity to account for water and handling losses.
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
        )}

      </Tabs>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {confirmAction === "reconcile" && "Reconcile Stock Data"}
              {confirmAction === "fix-phantom" && "Fix Phantom Balances"}
              {confirmAction === "rebuild" && "Rebuild Dispatch Ledger"}
              {confirmAction === "reassign" && "Reassign Ledger Entries"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {confirmAction === "reconcile" && (
                  <p>Re-links equipment and dispatch fuel consumption to tank ledger entries. Corrects mismatches between book entries and physical stock without deleting any records. Safe to run at any time.</p>
                )}
                {confirmAction === "fix-phantom" && (
                  <>
                    <p>Scans for stock balance rows that are negative but have <strong>no backing ledger entries</strong> — and zeros them out.</p>
                    <p className="text-amber-700 dark:text-amber-400">Only use when you are certain the negative balance is an orphan artefact, not a real shortfall. This cannot be undone.</p>
                  </>
                )}
                {confirmAction === "rebuild" && (
                  <>
                    <p>Opens the <strong>Rebuild Dispatch Ledger</strong> tool where you choose a mix template and cutoff date.</p>
                    <p className="text-amber-700 dark:text-amber-400">Rebuilding rewrites aggregate component ledger rows from the cutoff onward using current mix proportions. Cannot be undone.</p>
                  </>
                )}
                {confirmAction === "reassign" && (
                  <>
                    <p>Opens the <strong>Ledger Reassignment</strong> tool where you can move entries between parties.</p>
                    <p className="text-amber-700 dark:text-amber-400">Reassigning stock ledger entries permanently changes party-wise balance totals.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-adv-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (confirmAction === "reconcile") { setConfirmAction(null); handleReconcileClick(); }
                else if (confirmAction === "fix-phantom") { setConfirmAction(null); fixOrphanMutation.mutate(); }
                else if (confirmAction === "rebuild") { setConfirmAction(null); navigate(appendPlantContext("/plant/ledger-rebuild", { defaultTab: "stock" })); }
                else if (confirmAction === "reassign") { setConfirmAction(null); navigate(appendPlantContext("/plant/stock-reassign", { defaultTab: "stock" })); }
              }}
              data-testid="button-adv-proceed"
            >
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
