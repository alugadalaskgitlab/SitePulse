import { useQuery } from "@tanstack/react-query";
import { BITUMEN_DENSITY_KG_PER_LITER, getDeadStockVolume, getVolumeAtDepth } from "@shared/bitumen-dip-chart";
import { useFeatureFlags } from "@/lib/featureFlags";

type TankBalances = {
  tank1: number;
  tank2: number;
  total: number;
  byParty?: Array<{
    partyId: number | null;
    partyName: string | null;
    tank1: number;
    tank2: number;
  }>;
};

type PartyOption = { id: number; name: string };

type Props = {
  plantName: string;
  tankNumber: 1 | 2;
  dipCm?: string;
  showBookSummary?: boolean;
};

function amount(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

export function BitumenTankBookStock({
  plantName,
  tankNumber,
  dipCm = "",
  showBookSummary = false,
}: Props) {
  const { ownCompanyPartyId } = useFeatureFlags();
  const { data: balances } = useQuery<TankBalances>({
    queryKey: ["/api/plant-module/bitumen-tank-balances"],
    queryFn: async () => {
      const response = await fetch("/api/plant-module/bitumen-tank-balances", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load bitumen book stock.");
      return response.json();
    },
    staleTime: 15_000,
  });
  const { data: settings } = useQuery<{ primaryPartyId?: number | null }>({
    queryKey: ["/api/plant-module/plant-settings", plantName],
    queryFn: async () => {
      const response = await fetch(`/api/plant-module/plant-settings/${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load plant settings.");
      return response.json();
    },
    enabled: !!plantName,
    staleTime: 30_000,
  });
  const { data: partyOptions } = useQuery<PartyOption[]>({
    queryKey: ["/api/plant-module/parties"],
    queryFn: async () => {
      const response = await fetch("/api/plant-module/parties", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load parties.");
      return response.json();
    },
    staleTime: 60_000,
  });

  const rawBook = balances ? Number(tankNumber === 1 ? balances.tank1 : balances.tank2) : null;
  const book = rawBook != null && Number.isFinite(rawBook) ? rawBook : null;
  const deadStockMt = getDeadStockVolume() * BITUMEN_DENSITY_KG_PER_LITER / 1000;
  const usableBookMt = book == null ? null : Math.max(0, book - deadStockMt);
  const primaryPartyId = settings?.primaryPartyId == null ? null : Number(settings.primaryPartyId);
  const ownId = ownCompanyPartyId == null ? null : Number(ownCompanyPartyId);
  const partyName = partyOptions?.find(party => Number(party.id) === primaryPartyId)?.name
    ?? balances?.byParty?.find(row => Number(row.partyId) === primaryPartyId)?.partyName
    ?? "Party";
  const balanceFor = (partyId: number | null) => {
    if (partyId == null) return 0;
    const row = balances?.byParty?.find(item => Number(item.partyId) === partyId);
    return Number(tankNumber === 1 ? row?.tank1 ?? 0 : row?.tank2 ?? 0);
  };
  const partyLine = primaryPartyId != null && primaryPartyId !== ownId
    ? `${partyName} ${amount(balanceFor(primaryPartyId))} MT`
    : null;
  const companyLine = ownId != null ? `HLC ${amount(balanceFor(ownId))} MT` : null;
  const allocationLine = [partyLine, companyLine].filter(Boolean).join(" · ");

  let dipDifference: string | null = null;
  const parsedDip = dipCm.trim() === "" ? null : Number(dipCm);
  if (book != null && parsedDip != null && Number.isFinite(parsedDip) && parsedDip >= 0) {
    const dipMt = getVolumeAtDepth(parsedDip) * BITUMEN_DENSITY_KG_PER_LITER / 1000;
    const difference = dipMt - book;
    dipDifference = Math.abs(difference) < 0.0005
      ? `Dip shows ${amount(dipMt)} MT — matches book`
      : `Dip shows ${amount(dipMt)} MT — ${amount(Math.abs(difference))} MT ${difference > 0 ? "more" : "less"} than book`;
  }

  if (!showBookSummary && !dipDifference) return null;

  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid={`bitumen-book-stock-${tankNumber}`}>
      {showBookSummary && (
        <p>
          {book == null ? "Book stock is loading" : `Book stock ${amount(book)} MT (usable ${amount(usableBookMt)} MT · dead stock ${amount(deadStockMt)} MT)`}
          {allocationLine ? ` · ${allocationLine}` : ""}
        </p>
      )}
      {dipDifference && <p data-testid={`bitumen-dip-book-difference-${tankNumber}`}>{dipDifference}</p>}
    </div>
  );
}
