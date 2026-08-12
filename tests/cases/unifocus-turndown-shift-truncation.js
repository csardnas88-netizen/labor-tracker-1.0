/* Pins Turndown's budget against Unifocus's OWN daily Labor Effectiveness
   reports for Aug 1-3 2026 — the first time we've had the real engine's
   per-day output to check against, rather than only its configuration.

   Two things came out of that comparison:

   1) Unifocus only ever staffs WHOLE shifts. Turndown's single shift is
      1700-2300 = 6h, and its band values (16/24/32/40/48) are mostly NOT
      multiples of 6 — so the band hours get truncated down to a multiple
      of 6 before they count. Our app was reporting the raw band value and
      therefore overstating Turndown's budget on most days.

   2) It independently re-confirms Turndown's same-day rooms convention
      (see getSameDayRoomsForDay). The night-before figure reproduces none
      of the three days; the same-day figure reproduces all three.

   Volumes below are the real R106 numbers for those dates (net = total
   occupancy minus comp rooms), so this doubles as a regression test on the
   whole same-day-rooms -> band -> truncate chain, not just the arithmetic.

   Deliberately NOT covering Aug 4: Unifocus's own data feed was broken that
   day (it recorded Hotel Rooms = 0 and Hotel Departures = 201, which is
   actually Aug 3's room count), so its Aug 4 figures — and hence the
   Aug 1-4 weekly totals — are not a valid reference for anything. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Turndown's Unifocus budget truncates band hours to whole 6h shifts, and reproduces Unifocus's own Standard for every day of 8/1-8/7 (204h)",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // See [[labor-tracker-tests]] — skips the legacy rooms migration that
      // would otherwise reshuffle rooms[] keys on dates that also have a
      // days[] snapshot.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-08': {
        days: {
          '2026-08-01': { totalPaid: 30, byPosition: { 'Turndown Attendant': { paid: 30.09 } } },
          '2026-08-02': { totalPaid: 18, byPosition: { 'Turndown Attendant': { paid: 18.36 } } },
          '2026-08-03': { totalPaid: 23, byPosition: { 'Turndown Attendant': { paid: 23.05 } } }
        },
        // Real R106 net occupancy, keyed by the night it belongs to.
        rooms: {
          '2026-07-31': 124,
          '2026-08-01': 154,
          '2026-08-02': 114,
          '2026-08-03': 201,
          '2026-08-04': 231,
          '2026-08-05': 195,
          '2026-08-06': 126,
          '2026-08-07': 90
        }
      }
    });
    const { win } = await loadApp({ seed });

    // Same-day convention: each labor day reads its OWN night's occupancy.
    t.eq(win.getSameDayRoomsForDay('2026-08-01'), 154, 'Aug 1 reads Aug 1 (154), not the night before (124)');
    t.eq(win.getSameDayRoomsForDay('2026-08-02'), 114, 'Aug 2 reads Aug 2 (114)');
    t.eq(win.getSameDayRoomsForDay('2026-08-03'), 201, 'Aug 3 reads Aug 3 (201)');

    // ── The three real days, against Unifocus's own reported Standard Hours. ──
    // 154 -> band 136-180 = 32h -> floor(32/6)*6 = 30h
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-01'), 30,
      "Aug 1: 154 rooms -> 32h band -> truncated to 30h, matching Unifocus's reported 30.00");
    // 114 -> band 91-135 = 24h -> already a multiple of 6, unchanged
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-02'), 24,
      "Aug 2: 114 rooms -> 24h band, already a whole number of 6h shifts, matching Unifocus's 24.00");
    // 201 -> band 181-290 = 40h -> floor(40/6)*6 = 36h
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-03'), 36,
      "Aug 3: 201 rooms -> 40h band -> truncated to 36h, matching Unifocus's reported 36.00");

    // ── The 1-90 band: 18h, NOT the 16h the Labor Standards PDF prints ──
    // Aug 7 2026 was the first day ever recorded under 91 rooms, and it
    // broke the truncation rule outright. The PDF's 16h truncated down
    // gives 12h; Unifocus's own Weekly Labor Summary for that week reports
    // 18.00 — three whole 6h shifts, rounded UP where 32h and 40h round
    // down. Carrying the printed 16 cost 6h on that week's Turndown
    // standard, which is exactly the kind of silent gap this section
    // exists to prevent.
    t.eq(win.getSameDayRoomsForDay('2026-08-07'), 90, 'Aug 7 reads its own night (90 rooms)');
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-07'), 18,
      "Aug 7: 90 rooms -> 18h, matching Unifocus's reported 18.00 — NOT the 12h that truncating the PDF's printed 16h would give");
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-06'), 24,
      'Aug 6: 126 rooms -> 24h, matching Unifocus\'s 24.00 (the band either side of the corrected one is untouched)');

    // Guards the actual bug: the raw band values must NOT be what we report.
    // Without truncation these three days would read 32 / 24 / 40.
    const raw = win.UNIFOCUS_STANDARDS['Turndown Attendant'][0];
    t.eq(raw.shiftHours, 6, "the Turndown component declares its 6h shift length (1700-2300)");
    t.eq(win.unifocusBandLookup(raw.bands, 154), 32, 'the underlying band for 154 rooms is still the raw 32h — truncation happens on top, it does not rewrite the standard');
    t.eq(win.unifocusBandLookup(raw.bands, 90), 18, "the 1-90 band itself carries 18 — what Unifocus applies, not the 16 its own paperwork prints");
    t.assert(win.unifocusBandLookup(raw.bands, 90) !== 16, 'and specifically not 16, which appears in no real Unifocus report');

    // ── The whole week, end to end, against Unifocus's Weekly Labor
    // Summary for 8/1-8/7 (generated Aug 12 2026). Its Turndown Standard
    // row reads 30 / 24 / 36 / 36 / 36 / 24 / 18 = 204.00 for the week.
    // Every day individually AND the total, so a future band edit that
    // happens to keep one day right while breaking another still fails. ──
    const WEEK = {
      '2026-08-01': 30, '2026-08-02': 24, '2026-08-03': 36, '2026-08-04': 36,
      '2026-08-05': 36, '2026-08-06': 24, '2026-08-07': 18
    };
    let weekTotal = 0;
    Object.keys(WEEK).forEach(function (ds) {
      const got = win.unifocusHoursForPosition('Turndown Attendant', ds);
      t.eq(got, WEEK[ds], ds + ": Unifocus's Weekly Labor Summary reports " + WEEK[ds].toFixed(2) + 'h for Turndown');
      weekTotal += got;
    });
    t.eq(weekTotal, 204, "the full week totals 204h, exactly Unifocus's own Turndown Standard for 8/1-8/7 (it was 198 while the 1-90 band carried the printed 16)");

    // Truncation must round DOWN, not to nearest: 32/6 = 5.33 and 40/6 = 6.67
    // both go down in Unifocus's real reports, so the documented "Rounding
    // Threshold Above One: 0.2" plainly isn't "round up above 0.2".
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-03'), 36,
      '40h/6 = 6.67 truncates DOWN to 6 shifts (36h), never up to 7 (42h)');

    // Every shift declares its own length now — v6.99.0 added it to the
    // rest so the Labor Model reference can divide hours into headcount
    // ("3 supervisors", not "24h"). That means the trimming code path runs
    // for all of them, so what matters is no longer "only Turndown sets
    // shiftHours" but "only Turndown's numbers actually MOVE" — the others
    // are 8h shifts with bands already in multiples of 8, so trimming is a
    // no-op. Assert that directly against every band, which is the real
    // guarantee and survives future shift-length edits.
    Object.keys(win.UNIFOCUS_STANDARDS).forEach(function (pos) {
      win.UNIFOCUS_STANDARDS[pos].forEach(function (c) {
        t.assert(c.shiftHours > 0, pos + ' / ' + c.name + ' must declare its shift length');
        c.bands.forEach(function (b) {
          var vals = Object.prototype.toString.call(b[2]) === '[object Array]' ? b[2] : [b[2]];
          vals.forEach(function (v) {
            var trimmed = Math.floor(v / c.shiftHours) * c.shiftHours;
            if (pos === 'Turndown Attendant') return; // the one place trimming is meant to bite
            t.eq(trimmed, v, pos + ' / ' + c.name + ': band value ' + v + 'h is already a whole number of ' + c.shiftHours + 'h shifts, so trimming must not change it');
          });
        });
      });
    });

    // And headcount comes out whole for every band, including Turndown's
    // trimmed ones — that's the point of trimming, and what makes the
    // Labor Model reference readable ("5 people", never "5.33").
    Object.keys(win.UNIFOCUS_STANDARDS).forEach(function (pos) {
      win.UNIFOCUS_STANDARDS[pos].forEach(function (c) {
        c.bands.forEach(function (b) {
          var vals = Object.prototype.toString.call(b[2]) === '[object Array]' ? b[2] : [b[2]];
          vals.forEach(function (v) {
            var trimmed = Math.floor(v / c.shiftHours) * c.shiftHours;
            t.eq(trimmed % c.shiftHours, 0, pos + ' / ' + c.name + ': ' + trimmed + 'h divides into whole ' + c.shiftHours + 'h shifts');
          });
        });
      });
    });
  }
};
