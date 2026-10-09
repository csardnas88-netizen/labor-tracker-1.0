/* Carlos's ask, 2026-10-09: a second journal living inside the
   Call-Offs page (now split into Call-Offs / Late Arrivals tabs), so a
   tardiness pattern is as easy to document for the time & attendance
   policy as an absence already is. He only wants to type the actual
   arrival time — the scheduled start time is read automatically off
   that employee's own Schedule Draft cell for the day
   (schedScheduledStartTime), the same unambiguous crew-match rule
   schedApplyCallOff already uses for Call-Offs, just read-only: unlike
   a Call-Off, nothing here ever touches the Schedule Draft itself. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Late Arrivals: scheduled time auto-read from the Schedule Draft, minutes-late math, and the Call-Offs/Late Arrivals tab switcher',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // A loaded week with Marroquin on Lobby: Tuesday 2026-09-29 (weekday,
    // 7:00 AM start) and Sunday 2026-09-27 (weekend, same 7:00 AM start
    // for Lobby specifically, per SCHED_SHIFT_TIMES.lobby).
    const weekdayDs = '2026-09-29';
    const weekendDs = '2026-09-27';
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: {
        [weekdayDs]: { lobby: [['Marroquin', '1'], ['Gabriela', '1']] },
        [weekendDs]: { lobby: [['Marroquin', '1']] },
      },
      count: 2,
      savedAt: new Date().toISOString(),
    }));

    // ── schedScheduledStartTime: unambiguous match finds the real start time ──
    t.eq(win.schedScheduledStartTime(weekdayDs, 'Marroquin', 'Public Area Attendant'), '7:00 AM', "Marroquin's weekday Lobby start time is read straight off her Schedule Draft row");
    t.eq(win.schedScheduledStartTime(weekendDs, 'Marroquin', 'Public Area Attendant'), '7:00 AM', 'Lobby keeps the same 7:00 AM start on a weekend day too (per SCHED_SHIFT_TIMES.lobby)');
    t.eq(win.schedScheduledStartTime('2026-10-05', 'Marroquin', 'Public Area Attendant'), null, 'a date with no loaded week returns null rather than guessing');
    t.eq(win.schedScheduledStartTime(weekdayDs, 'Nobody Here', 'Public Area Attendant'), null, 'a name with no matching row also returns null');

    // ── time <-> minutes helpers ──
    t.eq(win._timeTextToMinutes('7:00 AM'), 420, '7:00 AM parses to 420 minutes since midnight');
    t.eq(win._timeTextToMinutes('2:30 PM'), 870, '2:30 PM parses correctly past noon');
    t.eq(win._minutesToTimeText(435), '7:15 AM', '435 minutes formats back to 7:15 AM');
    t.eq(win._hhmmToMinutes('07:15'), 435, 'a 24h <input type="time"> value parses to the same minute count');

    // ── Full New Late Arrival save flow, scheduled time found ──
    win.showNewLateArrivalModal();
    win.document.getElementById('laDate').value = weekdayDs;
    win.document.getElementById('laEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('laArrival').value = '07:15';
    win.saveNewLateArrival();

    let list = win.loadLateArrivals();
    t.eq(list.length, 1, 'saving writes exactly one late arrival record');
    t.eq(list[0].empName, 'Marroquin', 'the record carries the picked employee');
    t.eq(list[0].scheduledTime, '7:00 AM', "the scheduled time was auto-filled from the Schedule Draft, Carlos never typed it");
    t.eq(list[0].arrivalTime, '7:15 AM', 'the typed 24h arrival time displays in the same 12h style as the scheduled time');
    t.eq(list[0].minutesLate, 15, '15 minutes late, computed from the two times');
    t.eq(win.document.getElementById('lateArrivalModal'), null, 'the modal closes itself after saving');

    // ── A late arrival where the schedule can't resolve a unique match
    // still saves — just without a computed scheduledTime/minutesLate,
    // same "left for Carlos to note by hand" fallback Call-Offs already
    // has for an unmatched record. ──
    win.showNewLateArrivalModal();
    win.document.getElementById('laDate').value = '2026-10-05'; // week not loaded
    win.document.getElementById('laEmp').value = '100|Somebody Else|Public Area Attendant';
    win.document.getElementById('laArrival').value = '08:00';
    win.saveNewLateArrival();
    list = win.loadLateArrivals();
    t.eq(list.length, 2, 'the unmatched record still saves');
    const unmatched = list.find((c) => c.empName === 'Somebody Else');
    t.eq(unmatched.scheduledTime, null, 'no scheduled time could be found automatically');
    t.eq(unmatched.minutesLate, null, 'so minutes late is left null rather than guessed');

    // ── Tab switcher: defaults to Call-Offs, switches to Late Arrivals,
    // and back — both panels render inside the same #calloffsContent. ──
    win.showPage('calloffs');
    let html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/New Call-Off/.test(html), 'the Call-Offs tab is shown by default');
    t.assert(!/New Tardiness/.test(html), 'the Tardiness panel is not rendered while on the Call-Offs tab');

    win.setCofTab('latearrivals');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/New Tardiness/.test(html), 'switching tabs renders the Tardiness panel');
    t.assert(/Marroquin/.test(html), "Marroquin's logged late arrival shows in the list");
    t.assert(/7:15 AM/.test(html) && /15 min late/.test(html), 'the arrival time and computed minutes-late both render');
    t.assert(/scheduled time not found/.test(html), "the unmatched record's fallback message renders instead of a fabricated time");

    win.setCofTab('calloffs');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/New Call-Off/.test(html), 'switching back to Call-Offs restores that panel');

    // ── Delete ──
    win.setCofTab('latearrivals');
    const idToDelete = win.loadLateArrivals().find((c) => c.empName === 'Marroquin').id;
    win.deleteLateArrival(idToDelete);
    list = win.loadLateArrivals();
    t.eq(list.length, 1, 'deleting removes exactly that record');
    t.assert(!list.some((c) => c.empName === 'Marroquin'), "Marroquin's record is gone");
    t.assert(list.some((c) => c.empName === 'Somebody Else'), "the other record is untouched");
  },
};
