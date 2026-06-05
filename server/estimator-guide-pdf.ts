import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const M = 40;
const PAGE_W = 595;
const CONTENT_W = PAGE_W - M * 2;
const COL_RIGHT = M + CONTENT_W;

const C_DARK = '#1e2a3a';
const C_SECTION_BG = '#1e3a5f';
const C_CHAPTER_BG = '#0f2540';
const C_TIP_BG = '#e8f4e8';
const C_TIP_BORDER = '#4a8c4a';
const C_WARN_BG = '#fff4e0';
const C_WARN_BORDER = '#c07c00';
const C_INFO_BG = '#e8f0fd';
const C_INFO_BORDER = '#3a6fc4';
const C_TABLE_HEADER = '#dce8f5';
const C_TABLE_ALT = '#f7fafe';
const C_RULE = '#cccccc';
const C_FLOW_BOX = '#1e3a5f';
const C_FLOW_BOX_LIGHT = '#dce8f5';
const C_FLOW_ARROW = '#555555';

type Doc = PDFKit.PDFDocument;

function chapterHeading(doc: Doc, text: string) {
  doc.addPage();
  const bannerH = 42;
  doc.rect(0, doc.y, PAGE_W, bannerH).fill(C_CHAPTER_BG);
  doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold')
    .text(text, M, doc.y - bannerH + 13, { width: CONTENT_W });
  doc.fillColor(C_DARK).moveDown(1.2);
}

function sectionHeading(doc: Doc, text: string) {
  doc.moveDown(0.6);
  doc.rect(M - 4, doc.y, CONTENT_W + 8, 26).fill(C_SECTION_BG);
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
    .text(text, M + 4, doc.y - 20, { width: CONTENT_W, lineBreak: false });
  doc.fillColor(C_DARK).moveDown(0.8);
}

function subHeading(doc: Doc, text: string) {
  doc.moveDown(0.4);
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
      .text('\u2022', bulletX, yBefore, { width: 12, lineBreak: false });
    doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
      .text(item, textX, yBefore, { width: textW });
    doc.moveDown(0.12);
  });
}

function tipBox(doc: Doc, title: string, text: string) {
  doc.moveDown(0.4);
  const yStart = doc.y;
  const tmpHeight = 14 + doc.fontSize(10).heightOfString(text, { width: CONTENT_W - 24 }) + 14;
  doc.rect(M, yStart, CONTENT_W, tmpHeight).fillAndStroke(C_TIP_BG, C_TIP_BORDER);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#2a5a2a')
    .text(`\u2714  ${title}`, M + 8, yStart + 6, { width: CONTENT_W - 16 });
  doc.fontSize(10).font('Helvetica').fillColor('#2a5a2a')
    .text(text, M + 8, doc.y + 1, { width: CONTENT_W - 16 });
  doc.y = yStart + tmpHeight + 4;
  doc.fillColor(C_DARK).moveDown(0.3);
}

function warnBox(doc: Doc, title: string, text: string) {
  doc.moveDown(0.4);
  const yStart = doc.y;
  const tmpHeight = 14 + doc.fontSize(10).heightOfString(text, { width: CONTENT_W - 24 }) + 14;
  doc.rect(M, yStart, CONTENT_W, tmpHeight).fillAndStroke(C_WARN_BG, C_WARN_BORDER);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#7a4500')
    .text(`\u26a0  ${title}`, M + 8, yStart + 6, { width: CONTENT_W - 16 });
  doc.fontSize(10).font('Helvetica').fillColor('#7a4500')
    .text(text, M + 8, doc.y + 1, { width: CONTENT_W - 16 });
  doc.y = yStart + tmpHeight + 4;
  doc.fillColor(C_DARK).moveDown(0.3);
}

function infoBox(doc: Doc, title: string, text: string) {
  doc.moveDown(0.4);
  const yStart = doc.y;
  const tmpHeight = 14 + doc.fontSize(10).heightOfString(text, { width: CONTENT_W - 24 }) + 14;
  doc.rect(M, yStart, CONTENT_W, tmpHeight).fillAndStroke(C_INFO_BG, C_INFO_BORDER);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a3a7a')
    .text(`\u2139  ${title}`, M + 8, yStart + 6, { width: CONTENT_W - 16 });
  doc.fontSize(10).font('Helvetica').fillColor('#1a3a7a')
    .text(text, M + 8, doc.y + 1, { width: CONTENT_W - 16 });
  doc.y = yStart + tmpHeight + 4;
  doc.fillColor(C_DARK).moveDown(0.3);
}

function rule(doc: Doc) {
  doc.moveDown(0.4);
  doc.moveTo(M, doc.y).lineTo(COL_RIGHT, doc.y).strokeColor(C_RULE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

function table(
  doc: Doc,
  cols: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>,
  rows: string[][],
  title?: string,
) {
  if (title) {
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f').text(title, M, doc.y);
    doc.moveDown(0.2);
  }
  const ROW_PAD = 5;
  const drawRow = (cells: string[], bg: string, bold: boolean) => {
    let x = M;
    let maxH = 0;
    cells.forEach((cell, ci) => {
      const h = doc.fontSize(9).heightOfString(cell, { width: cols[ci].width - 8 });
      if (h > maxH) maxH = h;
    });
    const rowH = maxH + ROW_PAD * 2;
    doc.rect(M, doc.y, CONTENT_W, rowH).fill(bg);
    const yText = doc.y + ROW_PAD;
    cells.forEach((cell, ci) => {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(C_DARK)
        .text(cell, x + 4, yText, { width: cols[ci].width - 8, align: cols[ci].align || 'left', lineBreak: true });
      x += cols[ci].width;
    });
    doc.y = doc.y + rowH;
    doc.moveTo(M, doc.y).lineTo(COL_RIGHT, doc.y).strokeColor(C_RULE).lineWidth(0.3).stroke();
  };
  drawRow(cols.map(c => c.label), C_TABLE_HEADER, true);
  rows.forEach((row, i) => drawRow(row, i % 2 === 0 ? '#ffffff' : C_TABLE_ALT, false));
  doc.moveDown(0.4);
  doc.fillColor(C_DARK);
}

function flowChart(doc: Doc, steps: Array<{ label: string; sub?: string; decision?: boolean }>, x?: number, w?: number) {
  const chartX = x ?? M + 80;
  const chartW = w ?? CONTENT_W - 160;
  const boxH = 28;
  const gapH = 18;
  const arrowLen = 12;
  doc.moveDown(0.4);

  steps.forEach((step, i) => {
    const yTop = doc.y;
    const labelH = step.sub
      ? doc.fontSize(9).heightOfString(step.label, { width: chartW - 16 }) +
        doc.fontSize(8).heightOfString(step.sub, { width: chartW - 16 }) + 10
      : Math.max(boxH, doc.fontSize(9).heightOfString(step.label, { width: chartW - 16 }) + 10);

    if (step.decision) {
      doc.rect(chartX, yTop, chartW, labelH).fillAndStroke(C_WARN_BG, C_WARN_BORDER);
    } else {
      doc.rect(chartX, yTop, chartW, labelH).fillAndStroke(C_FLOW_BOX_LIGHT, C_FLOW_BOX);
    }

    const textY = yTop + (step.sub ? 5 : (labelH - 9) / 2);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C_DARK)
      .text(step.label, chartX + 8, textY, { width: chartW - 16, align: 'center', lineBreak: false });
    if (step.sub) {
      doc.fontSize(8).font('Helvetica').fillColor('#555555')
        .text(step.sub, chartX + 8, doc.y + 1, { width: chartW - 16, align: 'center' });
    }

    doc.y = yTop + labelH;

    if (i < steps.length - 1) {
      const arrowX = chartX + chartW / 2;
      const arrowY1 = doc.y;
      const arrowY2 = doc.y + gapH - 4;
      doc.moveTo(arrowX, arrowY1)
        .lineTo(arrowX, arrowY2)
        .strokeColor(C_FLOW_ARROW).lineWidth(1).stroke();
      doc.moveTo(arrowX - 4, arrowY2 - arrowLen / 2)
        .lineTo(arrowX, arrowY2 + 2)
        .lineTo(arrowX + 4, arrowY2 - arrowLen / 2)
        .fillAndStroke(C_FLOW_ARROW, C_FLOW_ARROW);
      doc.y = doc.y + gapH;
    }
  });

  doc.fillColor(C_DARK).moveDown(0.6);
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────

export function pipeEstimatorGuidePdf(stream: NodeJS.WritableStream, plantName?: string, logoFile?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: M, bufferPages: true, info: {
        Title: 'SiteLog Estimator Portal Guide',
        Author: 'SiteLog System',
        Subject: 'Estimator Hub, Rate Calculators & QTO/BOQ Reference — Admin & Estimator Edition',
      },
    });

    doc.pipe(stream);
    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);

    const plant = plantName || 'SitePulse';
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    // ════════════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ════════════════════════════════════════════════════════════════════════
    try {
      const _logoCandidate = logoFile
        ? path.join(process.cwd(), 'client', 'public', logoFile)
        : path.join(process.cwd(), 'attached_assets', '1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg');
      if (fs.existsSync(_logoCandidate)) {
        doc.image(_logoCandidate, PAGE_W / 2 - 36, 80, { width: 72, height: 72 });
      }
    } catch { /* ignore */ }

    doc.fontSize(26).font('Helvetica-Bold').fillColor(C_CHAPTER_BG)
      .text('SiteLog', M, 175, { width: CONTENT_W, align: 'center' });
    doc.fontSize(17).font('Helvetica-Bold').fillColor(C_SECTION_BG)
      .text('Estimator Portal Guide', M, doc.y + 5, { width: CONTENT_W, align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#444444')
      .text('Estimator Hub · Bituminous Mix Calculator · Concrete Rate Calculator · QTO/BOQ', M, doc.y + 6, { width: CONTENT_W, align: 'center' });

    doc.moveDown(1.5);
    doc.rect(M, doc.y, CONTENT_W, 1).fill(C_RULE);
    doc.moveDown(1.2);

    doc.fontSize(12).font('Helvetica').fillColor('#555555')
      .text(plant, M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#777777')
      .text('For use by Admins and Estimators', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#999999')
      .text(`Generated: ${today}`, M, doc.y, { width: CONTENT_W, align: 'center' });

    doc.moveDown(2.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C_DARK)
      .text('CONTENTS', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.8);

    const toc: [string, string][] = [
      ['Chapter 1', 'Estimator Hub — Login, Roles & Navigation'],
      ['Chapter 2', 'Bituminous Mix Rate Calculator'],
      ['Chapter 3', 'Concrete Rate Calculator (v1 & v2)'],
      ['Chapter 4', 'QTO/BOQ Tab — Quantities, Volumes & Excel Import'],
    ];

    toc.forEach(([ch, title]) => {
      const yBefore = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG)
        .text(ch, M + 20, yBefore, { width: 80, lineBreak: false });
      doc.fontSize(10).font('Helvetica').fillColor(C_DARK)
        .text(title, M + 105, yBefore, { width: CONTENT_W - 105 });
      doc.moveDown(0.45);
    });

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 1 — ESTIMATOR HUB
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 1 — Estimator Hub: Login, Roles & Navigation');

    body(doc, 'The Estimator Hub is a dedicated portal, separate from the main SiteLog Plant Module, for creating and managing cost estimates. It can be accessed independently by estimators without needing full plant module access. Two roles exist: Admin and Manager.');
    doc.moveDown(0.5);

    sectionHeading(doc, '1.1 — Accessing the Estimator Hub');
    numberedSteps(doc, [
      'From the main SiteLog home dashboard, tap the "Estimate Manager" card or navigate to /estimator-hub directly.',
      'If not already authenticated, you will be redirected to the Estimator Login page.',
      'Enter your Estimator credentials (provided by the Admin) and tap Sign In.',
      'On successful login you land on the Estimator Hub home, showing all available calculator tools.',
    ]);
    tipBox(doc, 'Direct URL access',
      'Estimators can bookmark /estimator-hub directly. If the session has expired, the app will redirect to the login page and return you to the hub after sign-in.');

    sectionHeading(doc, '1.2 — Estimator Roles');
    table(doc,
      [{ label: 'Role', width: 80 }, { label: 'What they can access', width: 280 }, { label: 'What they cannot access', width: 155 }],
      [
        ['Admin', 'All calculators: Bituminous Mix, Concrete Rate v1 & v2, QTO/BOQ Tab. Full save, edit, and export rights.', 'Nothing is blocked in the Estimator Hub.'],
        ['Manager', 'Bituminous Mix Rate Calculator only. Can create new estimates and view saved estimates.', 'Concrete Rate Calculator and QTO/BOQ Tab are hidden.'],
      ],
    );

    sectionHeading(doc, '1.3 — Hub Navigation');
    body(doc, 'The Estimator Hub home displays tool tiles. Each tile provides quick links to its features:');
    doc.moveDown(0.3);
    table(doc,
      [{ label: 'Tile', width: 130 }, { label: 'Links available', width: 240 }, { label: 'Roles', width: 145 }],
      [
        ['Bituminous Mix', 'Saved Estimates, New Estimate, Contractor Comparison', 'Admin & Manager'],
        ['Concrete Rate', 'New Estimate (v2), v1 Saved Estimates, v1 Calculator (legacy)', 'Admin only'],
      ],
    );
    doc.moveDown(0.3);
    flowChart(doc, [
      { label: 'Estimator Hub Home (/estimator-hub)' },
      { label: 'Choose a Tool Tile' },
      { label: 'Open Saved Estimates list OR start a New Estimate' },
      { label: 'Fill inputs → Calculate → Save / Export PDF' },
    ]);

    sectionHeading(doc, '1.4 — Signing Out');
    body(doc, 'Two sign-out options are available at the bottom of the Estimator Hub page:');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      '"Back to HLC Dashboard" — signs out of the Estimator Hub and returns to the main SiteLog home dashboard.',
      '"Sign Out" — signs out of the Estimator Hub only; you are redirected to the Estimator Login page.',
    ]);
    warnBox(doc, 'Session is cookie-based',
      'The Estimator Hub session is stored as a browser cookie. Clearing browser cookies or switching browsers will require you to log in again. The session does not share state with the main SiteLog login.');

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 2 — BITUMINOUS MIX RATE CALCULATOR
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 2 — Bituminous Mix Rate Calculator');

    body(doc, 'The Bituminous Mix Rate Calculator computes the per-metric-tonne (per-MT) rate for producing and laying a hot-mix bituminous surface course or base course. It accounts for material costs, fuel, laying crew, compaction, transport, and contractor margins.');
    doc.moveDown(0.5);

    sectionHeading(doc, '2.1 — Opening the Calculator');
    numberedSteps(doc, [
      'From Estimator Hub, tap "New Estimate" on the Bituminous Mix tile — this opens /mix-calculator.',
      'Alternatively, navigate to /mix-calculator directly (must be authenticated).',
      'The calculator loads with default input values that can be adjusted.',
    ]);

    sectionHeading(doc, '2.2 — Calculator Inputs');
    body(doc, 'The calculator is organised into groups of inputs. Fill every field that applies to your estimate:');
    doc.moveDown(0.3);
    subHeading(doc, 'Mix Identity');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Estimate Name', 'A descriptive name for this estimate (e.g. "BC 60/70 — NH-44 Km 12–18").'],
        ['Mix Type', 'Select the mix type: BC (Bituminous Concrete), DBM, WBM, WMM, etc.'],
        ['Specification Grade', 'The bitumen grade used: 60/70, 80/100, PMB-40, etc.'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Material Costs');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Aggregate Rate (₹/MT)', 'Cost per MT of aggregate at plant gate, including freight.'],
        ['Bitumen Rate (₹/MT)', 'Market rate per MT for the specified grade of bitumen.'],
        ['Bitumen Content (%)', 'Bitumen percentage by weight of total mix (typical: 4.5–6%).'],
        ['Filler Rate (₹/MT)', 'Rate for mineral filler (lime/cement) if applicable.'],
        ['Filler Content (%)', 'Percentage of filler in the mix.'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Production & Plant Costs');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Plant Output (MT/hr)', 'Rated or actual plant output in metric tonnes per hour.'],
        ['Fuel Consumption (L/hr)', 'Diesel consumed by dryer and plant auxiliaries per hour.'],
        ['Diesel Rate (₹/L)', 'Current diesel price at site.'],
        ['Plant Fixed Cost (₹/MT)', 'Amortised plant fixed cost per tonne (depreciation + maintenance).'],
        ['Supervisory Cost (₹/MT)', 'Salary/wages allocated per tonne for QC, supervisors, operators.'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Laying & Compaction Costs');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Laying Cost (₹/MT)', 'Paver and crew cost per MT of mix laid.'],
        ['Compaction Cost (₹/MT)', 'Roller(s) cost per MT.'],
        ['Emulsion / Tack Coat (₹/MT)', 'Tack coat material and application cost per MT of overlay.'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Transport');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Transport Rate (₹/MT)', 'Tipper cost per MT from plant to work site.'],
        ['Lead Distance (km)', 'One-way distance from plant to site (used for reference only).'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Margins & Overheads');
    table(doc,
      [{ label: 'Field', width: 150 }, { label: 'What to enter', width: 365 }],
      [
        ['Overhead (%)', 'Percentage overhead on total direct cost.'],
        ['Profit Margin (%)', 'Contractor profit percentage on total cost.'],
        ['GST Rate (%)', 'Applicable GST rate (typically 18% on works contracts).'],
      ],
    );

    sectionHeading(doc, '2.3 — Mix Modes');
    body(doc, 'The calculator supports multiple modes that affect how material costs are computed:');
    doc.moveDown(0.3);
    table(doc,
      [{ label: 'Mode', width: 120 }, { label: 'Description', width: 395 }],
      [
        ['Standard', 'Single aggregate source and single bitumen grade. Most common mode.'],
        ['Blended Aggregate', 'Two aggregate sources (e.g. crusher dust + stone chips) blended at a specified ratio. Weighted average cost is computed automatically.'],
        ['Modified Bitumen', 'Uses PMB or CRMB instead of conventional bitumen. A modifier premium can be added.'],
      ],
    );
    infoBox(doc, 'Mode switching resets inputs',
      'Switching between modes resets some input fields to their defaults. Enter the mode first, then fill in all input values to avoid data loss.');

    sectionHeading(doc, '2.4 — Scenarios');
    body(doc, 'Scenarios let you run multiple what-if analyses within the same estimate without creating separate saved estimates. Each scenario has its own set of inputs and produces an independent rate output.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'On the calculator page, tap "+ Add Scenario" to create a second scenario alongside the base.',
      'Each scenario panel shows all inputs independently. Change the values that differ (e.g. a higher diesel rate for a pessimistic case).',
      'Both scenarios compute simultaneously — rates are shown side by side.',
      'Tap the bin icon on a scenario to remove it. The base scenario cannot be removed.',
    ]);
    tipBox(doc, 'Use scenarios for contractor negotiation',
      'Create Scenario A with your own procurement rates and Scenario B with the contractor\'s quoted rates. The difference in per-MT rate shows the margin gap to negotiate.');

    sectionHeading(doc, '2.5 — Saving an Estimate');
    numberedSteps(doc, [
      'After reviewing the computed rate, tap "Save Estimate" (or "Save" in the header).',
      'Enter or confirm the Estimate Name.',
      'The estimate is saved to the database and appears in Saved Estimates (/admin/mix-estimates).',
      'Saved estimates can be re-opened, edited, and saved again at any time.',
    ]);
    warnBox(doc, 'Unsaved estimates are lost on navigation',
      'The calculator does not auto-save. If you navigate away from /mix-calculator without saving, all current inputs will be lost. Save before leaving.');

    sectionHeading(doc, '2.6 — Saved Estimates & Contractor Comparison');
    subHeading(doc, 'Saved Estimates List (/admin/mix-estimates)');
    bulletPoints(doc, [
      'Lists all saved bituminous mix estimates in reverse chronological order.',
      'Tap an estimate to open it in the calculator for viewing or editing.',
      'Use the download icon to export a single estimate as a PDF report.',
      'Use the delete icon to permanently remove an estimate (admin only).',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Contractor Comparison (/admin/mix-comparison)');
    body(doc, 'The comparison view lets you select two or more saved estimates and display them side by side as a table. This is designed for evaluating competing contractor quotes for the same mix type.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Navigate to Estimator Hub → Contractor Comparison.',
      'Select two or more saved estimates from the dropdown list.',
      'The comparison table shows each line-item cost component for all selected estimates.',
      'The estimate with the lowest total per-MT rate is highlighted.',
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 3 — CONCRETE RATE CALCULATOR
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 3 — Concrete Rate Calculator (v1 & v2)');

    body(doc, 'The Concrete Rate Calculator computes per-cubic-metre (per-cum) rates for structural concrete works such as drains, box culverts, and retaining walls. Two versions are available: the legacy v1 calculator and the more powerful location-centric v2 calculator.');
    doc.moveDown(0.5);

    sectionHeading(doc, '3.1 — v1 vs v2: Which to Use?');
    table(doc,
      [{ label: 'Feature', width: 180 }, { label: 'v1 (Legacy)', width: 170 }, { label: 'v2 (Current)', width: 165 }],
      [
        ['Structure types', 'Single generic concrete structure', 'Drains, Box Culverts, Retaining Walls'],
        ['Location support', 'No — single estimate', 'Yes — multiple chainage locations in one estimate'],
        ['Aggregate sourcing', 'One source', 'Per-location aggregate source with custom rate'],
        ['Rebar design', 'Manual input only', 'Auto rebar design from IRC standard tables'],
        ['BOQ parameters', 'Basic (grade, cement, water)', 'Full BOQ: grade, water-cement ratio, admixtures'],
        ['Recommended for', 'Quick single-structure quotes', 'Full project BOQ with location-wise breakdown'],
      ],
    );
    infoBox(doc, 'v1 is available for reference only',
      'New estimates should be created in v2. The v1 saved estimates list (/admin/concrete-estimates) allows viewing and re-printing legacy estimates. The v1 calculator (/concrete-calculator) remains accessible for quick back-of-envelope checks.');

    sectionHeading(doc, '3.2 — v2 Calculator: BOQ Parameters');
    body(doc, 'Open the v2 calculator from Estimator Hub → Concrete Rate → "New Estimate (v2)" or navigate to /concrete-calculator-v2.');
    doc.moveDown(0.3);
    subHeading(doc, 'Project Identity');
    numberedSteps(doc, [
      'Enter Estimate Name — a descriptive title (e.g. "Box Culverts NH-44 Km 8–15").',
      'Select Structure Type — Drain / Box Culvert / Retaining Wall.',
      'Select Concrete Grade — M20, M25, M30, M35 (determines cement content per IRC standards).',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Mix Design Parameters');
    table(doc,
      [{ label: 'Parameter', width: 170 }, { label: 'Description', width: 345 }],
      [
        ['Water-Cement Ratio', 'W/C ratio for the concrete grade (e.g. 0.45 for M25). Affects cement consumption.'],
        ['Cement Rate (₹/bag)', 'Market rate for 50 kg OPC/PPC cement bags.'],
        ['Sand Rate (₹/cum)', 'Rate for fine aggregate (river sand or manufactured sand) per cubic metre.'],
        ['Admixture (%)', 'Superplasticiser / retarder dosage as % of cement weight (enter 0 if none).'],
        ['Admixture Rate (₹/L)', 'Cost of admixture per litre (enter 0 if no admixture).'],
        ['Wastage (%)', 'Concrete production wastage allowance (typically 2–5%).'],
      ],
    );

    sectionHeading(doc, '3.3 — v2 Calculator: Blending & Multiple Aggregate Sources');
    body(doc, 'In v2, each location can have its own coarse aggregate source and rate. This reflects real-world scenarios where aggregates for different site chainage points come from different quarries.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'For each location you add (see section 3.4), specify the Aggregate Source name and Rate (₹/MT).',
      'If blending two aggregate sizes (e.g. 20mm + 10mm), enter both sizes and the blend ratio (%). The weighted average rate is computed automatically.',
      'The calculator applies the location-specific aggregate cost to that location\'s volume only — other locations are unaffected.',
    ]);
    tipBox(doc, 'Quarry distance pricing',
      'If your aggregate rate varies with lead distance, create a separate location entry for each chainage range and assign the correct quarry rate to each. The BOQ breakdown will show cost differences across chainage ranges.');

    sectionHeading(doc, '3.4 — v2 Calculator: Rebar Design');
    body(doc, 'v2 includes automatic rebar quantity estimation based on IRC standard design tables for drains and box culverts. The rebar design section computes total steel quantity (MT) and steel cost for a given structure dimension.');
    doc.moveDown(0.3);
    subHeading(doc, 'Auto Rebar Design Inputs');
    table(doc,
      [{ label: 'Input', width: 170 }, { label: 'Description', width: 345 }],
      [
        ['Span / Width (m)', 'Internal clear span of the box culvert or drain width.'],
        ['Height (m)', 'Internal clear height.'],
        ['Wall Thickness (mm)', 'Typical wall/slab thickness from which rebar cover is derived.'],
        ['Steel Grade', 'Fe415 or Fe500 — affects permissible stress used in design tables.'],
        ['Steel Rate (₹/MT)', 'Market rate per metric tonne of reinforcement steel.'],
      ],
    );
    doc.moveDown(0.3);
    body(doc, 'The calculator looks up the appropriate reinforcement percentage from the IRC table for the span-height combination and computes: Steel volume (cum) → Steel mass (MT) → Steel cost (₹).');
    doc.moveDown(0.3);
    subHeading(doc, 'Manual Override');
    body(doc, 'If your design uses a custom reinforcement percentage not matching the IRC table, toggle "Manual Rebar Entry" and enter the steel quantity per cum of concrete directly.');

    sectionHeading(doc, '3.5 — v2 Calculator: Per-Location Breakdown');
    body(doc, 'The key advantage of v2 is location-wise costing. Each location represents a chainage range or a distinct structure on the project.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Tap "+ Add Location" to add a chainage or structure location.',
      'Enter Location Name (e.g. "Km 10+200 — Box Culvert 2×2"), Structure Count, and individual structure dimensions (L × B × D).',
      'The calculator computes volume per structure, total volume for the location, and applies the location\'s aggregate rate.',
      'Repeat for all locations on the project.',
      'The summary panel shows total volume (cum), total steel (MT), and total estimate cost for all locations combined.',
    ]);

    sectionHeading(doc, '3.6 — v1 Calculator (Legacy) Overview');
    body(doc, 'The v1 calculator (/concrete-calculator) takes a simplified set of inputs:');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Concrete Grade and Grade-linked cement factor (bags/cum).',
      'Material rates: cement, sand, aggregate (single source).',
      'Labour rate (₹/cum for batching, placing, curing).',
      'Formwork rate (₹/sqm), converted to ₹/cum using the structure\'s surface-area-to-volume ratio.',
      'Overhead (%) and Profit (%).',
    ]);
    body(doc, 'The output is a single per-cum analysis rate. Save the estimate and it appears in Saved Estimates (/admin/concrete-estimates).');

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 4 — QTO/BOQ TAB
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 4 — QTO/BOQ Tab: Quantities, Volumes & Excel Import');

    body(doc, 'The QTO (Quantity Take-Off) / BOQ (Bill of Quantities) tab is a structured workspace for computing quantities from field dimensions, building a BOQ, and optionally importing items from Excel. It is accessible within the Estimator Hub for Admin users.');
    doc.moveDown(0.5);

    sectionHeading(doc, '4.1 — Navigating to the QTO/BOQ Tab');
    numberedSteps(doc, [
      'Log in to the Estimator Hub as an Admin.',
      'Select the relevant project or start a new QTO document.',
      'The page is divided into three panels: Dimension Entry (left), Volume Summary (centre), and BOQ Estimator (right).',
    ]);
    infoBox(doc, 'QTO/BOQ is Admin-only',
      'The QTO/BOQ tab is visible only to Admin users in the Estimator Hub. Manager-role users do not see this section. Contact your SiteLog admin if access is needed.');

    sectionHeading(doc, '4.2 — Dimension Entry');
    body(doc, 'The Dimension Entry panel is where you record the raw field measurements that drive quantity calculations.');
    doc.moveDown(0.3);
    subHeading(doc, 'Adding a Dimension Item');
    numberedSteps(doc, [
      'Tap "+ Add Item" in the Dimension Entry panel.',
      'Enter Item Description — a descriptive label (e.g. "Earthwork cutting Km 5+200 to Km 5+400").',
      'Enter Length (m), Width (m), Depth/Height (m) as applicable. For irregular sections, enter the cross-sectional area directly in the Area field.',
      'Enter Quantity multiplier — the number of repetitions (e.g. 4 culverts of identical dimensions).',
      'The system computes Volume = L × B × D × Qty (or Area × L × Qty for area-based items).',
      'Tap Save. The item appears in the dimension list.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Editing and Deleting Items');
    bulletPoints(doc, [
      'Tap the pencil icon next to any item to edit its dimensions. Volume updates automatically.',
      'Tap the bin icon to delete an item. The volume summary updates immediately.',
      'Items can be reordered by dragging the grip handle on the left.',
    ]);
    warnBox(doc, 'Deleting linked items affects the BOQ',
      'If a dimension item has been linked to a BOQ line item (see section 4.4), deleting the dimension item removes the volume from the BOQ line. Review the BOQ after deleting dimension items.');

    sectionHeading(doc, '4.3 — Volume Summary');
    body(doc, 'The Volume Summary panel aggregates all dimension items by work category. It shows:');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Total volume per category (Earthwork, Concrete, Sub-base, etc.).',
      'Running subtotals that update live as dimension items are added or edited.',
      'A breakdown by chainage range or location group if grouping is enabled.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Grouping Dimension Items');
    body(doc, 'Assign a Category and optionally a Chainage Group to each dimension item when adding it. The summary panel groups volumes accordingly. This is particularly useful for road projects where different km ranges have different unit rates.');
    tipBox(doc, 'Export volume summary',
      'The Volume Summary can be exported to Excel using the "Export" button at the top of the summary panel. The export includes all dimension items, individual volumes, and category totals.');

    sectionHeading(doc, '4.4 — BOQ Estimator');
    body(doc, 'The BOQ Estimator builds the formal Bill of Quantities by linking dimension volumes to scheduled rates.');
    doc.moveDown(0.3);
    subHeading(doc, 'Adding a BOQ Line Item');
    numberedSteps(doc, [
      'Tap "+ Add BOQ Item" in the BOQ Estimator panel.',
      'Enter Item Number (e.g. 1.01, 2.03) matching your project\'s BOQ numbering.',
      'Enter Description — the full scheduled item description.',
      'Select Unit (cum, sqm, MT, RM, Nos, LS, etc.).',
      'Enter or link the Quantity — either type a value manually or link to a dimension item\'s computed volume.',
      'Enter the Rate (₹) per unit.',
      'The system computes Amount = Quantity × Rate.',
      'Tap Save.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Linking to Computed Volumes');
    body(doc, 'To link a BOQ item quantity to a computed volume from the Dimension Entry panel:');
    numberedSteps(doc, [
      'In the Quantity field of the BOQ item, tap the link icon next to the field.',
      'A dropdown shows all available dimension groups and categories.',
      'Select the matching category — the quantity field populates automatically with the computed volume.',
      'The link is live: if dimensions change, the BOQ quantity updates automatically.',
    ]);
    tipBox(doc, 'Manual override is always available',
      'You can override a linked quantity by typing directly in the field. The override breaks the live link but allows for contractual rounding or adjustments. Re-link by tapping the link icon again and re-selecting the category.');

    sectionHeading(doc, '4.5 — BOQ Summary & Totals');
    body(doc, 'The BOQ Estimator shows a running total at the bottom of the panel:');
    doc.moveDown(0.3);
    table(doc,
      [{ label: 'Line', width: 150 }, { label: 'Description', width: 365 }],
      [
        ['Sub-total (Works)', 'Sum of all BOQ item amounts before overhead and contingency.'],
        ['Overhead (%)', 'Configurable overhead percentage applied to the sub-total.'],
        ['Contingency (%)', 'Risk allowance percentage (typically 2–5%).'],
        ['GST (%)', 'Applicable GST rate.'],
        ['Grand Total', 'Sub-total + overhead + contingency + GST.'],
      ],
    );

    sectionHeading(doc, '4.6 — Excel Import');
    body(doc, 'The QTO/BOQ Tab supports importing BOQ items from a formatted Excel file. This is useful when a BOQ has already been prepared in Excel and needs to be brought into SiteLog for rate analysis.');
    doc.moveDown(0.3);
    subHeading(doc, 'Preparing the Excel File');
    body(doc, 'The Excel file must have the following columns in the first sheet (row 1 = header row):');
    doc.moveDown(0.3);
    table(doc,
      [{ label: 'Column Header', width: 140 }, { label: 'Data type', width: 100 }, { label: 'Description', width: 275 }],
      [
        ['Item No', 'Text', 'BOQ item number (e.g. 1.01). Can be blank for sub-heading rows.'],
        ['Description', 'Text', 'Full item description. Rows with no Item No are imported as section headings.'],
        ['Unit', 'Text', 'Unit of measure: cum, sqm, MT, RM, Nos, LS, etc.'],
        ['Quantity', 'Number', 'Quantity to import. Can be overridden after import.'],
        ['Rate', 'Number', 'Rate per unit in ₹. Leave blank to enter after import.'],
        ['Amount', 'Number (optional)', 'If provided, used for validation only. System computes Amount = Qty × Rate.'],
      ],
    );
    doc.moveDown(0.3);
    subHeading(doc, 'Importing the File');
    numberedSteps(doc, [
      'In the BOQ Estimator panel, tap "Import from Excel".',
      'Select the prepared Excel file (.xlsx or .xls) from your device.',
      'The system parses the file and shows a preview of the items to be imported.',
      'Review the preview for any parsing errors (highlighted in red). Correct the source file and re-import if needed.',
      'Tap "Confirm Import" — the items are added to the BOQ.',
      'Items can be edited individually after import.',
    ]);
    warnBox(doc, 'Import appends, not replaces',
      'Importing a file adds the imported items to any existing BOQ items — it does not clear the existing BOQ first. If you need a fresh import, delete all existing BOQ items before importing, or start a new QTO document.');

    sectionHeading(doc, '4.7 — Exporting the BOQ');
    body(doc, 'The completed BOQ can be exported in two formats:');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'PDF — a formatted BOQ report with project header, item-wise breakdown, and grand total. Suitable for submission or printing.',
      'Excel — the full BOQ in spreadsheet format, with all columns editable for further manipulation outside SiteLog.',
    ]);
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Tap the "Export" button at the top of the BOQ Estimator panel.',
      'Select PDF or Excel from the dropdown.',
      'The file downloads immediately to your device.',
    ]);
    tipBox(doc, 'Version your exports',
      'Each time you make significant changes to the BOQ, export a PDF for record-keeping. SiteLog does not maintain a revision history of BOQ snapshots — regular exports are the recommended way to track BOQ evolution.');

    rule(doc);

    body(doc, 'End of Estimator Portal Guide.');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text(`SiteLog — ${plant} — Generated ${today}`, M, doc.y, { width: CONTENT_W, align: 'center' });

    doc.end();
  });
}
