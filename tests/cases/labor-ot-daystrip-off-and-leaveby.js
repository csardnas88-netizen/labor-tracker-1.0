/* Carlos's real report, 2026-10-10: Petronila's Schedule Draft clearly
   showed her OFF Thursday, but her day-strip (and everyone else's)
   showed a bare "—" for any day with no ACTUAL hours record — never
   distinguishing a real day off from a report that just hasn't been
   uploaded yet. _laborOtDayStripHTML no longer keys classification off
   "is this in the past" at all: it checks for real hours first
   regardless of date, then falls back to the Schedule Draft (OFF vs
   working) for whatever's left, and only shows "—" when NEITHER source
   has anything — which naturally covers future days with the exact
   same logic, no separate branch needed.

   Same-day follow-up: the gold (still-to-work) day that would actually
   tip her over 40h now shows the real clock-out time to avoid it —
   her real scheduled start that day (schedShiftTimeText) plus however
   many hours are left in the 40h budget, not a flat guess. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Overtime day-strip: a real Schedule Draft OFF day shows "Off" (not "—") regardless of past/future, and the crossing gold day shows the real clock-out time',
  async run(t) {
    const ds = '2026-10-05'; // Monday, viewed day
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          // Wed: no actual hours report, but the Schedule Draft clearly
          // shows her OFF — this is Petronila's exact real case.
          '2026-10-07': { gra: [['Evangelina', 'OFF']] },
          // Fri: her one remaining scheduled work day — the gold cell
          // that should carry the "Out by" time.
          '2026-10-09': { gra: [['Evangelina', '1']] },
          // Thu (10-08) is deliberately left out of the schedule
          // entirely — genuinely unknown, should still show "—".
        },
        count: 1, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          // Sat/Sun/Mon: real reported hours, summing to exactly 33h so
          // the leave-by math below comes out to a clean number.
          '2026-10-03': { emps: [{ id: '80001', name: 'Evangelina', pos: 'Room Attendant', paid: 11, ot1: 0, unpaid: 0.5 }] },
          '2026-10-04': { emps: [{ id: '80001', name: 'Evangelina', pos: 'Room Attendant', paid: 11, ot1: 0, unpaid: 0.5 }] },
          '2026-10-05': { emps: [{ id: '80001', name: 'Evangelina', pos: 'Room Attendant', paid: 11, ot1: 0, unpaid: 0.5 }] },
          // Thu has no report either, same as Wed — but with no
          // Schedule Draft entry at all for that date, so it must read
          // "—" (unknown), not "Off".
        },
      },
    });
    const { win } = await loadApp({ seed });

    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    win.toggleLaborOtDetail('80001');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    const stripIdx = html.indexOf('Hours by day this week');
    t.assert(stripIdx !== -1, 'the day-by-day breakdown opened');
    const strip = html.slice(stripIdx, stripIdx + 2500);

    t.assert(/Sat[\s\S]{0,60}11h 0m/.test(strip), 'Saturday shows her real reported 11h');
    t.assert(/Wed[\s\S]{0,60}Off/.test(strip), "Wednesday shows 'Off' — Carlos's real bug: no hours report, but the Schedule Draft says OFF, so it's a real day off, not missing data");
    // innerHTML re-serializes the &mdash; entity back out as the literal
    // "—" character (standard DOM round-tripping), not the entity text.
    t.assert(!/Wed[\s\S]{0,60}—/.test(strip), "Wednesday must NOT show the generic '—' now that a real reason is known");
    t.assert(/Thu[\s\S]{0,60}—/.test(strip), 'Thursday (no report AND no Schedule Draft entry at all) still correctly shows "—" — genuinely unknown, not guessed at');
    t.assert(/Fri[\s\S]{0,60}8h/.test(strip), 'Friday (her one remaining scheduled day) shows the gold working cell');

    // ── Leave-by time: 33h worked so far (11+11+11) + her 8h Friday
    // shift would land at 41h, 1h over — so the budget before crossing
    // 40h is exactly 7h. Room Attendant's weekday start is 8:15 AM
    // (SCHED_SHIFT_TIMES.gra), so 8:15 AM + 7h = 3:15 PM. ──
    t.assert(/Out by 3:15 PM/.test(strip), 'Friday shows the real clock-out time (8:15 AM start + the 7h left in the 40h budget), not a flat guess');

    const projections = win.laborProjectedWeekHours(ds);
    const emp = projections.find((p) => p.id === '80001');
    t.eq(emp.hoursSoFar, 33, 'sanity check: 11+11+11 = 33h worked so far');
    t.eq(emp.projected, 41, 'sanity check: 33 + 8 (her one remaining day) = 41h projected, 1h over 40');
  },
};
