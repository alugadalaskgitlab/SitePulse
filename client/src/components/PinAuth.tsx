import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, X } from "lucide-react";

const MANAGER_PIN = "1234";
const ADMIN_PIN = "5678";

interface PinAuthProps {
  targetRole?: "manager" | "admin" | "any";
  onSuccess: (role: "manager" | "admin", pin: string) => void;
  onClose: () => void;
}

export function PinAuth({ targetRole = "any", onSuccess, onClose }: PinAuthProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    if (targetRole === "any") {
      if (pin === ADMIN_PIN) {
        onSuccess("admin", pin);
      } else if (pin === MANAGER_PIN) {
        onSuccess("manager", pin);
      } else {
        setError("Invalid PIN. Please try again.");
        setPin("");
      }
    } else {
      const expectedPin = targetRole === "manager" ? MANAGER_PIN : ADMIN_PIN;
      if (pin === expectedPin) {
        onSuccess(targetRole, pin);
      } else {
        setError(`Invalid ${targetRole} PIN. Please try again.`);
        setPin("");
      }
    }
    setIsLoading(false);
  };

  const getTitle = () => {
    if (targetRole === "any") return "Enter PIN to Continue";
    return targetRole === "admin" ? "Admin Access" : "Manager Access";
  };

  const getDescription = () => {
    if (targetRole === "any") {
      return "Enter Manager PIN (1234) for edit or Admin PIN (5678) for full control";
    }
    return `Enter ${targetRole} PIN to unlock ${targetRole === "admin" ? "full control" : "edit"} features`;
  };

  const getButtonText = () => {
    if (targetRole === "any") return "Verify PIN";
    return `Unlock ${targetRole === "admin" ? "Admin" : "Manager"} Access`;
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
                : targetRole === "manager"
                  ? "bg-amber-100 dark:bg-amber-900/30"
                  : "bg-blue-100 dark:bg-blue-900/30"
            }`}>
              <Lock className={`w-6 h-6 ${
                targetRole === "admin" 
                  ? "text-red-600 dark:text-red-400" 
                  : targetRole === "manager"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-blue-600 dark:text-blue-400"
              }`} />
            </div>
          </div>
          <CardTitle>{getTitle()}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {getDescription()}
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
                  getButtonText()
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Manager: 1234 | Admin: 5678 (demo)
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
