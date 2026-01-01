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
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const changePinMutation = useMutation({
    mutationFn: async (data: { currentPin: string; newPin: string }) => {
      const response = await apiRequest("POST", "/api/admin/change-pin", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update PIN");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "PIN Updated",
        description: "Admin PIN has been changed successfully.",
      });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update PIN",
        variant: "destructive",
      });
    },
  });

  const handlePinAuthSuccess = (role: "manager" | "admin") => {
    if (role === "admin") {
      setAuthenticated(true);
      setShowPinAuth(false);
    } else {
      toast({
        title: "Access Denied",
        description: "Admin PIN required to access settings.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (currentPin.length !== 4) {
      toast({
        title: "Invalid Current PIN",
        description: "Current PIN must be exactly 4 digits.",
        variant: "destructive",
      });
      return;
    }

    if (newPin.length !== 4) {
      toast({
        title: "Invalid New PIN",
        description: "New PIN must be exactly 4 digits.",
        variant: "destructive",
      });
      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: "PIN Mismatch",
        description: "New PIN and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    changePinMutation.mutate({ currentPin, newPin });
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPin">Current Admin PIN</Label>
              <Input
                id="currentPin"
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                maxLength={4}
                placeholder="Enter current PIN"
                className="font-mono tracking-widest"
                data-testid="input-current-pin"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="newPin">New PIN</Label>
              <Input
                id="newPin"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                maxLength={4}
                placeholder="Enter new 4-digit PIN"
                className="font-mono tracking-widest"
                data-testid="input-new-pin"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPin">Confirm New PIN</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                maxLength={4}
                placeholder="Confirm new PIN"
                className="font-mono tracking-widest"
                data-testid="input-confirm-pin"
              />
            </div>

            <Button
              type="submit"
              disabled={changePinMutation.isPending || !currentPin || !newPin || !confirmPin}
              className="w-full gap-2"
              data-testid="button-save-pin"
            >
              {changePinMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save New PIN
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
              <CardTitle>Manager PIN</CardTitle>
              <CardDescription>Manager PIN is fixed at 1234</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The Manager PIN (1234) provides edit access to reports. Only the Admin PIN can be changed through this interface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
