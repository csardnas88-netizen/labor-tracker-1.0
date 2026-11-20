/* Carlos's real correction, 2026-11-19: after reporting what looked like
   two different people ("Susan Aguilar" and "Susan") colliding in the
   Request Off picker, he clarified "es que Susan es una sola persona.
   Ella es Supervisora que apoya en laundry en ocasiones" — she's one
   real Supervisor (schedule spelling "Susan A") who only occasionally
   covers Laundry (spelled plain "Susan" there). Confirmed against the
   live data: both spellings sitting in day.laundry at once, the exact
   Gabriela Cuevas phantom-duplicate-row shape.

   Added to SCHED_LINKED_PEOPLE so the phantom-row guards recognize her
   two spellings as one person — but, unlike Gabriela Cuevas/Sandra, with
   noAbsenceSync:true. She is not a continuous dual-crew identity; her
   Laundry row is a leftover from whichever week she last actually
   covered it, not a daily commitment. The FIRST attempt at this fix
   (without the flag) wired her into schedApplyLinkedPeopleForDate's
   generic absence-mirroring same as every other pair, and that broke a
   real, already-live scenario caught by tests/cases/daily-lineup.js's
   own pinned fixture for this exact pair of names: Susan A working
   Supervisor ('1') while an old, inapplicable Laundry row for "Susan"
   sits on 'OFF' — the mirror treated the stale Laundry absence as
   authoritative and silently overwrote her real, current Supervisor
   '1' to 'OFF' too. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Susan A (Supervisor) / Susan (occasional Laundry cover) are recognized as one person for phantom-row purposes, but her Laundry row's absence never overrides her real Supervisor schedule",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const ds = '2026-11-21';

    // ── The reported bug: her Supervisor cell gets marked LAUNDRY (she's
    // covering that day), and a real "Susan" row already exists on
    // Laundry from a past week — no second, phantom "Susan A" row. ──
    const SCH1 = { days: { [ds]: { sup: [['Susan A', 'LAUNDRY']], laundry: [['Susan', '1']] } } };
    t.assert(!win.schedSyncLaundryCoverRow(SCH1, ds, 'sup', 'Susan A', 'LAUNDRY'),
      'no new row created — a real "Susan" row already exists on Laundry');
    t.eq(SCH1.days[ds].laundry.length, 1, 'still just the one real Laundry row, no phantom "Susan A" duplicate');

    // ── A duplicate that already exists in a saved week gets cleaned up
    // retroactively, same as Gabriela Cuevas's case. ──
    const SCH2 = { days: { [ds]: { sup: [['Susan A', 'LAUNDRY']], laundry: [['Susan', '1'], ['Susan A', '1', 'cover']] } } };
    t.assert(win._schedCleanupLinkedCoverRows(SCH2, [ds]), 'the phantom "Susan A" cover row is swept');
    t.eq(SCH2.days[ds].laundry.length, 1, 'only the real "Susan" row survives');
    t.eq(SCH2.days[ds].laundry[0][0], 'Susan');

    // ── The actual regression: she's genuinely working Supervisor, and
    // an unrelated, stale "Susan" row on Laundry (from whenever she last
    // covered it) reads OFF. That is NOT a real absence worth reconciling
    // — her Supervisor '1' must survive untouched. ──
    const SCH3 = { days: { [ds]: { sup: [['Susan A', '1']], laundry: [['Susan', 'OFF']] } } };
    t.assert(!win.schedApplyLinkedPeopleForDate(SCH3, ds),
      'no change reported — this pair is opted out of absence-mirroring');
    t.eq(SCH3.days[ds].sup[0][1], '1', 'her real, current Supervisor status is untouched by the stale Laundry row');
    t.eq(SCH3.days[ds].laundry[0][1], 'OFF', 'and the stale Laundry row is left exactly as it was — not relabeled either');

    // ── Same, the other direction: a stale Supervisor absence must not
    // overwrite a day she's genuinely covering Laundry. ──
    const SCH4 = { days: { [ds]: { sup: [['Susan A', 'R-OFF']], laundry: [['Susan', '1']] } } };
    t.assert(!win.schedApplyLinkedPeopleForDate(SCH4, ds), 'still opted out, regardless of which side is absent');
    t.eq(SCH4.days[ds].laundry[0][1], '1', 'her real Laundry coverage survives an unrelated Supervisor absence');

    // ── Gabriela Cuevas's own absence-mirroring (an unrelated pair) must
    // be completely unaffected by Susan's opt-out — the flag is per-pair,
    // not global. ──
    const SCH5 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'R-OFF']], lobby: [['Gabriela', '1']] } } };
    t.assert(win.schedApplyLinkedPeopleForDate(SCH5, ds), 'Gabriela Cuevas still mirrors as before');
    t.eq(SCH5.days[ds].lobby[0][1], 'R-OFF', 'her Lobby row still picks up the real absence');
  },
};
