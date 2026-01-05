import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type AccessLevel = "engineer" | "manager" | "admin";

interface AccessContextType {
  access: AccessLevel;
  setAccess: (level: AccessLevel) => void;
  canEdit: boolean;  // Admin only
  canDelete: boolean; // Admin only
  canViewReports: boolean; // Manager and Admin
  isAdmin: boolean; // Is currently admin
  requestAdminAccess: (pin: string) => boolean; // Try to get admin access with PIN
}

const AccessContext = createContext<AccessContextType | undefined>(undefined);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccessState] = useState<AccessLevel>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("accessLevel");
      if (stored && (stored === "engineer" || stored === "manager" || stored === "admin")) {
        return stored;
      }
    }
    return "engineer";
  });

  const setAccess = (level: AccessLevel) => {
    setAccessState(level);
    if (typeof window !== "undefined") {
      localStorage.setItem("accessLevel", level);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("accessLevel");
      if (stored && (stored === "engineer" || stored === "manager" || stored === "admin")) {
        setAccessState(stored);
      }
    }
  }, []);

  // Access levels:
  // - Engineer: Can add entries, view basic data
  // - Manager: View-only access to reports and dashboard (no edit/delete)
  // - Admin: Full access including edit and delete
  const canEdit = access === "admin"; // Per requirements: only admin can edit
  const canDelete = access === "admin"; // Only admin can delete
  const canViewReports = access === "manager" || access === "admin"; // Manager and Admin can view reports
  const isAdmin = access === "admin";
  
  // Admin PIN verification - in production this should be server-side
  const ADMIN_PIN = "1234";
  const requestAdminAccess = (pin: string): boolean => {
    if (pin.trim() === ADMIN_PIN) {
      setAccess("admin");
      return true;
    }
    return false;
  };

  return (
    <AccessContext.Provider value={{ access, setAccess, canEdit, canDelete, canViewReports, isAdmin, requestAdminAccess }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (context === undefined) {
    throw new Error("useAccess must be used within an AccessProvider");
  }
  return context;
}
