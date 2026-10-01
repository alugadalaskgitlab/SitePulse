export function useAuth() {
  // DPR-07 browser evidence explicitly exercises both authenticated roles.
  // The route flag only chooses this fixture's synthetic identity; production
  // SiteEdit still receives the normal authenticated-user object.
  const role = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role")
    : null;
  const viewer = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("dpr20b1") && role === "viewer";
  const isAdmin = role !== "manager" && !viewer;
  return {
    isAdmin,
    sectionCan: (_section?: string, action?: string) => !viewer || action === "view",
    sectionVisible: () => true,
    canApprove: () => !viewer,
    isAuthenticated: true,
    isLoading: false,
    isOwner: !viewer,
    isManager: !isAdmin && !viewer,
    isFieldEngineer: !viewer,
    canManagePermissions: !viewer,
    permissionManagerScope: "full" as const,
    user: {
      id: 606,
      email: "dpr-fixture@example.invalid",
       fullName: viewer ? "DPR Fixture Viewer" : isAdmin ? "DPR Fixture Admin" : "DPR Fixture Manager",
      isAdmin,
      isOwner: isAdmin,
      isActive: true,
       isFieldEngineer: !isAdmin && !viewer,
      sessionPolicy: "sticky" as const,
       canManagePermissions: !viewer,
      permissionManagerScope: "full" as const,
    },
    permissions: {},
    refresh: async () => undefined,
    logout: async () => undefined,
  };
}