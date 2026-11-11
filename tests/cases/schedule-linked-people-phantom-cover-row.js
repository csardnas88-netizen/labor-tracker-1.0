/* Carlos's real report, 2026-11-10: Gabriela printed TWICE on the Lobby
   section — once in the Excel export, and on the Daily Lineup Lobby
   section too — because she's genuinely working her home crew (Room
   Attendant, "Gabriela Cuevas") marked with the cover label LOBBY that
   day.

   Two independent mechanisms react to that same LOBBY label:
   1. schedApplyLinkedPeopleForDate (the Gabriela Cuevas/Gabriela pair in
      SCHED_LINKED_PEOPLE) forces her OWN literal Lobby row, spelled
      "Gabriela", to '1' — correct, that row already exists.
   2. schedSyncLobbyCoverRow (the generic "anyone marked LOBBY gets a
      cover row" mechanism) doesn't know about the pair's spelling
      mismatch — SCHED_NAME_ALIASES maps 'gabriela cuevas' to a totally
      different string ('cuevas ibarra', for payroll matching), not to
      'gabriela' — so its dlNormAlias lookup never finds her existing
      Lobby row and creates a SECOND, disposable 'cover' row spelled
      "Gabriela Cuevas" instead. Both rows now read as her working Lobby
      that day: the real "Gabriela" (1) and the phantom "Gabriela Cuevas"
      (cover, 1).

   Fixed two ways: _schedLinkedTargetName stops schedSyncLobbyCoverRow/
   schedSyncLaundryCoverRow from ever creating a fresh phantom row for
   someone SCHED_LINKED_PEOPLE already owns (forward guard), and
   _schedCleanupLinkedCoverRows retroactively removes a phantom row that
   already exists from before this guard shipped (self-heal, wired into
   renderSchedule/schedExportWarnings/renderDailyLineup the same way
   schedPurgeDuplicateAliasRows already is for same-crew duplicates). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Gabriela Cuevas marked LOBBY on Room Attendant never gets a second, phantom "Gabriela Cuevas" row on Lobby alongside her real "Gabriela" row (Carlos\'s real double-count report)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-11-14';

    // ── Forward guard: the generic cover-row sync must not create a
    // phantom row for someone SCHED_LINKED_PEOPLE already handles. ──
    const SCH1 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LOBBY']], lobby: [['Gabriela', '1']] } } };
    t.assert(!win.schedSyncLobbyCoverRow(SCH1, ds, 'gra', 'Gabriela Cuevas', 'LOBBY'),
      'schedSyncLobbyCoverRow reports no change — it defers to the linked-pair mechanism instead of creating its own row');
    t.eq(SCH1.days[ds].lobby.length, 1, 'still just the one real Lobby row, no phantom added');

    // ── Retroactive self-heal: a phantom row that already exists (e.g.
    // saved before this guard shipped) is removed, keeping the real row
    // and its value untouched. ──
    const SCH2 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LOBBY']], lobby: [['Gabriela', '1'], ['Gabriela Cuevas', '1', 'cover']] } } };
    t.assert(win._schedCleanupLinkedCoverRows(SCH2, [ds]), 'reports a real change — the phantom row is gone');
    t.eq(SCH2.days[ds].lobby.length, 1, 'only the real row survives');
    t.eq(SCH2.days[ds].lobby[0][0], 'Gabriela', 'the surviving row is the real one, spelled "Gabriela"');
    t.eq(SCH2.days[ds].lobby[0][1], '1', 'its value is untouched');

    // ── An unrelated person (not in SCHED_LINKED_PEOPLE) with a genuine
    // cover row on Lobby is left completely alone. ──
    const SCH3 = { days: { [ds]: { laundry: [['Vanesa', 'LOBBY']], lobby: [['Vanesa', '1', 'cover']] } } };
    t.assert(!win._schedCleanupLinkedCoverRows(SCH3, [ds]), 'no change reported — Vanesa has no linked pair, her real cover row is untouched');
    t.eq(SCH3.days[ds].lobby.length, 1, 'her one genuine cover row is still there');

    // ── Settles after one pass, same stable self-heal guarantee every
    // other retroactive sweep in this file already has. ──
    t.assert(!win._schedCleanupLinkedCoverRows(SCH2, [ds]), 'a second pass over the already-cleaned record reports no further change');

    // ── Nothing to work with is handled without throwing. ──
    t.assert(!win._schedCleanupLinkedCoverRows({ days: {} }, [ds]), 'no days at all is a no-op');
  },
};
