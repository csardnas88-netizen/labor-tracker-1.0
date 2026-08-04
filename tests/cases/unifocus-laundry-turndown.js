/* Third and fourth positions added to the Unifocus Labor Standard: Laundry
   Attendant and Turndown Attendant. Two new patterns beyond House
   Attendant/Housekeeping Supervisor:
   1) A single shift window can have TWO components (Laundry/Turndown's
      0815-1645 has both a flat Hotel Rooms component and a Hotel
      Departures component that only kicks in from 175+ departures, no
      lower band at all) — needed no code changes, every array entry is
      just summed regardless of how many nominally share a shift window.
   2) Laundry and Turndown share identical band VALUES (one Unifocus report
      page covers both) but NOT the same Rooms date convention: Carlos
      clarified turndown service happens in the evening for guests staying
      THAT night, so ALL of Turndown's Rooms-driven components use
      SAME-DAY occupancy (driver:'rooms_sameday' / getSameDayRoomsForDay),
      unlike every other position (including Laundry), which uses the
      standard night-before convention (driver:'rooms' / getRoomsForDay).
   See unifocus-houseperson.js / unifocus-supervisor.js for the shared
   mechanics (band lookup basics, departures manual-entry, null-propagation)
   this file doesn't re-test. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Labor Standard: Laundry/Turndown share band values but Turndown's Rooms components use same-day occupancy, not the night before",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // Skips migrateRoomsData() (index.html:7919), a one-time legacy
      // migration that runs on every app load and — if a rooms[ds] entry's
      // date ALSO has a days[ds] snapshot — reinterprets it as pre-migration
      // data and silently shifts its key back a day. This fixture
      // deliberately seeds rooms on dates that also have days snapshots (to
      // test the night-before-vs-same-day distinction), which would
      // otherwise collide with that migration and reshuffle the very values
      // being tested. See [[labor-tracker-tests]] for this as a general
      // fixture-writing gotcha, not just a Unifocus-specific one.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-11': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 50 }, 'Turndown Attendant': { paid: 75 } } },
          '2026-07-12': { totalPaid: 100, byPosition: { 'Laundry Attendant': { paid: 80 }, 'Turndown Attendant': { paid: 85 } } }
        },
        // Deliberately DIFFERENT values on the two adjacent dates, so a
        // night-before lookup and a same-day lookup for Jul 11 land on
        // clearly different numbers (50 vs 200) — proves the two
        // conventions are actually wired to different data, not
        // coincidentally equal. Jul 11 and Jul 12 are set EQUAL (200) so
        // the separate threshold check below isn't also tangled up in the
        // date-offset question.
        rooms: { '2026-07-10': 50, '2026-07-11': 200, '2026-07-12': 200 }
      },
      'hk_r106_2026-07': {
        '2026-07-11': { occ: 200, comp: 0, net: 200, dep: 100 },  // below the 175 threshold
        '2026-07-12': { occ: 200, comp: 0, net: 200, dep: 175 }   // exactly at the threshold boundary
      }
    });
    const { win } = await loadApp({ seed });

    // ── Jul 11: departures (100) below threshold, so only the Rooms
    // components matter — and Laundry vs Turndown now read DIFFERENT
    // rooms values for the exact same date. ──
    t.eq(win.getRoomsForDay('2026-07-11'), 50, "Laundry's rooms driver: the night before (Jul 10's 50), the existing convention");
    t.eq(win.getSameDayRoomsForDay('2026-07-11'), 200, "Turndown's rooms driver: Jul 11 itself (200), not the night before");

    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-11'), 56, '40h flat + 0h (100 departures, below threshold) + 16h (rooms=50 -> 1-90 band) = 56h');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-11'), 80, '40h flat + 0h (same departures check) + 40h (rooms=200 SAME-DAY -> 181-290 band) = 80h, genuinely different from Laundry');

    // ── Jul 12: rooms are equal (200) under either convention, isolating
    // just the departures-threshold behavior — confirms it's identical
    // machinery for both positions, only the Rooms date differs. ──
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-12'), 88, '40h flat + 8h (175 departures hits the threshold) + 40h (rooms=200 -> 181-290 band) = 88h');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-12'), 88, 'same 88h here since Jul 11 and Jul 12 rooms happen to be equal — the threshold logic itself is shared, only the date convention differs');

    // ── Confirm the departures threshold has no lower band at all
    // (Unifocus's own data — not a bug). ──
    const depBands = win.UNIFOCUS_STANDARDS['Laundry Attendant'].find((c) => c.driver === 'departures').bands;
    t.eq(win.unifocusBandLookup(depBands, 174), 0, 'one below the threshold contributes zero hours, not a partial band');
    t.eq(win.unifocusBandLookup(depBands, 175), 8, 'exactly at the threshold contributes the full 8h');

    // ── Laundry and Turndown are distinct array objects (not a shared
    // reference) with the same band VALUES but different driver names on
    // the Rooms components. ──
    t.assert(win.UNIFOCUS_STANDARDS['Laundry Attendant'] !== win.UNIFOCUS_STANDARDS['Turndown Attendant'], 'Laundry and Turndown have their own separate arrays, not a shared reference');
    t.assert(win.UNIFOCUS_STANDARDS['Laundry Attendant'].every((c) => c.driver !== 'rooms_sameday'), "Laundry has no same-day component — it uses the standard night-before convention throughout");
    t.assert(win.UNIFOCUS_STANDARDS['Turndown Attendant'].filter((c) => c.driver === 'rooms_sameday').length === 2, 'both of Turndown\'s Rooms components (not just one) use the same-day convention');

    // ── By Position table: both positions' Unifocus columns are populated
    // on a real render, with their (now different) computed totals. ──
    win.dashSelectedDate = new Date(2026, 6, 11);
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = html.split('<tr>');
    const laundryRow = rows.find((r) => />Laundry</.test(r)) || '';
    const turndownRow = rows.find((r) => />Turndown</.test(r)) || '';
    t.assert(/56\.00/.test(laundryRow), "Laundry's row shows its computed Unifocus total (56.00h)");
    t.assert(/80\.00/.test(turndownRow), "Turndown's row shows its own, different total (80.00h)");
  }
};
