import { useQuery } from "@tanstack/react-query";

/** Read-only projection of the SAME existing site APIs used by SiteAccessTab. */
export function SiteScopeSummary({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const sites = useQuery<{ id: number; name: string; isActive: number }[]>({ queryKey: ["/api/sites"] });
  const access = useQuery<{ siteIds: number[]; allSites: boolean }>({
    queryKey: ["/api/auth/users", userId, "site-access"],
  });
  if (sites.isLoading || access.isLoading) return <div className="h-8 rounded bg-muted animate-pulse" aria-label="Loading existing site scope" />;
  if (sites.isError || access.isError) return <p role="alert">Site scope could not be loaded. No site grants changed. <button type="button" onClick={() => { void sites.refetch(); void access.refetch(); }}>Retry scope</button></p>;
  const ids = access.data?.siteIds ?? [];
  const names = ids.map(id => sites.data?.find(site => site.id === id)?.name ?? `Site #${id}`);
  return <div>
    <p><strong>Recorded site scope:</strong> {access.data?.allSites ? "All Sites — explicit grant" : ids.length ? `${ids.length} selected: ${names.join(", ")}` : "No sites assigned — no site data for an ordinary account"}.</p>
    {isAdmin && <p>Administrator site bypass applies independently of recorded assignments.</p>}
    <p className="authority-meta">Edit scope below using Site Access. It saves separately; permission review does not silently change scope.</p>
  </div>;
}
