/* Third and fourth positions added to the Unifocus Labor Standard: Laundry
   Attendant and Turndown Attendant. Initially misattributed as ONE shared
   standard (both report pages arrived in the same message, same Planner
   Settings block, easy to conflate) — corrected after Carlos clarified
   they're two SEPARATE, unrelated standards on different shifts:
   - Laundry Attendant (0815-1645 only): a flat 40h Hotel Rooms component
     (night-before, the standard convention) PLUS a Hotel Departures
     component that only kicks in from 175+ departures (same-day, no lower
     band at all below 175).
   - Turndown Attendant (1700-2300 only): a single 5-band Hotel Rooms
     component, but using SAME-DAY occupancy (not night-before) — turndown
     service happens that evening, for guests staying that night. No
     departures component at all for Turndown.
   See unifocus-houseperson.js / unifocus-supervisor.js for the shared
   mechanics (band lookup basics, departures manual-entry, null-propagation)
   this file doesn't re-test. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Labor Standard: Laundry (flat + departures threshold) and Turndown (same-day banded rooms only) are separate standards, not a shared one",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // Skips migrateRoomsData() (index.html:7919), a one-time legacy
      // migration that runs on every app load and — if a rooms[ds] entry's
      // date ALSO has a days[ds] snapshot — reinterprets it as pre-migration
      // data and silently shifts its key back a day. See
      // [[labor-tracker-tests]] for this as a general fixture gotcha.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-11': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 35 }, 'Turndown Attendant': { paid: 42 } } },
          '2026-07-12': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 44 }, 'Turndown Attendant': { paid: 38 } } }
        },
        // Deliberately DIFFERENT prevDs-vs-same-day values on Jul 11, so
        // Laundry (night-before) and Turndown (same-day) clearly read
        // different rooms numbers for the same date.
        rooms: { '2026-07-10': 50, '2026-07-11': 200, '2026-07-12': 200 }
      },
      'hk_r106_2026-07': {
        '2026-07-11': { occ: 200, comp: 0, net: 200, dep: 100 },  // below the 175 threshold
        '2026-07-12': { occ: 200, comp: 0, net: 200, dep: 175 }   // exactly at the threshold boundary
      }
    });
    const { win } = await loadApp({ seed });

    // ── Laundry: flat 40h (rooms, night-before) + departures threshold. ──
    t.eq(win.getRoomsForDay('2026-07-11'), 50, "Laundry's rooms driver: the night before (Jul 10's 50)");
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-11'), 40, '40h flat (rooms=50>0) + 0h (100 departures, below the 175 threshold) = 40h');
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-12'), 48, '40h flat + 8h (175 departures hits the threshold) = 48h');

    // ── Turndown: ONLY the same-day banded Rooms component — no flat 40h,
    // no departures component at all. Crossing the 175-departures threshold
    // (Jul 11 -> Jul 12) must NOT change Turndown's total, unlike Laundry's. ──
    t.eq(win.getSameDayRoomsForDay('2026-07-11'), 200, "Turndown's rooms driver: Jul 11 itself (200), not the night before (which was 50)");
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-11'), 36, 'rooms=200 same-day -> 181-290 band -> 40h, truncated to whole 6h shifts -> 36h (no flat component, no departures component)');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-12'), 36, 'same 36h even though departures hit 175 here — Turndown has no departures component to react to it, unlike Laundry (which went 40h -> 48h on this same date)');

    // ── Confirm the departures threshold itself has no lower band at all
    // (Unifocus's own data for Laundry — not a bug). ──
    const depBands = win.UNIFOCUS_STANDARDS['Laundry Attendant'].find((c) => c.driver === 'departures').bands;
    t.eq(win.unifocusBandLookup(depBands, 174), 0, 'one below the threshold contributes zero hours, not a partial band');
    t.eq(win.unifocusBandLookup(depBands, 175), 8, 'exactly at the threshold contributes the full 8h');

    // ── Structural check: each position has exactly the components it
    // should, nothing borrowed from the other. ──
    t.eq(win.UNIFOCUS_STANDARDS['Laundry Attendant'].length, 2, "Laundry has exactly 2 components (flat rooms + departures threshold), no 1700-2300 shift");
    t.eq(win.UNIFOCUS_STANDARDS['Turndown Attendant'].length, 1, 'Turndown has exactly 1 component (the same-day banded Rooms shift), no flat/departures components');
    t.assert(win.UNIFOCUS_STANDARDS['Laundry Attendant'].every((c) => c.driver !== 'rooms_sameday'), 'Laundry uses no same-day driver at all — it stays on the standard night-before convention throughout');
    t.assert(win.UNIFOCUS_STANDARDS['Turndown Attendant'].every((c) => c.driver === 'rooms_sameday'), "Turndown's only component uses the same-day convention");

    // ── On a real render, both positions show their independent computed
    // Standard. Checked on Weekly Labor Pace's day-cards; the By Position
    // table this used to read was removed in v6.97.0 as redundant with
    // them. buildWeeklyPaceHTML is called directly with an explicit week
    // to stay clock-independent — see the note in unifocus-weekly-pace.js. ──
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) };
    const pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    function blockFor(label) {
      const i = pace.indexOf('>' + label + '</div>');
      t.assert(i !== -1, label + ' block found in Weekly Labor Pace');
      return pace.slice(i, i + 2500);
    }
    t.assert(/Standard[\s\S]{0,160}40\.00/.test(blockFor('Laundry')), "Laundry's Jul 11 card shows its computed Unifocus Standard (40.00h)");
    t.assert(/Standard[\s\S]{0,160}36\.00/.test(blockFor('Turndown')), "Turndown's Jul 11 card shows its own, independently-computed Standard (36.00h — its 40h band truncated to whole 6h shifts)");
  }
};
