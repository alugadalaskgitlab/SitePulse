/**
 * One-time Task #427 runner.
 *
 * All identity checks, idempotency, ledger mutation, and reconciliation live in
 * the secured storage implementation. This script intentionally delegates only.
 */
import { storage } from "../server/storage";

async function main(): Promise<void> {
  console.log("=== Fix #427: 6mm Down ledger gap ===");
  const result = await storage.applyLedgerGapFix427();

  if (result.alreadyApplied) {
    console.log("Fix skipped or already applied; no ledger changes were required.");
  } else {
    console.log(
      `Fix applied: ${result.markersInserted} marker row(s) inserted, ` +
      `${result.hlcEntriesUpdated} HLC ledger row(s) updated.`,
    );
  }
  console.log(
    `Balance reconciliation: ${result.reconciled.updated} updated, ` +
    `${result.reconciled.created} created, ${result.reconciled.errors} error(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fix failed:", error);
    process.exit(1);
  });