/* Carlos's ask, 2026-11-10: fixing a mistake in a logged call-off (wrong
   employee, wrong date, a typo in the reason) used to mean Delete + add a
   new one from scratch — "un poco cansón" in his own words. showNewCallOffModal
   now takes an optional editId that pre-fills the modal from the existing
   record, and saveNewCallOff(editId) updates that SAME record in place —
   same id, and crucially, it also releases whatever the ORIGINAL save
   marked on the Schedule before applying a fresh mark for the edited
   date/employee/position, so a correction never leaves a stale CALL-OFF
   sitting on the wrong day or the wrong person's cell.

   Also covers Carlos's second real report the same day: a PROPER call-off
   (not improper) with a notified time used to show nothing at all in the
   list — only an Improper one got any notice text. Now a green "Notified"
   line shows whenever there's a notified time, with the duration alongside
   it whenever a scheduled start could be resolved to measure against. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: 'Editing a call-off updates the same record in place (not a duplicate) and moves its Schedule mark to the new date/employee, and a proper (non-improper) call-off with a notified time now shows a Notified line too',
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });
    win.viewMonth = new Date(2026, 6, 1);

    const ds1 = '2026-09-29';
    const ds2 = '2026-09-30';
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: {
        [ds1]: { lobby: [['Marroquin', '1']] },
        [ds2]: { lobby: [['Marroquin', '1']] },
      },
      count: 2,
      savedAt: new Date().toISOString(),
    }));

    // ── Log the original (mistaken) call-off: wrong date, wrong reason. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds1;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Typo\'d reason';
    win.document.getElementById('coNotified').value = '06:50';
    win.saveNewCallOff();

    let list = win.loadCallOffs();
    t.eq(list.length, 2, 'the fixture seeds one call-off; this adds the second');
    const original = list[0];
    t.eq(original.date, ds1, 'logged against the wrong date, as Carlos actually typed it');
    const schedBefore = win.dlLoadSchedule();
    t.eq(schedBefore.days[ds1].lobby[0][1], 'CALL-OFF', "the ORIGINAL date's Schedule cell got marked CALL-OFF");
    t.eq(schedBefore.days[ds2].lobby[0][1], '1', 'the correct date is untouched so far');

    // ── Reopen for editing — the modal must pre-fill from the existing
    // record, not show a blank "New Call-Off" form. ──
    win.showNewCallOffModal(original.id);
    const modalTitle = win.document.getElementById('callOffModal').innerHTML;
    t.assert(/Edit Call-Off/.test(modalTitle), 'the modal title reads "Edit Call-Off", not "New Call-Off"');
    t.eq(win.document.getElementById('coDate').value, ds1, 'date pre-filled from the existing record');
    t.eq(win.document.getElementById('coReason').value, "Typo'd reason", 'reason pre-filled too');
    t.eq(win.document.getElementById('coEmp').value, '99|Marroquin|Public Area Attendant', 'the hidden employee value is pre-filled, not left for Carlos to re-pick from scratch');

    // ── Correct it: the real date was ds2, and the real reason was "Sick". ──
    win.document.getElementById('coDate').value = ds2;
    win.document.getElementById('coReason').value = 'Sick';
    win.saveNewCallOff(original.id);

    list = win.loadCallOffs();
    t.eq(list.length, 2, 'still just two records — the edit updated in place, it did not create a third');
    const edited = list.filter((c) => c.id === original.id)[0];
    t.assert(edited, 'the same id survives the edit');
    t.eq(edited.date, ds2, 'the record now carries the corrected date');
    t.eq(edited.reason, 'Sick', 'and the corrected reason');

    const schedAfter = win.dlLoadSchedule();
    t.eq(schedAfter.days[ds1].lobby[0][1], '1', "the ORIGINAL (wrong) date's Schedule mark was released back to '1' — a correction can't leave a stale CALL-OFF behind on the wrong day");
    t.eq(schedAfter.days[ds2].lobby[0][1], 'CALL-OFF', "the NEW (correct) date now carries the mark instead");

    // ── Renders with an Edit (pencil) button alongside Delete. ──
    win.showPage('calloffs');
    let html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(new RegExp('showNewCallOffModal\\(' + original.id + '\\)').test(html), 'an Edit button wired to this exact record\'s id renders in the list');

    // ── Second report, same day: a call-off that is NOT improper (plenty
    // of notice) with a notified time used to render nothing at all. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = ds2;
    win.document.getElementById('coEmp').value = '99|Marroquin|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Family emergency, plenty of notice';
    win.document.getElementById('coNotified').value = '04:00'; // 3h before a 7:00 AM start
    win.saveNewCallOff();
    win.showPage('calloffs');
    html = win.document.getElementById('calloffsContent').innerHTML;
    const properIdx = html.indexOf('Family emergency, plenty of notice');
    t.assert(properIdx !== -1, 'the proper call-off itself renders');
    const properBlock = html.slice(properIdx, properIdx + 400);
    t.assert(/Notified 4:00 AM/.test(properBlock), 'a NON-improper call-off with a notified time now shows a Notified line (previously only Improper ones showed anything)');
    t.assert(/3h 0m notice/.test(properBlock), 'and its notice duration, since a scheduled start WAS resolvable here');
    t.assert(!/Improper/.test(properBlock), 'still correctly not flagged Improper — this is the green, not the red, line');

    // ── A call-off with a notified time but NO resolvable scheduled start
    // (week not loaded) still shows the notified time, just without a
    // duration — showing SOMETHING beats showing nothing just because
    // half the picture is missing. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-10-05'; // week not loaded in this fixture
    win.document.getElementById('coEmp').value = '100|Somebody Else|Public Area Attendant';
    win.document.getElementById('coReason').value = 'No schedule to compare against';
    win.document.getElementById('coNotified').value = '06:00';
    win.saveNewCallOff();
    win.showPage('calloffs');
    html = win.document.getElementById('calloffsContent').innerHTML;
    const noSchedIdx = html.indexOf('No schedule to compare against');
    t.assert(noSchedIdx !== -1, 'this call-off renders too');
    const noSchedBlock = html.slice(noSchedIdx, noSchedIdx + 400);
    t.assert(/Notified 6:00 AM/.test(noSchedBlock), 'the notified time still shows even with no scheduled start to compare against');
    t.assert(!/notice</.test(noSchedBlock), 'but no duration is fabricated when there was nothing to measure it against');
  },
};
