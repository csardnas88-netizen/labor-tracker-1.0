/* Fifth position added to the Unifocus Labor Standard: Public Area
   Attendant. New pattern vs. every previous position: all 3 shifts
   (0700-1530, 1430-2300, 2200-0630) are Hotel-Rooms-only (no Departures
   component at all, like Turndown) — Carlos confirmed the hours don't
   scale with the occupancy NUMBER at all ("no depende de la ocupacion"),
   only whether it's nonzero. What actually varies is the DAY OF WEEK: the
   2200-0630 shift is 16h every night except Wednesday (24h), and 0700-1530
   is 8h on Sun/Sat but 16h Mon-Fri. unifocusBandLookup's third band
   element can now be a plain number (every existing position) or a
   7-element [Sun,Mon,Tue,Wed,Thu,Fri,Sat] array (Public Area only, so
   far). Also covers a related fix: unifocusHoursForPosition previously
   fetched/required departures data unconditionally, even for positions
   whose components never use it (Turndown, and now Public Area) — it now
   only requires departures when a component actually has driver:
   'departures', so a date whose R106 upload predates departures parsing
   no longer wrongly shows "—" for those positions. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Labor Standard: Public Area Attendant's hours vary by day of week, not by occupancy volume; departures-free positions no longer wrongly require departures data",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // See [[labor-tracker-tests]] — skips a legacy migration that would
      // otherwise reshuffle rooms[] entries on dates that also have a days[]
      // snapshot.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          // 2026-07-19 = Sunday, 07-20 = Monday, 07-22 = Wednesday,
          // 07-23 = Thursday (confirmed against the real R106 fixture PDF
          // used elsewhere this session, where 07-19-26 is labeled Sun).
          '2026-07-19': { totalPaid: 50, byPosition: { 'Public Area Attendant': { paid: 30 } } },
          '2026-07-20': { totalPaid: 50, byPosition: { 'Public Area Attendant': { paid: 38 } } },
          '2026-07-22': { totalPaid: 50, byPosition: { 'Public Area Attendant': { paid: 45 } } },
          '2026-07-23': { totalPaid: 50, byPosition: { 'Public Area Attendant': { paid: 39 } } }
        },
        // Night-before rooms for each of those days (any positive number —
        // Public Area's bands don't scale with the exact value).
        rooms: { '2026-07-18': 120, '2026-07-19': 120, '2026-07-20': 120, '2026-07-21': 120, '2026-07-22': 120 }
      },
      'hk_r106_2026-07': {
        '2026-07-19': { occ: 120, comp: 0, net: 120, dep: 80 },
        '2026-07-20': { occ: 120, comp: 0, net: 120, dep: 80 },
        '2026-07-22': { occ: 120, comp: 0, net: 120, dep: 80 },
        '2026-07-23': { occ: 120, comp: 0, net: 120, dep: 80 }
      }
    });
    const { win } = await loadApp({ seed });

    // ── Day-of-week sensitivity: same nonzero rooms every time, totals
    // differ purely by which day of the week ds falls on. ──
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-19'), 32, 'Sunday: 8h (0700-1530) + 8h (1430-2300, flat) + 16h (2200-0630) = 32h');
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-20'), 40, 'Monday: 16h + 8h + 16h = 40h — same rooms as Sunday, different day-of-week values');
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-22'), 48, "Wednesday: 16h + 8h + 24h = 48h — the overnight shift's one exception day");
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-23'), 40, 'Thursday: back to 16h + 8h + 16h = 40h, confirming Wednesday really was the outlier, not a general Wed+ bump');

    // ── Confirm the underlying band-lookup primitive directly, including
    // that a 2-arg call (no dow) still works for plain-number bands — the
    // existing House/Supervisor/Laundry/Turndown tests all call it this
    // way, and this change must not have broken them. ──
    const overnightBands = win.UNIFOCUS_STANDARDS['Public Area Attendant'][2].bands;
    t.eq(win.unifocusBandLookup(overnightBands, 120, 3), 24, 'dow=3 (Wednesday) resolves to the array\'s 4th element');
    t.eq(win.unifocusBandLookup(overnightBands, 120, 0), 16, 'dow=0 (Sunday) resolves to the array\'s 1st element');
    t.eq(win.unifocusBandLookup([[1, Infinity, 8]], 120), 8, 'a plain-number band still works with no dow argument at all (backward-compatible)');

    // ── The departures-requirement fix: seed a date with rooms data but NO
    // matching R106 record at all (getDeparturesForDay -> null for it).
    // Positions with no departures-driven component must still compute a
    // real number; a position that DOES need departures must still
    // correctly return null. ──
    t.eq(win.getDeparturesForDay('2026-07-21'), null, 'sanity check: no R106 record exists for this date at all');
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-21'), 40, 'Public Area has no departures component, so it computes normally (Tuesday: 16h + 8h + 16h = 40h) even though departures data is missing for this date');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-07-21'), 24, 'Turndown also has no departures component and computes normally too (same-day rooms=120 -> 91-135 band -> 24h) despite the missing departures record');
    t.eq(win.unifocusHoursForPosition('Laundry Attendant', '2026-07-21'), null, "Laundry DOES have a departures component, so it correctly still returns null when departures data is genuinely missing — the fix is scoped, not a blanket bypass");

    // ── By Position table renders the new column for Public Area too. ──
    win.dashSelectedDate = new Date(2026, 6, 22); // Wednesday
    win.setLaborStandardMode('unifocus');
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = html.split('<tr>');
    const publicRow = rows.find((r) => />Public Area</.test(r)) || '';
    t.assert(/48\.00/.test(publicRow), "Public Area's row shows Wednesday's computed total (48.00h)");
  }
};
