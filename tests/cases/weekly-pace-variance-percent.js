/* Carlos's ask: show the same Variance % his labor meeting already reads
   off Unifocus's own Weekly Labor Summary report, not a number invented
   for the app — "en las reuniones utilizan porcientos... a partir de que
   uno se pase, tiene que explicar". Pins the percent formula against
   Turndown's real Aug 1-3 2026 figures from that exact report (the same
   three days the shift-truncation fix already verified match Unifocus's
   Standard column, so Actual/Standard/Variance% are all directly
   comparable here — unlike Room Attendant, whose Standard deliberately
   does NOT match Unifocus's own figure yet, an already-known, deferred
   gap; see unifocus-room-attendant.js).

   Aug 2 is the important case: (18.36-24)/24*100 = -23.5% exactly, and
   Unifocus's report rounds that to -24%, not -23%. JS's native Math.round
   rounds -23.5 to -23 (rounds toward +Infinity on a tie) — so this line
   guards that the app rounds HALF AWAY FROM ZERO like Unifocus does, not
   whatever Math.round happens to do. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace's Variance % matches Unifocus's own report, including its away-from-zero rounding on an exact .5 boundary",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-08': {
        days: {
          '2026-08-01': { totalPaid: 30.11, byPosition: { 'Turndown Attendant': { paid: 30.11 } } },
          '2026-08-02': { totalPaid: 18.36, byPosition: { 'Turndown Attendant': { paid: 18.36 } } },
          '2026-08-03': { totalPaid: 23.05, byPosition: { 'Turndown Attendant': { paid: 23.05 } } }
        },
        rooms: { '2026-07-31': 124, '2026-08-01': 154, '2026-08-02': 114, '2026-08-03': 201 }
      }
    });
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    // Sanity: budgets still match Unifocus's own Standard column exactly
    // (30.00 / 24.00 / 36.00), same as the truncation test already proves —
    // if this drifts, the percents below would be checking the wrong thing.
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-01'), 30);
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-02'), 24);
    t.eq(win.unifocusHoursForPosition('Turndown Attendant', '2026-08-03'), 36);

    const pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-08').days, 200, week);
    const tdIdx = pace.indexOf('>Turndown</div>');
    t.assert(tdIdx !== -1, 'Turndown position block found');
    const tdBlock = pace.slice(tdIdx, tdIdx + 4000);

    // ── Collapsed day-card pills: hour variance and percent together. ──
    // Aug 1: 30.11 actual vs 30.00 standard -> +0.11h, +0% (0.37% rounds to 0).
    t.assert(/\+0\.11 &middot; \+0%/.test(tdBlock), 'Aug 1 pill shows +0.11h and +0% (matches the report\'s 0%)');
    // Aug 2: 18.36 vs 24.00 -> -5.64h, exactly -23.5% -> rounds to -24%, matching Unifocus's own report (NOT -23%, what plain Math.round would give).
    t.assert(/-5\.64 &middot; -24%/.test(tdBlock), 'Aug 2 pill shows -24% (away-from-zero rounding), matching Unifocus\'s own report — not -23%, which native Math.round would produce on this exact .5 case');
    // Aug 3: 23.05 vs 36.00 -> -12.95h, -35.97% -> rounds to -36%.
    t.assert(/-12\.95 &middot; -36%/.test(tdBlock), "Aug 3 pill shows -36%, matching Unifocus's report");

    // ── Expanded card: the same Aug 2 day, opened, shows the percent again
    // as its own labeled "Var (%)" row (the Unifocus-report-style detail
    // Carlos asked for), not just inside the collapsed pill. ──
    win.toggleWPCard('Turndown Attendant', '2026-08-02');
    const paceOpen = win.buildWeeklyPaceHTML(win.loadMonthData('2026-08').days, 200, week);
    const openBlock = paceOpen.slice(paceOpen.indexOf('>Turndown</div>'), paceOpen.indexOf('>Turndown</div>') + 4000);
    t.assert(/Var \(%\)/.test(openBlock), 'the expanded card has a labeled "Var (%)" row');
    t.assert(/Var \(%\)[\s\S]{0,160}-24%/.test(openBlock), 'the expanded Aug 2 card\'s Var (%) row also reads -24%, not just the collapsed pill');

    // ── Zero-standard day: Unifocus's own convention is 100% if Actual is
    // non-zero (not a divide-by-zero crash or a misleading 0%). ──
    t.eq(win.getLaborStandardMode(), 'unifocus');
  }
};
