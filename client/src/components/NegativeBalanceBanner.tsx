import { useState } from "react";
  import { Button } from "@/components/ui/button";
  import { Info, X } from "lucide-react";
  import type { Party, PlantMaterial } from "@shared/schema";

  type Balance = { id: number; partyId: number | null; balance: number; uom: string };
  type MultiBalance = Balance & { materialId: number };

  interface Props {
    balances: Balance[];
    parties: Party[] | undefined;
    material: string;
    testid: string;
  }

  interface MultiProps {
    balances: MultiBalance[];
    parties: Party[] | undefined;
    materials: PlantMaterial[] | undefined;
    testid: string;
  }

  export function NegativeBalanceBannerMulti({ balances, parties, materials, testid }: MultiProps) {
    const [dismissed, setDismissed] = useState(false);
    // Bitumen & LDO are physical-tank-tracked — their ledger balance is theoretical only.
    // Exclude them from negative stock alerts entirely.
    const isTankMat = (matId: number) => {
      const mat = materials?.find(m => m.id === matId);
      return mat ? /bitumen|ldo/i.test(mat.name) : false;
    };
    const negs = balances.filter(b => b.balance < -0.0001 && !isTankMat(b.materialId));
    if (dismissed || negs.length === 0) return null;

    const grouped = new Map<number, MultiBalance[]>();
    for (const n of negs) {
      const arr = grouped.get(n.materialId) ?? [];
      arr.push(n);
      grouped.set(n.materialId, arr);
    }
    const materialCount = grouped.size;

    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-3 text-sm" data-testid={testid}>
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-amber-800 dark:text-amber-300">
              Reconciliation Required — book balance is negative for {negs.length} combination{negs.length > 1 ? "s" : ""}
              {materialCount > 1 ? ` across ${materialCount} materials` : ""}.
            </div>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {Array.from(grouped.entries()).map(([matId, rows]) => {
                const mname = materials?.find(m => m.id === matId)?.name || `Material #${matId}`;
                return (
                  <li key={matId} data-testid={`negative-material-${matId}`}>
                    <span className="font-medium">{mname}</span>:{" "}
                    {rows.map((b, idx) => {
                      const pname = parties?.find(p => p.id === b.partyId)?.name || (b.partyId == null ? "PlantCommon" : `Party #${b.partyId}`);
                      return (
                        <span key={b.id} data-testid={`negative-row-${matId}-${b.partyId ?? 'common'}`}>
                          {idx > 0 ? ", " : ""}{pname} ({b.balance.toFixed(3)} {b.uom})
                        </span>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 text-sm text-amber-700/80 dark:text-amber-300/80">
              Book balance is based on theoretical dispatch consumption. Opening stock may not have been entered yet — update it in Material Masters to resolve.
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={() => setDismissed(true)}
            data-testid={`${testid}-dismiss`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  export function NegativeBalanceBanner({ balances, parties, material, testid }: Props) {
    const [dismissed, setDismissed] = useState(false);
    const negs = balances.filter(b => b.balance < -0.0001);
    if (dismissed || negs.length === 0) return null;
    return (
      <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3 text-sm" data-testid={testid}>
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-red-700 dark:text-red-300">
              {material} stock is negative for {negs.length} part{negs.length > 1 ? "ies" : "y"}.
            </div>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {negs.map(b => {
                const pname = parties?.find(p => p.id === b.partyId)?.name || `Party #${b.partyId}`;
                return (
                  <li key={b.id} data-testid={`negative-party-${b.partyId}`}>
                    <span className="font-medium">{pname}</span>: {b.balance.toFixed(3)} {b.uom}
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
              Likely a missing receipt or a dispatch routed to the wrong owner. Check recent receipts, or
              use the admin Stock Reassignment tool to move past entries between parties.
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
            onClick={() => setDismissed(true)}
            data-testid={`${testid}-dismiss`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }
  