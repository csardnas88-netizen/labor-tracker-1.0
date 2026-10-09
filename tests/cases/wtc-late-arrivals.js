/* Carlos's ask, 2026-10-09, right after the Overview tab shipped: he
   doesn't always catch a late arrival himself, so use the Weekly Time
   Card Report he already uploads for Time Card Check to find anyone
   who clocked in more than 10 minutes after their Scheduled time, and
   log it automatically — no review step, confirmed with him directly.

   Paychex's report has its own Scheduled/Work Start columns per day,
   printed as two separate tokens each (the "H:MM" time, then a
   separate AM/PM marker a bit further right) — parseWtc now captures
   both onto d.schedTime/d.workStartTime alongside the hour totals it
   already read. The fixture coordinates below for Maria Aguilar and
   Susan Aguilar Ambrocio are copied directly off a real export
   (Weekly-Time-Card-Report 10092026.pdf, read 2026-10-09) rather than
   invented, specifically to pin down the real column x-positions and
   the real "Scheduled sometimes isn't recorded that day" gap. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Weekly Time Card Report: Scheduled/Work Start columns parse correctly, and a 10+ minute late arrival auto-logs itself (idempotently)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Real PDF item coordinates (page 1) ──
    // Maria Aguilar, ID 26100343: 10/03 and 10/04 have NO Scheduled value
    // printed (Paychex left it blank that day) — only Work Start. 10/08
    // has both, and she clocked in 3 minutes EARLY.
    const items = [
      { str: 'Employee:', x: 45.7, y: 71.9 }, { str: 'Aguilar,', x: 93.7, y: 71.9 },
      { str: 'Maria', x: 129.7, y: 71.9 }, { str: 'ID:', x: 204.9, y: 71.9 }, { str: '26100343', x: 219.4, y: 71.9 },
      { str: '10/03/2026', x: 13.9, y: 99.0 }, { str: 'Work', x: 91.2, y: 99.0 },
      { str: '8:59', x: 192.9, y: 99.0 }, { str: 'AM', x: 213.0, y: 99.0 },
      { str: '12:25', x: 235.4, y: 99.0 }, { str: 'PM', x: 260.5, y: 99.0 },
      { str: '12:57', x: 280.4, y: 99.0 }, { str: 'PM', x: 305.5, y: 99.0 },
      { str: '5:33', x: 332.4, y: 99.0 }, { str: 'PM', x: 352.4, y: 99.0 },
      { str: '8.03', x: 384.6, y: 99.0 }, { str: '0.00', x: 411.6, y: 99.0 },
      { str: '8.03', x: 528.7, y: 99.0 }, { str: '0.53', x: 560.1, y: 99.0 },
      { str: '10/08/2026', x: 13.9, y: 127.5 }, { str: 'Work', x: 91.2, y: 127.5 },
      { str: '8:15', x: 147.9, y: 127.5 }, { str: 'AM', x: 168.0, y: 127.5 },
      { str: '8:12', x: 192.9, y: 127.5 }, { str: 'AM', x: 213.0, y: 127.5 },
      { str: '12:11', x: 235.4, y: 127.5 }, { str: 'PM', x: 260.5, y: 127.5 },
      { str: '12:40', x: 280.4, y: 127.5 }, { str: 'PM', x: 305.5, y: 127.5 },
      { str: '5:01', x: 332.4, y: 127.5 }, { str: 'PM', x: 352.4, y: 127.5 },
      { str: '8.33', x: 384.6, y: 127.5 }, { str: '0.00', x: 411.6, y: 127.5 },
      { str: '8.33', x: 528.7, y: 127.5 }, { str: '0.48', x: 560.1, y: 127.5 },
      // Susan Aguilar Ambrocio, ID 26100002: 10/08 — Scheduled 2:00 PM,
      // Work Start 2:58 PM — a real 58-minute-late day.
      { str: 'Employee:', x: 21.7, y: 173.7 }, { str: 'Aguilar', x: 69.7, y: 173.7 },
      { str: 'Ambrocio,', x: 103.2, y: 173.7 }, { str: 'Susan', x: 150.2, y: 173.7 },
      { str: 'ID:', x: 204.9, y: 173.7 }, { str: '26100002', x: 219.4, y: 173.7 },
      { str: '10/08/2026', x: 13.9, y: 257.8 }, { str: 'Work', x: 91.2, y: 257.8 },
      { str: '2:00', x: 147.9, y: 257.8 }, { str: 'PM', x: 168.0, y: 257.8 },
      { str: '2:58', x: 192.9, y: 257.8 }, { str: 'PM', x: 213.0, y: 257.8 },
      { str: '8:54', x: 237.9, y: 257.8 }, { str: 'PM', x: 258.0, y: 257.8 },
      { str: '9:15', x: 282.9, y: 257.8 }, { str: 'PM', x: 303.0, y: 257.8 },
      { str: '9:58', x: 332.4, y: 257.8 }, { str: 'PM', x: 352.4, y: 257.8 },
      { str: '6.65', x: 384.6, y: 257.8 }, { str: '0.00', x: 411.6, y: 257.8 },
      { str: '6.65', x: 528.7, y: 257.8 }, { str: '0.35', x: 560.1, y: 257.8 },
    ];

    const report = win.parseWtc(items);

    t.eq(report.byId['26100343'].days['2026-10-03'].schedTime, '', "no Scheduled value printed that day parses to blank, not a guess");
    t.eq(report.byId['26100343'].days['2026-10-03'].workStartTime, '8:59 AM', 'Work Start still parses even with no Scheduled column that day');
    t.eq(report.byId['26100343'].days['2026-10-08'].schedTime, '8:15 AM', 'Scheduled parses correctly when present');
    t.eq(report.byId['26100343'].days['2026-10-08'].workStartTime, '8:12 AM', 'Work Start parses correctly alongside it');
    t.eq(report.byId['26100343'].days['2026-10-08'].reg, 8.33, 'the existing hour-total columns are unaffected by the new time columns');
    t.eq(report.byId['26100002'].days['2026-10-08'].schedTime, '2:00 PM', "Susan's Scheduled parses correctly (PM column)");
    t.eq(report.byId['26100002'].days['2026-10-08'].workStartTime, '2:58 PM', "Susan's Work Start parses correctly");

    // ── Candidates: only Susan's 58-minute-late day qualifies ──
    const candidates = win.wtcLateArrivalCandidates(report);
    t.eq(candidates.length, 1, 'Maria\'s no-Scheduled days are skipped, and her one real pair (8:15 AM -> 8:12 AM) is EARLY, not late — only Susan qualifies');
    t.eq(candidates[0].empId, '26100002', "Susan's record is the one flagged");
    t.eq(candidates[0].date, '2026-10-08', 'on the correct date');
    t.eq(candidates[0].scheduledTime, '2:00 PM', 'with the scheduled time carried through');
    t.eq(candidates[0].arrivalTime, '2:58 PM', 'and the actual arrival time');
    t.eq(candidates[0].minutesLate, 58, '58 minutes late, computed correctly across the noon boundary');

    // ── Threshold is "more than 10", not "10 or more" ──
    const exactlyTenReport = {
      byId: { '1': { id: '1', name: 'Exactly Ten', days: {
        '2026-10-05': { schedTime: '8:00 AM', workStartTime: '8:10 AM' },
      }}},
    };
    t.eq(win.wtcLateArrivalCandidates(exactlyTenReport).length, 0, 'exactly 10 minutes late does not qualify — Carlos said "more than 10"');
    const elevenReport = {
      byId: { '1': { id: '1', name: 'Eleven', days: {
        '2026-10-05': { schedTime: '8:00 AM', workStartTime: '8:11 AM' },
      }}},
    };
    t.eq(win.wtcLateArrivalCandidates(elevenReport).length, 1, '11 minutes late does qualify');

    // ── Auto-log: writes a real Late Arrival record ──
    const added = win.wtcAutoLogLateArrivals(report);
    t.eq(added, 1, 'exactly one late arrival auto-logged');
    let list = win.loadLateArrivals();
    t.eq(list.length, 1, 'one record now in storage');
    t.eq(list[0].empName, 'Aguilar Ambrocio, Susan', 'carries the name straight from the report');
    t.eq(list[0].minutesLate, 58, 'and the computed lateness');

    // ── Idempotent: re-running against the SAME report never double-logs ──
    const addedAgain = win.wtcAutoLogLateArrivals(report);
    t.eq(addedAgain, 0, 're-uploading the same report (e.g. a re-upload after a correction) adds nothing new');
    list = win.loadLateArrivals();
    t.eq(list.length, 1, 'still exactly one record, not two');

    // ── A manually-logged Late Arrival for the exact same person/date
    // also blocks the auto-import, so logging it by hand first and then
    // uploading the report later doesn't double it either. ──
    win.localStorage.setItem('latearrivals_data', JSON.stringify([
      { id: 999, date: '2026-10-08', empId: '26100002', empName: 'Susan Aguilar Ambrocio', pos: 'Housekeeping Supervisor', scheduledTime: '2:00 PM', arrivalTime: '2:58 PM', minutesLate: 58, created: '2026-10-08T00:00:00.000Z' },
    ]));
    const addedAfterManual = win.wtcAutoLogLateArrivals(report);
    t.eq(addedAfterManual, 0, 'a manually-logged record for the same empId+date blocks the auto-import too');
    t.eq(win.loadLateArrivals().length, 1, 'still just the one (manual) record');
  },
};
