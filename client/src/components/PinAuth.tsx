// Backward-compat shim. The legacy PIN-gating UI was removed when SiteLog
// switched to per-user accounts + a permission matrix (Task #229). The old
// component blocked access to edit/delete actions behind a 4-digit PIN.
//
// Now: any logged-in user with the appropriate matrix permission can perform
// the action directly. The page-level UI may still mount <PinAuth> as a gate
// before showing destructive controls; we keep the component name and props
// stable but render NOTHING and call onSuccess immediately if the user is
// already authenticated and has any edit-capable role. If the user lacks
// access we render nothing and call onClose so the calling code falls through
// to its read-only branch.
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

interface PinAuthProps {
  targetRole?: "manager" | "admin" | "any";
  onSuccess: (role: "manager" | "admin", pin: string) => void;
  onClose: () => void;
}

export function PinAuth({ targetRole = "any", onSuccess, onClose }: PinAuthProps) {
  const { user, permissions } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!user) {
      onClose();
      return;
    }

    const isAdmin = !!user.isAdmin;
    const anyEdit =
      isAdmin ||
      Object.values(permissions).some((p) => p.edit || p.create);

    if (targetRole === "admin") {
      if (isAdmin) onSuccess("admin", "");
      else onClose();
      return;
    }
    // "manager" or "any" — allow if the user has any edit/create permission.
    if (anyEdit) onSuccess(isAdmin ? "admin" : "manager", "");
    else onClose();
  }, [user, permissions, targetRole, onSuccess, onClose]);

  return null;
}
