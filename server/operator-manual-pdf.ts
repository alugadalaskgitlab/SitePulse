import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const M = 40; // margin
const PAGE_W = 595;
const CONTENT_W = PAGE_W - M * 2;
const COL_RIGHT = M + CONTENT_W;

// Colours
const C_DARK = '#1e2a3a';
const C_SECTION_BG = '#1e3a5f';
const C_TIP_BG = '#e8f4e8';
const C_TIP_BORDER = '#4a8c4a';
const C_WARN_BG = '#fff4e0';
const C_WARN_BORDER = '#c07c00';
const C_TABLE_HEADER = '#dce8f5';
const C_TABLE_ALT = '#f7fafe';
const C_RULE = '#cccccc';

type Doc = PDFKit.PDFDocument;

function sectionHeading(doc: Doc, text: string) {
  doc.addPage();
  doc.rect(M - 4, doc.y, CONTENT_W + 8, 28).fill(C_SECTION_BG);
  doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
    .text(text, M + 4, doc.y - 24, { width: CONTENT_W, lineBreak: false });
  doc.fillColor(C_DARK).moveDown(0.8);
}

function subHeading(doc: Doc, text: string) {
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e3a5f').text(text, M, doc.y, { width: CONTENT_W });
  doc.fontSize(10).font('Helvetica').fillColor(C_DARK);
  doc.moveDown(0.2);
}

function body(doc: Doc, text: string) {
  doc.fontSize(10).font('Helvetica').fillColor(C_DARK).text(text, M, doc.y, { width: CONTENT_W });
}

function numberedSteps(doc: Doc, steps: string[]) {
  steps.forEach((step, i) => {
    const num = `${i + 1}.`;
    const numW = 18;
    const textX = M + numW;
    const textW = CONTENT_W - numW;
    const yBefore = doc.y;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_DARK)
      .text(num, M, doc.y, { width: numW, lineBreak: false });
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
      .text(step, textX, yBefore, { width: textW });
    doc.moveDown(0.15);
  });
}

function bulletPoints(doc: Doc, items: string[]) {
  items.forEach((item) => {
    const bulletX = M + 8;
    const textX = M + 20;
    const textW = CONTENT_W - 20;
    const yBefore = doc.y;
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
      .text('•', bulletX, yBefore, { width: 12, lineBreak: false });
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
      .text(item, textX, yBefore, { width: textW });
    doc.moveDown(0.1);
  });
}

function tipBox(doc: Doc, title: string, text: string) {
  doc.moveDown(0.4);
  const yStart = doc.y;
  // Measure height: title line + body text
  const tmpHeight = 14 + doc.heightOfString(text, { width: CONTENT_W - 24, fontSize: 10 }) + 12;
  doc.rect(M, yStart, CONTENT_W, tmpHeight).fillAndStroke(C_TIP_BG, C_TIP_BORDER);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#2a5a2a')
    .text(`\u2714  ${title}`, M + 8, yStart + 6, { width: CONTENT_W - 16 });
  doc.fontSize(10).font('Helvetica').fillColor('#2a5a2a')
    .text(text, M + 8, doc.y + 1, { width: CONTENT_W - 16 });
  doc.y = yStart + tmpHeight + 4;
  doc.fillColor(C_DARK);
  doc.moveDown(0.3);
}

function warnBox(doc: Doc, title: string, text: string) {
  doc.moveDown(0.4);
  const yStart = doc.y;
  const tmpHeight = 14 + doc.heightOfString(text, { width: CONTENT_W - 24, fontSize: 10 }) + 12;
  doc.rect(M, yStart, CONTENT_W, tmpHeight).fillAndStroke(C_WARN_BG, C_WARN_BORDER);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#7a4500')
    .text(`\u26a0  ${title}`, M + 8, yStart + 6, { width: CONTENT_W - 16 });
  doc.fontSize(10).font('Helvetica').fillColor('#7a4500')
    .text(text, M + 8, doc.y + 1, { width: CONTENT_W - 16 });
  doc.y = yStart + tmpHeight + 4;
  doc.fillColor(C_DARK);
  doc.moveDown(0.3);
}

function rule(doc: Doc) {
  doc.moveDown(0.4);
  doc.moveTo(M, doc.y).lineTo(COL_RIGHT, doc.y).strokeColor(C_RULE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

// Simple table renderer
// cols: [{label, width, align?}]; rows: string[][]
function table(doc: Doc, cols: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>, rows: string[][], title?: string) {
  if (title) {
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f').text(title, M, doc.y);
    doc.moveDown(0.2);
  }

  const ROW_PAD = 5;

  const drawRow = (cells: string[], bg: string, bold: boolean) => {
    let x = M;
    // Compute max height for this row
    let maxH = 0;
    cells.forEach((cell, ci) => {
      const h = doc.heightOfString(cell, { width: cols[ci].width - 8, fontSize: 9 });
      if (h > maxH) maxH = h;
    });
    const rowH = maxH + ROW_PAD * 2;

    // Background
    doc.rect(M, doc.y, CONTENT_W, rowH).fill(bg);

    // Cell text
    const yText = doc.y + ROW_PAD;
    cells.forEach((cell, ci) => {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(C_DARK)
        .text(cell, x + 4, yText, { width: cols[ci].width - 8, align: cols[ci].align || 'left', lineBreak: true });
      x += cols[ci].width;
    });

    doc.y = doc.y + rowH;
    // Bottom border
    doc.moveTo(M, doc.y).lineTo(COL_RIGHT, doc.y).strokeColor(C_RULE).lineWidth(0.3).stroke();
  };

  // Header row
  drawRow(cols.map(c => c.label), C_TABLE_HEADER, true);
  // Data rows
  rows.forEach((row, i) => {
    drawRow(row, i % 2 === 0 ? '#ffffff' : C_TABLE_ALT, false);
  });

  doc.moveDown(0.4);
  doc.fillColor(C_DARK);
}

export function pipeOperatorManualPdf(stream: NodeJS.WritableStream, plantName?: string, logoFile?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: {
      Title: 'SiteLog Plant Operator Guide',
      Author: 'SiteLog System',
      Subject: 'Plant Operations — Heating Sessions, Shift Log, LDO Reconciliation',
    }});

    doc.pipe(stream);
    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);

    // ── TITLE PAGE ─────────────────────────────────────────────────────────
    try {
      const _logoCandidate = logoFile
        ? path.join(process.cwd(), 'client', 'public', logoFile)
        : path.join(process.cwd(), 'attached_assets', '1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg');
      if (fs.existsSync(_logoCandidate)) {
        doc.image(_logoCandidate, PAGE_W / 2 - 36, 90, { width: 72, height: 72 });
      }
    } catch { /* ignore if logo missing */ }

    doc.fontSize(24).font('Helvetica-Bold').fillColor(C_SECTION_BG)
      .text('SiteLog', M, 185, { width: CONTENT_W, align: 'center' });
    doc.fontSize(18).font('Helvetica').fillColor(C_DARK)
      .text('Plant Operator Guide', M, doc.y + 4, { width: CONTENT_W, align: 'center' });

    doc.moveDown(2);
    doc.rect(M, doc.y, CONTENT_W, 1).fill(C_RULE);
    doc.moveDown(1.5);

    doc.fontSize(12).font('Helvetica').fillColor('#555555')
      .text(plantName || 'SitePulse', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#777777')
      .text('For use by plant operators and supervisors', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#999999')
      .text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, M, doc.y, { width: CONTENT_W, align: 'center' });

    doc.moveDown(3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_DARK)
      .text('CONTENTS', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.8);

    const toc = [
      ['Section 1', 'Heating Sessions — Step-by-Step'],
      ['Section 2', 'Plant Shift Log — Step-by-Step'],
      ['Section 3', 'Matching Shift Log with Heating Sessions'],
      ['Section 4', 'Linking the Diesel Generator (DG)'],
      ['Section 5', 'Understanding and Fixing LDO Mismatches'],
      ['Section 6', 'Daily Routine Quick Reference'],
    ];
    toc.forEach(([sec, title]) => {
      const yBefore = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG)
        .text(sec, M + 20, yBefore, { width: 70, lineBreak: false });
      doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
        .text(title, M + 95, yBefore, { width: CONTENT_W - 95 });
      doc.moveDown(0.4);
    });

    // ── SECTION 1 — HEATING SESSIONS ───────────────────────────────────────
    sectionHeading(doc, 'Section 1 — Heating Sessions: Step-by-Step');

    body(doc, 'A heating session records the fuel your boiler burns while keeping the bitumen tanks hot. You will typically open one session the night before production and close it the next morning. A daytime session can also be logged if the boiler runs during production hours.');
    doc.moveDown(0.6);

    subHeading(doc, 'Before You Start — What to Gather');
    bulletPoints(doc, [
      'Look at the physical fuel meter gauge on the boiler and note the number showing.',
      'Decide the session type: Night Pre-heat (overnight, before production) or Daytime Run (during production).',
      'Know the staff name and role of the person responsible for this session.',
    ]);

    doc.moveDown(0.5);
    subHeading(doc, 'Opening a Session (Start of Heating)');
    body(doc, 'Go to: Plant → Heating Sessions → tap "New Session"');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Date — today\'s date is pre-filled. Change it only if you are logging for a previous day.',
      'Session Type — choose "Night Pre-heat" if starting the boiler overnight to prepare for next-day production. Choose "Daytime Run" if the boiler is running during active production.',
      'Staff Name and Staff Role — enter the operator\'s name and their role (e.g. Boiler Operator).',
      'Start Time — enter the exact time you switched the boiler on (24-hr format, e.g. 22:00).',
      'Boiler Fuel Meter — Opening Reading — the app may automatically fill this from the previous session\'s closing reading. If the number looks wrong, overwrite it with the actual number shown on the boiler meter right now.',
      'Hot-Oil Temperatures (optional) — enter forward and return temperatures if your supervisor requires them.',
      'Bitumen Tank Temperatures — enter the starting temperatures of Tank 1 and Tank 2 (in °C).',
      'If the generator (DG) is running for this session, see Section 4 before saving.',
      'Tap Save — the session is now open and recorded.',
    ]);

    tipBox(doc, 'Auto-fill tip',
      'The opening meter is filled automatically from the last closing reading. Always check it against the physical meter before saving — if someone manually reset the meter or there is a gap, correct the number.');

    doc.moveDown(0.4);
    subHeading(doc, 'Closing a Session (End of Heating)');
    body(doc, 'Go to: Plant → Heating Sessions → find today\'s open session → tap Edit');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'End Time — enter the time you switched the boiler off.',
      'Boiler Fuel Meter — Closing Reading — go to the boiler meter and write the number showing right now.',
      'Bitumen Tank Temperatures — Closing — enter the temperature of each bitumen tank at the end of the session.',
      'If the DG was running (inline), fill in the closing hour-meter reading and closing diesel level.',
      'Tap Save — the session is now closed and finalised.',
    ]);

    warnBox(doc, 'Closing meter must be higher than opening',
      'If the closing reading is lower than the opening reading, the system will not save. Check that you have not mixed up the two fields. The meter on the boiler always increases — it never resets unless physically replaced.');

    doc.moveDown(0.4);
    subHeading(doc, 'Overnight Sessions (Evening Start, Morning End)');
    body(doc, 'Many pre-heat sessions start at night and end the following morning. The system handles this automatically — there is nothing special you need to do.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Enter the start time as the evening time (e.g. 22:00) — this is on the night the heating began.',
      'Enter the end time as the morning time (e.g. 05:30) — even though it is technically the next calendar day.',
      'The session date should be the date when heating started (the night before).',
      'The system sees that the end time is earlier in the day than the start time and adds 24 hours automatically to calculate the correct duration.',
    ]);

    tipBox(doc, 'Example',
      'If you start on 14 April at 22:00 and finish on 15 April at 05:30, set the date to 14 April, Start Time to 22:00, End Time to 05:30. The system will calculate 7.5 hours correctly.');

    doc.moveDown(0.4);
    subHeading(doc, 'What Can Block Saving');
    table(doc,
      [{ label: 'Error message', width: 200 }, { label: 'What it means', width: 175 }, { label: 'How to fix it', width: 140 }],
      [
        ['Closing meter is lower than opening meter', 'You have entered the readings the wrong way around', 'Swap the two meter values so Opening < Closing'],
        ['Closing diesel exceeds opening + issued', 'The closing diesel level is higher than it should be given what was added', 'Re-check the opening, issued, and closing diesel values'],
        ['Closing hour-meter is lower than opening', 'Same issue for the DG hour-meter', 'Swap or correct the hour-meter readings'],
      ]
    );

    // ── SECTION 2 — PLANT SHIFT LOG ────────────────────────────────────────
    sectionHeading(doc, 'Section 2 — Plant Shift Log: Step-by-Step');

    body(doc, 'The Plant Shift Log is your main daily record for production. It captures fuel levels, bitumen stock, who worked, and any stoppages. There is ONE shift log per calendar date per plant — you add to it throughout the day rather than creating a new one for each shift.');
    doc.moveDown(0.4);

    warnBox(doc, 'One log per date',
      'The system only allows one shift log per plant per date. If production runs both a day and a night shift, use the same log — mark the Shift Code as "Day" or "Night" to indicate the primary shift. You cannot create two separate logs for the same date.');

    doc.moveDown(0.4);
    subHeading(doc, 'Start of Shift — Opening Entries');
    body(doc, 'Go to: Plant → Shift Log → tap "New Entry" (or tap on today\'s date if one already exists)');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Date and Plant Name — confirm the correct date and plant.',
      'Shift Code — choose Day or Night to indicate which shift is running.',
      'Operator Name and Supervisor Name — enter the names of the people in charge.',
      'Weather and Ambient Temperature — note the weather condition and temperature at the start of shift.',
      'Bitumen Stock — Opening Dip (cm) for Tank 1 and Tank 2 — take the dip stick measurement from each bitumen tank and enter the centimetre reading. The app will show you the approximate Metric Tons (MT) beside the field — this is for reference only.',
      'Boiler Fuel Meter — Opening (if visible): enter the boiler fuel meter reading. This field only appears if the "Boiler runs during production" option is switched on in plant settings.',
      'Dryer Fuel Meter — Opening: enter the opening reading of the dryer fuel flow meter.',
      '"Which tank feeds the Dryer?" — choose Boiler Tank or Dryer Tank. This tells the system which fuel storage tank the dryer is drawing from.',
      'Tap Save — come back at the end of the shift to complete the log.',
    ]);

    tipBox(doc, 'Dip reading tip',
      'Take the dip reading before production starts (Tank 1 and Tank 2). Dip in centimetres only — not in MT. The app converts it for you.');

    doc.moveDown(0.4);
    subHeading(doc, 'End of Shift — Closing Entries');
    body(doc, 'Go to: Plant → Shift Log → tap on today\'s entry → tap Edit');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Plant Start Time and Plant Stop Time — the actual times production began and ended.',
      'Bitumen Stock — Closing Dip (cm) for Tank 1 and Tank 2 — take the dip stick measurement again from each tank.',
      'Boiler Fuel Meter — Closing (if applicable): read and enter the current boiler meter reading.',
      'Dryer Fuel Meter — Closing: read and enter the current dryer meter reading.',
      'Idle Events — for every stoppage during the shift, tap "+ Add Idle Event" and enter the start time, end time, and reason (e.g. Material Shortage, Mechanical Breakdown, Power Failure). Add one entry per stoppage.',
      'Manpower — tap "+ Add Worker" and fill in Name, Contractor, Category (Skilled / Unskilled), and Gender for every person who worked during the shift.',
      'Tap Save and Finalise — the log is now locked. The data is considered verified. Only a Manager or Admin PIN can unlock it for further editing after this.',
    ]);

    warnBox(doc, 'Save and Finalise is final',
      'Once you tap Save and Finalise the log is locked. Only a supervisor or admin with a PIN can re-open it. Make sure all readings, idle events, and manpower entries are complete before you finalise.');

    // ── SECTION 3 — MATCHING ───────────────────────────────────────────────
    sectionHeading(doc, 'Section 3 — Matching Shift Log with Heating Sessions');

    body(doc, 'The boiler fuel meter movement in the shift log should match the total fuel recorded across all heating sessions for the same day. The system checks this automatically and shows the result on the Heating Sessions page.');
    doc.moveDown(0.5);

    subHeading(doc, 'How to Check the Match');
    numberedSteps(doc, [
      'Go to Plant → Heating Sessions.',
      'Find the row for today\'s date. The row shows a small coloured badge.',
      'GREEN badge — the session totals and shift log agree within ±5 litres. No action needed.',
      'RED badge — there is a gap larger than 5 litres. See Section 5 to investigate and fix.',
    ]);

    doc.moveDown(0.4);
    subHeading(doc, 'Dryer Source — Must Be Consistent');
    body(doc, 'Each heating session records which tank feeds the dryer. The shift log also records this. They must agree. If they do not, an alert appears on the Heating Sessions page.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Open the heating session that shows a different tank choice.',
      'Change the "Dryer fed from" field to match what is in the shift log.',
      'Save the session — the alert will clear.',
    ]);

    tipBox(doc, 'When to change the shift log instead',
      'If the heating sessions are all correct and the shift log has the wrong tank, edit the shift log "Which tank feeds the Dryer?" field and save. Only one side needs to be corrected.');

    // ── SECTION 4 — DG LINKING ─────────────────────────────────────────────
    sectionHeading(doc, 'Section 4 — Linking the Diesel Generator (DG)');

    body(doc, 'When the diesel generator runs during a heating session, its fuel usage must be recorded. There are two ways to do this depending on whether the DG run is exclusive to that session or was shared with other plant operations.');
    doc.moveDown(0.5);

    subHeading(doc, 'Option A — Inline Entry (DG ran only for this session)');
    body(doc, 'Use this when the generator started and stopped specifically to support this heating session.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'While creating or editing a heating session, find the "Was the DG running?" toggle and switch it to Yes.',
      'Select "Inline — enter details here".',
      'Enter the Generator name (select from the list).',
      'Enter DG Start Time and DG End Time.',
      'Enter the DG Opening Hour-Meter reading (the number on the DG\'s hours counter at the start).',
      'Enter the DG Closing Hour-Meter reading (the number at the end).',
      'Enter Opening Diesel Level (litres in the DG fuel tank at start).',
      'If you added fuel during the session, enter the amount in Diesel Issued.',
      'Enter Closing Diesel Level (litres at the end).',
      'Save the heating session — the DG run is recorded automatically.',
    ]);

    doc.moveDown(0.4);
    subHeading(doc, 'Option B — Link to an Existing DG Log');
    body(doc, 'Use this when someone already recorded the DG run separately on the Generator Logs page, or when the same generator run also powered other plant operations.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Switch "Was the DG running?" to Yes.',
      'Select "Link — select existing DG run".',
      'A list of DG runs recorded for that date appears. Select the correct one from the list.',
      'Save the session — the run is now linked. The same DG run will not be double-counted.',
    ]);

    warnBox(doc, 'A linked DG run can only be attached to one session',
      'If you try to link a DG run that is already linked to another heating session, the system will warn you. In that case, use Inline entry instead, or create a new standalone DG log for the hours that overlap with your session.');

    doc.moveDown(0.4);
    subHeading(doc, 'Standalone DG Log (Not Tied to Any Session)');
    body(doc, 'If the generator ran for general plant power and was not specifically for bitumen heating, create a standalone log:');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to: Plant → Generator Logs → tap "New Entry".',
      'Select the Generator name.',
      'Enter Date, Start Time, End Time.',
      'Enter Opening Hour-Meter and Closing Hour-Meter readings.',
      'Enter Opening Diesel, any Diesel Issued during the run, and Closing Diesel.',
      'Tap Save.',
    ]);

    tipBox(doc, 'Generator Logs page location',
      'From the Plant Dashboard, go to the Operations tab and scroll down to find "Generator Diesel Tracking". This is where standalone DG entries are created and listed.');

    // ── SECTION 5 — LDO MISMATCHES ────────────────────────────────────────
    sectionHeading(doc, 'Section 5 — Understanding and Fixing LDO Mismatches');

    body(doc, 'The system compares three separate records of boiler fuel consumption to detect errors:');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'The total fuel from all heating sessions for the day.',
      'The boiler meter movement in the shift log (opening minus closing).',
      'The automatic fuel ledger entries generated when sessions are saved.',
    ]);
    doc.moveDown(0.3);
    body(doc, 'If these three do not agree, a mismatch alert appears. Go to: Plant → LDO Reconciliation to investigate.');
    doc.moveDown(0.5);

    subHeading(doc, 'What the Three Comparison Values Mean');
    table(doc,
      [{ label: 'Comparison', width: 160 }, { label: 'What it checks', width: 185 }, { label: 'Common cause if RED', width: 170 }],
      [
        [
          'Sessions vs Shift Log',
          'Do all heating session fuel totals add up to what the shift log meter movement shows?',
          'A session was deleted after the shift log was saved, or a meter reading was typed wrong in one place.',
        ],
        [
          'Sessions vs Ledger',
          'Do session fuel totals match the automatic fuel ledger entries?',
          'Leftover ledger entries from a deleted session (called "orphaned entries").',
        ],
        [
          'Shift Log vs Ledger',
          'Does the shift log meter match the ledger entries tagged to that shift?',
          'Same cause — orphaned ledger entries or a typo in the shift log meter.',
        ],
      ]
    );

    body(doc, '±5 litres is acceptable — minor differences from meter rounding show in green. More than 5 litres shows in red and must be investigated.');
    doc.moveDown(0.6);

    subHeading(doc, 'How to Fix Each Type of Mismatch');

    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG).text('When "Sessions vs Shift Log" is RED:', M, doc.y);
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK).moveDown(0.2);
    numberedSteps(doc, [
      'Check if a heating session was deleted. If a session was removed after the shift log was saved, the session total went down but the shift log meter stayed the same. Re-add the missing session with the correct meter readings.',
      'Check for a typo. Open each heating session for that date and compare opening and closing meters. Compare these against the shift log boiler meter opening and closing. Correct any obvious mistake.',
      'If none of the above, edit the shift log boiler meter closing reading to match the actual final meter reading.',
    ]);

    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG).text('When "Orphaned entries" alert appears:', M, doc.y);
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK).moveDown(0.2);
    body(doc, 'Orphaned entries are automatic fuel ledger rows that were created when a session was saved, but the session itself was later deleted. The ledger row remains even though the session is gone.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Read the alert carefully — it tells you how many orphaned rows exist.',
      'If you are sure the corresponding sessions are gone and will not be recreated, an admin can tap "Remove Orphaned Entries" to delete the leftover rows.',
      'If you are not sure, ask your supervisor before removing. Removing entries cannot be undone.',
    ]);

    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG).text('When "Dryer-source mismatch" alert appears:', M, doc.y);
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK).moveDown(0.2);
    numberedSteps(doc, [
      'Go to Plant → Heating Sessions → tap on the date with the alert.',
      'Find the session that shows a different dryer source from the shift log.',
      'Open that session, change "Dryer fed from" to match the shift log, and save.',
      'The mismatch alert will clear.',
    ]);

    tipBox(doc, 'Quick rule of thumb',
      'If the mismatch appeared after deleting a session — check for orphaned entries. If the mismatch appeared after editing a meter reading — check the Sessions vs Shift Log comparison. If the dryer-source badge appears — fix the session or shift log "which tank feeds the dryer" field so both say the same thing.');

    // ── SECTION 6 — DAILY ROUTINE ──────────────────────────────────────────
    sectionHeading(doc, 'Section 6 — Daily Routine Quick Reference');

    body(doc, 'Use this table as a quick checklist for each shift. Print and post it near the plant control room.');
    doc.moveDown(0.5);

    table(doc,
      [
        { label: 'When', width: 90 },
        { label: 'What to do', width: 195 },
        { label: 'Where in SiteLog', width: 230 },
      ],
      [
        [
          'Night (~10 PM)',
          'Start overnight pre-heat session.\nRecord opening boiler meter.\nConnect DG if running.',
          'Plant → Heating Sessions → New Session',
        ],
        [
          'Morning (~5–6 AM)',
          'Close the overnight session.\nRecord closing meter and tank temperatures.',
          'Plant → Heating Sessions → Edit the open session',
        ],
        [
          'Start of Day Shift',
          'Open the shift log.\nEnter opening dips for both bitumen tanks.\nEnter opening LDO meter readings.\nSet which tank feeds the dryer.',
          'Plant → Shift Log → New Entry (or tap today\'s date)',
        ],
        [
          'During the day',
          'Record any idle events as they happen (stoppages, breakdowns).\nAdd any daytime heating sessions if the boiler runs again.',
          'Plant → Shift Log → Edit\nPlant → Heating Sessions → New Session',
        ],
        [
          'End of Day (~5 PM)',
          'Close the shift log.\nEnter closing dips for bitumen tanks.\nEnter closing LDO meter readings.\nAdd all manpower.\nSave & Finalise.',
          'Plant → Shift Log → Edit → Save & Finalise',
        ],
        [
          'After finalising',
          'Check reconciliation.\nConfirm "Sessions vs Shift Log" is green (within ±5 litres).',
          'Plant → Heating Sessions (look at today\'s row)',
        ],
        [
          'If any RED badge',
          'Read Section 5 of this guide.\nInvestigate and fix the mismatch before the next shift.',
          'Plant → LDO Reconciliation',
        ],
      ]
    );

    doc.moveDown(0.8);
    rule(doc);

    subHeading(doc, 'When to Ask for Help');
    bulletPoints(doc, [
      'You cannot re-edit a finalised shift log — contact your supervisor or admin for a PIN.',
      'A mismatch alert does not clear after your corrections — contact your supervisor; the system may have orphaned ledger entries that only an admin can remove.',
      'The session will not save after repeated attempts — take a photo of the error message and show it to the admin.',
      'You accidentally recorded two sessions for the same period — delete the duplicate (requires permission) and check that the remaining session has the correct meter readings.',
    ]);

    doc.moveDown(0.8);
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text(`SiteLog Plant Operator Guide — ${plantName || 'SitePulse'}`, M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.fontSize(9).fillColor('#aaaaaa')
      .text(`Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, M, doc.y + 2, { width: CONTENT_W, align: 'center' });

    // Add page numbers
    const pages: { start: number; count: number } = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      const pageNum = i + 1;
      doc.fontSize(8).font('Helvetica').fillColor('#aaaaaa')
        .text(`Page ${pageNum} of ${pages.count}`, M, 812, { width: CONTENT_W, align: 'right' });
    }

    doc.end();
  });
}
