import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Lock, Save, Loader2, Shield } from "lucide-react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";

export default function AdminSettings() {
  const { toast } = useToast();
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticatedPin, setAuthenticatedPin] = useState("");
  
  // Admin PIN change state
  const [newAdminPin, setNewAdminPin] = useState("");
  const [confirmAdminPin, setConfirmAdminPin] = useState("");
  
  // Manager PIN change state
  const [newManagerPin, setNewManagerPin] = useState("");
  const [confirmManagerPin, setConfirmManagerPin] = useState("");

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
              <CardDescription>Update the administrator access PIN (Default: 5678)</CardDescription>
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
              <CardDescription>Update the manager access PIN (Default: 1234)</CardDescription>
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
    </div>
  );
}
