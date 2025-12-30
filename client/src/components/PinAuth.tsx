import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, X } from "lucide-react";

const MANAGER_PIN = "1234";
const ADMIN_PIN = "5678";

interface PinAuthProps {
  targetRole: "manager" | "admin";
  onSuccess: (role: "manager" | "admin") => void;
  onClose: () => void;
}

export function PinAuth({ targetRole, onSuccess, onClose }: PinAuthProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    const expectedPin = targetRole === "manager" ? MANAGER_PIN : ADMIN_PIN;
    
    if (pin === expectedPin) {
      onSuccess(targetRole);
    } else {
      setError(`Invalid ${targetRole} PIN. Please try again.`);
      setPin("");
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md shadow-2xl relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          onClick={onClose}
          data-testid="button-close-pin"
        >
          <X className="w-4 h-4" />
        </Button>
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              targetRole === "admin" 
                ? "bg-red-100 dark:bg-red-900/30" 
                : "bg-amber-100 dark:bg-amber-900/30"
            }`}>
              <Lock className={`w-6 h-6 ${
                targetRole === "admin" 
                  ? "text-red-600 dark:text-red-400" 
                  : "text-amber-600 dark:text-amber-400"
              }`} />
            </div>
          </div>
          <CardTitle>{targetRole === "admin" ? "Admin" : "Manager"} Access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter {targetRole} PIN to unlock {targetRole === "admin" ? "full control" : "edit"} features
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
                maxLength={4}
                className="text-center text-2xl tracking-widest font-mono"
                data-testid="input-pin"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}
            <div className="space-y-2">
              <Button
                type="submit"
                className="w-full"
                disabled={pin.length !== 4 || isLoading}
                data-testid="button-unlock"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  `Unlock ${targetRole === "admin" ? "Admin" : "Manager"} Access`
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {targetRole === "manager" ? "Manager PIN: 1234" : "Admin PIN: 5678"} (for demo)
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
