/* The Unifocus standard was originally only on Labor's DAILY "By Position"
   table. Carlos then asked for it on the WEEKLY Labor Pace card too, and
   picked the "extra columns in the existing card" layout (over a separate
   card) — so buildWeeklyPaceHTML now carries its own Unifocus Budget +
   Unifocus Variance pair alongside the existing LABOR_STD Budget/Variance.

   Two things this covers that the per-day tests can't:
   1) The weekly figure is a SUM across the week's reported days, computed
      per day (each day's own departures/rooms/day-of-week) and then added —
      not one lookup against a weekly average. Day-of-week-sensitive
      positions like Public Area make that distinction observable.
   2) Positions with no Unifocus standard on file render "—" in the two new
      columns while their existing LABOR_STD columns still work.

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
  name: "Weekly Labor Pace carries its own Unifocus budget/variance columns, summed per reported day",
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
    const pace = win.buildWeeklyPaceHTML(month.days, month.rooms, {
      start: new Date(2026, 6, 18),
      end: new Date(2026, 6, 24)
    });
    t.assert(pace.length > 0, 'the weekly pace card renders for a week that has reported days');

    // The card gained a Unifocus group header alongside the existing one.
    t.assert(/Current standard/i.test(pace), 'the weekly pace card labels the existing columns as the current standard');
    t.assert(/Unifocus/.test(pace), 'and adds a Unifocus group header');

    // Rows are separated by the border-top divider on each position row.
    const rows = pace.split('border-top:1px solid var(--border)');
    const paRow = rows.find((r) => /Public Area/.test(r)) || '';
    const raRow = rows.find((r) => /Room Attendant/.test(r)) || '';

    // Public Area's weekly Unifocus budget is the SUM of its two reported
    // days (32 + 48 = 80), not a single lookup — one lookup for the week
    // would land on 32 or 48, never 80.
    t.assert(/80\.00h/.test(paRow), "Public Area's weekly Unifocus budget sums each day's own day-of-week value (32 + 48 = 80h), not one lookup for the whole week");

    // Its Unifocus variance is judged against that Unifocus total, entirely
    // separately from the LABOR_STD variance in the same row.
    // actual = 30 + 36 = 66; 66 - 80 = -14.00
    t.assert(/-14\.00h/.test(paRow), "Public Area's Unifocus variance is actual (66h) minus the Unifocus budget (80h), not a reuse of the LABOR_STD variance");
    // ...and the LABOR_STD pair is untouched: 32h/day fixed x 2 days = 64h.
    t.assert(/64\.00h/.test(paRow), "Public Area's existing LABOR_STD budget (32h/day x 2 reported days = 64h) still renders alongside it");

    // Room Attendant has no Unifocus standard on file at all -> em-dash in
    // BOTH new columns (not just one), while its normal Budget/Variance
    // still compute. Asserting the em-dash sits behind the gold divider
    // specifically, so this can't pass on an unrelated dash elsewhere in
    // the row.
    t.assert(/border-left:1px solid var\(--gold\);padding-left:8px;">—</.test(raRow), "a position with no Unifocus standard renders the em-dash in the Unifocus budget cell (the one carrying the gold divider)");
    t.eq((raRow.match(/>—</g) || []).length, 2, 'both Unifocus columns show the em-dash, not just the budget one');
    t.assert(/134\.88h/.test(raRow), "...while its existing LABOR_STD budget still computes normally (120 rooms x 56.2% x 2 reported days = 134.88h)");
  }
};
