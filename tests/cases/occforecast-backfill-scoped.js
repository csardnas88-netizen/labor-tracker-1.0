/* Carlos's real report, 2026-10-19: House Attendant/Supervisor/Houseman's
   standard was visibly slow to update after changing Departures on the
   Schedule page — "a veces se demora que ocurra el cambio". He then
   asked whether OCC got the same fix, not just Departures — yes: both
   fields share the exact same schedSetNum code path (the scoping call
   is guarded by `field==='occ'||field==='dep'`, one line, not two
   separate ones), so there's nothing field-specific left to fix. The
   numbers
   WERE being recomputed synchronously (schedSetNum -> _schedRefreshTotals
   patches the DOM cells directly), but right after that, schedSetNum also
   called occForecastBackfillFromSchedule() with no argument, which scans
   EVERY day ever saved to the schedule (days are never pruned) doing a
   localStorage read+parse per day — all before the browser gets a chance
   to paint the already-computed update. The delay grows with how much
   schedule history has piled up.

   Fix: occForecastBackfillFromSchedule now takes an optional onlyDs,
   scoping the scan to just the one day that could actually have changed
   when called live from schedSetNum. The OTHER caller (renderOccupancy's
   self-heal, catching up a week built any way other than a live edit —
   Fill Week, an Excel upload, another device) still calls with no
   argument and must keep scanning full history. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'occForecastBackfillFromSchedule(onlyDs) scopes to just that one day (making a live Departures/OCC edit fast), while the no-arg call used by renderOccupancy\'s self-heal still backfills every week in history',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // Two different hotel weeks, each with their own occ/dep already on
    // the schedule but no occForecast record saved yet for either.
    const weekADs = '2026-10-24'; // Sat, hotel week start Oct 24
    const weekBDs = '2026-10-17'; // Sat, a different hotel week
    const days = {};
    days[weekADs] = { sheet: 't', occ: '150', dep: '60', tdOcc: '150' };
    days[weekBDs] = { sheet: 't', occ: '140', dep: '55', tdOcc: '140' };
    win.dlSaveSchedule({ days, count: 2, savedAt: new Date().toISOString() });

    const weekAKey = win.occForecastWeekKey(win.parseLocalDate(weekADs));
    const weekBKey = win.occForecastWeekKey(win.parseLocalDate(weekBDs));
    t.eq(win.loadOccForecast(weekAKey), null, 'no occForecast record for week A yet');
    t.eq(win.loadOccForecast(weekBKey), null, 'no occForecast record for week B yet');

    // ── The real call site: editing Departures on week A's day via
    // schedSetNum (exactly what Carlos does on the Schedule page). ──
    win.schedSetNum(weekADs, 'dep', '80');

    const recA = win.loadOccForecast(weekAKey);
    t.assert(recA, "week A's occForecast record now exists after editing its own day");
    t.eq(recA.days[weekADs].depSched, 80, "week A's day reflects the new Departures value");
    t.eq(win.loadOccForecast(weekBKey), null, "week B's record was NOT touched by a scoped edit to week A's day — this is what makes the live edit fast");

    // ── The no-arg call (renderOccupancy's self-heal) must still catch
    // up EVERY week, including the one the scoped edit above skipped. ──
    win.occForecastBackfillFromSchedule();
    const recB = win.loadOccForecast(weekBKey);
    t.assert(recB, "week B's occForecast record now exists after the full, no-argument backfill — full-history self-heal is still intact");
    t.eq(recB.days[weekBDs].depSched, 55, "week B's day got its real Departures value from the full scan");

    // ── Carlos's follow-up: OCC must be scoped exactly the same way,
    // not just Departures. A third, still-untouched week, edited via
    // the 'occ' field this time. ──
    const weekCDs = '2026-10-10';
    const days2 = Object.assign({}, win.dlLoadSchedule().days, {
      [weekCDs]: { sheet: 't', occ: '160', dep: '65', tdOcc: '160' },
    });
    win.dlSaveSchedule({ days: days2, count: 3, savedAt: new Date().toISOString() });
    const weekCKey = win.occForecastWeekKey(win.parseLocalDate(weekCDs));
    t.eq(win.loadOccForecast(weekCKey), null, "no occForecast record for week C yet");

    win.schedSetNum(weekCDs, 'occ', '171');
    const recC = win.loadOccForecast(weekCKey);
    t.assert(recC, "week C's occForecast record now exists after editing its own day via OCC");
    t.eq(recC.days[weekCDs].sched, 171, "week C's day reflects the new OCC value");
    t.eq(win.loadOccForecast(weekAKey).days[weekADs].depSched, 80, "week A's own record is untouched by the OCC edit on week C — still the 80 from its earlier Departures edit, not reset or clobbered");
  },
};
