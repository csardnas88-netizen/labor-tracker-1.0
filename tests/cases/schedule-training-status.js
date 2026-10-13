/* Carlos's ask, 2026-10-11, from a real example: Maria Aguilar starting
   PM Turndown training needs her own cell value — "TRAINING" — that:
   (1) still shows up as a real body on the schedule (a day worked, same
       as LOBBY/HOUSEMAN/TAILOR already count), but
   (2) is NOT one of the bodies a manager splits rooms/departures among
       when building the day's assignment, and
   (3) gets her own distinct color so that's obvious without reading
       every cell.

   (2) needed zero new exclusion logic: schedDayTotal/schedRatioCount
   already only count a plain numeric value (or a crew's own "away"
   label, or PM) — any other label, TRAINING included, was already
   excluded the same way LOBBY/HOUSEMAN/TAILOR/LAUNDRY/TURNDOWN/ROOMS
   already are. Daily Lineup's own room/floor assignment (dlIn) is even
   stricter — only a literal "1" counts as "in" — so TRAINING is
   automatically excluded there too. This test proves both guarantees
   hold for the new value specifically, not just that the old ones
   still do. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'TRAINING: counts as a day worked but never as a body for room/departures headcount or Daily Lineup assignment, and renders in its own color (Carlos\'s 2026-10-11 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-10-19';
    const days = {
      [ds]: {
        sheet: 't', occ: '150', dep: '40', tdOcc: '',
        td: [['Guadalupe', '1'], ['Maria Aguilar', 'TRAINING'], ['Paty', '1']],
      },
    };
    win.dlSaveSchedule({ days, count: 1, savedAt: new Date().toISOString() });

    // ── (2) Headcount: Maria is NOT one of the bodies counted ──
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), ds, 'td'), 2, "PM Turndown/GRA's real headcount is 2 (Guadalupe + Paty) — Maria's TRAINING cell doesn't add a third body");
    t.eq(win.schedRatioCount(win.dlLoadSchedule(), ds, 'td'), 2, "the 'rooms each' split divides among the same 2 real bodies, not 3");

    // ── (1) Still a day worked, same as LOBBY/HOUSEMAN/TAILOR ──
    t.assert(win.schedIsWorkDay('TRAINING'), 'TRAINING still counts as a real day worked, same as every other cover-label');

    // ── Daily Lineup's own room/floor assignment is even stricter
    // (only a literal "1" is "in") — TRAINING is excluded there for free. ──
    t.assert(win.dlIn('1'), 'sanity: a plain "1" is "in" for Daily Lineup purposes');
    t.assert(!win.dlIn('TRAINING'), "Maria's TRAINING cell is NOT 'in' for Daily Lineup — she gets no room/floor assignment while training");

    // ── Her own distinct color, not the shared gold cover-label color ──
    const trainingCss = win._schedCellCss('TRAINING', 'td');
    const lobbyCss = win._schedCellCss('HOUSEMAN', 'td');
    const oneCss = win._schedCellCss('1', 'td');
    t.assert(trainingCss.indexOf('var(--indigo)') !== -1, 'TRAINING renders in its own indigo color');
    t.assert(trainingCss !== lobbyCss, 'TRAINING is visually distinct from the shared PM/LOBBY/HOUSEMAN/TAILOR/LAUNDRY color');
    t.assert(trainingCss !== oneCss, 'and distinct from a plain working "1" too');

    // ── Auto-fill must never silently overwrite a day Carlos marked
    // TRAINING, same protection TAILOR already has. schedAutoFillCrew
    // assumes a real 7-day week internally, so this needs a full week,
    // not just the single day used above. ──
    const weekDates = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const names = ['Guadalupe', 'Maria Aguilar', 'Paty'];
    const weekDays = {};
    weekDates.forEach((d) => {
      weekDays[d] = { sheet: 't', occ: '150', dep: '40', tdOcc: '', td: names.map((n) => [n, '1']) };
    });
    weekDays[ds].td = [['Guadalupe', '1'], ['Maria Aguilar', 'TRAINING'], ['Paty', '1']];
    win.dlSaveSchedule({ days: weekDays, count: 7, savedAt: new Date().toISOString() });
    const schBefore = win.dlLoadSchedule();
    win.schedAutoFillCrew(schBefore, weekDates, 'td', names, 2, 0);
    t.eq(win.schedCellFor(schBefore, ds, 'td', 'Maria Aguilar'), 'TRAINING', "Auto-fill's own day-off placement never overwrites a TRAINING cell, same protection TAILOR/R-OFF/FLEX/VAC/CALL-OFF already have");
  },
};
