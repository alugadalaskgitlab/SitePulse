import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, LogOut } from "lucide-react";
import { useAccess } from "@/lib/access-context";
import { useToast } from "@/hooks/use-toast";

const ADMIN_PIN = "1234";

export function AdminModeButton() {
  const { access, setAccess } = useAccess();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const isAdmin = access === "admin";

  const handleVerifyPin = () => {
    if (pin === ADMIN_PIN) {
      setAccess("admin");
      setDialogOpen(false);
      setPin("");
      setError("");
      toast({ title: "Admin Mode activated", description: "You now have full edit/delete access" });
    } else {
      setError("Incorrect PIN. Try again.");
      setPin("");
    }
  };

  const handleLogout = () => {
    setAccess("engineer");
    toast({ title: "Admin Mode deactivated", description: "Returned to Engineer view" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerifyPin();
    }
  };

  if (isAdmin) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default" className="gap-1 bg-green-600">
          <ShieldCheck className="w-3 h-3" />
          Admin
        </Badge>
        <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout-admin">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setDialogOpen(true)} data-testid="button-admin-mode">
        <Shield className="w-4 h-4" />
        Admin Mode
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setPin(""); setError(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter Admin PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>PIN Code</Label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="Enter 4-digit PIN"
                maxLength={4}
                autoFocus
                data-testid="input-admin-pin"
              />
              {error && <p className="text-sm text-destructive mt-1">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleVerifyPin} disabled={pin.length < 4} data-testid="button-verify-pin">
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
