/* Carlos's real report, 2026-10-23, screenshot of the week of Oct 24:
   Maria Aguilar's PM Turndown cell correctly read TRAINING for several
   days, but her AM Room Attendant cell sat on a plain '1' right next to
   it the whole time — as if she were somehow working both positions at
   once that day.

   schedule-training-redirect-protected.js already proves TRAINING
   survives once Room Attendant has been redirected to read TURNDOWN (the
   STEADY STATE). This test covers the gap that left Maria's real
   screenshot broken: the FIRST reconciliation pass, before Room
   Attendant has ever been redirected — it still reads a bare, untouched
   '1'. _schedIsUnavailable doesn't count TRAINING (it isn't a rest day),
   so TRAINING fell all the way through to the plain-'1' fallback, where
   Room Attendant's literal '1' won source every time. The sync then
   correctly protected Turndown's TRAINING cell from being overwritten
   (the relabel loop's own exemption, already working) — but nothing ever
   ran the OTHER direction to fix Room Attendant's '1'. Fixed by giving
   TRAINING its own source-selection priority, ahead of a plain '1' and
   right alongside how an absence or a redirect already wins. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];

function buildWeek(win) {
  const days = {};
  DATES.forEach((ds, i) => {
    days[ds] = {
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      // Sat/Sun/Mon: training, never yet reconciled (Room Attendant still
      // a bare '1' — exactly Carlos's screenshot). Tue: genuinely off Room
      // Attendant too. Wed: off both. Thu/Fri: done training, really
      // working Room Attendant (the already-correct, already-tested
      // direction) — included so the fix doesn't disturb what already works.
      td: [['Maria Aguilar', i < 4 ? 'TRAINING' : (i === 4 ? 'OFF' : 'ROOMS')]],
      gra: [['Maria Aguilar', (i === 3 || i === 4) ? 'OFF' : '1']],
    };
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
  win.schedViewWeekStart = new Date(2026, 9, 24);
}

module.exports = {
  name: "A TRAINING cell wins cross-crew source selection over a plain, never-yet-reconciled '1' on another crew — fixes Carlos's real screenshot (Maria Aguilar training on Turndown while Room Attendant still showed a bare '1', as if working both at once)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    buildWeek(win);
    const SCH = win.dlLoadSchedule();
    const changed = win.schedApplyCrossCrewSync(SCH, DATES);
    t.assert(changed, 'the first reconciliation pass reports a change (Room Attendant needed fixing)');

    ['2026-10-24', '2026-10-25', '2026-10-26'].forEach((ds) => {
      t.eq(SCH.days[ds].td.find((p) => p[0] === 'Maria Aguilar')[1], 'TRAINING',
        'Turndown stays TRAINING, untouched — ' + ds);
      t.eq(SCH.days[ds].gra.find((p) => p[0] === 'Maria Aguilar')[1], 'TURNDOWN',
        "Room Attendant's bare '1' is corrected to TURNDOWN on the very first pass, not left looking like a double shift — " + ds);
    });

    // Tuesday: she's training AND genuinely off Room Attendant that day —
    // OFF is a real absence and must stay exactly as it is, not get
    // relabeled to TURNDOWN just because Turndown won source.
    t.eq(SCH.days['2026-10-27'].gra.find((p) => p[0] === 'Maria Aguilar')[1], 'OFF',
      'a genuine day off on the OTHER crew is left alone, not overwritten with the training away-label');

    // Wednesday: off both — untouched either way.
    t.eq(SCH.days['2026-10-28'].td.find((p) => p[0] === 'Maria Aguilar')[1], 'OFF');
    t.eq(SCH.days['2026-10-28'].gra.find((p) => p[0] === 'Maria Aguilar')[1], 'OFF');

    // Thu/Fri: training is over, she's really working Room Attendant —
    // the already-correct, already-tested direction (Turndown redirects
    // to ROOMS) must still work exactly as before, undisturbed by this fix.
    ['2026-10-29', '2026-10-30'].forEach((ds) => {
      t.eq(SCH.days[ds].gra.find((p) => p[0] === 'Maria Aguilar')[1], '1',
        'Room Attendant stays a real 1 once training is over — ' + ds);
      t.eq(SCH.days[ds].td.find((p) => p[0] === 'Maria Aguilar')[1], 'ROOMS',
        'and Turndown correctly redirects to ROOMS, the already-working direction — ' + ds);
    });

    // Idempotent: a second pass makes no further changes.
    const changed2 = win.schedApplyCrossCrewSync(SCH, DATES);
    t.assert(!changed2, 'a second pass over the now-reconciled week is a no-op');
  },
};
