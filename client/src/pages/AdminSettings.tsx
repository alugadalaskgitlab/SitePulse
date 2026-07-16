import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Lock, Save, Loader2, Shield, Fuel, Building2, Package2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const LDO_FALLBACK = "PLANT OPERATOR";

export default function AdminSettings() {
  const { toast } = useToast();
  // Page-level access is enforced by <RequireAuth section="admin_settings"> in
  // App.tsx. Reaching this component implies the user can view the section.
  const authenticated = true;
  
  // Admin PIN change state
  const [newAdminPin, setNewAdminPin] = useState("");
  const [confirmAdminPin, setConfirmAdminPin] = useState("");

  
  // Manager PIN change state
  const [newManagerPin, setNewManagerPin] = useState("");
  const [confirmManagerPin, setConfirmManagerPin] = useState("");

  // Branding state
  const [brandingName, setBrandingName] = useState("");
  const [brandingShortName, setBrandingShortName] = useState("");
  const [brandingTagline, setBrandingTagline] = useState("");

  // LDO Received By defaults
  const [ldoTank1ReceivedBy, setLdoTank1ReceivedBy] = useState("");
  const [ldoTank2ReceivedBy, setLdoTank2ReceivedBy] = useState("");

  const { data: brandingData } = useQuery<{ companyName: string; companyShortName: string; appTagline: string; logoFile: string }>({
    queryKey: ["/api/admin/branding"],
    enabled: authenticated,
  });

  // Licensed modules (deployment-wide)
  const { data: licensedModulesData } = useQuery<{ licensedModules: string[] }>({
    queryKey: ["/api/admin/licensed-modules"],
    enabled: authenticated,
  });
  const licensedModules: string[] = licensedModulesData?.licensedModules ?? [];
  const hmpLicensed = licensedModules.length === 0 || licensedModules.includes("hmp");
  const rmcLicensed = licensedModules.length === 0 || licensedModules.includes("rmc");
  const isUnrestricted = licensedModules.length === 0;

  const saveLicensedModulesMutation = useMutation({
    mutationFn: async (modules: string[]) => {
      const response = await apiRequest("POST", "/api/admin/licensed-modules", { licensedModules: modules });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/licensed-modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Module licensing saved", description: "Sidebar will update for all users on next page load." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" });
    },
  });

  function toggleModule(key: string, on: boolean) {
    // "roads" is always the base marker for any restricted state.
    // Switching from unrestricted: seed with all optional modules + roads, then apply the toggle.
    let current: string[];
    if (isUnrestricted) {
      current = ["roads", "hmp", "rmc"];
    } else {
      current = [...licensedModules];
      // Guard: ensure "roads" marker is present (handles legacy data without it)
      if (!current.includes("roads")) current = ["roads", ...current];
    }
    if (on) {
      if (!current.includes(key)) current = [...current, key];
    } else {
      current = current.filter(m => m !== key);
    }
    // "roads" marker is never removed by a switch toggle — it's the base for restricted states
    if (!current.includes("roads")) current = ["roads", ...current];
    saveLicensedModulesMutation.mutate(current);
  }

  const { data: ldoReceivedByData } = useQuery<{ tank1: string | null; tank2: string | null }>({
    queryKey: ["/api/admin/ldo-received-by"],
    enabled: authenticated,
  });

  useEffect(() => {
    if (brandingData) {
      setBrandingName(brandingData.companyName ?? "");
      setBrandingShortName(brandingData.companyShortName ?? "");
      setBrandingTagline(brandingData.appTagline ?? "");
    }
  }, [brandingData]);

  useEffect(() => {
    if (ldoReceivedByData) {
      setLdoTank1ReceivedBy(ldoReceivedByData.tank1 ?? "");
      setLdoTank2ReceivedBy(ldoReceivedByData.tank2 ?? "");
    }
  }, [ldoReceivedByData]);

  const saveLdoReceivedByMutation = useMutation({
    mutationFn: async (data: { tank1: string; tank2: string }) => {
      const response = await apiRequest("POST", "/api/admin/ldo-received-by", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ldo-received-by"] });
      toast({ title: "LDO Defaults Saved", description: "Received By defaults have been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save defaults", variant: "destructive" });
    },
  });

  const saveBrandingMutation = useMutation({
    mutationFn: async (data: { companyName: string; companyShortName: string; appTagline: string }) => {
      const response = await apiRequest("POST", "/api/admin/branding", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      toast({ title: "Branding Saved", description: "Company branding has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save branding", variant: "destructive" });
    },
  });

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
        <Link href={new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("returnTo") || "/admin/hub"}>
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
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <CardTitle>Company Branding</CardTitle>
              <CardDescription>Configure the name and tagline shown throughout the app and on reports</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brandingName">Company Name</Label>
              <Input
                id="brandingName"
                value={brandingName}
                onChange={(e) => setBrandingName(e.target.value)}
                placeholder="e.g. High Lane Constructions Pvt Ltd"
                data-testid="input-branding-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandingShortName">Short Name / Abbreviation</Label>
              <Input
                id="brandingShortName"
                value={brandingShortName}
                onChange={(e) => setBrandingShortName(e.target.value.toUpperCase())}
                placeholder="e.g. HLC"
                maxLength={10}
                data-testid="input-branding-short-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandingTagline">App Tagline</Label>
              <Input
                id="brandingTagline"
                value={brandingTagline}
                onChange={(e) => setBrandingTagline(e.target.value)}
                placeholder="e.g. Live Ops. Not Just Logs."
                data-testid="input-branding-tagline"
              />
            </div>
            <Button
              onClick={() => saveBrandingMutation.mutate({ companyName: brandingName, companyShortName: brandingShortName, appTagline: brandingTagline })}
              disabled={saveBrandingMutation.isPending || !brandingName.trim()}
              className="w-full gap-2"
              data-testid="button-save-branding"
            >
              {saveBrandingMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4" />Save Branding</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Package2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle>Module Licensing</CardTitle>
              <CardDescription>
                Deployment-wide setting — controls which optional modules appear in the sidebar for all users.
                Toggle off to hide a module entirely (Roads-only deployments have both off).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded border p-3 bg-slate-50 dark:bg-slate-900/30 text-sm text-slate-600 dark:text-slate-400">
            <strong>Current package: </strong>
            {isUnrestricted
              ? "Unrestricted — all modules visible (High Lane internal deployment)"
              : hmpLicensed && rmcLicensed
                ? "Roads + HMP + RMC (both plant modules licensed)"
                : hmpLicensed
                  ? "Roads + HMP only (RMC hidden)"
                  : rmcLicensed
                    ? "Roads + RMC only (HMP hidden)"
                    : "Roads Only (no HMP, no RMC)"}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">HMP Operations</p>
                <p className="text-xs text-muted-foreground">Hotmix plant — shift logs, LDO flow, bitumen, dispatches, plant reports</p>
              </div>
              <Switch
                checked={hmpLicensed}
                onCheckedChange={(v) => toggleModule("hmp", v)}
                disabled={saveLicensedModulesMutation.isPending}
                data-testid="switch-license-hmp"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">RMC Operations</p>
                <p className="text-xs text-muted-foreground">Ready-mix concrete — batch records, mix designs, cube tests, delivery challans</p>
              </div>
              <Switch
                checked={rmcLicensed}
                onCheckedChange={(v) => toggleModule("rmc", v)}
                disabled={saveLicensedModulesMutation.isPending}
                data-testid="switch-license-rmc"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Presets</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLicensedModulesMutation.mutate([])}
                disabled={saveLicensedModulesMutation.isPending || isUnrestricted}
                data-testid="button-preset-unrestricted"
              >
                Unrestricted (HLC internal)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLicensedModulesMutation.mutate(["roads"])}
                disabled={saveLicensedModulesMutation.isPending || (!isUnrestricted && !hmpLicensed && !rmcLicensed)}
                data-testid="button-preset-roads-only"
              >
                Roads Only (no HMP / RMC)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLicensedModulesMutation.mutate(["roads", "hmp"])}
                disabled={saveLicensedModulesMutation.isPending || (!isUnrestricted && hmpLicensed && !rmcLicensed)}
                data-testid="button-preset-roads-hmp"
              >
                Roads + HMP
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLicensedModulesMutation.mutate(["roads", "rmc"])}
                disabled={saveLicensedModulesMutation.isPending || (!isUnrestricted && !hmpLicensed && rmcLicensed)}
                data-testid="button-preset-roads-rmc"
              >
                Roads + RMC
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLicensedModulesMutation.mutate(["roads", "hmp", "rmc"])}
                disabled={saveLicensedModulesMutation.isPending || (!isUnrestricted && hmpLicensed && rmcLicensed)}
                data-testid="button-preset-hmp-rmc"
              >
                Roads + HMP + RMC
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>LDO Tank Defaults</CardTitle>
              <CardDescription>Configure the default "Received By" name for each LDO tank. Falls back to <span className="font-medium">{LDO_FALLBACK}</span> if not set.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ldoTank1ReceivedBy">Tank 1 (Boiler) — Received By</Label>
              <Input
                id="ldoTank1ReceivedBy"
                value={ldoTank1ReceivedBy}
                onChange={(e) => setLdoTank1ReceivedBy(e.target.value.toUpperCase())}
                placeholder={LDO_FALLBACK}
                className="uppercase"
                data-testid="input-ldo-tank1-received-by"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ldoTank2ReceivedBy">Tank 2 (Dryer) — Received By</Label>
              <Input
                id="ldoTank2ReceivedBy"
                value={ldoTank2ReceivedBy}
                onChange={(e) => setLdoTank2ReceivedBy(e.target.value.toUpperCase())}
                placeholder={LDO_FALLBACK}
                className="uppercase"
                data-testid="input-ldo-tank2-received-by"
              />
            </div>
            <Button
              onClick={() => saveLdoReceivedByMutation.mutate({ tank1: ldoTank1ReceivedBy, tank2: ldoTank2ReceivedBy })}
              disabled={saveLdoReceivedByMutation.isPending}
              className="w-full gap-2"
              data-testid="button-save-ldo-received-by"
            >
              {saveLdoReceivedByMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4" />Save LDO Defaults</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
