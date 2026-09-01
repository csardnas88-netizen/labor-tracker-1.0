/* "Re-sync Request Off to this week" — Carlos's real report: after the
   real Aug 29 whole-blob data-loss incident, the week got rebuilt blank
   and Auto-fill ran on it before several already-captured Request Off
   entries could be re-applied — so a granted R-OFF/Flex/Vacation day
   silently drifted back to a plain schedule value (OFF/1/PM), even
   though the request itself was still sitting in the notebook, exactly
   as captured. Re-applies every notebook entry that touches the viewed
   week using the same write-through (reqWriteToSchedule) a fresh
   capture already uses — a manual "resync to source of truth". */
const { loadApp, fakeSession } = require('../_harness');

function buildWeek(win, weekStart, people) {
  const dates = [];
  const d = new Date(weekStart);
  for (let i = 0; i < 7; i++) { dates.push(win.dateStr(d)); d.setDate(d.getDate() + 1); }
  const SCH = win.dlLoadSchedule() || { days: {}, count: 0 };
  dates.forEach((ds) => {
    SCH.days[ds] = SCH.days[ds] || { sheet: 't', occ: '100', dep: '40', tdOcc: '' };
    Object.keys(people).forEach((bk) => {
      SCH.days[ds][bk] = people[bk].map((n) => [n, '1']);
    });
  });
  win.dlSaveSchedule(SCH);
  return dates;
}

module.exports = {
  name: 'schedResyncRequestOff re-applies drifted Request Off entries back onto the week (Carlos\'s real post-data-loss report)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const weekStart = new Date(2026, 8, 5); // Sat Sep 5 2026
    const dates = buildWeek(win, weekStart, {
      sup: ['Rolando', 'Susan A'],
      gra: ['Heidy Ajsoc'],
    });
    win.schedViewWeekStart = weekStart;

    // Three real captured requests, all successfully written through at
    // capture time (matches Carlos's real notebook: writtenDates set).
    win.saveReqNotebook([
      { id: 1, name: 'Rolando', crewKey: 'sup', crewLabel: 'Supervisors', type: 'roff', dates: [dates[2]], capturedBy: 'Carlos', capturedAt: '2026-08-29T14:41:59.000Z', writtenDates: [dates[2]] },
      { id: 2, name: 'Susan A', crewKey: 'sup', crewLabel: 'Supervisors', type: 'roff', dates: [dates[2]], capturedBy: 'Carlos', capturedAt: '2026-08-29T14:41:02.000Z', writtenDates: [dates[2]] },
      { id: 3, name: 'Heidy Ajsoc', crewKey: 'gra', crewLabel: 'AM Room Attendant', type: 'roff', dates: [dates[0], dates[1]], capturedBy: 'Carlos', capturedAt: '2026-08-29T14:38:27.000Z', writtenDates: [dates[0], dates[1]] },
    ]);

    // Simulate the real drift: Auto-fill (or anything else) ran after
    // the data loss and reset these cells back to plain values, even
    // though the notebook still says R-OFF for all three.
    const SCH = win.dlLoadSchedule();
    SCH.days[dates[2]].sup.filter((p) => p[0] === 'Rolando')[0][1] = '1';
    SCH.days[dates[2]].sup.filter((p) => p[0] === 'Susan A')[0][1] = '1';
    SCH.days[dates[0]].gra.filter((p) => p[0] === 'Heidy Ajsoc')[0][1] = 'OFF';
    SCH.days[dates[1]].gra.filter((p) => p[0] === 'Heidy Ajsoc')[0][1] = '1';
    win.dlSaveSchedule(SCH);

    const originalConfirm = win.confirm;
    win.confirm = () => true;
    win.schedResyncRequestOff();
    win.confirm = originalConfirm;

    const after = win.dlLoadSchedule();
    t.eq(after.days[dates[2]].sup.filter((p) => p[0] === 'Rolando')[0][1], 'R-OFF', "Rolando's drifted Monday is back to R-OFF");
    t.eq(after.days[dates[2]].sup.filter((p) => p[0] === 'Susan A')[0][1], 'R-OFF', "Susan A's drifted Monday is back to R-OFF too");
    t.eq(after.days[dates[0]].gra.filter((p) => p[0] === 'Heidy Ajsoc')[0][1], 'R-OFF', "Heidy's Saturday (drifted to plain OFF) is back to R-OFF");
    t.eq(after.days[dates[1]].gra.filter((p) => p[0] === 'Heidy Ajsoc')[0][1], 'R-OFF', "Heidy's Sunday (drifted to '1') is back to R-OFF too");

    // ── An entry whose dates fall OUTSIDE the viewed week is left
    // alone — resync only ever touches what's actually on screen. ──
    win.saveReqNotebook(win.loadReqNotebook().concat([
      { id: 4, name: 'Someone Later', crewKey: 'sup', crewLabel: 'Supervisors', type: 'roff', dates: ['2026-10-01'], capturedBy: 'Carlos', capturedAt: '2026-08-29T00:00:00.000Z', writtenDates: [] },
    ]));
    win.confirm = () => true;
    win.schedResyncRequestOff();
    win.confirm = originalConfirm;
    t.assert(!win.dlLoadSchedule().days['2026-10-01'], "an entry for a week that isn't even loaded does not somehow create a new day");

    // ── With nothing to resync, it says so plainly rather than
    // silently no-op'ing or asking for confirmation on nothing. ──
    win.saveReqNotebook([]);
    let askedConfirm = false;
    win.confirm = () => { askedConfirm = true; return true; };
    win.schedResyncRequestOff();
    win.confirm = originalConfirm;
    t.assert(!askedConfirm, 'no confirmation dialog when there is nothing in the notebook touching this week');
  },
};
