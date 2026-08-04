/* Third and fourth positions added to the Unifocus Labor Standard: Laundry
   Attendant and Turndown Attendant, per Carlos's explicit "these two share
   the same standard" — one Unifocus report page covers both. New pattern
   vs. House Attendant/Housekeeping Supervisor: the 0815-1645 shift has TWO
   components (a flat Hotel Rooms component AND a Hotel Departures
   component that only kicks in from 175+ departures, no lower band at
   all), plus a separate 1700-2300 shift with its own 5-band Hotel Rooms
   table. UNIFOCUS_STANDARDS/unifocusHoursForPosition needed no code
   changes for this — every array entry is just summed regardless of how
   many nominally belong to the "same" shift window. See
   unifocus-houseperson.js / unifocus-supervisor.js for the shared
   mechanics this file doesn't re-test. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Labor Standard: Laundry/Turndown share one standard, with a threshold-only component (no band below 175 departures)",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          // Below the 175-departures threshold: only the flat 40h + banded
          // second-shift Rooms components apply, departures component = 0.
          '2026-07-10': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 60 }, 'Turndown Attendant': { paid: 58 } } },
          // At/above the threshold: the +8h departures component kicks in too.
          '2026-07-11': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 70 }, 'Turndown Attendant': { paid: 66 } } }
        },
        rooms: { '2026-07-09': 100, '2026-07-10': 100 } // previous night drives each day's Rooms-shift budget
      },
      'hk_r106_2026-07': {
        '2026-07-10': { occ: 100, comp: 0, net: 100, dep: 100 },  // 100 departures -> below 175 threshold
        '2026-07-11': { occ: 100, comp: 0, net: 100, dep: 175 }   // exactly at the threshold boundary
      }
    });
    const { win } = await loadApp({ seed });

    // ── Below threshold (100 departures): flat 40h (shift 1, rooms) + 0h
    // (departures component, below 175) + 24h (shift 2, rooms=100 -> 91-135
    // band) = 64h. Both positions compute identically. ──
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-10'), 64, '40h flat + 0h (100 departures is below the 175 threshold) + 24h (rooms=100 -> 91-135 band) = 64h');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-10'), 64, 'Turndown computes the same total as Laundry for the same day, per Carlos\'s "these share a standard"');

    // ── At the threshold boundary (175 departures, inclusive): the +8h
    // departures component now applies. ──
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-11'), 72, '40h flat + 8h (175 departures hits the 175-Infinity band) + 24h (rooms=100 again) = 72h');

    // ── Confirm the threshold has no lower band at all, unlike every other
    // driver in this app so far (Unifocus's own data — not a bug). ──
    const bands = win.UNIFOCUS_STANDARDS['Laundry Attendant'].find((c) => c.driver === 'departures').bands;
    t.eq(win.unifocusBandLookup(bands, 174), 0, 'one below the threshold contributes zero hours, not a partial band');
    t.eq(win.unifocusBandLookup(bands, 175), 8, 'exactly at the threshold contributes the full 8h');

    // ── Laundry and Turndown share the same VALUES but are distinct array
    // objects (not the same reference) — editing one later can't silently
    // change the other. ──
    t.assert(win.UNIFOCUS_STANDARDS['Laundry Attendant'] !== win.UNIFOCUS_STANDARDS['Turndown Attendant'], 'Laundry and Turndown have their own separate arrays, not a shared reference');
    t.eq(JSON.stringify(win.UNIFOCUS_STANDARDS['Laundry Attendant']), JSON.stringify(win.UNIFOCUS_STANDARDS['Turndown Attendant']), 'but their band tables are identical in value, per Carlos\'s instruction');

    // ── By Position table: both positions' Unifocus columns are populated
    // on a real render, not just via the raw function. ──
    win.dashSelectedDate = new Date(2026, 6, 11);
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = html.split('<tr>');
    const laundryRow = rows.find((r) => />Laundry</.test(r)) || '';
    const turndownRow = rows.find((r) => />Turndown</.test(r)) || '';
    t.assert(/72\.00/.test(laundryRow), "Laundry's row shows its computed Unifocus total (72.00h)");
    t.assert(/72\.00/.test(turndownRow), "Turndown's row shows the same total independently");
  }
};
