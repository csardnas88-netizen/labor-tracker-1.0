/* Carlos's real report, 2026-10-10: he added a Tardiness for Abby,
   confirmed she WAS on today's schedule, and still got no scheduled
   time with no explanation why — same silent-failure shape as the
   employee-picker bug fixed earlier the same day.

   Root cause: schedScheduledStartTime only ever searched the crews her
   PICKED POSITION normally sits in (SCHED_UF_POS). If she's actually
   covering a different crew that day (lobby covering someone, borrowed
   into Laundry, etc.), the narrow search finds nothing even though
   she's really on the schedule — just filed under a different
   position's card. schedScheduledStartTimeReason now explains exactly
   why the lookup came up empty, and that reason is both toasted on
   save and persisted on the record itself (so it's still visible
   later, not just in a toast that disappears in a few seconds). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedScheduledStartTimeReason: explains WHY the scheduled time lookup failed, and that reason persists on the saved Tardiness record',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const ds = '2026-10-13'; // a Tuesday

    // ── No Schedule Draft at all ──
    let r = win.schedScheduledStartTimeReason(ds, 'Abby', 'Public Area Attendant');
    t.eq(r.time, null, 'no time when there is no Schedule Draft at all');
    t.assert(/no weeks loaded at all/.test(r.reason), 'reason says there are no weeks loaded at all');

    // ── A Schedule Draft exists, but not for THIS week ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { '2000-01-01': { lobby: [['Nobody', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    r = win.schedScheduledStartTimeReason(ds, 'Abby', 'Public Area Attendant');
    t.eq(r.time, null, 'no time when this specific week is missing');
    t.assert(/isn.t loaded/.test(r.reason), "reason says THIS week isn't loaded");

    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: {
        [ds]: {
          // Abby is NOT under 'lobby' (Public Area Attendant's own crew) —
          // she's covering Laundry today instead, same real shape as
          // Carlos's report.
          laundry: [['Abby', '1']],
          gra: [['Someone Else', '1']],
        },
      },
      count: 1, savedAt: new Date().toISOString(),
    }));

    // ── Abby's real case: on the schedule, just under a different crew
    // than her picked position's own crews ──
    r = win.schedScheduledStartTimeReason(ds, 'Abby', 'Public Area Attendant');
    t.eq(r.time, null, "no time — the narrow search only checks Public Area Attendant's own crews (lobby), and she's not there");
    t.assert(/Laundry Attendant/.test(r.reason), "the reason finds her on the WIDER search and names the crew she's actually under (Laundry Attendant)");
    t.assert(/Public Area Attendant/.test(r.reason), "and contrasts it with the position that was picked for her");

    // ── Genuinely not on the schedule anywhere today ──
    r = win.schedScheduledStartTimeReason(ds, 'Totally Absent Person', 'Public Area Attendant');
    t.eq(r.time, null);
    t.assert(/Couldn.t find her on today.s Schedule Draft at all/.test(r.reason), "a real not-found case gets its own distinct reason, not the 'wrong crew' one");

    // ── Ambiguous: House Attendant maps to TWO crews (hp + pmhm), and she
    // appears in both the same day — has to be within the position's OWN
    // crews to actually be ambiguous (a duplicate in some unrelated crew
    // never even gets looked at by the narrow, position-scoped search). ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: {
        [ds]: { hp: [['Dup Person', '1']], pmhm: [['Dup Person', '1']] },
      },
      count: 1, savedAt: new Date().toISOString(),
    }));
    r = win.schedScheduledStartTimeReason(ds, 'Dup Person', 'House Attendant');
    t.eq(r.time, null);
    t.assert(/more than one crew/.test(r.reason), 'an ambiguous (2+ crew) match gets its own reason');

    // ── A crew with no defined shift time (Managers) ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { mgr: [['Manager Mike', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    r = win.schedScheduledStartTimeReason(ds, 'Manager Mike', 'Managers');
    t.eq(r.time, null);
    t.assert(/no defined shift time/.test(r.reason), 'a crew with no shift-time definition (Managers) gets its own reason instead of a bare null');

    // ── The success path still returns a real time, no reason ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { lobby: [['Sarahi', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    r = win.schedScheduledStartTimeReason(ds, 'Sarahi', 'Public Area Attendant');
    t.assert(!!r.time, 'an unambiguous match still returns a real time');
    t.eq(r.reason, null, 'and no reason, since nothing went wrong');
    t.eq(win.schedScheduledStartTime(ds, 'Sarahi', 'Public Area Attendant'), r.time, 'the plain (non-reason) wrapper still returns the same time, unchanged behavior for existing callers');

    // ── End to end: saving a Tardiness for Abby's real scenario persists
    // the reason onto the record and surfaces it in both the toast and
    // the rendered list, not just a generic "note it by hand". ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { laundry: [['Abby', '1']], gra: [['Someone Else', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    win.showNewLateArrivalModal();
    win.document.getElementById('laDate').value = ds;
    win.document.getElementById('laEmp').value = '900|Abby|Public Area Attendant';
    win.document.getElementById('laArrival').value = '07:30';
    win.saveNewLateArrival();

    const toastMsg = win.document.getElementById('toastMsg').textContent;
    t.assert(/Laundry Attendant/.test(toastMsg), "the save toast itself explains the real reason (she's under Laundry today)");

    const list = win.loadLateArrivals();
    const rec = list.find((c) => c.empName === 'Abby');
    t.assert(!!rec, "Abby's record still saved even though the scheduled time couldn't be resolved");
    t.eq(rec.scheduledTime, null, 'no scheduled time on the record');
    t.assert(/Laundry Attendant/.test(rec.scheduledTimeReason), 'the specific reason is stored on the record itself, not just shown once in a toast');

    win.setCofTab('latearrivals');
    const html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Laundry Attendant/.test(html), "the rendered Tardiness list shows the real reason, so it's visible later too, not just in the toast that already disappeared");
  },
};
