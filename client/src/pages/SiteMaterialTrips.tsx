import { formatTripQuantity } from "@shared/tripQuantityDisplay";
import { normalizeWeightUnit } from "@shared/stockUnits";
import { classifyTripRoles, tripRolePayload, validateTripRoles, type TripTransportRole } from "@shared/tripTransportRoles";
import { TripTransportRoleFields } from "@/components/TripTransportRoleFields";
import { TripRoleEditDialog } from "@/components/TripRoleEditDialog";
import { TripHireLinkDialog } from "@/components/TripHireLinkDialog";
import { filterTripsByRole, resolveSelectedTripVendor, tripRoleDescription, type ExistingTripVendor, type TripRoleFilter } from "@/components/trip-role-utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { tripListDefaultsFromSearch } from "@/lib/tripListDefaults";
import { Plus, Trash2, Loader2, ArrowLeft, Truck, Package, Camera, ImagePlus, X, History, Ban } from "lucide-react";
import CancelDialog from "@/components/CancelDialog";
import HistoryDialog from "@/components/HistoryDialog";
import AuditHistoryButton from "@/components/AuditHistoryButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { EquipmentMasterType, SiteMaterialTrip, Site } from "@shared/schema";
import { useFeatureFlags } from "@/lib/featureFlags";
import { MaterialReceiptSlipActions } from "@/components/MaterialReceiptSlipActions";
import { formatEnteredByDisplay, type MaterialReceiptSlipData } from "@/lib/materialReceiptSlipTypes";
import { useUpload } from "@/hooks/use-upload";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { FreeTextSuggestionInput } from "@/components/FreeTextSuggestionInput";
import { ReceiptWorkContext, TripWorkContextSummary, EMPTY_WORK_CONTEXT, hasRequiredWorkContext, type TripWorkContext } from "@/components/ReceiptWorkContext";
import { findAllocationEntry, receiptSuggestionFromFulfilment, fulfilmentLabel } from "@shared/requirementFulfilment";
import {
  invalidateSiteMaterialSuggestions,
  useSiteMaterialSuggestions,
} from "@/hooks/use-site-material-suggestions";
import { useAuth } from "@/lib/auth-context";
import { SITE_MATERIAL_TRIP_MATERIAL_OPTIONS } from "@shared/siteMaterialTripMaterials";
import { formatPersonName } from "@shared/personName";

const UOM_OPTIONS = ["CFT", "MT", "Cum", "Liters", "Trips", "Kgs"];

export default function SiteMaterialTrips() {
  const { toast } = useToast();
  const { sectionCan, featureCan, user } = useAuth();
  const canEdit = sectionCan("site_materials", "edit");
  const { companyName, companyInfo, logoFile } = useFeatureFlags();
  const searchString = useSearch();
  const [currentPath, navigate] = useLocation();
  const piParams = (() => {
    try {
      const p = new URLSearchParams(searchString || "");
      return {
        piIndentId: p.get("piIndentId") ? parseInt(p.get("piIndentId")!) : null,
        piItemId: p.get("piItemId") ? parseInt(p.get("piItemId")!) : null,
        pendingReceiptId: p.get("pendingReceiptId") ? parseInt(p.get("pendingReceiptId")!) : null,
        material: decodeURIComponent(p.get("material") || ""),
        supplier: decodeURIComponent(p.get("supplier") || ""),
        qty: p.get("qty") || "",
        uom: decodeURIComponent(p.get("uom") || ""),
        site: decodeURIComponent(p.get("site") || ""),
        returnTo: decodeURIComponent(p.get("returnTo") || "") || "/site/hub",
      };
    } catch {
      return { piIndentId: null, piItemId: null, pendingReceiptId: null, material: "", supplier: "", qty: "", uom: "", site: "", returnTo: "/site/hub" };
    }
  })();
  const isPILinked = !!piParams.piIndentId && !!piParams.piItemId;
  const returnTo = piParams.returnTo;

  const { data: sitesList = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const activeSites = sitesList.filter(s => s.isActive);
  const today = format(new Date(), "yyyy-MM-dd");
  const currentTime = format(new Date(), "HH:mm");

  const hireEvidenceDefaults = tripListDefaultsFromSearch(window.location.search, today);
  const hireEvidenceParams = new URLSearchParams(window.location.search);
  const [dateFromFilter, setDateFromFilter] = useState(hireEvidenceDefaults.dateFrom);
  const [dateToFilter, setDateToFilter] = useState(hireEvidenceDefaults.dateTo);
  const [siteFilter, setSiteFilter] = useState(piParams.site || "");
  const [materialFilter, setMaterialFilter] = useState(hireEvidenceParams.get("material") || "");
  const [vehicleFilter, setVehicleFilter] = useState(hireEvidenceParams.get("vehicleNumber") || hireEvidenceParams.get("hireVehicle") || "");
  const [supplierFilter, setSupplierFilter] = useState(hireEvidenceParams.get("supplier") || hireEvidenceDefaults.supplierFilter);
  const [onlyUnassigned, setOnlyUnassigned] = useState(hireEvidenceParams.get("onlyUnassigned") === "true");
  const [onlyWithoutArrangement, setOnlyWithoutArrangement] = useState(hireEvidenceParams.get("onlyWithoutArrangement") === "true");
  const [roleFilter, setRoleFilter] = useState<TripRoleFilter>((hireEvidenceParams.get("role") as TripRoleFilter) || hireEvidenceDefaults.roleFilter);
  const [roleChoice, setRoleChoice] = useState<TripTransportRole | null>("same_party");
  const [editingRoleTrip, setEditingRoleTrip] = useState<SiteMaterialTrip | null>(null);
  const [linkingHireTrip, setLinkingHireTrip] = useState<SiteMaterialTrip | null>(null);
  const [savedTripForSlip, setSavedTripForSlip] = useState<MaterialReceiptSlipData | null>(null);
  const savedTripPanelRef = useRef<HTMLDivElement | null>(null);
  const enteredByTouchedRef = useRef(false);

  useEffect(() => {
    if (savedTripForSlip) {
      savedTripPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }, [savedTripForSlip]);

  const [newTrip, setNewTrip] = useState({
    date: today,
    time: currentTime,
    site: piParams.site || "",
    material: piParams.material || "",
    supplier: "",
    supplierVendorId: null as number | null,
    supplierManual: false,
    materialSourceSupplier: piParams.supplier || "",
    materialSourceVendorId: null as number | null,
    materialSourceManual: false,
    materialSourceType: "vendor" as "vendor" | "own_source" | null,
    materialSourceLabel: "" as string | null,
    vehicleNumber: "",
    driverName: "",
    transportType: "agency_vendor",
    internalEquipmentId: null as number | null,
    equipmentId: null as number | null,
    vehicleManual: false,
    quantity: piParams.qty || "",
    uom: normalizeWeightUnit(piParams.uom || "CFT"),
    location: "",
    receiptNumber: "",
    enteredBy: user?.fullName || "",
    notes: "",
    workType: "",
    // 06S §6: where the truck actually unloaded — permanent physical fact.
    unloadedAt: "stretch",
    yardLabel: "",
  });
  useEffect(() => {
    if (!user?.fullName || enteredByTouchedRef.current) return;
    setNewTrip((previous) => previous.enteredBy
      ? previous
      : { ...previous, enteredBy: user.fullName });
  }, [user?.fullName]);
  // Normal entry searches Vendor Master only; historical suggestions remain filters only.
  const masterPickerSite = editingRoleTrip?.site || newTrip.site;
  const vendorQuery = useQuery<ExistingTripVendor[]>({
    queryKey: [`/api/site-material-trips/vendor-options?site=${encodeURIComponent(masterPickerSite)}`],
    enabled: (canEdit || sectionCan("site_materials", "create")) && !!masterPickerSite,
  });
  const vendors = vendorQuery.data ?? [];
  const {
    suppliers: filterSupplierSuggestions,
    materialSourceSuppliers: filterMaterialSourceSupplierSuggestions,
    vehicles: filterVehicleSuggestions,
    error: filterSuggestionError,
  } = useSiteMaterialSuggestions(siteFilter && siteFilter !== "all" ? siteFilter : "");


  // Batch 06E-F / DPR-02: standalone trips require project + intended item.
  const [workCtx, setWorkCtx] = useState<TripWorkContext>(EMPTY_WORK_CONTEXT);
  // 06G: keep material/supplier/location/work-context between trucks (default ON).
  const [keepContext, setKeepContext] = useState(true);
  // Prefill must not silently overwrite a deliberate user entry: remember what
  // we prefilled so a later arrangement change only replaces untouched values.
  const [lastPrefill, setLastPrefill] = useState<{ material: string; supplier: string }>({ material: "", supplier: "" });
  const applyArrangementPrefill = (p: { material: string | null; supplier: string | null; clientSupplied: boolean; external: boolean }) => {
    setNewTrip((prev) => {
      const next = { ...prev };
      if (p.material && (!prev.material || prev.material === lastPrefill.material)) next.material = p.material;
      // Keep the vendor's actual master name; client-supplied metadata is not a new vendor.
      const supplierValue = p.supplier || null;
      if (prev.materialSourceType !== "own_source" && supplierValue && (!prev.materialSourceSupplier || prev.materialSourceSupplier === lastPrefill.supplier)) {
        next.materialSourceSupplier = supplierValue;
        if (supplierValue !== prev.materialSourceSupplier) next.materialSourceVendorId = null;
      }
      if ((p.material && prev.material && prev.material !== lastPrefill.material && prev.material !== p.material) ||
          (supplierValue && prev.materialSourceSupplier && prev.materialSourceSupplier !== lastPrefill.supplier && prev.materialSourceSupplier !== supplierValue)) {
        toast({ title: "Kept your entries", description: "Material/Supplier were not overwritten by the arrangement — update them yourself if needed." });
      }
      setLastPrefill({ material: next.material === p.material ? p.material : lastPrefill.material, supplier: next.materialSourceSupplier === supplierValue ? supplierValue ?? "" : lastPrefill.supplier });
      return next;
    });
  };

  // 06F: next-day receipt suggestion from the allocator's daily fulfilment.
  // Suggestion only — never creates a receipt, never inherits quantities.
  const tripSiteId = useMemo(() => sitesList.find(s => s.name === newTrip.site)?.id ?? null, [sitesList, newTrip.site]);
  const { data: dayRequirements = [] } = useQuery<any[]>({
    queryKey: ["/api/site-requirements", "receipt-suggest", tripSiteId, newTrip.date],
    queryFn: async () => {
      const res = await fetch(`/api/site-requirements?siteId=${tripSiteId}&dateFrom=${newTrip.date}&dateTo=${newTrip.date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !isPILinked && tripSiteId != null && !!newTrip.date,
    staleTime: 30_000,
  });
  const fulfilmentSuggestion = useMemo(() => {
    const wanted = (newTrip.material || "").trim().toLowerCase();
    for (const r of dayRequirements) {
      const mats: any[] = Array.isArray(r.materials) ? r.materials : [];
      const entries: any[] = r.allocationStatus?.materialItems ?? [];
      for (let i = 0; i < mats.length; i++) {
        if (wanted && (mats[i].materialName || "").trim().toLowerCase() !== wanted) continue;
        const entry = findAllocationEntry(entries, mats[i], i);
        const s = entry ? receiptSuggestionFromFulfilment(entry) : null;
        if (s && entry?.fulfilmentType) return { suggestion: s, entry, materialName: mats[i].materialName };
      }
    }
    return null;
  }, [dayRequirements, newTrip.material]);

  // Photos are staged locally while creating a new trip (no DB id yet to
  // link an attachment to), then uploaded in one batch once the trip is saved.
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const { uploadFile } = useUpload();

  const addStagedPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" });
        return false;
      }
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
        toast({ title: "Unsupported file", description: `${f.name} must be an image or PDF.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setStagedPhotos((prev) => [...prev, ...valid]);
  };
  const removeStagedPhoto = (idx: number) => setStagedPhotos((prev) => prev.filter((_, i) => i !== idx));
  const uploadStagedPhotos = async (tripId: number) => {
    for (const file of stagedPhotos) {
      const uploadResponse = await uploadFile(file);
      if (!uploadResponse) continue;
      try {
        await apiRequest("POST", "/api/attachments", {
          moduleType: "site_material_trip",
          linkedRecordId: tripId,
          fileName: file.name,
          objectPath: uploadResponse.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      } catch {
        toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
      }
    }
  };

  const buildTripsUrl = () => {
    const params = new URLSearchParams();
    if (dateFromFilter) params.set("dateFrom", dateFromFilter);
    if (dateToFilter) params.set("dateTo", dateToFilter);
    if (siteFilter && siteFilter !== "all") params.set("site", siteFilter);
    if (materialFilter && materialFilter !== "all") params.set("material", materialFilter);
    if (vehicleFilter.trim()) params.set("vehicleNumber", vehicleFilter.trim());
    if (supplierFilter.trim()) params.set("supplier", supplierFilter.trim());
    if (onlyUnassigned) params.set("onlyUnassigned", "true");
    if (onlyWithoutArrangement) params.set("onlyWithoutArrangement", "true");
    const queryString = params.toString();
    return queryString ? `/api/site-material-trips?${queryString}` : "/api/site-material-trips";
  };
  const buildReviewQuery = () => {
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string> = {
      dateFrom: dateFromFilter, dateTo: dateToFilter, site: siteFilter === "all" ? "" : siteFilter,
      material: materialFilter === "all" ? "" : materialFilter, vehicleNumber: vehicleFilter.trim(),
      supplier: supplierFilter.trim(),
    };
    Object.entries(values).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    onlyUnassigned ? params.set("onlyUnassigned", "true") : params.delete("onlyUnassigned");
    onlyWithoutArrangement ? params.set("onlyWithoutArrangement", "true") : params.delete("onlyWithoutArrangement");
    roleFilter === "unresolved" ? params.set("hireRole", "unresolved") : params.delete("hireRole");
    roleFilter === "all" ? params.delete("role") : params.set("role", roleFilter);
    return params.toString();
  };

  const { data: trips, isLoading, isError, refetch: refetchTrips } = useQuery<SiteMaterialTrip[]>({
    queryKey: [buildTripsUrl()],
  });
  // The authoritative master contains both owned and hired equipment.
  const { data: internalEquipment = [] } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });
  const activeInternalEquipment = internalEquipment.filter(
    (equipment) => equipment.isActive && equipment.ownership === "owned",
  );
  const buildRolePayload = (data: typeof newTrip) => {
    if (!roleChoice || roleChoice === "unresolved") throw new Error("Choose Who brought it.");
    const ownSource = data.materialSourceType === "own_source";
    if (((!ownSource && !data.materialSourceManual) || (roleChoice === "different_parties" && !data.supplierManual)) && (vendorQuery.isLoading || vendorQuery.isError)) throw new Error("Load the existing vendors before saving.");
    const source = ownSource ? { name: "", id: null } : data.materialSourceManual
      ? { name: data.materialSourceSupplier, id: null }
      : { name: data.materialSourceSupplier || resolveSelectedTripVendor(data.materialSourceSupplier, data.materialSourceVendorId, vendors).name,
          id: resolveSelectedTripVendor(data.materialSourceSupplier, data.materialSourceVendorId, vendors).id };
    const transporter = roleChoice === "different_parties" ? data.supplierManual
      ? { name: data.supplier, id: null }
      : { name: data.supplier || resolveSelectedTripVendor(data.supplier, data.supplierVendorId, vendors).name,
          id: resolveSelectedTripVendor(data.supplier, data.supplierVendorId, vendors).id } : source;
    const equipment = activeInternalEquipment.find((item) => item.id === data.internalEquipmentId) ?? null;
    const roles = tripRolePayload(roleChoice, source, transporter, equipment, data.vehicleNumber, {
      materialSourceType: data.materialSourceType,
      materialSourceLabel: data.materialSourceLabel,
    });
    const issue = validateTripRoles(roles);
    if (issue) throw new Error(issue);
    if (roleChoice !== "in_house" && !data.vehicleNumber.trim()) throw new Error("Enter the agency/vendor vehicle number.");
    if (!data.equipmentId && !data.vehicleManual) throw new Error("Select an Equipment Master vehicle, or choose Other / Not in Master.");
    return roles;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTrip) => {
      const payload: Record<string, any> = {
        ...data,
        ...buildRolePayload(data),
        masterSelection: { equipmentId: data.equipmentId },
        quantity: parseFloat(data.quantity) || 0,
        // 06S: yard label only meaningful for yard receipts.
        yardLabel: data.unloadedAt === "yard" ? data.yardLabel : undefined,
      };
      delete payload.materialSourceManual;
      delete payload.supplierManual;
      delete payload.vehicleManual;
      delete payload.equipmentId;
      if (isPILinked) {
        payload.indentId = piParams.piIndentId;
        payload.indentItemId = piParams.piItemId;
        payload.pendingReceiptId = piParams.pendingReceiptId || undefined;
      }
      // 06E-F: optional work-context linkage (additive; server validates).
      if (workCtx.boqProjectId != null) payload.boqProjectId = workCtx.boqProjectId;
      if (workCtx.boqItemId != null) payload.boqItemId = workCtx.boqItemId;
      if (workCtx.programmeBarId != null) payload.programmeBarId = workCtx.programmeBarId;
      if (workCtx.earthworkArrangementId != null) payload.earthworkArrangementId = workCtx.earthworkArrangementId;
      const res = await apiRequest("POST", "/api/site-material-trips", payload);
      return res.json();
    },
    onSuccess: async (trip: any) => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/vendor-bills") });
      if (stagedPhotos.length > 0 && trip?.id) {
        await uploadStagedPhotos(trip.id);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "site_material_trip", trip.id] });
      }
      setStagedPhotos([]);
      queryClient.invalidateQueries({ predicate: (q) =>
        typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/site-material-trips")
      });
      // The submitted site is captured in the mutation payload; invalidate
      // all scoped entries so a quick site switch while saving cannot leave
      // either the old or new site's list stale.
      invalidateSiteMaterialSuggestions();
      queryClient.invalidateQueries({ predicate: (q) =>
        typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/materials-received")
      });
      if (isPILinked) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
        queryClient.invalidateQueries({ predicate: (q) =>
          typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/purchase-indents")
        });
      }
      setSavedTripForSlip({
        kind: "site",
        id: trip.id,
        date: trip.date,
        time: trip.time,
        materialName: trip.material,
        quantity: trip.quantity,
        uom: normalizeWeightUnit(trip.uom),
        site: trip.site,
        location: trip.location || trip.yardLabel,
        vehicleNumber: trip.vehicleNumber,
        driverName: trip.driverName,
        receivedByName: trip.enteredBy,
        supplier: trip.supplier,
        materialSourceType: trip.materialSourceType,
        materialSourceSupplier: trip.materialSourceSupplier,
        materialSourceLabel: trip.materialSourceLabel,
        receiptNumber: trip.receiptNumber,
        enteredBy: trip.enteredBy,
        createdAt: trip.createdAt,
        latestEditAt: trip.latestEditAt,
        slipSharedAt: trip.slipSharedAt,
        slipSharedByUserName: trip.slipSharedByUserName,
        slipSendWindowOpen: trip.slipSendWindowOpen,
        slipSendTrackingEnabled: trip.slipSendTrackingEnabled,
      });
      toast({ title: "Trip Logged", description: "Material trip has been recorded successfully." });
      enteredByTouchedRef.current = false;
      if (isPILinked) {
        // In PI-linked mode reset material/qty but keep site + PI context for next truckload
        setNewTrip(prev => ({
          ...prev,
          vehicleNumber: "",
          driverName: "",
          enteredBy: user?.fullName || "",
          equipmentId: null,
          vehicleManual: false,
            internalEquipmentId: null,
          quantity: "",
          receiptNumber: "",
          notes: "",
          workType: "",
        }));
      } else if (keepContext) {
        // 06G rapid repeat-trip: keep site/material/supplier/location/UoM +
        // work context between trucks; clear only truck-specific fields.
        setNewTrip(prev => ({
          ...prev,
          time: format(new Date(), "HH:mm"),
          vehicleNumber: "",
          driverName: "",
          enteredBy: user?.fullName || "",
          equipmentId: null,
          internalEquipmentId: null,
          vehicleManual: false,
          quantity: "",
          receiptNumber: "",
          notes: "",
        }));
      } else {
        setNewTrip({
          date: today,
          time: format(new Date(), "HH:mm"),
          site: newTrip.site,
          material: "",
          supplier: "",
          supplierVendorId: null,
          supplierManual: false,
           materialSourceSupplier: "",
           materialSourceVendorId: null,
           materialSourceManual: false,
           materialSourceType: "vendor",
           materialSourceLabel: "",
          vehicleNumber: "",
          driverName: "",
          equipmentId: null,
          vehicleManual: false,
             transportType: "agency_vendor",
            internalEquipmentId: null,
          quantity: "",
          uom: "CFT",
          location: "",
          receiptNumber: "",
          enteredBy: user?.fullName || "",
          notes: "",
          workType: "",
          unloadedAt: "stretch",
          yardLabel: "",
        });
        setWorkCtx(EMPTY_WORK_CONTEXT);
        setRoleChoice("same_party");
        setLastPrefill({ material: "", supplier: "" });
      }
    },
    onError: (error) => {
      toast({ title: "Failed to log material trip", description: error instanceof Error ? error.message : "The trip could not be saved.", variant: "destructive" });
      console.error("Error creating trip:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/site-material-trips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips"] });
      invalidateSiteMaterialSuggestions();
      toast({ title: "Deleted", description: "Trip entry has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete trip.", variant: "destructive" });
    },
  });

  const [cancelTripId, setCancelTripId] = useState<number | null>(null);
  const [historyTripId, setHistoryTripId] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrip.site || !newTrip.material || !newTrip.quantity || !hasRequiredWorkContext(workCtx)) {
      toast({ title: "Required Fields", description: "Please fill in Site, Material, Quantity, and BOQ Item / Intended Activity.", variant: "destructive" });
      return;
    }
    try {
      buildRolePayload(newTrip);
    } catch (error) {
      toast({ title: "Confirm trip roles", description: error instanceof Error ? error.message : "Set Material from and Who brought it.", variant: "destructive" });
      return;
    }
    createMutation.mutate(newTrip);
  };

  const filteredTrips = trips ?? [];
  const roleFilteredTrips = useMemo(() => filterTripsByRole(filteredTrips, roleFilter), [trips, roleFilter]);
  const isReviewPage = currentPath === "/site/material-trips/review";
  const canAdd = sectionCan("site_materials", "create");
  const recentFrom = format(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const recentParams = new URLSearchParams({ dateFrom: recentFrom, dateTo: today });
  if (siteFilter && siteFilter !== "all") recentParams.set("site", siteFilter);
  const { data: recentTrips = [], isLoading: recentTripsLoading, isError: recentTripsError, refetch: refetchRecentTrips } = useQuery<SiteMaterialTrip[]>({
    queryKey: [`/api/site-material-trips?${recentParams.toString()}`],
    enabled: !isReviewPage && canEdit && !!siteFilter && siteFilter !== "all",
  });
  const recentTripsSorted = useMemo(() => [...recentTrips].sort((a, b) =>
    `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`)), [recentTrips]);
  const tripsByMaterial = useMemo(() => {
    const grouped: Record<string, { count: number; totalQty: number; uom: string }> = {};
    roleFilteredTrips.forEach(trip => {
      const key = trip.material;
      if (!grouped[key]) {
        grouped[key] = { count: 0, totalQty: 0, uom: trip.uom };
      }
      grouped[key].count++;
      grouped[key].totalQty += trip.quantity || 0;
    });
    return grouped;
  }, [roleFilteredTrips]);
  if (isReviewPage && !canEdit) return <div className="mx-auto max-w-md py-20 text-center">
    <h1 className="text-xl font-semibold">Edit permission required</h1>
    <p className="mt-2 text-sm text-muted-foreground">Trip review and corrections are available to users with site-material edit access.</p>
    <Link href={returnTo} className="mt-4 inline-block text-sm underline">Back</Link>
  </div>;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={`/${logoFile}`} alt={companyName} className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="text-lg font-bold">{companyName}</h1>
              <p className="text-sm text-muted-foreground">{isReviewPage ? "Trip Review & Corrections" : "Quick Materials Entry"}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href={returnTo}>
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        {!isReviewPage && canAdd && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Log Material Trip
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPILinked && (
              <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-800 text-sm text-teal-700 dark:text-teal-300 flex items-start gap-2">
                <Truck className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">PI-Linked Delivery — log each truckload below</p>
                  <p className="text-xs mt-0.5 text-teal-600 dark:text-teal-400">
                    Material: <strong>{piParams.material}</strong> · Site: <strong>{piParams.site}</strong> · Remaining: <strong>{piParams.qty} {piParams.uom}</strong>
                  </p>
                </div>
                <button type="button" onClick={() => navigate(returnTo)} className="text-teal-500 hover:text-teal-700 text-xs underline shrink-0">← Back to PI</button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Date</Label>
                  <Input
                    type="date"
                    value={newTrip.date}
                    onChange={(e) => setNewTrip({ ...newTrip, date: e.target.value })}
                    data-testid="input-trip-date"
                  />
                </div>
                <div>
                  <Label className="text-sm">Time</Label>
                  <Input
                    type="time"
                    value={newTrip.time}
                    onChange={(e) => setNewTrip({ ...newTrip, time: e.target.value })}
                    data-testid="input-trip-time"
                  />
                </div>
                <div>
                  <Label className="text-sm">Site *</Label>
                  <Select
                    value={newTrip.site}
                    onValueChange={(val) => setNewTrip({ ...newTrip, site: val })}
                  >
                    <SelectTrigger data-testid="select-trip-site">
                      <SelectValue placeholder="Select Site" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSites.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Material *</Label>
                  <Select
                    value={newTrip.material}
                    onValueChange={(val) => setNewTrip({ ...newTrip, material: val })}
                  >
                    <SelectTrigger data-testid="select-trip-material">
                      <SelectValue placeholder="Select Material" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_MATERIAL_TRIP_MATERIAL_OPTIONS.map((mat) => (
                        <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!newTrip.site && <p className="text-sm text-muted-foreground">Choose Site to search Vendor Master.</p>}
              <TripTransportRoleFields
                allowManualParties
                choice={roleChoice}
                onChoice={(choice) => {
                  setRoleChoice(choice);
                  setNewTrip((prev) => ({ ...prev, transportType: choice === "in_house" ? "in_house" : "agency_vendor", internalEquipmentId: choice === "in_house" ? prev.internalEquipmentId : null }));
                }}
                value={newTrip}
                onChange={(draft) => {
                  setNewTrip((prev) => ({ ...prev, ...draft }));
                }}
                vendors={vendors}
                equipment={activeInternalEquipment}
                vendorsLoading={vendorQuery.isLoading}
                vendorsDisabled={!masterPickerSite}
                vendorsError={vendorQuery.isError}
                onRetryVendors={() => void vendorQuery.refetch()}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Quantity *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 500"
                    value={newTrip.quantity}
                    onChange={(e) => setNewTrip({ ...newTrip, quantity: e.target.value })}
                    data-testid="input-trip-quantity"
                  />
                </div>
                <div>
                  <Label className="text-sm">UOM</Label>
                  <Select
                    value={newTrip.uom}
                    onValueChange={(val) => setNewTrip({ ...newTrip, uom: val })}
                  >
                    <SelectTrigger data-testid="select-trip-uom">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UOM_OPTIONS.map((uom) => (
                        <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Driver (optional)</Label>
                  <Input
                    placeholder="Driver name"
                    value={newTrip.driverName}
                    onChange={(e) => setNewTrip({ ...newTrip, driverName: e.target.value })}
                    data-testid="input-trip-driver-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Work Type</Label>
                  <Select value={newTrip.workType} onValueChange={(v) => setNewTrip({ ...newTrip, workType: v })}>
                    <SelectTrigger data-testid="select-trip-worktype"><SelectValue placeholder="Select work type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="road">Road</SelectItem>
                      <SelectItem value="structure">Structure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Unloaded At</Label>
                  <Select value={newTrip.unloadedAt} onValueChange={(v) => setNewTrip({ ...newTrip, unloadedAt: v })}>
                    <SelectTrigger data-testid="select-trip-unloaded-at"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stretch">Work Stretch</SelectItem>
                      <SelectItem value="yard">Temporary Yard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newTrip.unloadedAt === "stretch" ? (
                  <div>
                    <Label className="text-sm">Location/Chainage</Label>
                    <Input
                      placeholder="e.g. 5.200"
                      value={newTrip.location}
                      onChange={(e) => setNewTrip({ ...newTrip, location: e.target.value.toUpperCase() })}
                      data-testid="input-trip-location"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm">Yard label / location</Label>
                    <Input
                      placeholder="e.g. YARD A NEAR CH. 12+400"
                      value={newTrip.yardLabel}
                      onChange={(e) => setNewTrip({ ...newTrip, yardLabel: e.target.value.toUpperCase() })}
                      data-testid="input-trip-yard-label"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-sm">Receipt/Challan No.</Label>
                  <Input
                    placeholder="e.g. 12345"
                    value={newTrip.receiptNumber}
                    onChange={(e) => setNewTrip({ ...newTrip, receiptNumber: e.target.value.toUpperCase() })}
                    data-testid="input-trip-receipt"
                  />
                </div>
                <div>
                  <Label className="text-sm">Received by</Label>
                  <Input
                    placeholder="Your name"
                    value={newTrip.enteredBy}
                    onChange={(e) => {
                      enteredByTouchedRef.current = true;
                      setNewTrip({ ...newTrip, enteredBy: e.target.value });
                    }}
                    data-testid="input-trip-enteredby"
                  />
                </div>
                <div className={`flex flex-col justify-end gap-1 ${savedTripForSlip ? "col-span-2 md:col-span-4" : ""}`}>
                  {!savedTripForSlip && !isPILinked && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none" data-testid="checkbox-keep-context">
                      <input
                        type="checkbox"
                        checked={keepContext}
                        onChange={(e) => setKeepContext(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Keep this work context for next trip
                    </label>
                  )}
                  {savedTripForSlip ? (
                    <div
                      ref={savedTripPanelRef}
                      className="rounded-md border bg-muted/40 p-3 space-y-2"
                      data-testid={`trip-saved-view-${savedTripForSlip.id}`}
                    >
                      <p className="text-sm font-medium">✓ Trip saved · Trip #{savedTripForSlip.id}</p>
                      <div className="rounded-md bg-background/70 px-3 py-2 text-sm space-y-1" data-testid="trip-saved-summary">
                        <p className="font-semibold">
                          {savedTripForSlip.materialName} · {savedTripForSlip.quantity} {savedTripForSlip.uom}
                        </p>
                        {Boolean(savedTripForSlip.vehicleNumber || savedTripForSlip.driverName || savedTripForSlip.receivedByName) && (
                          <p className="text-muted-foreground">
                            {[
                              savedTripForSlip.vehicleNumber,
                              savedTripForSlip.driverName ? `Driver ${formatPersonName(savedTripForSlip.driverName)}` : null,
                              savedTripForSlip.receivedByName ? `Received by ${formatPersonName(savedTripForSlip.receivedByName)}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {Boolean(savedTripForSlip.site || savedTripForSlip.location) && (
                          <p className="text-muted-foreground">
                            {[savedTripForSlip.site, savedTripForSlip.location].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <MaterialReceiptSlipActions
                        record={savedTripForSlip}
                        company={companyInfo}
                        logoFile={logoFile}
                        sendLabel="Send on WhatsApp"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSavedTripForSlip(null)}
                        data-testid="button-log-next-trip"
                      >
                        Log next trip
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createMutation.isPending || !hasRequiredWorkContext(workCtx)}
                      data-testid="button-submit-trip"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1" /> Add Trip
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* 06F: daily-allocation suggestion (informational; apply is optional) */}
              {!isPILinked && fulfilmentSuggestion && (
                <div className="rounded border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-xs space-y-1" data-testid="receipt-fulfilment-suggestion">
                  <p className="font-semibold text-indigo-800 dark:text-indigo-200">
                    Tomorrow's Requirement allocation: {fulfilmentLabel(fulfilmentSuggestion.entry)}
                  </p>
                  <p className="text-indigo-700 dark:text-indigo-300">{fulfilmentSuggestion.suggestion.note} ({fulfilmentSuggestion.materialName})</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {newTrip.materialSourceType !== "own_source" && fulfilmentSuggestion.suggestion.supplierSuggestion && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-indigo-700 underline"
                        onClick={() => setNewTrip(prev => ({ ...prev,
                          materialSourceSupplier: prev.materialSourceSupplier || fulfilmentSuggestion.suggestion.supplierSuggestion || "",
                          materialSourceVendorId: prev.materialSourceSupplier ? prev.materialSourceVendorId : null,
                        }))}
                        data-testid="button-apply-fulfilment-supplier"
                      >
                        Use "{fulfilmentSuggestion.suggestion.supplierSuggestion}" as supplier
                      </button>
                    )}
                    {/* Only 'arrangement' fulfilments carry an arrangementId —
                        other_agency never links to an arrangement. */}
                    {fulfilmentSuggestion.suggestion.arrangementId != null && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-indigo-700 underline"
                        onClick={() => setWorkCtx(prev => ({ ...prev, earthworkArrangementId: prev.earthworkArrangementId ?? fulfilmentSuggestion.suggestion.arrangementId }))}
                        data-testid="button-apply-fulfilment-arrangement"
                      >
                        Link this arrangement to the receipt
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* DPR-02: every standalone trip, including a PI-linked
                  delivery, identifies the BOQ activity it is intended for. */}
              {newTrip.site && (
                <ReceiptWorkContext
                  siteName={newTrip.site}
                  operationalDate={newTrip.date}
                  sitesList={sitesList}
                  value={workCtx}
                  onChange={setWorkCtx}
                  onArrangementPrefill={applyArrangementPrefill}
                  required
                  testIdPrefix="trip-work-ctx"
                />
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Attachments <span className="text-muted-foreground">(receipt/challan photo)</span></Label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  id="trip-photo-camera"
                  data-testid="input-trip-photo-camera"
                  onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
                />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  id="trip-photo-gallery"
                  data-testid="input-trip-photo-gallery"
                  onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("trip-photo-camera")?.click()} data-testid="button-trip-photo-camera">
                    <Camera className="w-4 h-4" /> Camera
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("trip-photo-gallery")?.click()} data-testid="button-trip-photo-gallery">
                    <ImagePlus className="w-4 h-4" /> Gallery
                  </Button>
                </div>
                {stagedPhotos.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-w-xl">
                    {stagedPhotos.map((file, idx) => (
                      <div key={idx} className="relative border rounded-md overflow-hidden bg-muted aspect-square" data-testid={`card-staged-trip-photo-${idx}`}>
                        {file.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full w-full text-xs text-center p-1 truncate">{file.name}</div>
                        )}
                        <button
                          type="button"
                          className="absolute top-1 right-1 bg-background/90 rounded-full p-1"
                          onClick={() => removeStagedPhoto(idx)}
                          data-testid={`button-remove-staged-trip-photo-${idx}`}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Photos are uploaded once you save the trip.</p>
              </div>
            </form>
          </CardContent>
        </Card>}

        {!isReviewPage && canEdit && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(tripsByMaterial).map(([material, data]) => (
            <Card key={material} className="bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="font-semibold">{material}</span>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {data.totalQty.toFixed(3)} {data.uom}
                </div>
                <div className="text-sm text-muted-foreground">
                  {data.count} matching trip{data.count !== 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>}

        {(isReviewPage || canEdit) && <Card>
          <CardHeader>
            <CardTitle>{isReviewPage ? "All trips and corrections" : "Recent trips · last 7 days"}</CardTitle>
            {isReviewPage && <div className="flex flex-wrap gap-2 pt-3">
              <Link href={`/site/material-trips/review/arrangement?${buildReviewQuery()}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Link to execution arrangement</Link>
              <Link href={`/site/material-trips/review/material-source?${buildReviewQuery()}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Material source backfill</Link>
              <Link href={`/site/material-trips/review/source-transport?${buildReviewQuery()}`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Set source and transport</Link>
            </div>}
            {!isReviewPage && canEdit && <Link href={`/site/material-trips/review?${buildReviewQuery()}`} className="inline-block pt-2 text-sm text-primary underline underline-offset-4">All trips and corrections</Link>}
            {!isReviewPage && canEdit && <div className="pt-2">
              <Label className="text-xs">Chosen site</Label>
              <Select value={siteFilter || "all"} onValueChange={setSiteFilter}>
                <SelectTrigger data-testid="select-recent-trip-site"><SelectValue placeholder="Choose site" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Choose a site</SelectItem>{activeSites.map(site => <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            {isReviewPage && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
              <div>
                <Label className="text-xs">From date</Label>
                <Input type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} data-testid="input-filter-date-from" />
              </div>
              <div>
                <Label className="text-xs">To date</Label>
                <Input type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} data-testid="input-filter-date-to" />
              </div>
              <div>
                <Label className="text-xs">Site</Label>
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger data-testid="select-filter-site"><SelectValue placeholder="All Sites" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {activeSites.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Material</Label>
                <Select value={materialFilter} onValueChange={setMaterialFilter}>
                  <SelectTrigger data-testid="select-filter-material"><SelectValue placeholder="All Materials" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Materials</SelectItem>
                    {SITE_MATERIAL_TRIP_MATERIAL_OPTIONS.map((material) => <SelectItem key={material} value={material}>{material}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vehicle number</Label>
                <FreeTextSuggestionInput value={vehicleFilter} onChange={(value) => setVehicleFilter(value.toUpperCase())} suggestions={filterVehicleSuggestions} match="vehicle" suggestionsError={filterSuggestionError} placeholder="All vehicles" data-testid="input-filter-vehicle" />
              </div>
              <div>
                <Label className="text-xs">Transporter</Label>
                <FreeTextSuggestionInput value={supplierFilter} onChange={(value) => setSupplierFilter(value.toUpperCase())} suggestions={filterSupplierSuggestions} match="supplier" suggestionsError={filterSuggestionError} placeholder="All transporters" data-testid="input-filter-supplier" />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={onlyUnassigned} onChange={(event) => { setOnlyUnassigned(event.target.checked); setRoleFilter("all"); }} data-testid="checkbox-filter-only-unassigned" />
                Only trips without a material source
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={onlyWithoutArrangement} onChange={event=>setOnlyWithoutArrangement(event.target.checked)} data-testid="checkbox-filter-no-arrangement" />
                Trips with no arrangement
              </label>
              <div>
                <Label className="text-xs">Transport/source roles</Label>
                <Select value={roleFilter} onValueChange={(value) => { setRoleFilter(value as TripRoleFilter); setOnlyUnassigned(false); }}>
                  <SelectTrigger data-testid="select-filter-trip-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="same_party">Same party</SelectItem>
                    <SelectItem value="different_parties">Different parties</SelectItem>
                    <SelectItem value="in_house">Our own vehicle</SelectItem>
                    <SelectItem value="own_source_agency">Our own source · Another transporter</SelectItem>
                    <SelectItem value="own_source_in_house">Our own source · Our own vehicle</SelectItem>
                    <SelectItem value="unresolved">Roles not confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>}
            <p className="pt-2 text-xs text-muted-foreground" data-testid="trip-role-filter-count">{roleFilteredTrips.length} matching trip{roleFilteredTrips.length === 1 ? "" : "s"} · Role filters include all material-source assignments within the date/site/material/vehicle/transporter filters. The legacy “without a material source” checkbox is separate and resets the role filter.</p>
          </CardHeader>
          <CardContent>
            {!isReviewPage && canEdit && !siteFilter && <p className="py-8 text-center text-muted-foreground">Choose a site to see recent trips.</p>}
            {!isReviewPage && !canEdit && <p className="py-8 text-center text-muted-foreground">Trip logging is available above.</p>}
            {(isReviewPage ? isLoading : recentTripsLoading) ? (
              <div className="space-y-2 py-3" role="status" aria-label="Loading material trips">
                {[0, 1, 2, 3].map(row => <div key={row} className="h-12 animate-pulse rounded-md bg-muted/60" />)}
              </div>
            ) : (isReviewPage ? isError : recentTripsError) ? (
              <div className="py-8 text-center text-sm text-destructive" role="alert">
                Trips could not be loaded. <Button type="button" variant="outline" size="sm" onClick={() => void (isReviewPage ? refetchTrips() : refetchRecentTrips())}>Retry</Button>
              </div>
            ) : !(isReviewPage ? roleFilteredTrips : recentTripsSorted).length ? (
              <p className="text-center text-muted-foreground py-8">No trips match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Site</th>
                      <th className="text-left p-2">Material</th>
                      <th className="text-left p-2">Transporter</th>
                      <th className="text-left p-2">Material Source</th>
                      <th className="text-left p-2">Vehicle</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-left p-2">UOM</th>
                      <th className="text-left p-2">Location</th>
                      <th className="text-left p-2">Photos</th>
                      <th className="text-center p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isReviewPage ? roleFilteredTrips : recentTripsSorted).map((trip) => (
                      <tr key={trip.id} className="border-b hover:bg-muted/30" data-testid={`row-trip-${trip.id}`}>
                        <td className="p-2 whitespace-nowrap">{trip.date ? format(new Date(trip.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase() : "-"}</td>
                        <td className="p-2">{trip.time || '-'}</td>
                        <td className="p-2 font-medium">{trip.site}</td>
                        <td className="p-2">
                          {trip.material}
                          <p className={`mt-1 min-w-64 text-xs ${classifyTripRoles(trip) === "unresolved" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`} data-testid={`trip-role-description-${trip.id}`}>
                            {tripRoleDescription(trip, internalEquipment.find((item) => item.id === trip.internalEquipmentId)?.name)}
                          </p>
                          <TripWorkContextSummary trip={trip} testIdPrefix="trip-list-ctx" />
                          {trip.earthworkArrangementId == null && <p className="text-xs text-amber-700" data-testid={`trip-no-arrangement-${trip.id}`}>No arrangement linked</p>}
                        </td>
                        <td className="p-2">{trip.supplier || '-'}</td>
                        <td className="p-2" data-testid={`trip-material-source-${trip.id}`}>{trip.materialSourceType === "own_source" ? <>
                          Our own borrow area
                          {trip.materialSourceLabel && <p className="text-xs text-muted-foreground">{trip.materialSourceLabel}</p>}
                        </> : trip.materialSourceSupplier?.trim() || '-'}
                          <p className="mt-1 text-xs text-muted-foreground">Receipt/Challan No.: <span className="break-words" data-testid={`trip-receipt-${trip.id}`}>{trip.receiptNumber?.trim() || "-"}</span></p>
                        </td>
                        <td className="p-2">
                          {trip.vehicleNumber || '-'}
                          {trip.driverName && <p className="text-xs text-muted-foreground">Driver: {formatPersonName(trip.driverName)}</p>}
                          {trip.enteredBy && <p className="text-xs text-muted-foreground">Received by: {formatPersonName(trip.enteredBy)}</p>}
                          <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-trip-entered-by-${trip.id}`}>
                            {formatEnteredByDisplay((trip as any).enteredByUserName, (trip as any).createdAt)}
                          </p>
                        </td>
                        <td className="p-2 text-right font-mono">{formatTripQuantity(trip, false)}</td>
                        <td className="p-2">{trip.uom}</td>
                        <td className="p-2">{trip.location || '-'}</td>
                        <td className="p-2">
                          <AttachmentGallery
                            moduleType="site_material_trip"
                            linkedRecordId={trip.id}
                            allowDelete={false}
                            emptyText="-"
                            className="flex flex-wrap gap-1 w-24"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MaterialReceiptSlipActions
                              mode="row"
                              record={{
                                kind: "site",
                                id: trip.id,
                                date: trip.date,
                                time: trip.time,
                                materialName: trip.material,
                                quantity: trip.quantity,
                                uom: trip.uom,
                                site: trip.site,
                                location: trip.location || trip.yardLabel,
                                vehicleNumber: trip.vehicleNumber,
                                driverName: trip.driverName,
                                receivedByName: trip.enteredBy,
                                supplier: trip.supplier,
                                materialSourceType: trip.materialSourceType,
                                materialSourceSupplier: trip.materialSourceSupplier,
                                materialSourceLabel: trip.materialSourceLabel,
                                receiptNumber: trip.receiptNumber,
                                enteredBy: trip.enteredBy,
                                createdAt: (trip as any).createdAt,
                                latestEditAt: (trip as any).latestEditAt,
                                slipSharedAt: (trip as any).slipSharedAt,
                                slipSharedByUserName: (trip as any).slipSharedByUserName,
                                slipSendWindowOpen: (trip as any).slipSendWindowOpen,
                                slipSendTrackingEnabled: (trip as any).slipSendTrackingEnabled,
                              }}
                              company={companyInfo}
                              logoFile={logoFile}
                            />
                            {(canEdit || isReviewPage) && <Button variant="outline" size="sm" onClick={() => setEditingRoleTrip(trip)} data-testid={`button-edit-trip-roles-${trip.id}`}>{canEdit ? "Edit" : "Details"}</Button>}
                            {canEdit && trip.transportType !== "in_house" && <Button variant="ghost" size="sm" onClick={() => setLinkingHireTrip(trip)} data-testid={`button-link-hire-vehicle-${trip.id}`}>Link vehicle</Button>}
                            {(canEdit || isReviewPage) && <AuditHistoryButton
                              variant="ghost"
                              size="icon"
                              onClick={() => setHistoryTripId(trip.id)}
                              data-testid={`button-history-trip-${trip.id}`}
                              title="History"
                            >
                              <History className="w-4 h-4 text-muted-foreground" />
                            </AuditHistoryButton>}
                            {isReviewPage && sectionCan("site_materials", "delete") && <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCancelTripId(trip.id)}
                              data-testid={`button-cancel-trip-${trip.id}`}
                              title="Cancel"
                            >
                              <Ban className="w-4 h-4 text-amber-600" />
                            </Button>}
                            {isReviewPage && featureCan("site_materials", "cancel") && <Button
                              variant="ghost" 
                              size="icon"
                              onClick={() => deleteMutation.mutate(trip.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-trip-${trip.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>}
      </div>

      {editingRoleTrip && <TripRoleEditDialog key={editingRoleTrip.id} trip={editingRoleTrip} sitesList={sitesList} vendors={vendors} equipment={internalEquipment} vendorsLoading={vendorQuery.isLoading} vendorsError={vendorQuery.isError} onRetryVendors={() => void vendorQuery.refetch()} onClose={() => setEditingRoleTrip(null)} />}
      {linkingHireTrip && <TripHireLinkDialog trip={linkingHireTrip} onClose={() => setLinkingHireTrip(null)} />}
      <CancelDialog
        open={cancelTripId !== null}
        onOpenChange={(v) => !v && setCancelTripId(null)}
        cancelUrl={`/api/site-material-trips/${cancelTripId}/cancel`}
        recordLabel={`Material Trip #${cancelTripId}`}
        invalidateQueryKeys={["/api/site-material-trips"]}
        onCancelled={() => invalidateSiteMaterialSuggestions()}
      />
      <HistoryDialog
        open={historyTripId !== null}
        onOpenChange={(v) => !v && setHistoryTripId(null)}
        module="site_material_trips"
        transactionId={historyTripId}
        recordLabel={`Material Trip #${historyTripId}`}
      />
    </div>
  );
}
