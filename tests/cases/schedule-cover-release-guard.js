/* Two rules about a 'cover' row that pull in opposite directions, and had
   no test between them until 2026-11-05 — which is exactly how 7.95.0
   managed to break one while fixing the other.

   A 'cover' row is DERIVED: it exists on the Lobby (or Laundry) crew only
   because someone's cell on their HOME crew reads the away-label LOBBY /
   LAUNDRY. Nobody types it. That gives two separate obligations:

   1. Editing an UNRELATED cell must never silently delete it.
      Carlos's real Jorge report: adding him to Laundry on Tuesday, then
      clicking a different employee, made Jorge's day vanish. Guarded by
      schedWarnBeforeCoverRelease, which asks first — and must leave the
      row completely alone if the answer is no.

   2. When the underlying away-label genuinely goes away by some other
      route — a workbook re-upload, a pull from another device, Auto-fill
      — the derived row MUST be cleaned up, or she keeps showing as
      working a shift she is no longer assigned to.

   7.95.0 applied rule 1's confirm-first instinct to rule 2's cleanup
   pass, with a guard that skipped deletion unless the row was blank. A
   cover row is created with a hard-coded '1', so it is never blank: the
   cleanup became unreachable and lobby cover rows turned permanent. Both
   rules are pinned here now so neither can be traded for the other. */
const { loadApp, fakeSession } = require('../_harness');

const DS = '2026-10-29';

function build(win, vanesaLaundryCell) {
  win.dlSaveSchedule({
    days: {
      [DS]: {
        sheet: 't', occ: '150', dep: '60', tdOcc: '150',
        lobby: [['Marroquin', '1'], ['Sarahi', '1']],
        laundry: [['Olga A', '1'], ['Vanesa', vanesaLaundryCell]],
      },
    },
    count: 1,
    savedAt: new Date().toISOString(),
  });
}

function lobbyRowFor(SCH, name) {
  return (SCH.days[DS].lobby || []).find((p) => p[0] === name);
}

module.exports = {
  name: "A derived 'cover' row: an unrelated edit must ask before releasing it (Carlos's Jorge report), but a cover whose away-label is gone must still be cleaned up — 7.95.0 traded the second away for the first",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Rule 2: the cleanup pass must actually be reachable ──
    build(win, 'LOBBY');
    let SCH = win.dlLoadSchedule();
    win.schedSyncAllLobbyCoverRows(SCH, [DS]);
    let cover = lobbyRowFor(SCH, 'Vanesa');
    t.assert(cover && cover[1] === '1' && cover[2] === 'cover',
      "a cover row is created with a value of '1', never blank — the fact 7.95.0's guard overlooked");

    // The away-label goes away by a route that is NOT a cell edit (this is
    // what a re-upload or a sync pull looks like by the time it gets here).
    SCH.days[DS].laundry.find((p) => p[0] === 'Vanesa')[1] = '1';
    const changed = win.schedSyncAllLobbyCoverRows(SCH, [DS]);
    t.assert(changed, 'the cleanup pass reports that it removed something');
    t.assert(!lobbyRowFor(SCH, 'Vanesa'),
      'the derived cover row is gone once nothing marks her LOBBY any more — otherwise she keeps showing on a Lobby shift she is not assigned to');

    // ── Rule 1: a live edit that releases a confirmed cover must ASK ──
    build(win, 'LOBBY');
    SCH = win.dlLoadSchedule();
    win.schedSyncAllLobbyCoverRows(SCH, [DS]);
    win.dlSaveSchedule(SCH);

    const asked = [];
    const realConfirm = win.confirm;

    // Answer NO: the row must survive untouched, and so must her cell.
    win.confirm = (msg) => { asked.push(msg); return false; };
    const vIdx = win.dlLoadSchedule().days[DS].laundry.findIndex((p) => p[0] === 'Vanesa');
    win.schedSetCell('laundry', vIdx, 'Vanesa', DS, '1', null);
    t.eq(asked.length, 1, 'releasing a confirmed cover asks before doing anything');
    t.assert(/Vanesa/.test(asked[0]), 'and the question names the person it is about: ' + asked[0]);

    SCH = win.dlLoadSchedule();
    t.assert(lobbyRowFor(SCH, 'Vanesa'), 'answering no leaves the cover row in place');
    t.eq(SCH.days[DS].laundry.find((p) => p[0] === 'Vanesa')[1], 'LOBBY',
      'answering no also leaves her own cell exactly as it was — the edit is abandoned, not half-applied');

    // Answer YES: now it really is released.
    win.confirm = () => true;
    win.schedSetCell('laundry', vIdx, 'Vanesa', DS, '1', null);
    SCH = win.dlLoadSchedule();
    t.eq(SCH.days[DS].laundry.find((p) => p[0] === 'Vanesa')[1], '1', 'answering yes applies the edit');
    t.assert(!lobbyRowFor(SCH, 'Vanesa'), 'and the cover row is released with it');

    // ── An ordinary edit on someone with no cover row must never ask ──
    build(win, '1');
    asked.length = 0;
    win.confirm = (msg) => { asked.push(msg); return true; };
    const oIdx = win.dlLoadSchedule().days[DS].laundry.findIndex((p) => p[0] === 'Olga A');
    win.schedSetCell('laundry', oIdx, 'Olga A', DS, 'OFF', null);
    t.eq(asked.length, 0, 'an ordinary edit is never interrupted by the cover question');

    win.confirm = realConfirm;
  },
};
