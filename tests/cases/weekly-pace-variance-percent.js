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
   whatever Math.round happens to do.

   Day-cards default to OPEN (Carlos's follow-up after trying compact-by-
   default first), so the percent shows up as its own labeled "Var (%)"
   row by default — this test checks that row, then explicitly collapses
   one day to confirm the percent also carries into the compact pill. */
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

    // ── Default render: cards are open, so each day's "Var (%)" row is
    // visible without tapping anything. ──
    const pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-08').days, 200, week);
    const tdIdx = pace.indexOf('>Turndown</div>');
    t.assert(tdIdx !== -1, 'Turndown position block found');
    const tdBlock = pace.slice(tdIdx, tdIdx + 5000);

    // Aug 1: 30.11 actual vs 30.00 standard -> +0.11h, +0% (0.37% rounds to 0).
    t.assert(/Var \(%\)[\s\S]{0,160}\+0%/.test(tdBlock), 'Aug 1\'s Var (%) row reads +0% (matches the report\'s 0%)');
    // Aug 2: 18.36 vs 24.00 -> -5.64h, exactly -23.5% -> rounds to -24%, matching Unifocus's own report (NOT -23%, what plain Math.round would give).
    t.assert(/Var \(%\)[\s\S]{0,160}-24%/.test(tdBlock), 'Aug 2\'s Var (%) row reads -24% (away-from-zero rounding), matching Unifocus\'s own report — not -23%, which native Math.round would produce on this exact .5 case');
    // Aug 3: 23.05 vs 36.00 -> -12.95h, -35.97% -> rounds to -36%.
    t.assert(/Var \(%\)[\s\S]{0,160}-36%/.test(tdBlock), "Aug 3's Var (%) row reads -36%, matching Unifocus's report");

    // ── Collapsing Aug 2 folds the same percent into the compact pill
    // (Actual/vs Budget/Variance), not just the open detail table. ──
    win.toggleWPCard('Turndown Attendant', '2026-08-02');
    const paceClosed = win.buildWeeklyPaceHTML(win.loadMonthData('2026-08').days, 200, week);
    const closedBlock = paceClosed.slice(paceClosed.indexOf('>Turndown</div>'), paceClosed.indexOf('>Turndown</div>') + 5000);
    t.assert(/-5\.64 &middot; -24%/.test(closedBlock), 'collapsing Aug 2 shows its hour variance and percent together in the compact pill');

    // ── Zero-standard day: Unifocus's own convention is 100% if Actual is
    // non-zero (not a divide-by-zero crash or a misleading 0%). ──
    t.eq(win.getLaborStandardMode(), 'unifocus');
  }
};
