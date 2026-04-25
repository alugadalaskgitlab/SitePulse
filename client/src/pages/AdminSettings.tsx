import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Lock, Save, Loader2, Shield, MapPin, Plus, Trash2, Pencil, Check, X, Droplets } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  type Site,
  type Party,
  type PlantSettings,
} from "@shared/schema";
import { DEFAULT_BITUMEN_DENSITY_KG_PER_L } from "@shared/bitumen-dip-chart";

export default function AdminSettings() {
  const { toast } = useToast();
  // Page-level access is enforced by <RequireAuth section="admin_settings"> in
  // App.tsx. Reaching this component implies the user can view the section.
  const authenticated = true;
  
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

  // Task #253 — Plant Tank Calibration state. Each plant has its own
  // litres-per-cm for tanks 1 & 2 plus a density (default 1.01 kg/L). The
  // dip readings on the shift log are the single source of truth and these
  // numbers turn dip cm → MT for downstream reports.
  const [calibPlantName, setCalibPlantName] = useState<string>("Main Plant");
  const [calibT1Lpc, setCalibT1Lpc] = useState<string>("");
  const [calibT2Lpc, setCalibT2Lpc] = useState<string>("");
  const [calibDensity, setCalibDensity] = useState<string>("");
  const [calibNewPlantName, setCalibNewPlantName] = useState<string>("");

  const changeAdminPinMutation = useMutation({
    mutationFn: async (data: { newPin: string }) => {
      const response = await apiRequest("POST", "/api/admin/change-pin", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update PIN");
      }
    },
    onSuccess: () => {
      toast({
        title: "Admin PIN Updated",
        description: "Admin PIN has been changed successfully.",
      });
      setNewAdminPin("");
      setConfirmAdminPin("");
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
    mutationFn: async (data: { newPin: string }) => {
      const response = await apiRequest("POST", "/api/admin/change-manager-pin", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update PIN");
      }
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

  // Task #253 — Plant Tank Calibration queries/mutation
  const { data: knownPlants = [] } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    enabled: authenticated,
  });
  const { data: allPlantSettings = [] } = useQuery<PlantSettings[]>({
    queryKey: ["/api/plant-module/plant-settings"],
    enabled: authenticated,
  });
  const calibPlantOptions = Array.from(new Set([
    ...(knownPlants || []),
    ...(allPlantSettings || []).map(p => p.plantName),
    "Main Plant",
  ])).sort();
  const { data: currentCalib } = useQuery<PlantSettings | null>({
    queryKey: ["/api/plant-module/plant-settings", calibPlantName],
    enabled: authenticated && !!calibPlantName,
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/plant-settings/${encodeURIComponent(calibPlantName)}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  // Sync the form when the selected plant changes (or its row arrives).
  useEffect(() => {
    setCalibT1Lpc(currentCalib?.bitumenTank1LitresPerCm != null ? String(currentCalib.bitumenTank1LitresPerCm) : "");
    setCalibT2Lpc(currentCalib?.bitumenTank2LitresPerCm != null ? String(currentCalib.bitumenTank2LitresPerCm) : "");
    setCalibDensity(currentCalib?.bitumenDensityKgPerL != null ? String(currentCalib.bitumenDensityKgPerL) : "");
  }, [currentCalib?.plantName, currentCalib?.bitumenTank1LitresPerCm, currentCalib?.bitumenTank2LitresPerCm, currentCalib?.bitumenDensityKgPerL]);

  const savePlantCalibMutation = useMutation({
    mutationFn: async () => {
      const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
      const body = {
        bitumenTank1LitresPerCm: numOrNull(calibT1Lpc),
        bitumenTank2LitresPerCm: numOrNull(calibT2Lpc),
        bitumenDensityKgPerL: numOrNull(calibDensity),
      };
      const res = await apiRequest("PUT", `/api/plant-module/plant-settings/${encodeURIComponent(calibPlantName)}`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save calibration");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/plant-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/plant-settings", calibPlantName] });
      toast({ title: "Calibration Saved", description: `Tank calibration updated for ${calibPlantName}.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save calibration", variant: "destructive" });
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

    changeAdminPinMutation.mutate({ newPin: newAdminPin });
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

    changeManagerPinMutation.mutate({ newPin: newManagerPin });
  };

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

      {/* Task #253 — Plant Tank Calibration. Per-plant litres-per-cm and
          density used to derive bitumen MT from operator dip readings on the
          Plant Shift Log. Density default is 1.01 kg/L when blank. */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Plant Tank Calibration</CardTitle>
              <CardDescription>
                Litres-per-cm for each bitumen tank, plus density (default {DEFAULT_BITUMEN_DENSITY_KG_PER_L} kg/L). Used to convert dip readings into MT on shift logs and daily reports.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Plant</Label>
              <Select value={calibPlantName} onValueChange={setCalibPlantName}>
                <SelectTrigger data-testid="select-calib-plant">
                  <SelectValue placeholder="Select plant" />
                </SelectTrigger>
                <SelectContent>
                  {calibPlantOptions.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Or add a new plant name</Label>
              <div className="flex gap-2">
                <Input
                  value={calibNewPlantName}
                  onChange={(e) => setCalibNewPlantName(e.target.value)}
                  placeholder="e.g. Site B Plant"
                  data-testid="input-calib-new-plant"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const t = calibNewPlantName.trim();
                    if (!t) return;
                    setCalibPlantName(t);
                    setCalibNewPlantName("");
                  }}
                  disabled={!calibNewPlantName.trim()}
                  data-testid="button-calib-use-new"
                >
                  Use
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-sm">Tank 1 (litres / cm)</Label>
              <Input
                type="number"
                step="0.01"
                value={calibT1Lpc}
                onChange={(e) => setCalibT1Lpc(e.target.value)}
                placeholder="e.g. 49.08"
                data-testid="input-calib-t1-lpc"
              />
            </div>
            <div>
              <Label className="text-sm">Tank 2 (litres / cm)</Label>
              <Input
                type="number"
                step="0.01"
                value={calibT2Lpc}
                onChange={(e) => setCalibT2Lpc(e.target.value)}
                placeholder="e.g. 49.08"
                data-testid="input-calib-t2-lpc"
              />
            </div>
            <div>
              <Label className="text-sm">Density (kg / L)</Label>
              <Input
                type="number"
                step="0.001"
                value={calibDensity}
                onChange={(e) => setCalibDensity(e.target.value)}
                placeholder={`default ${DEFAULT_BITUMEN_DENSITY_KG_PER_L}`}
                data-testid="input-calib-density"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={() => savePlantCalibMutation.mutate()}
            disabled={savePlantCalibMutation.isPending || !calibPlantName.trim()}
            className="w-full gap-2"
            data-testid="button-save-calib"
          >
            {savePlantCalibMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
            ) : (
              <><Save className="w-4 h-4" />Save Calibration</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
