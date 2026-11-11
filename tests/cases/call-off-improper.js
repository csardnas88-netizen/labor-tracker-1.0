/* Carlos's policy, 2026-10-31: a call-off is "improper" when the
   associate notifies less than 2 hours before her scheduled shift start
   (his own example: a Turndown shift at 8:15, called at 8:00 — only 15
   minutes' notice). New Call-Off gained an optional "Time notified"
   field; when filled in, saveNewCallOff() resolves the scheduled start
   the same way Tardiness already does (schedScheduledStartTimeReason)
   and flags rec.improper when the gap is under CALLOFF_IMPROPER_NOTICE_MIN
   (120). Leaving the field blank — the common case, since a manager
   often just wants the absence logged — never fabricates a
   classification either way. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "New Call-Off: an optional Time Notified field flags an Improper Call-Off when notice is under 2 hours, using the Schedule Draft's scheduled start, same lookup Tardiness already uses",
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });
    win.viewMonth = new Date(2026, 6, 1);

    // Marroquin on Lobby, 7:00 AM weekday start (same fixture shape as
    // the Late Arrivals test, SCHED_SHIFT_TIMES.lobby).
    const ds = '2026-09-29';
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { lobby: [['Marroquin', '1']] } },
      count: 1,
      savedAt: new Date().toISOString(),
    }));

    // ── Short notice (10 min before a 7:00 AM start) flags improper ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Sick';
    win.document.getElementById('coNotified').value = '06:50';
    win.saveNewCallOff();

    let list = win.loadCallOffs();
    t.eq(list.length, 2, 'the fixture already seeds one call-off; saving adds the new one on top (unshifted to the front)');
    t.eq(list[0].scheduledTime, '7:00 AM', 'scheduled start auto-read from the Schedule Draft');
    t.eq(list[0].notifiedTime, '6:50 AM', 'the typed 24h time displays in the same 12h style as the scheduled time');
    t.eq(list[0].minutesNotice, 10, 'only 10 minutes of notice before the scheduled start');
    t.eq(list[0].improper, true, 'under 2 hours of notice flags an Improper Call-Off');

    // ── Plenty of notice (3 hours) is NOT improper ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Family emergency';
    win.document.getElementById('coNotified').value = '04:00';
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const plentyNotice = list.find((c) => c.reason === 'Family emergency');
    t.eq(plentyNotice.minutesNotice, 180, '3 hours = 180 minutes of notice');
    t.eq(plentyNotice.improper, false, '180 minutes of notice is well over the 2-hour line, not improper');

    // ── Exactly 2 hours (120 min) is the boundary — "less than 2 hours"
    // means 120 itself does not qualify as improper. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Exactly two hours';
    win.document.getElementById('coNotified').value = '05:00';
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const boundary = list.find((c) => c.reason === 'Exactly two hours');
    t.eq(boundary.minutesNotice, 120, 'exactly 120 minutes of notice');
    t.eq(boundary.improper, false, 'exactly 2 hours of notice is the boundary — not improper, only UNDER 2 hours is');

    // ── Leaving Time Notified blank never fabricates a classification ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'No time given';
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const blank = list.find((c) => c.reason === 'No time given');
    t.eq(blank.notifiedTime, undefined, 'no notified time recorded when the field was left blank');
    t.eq(blank.improper, undefined, 'and no improper classification is guessed at either');

    // ── A call-off the Schedule Draft can't resolve a scheduled time
    // for still saves, with a time notified but no classification —
    // same "left for Carlos by hand" fallback Tardiness already has. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-10-05'; // week not loaded
    win.document.getElementById('coEmp').value = '100|Somebody Else|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Unmatched';
    win.document.getElementById('coNotified').value = '06:00';
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const unmatched = list.find((c) => c.reason === 'Unmatched');
    t.eq(unmatched.scheduledTime, null, 'no scheduled time could be found automatically');
    t.eq(unmatched.minutesNotice, null, 'so minutes of notice is left null rather than guessed');
    t.eq(unmatched.improper, false, 'a null gap never qualifies as improper');

    // ── Renders as a red badge in the Call-Offs list ──
    win.showPage('calloffs');
    const html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Improper Call-Off/.test(html), 'the Improper Call-Off badge renders for the flagged record');
    t.assert(/10m notice/.test(html), "the badge shows the notice as a duration (minutes under an hour, no 'h')");

    // ── Carlos's real report, 2026-11-10 (Guadalupe Cruz): she called at
    // 11:31 PM the evening BEFORE a 5:00 PM shift — genuinely ~17.5 hours'
    // notice — but a bare clock-time subtraction against the SAME day
    // (5:00 PM minus 11:31 PM) came out negative (-391) and still tripped
    // the improper flag. The "called the day before" checkbox names which
    // day the call happened on, adding a full day back before comparing. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Called the night before';
    win.document.getElementById('coNotified').value = '23:31';
    win.document.getElementById('coNotifiedPrevDay').checked = true;
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const nightBefore = list.find((c) => c.reason === 'Called the night before');
    t.eq(nightBefore.notifiedPrevDay, true, 'the record remembers the call was placed the day before');
    t.eq(nightBefore.minutesNotice, 449, '7:00 AM minus 11:31 PM the PRIOR day is 449 minutes (~7.5h), not a negative number');
    t.eq(nightBefore.improper, false, 'genuinely ample notice — not improper');

    // ── The checkbox left unchecked (the ordinary, same-day case) is
    // completely unaffected — same negative-gap-stays-negative behavior
    // as before this fix, since an unchecked box adds nothing. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Called late, same day, after shift start';
    win.document.getElementById('coNotified').value = '09:00';
    win.saveNewCallOff();
    list = win.loadCallOffs();
    const sameDayLate = list.find((c) => c.reason === 'Called late, same day, after shift start');
    t.eq(sameDayLate.notifiedPrevDay, false, 'unchecked by default');
    t.eq(sameDayLate.minutesNotice, -120, 'genuinely called 2 hours AFTER the 7:00 AM start — stays negative, not reinterpreted as the day before');
    t.eq(sameDayLate.improper, true, 'a same-day call placed after the shift already started is correctly still flagged');

    win.showPage('calloffs');
    const html2 = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/7h 29m notice/.test(html2), 'a non-improper record with a notified time shows the duration in hours/minutes too (not just improper ones)');
  },
};
