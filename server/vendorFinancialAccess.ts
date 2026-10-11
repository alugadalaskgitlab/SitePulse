import type { Request, Response, NextFunction } from "express";
import { canViewVendorFinancials, vendorFinancialSiteIds } from "@shared/vendorFinancialAccess";

const scopes = new WeakMap<Request, string[] | null>();
export const financialSites = (req: Request) => scopes.get(req);

export function vendorFinancialGuard(storage: {
  getUserSiteAccess(id: number): Promise<{ siteId: number }[]>;
  getSites(): Promise<{ id: number; name: string }[]>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Match Express's case-insensitive paths and every :id spelling accepted
    // by the route, not only decimal digits.
    if (!/^\/api\/vendor-bills\/(?:summary|export|financial-review|payables-preview|[^/]+\/statement)\/?$/i.test(req.path)) return next();
    res.setHeader("Cache-Control", "private, no-store");
    if (!req.authUser) return void res.status(401).json({ error: "not_authenticated" });
    if (!canViewVendorFinancials(req.authUser, req.authPermissions)) {
      return void res.status(403).json({ error: "forbidden", section: "vendor_financials", action: "view" });
    }
    try {
      const user = req.authUser;
      const selected = user.isOwner ? [] : (await storage.getUserSiteAccess(user.id)).map(row => row.siteId);
      const ids = vendorFinancialSiteIds(user, selected);
      scopes.set(req, ids === null ? null : (await storage.getSites()).filter(site => ids.includes(site.id)).map(site => site.name));
      next();
    } catch (error) { next(error); }
  };
}
