import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Info, X } from "lucide-react";
import type { Party } from "@shared/schema";

type Balance = { id: number; partyId: number | null; balance: number; uom: string };

interface Props {
  balances: Balance[];
  parties: Party[] | undefined;
  material: string;
  testid: string;
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
          <div className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
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
