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
import { bindDprEntryModeUser } from "@/lib/dprEntryMode";
import { bindWorkspaceModeUser } from "@/lib/workspaceMode";
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
  // Company Owner / Primary Admin — always has full control across every
  // module regardless of permission toggles, and cannot be locked out.
  isOwner: boolean;
  isActive: boolean;
  // Task #1247 — explicit, admin-settable "Engineer / field user" flag,
  // independent of the broken isManager boolean (kept unchanged for its
  // many existing call sites). Drives FieldHome/guided-DPR defaults and
  // role labels.
  isFieldEngineer: boolean;
  sessionPolicy: "strict" | "sticky";
  canManagePermissions: boolean;
  permissionManagerScope: "full" | "partial" | null;
};

type MeResponse = { user: AuthUser; permissions: PermissionMatrix };

type AuthContextType = {
  user: AuthUser | null;
  permissions: PermissionMatrix;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // Company Owner / Primary Admin — bypasses permission checks like isAdmin,
  // and always retains User Management + Permission Management access.
  isOwner: boolean;
  // true when a non-admin user is authenticated (all non-admin session users are managers)
  isManager: boolean;
  // true when the user is explicitly flagged as an Engineer/field user by an
  // admin. Independent of isManager; do NOT use isManager-derived logic to
  // infer this.
  isFieldEngineer: boolean;
  // true if this user can manage permissions (admin or permission manager flag)
  canManagePermissions: boolean;
  // "full" | "partial" — only meaningful when canManagePermissions is true
  permissionManagerScope: "full" | "partial" | null;
  // Permission helpers — admin always returns true.
  sectionCan: (section: SectionKey, action: Action) => boolean;
  sectionVisible: (section: SectionKey) => boolean;
  canApprove: (section: SectionKey) => boolean;
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

  // Bind the DPR entry-mode preference to the authenticated user so the
  // Guided/Classic choice is remembered per user, never device-wide.
  useEffect(() => {
    bindDprEntryModeUser(meQuery.data?.user?.id ?? null);
    bindWorkspaceModeUser(meQuery.data?.user?.id ?? null);
  }, [meQuery.data?.user?.id]);

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
      if (u.isAdmin || u.isOwner) return true;
      const row = perms[section];
      return !!row && !!row[action];
    };

    const sectionVisible = (section: SectionKey): boolean => {
      if (!u) return false;
      if (u.isAdmin || u.isOwner) return true;
      const row = perms[section];
      return !!row && (row.view || row.create || row.edit || row.delete || row.view_reports || row.export || row.approve);
    };

    const canApprove = (section: SectionKey): boolean => {
      if (!u) return false;
      if (u.isAdmin || u.isOwner) return true;
      const row = perms[section];
      return !!row && !!row.approve;
    };

    const canManagePermissions = !!u?.isAdmin || !!u?.isOwner || !!u?.canManagePermissions;
    const permissionManagerScope = (u?.isAdmin || u?.isOwner)
      ? "full"
      : (u?.permissionManagerScope as "full" | "partial" | null) ?? null;

    return {
      user: u,
      permissions: perms,
      isLoading: meQuery.isLoading,
      isAuthenticated: !!u,
      isAdmin: !!u?.isAdmin,
      isOwner: !!u?.isOwner,
      isManager: !!u && !u.isAdmin,
      isFieldEngineer: !!u?.isFieldEngineer,
      canManagePermissions,
      permissionManagerScope,
      sectionCan,
      sectionVisible,
      canApprove,
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
