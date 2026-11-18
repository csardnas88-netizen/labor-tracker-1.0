/* Carlos's real report, 2026-11-17: marking Sandra's Room Attendant cell
   LAUNDRY for Saturday Nov 21 did nothing at all — "intenté con otros
   asociados y sí me deja" (it works for everyone else).

   Root cause: unlike Gabriela Cuevas (a genuine permanent member of both
   Room Attendant and Lobby, each with its own real, non-'cover' row),
   Sandra has NO permanent Laundry row at all — see _schedCrewSpellingFor's
   own comment. Her only way onto Laundry has always been the same
   disposable 'cover' row schedSyncLaundryCoverRow creates for anyone
   marked LAUNDRY. The _schedLinkedTargetName guard added 2026-11-10 (for
   Gabriela Cuevas's phantom-duplicate bug) bailed out of that function
   unconditionally for ANY SCHED_LINKED_PEOPLE member — correct for
   Gabriela Cuevas, who already has a real row to defer to, but it silently
   broke the ONLY mechanism Sandra ever had, since she has no real row for
   the pair logic to defer to in the first place.

   Fixed by only bailing when a genuine (non-'cover') row under the pair's
   own target spelling ALREADY exists on that crew — the actual duplicate
   case — in both schedSyncLaundryCoverRow/schedSyncLobbyCoverRow AND
   _schedCleanupLinkedCoverRows (which would otherwise delete the row the
   moment it got created, since Sandra's home and target names are
   identical ("Sandra" on both gra and laundry), making the old
   unconditional "cover row spelled like the home name" check fire on her
   own newly-created row with nothing else to tell it apart from a real
   phantom). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Sandra (plain, no permanent Laundry row) still gets a real cover row when marked LAUNDRY — the linked-people phantom-row guard only blocks an ACTUAL duplicate, not every linked person",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const ds = '2026-11-21';

    // ── The exact reported bug: Sandra marked LAUNDRY on Room Attendant,
    // with NO laundry array at all yet for this day (a fresh week). ──
    const SCH1 = { days: { [ds]: { gra: [['Sandra', '1']] } } };
    t.assert(win.schedSyncLaundryCoverRow(SCH1, ds, 'gra', 'Sandra', 'LAUNDRY'),
      'schedSyncLaundryCoverRow reports a real change — a row is actually created for her, unlike Gabriela Cuevas (who defers to her own existing row)');
    t.eq(SCH1.days[ds].laundry.length, 1, 'a real Laundry row now exists for Sandra');
    t.eq(SCH1.days[ds].laundry[0][0], 'Sandra', 'spelled the same as her Room Attendant row');
    t.eq(SCH1.days[ds].laundry[0][1], '1', 'marked working');
    t.eq(SCH1.days[ds].laundry[0][2], 'cover', "tagged 'cover', same as any other non-permanent member");

    // ── The retroactive cleanup must NOT remove this row — it's the only
    // representation of her on Laundry, not a duplicate of anything. ──
    t.assert(!win._schedCleanupLinkedCoverRows(SCH1, [ds]), 'no change reported — nothing to clean up');
    t.eq(SCH1.days[ds].laundry.length, 1, "Sandra's sole Laundry row survives the cleanup pass");

    // ── Full end-to-end via the real edit path (schedSetCell), matching
    // exactly what Carlos actually does on screen. ──
    win.dlSaveSchedule({ days: { [ds]: { gra: [['Sandra', '1']] } }, count: 1 });
    win.schedSetCell('gra', 0, 'Sandra', ds, 'LAUNDRY');
    const saved = JSON.parse(win.localStorage.getItem('hk_dl_schedule'));
    const laundryRows = (saved.days[ds] && saved.days[ds].laundry) || [];
    t.assert(laundryRows.some((r) => r[0] === 'Sandra' && r[1] === '1'), 'schedSetCell end-to-end: Sandra actually ends up with a working Laundry row');

    // ── Gabriela Cuevas's ORIGINAL phantom-duplicate protection must still
    // hold — she has a real, non-'cover' row to defer to, so no second row
    // is ever created for her, exactly as the existing test already
    // covers. Checked again here for the contrast with Sandra's case. ──
    const SCH3 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LOBBY']], lobby: [['Gabriela', '1']] } } };
    t.assert(!win.schedSyncLobbyCoverRow(SCH3, ds, 'gra', 'Gabriela Cuevas', 'LOBBY'),
      'Gabriela Cuevas still defers to her real row — no phantom created');
    t.eq(SCH3.days[ds].lobby.length, 1, 'still just the one real Lobby row');

    // ── And if a genuine duplicate DOES somehow exist for a same-spelled
    // pair like Sandra's (both a real non-'cover' row and a stray 'cover'
    // one), the cleanup still correctly removes the phantom — the fix
    // isn't "never clean up Sandra," it's "only clean up an actual
    // duplicate." ──
    const SCH4 = { days: { [ds]: { gra: [['Sandra', '1']], laundry: [['Sandra', '1'], ['Sandra', '1', 'cover']] } } };
    t.assert(win._schedCleanupLinkedCoverRows(SCH4, [ds]), 'a genuine duplicate IS cleaned up');
    t.eq(SCH4.days[ds].laundry.length, 1, 'only the real (non-cover) row survives');
    t.eq(SCH4.days[ds].laundry[0][2], undefined, 'the surviving row is the real one, not the cover one');
  },
};
