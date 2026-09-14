/**
 * Fixture-only auth adapter.  No production session or customer identity is
 * used by this browser evidence fixture.
 */
export function useAuth() {
  return {
    isAdmin: true,
    sectionCan: () => true,
    sectionVisible: () => true,
    canApprove: () => true,
    isAuthenticated: true,
    isLoading: false,
    isOwner: true,
    isManager: false,
    isFieldEngineer: true,
    canManagePermissions: true,
    permissionManagerScope: "full" as const,
    user: {
      id: 99001,
      email: "dpr01-fixture@example.invalid",
      fullName: "DPR-01 Fixture Reviewer",
      isAdmin: true,
      isOwner: true,
      isActive: true,
      isFieldEngineer: true,
      sessionPolicy: "fixture" as const,
      canManagePermissions: true,
      permissionManagerScope: "full" as const,
    },
    permissions: {},
    refresh: async () => undefined,
    logout: async () => undefined,
  };
}