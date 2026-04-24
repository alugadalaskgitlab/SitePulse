import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Lock, Save, Loader2, Shield, MapPin, Plus, Trash2, Pencil, Check, X, Percent, Flame } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PinAuth } from "@/components/PinAuth";
import {
  EQUIPMENT_TYPES,
  PLANT_ALERT_THRESHOLD_DEFAULTS,
  type PlantAlertThresholds,
  type Site,
  type Party,
} from "@shared/schema";

export default function AdminSettings() {
  const { toast } = useToast();
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticatedPin, setAuthenticatedPin] = useState("");
  
  // Admin PIN change state
  const [newAdminPin, setNewAdminPin] = useState("");
  const [confirmAdminPin, setConfirmAdminPin] = useState("");

  // Sites Master state
  const [newSiteName, setNewSiteName] = useState("");
  const [newSitePartyId, setNewSitePartyId] = useState<string>("all");
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
  const [editingSiteName, setEditingSiteName] = useState("");
  const [editingSitePartyId, setEditingSitePartyId] = useState<string>("all");
  
  // Manager PIN change state
  const [newManagerPin, setNewManagerPin] = useState("");
  const [confirmManagerPin, setConfirmManagerPin] = useState("");

  // Variance highlight threshold state
  const [varianceThresholdInput, setVarianceThresholdInput] = useState("");
  const [varianceThresholdDirty, setVarianceThresholdDirty] = useState(false);
  // Per-equipment-type overrides. Empty string means "no override" (use global).
  const [varianceOverridesInput, setVarianceOverridesInput] = useState<Record<string, string>>({});
  const [varianceOverridesDirty, setVarianceOverridesDirty] = useState(false);

  // Plant alert thresholds (boiler / heating session post-save alerts).
  // The full schema also stores `monthlyOverConsumerVariancePct` and
  // `monthlyOverConsumerMinDays`; those are kept and re-sent unchanged so the
  // PUT (which validates the whole object) doesn't reset them to defaults.
  const [hotOilEndTempInput, setHotOilEndTempInput] = useState("");
  const [ldoLitersPerHourInput, setLdoLitersPerHourInput] = useState("");
  const [sessionsVsShiftInput, setSessionsVsShiftInput] = useState("");
  const [hotOilDeltaMinInput, setHotOilDeltaMinInput] = useState("");
  const [alertThresholdsDirty, setAlertThresholdsDirty] = useState(false);

  const changeAdminPinMutation = useMutation({
    mutationFn: async (data: { currentPin: string; newPin: string }) => {
      const response = await apiRequest("POST", "/api/admin/change-pin", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update PIN");
      }
      return data.newPin;
    },
    onSuccess: (newPin: string) => {
      toast({
        title: "Admin PIN Updated",
        description: "Admin PIN has been changed successfully.",
      });
      setNewAdminPin("");
      setConfirmAdminPin("");
      setAuthenticatedPin(newPin);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update admin PIN",
        variant: "destructive",
      });
    },
  });

  const changeManagerPinMutation = useMutation({
    mutationFn: async (data: { currentPin: string; newPin: string }) => {
      const response = await apiRequest("POST", "/api/admin/change-manager-pin", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update PIN");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Manager PIN Updated",
        description: "Manager PIN has been changed successfully.",
      });
      setNewManagerPin("");
      setConfirmManagerPin("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update manager PIN",
        variant: "destructive",
      });
    },
  });

  // Variance highlight threshold queries/mutations
  const { data: varianceThresholdData, isLoading: varianceThresholdLoading } = useQuery<{ thresholdPct: number; overrides: Record<string, number> }>({
    queryKey: ["/api/plant-module/variance-highlight-threshold"],
    enabled: authenticated,
  });

  useEffect(() => {
    if (!varianceThresholdDirty && varianceThresholdData?.thresholdPct != null) {
      setVarianceThresholdInput(String(varianceThresholdData.thresholdPct));
    }
  }, [varianceThresholdData, varianceThresholdDirty]);

  useEffect(() => {
    if (!varianceOverridesDirty && varianceThresholdData?.overrides) {
      const next: Record<string, string> = {};
      EQUIPMENT_TYPES.forEach((type) => {
        const v = varianceThresholdData.overrides?.[type];
        next[type] = typeof v === "number" ? String(v) : "";
      });
      setVarianceOverridesInput(next);
    }
  }, [varianceThresholdData, varianceOverridesDirty]);

  const updateVarianceThresholdMutation = useMutation({
    mutationFn: async (payload: { thresholdPct?: number; overrides?: Record<string, number> }) => {
      const response = await apiRequest("PUT", "/api/plant-module/variance-highlight-threshold", {
        pin: authenticatedPin,
        ...payload,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update threshold");
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/variance-highlight-threshold"] });
      if (variables.thresholdPct !== undefined) setVarianceThresholdDirty(false);
      if (variables.overrides !== undefined) setVarianceOverridesDirty(false);
      toast({ title: "Threshold Updated", description: "Variance highlight threshold has been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Plant alert thresholds queries/mutations
  const { data: alertThresholdsData, isLoading: alertThresholdsLoading } = useQuery<PlantAlertThresholds>({
    queryKey: ["/api/plant-module/alert-thresholds"],
    enabled: authenticated,
  });

  useEffect(() => {
    if (!alertThresholdsDirty && alertThresholdsData) {
      setHotOilEndTempInput(String(alertThresholdsData.hotOilEndTempMinC));
      setLdoLitersPerHourInput(String(alertThresholdsData.ldoLitersPerHourMax));
      setSessionsVsShiftInput(String(alertThresholdsData.sessionsVsShiftMismatchL));
      setHotOilDeltaMinInput(
        String(
          alertThresholdsData.hotOilDeltaMinC
          ?? PLANT_ALERT_THRESHOLD_DEFAULTS.hotOilDeltaMinC,
        ),
      );
    }
  }, [alertThresholdsData, alertThresholdsDirty]);

  const updateAlertThresholdsMutation = useMutation({
    mutationFn: async (payload: PlantAlertThresholds) => {
      const response = await apiRequest("PUT", "/api/plant-module/alert-thresholds", {
        pin: authenticatedPin,
        ...payload,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update alert thresholds");
      }
      return response.json() as Promise<PlantAlertThresholds>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/alert-thresholds"] });
      setAlertThresholdsDirty(false);
      toast({ title: "Alert Thresholds Updated", description: "Boiler & hot-oil alert limits have been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Sites Master queries/mutations
  const { data: sitesList = [], isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    enabled: authenticated,
  });

  const { data: partiesList = [] } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
    enabled: authenticated,
  });

  const getPartyName = (partyId: number | null) => {
    if (!partyId) return null;
    return partiesList.find(p => p.id === partyId)?.name || null;
  };

  const createSiteMutation = useMutation({
    mutationFn: async (data: { name: string; partyId: number | null }) => {
      const response = await apiRequest("POST", "/api/sites", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create site");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setNewSiteName("");
      setNewSitePartyId("all");
      toast({ title: "Site Added", description: "New site has been added." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: async ({ id, name, partyId }: { id: number; name: string; partyId: number | null }) => {
      const response = await apiRequest("PATCH", `/api/sites/${id}`, { name, partyId });
      if (!response.ok) throw new Error("Failed to update site");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setEditingSiteId(null);
      setEditingSiteName("");
      setEditingSitePartyId("all");
      toast({ title: "Site Updated", description: "Site has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/sites/${id}`);
      if (!response.ok) throw new Error("Failed to delete site");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site Deleted", description: "Site has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    createSiteMutation.mutate({
      name: newSiteName.trim(),
      partyId: newSitePartyId !== "all" ? parseInt(newSitePartyId) : null,
    });
  };

  const handlePinAuthSuccess = (role: "manager" | "admin", pin: string) => {
    if (role === "admin") {
      setAuthenticated(true);
      setShowPinAuth(false);
      setAuthenticatedPin(pin);
    } else {
      toast({
        title: "Access Denied",
        description: "Admin PIN required to access settings.",
        variant: "destructive",
      });
    }
  };

  const handleChangeAdminPin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newAdminPin.length !== 4) {
      toast({
        title: "Invalid New PIN",
        description: "New PIN must be exactly 4 digits.",
        variant: "destructive",
      });
      return;
    }

    if (newAdminPin !== confirmAdminPin) {
      toast({
        title: "PIN Mismatch",
        description: "New PIN and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    changeAdminPinMutation.mutate({ currentPin: authenticatedPin, newPin: newAdminPin });
  };

  const handleChangeManagerPin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newManagerPin.length !== 4) {
      toast({
        title: "Invalid New PIN",
        description: "New PIN must be exactly 4 digits.",
        variant: "destructive",
      });
      return;
    }

    if (newManagerPin !== confirmManagerPin) {
      toast({
        title: "PIN Mismatch",
        description: "New PIN and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    changeManagerPinMutation.mutate({ currentPin: authenticatedPin, newPin: newManagerPin });
  };

  if (showPinAuth && !authenticated) {
    return (
      <PinAuth
        targetRole="admin"
        onSuccess={handlePinAuthSuccess}
        onClose={() => window.history.back()}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Settings</h1>
          <p className="text-muted-foreground text-sm">Manage system security settings</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle>Change Admin PIN</CardTitle>
              <CardDescription>Update the administrator access PIN</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeAdminPin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newAdminPin">New Admin PIN</Label>
              <Input
                id="newAdminPin"
                type="password"
                value={newAdminPin}
                onChange={(e) => setNewAdminPin(e.target.value)}
                maxLength={4}
                placeholder="Enter new 4-digit PIN"
                className="font-mono tracking-widest"
                data-testid="input-new-admin-pin"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmAdminPin">Confirm New Admin PIN</Label>
              <Input
                id="confirmAdminPin"
                type="password"
                value={confirmAdminPin}
                onChange={(e) => setConfirmAdminPin(e.target.value)}
                maxLength={4}
                placeholder="Confirm new PIN"
                className="font-mono tracking-widest"
                data-testid="input-confirm-admin-pin"
              />
            </div>

            <Button
              type="submit"
              disabled={changeAdminPinMutation.isPending || !newAdminPin || !confirmAdminPin}
              className="w-full gap-2"
              data-testid="button-save-admin-pin"
            >
              {changeAdminPinMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Update Admin PIN
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle>Change Manager PIN</CardTitle>
              <CardDescription>Update the manager access PIN</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeManagerPin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newManagerPin">New Manager PIN</Label>
              <Input
                id="newManagerPin"
                type="password"
                value={newManagerPin}
                onChange={(e) => setNewManagerPin(e.target.value)}
                maxLength={4}
                placeholder="Enter new 4-digit PIN"
                className="font-mono tracking-widest"
                data-testid="input-new-manager-pin"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmManagerPin">Confirm New Manager PIN</Label>
              <Input
                id="confirmManagerPin"
                type="password"
                value={confirmManagerPin}
                onChange={(e) => setConfirmManagerPin(e.target.value)}
                maxLength={4}
                placeholder="Confirm new PIN"
                className="font-mono tracking-widest"
                data-testid="input-confirm-manager-pin"
              />
            </div>

            <Button
              type="submit"
              disabled={changeManagerPinMutation.isPending || !newManagerPin || !confirmManagerPin}
              className="w-full gap-2"
              data-testid="button-save-manager-pin"
            >
              {changeManagerPinMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Update Manager PIN
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Percent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Variance Highlight Threshold</CardTitle>
              <CardDescription>
                Equipment Usage rows are highlighted when |actual − expected diesel| as a % of expected meets or exceeds this value.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const payload: { thresholdPct?: number; overrides?: Record<string, number> } = {};
              if (varianceThresholdDirty) {
                const num = Number(varianceThresholdInput);
                if (!Number.isFinite(num) || num < 0 || num > 100) {
                  toast({
                    title: "Invalid Threshold",
                    description: "Enter a number between 0 and 100.",
                    variant: "destructive",
                  });
                  return;
                }
                payload.thresholdPct = num;
              }
              if (varianceOverridesDirty) {
                const overrides: Record<string, number> = {};
                for (const type of EQUIPMENT_TYPES) {
                  const raw = (varianceOverridesInput[type] ?? "").trim();
                  if (raw === "") continue;
                  const num = Number(raw);
                  if (!Number.isFinite(num) || num < 0 || num > 100) {
                    toast({
                      title: "Invalid Override",
                      description: `${type} override must be a number between 0 and 100.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  overrides[type] = num;
                }
                payload.overrides = overrides;
              }
              if (payload.thresholdPct === undefined && payload.overrides === undefined) {
                // Nothing changed; still accept as a no-op save by sending the current global.
                const num = Number(varianceThresholdInput);
                if (Number.isFinite(num) && num >= 0 && num <= 100) {
                  payload.thresholdPct = num;
                }
              }
              updateVarianceThresholdMutation.mutate(payload);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="varianceThreshold">Threshold (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="varianceThreshold"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={varianceThresholdInput}
                  onChange={(e) => {
                    setVarianceThresholdInput(e.target.value);
                    setVarianceThresholdDirty(true);
                  }}
                  placeholder="e.g. 15"
                  className="w-32"
                  disabled={varianceThresholdLoading}
                  data-testid="input-variance-threshold"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default is 15%. Lower values flag more rows; higher values flag fewer.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm">Per-Equipment-Type Overrides (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Leave blank to use the global threshold above. Different machines tolerate very different variance bands (e.g. DGs run hotter than JCBs).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {EQUIPMENT_TYPES.map((type) => (
                  <div key={type} className="space-y-1">
                    <Label htmlFor={`variance-override-${type}`} className="text-xs font-normal text-muted-foreground">{type}</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id={`variance-override-${type}`}
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={varianceOverridesInput[type] ?? ""}
                        onChange={(e) => {
                          setVarianceOverridesInput((prev) => ({ ...prev, [type]: e.target.value }));
                          setVarianceOverridesDirty(true);
                        }}
                        placeholder="—"
                        className="w-full"
                        disabled={varianceThresholdLoading}
                        data-testid={`input-variance-override-${type}`}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={
                updateVarianceThresholdMutation.isPending
                || varianceThresholdLoading
                || !varianceThresholdInput
              }
              className="w-full gap-2"
              data-testid="button-save-variance-threshold"
            >
              {updateVarianceThresholdMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Threshold
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle>Boiler & Hot-Oil Alert Limits</CardTitle>
              <CardDescription>
                Limits used by the heating-session post-save check that fires push and inbox alerts to managers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!alertThresholdsData) return;

              const hotOil = Number(hotOilEndTempInput);
              if (!Number.isFinite(hotOil) || hotOil < 0) {
                toast({
                  title: "Invalid Hot-Oil End Temp",
                  description: "Enter a non-negative number (°C).",
                  variant: "destructive",
                });
                return;
              }

              const ldoLph = Number(ldoLitersPerHourInput);
              if (!Number.isFinite(ldoLph) || ldoLph <= 0) {
                toast({
                  title: "Invalid LDO L/hour Limit",
                  description: "Enter a positive number (L/hour).",
                  variant: "destructive",
                });
                return;
              }

              const mismatch = Number(sessionsVsShiftInput);
              if (!Number.isFinite(mismatch) || mismatch <= 0) {
                toast({
                  title: "Invalid Mismatch Limit",
                  description: "Enter a positive number (L).",
                  variant: "destructive",
                });
                return;
              }

              const deltaMin = Number(hotOilDeltaMinInput);
              if (!Number.isFinite(deltaMin) || deltaMin < 0) {
                toast({
                  title: "Invalid Δ Floor",
                  description: "Enter a non-negative number (°C).",
                  variant: "destructive",
                });
                return;
              }

              updateAlertThresholdsMutation.mutate({
                hotOilEndTempMinC: hotOil,
                ldoLitersPerHourMax: ldoLph,
                sessionsVsShiftMismatchL: mismatch,
                hotOilDeltaMinC: deltaMin,
                // Preserve the persistent over-consumer fields (also stored in
                // this same JSON blob) so saving boiler limits doesn't reset
                // them. Fall back to defaults if the GET hasn't loaded yet.
                monthlyOverConsumerVariancePct:
                  alertThresholdsData.monthlyOverConsumerVariancePct
                  ?? PLANT_ALERT_THRESHOLD_DEFAULTS.monthlyOverConsumerVariancePct,
                monthlyOverConsumerMinDays:
                  alertThresholdsData.monthlyOverConsumerMinDays
                  ?? PLANT_ALERT_THRESHOLD_DEFAULTS.monthlyOverConsumerMinDays,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="hotOilEndTempMinC">Hot-Oil End Temperature Floor</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hotOilEndTempMinC"
                  type="number"
                  min={0}
                  step="1"
                  value={hotOilEndTempInput}
                  onChange={(e) => {
                    setHotOilEndTempInput(e.target.value);
                    setAlertThresholdsDirty(true);
                  }}
                  placeholder={String(PLANT_ALERT_THRESHOLD_DEFAULTS.hotOilEndTempMinC)}
                  className="w-32"
                  disabled={alertThresholdsLoading}
                  data-testid="input-hot-oil-end-temp-min"
                />
                <span className="text-sm text-muted-foreground">°C</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Alert when a heating session ends below this temperature. Default {PLANT_ALERT_THRESHOLD_DEFAULTS.hotOilEndTempMinC}°C.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldoLitersPerHourMax">LDO Burn Rate Ceiling</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ldoLitersPerHourMax"
                  type="number"
                  min={0}
                  step="0.1"
                  value={ldoLitersPerHourInput}
                  onChange={(e) => {
                    setLdoLitersPerHourInput(e.target.value);
                    setAlertThresholdsDirty(true);
                  }}
                  placeholder={String(PLANT_ALERT_THRESHOLD_DEFAULTS.ldoLitersPerHourMax)}
                  className="w-32"
                  disabled={alertThresholdsLoading}
                  data-testid="input-ldo-liters-per-hour-max"
                />
                <span className="text-sm text-muted-foreground">L/hour</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Alert when a session's LDO burn rate exceeds this. Default {PLANT_ALERT_THRESHOLD_DEFAULTS.ldoLitersPerHourMax} L/hour.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sessionsVsShiftMismatchL">Sessions vs Shift-Meter Mismatch</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sessionsVsShiftMismatchL"
                  type="number"
                  min={0}
                  step="0.1"
                  value={sessionsVsShiftInput}
                  onChange={(e) => {
                    setSessionsVsShiftInput(e.target.value);
                    setAlertThresholdsDirty(true);
                  }}
                  placeholder={String(PLANT_ALERT_THRESHOLD_DEFAULTS.sessionsVsShiftMismatchL)}
                  className="w-32"
                  disabled={alertThresholdsLoading}
                  data-testid="input-sessions-vs-shift-mismatch"
                />
                <span className="text-sm text-muted-foreground">L</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Alert when |sum of session LDO − shift-meter LDO| for a day exceeds this. Default {PLANT_ALERT_THRESHOLD_DEFAULTS.sessionsVsShiftMismatchL} L.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hotOilDeltaMinC">Hot-oil Supply − Return Δ Floor</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hotOilDeltaMinC"
                  type="number"
                  min={0}
                  step="0.5"
                  value={hotOilDeltaMinInput}
                  onChange={(e) => {
                    setHotOilDeltaMinInput(e.target.value);
                    setAlertThresholdsDirty(true);
                  }}
                  placeholder={String(PLANT_ALERT_THRESHOLD_DEFAULTS.hotOilDeltaMinC)}
                  className="w-32"
                  disabled={alertThresholdsLoading}
                  data-testid="input-hot-oil-delta-min"
                />
                <span className="text-sm text-muted-foreground">°C</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Flag days on the Heating Trends chart when the daily average supply minus return temperature drops below this floor — a shrinking Δ is an early sign of heat-exchanger fouling. Default {PLANT_ALERT_THRESHOLD_DEFAULTS.hotOilDeltaMinC}°C.
              </p>
            </div>

            <Button
              type="submit"
              disabled={
                updateAlertThresholdsMutation.isPending
                || alertThresholdsLoading
                || !alertThresholdsData
                || !hotOilEndTempInput
                || !ldoLitersPerHourInput
                || !sessionsVsShiftInput
                || !hotOilDeltaMinInput
              }
              className="w-full gap-2"
              data-testid="button-save-alert-thresholds"
            >
              {updateAlertThresholdsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Alert Limits
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <CardTitle>Sites Master</CardTitle>
              <CardDescription>Manage site names to avoid misspellings in reports</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddSite} className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm">Site Name</Label>
              <Input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value.toUpperCase())}
                placeholder="Enter new site name"
                className="uppercase"
                data-testid="input-new-site"
              />
            </div>
            <div className="w-[180px]">
              <Label className="text-sm">Party (optional)</Label>
              <Select value={newSitePartyId} onValueChange={setNewSitePartyId}>
                <SelectTrigger data-testid="select-new-site-party">
                  <SelectValue placeholder="All parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All parties</SelectItem>
                  {partiesList.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={createSiteMutation.isPending || !newSiteName.trim()}
              className="gap-1"
              data-testid="button-add-site"
            >
              {createSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </form>

          {sitesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sitesList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-sites">
              No sites added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {sitesList.map((site) => (
                <div key={site.id} className="flex items-center gap-2 p-2 rounded border" data-testid={`site-row-${site.id}`}>
                  {editingSiteId === site.id ? (
                    <>
                      <Input
                        value={editingSiteName}
                        onChange={(e) => setEditingSiteName(e.target.value.toUpperCase())}
                        className="uppercase flex-1"
                        data-testid={`input-edit-site-${site.id}`}
                        autoFocus
                      />
                      <Select value={editingSitePartyId} onValueChange={setEditingSitePartyId}>
                        <SelectTrigger className="w-[140px]" data-testid={`select-edit-site-party-${site.id}`}>
                          <SelectValue placeholder="Party" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All parties</SelectItem>
                          {partiesList.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (editingSiteName.trim()) {
                            updateSiteMutation.mutate({
                              id: site.id,
                              name: editingSiteName.trim(),
                              partyId: editingSitePartyId !== "all" ? parseInt(editingSitePartyId) : null,
                            });
                          }
                        }}
                        disabled={updateSiteMutation.isPending}
                        data-testid={`button-save-site-${site.id}`}
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditingSiteId(null); setEditingSiteName(""); setEditingSitePartyId("all"); }}
                        data-testid={`button-cancel-edit-site-${site.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-site-name-${site.id}`}>{site.name}</span>
                        {site.partyId && (
                          <Badge variant="outline" className="text-xs">{getPartyName(site.partyId) || "Unknown"}</Badge>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingSiteId(site.id);
                          setEditingSiteName(site.name);
                          setEditingSitePartyId(site.partyId ? String(site.partyId) : "all");
                        }}
                        data-testid={`button-edit-site-${site.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete site "${site.name}"?`)) {
                            deleteSiteMutation.mutate(site.id);
                          }
                        }}
                        disabled={deleteSiteMutation.isPending}
                        data-testid={`button-delete-site-${site.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
