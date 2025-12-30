import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type AccessLevel = "engineer" | "manager" | "admin";

interface AccessContextType {
  access: AccessLevel;
  setAccess: (level: AccessLevel) => void;
  canEdit: boolean;
  canDelete: boolean;
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

  const canEdit = access === "manager" || access === "admin";
  const canDelete = access === "admin";

  return (
    <AccessContext.Provider value={{ access, setAccess, canEdit, canDelete }}>
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
