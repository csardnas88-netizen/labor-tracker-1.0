/* The Unifocus standard was originally only on Labor's DAILY "By Position"
   table. Carlos then asked for it on the WEEKLY Labor Pace card too — first
   as side-by-side Current/Unifocus columns, then later asked to convert
   that to the same Current/Unifocus TOGGLE already used on By Position
   ([[labor-tracker-unifocus-standard]]), so the weekly card only ever shows
   one standard's Budget+Variance at a time, picked by getLaborStandardMode().

   Two things this covers that the per-day tests can't:
   1) The weekly figure is a SUM across the week's reported days, computed
      per day (each day's own departures/rooms/day-of-week) and then added —
      not one lookup against a weekly average. Day-of-week-sensitive
      positions like Public Area make that distinction observable.
   2) Positions with no Unifocus standard on file render "—" for Budget AND
      Variance when the toggle is on Unifocus, while Current mode still
      computes normally for them (and vice versa can't happen here since
      every listed position has a LABOR_STD entry).

   Calls buildWeeklyPaceHTML() DIRECTLY with an explicit week rather than
   going through showPage('labor'). renderDashDayAnalysis picks its week via
   getDashWeek(), which is derived from the real system clock — so a fixture
   pinned to fixed calendar dates silently falls outside "this week" and the
   card renders as an empty string. That exact clock-dependence is what
   already left 5 other cases in this suite failing (see
   [[labor-tracker-v6-64-name-parsing]]); passing wk explicitly keeps this
   test deterministic no matter when it runs. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace's Budget/Variance columns follow the Current/Unifocus toggle, summed per reported day",
  async run(t) {
    // Week of Sat 2026-07-18 .. Fri 2026-07-24 (the app's hotel week runs
    // Sat-Fri). Two reported days: Sun 07-19 and Wed 07-22 — Wednesday
    // matters, it's Public Area's one day-of-week exception (24h overnight
    // instead of 16h).
    const seed = Object.assign(fakeSession(), {
      // See [[labor-tracker-tests]] — skips the legacy rooms migration that
      // would otherwise reshuffle rooms[] keys on dates that also have a
      // days[] snapshot.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-19': { totalPaid: 60, byPosition: { 'Public Area Attendant': { paid: 30 }, 'Room Attendant': { paid: 30 } } },
          '2026-07-22': { totalPaid: 60, byPosition: { 'Public Area Attendant': { paid: 36 }, 'Room Attendant': { paid: 24 } } }
        },
        rooms: { '2026-07-18': 120, '2026-07-19': 120, '2026-07-21': 120, '2026-07-22': 120 }
      },
      'hk_r106_2026-07': {
        '2026-07-19': { occ: 120, comp: 0, net: 120, dep: 80 },
        '2026-07-22': { occ: 120, comp: 0, net: 120, dep: 80 }
      }
    });
    const { win } = await loadApp({ seed });

    // Per-day sanity: Sunday and Wednesday genuinely differ for Public Area.
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-19'), 32, 'Sunday: 8 + 8 + 16 = 32h');
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-22'), 48, 'Wednesday: 16 + 8 + 24 = 48h');

    const month = JSON.parse(win.localStorage.getItem('hk_month_2026-07'));
    const week = { start: new Date(2026, 6, 18), end: new Date(2026, 6, 24) };

    // ── Current Standard (the default) — LABOR_STD budgets, and the card
    // carries the toggle control itself. ──
    t.eq(win.getLaborStandardMode(), 'current', 'defaults to Current Standard with no stored preference');
    let pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(pace.length > 0, 'the weekly pace card renders for a week that has reported days');
    t.assert(/Current Standard/.test(pace), 'the card renders the toggle, showing Current Standard as active');

    let rows = pace.split('border-top:1px solid var(--border)');
    let paRow = rows.find((r) => /Public Area/.test(r)) || '';
    let raRow = rows.find((r) => /Room Attendant/.test(r)) || '';

    // Public Area: LABOR_STD is a flat 32h/day fixed x 2 reported days = 64h;
    // actual = 30 + 36 = 66 -> variance +2.00h.
    t.assert(/64\.00h/.test(paRow), "Public Area's Current-mode budget is the LABOR_STD flat 32h/day x 2 days = 64h");
    t.assert(/\+2\.00h/.test(paRow), 'Public Area is +2.00h over the Current-mode budget (66 actual - 64 budget)');
    t.assert(!/80\.00h/.test(paRow), 'the Unifocus figure (80.00h) is NOT shown while in Current mode');

    // Room Attendant: 120 rooms (night before, both days) x 56.2% x 2 = 134.88h.
    t.assert(/134\.88h/.test(raRow), "Room Attendant's Current-mode budget computes normally (120 rooms x 56.2% x 2 reported days = 134.88h)");

    // ── Switch to Unifocus — the SAME card function, re-driven by the
    // toggle's persisted mode, now shows only the Unifocus figures. ──
    win.setLaborStandardMode('unifocus');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(/Unifocus/.test(pace), 'the toggle now shows Unifocus as active');

    rows = pace.split('border-top:1px solid var(--border)');
    paRow = rows.find((r) => /Public Area/.test(r)) || '';
    raRow = rows.find((r) => /Room Attendant/.test(r)) || '';

    // Public Area's weekly Unifocus budget is the SUM of its two reported
    // days (32 + 48 = 80), not a single lookup — one lookup for the week
    // would land on 32 or 48, never 80.
    t.assert(/80\.00h/.test(paRow), "Public Area's weekly Unifocus budget sums each day's own day-of-week value (32 + 48 = 80h), not one lookup for the whole week");
    t.assert(!/64\.00h/.test(paRow), 'the Current-mode LABOR_STD figure (64.00h) is no longer shown once switched to Unifocus');
    // actual = 30 + 36 = 66; 66 - 80 = -14.00
    t.assert(/-14\.00h/.test(paRow), "Public Area's Unifocus variance is actual (66h) minus the Unifocus budget (80h)");

    // Room Attendant has no Unifocus standard on file at all -> em-dash in
    // BOTH Budget and Variance, while Actual still renders.
    t.eq((raRow.match(/>—</g) || []).length, 2, 'a position with no Unifocus standard shows the em-dash in both Budget and Variance');
    t.assert(!/134\.88h/.test(raRow), "Room Attendant's Current-mode LABOR_STD budget (134.88h) does not leak through in Unifocus mode");

    // ── Switching back to Current re-renders cleanly (no stale Unifocus
    // figures left over from the prior call). ──
    win.setLaborStandardMode('current');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(!/80\.00h/.test(pace), 'switching back to Current mode shows no trace of the Unifocus figures');
  }
};
