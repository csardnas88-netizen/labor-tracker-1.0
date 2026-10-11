/* Carlos's ask, 2026-10-09, right after the Overview tab shipped: he
   doesn't always catch a late arrival himself, so use the Weekly Time
   Card Report he already uploads for Time Card Check to find anyone
   who clocked in more than 10 minutes after their Scheduled time, and
   log it automatically — no review step, confirmed with him directly.

   Paychex's report has its own Scheduled/Work Start columns per day,
   printed as two separate tokens each (the "H:MM" time, then a
   separate AM/PM marker a bit further right) — parseWtc captures both
   onto d.schedTime/d.workStartTime alongside the hour totals it
   already read. Part 1 below (PDF parsing itself) uses real coordinates
   off an actual export (Weekly-Time-Card-Report 10092026.pdf, read
   2026-10-09) to pin down the real column x-positions.

   Part 2 update, 2026-10-10 — Carlos's follow-up: Paychex's own
   Scheduled column (d.schedTime, confirmed parsing correctly in Part 1)
   is NOT what late-arrival detection reads anymore. He pointed out the
   Schedule Draft is the far more reliable source — Paychex leaves its
   Scheduled column blank often enough that real late arrivals were
   being silently skipped — so wtcLateArrivalCandidates now resolves
   the scheduled time via schedScheduledStartTimeReason, the exact same
   Schedule-Draft lookup a manually-logged Tardiness already uses.
   Paychex's Work Start (the real clock punch) is still the arrival
   time; only the "what time was she SUPPOSED to start" side moved.
   Part 2 below uses its own synthetic employees/Schedule Draft rather
   than Maria/Susan's real production roster position, so the fixture
   isn't at the mercy of their real Housekeeping Supervisor/Room
   Attendant shift times defined elsewhere in the app. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Weekly Time Card Report: Scheduled/Work Start columns parse correctly (Part 1), and a 10+ minute late arrival — scheduled time from the Schedule Draft, arrival from Work Start — auto-logs itself (idempotently) (Part 2)',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // Part 2's Schedule Draft: Monday 2026-10-05 is a weekday, so the
      // 'gra' crew's standard shift (8:15 AM - 4:45 PM) applies to
      // everyone placed in it below.
      hk_dl_schedule: JSON.stringify({
        days: {
          '2026-10-05': { gra: [
            ['Edge Ten', '1'], ['Edge Eleven', '1'], ['Nina Torres', '1'],
          ]},
          // 2026-10-06 deliberately has no day entry at all — simulates
          // a date the Schedule Draft can't resolve a time for.
        },
        count: 1, savedAt: new Date().toISOString(),
      }),
    });
    const { win } = await loadApp({ seed });

    // ── Part 1: Real PDF item coordinates (page 1) ──
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

    // ── Part 2: candidates now come from the Schedule Draft, not
    // Paychex's own Scheduled column — report2 below carries only
    // Work Start per day; d.schedTime is never read for this anymore. ──
    const report2 = {
      byId: {
        '91001': { id: '91001', name: 'Edge Ten', days: {
          // gra's weekday start is 8:15 AM; 8:25 AM is exactly 10 late.
          '2026-10-05': { workStartTime: '8:25 AM' },
        }},
        '91002': { id: '91002', name: 'Edge Eleven', days: {
          '2026-10-05': { workStartTime: '8:26 AM' },
        }},
        '91003': { id: '91003', name: 'Nina Torres', days: {
          '2026-10-05': { workStartTime: '8:50 AM' },
          // No Schedule Draft day at all for 10-06 — her scheduled time
          // can't be resolved, so this day is skipped regardless of how
          // late 11:00 AM would otherwise look against any assumed time.
          '2026-10-06': { workStartTime: '11:00 AM' },
        }},
      },
    };

    // ── Threshold is "more than 10", not "10 or more" ──
    const candidates = win.wtcLateArrivalCandidates(report2);
    t.eq(candidates.length, 2, 'Edge Ten (exactly 10 late) is excluded; Edge Eleven (11 late) and Nina (35 late on 10-05) qualify — Nina\'s unresolvable 10-06 day is skipped entirely');
    const byName = Object.fromEntries(candidates.map((c) => [c.empName, c]));
    t.assert(!byName['Edge Ten'], 'exactly 10 minutes late does not qualify — Carlos said "more than 10"');
    t.assert(!!byName['Edge Eleven'], '11 minutes late does qualify');
    t.eq(byName['Edge Eleven'].minutesLate, 11, 'with the exact minute count');
    t.eq(byName['Edge Eleven'].scheduledTime, '8:15 AM', "the scheduled time comes from the Schedule Draft's gra weekday start, not any Paychex column");

    const nina = candidates.find((c) => c.empId === '91003');
    t.eq(nina.date, '2026-10-05', "only Nina's resolvable day became a candidate");
    t.eq(nina.scheduledTime, '8:15 AM', 'scheduled time resolved from the Schedule Draft');
    t.eq(nina.arrivalTime, '8:50 AM', 'arrival time is still Paychex\'s real Work Start punch');
    t.eq(nina.minutesLate, 35, '35 minutes late, computed correctly');

    // ── Auto-log: writes a real Late Arrival record ──
    const added = win.wtcAutoLogLateArrivals(report2);
    t.eq(added, 2, 'both qualifying candidates (Edge Eleven, Nina) auto-logged; Edge Ten and Nina\'s unresolvable day are not');
    let list = win.loadLateArrivals();
    t.eq(list.length, 2, 'two records now in storage');
    const ninaRec = list.find((c) => c.empId === '91003');
    t.eq(ninaRec.empName, 'Nina Torres', 'carries the name straight from the report');
    t.eq(ninaRec.minutesLate, 35, 'and the computed lateness');

    // ── Idempotent: re-running against the SAME report never double-logs ──
    const addedAgain = win.wtcAutoLogLateArrivals(report2);
    t.eq(addedAgain, 0, 're-uploading the same report (e.g. a re-upload after a correction) adds nothing new');
    list = win.loadLateArrivals();
    t.eq(list.length, 2, 'still exactly two records');

    // ── A manually-logged Late Arrival for the exact same person/date
    // also blocks the auto-import, so logging it by hand first and then
    // uploading the report later doesn't double it either. ──
    win.localStorage.setItem('latearrivals_data', JSON.stringify([
      { id: 999, date: '2026-10-05', empId: '91003', empName: 'Nina Torres', pos: '', scheduledTime: '8:15 AM', arrivalTime: '8:50 AM', minutesLate: 35, created: '2026-10-05T00:00:00.000Z' },
    ]));
    const addedAfterManual = win.wtcAutoLogLateArrivals(report2);
    t.eq(addedAfterManual, 1, 'Nina\'s record is already covered by the manual entry; only Edge Eleven still auto-logs');
    t.eq(win.loadLateArrivals().length, 2, 'still just two records total — the manual one plus Edge Eleven, no duplicate for Nina');
  },
};
