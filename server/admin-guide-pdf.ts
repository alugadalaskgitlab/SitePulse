import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const M = 40;
const PAGE_W = 595;
const CONTENT_W = PAGE_W - M * 2;
const COL_RIGHT = M + CONTENT_W;

// Colours — same palette as operator guide
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

// ── HELPERS ────────────────────────────────────────────────────────────────

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
  const tmpHeight = 14 + doc.heightOfString(text, { width: CONTENT_W - 24, fontSize: 10 }) + 14;
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
  const tmpHeight = 14 + doc.heightOfString(text, { width: CONTENT_W - 24, fontSize: 10 }) + 14;
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
  const tmpHeight = 14 + doc.heightOfString(text, { width: CONTENT_W - 24, fontSize: 10 }) + 14;
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
      const h = doc.heightOfString(cell, { width: cols[ci].width - 8, fontSize: 9 });
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

/**
 * Draw a vertical flow-chart with boxes and connecting arrows.
 * steps: [{label, sublabel?}]
 * diamond: index of a decision box (rendered as rotated square)
 */
function flowChart(doc: Doc, steps: Array<{ label: string; sub?: string; decision?: boolean }>, x?: number, w?: number) {
  const chartX = x ?? M + 80;
  const chartW = w ?? CONTENT_W - 160;
  const boxH = 28;
  const gapH = 18; // arrow gap between boxes
  const arrowLen = 12;
  doc.moveDown(0.4);

  steps.forEach((step, i) => {
    const yTop = doc.y;
    const labelH = step.sub
      ? doc.heightOfString(step.label, { width: chartW - 16, fontSize: 9 }) +
        doc.heightOfString(step.sub, { width: chartW - 16, fontSize: 8 }) + 10
      : Math.max(boxH, doc.heightOfString(step.label, { width: chartW - 16, fontSize: 9 }) + 10);

    if (step.decision) {
      // Diamond shape approximated as a rounded rect with a different fill
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

    // Draw downward arrow (except after last box)
    if (i < steps.length - 1) {
      const arrowX = chartX + chartW / 2;
      const arrowY1 = doc.y;
      const arrowY2 = doc.y + gapH - 4;
      doc.moveTo(arrowX, arrowY1)
        .lineTo(arrowX, arrowY2)
        .strokeColor(C_FLOW_ARROW).lineWidth(1).stroke();
      // Arrowhead
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

export function pipeAdminGuidePdf(stream: NodeJS.WritableStream, plantName?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: M, bufferPages: true, info: {
        Title: 'SiteLog Plant Admin & Manager Guide',
        Author: 'SiteLog System',
        Subject: 'Full Plant Module Reference — Admin & Manager Edition',
      },
    });

    doc.pipe(stream);
    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);

    const plant = plantName || 'High Lane Constructions Pvt Ltd';
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    // ════════════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ════════════════════════════════════════════════════════════════════════
    try {
      const logoPath = path.join(process.cwd(), 'attached_assets', '1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, PAGE_W / 2 - 36, 80, { width: 72, height: 72 });
      }
    } catch { /* ignore */ }

    doc.fontSize(26).font('Helvetica-Bold').fillColor(C_CHAPTER_BG)
      .text('SiteLog', M, 175, { width: CONTENT_W, align: 'center' });
    doc.fontSize(17).font('Helvetica-Bold').fillColor(C_SECTION_BG)
      .text('Plant Admin & Manager Guide', M, doc.y + 5, { width: CONTENT_W, align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#444444')
      .text('Complete Reference — All Modules, Workflows & Admin Tools', M, doc.y + 6, { width: CONTENT_W, align: 'center' });

    doc.moveDown(1.5);
    doc.rect(M, doc.y, CONTENT_W, 1).fill(C_RULE);
    doc.moveDown(1.2);

    doc.fontSize(12).font('Helvetica').fillColor('#555555')
      .text(plant, M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#777777')
      .text('For use by Admins and Plant Managers', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#999999')
      .text(`Generated: ${today}`, M, doc.y, { width: CONTENT_W, align: 'center' });

    doc.moveDown(2.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C_DARK)
      .text('CONTENTS', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.8);

    const toc: [string, string][] = [
      ['Chapter 1', 'Getting Started — Login, Roles & Navigation'],
      ['Chapter 2', 'Master Data Setup (Masters Tab)'],
      ['Chapter 3', 'Operations Tab — Day-to-Day Entry Workflows'],
      ['Chapter 4', 'Stock & Management Tab'],
      ['Chapter 5', 'LDO Reconciliation — Admin Deep-Dive'],
      ['Chapter 6', 'Reports Tab'],
      ['Chapter 7', 'Quick Reference & Checklists'],
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
    // CHAPTER 1 — GETTING STARTED
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 1 — Getting Started: Login, Roles & Navigation');

    body(doc, 'SiteLog is a role-based construction management application. Admins have unrestricted access to all modules, data, and tools. Plant Managers see all production data but cannot access system administration. Engineers and Operators see only the sections granted to them by an Admin.');
    doc.moveDown(0.5);

    sectionHeading(doc, '1.1 — Logging In');
    numberedSteps(doc, [
      'Open the SiteLog URL in your browser (Chrome or Safari recommended). On mobile, add it to your Home Screen for best experience.',
      'Enter your registered Email address or Phone number.',
      'Enter your Password and tap Sign In.',
      'If you are logging in on a new device, you will see a "Device Approval Pending" screen. An Admin must approve this device from User Management before you can proceed.',
      'Once approved, you land on the Home dashboard.',
    ]);

    tipBox(doc, 'First-time device approval',
      'Admins approve new devices from: Home → Settings (gear icon) → User Management → select the user → Device Approvals. Approve the pending device — the user\'s login page will automatically redirect.');

    sectionHeading(doc, '1.2 — User Roles at a Glance');
    table(doc,
      [{ label: 'Role', width: 80 }, { label: 'What they can do', width: 250 }, { label: 'What they cannot do', width: 185 }],
      [
        ['Admin', 'Full access: all plant modules, user management, master data, admin tools, bulk exports, all reports.', 'Nothing is blocked.'],
        ['Manager', 'View and create entries in all permitted sections. Can unlock shift logs with PIN. Can access reports.', 'Cannot manage users, device approvals, or admin-only tools like Ledger Rebuild.'],
        ['Engineer', 'Access only to sections explicitly granted (e.g. DPR, site purchases). Usually no plant module access unless granted.', 'Cannot access plant module unless permission is explicitly enabled.'],
      ],
    );

    sectionHeading(doc, '1.3 — Plant Module Navigation');
    body(doc, 'From the main sidebar, tap Plant (or the flask icon) to enter the Plant Module. The page has four tabs:');
    doc.moveDown(0.4);
    table(doc,
      [{ label: 'Tab', width: 100 }, { label: 'What is here', width: 250 }, { label: 'Primary users', width: 165 }],
      [
        ['Operations', 'Material receipts, issues, returns, truck dispatches, equipment usage, heating sessions, shift log, generator logs, procurement.', 'Operators, Supervisors, Admins'],
        ['Management', 'Stock overview, borrowing, stock transfer, variance & audit reports, bitumen dip tracker, LDO flow meter & dip logs, vendor bills.', 'Managers, Admins'],
        ['Reports', 'Daily plant reports, heating trends, diesel procurement report, manpower review.', 'Managers, Admins'],
        ['Masters', 'Party master, material master, mix templates, equipment master, personnel master.', 'Admins only'],
      ],
    );

    body(doc, 'Navigation flow: tap a tab → scroll to the relevant section card → use the action button (New Entry / View / Export).');
    doc.moveDown(0.4);

    flowChart(doc, [
      { label: 'Home Dashboard' },
      { label: 'Plant Module (sidebar or home card)' },
      { label: 'Select Tab: Operations / Management / Reports / Masters' },
      { label: 'Scroll to Section Card → Take Action' },
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 2 — MASTER DATA
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 2 — Master Data Setup (Masters Tab)');

    body(doc, 'Master data must be configured before daily operations can begin. Visit Plant → Masters tab. All master entries are admin-only. Set these up once during site commissioning and update them whenever contractors or equipment change.');
    doc.moveDown(0.5);

    sectionHeading(doc, '2.1 — Party Master');
    body(doc, 'A "Party" is any contractor, subcontractor, or organisation whose materials are tracked separately in the plant. Every material receipt, issue, and dispatch is linked to a party so the system maintains party-specific stock balances.');
    doc.moveDown(0.3);
    subHeading(doc, 'Adding a Party');
    numberedSteps(doc, [
      'Go to Plant → Masters → Party Master.',
      'Tap "+ Add Party".',
      'Enter Party Name (full legal name or common site name) and a short Code (2-5 letters, e.g. HLC, ABC).',
      'Optionally add Contact and Notes.',
      'Tap Save.',
    ]);
    infoBox(doc, 'Why parties matter',
      'When a truck dispatches aggregate, the system first uses the party\'s own aggregate stock. If the party has insufficient stock, it borrows from the default HLC (your own) stock and records the borrow. This is the "owner-first routing" logic. Correct party names ensure stock balances are accurate per contractor.');

    sectionHeading(doc, '2.2 — Material Master');
    body(doc, 'Materials are the raw inputs used in production (aggregate, sand, bitumen, etc.) and the outputs (BC, DBM, WBM, etc.).');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Masters → Material Master.',
      'Tap "+ Add Material".',
      'Enter Material Name, Unit of Measure (MT, cum, litre, bag, etc.).',
      'Mark it as a "Mix Component" if it is a raw material consumed in a mix template.',
      'Tap Save.',
    ]);
    warnBox(doc, 'Do not delete a material with existing stock entries',
      'Deleting a material that has receipts, issues, or dispatch history will break ledger balances. Instead, mark it inactive or rename it.');

    sectionHeading(doc, '2.3 — Mix Template Master');
    body(doc, 'A Mix Template defines the recipe for a bituminous or base course mix — which materials are combined and in what proportions by weight. Templates drive the dispatch stock consumption calculations.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Masters → Mix Templates.',
      'Tap "+ New Template".',
      'Enter Template Name (e.g. BC 60/70 Grade, DBM Cl-B) and the target Mix Type.',
      'Add each component material and its proportion percentage. All proportions must sum to 100%.',
      'Tap Save.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Changing Proportions After Dispatches Exist');
    body(doc, 'If you change component proportions on a template that already has dispatch history, the historical aggregate ledger entries will not automatically update. Use the Ledger Rebuild Tool (Chapter 5) to rewrite the affected period.');
    warnBox(doc, 'Proportion changes are retroactive only with Ledger Rebuild',
      'Do not change mix template proportions without running the Ledger Rebuild tool afterwards for the affected date range. Skipping this will cause the stock ledger to show incorrect historical consumption.');

    sectionHeading(doc, '2.4 — Equipment Master');
    body(doc, 'Register all major plant equipment (drum dryer, asphalt paver, generators, compactors, water bowser, etc.) so equipment usage entries can be linked to a master record. This enables cross-day reporting and maintenance tracking.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Masters → Equipment Master.',
      'Tap "+ Add Equipment".',
      'Enter Equipment Name, Type (Plant, Generator, Vehicle, etc.), and optional Registration Number.',
      'Tap Save. The equipment appears in dropdown lists on the Operations tab.',
    ]);

    sectionHeading(doc, '2.5 — Personnel Master');
    body(doc, 'Personnel are named operators and supervisors. Adding them here enables the shift log and manpower review to auto-complete names and group entries by contractor.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Masters → Personnel.',
      'Tap "+ Add Person".',
      'Enter Full Name, Contractor (link to a Party), Category (Skilled / Unskilled), and Gender.',
      'Tap Save.',
    ]);
    tipBox(doc, 'Keep personnel updated',
      'When a contractor changes workers on site, add new names here and mark departed workers as inactive. This keeps the manpower review contractor-wise totals accurate.');

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 3 — OPERATIONS TAB
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 3 — Operations Tab: Daily Entry Workflows');

    body(doc, 'All day-to-day production data is entered under the Operations tab. The general flow for each working day is:');
    doc.moveDown(0.3);
    flowChart(doc, [
      { label: 'Material Receipts', sub: 'Log raw material arriving at plant' },
      { label: 'Heating Session (Night Pre-heat)', sub: 'Start when boiler begins overnight heating' },
      { label: 'Plant Shift Log', sub: 'Open at start of production shift' },
      { label: 'Equipment Usage', sub: 'Log hours and fuel for each machine' },
      { label: 'Truck Dispatches', sub: 'Record each load of mix dispatched' },
      { label: 'Heating Session (Close) + Shift Log (Finalise)', sub: 'Close at end of production' },
    ]);

    sectionHeading(doc, '3.1 — Material Receipts');
    body(doc, 'A Material Receipt records raw material arriving at the plant from a supplier or contractor. Each receipt increases the party\'s stock balance for that material.');
    doc.moveDown(0.3);
    subHeading(doc, 'How to Enter a Receipt');
    body(doc, 'Go to: Plant → Operations → Material Receipts → tap "+ New Receipt"');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Date — the date the material arrived on site.',
      'Party — select the contractor or owner whose stock this belongs to.',
      'Material — select the material type (aggregate, sand, bitumen, etc.).',
      'Quantity and UOM — enter the quantity in the material\'s unit of measure.',
      'Vehicle No. and Challan No. — enter the truck registration and delivery note number for traceability.',
      'Remarks (optional) — note any quality issue or short delivery.',
      'Tap Save — the stock ledger for this party and material is immediately increased.',
    ]);
    infoBox(doc, 'Effect on stock',
      'Saving a receipt creates a "receipt" transaction in the stock ledger: Party balance = previous balance + received quantity.');

    sectionHeading(doc, '3.2 — Material Issues');
    body(doc, 'A Material Issue records material taken from plant stock for use at the site or project, outside of normal mix production. This decreases the party\'s stock.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to: Plant → Operations → Material Issues → tap "+ New Issue".',
      'Enter Date, Party, Material, Quantity.',
      'Enter the Purpose or site location where the material is being used.',
      'Tap Save — the party\'s stock for this material is reduced.',
    ]);

    sectionHeading(doc, '3.3 — Material Returns');
    body(doc, 'A Material Return records unused material sent back from the site to the plant stock. This increases the party\'s balance.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to: Plant → Operations → Material Returns → tap "+ New Return".',
      'Enter Date, Party, Material, Quantity, and the Vehicle/Challan returning the material.',
      'Tap Save — the party\'s stock is increased.',
    ]);

    sectionHeading(doc, '3.4 — Truck Dispatches (Production Output)');
    body(doc, 'A Truck Dispatch records each load of hot-mix that leaves the plant for the road project. This is the most important transaction — it drives stock consumption calculations.');
    doc.moveDown(0.3);
    subHeading(doc, 'How the Dispatch Works');
    numberedSteps(doc, [
      'Go to: Plant → Operations → Truck Dispatches → tap "+ New Dispatch".',
      'Date and Mix Template — select the correct template (e.g. BC 60/70). The component proportions are loaded automatically.',
      'Party — the contractor whose stock will be consumed first (owner-first routing).',
      'Vehicle No. and Load Quantity (MT) — the truck registration and the weight of the load.',
      'Tap Save.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Owner-First Routing and Borrowing Logic');
    body(doc, 'When a dispatch is saved, the system consumes stock in this order:');
    doc.moveDown(0.3);
    flowChart(doc, [
      { label: 'Dispatch saved for Party X, Mix Template Y' },
      { label: 'Calculate component quantities from mix proportions × load MT', decision: true },
      { label: 'Does Party X have enough stock for each component?', decision: true },
      { label: 'YES → consume from Party X stock only', sub: 'Ledger entry: Party X, type=dispatch' },
      { label: 'NO → consume available from X, borrow remainder from HLC', sub: 'Ledger entries: Party X (dispatch) + HLC (issue as borrow)' },
    ], M + 40, CONTENT_W - 80);

    tipBox(doc, 'What a negative balance means',
      'If a party shows a negative balance in the stock ledger, more material was consumed (dispatched) for them than they received. This is expected when borrowing occurs. It clears when the party receives their own material and a Stock Transfer is recorded (Chapter 4).');

    sectionHeading(doc, '3.5 — Equipment Usage');
    body(doc, 'Equipment Usage logs machine hours and fuel consumption for each shift. This feeds into the daily plant report and the fuel efficiency analysis.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to: Plant → Operations → Equipment Usage → tap "+ Add Entry".',
      'Select Equipment from the master list.',
      'Enter Date, Start Time, End Time (or Hour-Meter Opening/Closing if available).',
      'Enter Diesel Consumed (litres). Select the diesel source: Plant Stock, Direct Purchase, or Contractor.',
      'If direct purchase: enter Fuel Station, Bill Number, Amount Paid.',
      'Tap Save.',
    ]);

    sectionHeading(doc, '3.6 — Heating Sessions (Admin Context)');
    body(doc, 'The Operator Guide covers step-by-step entry. This section adds admin-specific context.');
    doc.moveDown(0.3);
    subHeading(doc, 'Two Sessions in One Day');
    body(doc, 'If the boiler starts for morning pre-heat, then stops, then starts again for a second batch in the afternoon, create TWO separate sessions — one per continuous run. The shift log records a single set of opening/closing meter readings covering the full day. The two sessions\' fuel totals must sum to the shift log\'s meter movement.');
    doc.moveDown(0.3);
    subHeading(doc, 'Editing a Finalised Session');
    body(doc, 'If an error is found after a session is finalised, admins can re-open it:');
    numberedSteps(doc, [
      'Go to Plant → Heating Sessions → find the session.',
      'Tap Edit — if finalised, you will be prompted for your Admin PIN.',
      'Enter the PIN, make corrections, and Save.',
      'The system logs the edit in the version history automatically.',
    ]);
    warnBox(doc, 'Editing changes LDO reconciliation',
      'Changing a meter reading on a finalised session may change the session total and create or clear a mismatch with the shift log. Always check the LDO Mismatch page (Chapter 5) after editing a historical session.');

    sectionHeading(doc, '3.7 — Plant Shift Log (Admin Context)');
    body(doc, 'One shift log per plant per calendar date. Operators create and finalise it. Admins can unlock and edit after finalisation.');
    doc.moveDown(0.3);
    subHeading(doc, 'Unlocking a Finalised Shift Log');
    numberedSteps(doc, [
      'Go to Plant → Operations → Shift Log → find the date.',
      'Tap Unlock — enter your Admin or Manager PIN.',
      'Make corrections (meter readings, idle events, manpower).',
      'Tap Save and Finalise again to re-lock.',
    ]);
    subHeading(doc, 'Manpower Review');
    body(doc, 'Go to Plant → Operations → Shift Log → tap "Manpower Review" to see a contractor-grouped summary of all workers across a date range. Useful for payroll cross-checking.');

    sectionHeading(doc, '3.8 — Generator Logs');
    body(doc, 'Use standalone generator logs for DG runs not tied to a specific heating session (e.g. general site power, testing). These appear in Equipment Usage reports and affect fuel balance tracking.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Operations → Generator Diesel Tracking → tap "+ New Entry".',
      'Select Generator (from Equipment Master).',
      'Enter Date, Start Time, End Time.',
      'Enter Opening Hour-Meter, Closing Hour-Meter (or leave blank if only tracking time).',
      'Enter Opening Diesel, Diesel Issued (if topped up), and Closing Diesel.',
      'Tap Save.',
    ]);

    sectionHeading(doc, '3.9 — Purchase Indents & Daily Diesel');
    subHeading(doc, 'Purchase Indents');
    body(doc, 'Raise a Purchase Indent when the plant needs to procure materials or services.');
    numberedSteps(doc, [
      'Go to Plant → Operations → Purchase Indents → tap "+ New Indent".',
      'Enter Indent No., Date, Description of requirement, Quantity, Proposed By.',
      'Save — the indent enters "Pending" status. A Manager or Admin can approve or reject it.',
      'To approve: open the indent → tap Approve → enter approval details.',
    ]);
    doc.moveDown(0.3);
    subHeading(doc, 'Daily Diesel Requirements');
    body(doc, 'A Daily Diesel Requirement (DDR) documents the estimated diesel needed for the next day\'s plant operations. It is separate from actual consumption entries.');
    numberedSteps(doc, [
      'Go to Plant → Operations → Daily Diesel → tap "+ New DDR".',
      'Enter Date, Estimated Quantity (L), Purpose, Raised By.',
      'A Manager approves the DDR, enabling procurement to be raised against it.',
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 4 — STOCK & MANAGEMENT TAB
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 4 — Stock & Management Tab');

    body(doc, 'The Management tab provides the admin-level view of all stock movements, reconciliation tools, bitumen and LDO tracking, and financial records. Access via Plant → Management tab.');
    doc.moveDown(0.5);

    sectionHeading(doc, '4.1 — Stock Overview & Ledger');
    body(doc, 'The stock overview shows the running balance for every material per party. It is the single source of truth for what material is available at the plant.');
    doc.moveDown(0.3);
    subHeading(doc, 'Reading the Ledger');
    table(doc,
      [{ label: 'Transaction Type', width: 130 }, { label: 'Effect on Balance', width: 100 }, { label: 'Created by', width: 285 }],
      [
        ['Receipt', '+ Add to balance', 'Material Receipts entry'],
        ['Issue', '− Deduct from balance', 'Material Issues entry'],
        ['Return', '+ Add to balance', 'Material Returns entry'],
        ['Dispatch', '− Deduct from balance', 'Truck Dispatch (auto, per component)'],
        ['Transfer', '+ or − depending on direction', 'Stock Transfer Between Parties'],
        ['Equipment Usage', '− Deduct diesel consumed', 'Equipment Usage or Generator Log'],
        ['Opening Balance', 'Sets starting point', 'Admin entry at commissioning'],
        ['Adjustment', '+ or − correction', 'Stock Correction (admin)'],
      ],
    );
    subHeading(doc, 'Party View vs Plant-Common View');
    body(doc, 'Toggle between "Party" and "Common" view using the filter above the ledger. Party view shows balances per contractor. Common view shows aggregate across all parties — useful for checking total material available at the plant regardless of ownership.');

    sectionHeading(doc, '4.2 — Borrowing Flow & Negative Balances');
    body(doc, 'The borrowing mechanism ensures production never stops due to one party\'s low stock. The system borrows automatically from HLC (the default party) and records the debt. The borrowing is then settled via a Stock Transfer when the party receives new material.');
    doc.moveDown(0.4);
    subHeading(doc, 'Borrowing Flow Diagram');
    flowChart(doc, [
      { label: 'Truck Dispatch saved — Party A, 50 MT BC mix' },
      { label: 'System calculates component needs (e.g. 40 MT aggregate, 5 MT bitumen)', decision: true },
      { label: 'Party A aggregate balance ≥ 40 MT?', decision: true },
      { label: 'YES → consume 40 MT from Party A', sub: 'Dispatch ledger entry for Party A' },
      { label: 'NO → consume what Party A has, borrow rest from HLC', sub: 'Party A dispatch + HLC borrow transfer' },
      { label: 'Party A balance goes negative (debt to HLC)' },
      { label: 'Party A receives new aggregate (Material Receipt)' },
      { label: 'Admin runs Stock Transfer: HLC → Party A to settle the debt' },
    ], M + 30, CONTENT_W - 60);

    sectionHeading(doc, '4.3 — Stock Transfer Between Parties');
    body(doc, 'Used to return borrowed material — when Party A borrowed aggregate from HLC and has now received their own stock, transfer the equivalent quantity back from Party A → HLC to clear the debt.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → Stock Transfer (or via the "Stock Transfer" button on the stock page).',
      'From Party — select the party giving the material (the one repaying the borrow: Party A).',
      'To Party — select the party receiving (usually HLC).',
      'Material — select the material type.',
      'Quantity — enter the quantity to transfer.',
      'Date — the date the debt is being settled.',
      'Tap Transfer. The system will warn if the source party will go negative after the transfer.',
    ]);
    warnBox(doc, 'Only use this to settle borrowing debts',
      'Stock Transfer is a balancing tool — do not use it for actual material movement between contractors unless you are sure of the business reason. Each transfer creates permanent ledger entries that affect reports and reconciliation.');

    sectionHeading(doc, '4.4 — Stock Ledger Reassignment (Admin Tool)');
    body(doc, 'Use this tool when ledger entries were recorded under the wrong party due to a data-entry mistake. It moves a batch of entries from one party to another for a chosen date range and material.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Stock → tap "Reassign Ledger".',
      'Select: From Party, To Party, Material, Date From, Date To.',
      'Review the preview of affected entries.',
      'Tap Confirm — the entries are moved.',
    ]);
    warnBox(doc, 'Irreversible action',
      'Ledger reassignment cannot be automatically undone. Take note of the before-state (From Party, To Party, date range, material) so you can reverse it manually if needed. Only admins can access this tool.');

    sectionHeading(doc, '4.5 — Variance Report');
    body(doc, 'The Variance Report compares what the book stock says you should have (based on all ledger entries) against what was physically measured (via dip readings). A large variance indicates either a measurement error or unrecorded consumption.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Go to Plant → Management → Variance Report.',
      'Select the date range and material.',
      'The report shows: Book Stock (MT), Physical Stock (MT), Variance (MT), and Variance %.',
      'A variance within ±1–2% is generally acceptable for bulk materials.',
      'Investigate variances above ±5%: check for unrecorded issues, spillage, or dip-reading errors.',
    ]);

    sectionHeading(doc, '4.6 — Audit Report');
    body(doc, 'The Audit Report is a full transaction history for any material and party combination. Every ledger entry (receipt, dispatch, issue, return, transfer, adjustment) is listed chronologically.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Go to Plant → Management → Audit Report.',
      'Filter by: Date Range, Party, Material, Transaction Type.',
      'Export to Excel for offline review or sharing with the client.',
      'Use this to investigate discrepancies — trace every transaction that changed a balance.',
    ]);

    sectionHeading(doc, '4.7 — Bitumen Stock (Dip Tracker)');
    body(doc, 'Bitumen is stored in separate tanks (Tank 1 and Tank 2). The dip tracker records physical dip-stick measurements, converts them to MT using tank-specific calibration tables, and tracks the running stock balance.');
    doc.moveDown(0.3);
    subHeading(doc, 'Recording a Dip Reading');
    numberedSteps(doc, [
      'Go to Plant → Management → Bitumen Stock.',
      'Select Tank (Tank 1 or Tank 2).',
      'Tap "+ Add Dip Reading".',
      'Enter Date, Time (opening or closing), Dip Reading in centimetres.',
      'The system shows the converted MT value from the calibration table.',
      'Tap Save.',
    ]);
    subHeading(doc, 'Stock Correction Adjustment');
    body(doc, 'If the book stock and physical dip diverge significantly, post an adjustment:');
    numberedSteps(doc, [
      'On the Bitumen Stock page, tap "Post Adjustment".',
      'Enter the Adjustment Quantity (positive to add, negative to deduct) and the reason.',
      'Tap Save — the balance is corrected and the adjustment is logged.',
    ]);
    tipBox(doc, 'Daily dip routine',
      'Take dip readings at the same time each day (preferably at the start and end of the production shift) for consistent data. The shift log also captures bitumen dip readings — these feed the same running balance.');

    sectionHeading(doc, '4.8 — LDO Flow Meter Logs');
    body(doc, 'The LDO (Light Diesel Oil) flow meter is mounted on the boiler fuel line and records cumulative fuel flow. Operators read the meter manually and the readings are logged here. These readings feed the LDO reconciliation.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → LDO Flow Meter.',
      'Tap "+ New Reading".',
      'Enter Date, Time, Reading (cumulative litres shown on the flow meter).',
      'Tap Save.',
    ]);
    infoBox(doc, 'How flow meter readings feed the LDO ledger',
      'The difference between consecutive flow meter readings is the fuel consumed in that period. The system computes this automatically and adds a "flow meter" entry to the LDO ledger. This becomes one of the three values compared in the LDO Reconciliation (Chapter 5).');

    sectionHeading(doc, '4.9 — LDO Dip Logs');
    body(doc, 'LDO Dip Logs record physical dip-stick measurements of the LDO storage tank (separate from the flow meter on the boiler line). These provide an independent check on how much fuel is left in the tank.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → LDO Dips.',
      'Tap "+ Add Dip".',
      'Enter Date, Time, Tank Dip (cm), and optionally the temperature-corrected volume.',
      'Tap Save.',
    ]);
    tipBox(doc, 'Dip vs Flow Meter — which to trust?',
      'The flow meter is more precise for daily consumption. The dip provides a physical cross-check. Large divergence between dip-derived consumption and flow-meter-derived consumption indicates a meter fault or a measurement error. Report any divergence above 5% to your maintenance team.');

    sectionHeading(doc, '4.10 — Vendor Bills');
    body(doc, 'Vendor Bills record invoices from suppliers for equipment hire, material supply, transport, and labour. The system checks for duplicates (same vendor + bill number) and can match the bill rate against the configured rate card.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → Vendor Bills → tap "+ New Bill".',
      'Select Category: Equipment, Material, Transport, or Labour.',
      'Select Vendor (from Party Master), enter Bill No., Bill Date, and Amount.',
      'Add line items with quantity and rate. The system calculates totals.',
      'If a duplicate bill number is detected, a warning banner appears — review before saving.',
      'Tap Save.',
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 5 — LDO RECONCILIATION
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 5 — LDO Reconciliation: Admin Deep-Dive');

    body(doc, 'LDO reconciliation is the most critical admin task in the Plant Module. It compares three independent records of boiler fuel consumption for each day and flags any gap larger than 5 litres. This chapter covers how to read the reconciliation page and how to fix every type of mismatch.');
    doc.moveDown(0.5);

    sectionHeading(doc, '5.1 — The Three-Source Comparison');
    body(doc, 'Every day, three separate records capture boiler fuel consumption:');
    doc.moveDown(0.3);
    table(doc,
      [{ label: 'Source', width: 130 }, { label: 'What it records', width: 220 }, { label: 'Where it lives', width: 165 }],
      [
        ['Heating Sessions', 'Meter opening and closing for each boiler run. Sum of all sessions = total fuel burned today.', 'Plant → Operations → Heating Sessions'],
        ['Shift Log', 'Boiler fuel meter opening and closing for the shift. Closing minus opening = daily fuel movement.', 'Plant → Operations → Shift Log'],
        ['LDO Ledger', 'Auto-generated entries created each time a heating session is saved. Should equal session total.', 'Internal — visible on Mismatch page'],
      ],
    );
    doc.moveDown(0.3);
    body(doc, 'All three must agree within ±5 litres. The system checks this automatically and shows coloured badges:');
    bulletPoints(doc, [
      'GREEN — within tolerance. No action needed.',
      'AMBER — difference is 5–20 L. Worth checking but may be meter rounding.',
      'RED — difference exceeds 20 L. Must be investigated and corrected.',
    ]);

    sectionHeading(doc, '5.2 — Reading the Mismatch Page');
    body(doc, 'Go to: Plant → Management → LDO Reconciliation (or the "LDO Mismatch" shortcut from the Heating Sessions mismatch banner).');
    doc.moveDown(0.3);
    subHeading(doc, 'KPI Cards at the Top');
    table(doc,
      [{ label: 'Card label', width: 180 }, { label: 'What it shows', width: 335 }],
      [
        ['Session total vs shift meter', 'Gap between sum of heating session fuel and shift log boiler meter movement. Should be ≤ 5 L.'],
        ['Session total vs LDO ledger', 'Gap between session total and auto-generated ledger entries. Usually 0 — any gap means orphaned or missing ledger rows.'],
        ['Shift meter vs LDO ledger', 'Gap between shift log meter movement and ledger entries. Combines the above two checks.'],
      ],
    );
    subHeading(doc, 'Per-Date Reconciliation Table');
    body(doc, 'The table below the KPI cards shows one row per date. Columns: Date | Sessions (L) | Shift (L) | Ledger (L) | Session vs Shift | Session vs Ledger | Shift vs Ledger. Red cells indicate mismatches for that date. Tap a row to expand the detail panel showing individual session breakdowns and correction options.');

    sectionHeading(doc, '5.3 — Mismatch Type 1: Sessions vs Shift Log (RED)');
    subHeading(doc, 'What caused it?');
    bulletPoints(doc, [
      'A heating session was deleted after the shift log was saved — session total went down, shift log meter stayed the same.',
      'A meter reading was typed incorrectly in either the session or the shift log.',
      'The shift log was saved with the wrong opening or closing boiler meter reading.',
    ]);
    subHeading(doc, 'How to fix it');
    numberedSteps(doc, [
      'Go to Plant → Heating Sessions → expand the row for the affected date.',
      'Check each session\'s opening and closing meter readings. Add up all sessions\' fuel consumed.',
      'Open the shift log for that date. Note the boiler meter opening and closing.',
      'Compare the two totals. Identify where the discrepancy is — session or shift log.',
      'If a session has a wrong meter reading: tap Edit on the session → correct the reading → Save.',
      'If the shift log has a wrong meter reading: go to Shift Log → find the date → tap Unlock (PIN) → correct the meter field → Finalise.',
      'If a session was deleted and cannot be recovered: correct the shift log closing meter to match the sessions that remain.',
    ]);
    tipBox(doc, 'Version history is your friend',
      'Each time a heating session is edited, a version snapshot is saved. Tap the "History" icon on a session to see previous values and identify what changed.');

    sectionHeading(doc, '5.4 — Mismatch Type 2: Orphaned Ledger Entries');
    body(doc, 'Orphaned entries are LDO ledger rows that were auto-created when a heating session was saved, but the session was subsequently deleted. The ledger entry remains even though the session is gone — this creates a phantom fuel entry.');
    doc.moveDown(0.3);
    subHeading(doc, 'How to identify orphaned entries');
    bulletPoints(doc, [
      'On the Mismatch page, expand the detail panel for the affected date.',
      'A bold warning banner appears: "X orphaned ledger entries found" with the total litres.',
      'The Session vs Ledger card will show a non-zero value (usually equal to the orphaned entries\' total).',
    ]);
    subHeading(doc, 'How to remove orphaned entries');
    numberedSteps(doc, [
      'Verify that the sessions corresponding to the orphaned entries are genuinely deleted and will not be re-created.',
      'In the detail panel, tap "Remove Orphaned Entries" (admin-only button).',
      'Confirm the action in the alert dialog.',
      'The ledger is cleaned and the mismatch clears.',
    ]);
    warnBox(doc, 'Removing orphaned entries is permanent',
      'Once removed, the ledger entries cannot be automatically restored. If you later re-create the missing sessions, new ledger entries will be generated — but the old ones are gone. Only remove if you are certain the sessions will not be re-entered.');

    sectionHeading(doc, '5.5 — Mismatch Type 3: Dryer-Source Mismatch');
    body(doc, 'Each heating session records which physical fuel storage tank feeds the dryer (Boiler Tank or Dryer Tank). The shift log also records this. If they disagree, an orange banner appears on the Heating Sessions page for that date.');
    doc.moveDown(0.3);
    subHeading(doc, 'How to fix it');
    numberedSteps(doc, [
      'Go to Plant → Heating Sessions → find the date with the orange banner.',
      'The banner tells you which session has a different tank selection from the shift log.',
      'Open the offending session → change "Dryer fed from" to match the shift log → Save.',
      'Alternatively, use the bulk "Set all → Boiler tank" or "Set all → Dryer tank" buttons to align all sessions for that date in one action.',
      'If the shift log is wrong instead: go to Shift Log → Unlock (PIN) → change "Which tank feeds the dryer?" → Finalise.',
    ]);

    sectionHeading(doc, '5.6 — LDO Backfill Tool');
    body(doc, 'Use the LDO Backfill Tool when historical heating sessions are missing LDO flow readings (e.g. the flow meter was installed mid-project and older sessions have no meter data). The tool re-creates ledger entries for sessions that have meter readings but no corresponding flow ledger entries.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → LDO Backfill (admin-only).',
      'Select the date range to backfill.',
      'Tap Run Backfill.',
      'Review the summary: rows scanned, sessions updated, entries inserted.',
      'Check the Mismatch page for the affected dates after backfill to confirm the reconciliation is now clean.',
    ]);

    sectionHeading(doc, '5.7 — LDO Dip Backfill Tool');
    body(doc, 'Similar to the LDO Backfill, but for dip readings. Use when physical dip measurements were recorded on paper but not yet entered into SiteLog, and you need to populate the dip log historically.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Management → LDO Dip Backfill (admin-only).',
      'Enter the historical dip readings in the bulk entry form (date, time, depth in cm).',
      'Tap Save All.',
    ]);

    sectionHeading(doc, '5.8 — Ledger Rebuild Tool');
    body(doc, 'The Ledger Rebuild Tool rewrites the aggregate component ledger entries for all dispatches of a specific mix template from a chosen date and time forward. Use it only when you have changed the component proportions of a mix template and need historical dispatch entries to reflect the new proportions.');
    doc.moveDown(0.3);
    numberedSteps(doc, [
      'Go to Plant → Ledger Rebuild (admin-only, accessible from the stock page or admin menu).',
      'Select the Mix Template whose proportions were changed.',
      'Select the Cutoff Date and Time — entries from this point forward will be rewritten.',
      'Tap Preview to see which entries will be affected.',
      'Tap Confirm Rebuild.',
    ]);
    warnBox(doc, 'Ledger Rebuild is irreversible and affects all downstream balances',
      'Running a rebuild changes historical stock balances for all parties who had dispatches of this mix template after the cutoff. Take a note of the current balances before running. Only run after confirming the new proportions are correct. Never run this as a "test" — it writes to the live database.');

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 6 — REPORTS TAB
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 6 — Reports Tab');

    body(doc, 'The Reports tab provides aggregated views and exportable documents for review, client billing, and management reporting. Access via Plant → Reports tab.');
    doc.moveDown(0.5);

    sectionHeading(doc, '6.1 — Daily Plant Reports');
    body(doc, 'Each day\'s production activity is summarised in a Daily Plant Report. This is the primary document shared with clients and management. It consolidates: production tonnage, equipment hours, manpower, fuel consumption, and bitumen usage.');
    doc.moveDown(0.3);
    subHeading(doc, 'Viewing a Report');
    numberedSteps(doc, [
      'Go to Plant → Reports → Daily Plant Reports.',
      'Select the Date using the date picker.',
      'The report loads showing all sections for that date.',
      'Sections in the report: Production Summary (loads, MT by mix type), Equipment Hours, Manpower (contractor-wise), Fuel (LDO + diesel), Bitumen Stock (opening/closing dip), Idle Events.',
      'Tap Print or Download PDF to save or share.',
    ]);
    subHeading(doc, 'Bulk Export to PDF');
    body(doc, 'To export multiple days at once:');
    numberedSteps(doc, [
      'On the Daily Plant Reports page, tap "Bulk Export".',
      'Select Date From and Date To.',
      'Select which plants to include (if multi-plant).',
      'Tap Export — a ZIP file of individual PDF reports is downloaded.',
    ]);

    sectionHeading(doc, '6.2 — Heating Trends');
    body(doc, 'The Heating Trends report charts LDO consumption and boiler temperatures over time. Use it to spot inefficiencies — a rising L/hr consumption without a corresponding increase in bitumen temperature suggests boiler fouling or heat-loss.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Go to Plant → Reports → Heating Trends.',
      'Select Date Range (up to 90 days recommended for meaningful trends).',
      'Charts shown: LDO Consumed per Session (L), Hot-Oil Supply vs Return Temperature (°C), Duration per Session (hrs), L/hr efficiency trend.',
      'Export the chart data to Excel using the Export button.',
    ]);
    tipBox(doc, 'Alert threshold for boiler fouling',
      'When the L/hr consumption rises more than 15% above the seasonal baseline over 7 consecutive sessions, escalate to maintenance for boiler inspection. Fouling significantly increases fuel costs.');

    sectionHeading(doc, '6.3 — Diesel Procurement Report');
    body(doc, 'Aggregates all diesel-related transactions: direct purchases, plant stock issues to equipment, and generator logs. Use this for contractor billing and fuel cost allocation.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Go to Plant → Reports → Diesel Procurement.',
      'Filter by Date Range and optionally by Diesel Type (HSD, LDO).',
      'The report shows: total diesel procured, total consumed, source breakdown (plant stock vs direct purchase vs contractor).',
      'Export to Excel for accounts.',
    ]);

    sectionHeading(doc, '6.4 — Manpower Review (Admin)');
    body(doc, 'The Manpower Review consolidates all worker entries from shift logs across a date range. Useful for payroll checking and contractor-wise attendance summary.');
    doc.moveDown(0.3);
    bulletPoints(doc, [
      'Go to Plant → Operations → Shift Log → tap "Manpower Review".',
      'Select Date Range.',
      'The page shows: total person-days per contractor, category breakdown (skilled/unskilled), gender breakdown.',
      'Export to Excel for HR and payroll.',
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // CHAPTER 7 — QUICK REFERENCE
    // ════════════════════════════════════════════════════════════════════════
    chapterHeading(doc, 'Chapter 7 — Quick Reference & Checklists');

    sectionHeading(doc, '7.1 — Daily Admin Checklist');
    table(doc,
      [{ label: 'When', width: 90 }, { label: 'Task', width: 215 }, { label: 'Where in SiteLog', width: 210 }],
      [
        ['Before shift', 'Confirm materials received yesterday are entered', 'Plant → Operations → Material Receipts'],
        ['Before shift', 'Check heating session opened correctly (meter reading auto-filled?)', 'Plant → Operations → Heating Sessions'],
        ['Before shift', 'Confirm shift log opened with correct opening dips and meters', 'Plant → Operations → Shift Log'],
        ['During shift', 'Log each truck dispatch as it leaves', 'Plant → Operations → Truck Dispatches'],
        ['During shift', 'Record idle events immediately when they occur', 'Edit today\'s Shift Log → Idle Events'],
        ['End of shift', 'Enter closing dips (bitumen tanks) and closing meters', 'Shift Log → Edit → Closing entries'],
        ['End of shift', 'Close heating session with correct closing meter reading', 'Heating Sessions → Edit → Save'],
        ['End of shift', 'Add manpower entries for all workers', 'Shift Log → Edit → Manpower'],
        ['After finalise', 'Check Heating Sessions page for mismatch banners (green = OK)', 'Plant → Heating Sessions'],
        ['After finalise', 'Run LDO Mismatch check for any RED dates', 'Plant → Management → LDO Reconciliation'],
        ['After finalise', 'Enter any vendor bills received today', 'Plant → Management → Vendor Bills'],
      ],
    );

    sectionHeading(doc, '7.2 — Weekly Reconciliation Checklist');
    table(doc,
      [{ label: 'Frequency', width: 80 }, { label: 'Task', width: 200 }, { label: 'Where', width: 235 }],
      [
        ['Weekly', 'Review LDO Mismatch page — clear all RED dates', 'Plant → Management → LDO Reconciliation'],
        ['Weekly', 'Check Variance Report for bitumen and aggregate', 'Plant → Management → Variance Report'],
        ['Weekly', 'Reconcile vendor bills against purchase indents', 'Plant → Management → Vendor Bills + Purchase Indents'],
        ['Weekly', 'Review manpower summary per contractor for payroll', 'Plant → Reports → Manpower Review'],
        ['Monthly', 'Run Stock Audit Report — verify all party balances', 'Plant → Management → Audit Report'],
        ['Monthly', 'Check Heating Trends for rising L/hr consumption', 'Plant → Reports → Heating Trends'],
        ['On change', 'If mix proportions changed: run Ledger Rebuild', 'Plant → Ledger Rebuild (admin)'],
        ['On change', 'If party received stock after a borrow: run Stock Transfer', 'Plant → Management → Stock Transfer'],
      ],
    );

    sectionHeading(doc, '7.3 — Common Problems & Fixes');
    table(doc,
      [{ label: 'Symptom', width: 175 }, { label: 'Likely cause', width: 175 }, { label: 'Where to fix', width: 165 }],
      [
        ['RED badge on Heating Sessions date', 'Session total ≠ shift log meter movement', 'Check session/shift log meter readings; correct the wrong one'],
        ['"Orphaned entries" warning', 'Session deleted after it was saved; ledger row left behind', 'LDO Mismatch page → Remove Orphaned Entries'],
        ['Orange dryer-source banner', 'Session and shift log show different fuel tanks', 'Update session "Dryer fed from" to match shift log'],
        ['Party stock shows large negative', 'Borrows occurred and were never settled via Transfer', 'Stock Transfer: borrower → HLC, for the borrowed qty'],
        ['Variance Report shows > 5% gap', 'Unrecorded issue, spillage, or dip-reading error', 'Post a Stock Adjustment with reason, or correct the dip reading'],
        ['Vendor bill flagged as duplicate', 'Same bill number entered twice for same vendor', 'Delete the duplicate or merge into the correct entry'],
        ['Shift log cannot be edited', 'Log is finalised (locked)', 'Unlock with Admin/Manager PIN, edit, re-finalise'],
        ['Dispatch stock balance wrong after proportion change', 'Mix template proportions changed without Ledger Rebuild', 'Run Ledger Rebuild for the affected mix template and date range'],
        ['Login device stuck on "Pending Approval"', 'Admin has not approved the new device yet', 'Admin → User Management → select user → approve device'],
        ['PDF report missing data', 'Shift log or sessions not finalised for that date', 'Finalise all logs for the date, then re-generate the report'],
      ],
    );

    rule(doc);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_SECTION_BG)
      .text('End of Admin & Manager Guide', M, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text(`SiteLog — ${plant} — Generated ${today}`, M, doc.y, { width: CONTENT_W, align: 'center' });

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#aaaaaa')
        .text(`Page ${i - range.start + 1} of ${range.count}`, M, doc.page.height - 28, {
          width: CONTENT_W, align: 'right',
        });
    }

    doc.end();
  });
}
