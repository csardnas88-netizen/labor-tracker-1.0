/* Carlos's ask, 2026-10-19: a last check right when he clicks Export
   Excel, not buried in the Schedule Checks card he might not scroll to.
   Two things, surfaced via a confirm() dialog he can still cancel out of
   to go fix the week first:
   1. Anyone with ZERO days off this week on a crew that's supposed to
      get days off at all — "Lorena no tiene días off" / "Lorena está en
      overtime", his own example phrasing for the same underlying gap.
      Deliberately stricter than Schedule Checks' own "below the usual
      minimum" warning (schedScheduleChecks) — zero, not merely low.
   2. Any day where Lobby's AM or PM shift has nobody actually working,
      even though people ARE assigned to that shift this week. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];

function buildWeek(win, overrides) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = Object.assign({
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      laundry: [['Lorena', '1']],
      lobby: [['Marroquin', '1'], ['Sarahi', '1']],
    }, overrides ? overrides(ds) : {});
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
  win.schedViewWeekStart = new Date(2026, 9, 24);
}

module.exports = {
  name: 'schedExportWarnings flags anyone with zero days off this week and any day Lobby AM/PM has nobody actually working, and schedExportExcel gates the export behind a confirm() dialog the user can cancel out of',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Lorena works all 7 days on Laundry, no day off at all. ──
    buildWeek(win);
    let SCH = win.dlLoadSchedule();
    let warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(warnings.some((w) => w.indexOf('Lorena') !== -1 && w.indexOf('no day off') !== -1),
      'Lorena (0 days off, every day "1" on Laundry) is flagged — ' + JSON.stringify(warnings));

    // ── Give Lorena 2 real days off — the warning must go away. ──
    buildWeek(win, (ds) => (ds === DATES[0] || ds === DATES[1]) ? { laundry: [['Lorena', 'OFF']] } : {});
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(!warnings.some((w) => w.indexOf('Lorena') !== -1),
      'Lorena is no longer flagged once she has real days off — ' + JSON.stringify(warnings));

    // ── Lobby PM (Sarahi) is OFF the whole week — Marroquin (AM) still
    // covers every day, so only PM days should be flagged, never AM. ──
    buildWeek(win, () => ({ lobby: [['Marroquin', '1'], ['Sarahi', 'OFF']] }));
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    const pmGaps = warnings.filter((w) => w.indexOf('Lobby PM has no coverage') !== -1);
    const amGaps = warnings.filter((w) => w.indexOf('Lobby AM has no coverage') !== -1);
    t.eq(pmGaps.length, 7, 'Lobby PM flagged as uncovered all 7 days — ' + JSON.stringify(warnings));
    t.eq(amGaps.length, 0, 'Lobby AM never flagged — Marroquin covers every day');

    // ── A clean week: a second AM person (Gabriela) and second PM
    // person (Andrea) let Marroquin/Sarahi each take a real day off
    // without ever leaving their shift uncovered, and everyone
    // (including the two backups) gets at least one day off too. ──
    buildWeek(win, (ds) => {
      const amRow = ['Marroquin', ds === DATES[0] ? 'OFF' : '1'];
      const gabRow = ['Gabriela', ds === DATES[1] ? 'OFF' : '1'];
      const pmRow = ['Sarahi', ds === DATES[2] ? 'OFF' : '1'];
      const andRow = ['Andrea', ds === DATES[3] ? 'OFF' : '1'];
      const lorena = ['Lorena', ds === DATES[4] ? 'OFF' : '1'];
      return { laundry: [lorena], lobby: [amRow, gabRow, pmRow, andRow] };
    });
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    t.eq(warnings.length, 0, 'a genuinely clean week produces no warnings — ' + JSON.stringify(warnings));

    // ── Integration: schedExportExcel must gate the real export behind
    // confirm() when warnings exist, and respect Cancel. ──
    buildWeek(win); // back to Lorena with 0 days off
    win.schedViewWeekStart = new Date(2026, 9, 24);
    win.ExcelJS = {}; // just enough to pass the "library loaded" guard; never actually reached if confirm() is declined
    let confirmMsg = null;
    win.confirm = (msg) => { confirmMsg = msg; return false; };
    await win.schedExportExcel();
    t.assert(confirmMsg && confirmMsg.indexOf('Lorena') !== -1, 'schedExportExcel asks for confirmation naming the real issue before exporting — got: ' + confirmMsg);
  },
};
