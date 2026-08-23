/**
 * One-off data backfill for legacy work_program_bars with NULL calendar dates,
 * run against the database given by DATABASE_URL. Uses the SAME shared helper
 * (deriveMissingBarCalendarDates) as the startup backfill — never a second
 * formula. Fills NULL start_date/end_date only; never overwrites non-null
 * values, never touches months/qty/baseline/history. Idempotent.
 *
 * Usage: npx tsx scripts/backfill-calendar-dates-heliumdb.ts
 */
import pg from "pg";
import { deriveMissingBarCalendarDates } from "../shared/programmeRevision";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // to_char keeps every date as a plain YYYY-MM-DD string — pg would
    // otherwise hand back JS Date objects that don't survive slice(0,10).
    const { rows } = await client.query(`
      SELECT b.id, b.start_month, b.end_month,
             to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
             to_char(b.end_date, 'YYYY-MM-DD') AS end_date,
             to_char(p.start_date, 'YYYY-MM-DD') AS project_start
      FROM work_program_bars b
      JOIN boq_projects p ON p.id = b.boq_project_id
      WHERE b.start_date IS NULL OR b.end_date IS NULL
      ORDER BY b.id`);
    let updated = 0;
    const skipped: Array<{ id: number; reason: string }> = [];
    for (const row of rows) {
      const result = deriveMissingBarCalendarDates(
        {
          startMonth: row.start_month == null ? null : Number(row.start_month),
          endMonth: row.end_month == null ? null : Number(row.end_month),
          startDate: row.start_date,
          endDate: row.end_date,
        },
        row.project_start,
      );
      if (result.action === "skip") {
        skipped.push({ id: row.id, reason: result.reason });
        continue;
      }
      // COALESCE keeps each column independently NULL-preserving even if a
      // concurrent write committed one date between our read and this update.
      await client.query(
        `UPDATE work_program_bars
         SET start_date = COALESCE(start_date, $1), end_date = COALESCE(end_date, $2)
         WHERE id = $3 AND (start_date IS NULL OR end_date IS NULL)`,
        [result.startDate, result.endDate, row.id],
      );
      updated++;
    }
    console.log(`Backfill complete — candidates: ${rows.length}, filled: ${updated}, skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  skipped bar ${s.id} — ${s.reason}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
