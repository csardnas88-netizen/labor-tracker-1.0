/* Carlos's real report, 2026-11-10 (Débora): he'd overridden her Tuesday
   back to a working day by hand (she'd originally requested it off), but
   later that same day it silently reverted back to R-OFF. Confirmed
   against the real Request Off Notebook data: her original request
   (captured 2026-11-02, covering that exact Tuesday) was still sitting in
   the notebook untouched — editing the SCHEDULE cell directly never told
   the NOTEBOOK the request was stale. The notebook's own "Re-sync Request
   Off to this week" button reapplies every entry touching the week,
   including that one, silently overwriting the day Carlos had already
   fixed.

   Fixed in schedSetCell: setting a cell to an actual working status (not
   blank, not itself an off/unavailable status) now drops that one date
   out of any matching Request Off Notebook entry — same "editing the
   cell asserts a new fact" philosophy already used for the 'retired'
   flag right above it. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "schedSetCell releases a matching Request Off Notebook date when the cell is set to an actual working status, so a later resync can't silently reapply a request Carlos already overrode (Débora's real report)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-11-10';
    const SCH = { days: { [ds]: { gra: [['Debora', 'R-OFF']] } }, count: 1 };
    win.dlSaveSchedule(SCH);
    win.saveReqNotebook([
      { id: 1793647542437, name: 'Debora', crewKey: 'gra', crewLabel: 'AM Room Attendant', type: 'roff', dates: [ds], capturedBy: 'Carlos', capturedAt: '2026-11-02T19:25:42.437Z', writtenDates: [ds] },
    ]);

    // Carlos overrides her back to a working day, directly on the cell.
    win.schedSetCell('gra', 0, 'Debora', ds, '1');

    const afterNotebook = win.loadReqNotebook();
    t.eq(afterNotebook.length, 0, "the now-stale Debora/Tuesday request is gone from the notebook entirely (it was her only date)");
    t.eq(win.dlLoadSchedule().days[ds].gra[0][1], '1', 'her cell itself still reads the working value just set');

    // ── The real end-to-end proof: a LATER resync of this same week
    // must not be able to reapply the (now-released) stale request. ──
    const originalConfirm = win.confirm;
    win.confirm = () => true;
    win.schedViewWeekStart = new Date(2026, 10, 7); // Sat Nov 7 2026 — the week containing ds
    win.schedResyncRequestOff();
    win.confirm = originalConfirm;
    t.eq(win.dlLoadSchedule().days[ds].gra[0][1], '1', "resync can't revert her — the stale request is gone, not just skipped this one time");

    // ── An entry covering MULTIPLE dates only loses the one that was
    // actually overridden; the rest of the request stands. ──
    const ds2 = '2026-11-11';
    const SCH2 = { days: { [ds]: { gra: [['Isabel D', 'R-OFF']] }, [ds2]: { gra: [['Isabel D', 'R-OFF']] } }, count: 2 };
    win.dlSaveSchedule(SCH2);
    win.saveReqNotebook([
      { id: 2, name: 'Isabel D', crewKey: 'gra', crewLabel: 'AM Room Attendant', type: 'roff', dates: [ds, ds2], capturedBy: 'Carlos', capturedAt: '2026-11-02T19:25:42.437Z', writtenDates: [ds, ds2] },
    ]);
    win.schedSetCell('gra', 0, 'Isabel D', ds, '1');
    const partial = win.loadReqNotebook();
    t.eq(partial.length, 1, 'the entry survives — Wednesday is still a real, untouched request');
    t.eq(partial[0].dates.length, 1, 'only the overridden Tuesday was dropped');
    t.eq(partial[0].dates[0], ds2, 'Wednesday remains on the entry');

    // ── Setting a cell to an OFF/unavailable status (not a working one)
    // never touches the notebook — only an actual working override does. ──
    const ds3 = '2026-11-12';
    const SCH3 = { days: { [ds3]: { gra: [['Someone', 'R-OFF']] } }, count: 1 };
    win.dlSaveSchedule(SCH3);
    win.saveReqNotebook([
      { id: 3, name: 'Someone', crewKey: 'gra', crewLabel: 'AM Room Attendant', type: 'roff', dates: [ds3], capturedBy: 'Carlos', capturedAt: '2026-11-02T19:25:42.437Z', writtenDates: [ds3] },
    ]);
    win.schedSetCell('gra', 0, 'Someone', ds3, 'TAILOR');
    t.eq(win.loadReqNotebook().length, 1, 'switching between two off-ish statuses does not release the request — nobody asserted a working day');
  },
};
