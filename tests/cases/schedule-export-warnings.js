/* Carlos's ask, 2026-10-19: a last check right when he clicks Export
   Excel, not buried in the Schedule Checks card he might not scroll to.
   Two things, surfaced via a confirm() dialog he can still cancel out of
   to go fix the week first:
   1. Anyone BELOW their crew's usual minimum days off (SCHED_MIN_OFF) —
      "Lorena no tiene días off" / "Lorena está en overtime", his own
      example phrasing. Originally shipped at literally zero only;
      widened 2026-10-19 after his real report that Abby (6 worked days,
      just 1 day off) wasn't flagged — now matches schedScheduleChecks'
      own "below the usual minimum" standard, just surfaced here too.
   2. Any day where Lobby's AM or PM shift has nobody actually working,
      even though people ARE assigned to that shift this week.
   Also 2026-10-19: forces a fresh schedApplyLinkedPeople/
   schedApplyCrossCrewSync pass before reading anything, so this never
   evaluates a stale cross-crew state (his real report: a Lobby cell
   that should've shown LAUNDRY was still blank when he hit Export). */
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
  name: 'schedExportWarnings flags anyone below their crew\'s usual minimum days off (not just literally zero), any day Lobby AM/PM has nobody actually working, forces a fresh cross-crew sync pass first, and schedExportExcel gates the export behind a confirm() dialog the user can cancel out of',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Lorena works all 7 days on Laundry, zero days off. ──
    buildWeek(win);
    let SCH = win.dlLoadSchedule();
    let warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(warnings.some((w) => w.indexOf('Lorena') !== -1 && w.indexOf('0 days off') !== -1),
      'Lorena (0 days off, every day "1" on Laundry) is flagged — ' + JSON.stringify(warnings));

    // ── Carlos's real report: Abby worked 6 of 7 days (just 1 day off,
    // below Laundry's usual 2) and was NOT flagged under the old
    // literally-zero threshold — she must be now. ──
    buildWeek(win, (ds) => ({ laundry: [['Lorena', '1'], ['Abby', ds === DATES[0] ? 'OFF' : '1']] }));
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(warnings.some((w) => w.indexOf('Abby') !== -1 && w.indexOf('1 day off') !== -1 && w.indexOf('usually 2') !== -1),
      'Abby (1 day off, below the usual 2) is now flagged too — ' + JSON.stringify(warnings));

    // ── Give Lorena 2 real days off, matching Laundry's usual minimum —
    // the warning must go away. ──
    buildWeek(win, (ds) => (ds === DATES[0] || ds === DATES[1]) ? { laundry: [['Lorena', 'OFF']] } : {});
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(!warnings.some((w) => w.indexOf('Lorena') !== -1),
      'Lorena is no longer flagged once she has 2 real days off (the usual minimum) — ' + JSON.stringify(warnings));

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
    // person (Andrea) let Marroquin/Sarahi each take 2 real days off
    // (the usual minimum) without ever leaving their shift uncovered,
    // and everyone (including the two backups and Lorena) reaches 2
    // days off too. ──
    buildWeek(win, (ds) => {
      const amRow = ['Marroquin', (ds === DATES[0] || ds === DATES[1]) ? 'OFF' : '1'];
      const gabRow = ['Gabriela', (ds === DATES[2] || ds === DATES[3]) ? 'OFF' : '1'];
      const pmRow = ['Sarahi', (ds === DATES[4] || ds === DATES[5]) ? 'OFF' : '1'];
      const andRow = ['Andrea', (ds === DATES[0] || ds === DATES[6]) ? 'OFF' : '1'];
      const lorena = ['Lorena', (ds === DATES[1] || ds === DATES[2]) ? 'OFF' : '1'];
      return { laundry: [lorena], lobby: [amRow, gabRow, pmRow, andRow] };
    });
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    t.eq(warnings.length, 0, 'a genuinely clean week (everyone at the usual minimum, every shift covered every day) produces no warnings — ' + JSON.stringify(warnings));

    // ── Forced sync: a Laundry row genuinely working, with her OWN
    // linked Lobby row still sitting blank+'added' (exactly the shape
    // schedAddPerson creates via "+ Add someone to this crew", never
    // reconciled — Carlos's real report), must be caught/fixed as a
    // SIDE EFFECT of calling schedExportWarnings, not just read as-is.
    // Uses the real generic cross-crew mechanism (any name on 2+
    // crews), not a SCHED_LINKED_PEOPLE pair. ──
    buildWeek(win, (ds) => ({
      laundry: [['Lorena', 'OFF'], ['Vanesa', '1']],
      lobby: [['Marroquin', 'OFF'], ['Gabriela', '1'], ['Vanesa', '', 'added']],
    }));
    SCH = win.dlLoadSchedule();
    t.eq(SCH.days[DATES[0]].lobby.find((p) => p[0] === 'Vanesa')[1], '', "Vanesa's Lobby cell starts out genuinely blank, not yet reconciled");
    win.schedExportWarnings(SCH, DATES);
    const afterSync = win.dlLoadSchedule();
    DATES.forEach((ds) => {
      t.eq(afterSync.days[ds].lobby.find((p) => p[0] === 'Vanesa')[1], 'LAUNDRY',
        "calling schedExportWarnings forces the blank Lobby cell to reconcile to LAUNDRY (she's genuinely working Laundry) — " + ds);
    });

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
