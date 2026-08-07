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

    // ── Unifocus (the default since v6.84.0) — its own budgets. The
    // Current/Unifocus toggle itself no longer lives inside this card (it
    // moved to a single page-level control, per Carlos's "un solo selector"
    // request) — proving the toggle is respected now means checking the
    // budget figures below follow getLaborStandardMode(), not scraping the
    // button markup out of this string. ──
    t.eq(win.getLaborStandardMode(), 'unifocus', 'defaults to Unifocus with no stored preference');
    let pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(pace.length > 0, 'the weekly pace card renders for a week that has reported days');

    let rows = pace.split('border-top:1px solid var(--border)');
    let paRow = rows.find((r) => /Public Area/.test(r)) || '';
    let raRow = rows.find((r) => /Room Attendant/.test(r)) || '';

    // Public Area's weekly Unifocus budget is the SUM of its two reported
    // days (32 + 48 = 80), not a single lookup — one lookup for the week
    // would land on 32 or 48, never 80.
    t.assert(/80\.00h/.test(paRow), "Public Area's weekly Unifocus budget sums each day's own day-of-week value (32 + 48 = 80h), not one lookup for the whole week");
    t.assert(!/64\.00h/.test(paRow), 'the Current-mode LABOR_STD figure (64.00h) is NOT shown by default');
    // actual = 30 + 36 = 66; 66 - 80 = -14.00
    t.assert(/-14\.00h/.test(paRow), "Public Area's Unifocus variance is actual (66h) minus the Unifocus budget (80h)");

    // Room Attendant now has its own Unifocus standard too (v6.90.0's
    // per-room rate, not a banded lookup like the others — see
    // unifocus-room-attendant.js) — its weekly budget sums each day's own
    // rate-based total the same way Public Area sums its banded ones.
    // Per reported day: rooms=120 (night before), departures=80 (same day)
    // -> stayovers=40; (40*0.85*20 + 80*30)/60 = 51.33h/day x 2 days = 102.67h.
    t.assert(/102\.67h/.test(raRow), "Room Attendant's weekly Unifocus budget sums its own rate-based total across both reported days (51.33h x 2 = 102.67h)");
    // actual = 30 + 24 = 54; 54 - 102.67 = -48.67
    t.assert(/-48\.67h/.test(raRow), "Room Attendant's Unifocus variance is actual (54h) minus its own Unifocus budget (102.67h)");
    t.assert(!/134\.88h/.test(raRow), "Room Attendant's Current-mode LABOR_STD budget (134.88h) does not leak through by default");

    // ── Switch to Current Standard — the SAME card function, re-driven by
    // the toggle's persisted mode, now shows only the LABOR_STD figures. ──
    win.setLaborStandardMode('current');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);

    rows = pace.split('border-top:1px solid var(--border)');
    paRow = rows.find((r) => /Public Area/.test(r)) || '';
    raRow = rows.find((r) => /Room Attendant/.test(r)) || '';

    // Public Area: LABOR_STD is a flat 32h/day fixed x 2 reported days = 64h;
    // actual = 30 + 36 = 66 -> variance +2.00h.
    t.assert(/64\.00h/.test(paRow), "Public Area's Current-mode budget is the LABOR_STD flat 32h/day x 2 days = 64h");
    t.assert(/\+2\.00h/.test(paRow), 'Public Area is +2.00h over the Current-mode budget (66 actual - 64 budget)');
    t.assert(!/80\.00h/.test(paRow), 'the Unifocus figure (80.00h) is no longer shown once switched to Current');

    // Room Attendant: 120 rooms (night before, both days) x 56.2% x 2 = 134.88h.
    t.assert(/134\.88h/.test(raRow), "Room Attendant's Current-mode budget computes normally (120 rooms x 56.2% x 2 reported days = 134.88h)");

    // ── Switching back to Unifocus re-renders cleanly (no stale Current
    // figures left over from the prior call). ──
    win.setLaborStandardMode('unifocus');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(!/134\.88h/.test(pace), 'switching back to Unifocus mode shows no trace of the Current-mode figures');
  }
};
