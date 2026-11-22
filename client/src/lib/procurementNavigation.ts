export function resolveInternalReturnTo(requested: string | null | undefined, fallback: string): string {
  return requested?.startsWith("/") ? requested : fallback;
}

export function purchaseIndentReturnPath(options: {
  returnTo?: string | null;
  context?: string | null;
  origin?: string | null;
  tab?: string | null;
}): string {
  if (options.returnTo?.startsWith("/")) return options.returnTo;
  if (options.origin === "portal") return "/";
  switch (options.context) {
    case "stores": return "/stores/hub";
    case "site": return "/site/hub";
    case "hmp": return "/plant/hub";
    case "finance": return "/finance/hub";
    default: return options.tab === "operations" ? "/plant/hub" : "/finance/hub";
  }
}

export function contextKeyForReturnPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/stores")) return "stores";
  if (path.startsWith("/plant")) return "hmp";
  if (path.startsWith("/site")) return "site";
  if (path.startsWith("/finance")) return "finance";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/equipment")) return "equipment";
  return null;
}

export type StoresGrnListState = {
  returnTo?: string;
  context?: string | null;
  dateFrom?: string;
  dateTo?: string;
  indentRef?: string;
  supplier?: string;
  siteId?: string;
  statusMode?: string;
  category?: string;
  item?: string;
};

export function storesGrnListQuery(state: StoresGrnListState): string {
  const params = new URLSearchParams();
  for (const [key, value] of [
    ["returnTo", state.returnTo],
    ["context", state.context],
    ["dateFrom", state.dateFrom],
    ["dateTo", state.dateTo],
    ["indentRef", state.indentRef],
    ["supplier", state.supplier],
    ["siteId", state.siteId],
    ["statusMode", state.statusMode],
    ["category", state.category],
    ["item", state.item],
  ] as const) {
    if (value) params.set(key, value);
  }
  return params.toString();
}
