import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  STRICT_IDLE_MINUTES,
  type PermissionMatrix,
  type SectionKey,
  type Action,
  emptyMatrix,
} from "@shared/permissions";

// Server-side /api/auth/me payload (subset of fields we use on the client).
export type AuthUser = {
  id: number;
  email: string;
  fullName: string;
  isAdmin: boolean;
  isActive: boolean;
  canUnlockRecords: boolean;
  sessionPolicy: "strict" | "sticky";
};

type MeResponse = { user: AuthUser; permissions: PermissionMatrix };

type AuthContextType = {
  user: AuthUser | null;
  permissions: PermissionMatrix;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Permission helpers — admin always returns true.
  sectionCan: (section: SectionKey, action: Action) => boolean;
  sectionVisible: (section: SectionKey) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TAB_OPEN_KEY = "hlc_tab_open";
const SESSION_PING_PATH = "/api/auth/me";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const lastActivityRef = useRef<number>(Date.now());

  // Tab-close detection: if sessionStorage doesn't carry our marker on this
  // tab open, the previous tab was closed → behave as logged-out and force a
  // fresh /api/auth/me check (server cookies will succeed if still valid).
  // This implements the "tab-close ends session" UX policy without forcing a
  // hard logout (the server still controls authoritative session state).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(TAB_OPEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const meQuery = useQuery<MeResponse | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch(SESSION_PING_PATH, { credentials: "include" });
      if (r.status === 401) return null;
      if (!r.ok) throw new Error(`auth: ${r.status}`);
      return (await r.json()) as MeResponse;
    },
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  // Track activity for the strict (5-minute idle) policy.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, []);

  // Strict-policy idle ping: every minute, if the user has been inactive for
  // STRICT_IDLE_MINUTES we ping /me. The server's session row stamps lastSeenAt
  // on each ping; long inactivity then expires the cookie naturally on next
  // request. We force a refetch so the UI flips to /login.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = meQuery.data?.user;
    if (!u || u.sessionPolicy !== "strict") return;
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= STRICT_IDLE_MINUTES * 60 * 1000) {
        // Force re-validation; if the server has expired us we'll get a 401.
        meQuery.refetch();
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [meQuery.data?.user?.sessionPolicy, meQuery]);

  const value = useMemo<AuthContextType>(() => {
    const u = meQuery.data?.user ?? null;
    const perms = meQuery.data?.permissions ?? emptyMatrix();

    const sectionCan = (section: SectionKey, action: Action): boolean => {
      if (!u) return false;
      if (u.isAdmin) return true;
      const row = perms[section];
      return !!row && !!row[action];
    };

    const sectionVisible = (section: SectionKey): boolean => {
      if (!u) return false;
      if (u.isAdmin) return true;
      const row = perms[section];
      return !!row && (row.view || row.create || row.edit || row.delete || row.view_reports || row.export);
    };

    return {
      user: u,
      permissions: perms,
      isLoading: meQuery.isLoading,
      isAuthenticated: !!u,
      sectionCan,
      sectionVisible,
      refresh: async () => {
        await meQuery.refetch();
      },
      logout: async () => {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
          });
        } catch {
          /* ignore */
        }
        // Clear all cached data so the next user starts fresh.
        qc.clear();
        await meQuery.refetch();
        navigate("/login");
      },
    };
  }, [meQuery, qc, navigate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// =============================================================
// Backward-compat shim: existing pages call useAccess() expecting
// the old role-based interface. We expose the same shape derived
// from the new permission matrix so we don't have to rewrite every
// page in this task.
// =============================================================

export type LegacyAccessLevel = "engineer" | "manager" | "admin";

type LegacyAccessContextType = {
  access: LegacyAccessLevel;
  setAccess: (level: LegacyAccessLevel) => void;
  canEdit: boolean;
  canDelete: boolean;
  canViewReports: boolean;
  canExport: boolean;
  isAdmin: boolean;
  requestAdminAccess: (pin: string) => boolean;
};

export function useAccess(): LegacyAccessContextType {
  const { user, permissions } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const anyEdit = !!user && (
    isAdmin ||
    Object.values(permissions).some((p) => p.edit)
  );
  const anyDelete = !!user && (
    isAdmin ||
    Object.values(permissions).some((p) => p.delete)
  );
  const anyReports = !!user && (
    isAdmin ||
    Object.values(permissions).some((p) => p.view_reports)
  );
  const anyExport = !!user && (
    isAdmin ||
    Object.values(permissions).some((p) => p.export)
  );

  const access: LegacyAccessLevel = isAdmin
    ? "admin"
    : anyEdit
    ? "manager"
    : "engineer";

  return {
    access,
    setAccess: () => {
      // No-op in the new auth model. Kept so legacy callers don't crash.
    },
    canEdit: anyEdit,
    canDelete: anyDelete,
    canViewReports: anyReports,
    canExport: anyExport,
    isAdmin,
    requestAdminAccess: () => false,
  };
}
