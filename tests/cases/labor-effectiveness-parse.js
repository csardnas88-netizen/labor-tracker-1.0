/* Carlos's ask: bring Unifocus's "Labor Effectiveness" report into the
   Labor page — a second report from Worked/Standard/Variance but with two
   figures the app has no other way to get (Scheduled Hours, Projected
   Hours), plus Overtime Hours. This pins parseLaborEffectiveness against
   the REAL extracted text of Carlos's Aug 1-6 2026 report.

   The report's PDF wraps a jobclass label to two lines when it's too long
   for the column, and renders the row's numbers on the Y-band BETWEEN the
   two label lines — literally "Public Area" / [data row] / "Attendant" as
   three separate lines. Short labels ("Houseperson", "Room Attendant")
   don't wrap and sit on the SAME line as their data. Both shapes are
   present in this one real report, so this single fixture covers both
   parsing paths without needing a second one.

   Deliberately verifies NO cost/dollar fields survive into the parsed
   result — Carlos's explicit call that this section never becomes a
   second, slightly-different source of cost numbers next to P&L's. */
const { loadApp, fakeSession } = require('../_harness');

const REAL_HOUSEKEEPING_REPORT_TEXT = [
  'Labor Effectiveness',
  'JW Marriott Houston',
  'From 8/1/26 to 8/6/26',
  '1. Rooms Division',
  'Housekeeping Department',
  'Weekly Worked Standard Scheduled Projected Hours Varian Actual Standard Costs Overtime',
  'Jobclass OT Pay',
  'FTE Hours Hours Hours Hours Variance ce % Costs Costs Variance Hours',
  'Houseperson 0.0 184.80 179.50 184.00 215.00 5.30 3% 2,565 2,482 83 0.00 0.00',
  'Hskpg Supervisor 0.0 170.06 176.00 184.00 208.00 -5.94 -3% 2,958 3,057 -99 0.73 12.20',
  'Public Area',
  '0.0 193.10 192.00 192.00 232.00 1.10 1% 2,712 2,694 18 0.00 0.00',
  'Attendant',
  'Room Attendant 0.0 620.19 438.50 728.00 572.50 181.69 41% 8,548 6,029 2,519 0.00 0.00',
  'Turndown',
  '0.0 148.26 162.00 126.00 216.00 -13.74 -8% 1,990 2,172 -182 0.00 0.00',
  'Attendant',
  'Housekeeping',
  '0.0 1,316.41 1,148.00 1,414.00 1,443.50 168.41 15% 18,773 16,435 2,338 0.73 12.20',
  'Department Totals',
  'Aug 8, 2026 1:53 AM Page 1 of 1'
].join('\n');

// A second department section, appended below the same report — Unifocus's
// own structure genuinely splits Laundry out as its own department (its
// own header, its own Totals row), separate from Housekeeping. "Laundry
// Attendant" is short enough that, like "Room Attendant" above, it doesn't
// wrap: label and data share one line.
const WITH_LAUNDRY_DEPARTMENT = REAL_HOUSEKEEPING_REPORT_TEXT + '\n' + [
  'Laundry Department',
  'Weekly Worked Standard Scheduled Projected Hours Varian Actual Standard Costs Overtime',
  'Jobclass OT Pay',
  'FTE Hours Hours Hours Hours Variance ce % Costs Costs Variance Hours',
  'Laundry Attendant 0.0 214.42 208.00 248.00 248.00 6.42 3% 2,990 2,912 78 0.28 3.81',
  'Laundry',
  '0.0 214.42 208.00 248.00 248.00 6.42 3% 2,990 2,912 78 0.28 3.81',
  'Department Totals'
].join('\n');

module.exports = {
  name: "parseLaborEffectiveness reads Unifocus's real report, both wrapped and unwrapped jobclass labels, no cost fields",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    const parsed = win.parseLaborEffectiveness(REAL_HOUSEKEEPING_REPORT_TEXT);

    // ── Unwrapped labels: name and data share one line. ──
    t.assert(parsed.positions['House Attendant'], "Houseperson -> House Attendant");
    t.eq(parsed.positions['House Attendant'].worked, 184.80);
    t.eq(parsed.positions['House Attendant'].standard, 179.50);
    t.eq(parsed.positions['House Attendant'].scheduled, 184.00);
    t.eq(parsed.positions['House Attendant'].projected, 215.00);
    t.eq(parsed.positions['House Attendant'].hoursVariance, 5.30);
    t.eq(parsed.positions['House Attendant'].variancePct, 3);
    t.eq(parsed.positions['House Attendant'].otHours, 0.00);

    t.assert(parsed.positions['Housekeeping Supervisor'], "Hskpg Supervisor -> Housekeeping Supervisor");
    t.eq(parsed.positions['Housekeeping Supervisor'].worked, 170.06);
    t.eq(parsed.positions['Housekeeping Supervisor'].hoursVariance, -5.94, 'negative hours variance parses correctly');
    t.eq(parsed.positions['Housekeeping Supervisor'].variancePct, -3, 'negative variance % parses correctly');
    t.eq(parsed.positions['Housekeeping Supervisor'].otHours, 0.73);

    t.assert(parsed.positions['Room Attendant']);
    t.eq(parsed.positions['Room Attendant'].worked, 620.19);
    t.eq(parsed.positions['Room Attendant'].variancePct, 41);

    // ── Wrapped labels: "Public Area" / [data] / "Attendant" — three
    // separate lines in the extracted text, stitched back into one label. ──
    t.assert(parsed.positions['Public Area Attendant'], 'wrapped label "Public Area" + "Attendant" resolves to Public Area Attendant');
    t.eq(parsed.positions['Public Area Attendant'].worked, 193.10);
    t.eq(parsed.positions['Public Area Attendant'].scheduled, 192.00);
    t.eq(parsed.positions['Public Area Attendant'].projected, 232.00);

    t.assert(parsed.positions['Turndown Attendant'], 'wrapped label "Turndown" + "Attendant" resolves to Turndown Attendant');
    t.eq(parsed.positions['Turndown Attendant'].worked, 148.26);
    t.eq(parsed.positions['Turndown Attendant'].hoursVariance, -13.74);

    // ── The Department Totals row ("Housekeeping" / [data] / "Department
    // Totals") is itself a wrapped-label data row, but "Housekeeping
    // Department Totals" isn't in UF_JOBCLASS_MAP, so it must NOT produce a
    // spurious 6th entry or get misattributed to a real position. ──
    t.eq(Object.keys(parsed.positions).length, 5, 'exactly the 5 real positions parsed — the Totals row is skipped, not misfiled');

    // ── No cost/dollar fields anywhere in the result — Carlos's explicit
    // call that this section carries no money figures at all. ──
    Object.keys(parsed.positions).forEach((pos) => {
      const row = parsed.positions[pos];
      const keys = Object.keys(row).sort();
      t.eq(keys.join(','), 'hoursVariance,otHours,projected,scheduled,standard,variancePct,worked',
        pos + ' carries only the hours-side fields — no actualCosts/standardCosts/costsVariance/otPay');
    });

    // ── The report's own date range, for auto-associating with the right
    // hotel week on upload. ──
    t.assert(parsed.range, 'date range parsed');
    t.eq(parsed.range.from, '2026-08-01');
    t.eq(parsed.range.to, '2026-08-06');

    // ── A second department section (Laundry) in the same report parses
    // too, correctly folded into the same flat position map — Unifocus
    // genuinely splits it out as its own department, but every other view
    // in this app already treats it as one of the six HK positions
    // (Carlos's explicit call when asked), so this report follows suit. ──
    const parsedWithLaundry = win.parseLaborEffectiveness(WITH_LAUNDRY_DEPARTMENT);
    t.eq(Object.keys(parsedWithLaundry.positions).length, 6, 'Laundry Attendant joins the same flat map as a 6th position, not a separate department bucket');
    t.assert(parsedWithLaundry.positions['Laundry Attendant']);
    t.eq(parsedWithLaundry.positions['Laundry Attendant'].worked, 214.42);
    t.eq(parsedWithLaundry.positions['Laundry Attendant'].standard, 208.00);
    t.eq(parsedWithLaundry.positions['Laundry Attendant'].otHours, 0.28);

    // ── A garbled or unrelated PDF (no recognizable rows) returns an empty
    // map, not a crash. ──
    const empty = win.parseLaborEffectiveness('Some Other Report\nNothing matches here\n');
    t.eq(Object.keys(empty.positions).length, 0, 'no matching rows -> empty positions map, not an error');
  }
};
