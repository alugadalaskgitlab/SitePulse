import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { ChevronLeft, Loader2, Save, Lock, Search, Plus, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { isManualVendorRateCard, MANUAL_VENDOR_RATE_CARD_NOTE } from "@shared/vendorRateCardIdentity";
import type {
  RateCardTidyDecision,
  RateCardTidyCard,
  RateCardTidyGroup,
  UnlinkedRateCardGroup,
} from "@shared/vendorRateCardTidy";
import { rateCardTidyIdentity } from "@shared/vendorRateCardTidy";
import { SITE_MATERIAL_TRIP_MATERIAL_OPTIONS } from "@shared/siteMaterialTripMaterials";
import type { VendorAlias } from "@shared/schema";
import { TransportRateBasis, TransportRateSetup, hasTransportSetup } from "@/components/TransportRateSetup";
import type { TransportRateFields } from "@/components/TransportRateSetup";

type DiscoveredItem = {
  itemKey: string;
  itemLabel: string;
  category: string;
  unit: string;
  rate: number | null;
  rateCardId: number | null;
  isManual?: boolean;
  vendorName?: string | null;
  updatedAt?: string | Date | null;
};

type ManualRow = {
  id: string;
  itemKey: string;
  itemLabel: string;
  category: string;
  unit: string;
  rate: number | string;
  rateCardId?: number;
  notes?: string | null;
  isNewMaterialTransport?: boolean;
};
type VendorMasterOption = { id: number; name: string; isActive?: boolean };
type PossibleBillMatch = {
  billNo: string;
  billDate: string | Date;
  description: string;
  unit: string | null;
  rate: number;
};
type RateCardTidyPreview = {
  previewVersion: string;
  sameRateGroups: RateCardTidyGroup[];
  conflictingGroups: RateCardTidyGroup[];
  unlinkedGroups: UnlinkedRateCardGroup[];
  possibleMatches: Record<number, PossibleBillMatch | null>;
  billTextRows: Array<RateCardTidyCard & { possibleMatch: PossibleBillMatch | null }>;
};
type RateCardHistoryEntry = {
  id: number;
  createdAt: string | Date;
  userName: string | null;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  reason: string | null;
};
type TidyUiChoice =
  | { action: "defer" }
  | { action: "keep"; keepCardId: number }
  | { action: "custom"; rateText: string };

const UNIT_OPTIONS = ["HRS", "DAYS", "TRIPS", "MONTHS", "TRIP", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "KM", "HEAD-DAY"];

const BILLING_MODES = [
  { value: "HOURLY HIRE", unit: "HRS" },
  { value: "DAILY HIRE", unit: "DAYS" },
  { value: "TRIP BASED", unit: "TRIPS" },
  { value: "MONTHLY HIRE", unit: "MONTHS" },
  { value: "TIME/METER", unit: "HRS" },
];

const TRANSPORT_MODES = [
  { value: "TRIP", unit: "TRIP" },
  { value: "HOURLY HIRE", unit: "HRS" },
  { value: "DAILY HIRE", unit: "DAYS" },
  { value: "MONTHLY HIRE", unit: "MONTHS" },
];

const LABOUR_CATEGORIES = ["SKILLED", "SEMI-SKILLED", "UNSKILLED", "SUPERVISOR"];
const normalizeItemName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
const compactItemName = (value: string) => normalizeItemName(value).replace(/\s/g, "");
const formatRateCardDate = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const normalizeDuplicateIdentity = (category: string, itemKey: string, unit: string) => {
  const upperCategory = category.trim().toUpperCase();
  const upperUnit = unit.trim().toUpperCase().replace(/\s+/g, "_");
  let name = itemKey.trim().toUpperCase();
  if (upperCategory === "MATERIAL" && name.startsWith("MAT_")) name = name.slice(4);
  else if (["EQUIPMENT", "TRANSPORT"].includes(upperCategory) && name.startsWith("EQ_")) name = name.slice(3);
  else if (upperCategory === "LABOUR" && name.startsWith("LAB_")) name = name.slice(4);
  const unitSuffix = `_${upperUnit}`;
  if (name.endsWith(unitSuffix)) name = name.slice(0, -unitSuffix.length);
  return `${upperCategory}:${name.replace(/[\s_]/g, "")}:${upperUnit}`;
};
const rateCardRowStateKey = (item: { itemKey: string; rateCardId?: number | null }) =>
  item.rateCardId != null ? `card_${item.rateCardId}` : `key_${item.itemKey}`;

const getCategoryBadgeClass = (cat: string) => {
  switch (cat) {
    case "equipment": return "bg-blue-600 text-white border-blue-700";
    case "material": return "bg-amber-600 text-white border-amber-700";
    case "transport": return "bg-purple-600 text-white border-purple-700";
    case "labour": return "bg-pink-600 text-white border-pink-700";
    default: return "bg-gray-500 text-white border-gray-600";
  }
};

export default function RateCards({ draftVendor, onReturnToDraft }: { draftVendor?: string; onReturnToDraft?: () => void } = {}) {
  const { toast } = useToast();
  const { featureCan, user } = useAuth();
  const canViewRateCards = featureCan("rate_cards", "view");
  const canAddRates = featureCan("rate_cards", "add");
  const canEditRates = featureCan("rate_cards", "edit");
  const canCancelRates = featureCan("rate_cards", "cancel");
  const isOwner = user?.isOwner === true;
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedVendor = draftVendor ?? params.get("vendorName") ?? "";
  const _backHref = params.get("returnTo") || "/finance/hub";

  // The embedded bill workflow also enforces the Rate Cards feature directly.
  const [selectedVendor, setSelectedVendor] = useState(preselectedVendor);
  const [vendorNameInput, setVendorNameInput] = useState(preselectedVendor);
  const [rates, setRates] = useState<Record<string, number | string>>({});
  const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>({});
  const [searchFilter, setSearchFilter] = useState("");
  const [tidyChoices, setTidyChoices] = useState<Record<string, TidyUiChoice>>({});
  const [tidyReason, setTidyReason] = useState("");
  const [tidyBusy, setTidyBusy] = useState(false);
  const [tidyMessage, setTidyMessage] = useState("");
  const [tidyPreviewExpanded, setTidyPreviewExpanded] = useState(false);
  const [billTextRowsSelected, setBillTextRowsSelected] = useState<Record<number, boolean>>({});
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [linkVendorIds, setLinkVendorIds] = useState<Record<string, string>>({});
  const [linkReasons, setLinkReasons] = useState<Record<string, string>>({});
  const [linkingName, setLinkingName] = useState<string | null>(null);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [setupRow, setSetupRow] = useState<DiscoveredItem | ManualRow | null>(null);
  const activeVendorRef = useRef(selectedVendor);
  activeVendorRef.current = selectedVendor;

  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [addEqType, setAddEqType] = useState("");
  const [addEqMode, setAddEqMode] = useState("");

  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [addMatName, setAddMatName] = useState("");
  const [addMatUnit, setAddMatUnit] = useState("CFT");

  const [showAddTransport, setShowAddTransport] = useState(false);
  const [addTransKind, setAddTransKind] = useState<"machine" | "material">("machine");
  const [addTransType, setAddTransType] = useState("");
  const [addTransMode, setAddTransMode] = useState("");
  const [addTransMaterial, setAddTransMaterial] = useState("");

  const [showAddLabour, setShowAddLabour] = useState(false);
  const [addLabCategory, setAddLabCategory] = useState("");
  const [addLabGender, setAddLabGender] = useState("");

  const { data: vendorNames = [] } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
    enabled: canViewRateCards,
  });
  const { data: vendorMasters = [] } = useQuery<VendorMasterOption[]>({
    queryKey: ["/api/vendor-master"],
    enabled: canViewRateCards,
  });
  const tidyPreviewQuery = useQuery<RateCardTidyPreview>({
    queryKey: ["/api/vendor-rate-cards/tidy-preview"],
    enabled: isOwner,
    queryFn: async () => {
      const response = await fetch("/api/vendor-rate-cards/tidy-preview", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Couldn't load the rate-card tidy preview");
      return response.json();
    },
  });
  const rateCardHistoryQuery = useQuery<RateCardHistoryEntry[]>({
    queryKey: ["/api/vendor-rate-cards/history"],
    enabled: isOwner && historyExpanded,
    queryFn: async () => {
      const response = await fetch("/api/vendor-rate-cards/history", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Couldn't load rate-card history");
      return response.json();
    },
  });
  const { data: vendorAliases = [] } = useQuery<VendorAlias[]>({
    queryKey: ["/api/vendor-aliases"],
    enabled: canViewRateCards,
  });
  const vendorKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const selectedVendorKey = vendorKey(selectedVendor);
  const selectedAliasCanonicals = new Set(vendorAliases
    .filter(alias => vendorKey(alias.alias) === selectedVendorKey || vendorKey(alias.canonicalName) === selectedVendorKey)
    .map(alias => vendorKey(alias.canonicalName)));
  const matchingVendorMasters = vendorMasters.filter(vendor =>
    vendor.isActive !== false && (vendorKey(vendor.name) === selectedVendorKey || selectedAliasCanonicals.has(vendorKey(vendor.name))));
  const selectedVendorMaster = matchingVendorMasters.length === 1 ? matchingVendorMasters[0] : null;
  const resetSelectedVendorData = (name: string) => {
    setSelectedVendor(name);
    setVendorNameInput(name);
    setSetupRow(null);
    setRates({});
    setUnitOverrides({});
    setSearchFilter("");
    setManualRows([]);
  };

  const tidyDecisions = useMemo<RateCardTidyDecision[]>(() => {
    const groups = tidyPreviewQuery.data?.conflictingGroups ?? [];
    return groups.reduce<RateCardTidyDecision[]>((decisions, group) => {
      const choice = tidyChoices[group.key];
      if (!choice) return decisions;
      if (choice.action === "defer") {
        decisions.push({ key: group.key, action: "defer" });
        return decisions;
      }
      if (choice.action === "keep") {
        decisions.push({ key: group.key, action: "keep", keepCardId: choice.keepCardId });
        return decisions;
      }
      const rate = Number(choice.rateText);
      if (Number.isFinite(rate) && rate > 0) decisions.push({ key: group.key, action: "custom", rate });
      return decisions;
    }, []);
  }, [tidyChoices, tidyPreviewQuery.data?.conflictingGroups]);
  const allTidyConflictsDecided = (tidyPreviewQuery.data?.conflictingGroups ?? []).every(group => {
    const choice = tidyChoices[group.key];
    if (!choice) return false;
    return choice.action !== "custom" || (Number.isFinite(Number(choice.rateText)) && Number(choice.rateText) > 0);
  });
  const hasTidyOperations = (tidyPreviewQuery.data?.sameRateGroups.length ?? 0) > 0 ||
    tidyDecisions.some(decision => decision.action !== "defer") ||
    Object.keys(billTextRowsSelected).some(id => billTextRowsSelected[Number(id)]);
  const selectedBillTextCardIds = Object.keys(billTextRowsSelected)
    .filter(id => billTextRowsSelected[Number(id)])
    .map(Number);

  const submitRateCardTidy = async () => {
    const preview = tidyPreviewQuery.data;
    if (!preview || tidyBusy || !isOwner || !allTidyConflictsDecided || !hasTidyOperations || tidyReason.trim().length < 3) return;
    setTidyBusy(true);
    setTidyMessage("");
    try {
      const response = await apiRequest("POST", "/api/vendor-rate-cards/tidy-apply", {
        previewVersion: preview.previewVersion,
        reason: tidyReason.trim(),
        decisions: tidyDecisions,
        removeBillTextCardIds: selectedBillTextCardIds,
      });
      const result = await response.json();
      setTidyMessage(`Tidy applied: ${result.mergedRows} duplicate row(s) merged; ${result.removedBillTextRows} bill-text row(s) removed; ${result.deferredConflicts} conflict(s) left unchanged.`);
      setTidyChoices({});
      setTidyReason("");
      setBillTextRowsSelected({});
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/tidy-preview"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/history"] });
    } catch (error) {
      setTidyMessage(error instanceof Error ? error.message : "Tidy could not be applied.");
    } finally {
      setTidyBusy(false);
    }
  };

  const linkUnlinkedName = async (group: UnlinkedRateCardGroup) => {
    const vendorId = Number(linkVendorIds[group.key]);
    const reason = linkReasons[group.key]?.trim() ?? "";
    if (!isOwner || !vendorId || reason.length < 3 || linkingName) return;
    setLinkingName(group.key);
    setTidyMessage("");
    try {
      const response = await apiRequest("POST", "/api/vendor-rate-cards/link-name", {
        nameKey: group.key,
        vendorId,
        reason,
      });
      const result = await response.json();
      setTidyMessage(`Linked ${result.linkedRows} saved row(s) to ${result.vendorName}. Their saved vendor names and rates were preserved.`);
      setLinkVendorIds(previous => ({ ...previous, [group.key]: "" }));
      setLinkReasons(previous => ({ ...previous, [group.key]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/tidy-preview"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/history"] });
    } catch (error) {
      setTidyMessage(error instanceof Error ? error.message : "Rate cards could not be linked.");
    } finally {
      setLinkingName(null);
    }
  };

  const { data: allRateCards = [], isFetched: isRateCardsFetched } = useQuery<any[]>({
    queryKey: ["/api/vendor-rate-cards", selectedVendor],
    enabled: !!selectedVendor && canViewRateCards,
    queryFn: async () => {
      const r = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(selectedVendor)}`);
      return r.ok ? r.json() : [];
    },
  });

  const savedItems = useMemo<DiscoveredItem[]>(() => allRateCards.map(card => ({
    itemKey: String(card.itemKey ?? "").trim().toUpperCase(),
    itemLabel: String(card.itemLabel || card.itemKey || "").trim(),
    category: String(card.category ?? "").trim().toLowerCase(),
    unit: String(card.unit ?? "").trim().toUpperCase(),
    rate: Number(card.rate),
    rateCardId: Number(card.id),
    isManual: isManualVendorRateCard(card.notes),
    vendorName: card.vendorName ?? null,
    updatedAt: card.updatedAt ?? null,
  })).filter(item => item.itemKey && item.itemLabel && item.category && item.unit && Number.isFinite(item.rate) && Number.isFinite(item.rateCardId)), [allRateCards]);

  const { data: canonicalTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/equipment-master/canonical-types"],
    enabled: !!selectedVendor && canViewRateCards,
    queryFn: async () => {
      const r = await fetch("/api/equipment-master/canonical-types");
      return r.ok ? r.json() : [];
    },
  });

  const { data: plantMaterials = [], isError: plantMaterialsError } = useQuery<any[]>({
    queryKey: ["/api/plant-module/materials"],
    enabled: !!selectedVendor && canViewRateCards,
    queryFn: async () => {
      const response = await fetch("/api/plant-module/materials", { credentials: "include" });
      if (!response.ok) throw new Error("Couldn't load materials");
      return response.json();
    },
  });

  useEffect(() => {
    if (!isRateCardsFetched || savedItems.length === 0) return;
    setRates(previous => {
      const rateMap = { ...previous };
      savedItems.forEach(item => {
        const stateKey = rateCardRowStateKey(item);
        if (!(stateKey in rateMap)) rateMap[stateKey] = item.rate ?? "";
      });
      return rateMap;
    });
  }, [isRateCardsFetched, savedItems]);

  const bulkSaveMutation = useMutation({
    mutationFn: (items: any[]) => apiRequest("POST", "/api/vendor-rate-cards/bulk-upsert", { items }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      const savedIdentities = new Set(variables.map((item: any) =>
        normalizeDuplicateIdentity(item.category, item.itemKey, item.unit),
      ));
      setManualRows(previous => previous.filter(row =>
        !savedIdentities.has(normalizeDuplicateIdentity(row.category, row.itemKey, row.unit)),
      ));
      const savedCount = variables.filter((i: any) => i.rate && i.rate > 0).length;
      toast({ title: `${savedCount} rate(s) saved` });
      onReturnToDraft?.();
    },
    onError: (err: any) => toast({ title: err.message || "Failed to save rates", variant: "destructive" }),
  });

  const deleteSavedCardMutation = useMutation({
    mutationFn: async (item: DiscoveredItem) => {
      const response = await apiRequest("DELETE", `/api/vendor-rate-cards/${item.rateCardId}/copies`);
      return response.json();
    },
    onSuccess: (result: { removedCount: number }, item) => {
      const identity = rateCardTidyIdentity(item);
      const stateKeys = savedItems.filter(row => rateCardTidyIdentity(row) === identity).map(rateCardRowStateKey);
      setRates(previous => {
        const next = { ...previous };
        stateKeys.forEach(key => { delete next[key]; });
        return next;
      });
      setUnitOverrides(previous => {
        const next = { ...previous };
        stateKeys.forEach(key => { delete next[key]; });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/history"] });
      toast({ title: `Removed ${result.removedCount} saved copy/copies. Existing bills are not affected.` });
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to remove saved rate", variant: "destructive" }),
  });

  const handleDeleteSavedCard = (item: DiscoveredItem) => {
    const identity = rateCardTidyIdentity(item);
    const copyCount = Math.max(1, savedItems.filter(row => rateCardTidyIdentity(row) === identity).length);
    if (!window.confirm(`Remove ${item.itemLabel} (${item.unit}) — ${copyCount} saved copies? Existing bills are not affected.`)) return;
    deleteSavedCardMutation.mutate(item);
  };

  const visibleDiscoveredItems = useMemo(
    () => savedItems.filter(item =>
      !searchFilter || item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase()),
    ),
    [savedItems, searchFilter],
  );

  const getEffectiveUnit = (item: DiscoveredItem) => unitOverrides[rateCardRowStateKey(item)] || item.unit;

  const getEffectiveKey = (item: DiscoveredItem) => {
    const overriddenUnit = unitOverrides[rateCardRowStateKey(item)];
    if (!overriddenUnit || overriddenUnit === item.unit) return item.itemKey;
    const parts = item.itemKey.split("_");
    if (parts.length >= 2) {
      parts[parts.length - 1] = overriddenUnit;
      return parts.join("_");
    }
    return item.itemKey;
  };

  const findTransportCard = (row: DiscoveredItem | ManualRow) => {
    const byId = row.rateCardId != null ? allRateCards.find(card => Number(card.id) === Number(row.rateCardId)) : undefined;
    return byId || allRateCards.find(card =>
      card.category === row.category && card.itemKey === row.itemKey && card.unit === row.unit);
  };

  const transportSaveFields = (row: DiscoveredItem | ManualRow) => {
    if (row.category !== "transport") return {};
    const card = findTransportCard(row);
    if (!card) return {};
    return {
      ...(card.notes !== undefined ? { notes: card.notes } : {}),
    };
  };

  const saveTransportSetup = async (fields: TransportRateFields) => {
    if (!setupRow) return;
    let row = setupRow;
    const vendor = selectedVendor;
    let card = findTransportCard(row);
    if (row.category === "transport" && "isNewMaterialTransport" in row && row.isNewMaterialTransport && !card) {
      if (!selectedVendorMaster) throw new Error("Choose a Vendor Master record before adding a transport rate.");
      if (!(Number(fields.ratePerKm) > 0) || !(Number(fields.leadDistanceKm) > 0) || !(Number(fields.payloadMt) > 0)) {
        throw new Error("Enter a positive rate, one-way lead and payload.");
      }
      const createResponse = await apiRequest("POST", "/api/vendor-rate-cards", {
        vendorName: selectedVendor,
        vendorId: selectedVendorMaster.id,
        category: "transport",
        itemKey: row.itemKey,
        itemLabel: row.itemLabel,
        unit: "TRIP",
        rate: fields.ratePerKm,
        notes: MANUAL_VENDOR_RATE_CARD_NOTE,
      });
      card = await createResponse.json();
      const updatedRow = { ...row, rateCardId: Number(card.id), isNewMaterialTransport: true } as ManualRow;
      row = updatedRow;
      setSetupRow(current => current && "id" in current && current.id === updatedRow.id ? updatedRow : current);
      queryClient.setQueryData<any[]>(["/api/vendor-rate-cards", vendor], previous => [
        ...(previous ?? []).filter(candidate => Number(candidate.id) !== Number(card.id)),
        card,
      ]);
    }
    if (!card?.id) throw new Error("Rate setup is available only for a saved rate-card row");
    const body = {
      itemKey: card.itemKey,
      ...fields,
    };
    const response = await apiRequest("PATCH", `/api/vendor-rate-cards/${card.id}/transport-setup`, body);
    const saved = await response.json();
    queryClient.setQueryData<any[]>(["/api/vendor-rate-cards", vendor], previous => {
      const nextCard = { ...card, ...body, ...saved };
      return [...(previous ?? []).filter(candidate =>
        Number(candidate.id) !== Number(nextCard.id)), nextCard];
    });
    if (activeVendorRef.current !== vendor) return;
    toast({ title: "Transport rate setup saved" });
  };

  const handleUnitChange = (item: DiscoveredItem, newUnit: string) => {
    const stateKey = rateCardRowStateKey(item);
    setUnitOverrides(prev => ({ ...prev, [stateKey]: newUnit }));
    const parts = item.itemKey.split("_");
    if (parts.length >= 2) {
      parts[parts.length - 1] = newUnit;
      const newKey = parts.join("_");
      const existingCard = allRateCards.find(
        (rc: any) => rc.itemKey.toUpperCase() === newKey.toUpperCase() && rc.category === item.category && rc.unit === newUnit
      );
      if (existingCard && Number(existingCard.rate) > 0) {
        setRates(prev => ({ ...prev, [stateKey]: Number(existingCard.rate) }));
      } else {
        setRates(prev => {
          const updated = { ...prev };
          delete updated[stateKey];
          return updated;
        });
      }
    }
  };

  const handleAddEquipmentRow = () => {
    if (!addEqType || !addEqMode) {
      toast({ title: "Select machine type and billing mode", variant: "destructive" });
      return;
    }
    const mode = BILLING_MODES.find(m => m.value === addEqMode);
    const unit = mode?.unit || "HRS";
    const machine = normalizeItemName(addEqType);
    const key = `EQ_${machine.replace(/\s+/g, "_")}_${unit}`;
    if (hasDuplicateRateCard("equipment", key, unit)) {
      toast({ title: `${addEqType} - ${addEqMode} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_eq_${Date.now()}`,
      itemKey: key,
      itemLabel: `${machine} - ${addEqMode}`,
      category: "equipment",
      unit,
      rate: "",
      notes: MANUAL_VENDOR_RATE_CARD_NOTE,
    }]);
    setAddEqType("");
    setAddEqMode("");
    setShowAddEquipment(false);
  };

  const handleAddMaterialRow = () => {
    if (!addMatName || !addMatUnit) {
      toast({ title: "Select material and unit", variant: "destructive" });
      return;
    }
    const material = normalizeItemName(addMatName);
    const unit = addMatUnit.trim().toUpperCase();
    const key = `MAT_${material.replace(/\s+/g, "_")}_${unit}`;
    if (hasDuplicateRateCard("material", key, unit)) {
      toast({ title: `${addMatName} - ${addMatUnit} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_mat_${Date.now()}`,
      itemKey: key,
      itemLabel: material,
      category: "material",
      unit,
      rate: "",
      notes: MANUAL_VENDOR_RATE_CARD_NOTE,
    }]);
    setAddMatName("");
    setAddMatUnit("CFT");
    setShowAddMaterial(false);
  };

  const handleAddTransportRow = () => {
    if (addTransKind === "material") {
      if (!addTransMaterial) {
        toast({ title: "Select material", variant: "destructive" });
        return;
      }
      const material = normalizeItemName(addTransMaterial);
      const key = `EQ_${material.replace(/\s+/g, "_")}_TRIP`;
      if (hasDuplicateRateCard("transport", key, "TRIP")) {
        toast({ title: `${material} transport already exists`, variant: "destructive" });
        return;
      }
      if (!canEditRates) {
        setManualRows(prev => [...prev, {
          id: `manual_material_transport_${Date.now()}`,
          itemKey: key,
          itemLabel: `${material} - TRANSPORT`,
          category: "transport",
          unit: "TRIP",
          rate: "",
          notes: MANUAL_VENDOR_RATE_CARD_NOTE,
        }]);
        setAddTransMaterial("");
        setShowAddTransport(false);
        return;
      }
      setSetupRow({
        id: `new_material_transport_${Date.now()}`,
        itemKey: key,
        itemLabel: `${material} - TRANSPORT`,
        category: "transport",
        unit: "TRIP",
        rate: "",
        isNewMaterialTransport: true,
      });
      setAddTransMaterial("");
      setShowAddTransport(false);
      return;
    }
    if (!addTransType || !addTransMode) {
      toast({ title: "Select machine type and billing mode", variant: "destructive" });
      return;
    }
    const machine = normalizeItemName(addTransType);
    const mode = TRANSPORT_MODES.find(m => m.value === addTransMode);
    const unit = mode?.unit || "TRIP";
    const key = `EQ_${machine.replace(/\s+/g, "_")}_${unit}`;
    if (hasDuplicateRateCard("transport", key, unit)) {
      toast({ title: `${machine} - ${addTransMode} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_trans_${Date.now()}`,
      itemKey: key,
      itemLabel: `${machine} - ${addTransMode}`,
      category: "transport",
      unit,
      rate: "",
      notes: MANUAL_VENDOR_RATE_CARD_NOTE,
    }]);
    setAddTransType("");
    setAddTransMode("");
    setShowAddTransport(false);
  };

  const handleAddLabourRow = () => {
    if (!addLabCategory) {
      toast({ title: "Select labour category", variant: "destructive" });
      return;
    }
    const cat = addLabCategory.toUpperCase();
    const gender = addLabGender.toUpperCase();
    const key = gender ? `LAB_${cat}_${gender}` : `LAB_${cat}`;
    const label = gender ? `LABOUR ${cat} ${gender}` : `LABOUR ${cat}`;
    if (hasDuplicateRateCard("labour", key, "HEAD-DAY")) {
      toast({ title: `${label} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_lab_${Date.now()}`,
      itemKey: key,
      itemLabel: label,
      category: "labour",
      unit: "HEAD-DAY",
      rate: "",
      notes: MANUAL_VENDOR_RATE_CARD_NOTE,
    }]);
    setAddLabCategory("");
    setAddLabGender("");
    setShowAddLabour(false);
  };

  const handleSaveAll = () => {
    if (!selectedVendorMaster) {
      toast({ title: "Choose a Vendor Master record before saving", description: "Add an unknown spelling as an alias or create the vendor first.", variant: "destructive" });
      return;
    }
    const discoveredToSave = (canEditRates ? savedItems : []).map(item => {
      const setupCard = item.category === "transport" ? findTransportCard(item) : undefined;
      const effectiveUnit = hasTransportSetup(setupCard) ? setupCard.unit : getEffectiveUnit(item);
      const effectiveKey = hasTransportSetup(setupCard) ? setupCard.itemKey : getEffectiveKey(item);
      return {
        vendorName: selectedVendor,
        vendorId: selectedVendorMaster.id,
        category: item.category,
        itemKey: effectiveKey,
        itemLabel: item.itemLabel,
        unit: effectiveUnit,
        rate: parseFloat(String(rates[rateCardRowStateKey(item)] ?? item.rate ?? 0)) || 0,
        ...transportSaveFields(item),
      };
    }).filter(i => i.rate > 0);

    const manualToSave = (canAddRates ? manualRows : []).map(row => ({
      vendorName: selectedVendor,
      vendorId: selectedVendorMaster.id,
      category: row.category,
      itemKey: row.itemKey,
      itemLabel: row.itemLabel,
      unit: row.unit,
      rate: parseFloat(String(row.rate || 0)) || 0,
      ...(row.notes !== undefined ? { notes: row.notes } : { notes: MANUAL_VENDOR_RATE_CARD_NOTE }),
      ...transportSaveFields(row),
    })).filter(i => i.rate > 0);

    const allToSave = [...discoveredToSave, ...manualToSave];

    if (allToSave.length === 0) {
      toast({ title: "No rates to save — enter at least one rate", variant: "destructive" });
      return;
    }
    bulkSaveMutation.mutate(allToSave);
  };

  const handleRemoveManualRow = (row: ManualRow) =>
    setManualRows(previous => previous.filter(candidate => candidate.id !== row.id));

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const equipmentItems = useMemo(() => {
    return visibleDiscoveredItems.filter(item => {
      if (item.category !== "equipment") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [visibleDiscoveredItems, searchFilter]);

  const materialItems = useMemo(() => {
    return visibleDiscoveredItems.filter(item => {
      if (item.category !== "material") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [visibleDiscoveredItems, searchFilter]);

  const transportItems = useMemo(() => {
    return visibleDiscoveredItems.filter(item => {
      if (item.category !== "transport") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [visibleDiscoveredItems, searchFilter]);

  const labourItems = useMemo(() => {
    return visibleDiscoveredItems.filter(item => {
      if (item.category !== "labour") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [visibleDiscoveredItems, searchFilter]);

  const equipmentManualRows = useMemo(() => manualRows.filter(r => r.category === "equipment"), [manualRows]);
  const materialManualRows = useMemo(() => manualRows.filter(r => r.category === "material"), [manualRows]);
  const transportManualRows = useMemo(() => manualRows.filter(r => r.category === "transport"), [manualRows]);
  const labourManualRows = useMemo(() => manualRows.filter(r => r.category === "labour"), [manualRows]);

  const filledCount = useMemo(() => {
    const discoveredFilled = visibleDiscoveredItems.filter(item => parseFloat(String(rates[rateCardRowStateKey(item)])) > 0).length;
    const manualFilled = manualRows.filter(r => parseFloat(String(r.rate)) > 0).length;
    return discoveredFilled + manualFilled;
  }, [rates, manualRows, visibleDiscoveredItems]);

  const materialNameOptions = useMemo(() => {
    const names = [
      ...SITE_MATERIAL_TRIP_MATERIAL_OPTIONS,
      ...plantMaterials
      .map((material: any) => normalizeItemName(String(material.name ?? "")))
      .filter(Boolean),
    ].map(name => normalizeItemName(name)).sort((a, b) => a.localeCompare(b));
    const unique = new Map<string, string>();
    names.forEach((name: string) => {
      if (!unique.has(compactItemName(name))) unique.set(compactItemName(name), name);
    });
    return Array.from(unique.values());
  }, [plantMaterials]);

  const machineTypeOptions = useMemo(() => {
    const names = canonicalTypes
      .map(name => normalizeItemName(name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const unique = new Map<string, string>();
    names.forEach(name => {
      if (!unique.has(compactItemName(name))) unique.set(compactItemName(name), name);
    });
    return Array.from(unique.values());
  }, [canonicalTypes]);

  const hasDuplicateRateCard = (category: string, itemKey: string, unit: string) => {
    const identity = normalizeDuplicateIdentity(category, itemKey, unit);
    return savedItems.some(item => normalizeDuplicateIdentity(item.category, item.itemKey, item.unit) === identity) ||
      manualRows.some(row => normalizeDuplicateIdentity(row.category, row.itemKey, row.unit) === identity);
  };

  const renderItemRow = (item: DiscoveredItem, idx: number) => (
    <tr key={item.rateCardId ?? item.itemKey} className="border-t hover:bg-muted/30" data-testid={`row-discovered-item-${idx}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-sm">{item.itemLabel}</div>
        {item.vendorName && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Saved under {item.vendorName} · ₹{Number(item.rate).toLocaleString("en-IN")} · updated {formatRateCardDate(item.updatedAt) || "date unavailable"}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {item.category === "transport" && hasTransportSetup(findTransportCard(item)) ? (
          <span className="text-sm font-mono px-2 py-1 bg-muted rounded" title="Derived display unit; saved identity is unchanged">TRIP</span>
        ) : <Select value={getEffectiveUnit(item)} onValueChange={(v) => handleUnitChange(item, v)}>
          <SelectTrigger className="h-8 w-24 text-sm" data-testid={`select-unit-${idx}`} disabled={!canEditRates}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map(u => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>}
      </td>
      <td className="px-3 py-2">
        {item.category === "transport" && hasTransportSetup(findTransportCard(item)) ? (
          <TransportRateBasis fields={findTransportCard(item)} />
        ) : <Input
          type="number"
          step="0.01"
          min="0"
          value={rates[rateCardRowStateKey(item)] ?? item.rate ?? ""}
          disabled={!canEditRates}
          onChange={e => setRates(prev => ({ ...prev, [rateCardRowStateKey(item)]: e.target.value }))}
          onWheel={e => (e.target as HTMLInputElement).blur()}
          placeholder="0.00"
          className="text-right font-mono w-full"
          data-testid={`input-rate-${idx}`}
        />}
        {item.category === "transport" && <Button type="button" size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={() => setSetupRow(item)} aria-label={`Rate setup for ${item.itemLabel}`} title={!findTransportCard(item) ? "Available only for an existing saved rate-card row; setup never creates rows" : undefined} hidden={!canEditRates} disabled={!isRateCardsFetched || bulkSaveMutation.isPending || !findTransportCard(item)}>RATE SETUP</Button>}
      </td>
      <td className="px-3 py-2 w-16">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
          hidden={!canCancelRates}
          disabled={deleteSavedCardMutation.isPending}
          aria-label={`${item.rateCardId != null ? "Remove saved rate for" : "Reset unsaved rate for"} ${item.itemLabel}`}
          title="Delete saved rate card; existing bills are not affected"
          onClick={() => handleDeleteSavedCard(item)}
          data-testid={`button-remove-discovered-${idx}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );

  const renderManualRow = (row: ManualRow, idx: number) => (
    <tr key={row.id} className="border-t hover:bg-muted/30 bg-green-50/50 dark:bg-green-900/10" data-testid={`row-manual-${row.category}-${idx}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-sm flex items-center gap-2">
          {row.itemLabel}
          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300 no-default-hover-elevate no-default-active-elevate">NEW</Badge>
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="text-sm font-mono px-2 py-1 bg-muted rounded">{row.category === "transport" && hasTransportSetup(findTransportCard(row)) ? "TRIP" : row.unit}</span>
      </td>
      <td className="px-3 py-2">
        {row.category === "transport" && hasTransportSetup(findTransportCard(row)) ? (
          <TransportRateBasis fields={findTransportCard(row)} />
        ) : <Input
          type="number"
          step="0.01"
          min="0"
          value={row.rate}
          disabled={!canAddRates}
          onChange={e => {
            const val = e.target.value;
            setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, rate: val } : r));
          }}
          onWheel={e => (e.target as HTMLInputElement).blur()}
          placeholder="0.00"
          className="text-right font-mono w-full"
          data-testid={`input-manual-rate-${row.category}-${idx}`}
        />}
        {row.category === "transport" && <Button type="button" size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={() => setSetupRow(row)} aria-label={`Rate setup for ${row.itemLabel}`} title={!findTransportCard(row) ? "Available only for an existing saved rate-card row; setup never creates rows" : undefined} hidden={!canEditRates} disabled={!isRateCardsFetched || bulkSaveMutation.isPending || !findTransportCard(row)}>RATE SETUP</Button>}
      </td>
      <td className="px-3 py-2 w-16 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          title="Remove manual rate-card row"
          aria-label={`Remove ${row.itemLabel}`}
          data-testid={`button-remove-manual-${row.category}-${idx}`}
          onClick={() => handleRemoveManualRow(row)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );

  const possibleBillHint = (cardId: number) => {
    const match = tidyPreviewQuery.data?.possibleMatches?.[cardId];
    if (!match) return null;
    const rawDate = String(match.billDate);
    const parsedDate = new Date(`${rawDate.slice(0, 10)}T00:00:00`);
    const billDate = Number.isNaN(parsedDate.getTime())
      ? rawDate
      : parsedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const unit = match.unit ? ` per ${match.unit}` : "";
    return (
      <p className="mt-1 text-xs text-muted-foreground" data-testid={`possible-match-${cardId}`}>
        <span className="font-medium">Possible match:</span> Similar line on {match.billNo} ({billDate}) at ₹{Number(match.rate).toLocaleString("en-IN")}{unit}. Hint only; not proof of usage and not a default.
      </p>
    );
  };

  const renderTidyGroupRows = (group: RateCardTidyGroup) => group.rows.map(row => (
    <tr key={row.id} className="border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{row.itemLabel || row.itemKey}</div>
        <div className="text-xs text-muted-foreground">
          Saved under {row.vendorName} · ₹{Number(row.rate).toLocaleString("en-IN")} · updated {formatRateCardDate(row.updatedAt) || "date unavailable"}
        </div>
        {possibleBillHint(row.id)}
      </td>
      <td className="px-3 py-2">{row.unit}</td>
      <td className="px-3 py-2 text-right tabular-nums">₹{Number(row.rate).toLocaleString("en-IN")}</td>
      <td className="px-3 py-2">{row.id === group.keeperId
        ? `Keep ₹${Number(row.rate).toLocaleString("en-IN")} (saved under ${row.vendorName})`
        : "Merge into kept rate if applied"}</td>
    </tr>
  ));

  const renderSectionHeader = (title: string, category: string, count: number, badgeClass: string) => (
    <div
      className="flex items-center justify-between px-3 py-2 bg-muted/60 cursor-pointer select-none"
      onClick={() => toggleSection(category)}
      data-testid={`section-header-${category}`}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[12px] ${badgeClass} no-default-hover-elevate no-default-active-elevate`}>
          {title}
        </Badge>
        <span className="text-sm text-muted-foreground">{count} item(s)</span>
      </div>
      {collapsedSections[category] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
    </div>
  );

  if (!canViewRateCards) {
    return <div role="alert" className="mx-auto max-w-md py-20 text-center">
      <h2 className="text-xl font-semibold">No access</h2>
      <p className="mt-2 text-sm text-muted-foreground">Rate Cards View access is required.</p>
    </div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {setupRow && <TransportRateSetup
        key={`${selectedVendor}:${setupRow.itemKey}`}
        label={setupRow.itemLabel}
        fields={findTransportCard(setupRow)}
        requireRateAndLead={!!("isNewMaterialTransport" in setupRow && setupRow.isNewMaterialTransport)}
        onSave={saveTransportSetup}
        onClose={() => setSetupRow(null)}
      />}
      <div className="flex items-center gap-4 flex-wrap">
        {onReturnToDraft ? (
          <Button variant="ghost" onClick={onReturnToDraft} data-testid="button-back-rate-cards">
            <ChevronLeft className="w-5 h-5" /> BACK TO BILL
          </Button>
        ) : <Link href={_backHref}>
          <Button variant="ghost" size="icon" data-testid="button-back-rate-cards">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>}
        <h1 className="text-xl font-bold" data-testid="text-rate-cards-title">VENDOR RATE CARDS</h1>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-sm uppercase font-semibold">Vendor Master (preferred)</Label>
            <Select value={selectedVendorMaster ? String(selectedVendorMaster.id) : "unmatched"} onValueChange={value => {
              const vendor = vendorMasters.find(candidate => String(candidate.id) === value);
              if (vendor) resetSelectedVendorData(vendor.name);
            }}>
              <SelectTrigger data-testid="select-vendor-master">
                <SelectValue placeholder="Choose a Vendor Master record..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unmatched">Select a Vendor Master record</SelectItem>
                {vendorMasters.filter(vendor => vendor.isActive !== false).map(vendor => (
                  <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="input-rate-card-vendor-name" className="mt-3 block text-xs text-muted-foreground">Name or known alias</Label>
            <Input id="input-rate-card-vendor-name" value={vendorNameInput} onChange={event => {
              const value = event.target.value.toUpperCase();
              setVendorNameInput(value);
            }} onBlur={() => {
              const value = vendorNameInput.trim();
              if (value && value !== selectedVendor) resetSelectedVendorData(value);
            }} placeholder="Type a vendor name or alias" data-testid="input-rate-card-vendor-name" />
            <Label className="mt-3 block text-xs text-muted-foreground">Saved vendor-name suggestions</Label>
            <Select value="" onValueChange={resetSelectedVendorData}>
              <SelectTrigger data-testid="select-saved-vendor-suggestion">
                <SelectValue placeholder="Choose a saved name..." />
              </SelectTrigger>
              <SelectContent>
                {vendorNames.map(vendorName => (
                  <SelectItem key={vendorName} value={vendorName}>{vendorName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVendor && !selectedVendorMaster && (
              <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">“{selectedVendor}” is not uniquely linked to the Vendor Master.</p>
                <p className="mt-1 text-xs">Add it as an alias of an existing vendor or create a new vendor before saving.</p>
                <div className="mt-2 flex gap-2">
                  <a className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium" href="/plant/vendor-bills" target="_blank" rel="noreferrer">Manage aliases</a>
                  <a className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium" href="/masters/vendors" target="_blank" rel="noreferrer">Create vendor</a>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isOwner && (
        <Card data-testid="rate-card-unlinked-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Not linked to a vendor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These rows keep their saved supplier names until you explicitly link them. Nothing is linked or created automatically.
            </p>
            {tidyPreviewQuery.isLoading && <p role="status" className="text-sm">Loading unlinked rate cards…</p>}
            {tidyPreviewQuery.isError && <p role="alert" className="text-sm text-destructive">{String(tidyPreviewQuery.error)}</p>}
            {(tidyPreviewQuery.data?.unlinkedGroups ?? []).map(group => (
              <div key={group.key} className="rounded-md border p-3 space-y-3" data-testid={`unlinked-rate-name-${group.key}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{group.savedName}</h3>
                  <Badge variant="outline">{group.rows.length} saved row(s)</Badge>
                </div>
                {group.savedNames.length > 1 && (
                  <p className="text-xs text-muted-foreground">Saved spellings: {group.savedNames.join(" · ")}</p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Unit</th><th className="py-1 text-right">Rate</th>
                    </tr></thead>
                    <tbody>{group.rows.map(row => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="py-2 pr-2">
                          <div>{row.itemLabel || row.itemKey}</div>
                          <div className="text-xs text-muted-foreground">
                            Saved under {row.vendorName} · ₹{Number(row.rate).toLocaleString("en-IN")} · updated {formatRateCardDate(row.updatedAt) || "date unavailable"}
                          </div>
                          {possibleBillHint(row.id)}
                        </td>
                        <td className="py-2 pr-2">{row.unit}</td>
                        <td className="py-2 text-right tabular-nums">₹{Number(row.rate).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end">
                  <label className="text-xs font-medium">
                    Link to vendor
                    <select
                      className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={linkVendorIds[group.key] ?? ""}
                      onChange={event => setLinkVendorIds(previous => ({ ...previous, [group.key]: event.target.value }))}
                      data-testid={`select-link-rate-vendor-${group.key}`}
                    >
                      <option value="">Choose existing Vendor Master…</option>
                      {vendorMasters.filter(vendor => vendor.isActive !== false).map(vendor => (
                        <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium">
                    Reason for linking
                    <Input
                      value={linkReasons[group.key] ?? ""}
                      onChange={event => setLinkReasons(previous => ({ ...previous, [group.key]: event.target.value }))}
                      placeholder="Required for audit history"
                      data-testid={`input-link-rate-reason-${group.key}`}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!linkVendorIds[group.key] || (linkReasons[group.key] ?? "").trim().length < 3 || linkingName !== null}
                    onClick={() => void linkUnlinkedName(group)}
                    data-testid={`button-link-rate-vendor-${group.key}`}
                  >
                    {linkingName === group.key ? "Linking…" : "Link to vendor"}
                  </Button>
                </div>
                <a
                  className="inline-flex text-sm text-primary underline"
                  href={`/masters/vendors?create=1&name=${encodeURIComponent(group.savedName)}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`link-add-rate-vendor-${group.key}`}
                >
                  Add as new vendor
                </a>
              </div>
            ))}
            {!tidyPreviewQuery.isLoading && !tidyPreviewQuery.isError && !(tidyPreviewQuery.data?.unlinkedGroups.length) && (
              <p role="status" className="text-sm text-muted-foreground">All saved rate-card rows are linked to a Vendor Master.</p>
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card data-testid="rate-card-history-panel">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Rate card history</CardTitle>
              <Button
                type="button"
                variant="outline"
                onClick={() => setHistoryExpanded(value => !value)}
                data-testid="button-toggle-rate-history"
              >
                {historyExpanded ? "Close history" : "History"}
              </Button>
            </div>
          </CardHeader>
          {historyExpanded && (
            <CardContent className="space-y-3">
              {rateCardHistoryQuery.isLoading && <p role="status">Loading rate-card history…</p>}
              {rateCardHistoryQuery.isError && <p role="alert" className="text-sm text-destructive">{String(rateCardHistoryQuery.error)}</p>}
              {!!rateCardHistoryQuery.data?.length && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2">Date</th><th className="py-1 pr-2">Owner</th><th className="py-1 pr-2">Action</th>
                      <th className="py-1 pr-2">Old name</th><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Unit</th>
                      <th className="py-1 pr-2 text-right">Old rate</th><th className="py-1 pr-2 text-right">Kept rate</th><th className="py-1">Reason</th>
                    </tr></thead>
                    <tbody>
                      {rateCardHistoryQuery.data.map(entry => {
                        const oldRow = entry.oldValues ?? {};
                        const newValues = entry.newValues ?? {};
                        const operation = String(newValues.operation ?? "");
                        const action = operation.includes("link") ? "Linked"
                          : operation.includes("remove") ? "Removed"
                            : operation.includes("merge") || operation.includes("tidy") ? "Merged"
                              : operation || "Updated";
                        const keptRow = newValues.keptRow ?? newValues.updatedRow ?? newValues.removedRow ?? {};
                        const keptRate = keptRow.rate ?? newValues.selectedRate ?? null;
                        return (
                          <tr key={entry.id} className="border-t align-top" data-testid={`rate-history-entry-${entry.id}`}>
                            <td className="py-2 pr-2 whitespace-nowrap">{formatRateCardDate(entry.createdAt) || "—"}</td>
                            <td className="py-2 pr-2">{entry.userName || "—"}</td>
                            <td className="py-2 pr-2">{action}</td>
                            <td className="py-2 pr-2">{oldRow.vendorName || "—"}</td>
                            <td className="py-2 pr-2">{oldRow.itemLabel || oldRow.itemKey || "—"}</td>
                            <td className="py-2 pr-2">{oldRow.unit || "—"}</td>
                            <td className="py-2 pr-2 text-right">{oldRow.rate == null ? "—" : `₹${Number(oldRow.rate).toLocaleString("en-IN")}`}</td>
                            <td className="py-2 pr-2 text-right">{keptRate == null ? "—" : `₹${Number(keptRate).toLocaleString("en-IN")}`}</td>
                            <td className="py-2">{entry.reason || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!rateCardHistoryQuery.isLoading && !rateCardHistoryQuery.isError && !rateCardHistoryQuery.data?.length && (
                <p role="status" className="text-sm text-muted-foreground">No rate-card history entries yet.</p>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {isOwner && (
        <Card data-testid="rate-card-tidy-panel">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Tidy duplicate rate cards</CardTitle>
              <Button type="button" variant="outline" onClick={() => setTidyPreviewExpanded(value => !value)} data-testid="button-preview-rate-tidy">
                {tidyPreviewExpanded ? "Close Tidy preview" : "Preview Tidy"}
              </Button>
            </div>
          </CardHeader>
          {tidyPreviewExpanded && (
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Bills and bill lines are not edited. Same-rate copies are grouped for automatic merge; conflicts have no preselected rate. “Decide later” leaves that conflict unchanged.
              </p>
              {tidyPreviewQuery.isError && <p role="alert" className="text-sm text-destructive">{String(tidyPreviewQuery.error)}</p>}
              {tidyPreviewQuery.isLoading && <p role="status" className="text-sm">Preparing the read-only preview…</p>}
              {!!tidyPreviewQuery.data?.sameRateGroups.length && (
                <section aria-labelledby="same-rate-tidy-heading" className="space-y-2">
                  <h3 id="same-rate-tidy-heading" className="font-semibold">Same rate — will be merged ({tidyPreviewQuery.data.sameRateGroups.length})</h3>
                  {tidyPreviewQuery.data.sameRateGroups.map(group => (
                    <div key={group.key} className="rounded-md border p-3" data-testid={`same-rate-group-${group.key}`}>
                      <p className="font-medium">{group.vendorName} · {group.itemLabel} · {group.unit}</p>
                      <p className="text-sm text-muted-foreground">Same saved rate: ₹{Number(group.rows[0]?.rate).toLocaleString("en-IN")}. No choice needed; the kept row will be filed under the Vendor Master.</p>
                      <div className="mt-2 overflow-x-auto"><table className="w-full text-sm">
                        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Saved under</th><th className="py-1">Unit</th><th className="py-1 text-right">Rate</th><th className="py-1">Preview action</th></tr></thead>
                        <tbody>{renderTidyGroupRows(group)}</tbody>
                      </table></div>
                    </div>
                  ))}
                </section>
              )}
              {!!tidyPreviewQuery.data?.conflictingGroups.length && (
                <section aria-labelledby="conflicting-rate-tidy-heading" className="space-y-2">
                  <h3 id="conflicting-rate-tidy-heading" className="font-semibold">Conflicting rates ({tidyPreviewQuery.data.conflictingGroups.length})</h3>
                  {tidyPreviewQuery.data.conflictingGroups.map(group => {
                    const choice = tidyChoices[group.key];
                    return (
                      <div key={group.key} className="rounded-md border p-3 space-y-3" data-testid={`conflicting-rate-group-${group.key}`}>
                        <p className="font-medium">{group.vendorName} · {group.itemLabel} · {group.unit}</p>
                        <div className="overflow-x-auto"><table className="w-full text-sm">
                          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Saved under</th><th className="py-1">Unit</th><th className="py-1 text-right">Rate</th><th className="py-1">Preview action</th></tr></thead>
                          <tbody>{renderTidyGroupRows(group)}</tbody>
                        </table></div>
                        <label className="block text-sm font-medium">
                          Choose one rate, enter a new rate, or defer this conflict
                          <select
                            className="mt-1 block h-9 w-full rounded-md border bg-background px-2"
                            value={!choice ? "" : choice.action === "defer" ? "defer" : choice.action === "custom" ? "custom" : `keep:${choice.keepCardId}`}
                            onChange={event => {
                              const value = event.target.value;
                              setTidyChoices(previous => {
                                const next = { ...previous };
                                if (!value) {
                                  delete next[group.key];
                                } else if (value === "defer") {
                                  next[group.key] = { action: "defer" };
                                } else if (value === "custom") {
                                  next[group.key] = { action: "custom", rateText: "" };
                                } else if (value.startsWith("keep:")) {
                                  next[group.key] = { action: "keep", keepCardId: Number(value.slice(5)) };
                                }
                                return next;
                              });
                            }}
                            data-testid={`select-tidy-decision-${group.key}`}
                          >
                            <option value="">Select a decision…</option>
                            {group.rows.map(row => (
                              <option key={row.id} value={`keep:${row.id}`}>Keep ₹{Number(row.rate).toLocaleString("en-IN")} (saved under {row.vendorName})</option>
                            ))}
                            <option value="custom">Enter a new rate</option>
                            <option value="defer">Decide later — leave unchanged</option>
                          </select>
                        </label>
                        {choice?.action === "custom" && (
                          <label className="block max-w-sm text-sm font-medium">
                            New rate (₹ per {group.unit})
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={choice.rateText}
                              onChange={event => setTidyChoices(previous => ({
                                ...previous,
                                [group.key]: { action: "custom", rateText: event.target.value },
                              }))}
                              data-testid={`input-tidy-custom-rate-${group.key}`}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}
              {!tidyPreviewQuery.isLoading && !tidyPreviewQuery.isError &&
                !tidyPreviewQuery.data?.sameRateGroups.length && !tidyPreviewQuery.data?.conflictingGroups.length && (
                  <p role="status" className="text-sm text-muted-foreground">No linked duplicate rate-card groups need tidying.</p>
                )}
              {!!tidyPreviewQuery.data?.billTextRows.length && (
                <section className="space-y-2" aria-labelledby="bill-text-rate-heading" data-testid="bill-text-rate-section">
                  <h3 id="bill-text-rate-heading" className="font-semibold">
                    Rows that look like bill text ({tidyPreviewQuery.data.billTextRows.length})
                  </h3>
                  <p className="text-sm text-muted-foreground">Review these suggestions. Nothing is selected for removal by default.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2">Remove</th><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Saved under</th>
                        <th className="py-1 pr-2">Unit</th><th className="py-1 text-right">Rate</th>
                      </tr></thead>
                      <tbody>{tidyPreviewQuery.data.billTextRows.map(row => (
                        <tr key={row.id} className="border-t align-top" data-testid={`bill-text-rate-row-${row.id}`}>
                          <td className="py-2 pr-2">
                            <input
                              type="checkbox"
                              aria-label={`Remove bill-text row ${row.itemLabel || row.itemKey}`}
                              checked={billTextRowsSelected[row.id] === true}
                              onChange={event => setBillTextRowsSelected(previous => ({ ...previous, [row.id]: event.target.checked }))}
                              data-testid={`checkbox-remove-bill-text-${row.id}`}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div>{row.itemLabel || row.itemKey}</div>
                            {possibleBillHint(row.id)}
                          </td>
                          <td className="py-2 pr-2">
                            Saved under {row.vendorName} · ₹{Number(row.rate).toLocaleString("en-IN")} · updated {formatRateCardDate(row.updatedAt) || "date unavailable"}
                          </td>
                          <td className="py-2 pr-2">{row.unit}</td>
                          <td className="py-2 text-right">₹{Number(row.rate).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
              )}
              <label className="block max-w-2xl text-sm font-medium">
                Owner reason for this tidy
                <Input value={tidyReason} onChange={event => setTidyReason(event.target.value)} placeholder="Required for audit history" data-testid="input-rate-tidy-reason" />
              </label>
              <Button
                type="button"
                disabled={tidyBusy || tidyPreviewQuery.isLoading || tidyPreviewQuery.isError || !allTidyConflictsDecided || !hasTidyOperations || tidyReason.trim().length < 3}
                onClick={() => void submitRateCardTidy()}
                data-testid="button-apply-rate-tidy"
              >
                {tidyBusy ? "Applying…" : "Apply Tidy"}
              </Button>
              {tidyMessage && <p role="status" className="text-sm whitespace-pre-line">{tidyMessage}</p>}
            </CardContent>
          )}
          {!tidyPreviewExpanded && tidyMessage && <CardContent><p role="status" className="text-sm whitespace-pre-line">{tidyMessage}</p></CardContent>}
        </Card>
      )}

      {selectedVendor && !isRateCardsFetched && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Loading saved rate cards for {selectedVendor}...</span>
        </div>
      )}

      {selectedVendor && isRateCardsFetched && (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{visibleDiscoveredItems.length + manualRows.length} SAVED / NEW ITEMS</span>
                  <Badge variant="outline" className="text-[12px] bg-green-600 text-white border-green-700 no-default-hover-elevate no-default-active-elevate">
                    {filledCount} RATES SET
                  </Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="pl-8 uppercase w-48"
                    data-testid="input-search-items"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EQUIPMENT SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("EQUIPMENT", "equipment", equipmentItems.length + equipmentManualRows.length, getCategoryBadgeClass("equipment"))}
              {!collapsedSections["equipment"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm">MACHINE TYPE — BILLING MODE</th>
                        <th className="px-3 py-2 text-left text-sm w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-sm w-36">RATE (₹)</th>
                        <th className="px-3 py-2 text-center text-sm w-16">REMOVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentItems.map((item, idx) => renderItemRow(item, idx))}
                      {equipmentManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {equipmentItems.length === 0 && equipmentManualRows.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-sm">No saved equipment rate cards. Use ADD ROW to add one.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    {!showAddEquipment ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddEquipment(true)} data-testid="button-add-equipment-row" hidden={!canAddRates}>
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Machine Type</Label>
                          <Select value={addEqType} onValueChange={setAddEqType}>
                            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-add-eq-type">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {machineTypeOptions.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Billing Mode</Label>
                          <Select value={addEqMode} onValueChange={setAddEqMode}>
                            <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-add-eq-mode">
                              <SelectValue placeholder="Select mode..." />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_MODES.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.value} ({m.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddEquipmentRow} data-testid="button-confirm-add-equipment" hidden={!canAddRates}>ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddEquipment(false); setAddEqType(""); setAddEqMode(""); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* MATERIALS SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("MATERIALS", "material", materialItems.length + materialManualRows.length, getCategoryBadgeClass("material"))}
              {!collapsedSections["material"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm">MATERIAL NAME</th>
                        <th className="px-3 py-2 text-left text-sm w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-sm w-36">RATE (₹)</th>
                        <th className="px-3 py-2 text-center text-sm w-16">REMOVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialItems.map((item, idx) => renderItemRow(item, idx))}
                      {materialManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {materialItems.length === 0 && materialManualRows.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-sm">No saved material rate cards. Use ADD ROW to add one.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    {!showAddMaterial ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddMaterial(true)} data-testid="button-add-material-row" hidden={!canAddRates}>
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Material</Label>
                          <Select value={addMatName} onValueChange={setAddMatName}>
                            <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-add-mat-name" disabled={plantMaterialsError}>
                              <SelectValue placeholder="Select material..." />
                            </SelectTrigger>
                            <SelectContent>
                              {materialNameOptions.map((m: string) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {plantMaterialsError && <p role="alert" className="text-sm text-destructive">Couldn't load materials</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Unit</Label>
                          <Select value={addMatUnit} onValueChange={setAddMatUnit}>
                            <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-add-mat-unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_OPTIONS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddMaterialRow} data-testid="button-confirm-add-material" hidden={!canAddRates}>ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddMaterial(false); setAddMatName(""); setAddMatUnit("CFT"); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* TRANSPORT SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("TRANSPORT", "transport", transportItems.length + transportManualRows.length, getCategoryBadgeClass("transport"))}
              {!collapsedSections["transport"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm">MACHINE TYPE — BILLING MODE</th>
                        <th className="px-3 py-2 text-left text-sm w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-sm w-36">RATE (₹)</th>
                        <th className="px-3 py-2 text-center text-sm w-16">REMOVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transportItems.map((item, idx) => renderItemRow(item, idx))}
                      {transportManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {transportItems.length === 0 && transportManualRows.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-sm">No saved transport rate cards. Use ADD ROW to add one.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    <div className="text-[12px] text-muted-foreground mb-1">TRIP rates use lead distance x 2 (one-way to two-way)</div>
                    {!showAddTransport ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddTransport(true)} data-testid="button-add-transport-row" hidden={!canAddRates}>
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Transport Type</Label>
                          <Select value={addTransKind} onValueChange={(value: "machine" | "material") => setAddTransKind(value)}>
                            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-add-transport-kind">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="machine">Machine type</SelectItem>
                              <SelectItem value="material">By material</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {addTransKind === "machine" ? (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[12px] uppercase">Machine Type</Label>
                              <Select value={addTransType} onValueChange={setAddTransType}>
                                <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-add-trans-type">
                                  <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {machineTypeOptions.map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[12px] uppercase">Billing Mode</Label>
                              <Select value={addTransMode} onValueChange={setAddTransMode}>
                                <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-add-trans-mode">
                                  <SelectValue placeholder="Select mode..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {TRANSPORT_MODES.map(m => (
                                    <SelectItem key={m.value} value={m.value}>{m.value} ({m.unit})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[12px] uppercase">Material</Label>
                              <Select value={addTransMaterial} onValueChange={setAddTransMaterial}>
                                <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-add-trans-material" disabled={plantMaterialsError}>
                                  <SelectValue placeholder="Select material..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {materialNameOptions.map(material => (
                                    <SelectItem key={material} value={material}>{material}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                                {plantMaterialsError && <p role="alert" className="text-sm text-destructive">Couldn't load materials</p>}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[12px] uppercase">Basis</Label>
                              <span className="inline-flex h-8 items-center rounded border px-3 text-sm">Per km (payload)</span>
                            </div>
                          </>
                        )}
                        <Button size="sm" onClick={handleAddTransportRow} data-testid="button-confirm-add-transport" hidden={!canAddRates}>
                          {addTransKind === "material" && canEditRates ? "SET UP RATE" : "ADD"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setShowAddTransport(false);
                          setAddTransType("");
                          setAddTransMode("");
                          setAddTransMaterial("");
                        }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {renderSectionHeader("LABOUR", "labour", labourItems.length + labourManualRows.length, getCategoryBadgeClass("labour"))}
              {!collapsedSections["labour"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm">LABOUR CATEGORY [GENDER]</th>
                        <th className="px-3 py-2 text-left text-sm w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-sm w-36">RATE (₹ / HEAD-DAY)</th>
                        <th className="px-3 py-2 text-center text-sm w-16">REMOVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labourItems.map((item, idx) => renderItemRow(item, idx))}
                      {labourManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {labourItems.length === 0 && labourManualRows.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-sm">No saved labour rate cards. Use ADD ROW to add one.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    <div className="text-[12px] text-muted-foreground mb-1">Rate per head per day. Add gender only if rates differ by gender; otherwise leave blank for combined rate.</div>
                    {!showAddLabour ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddLabour(true)} data-testid="button-add-labour-row" hidden={!canAddRates}>
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Labour Category</Label>
                          <Select value={addLabCategory} onValueChange={setAddLabCategory}>
                            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-add-lab-category">
                              <SelectValue placeholder="Select category..." />
                            </SelectTrigger>
                            <SelectContent>
                              {LABOUR_CATEGORIES.map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px] uppercase">Gender (optional)</Label>
                          <Select value={addLabGender || "ANY"} onValueChange={(v) => setAddLabGender(v === "ANY" ? "" : v)}>
                            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-add-lab-gender">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ANY">ANY (combined)</SelectItem>
                              <SelectItem value="MALE">MALE</SelectItem>
                              <SelectItem value="FEMALE">FEMALE</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddLabourRow} data-testid="button-confirm-add-labour" hidden={!canAddRates}>ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddLabour(false); setAddLabCategory(""); setAddLabGender(""); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSaveAll}
              hidden={!canAddRates && !canEditRates}
              disabled={bulkSaveMutation.isPending || deleteSavedCardMutation.isPending}
              data-testid="button-save-all-rates"
            >
              {bulkSaveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              SAVE ALL RATES
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
