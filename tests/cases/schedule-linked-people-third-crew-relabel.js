/* Carlos's real report, 2026-10-15: he moved Gabriela Cuevas to cover
   Laundry on Saturday of the Oct 24-30 week — her Room Attendant cell
   correctly relabeled to 'LAUNDRY' and she showed up on Laundry's own
   crew card — but her literal Lobby row ('Gabriela', the other half of
   her SCHED_LINKED_PEOPLE pair) stayed stuck on a stale 'ROOMS' from an
   earlier day she was genuinely on Room Attendant.

   Root cause: schedApplyLinkedPeopleForDate's non-symmetric branch used
   to just SKIP the whole day the moment her Room Attendant cell read
   any away-label naming a crew outside this specific pair (neither her
   home crew nor Lobby) — on the assumption that "a different
   relationship already explains her," so something else would finish
   reconciling Lobby. Nothing does: the generic cross-crew sync groups
   rows by exact name, and 'Gabriela' (Lobby's spelling) vs 'Gabriela
   Cuevas' (Room Attendant's) are never recognized as the same person
   without an alias — so Lobby was simply orphaned the moment a third
   crew entered the picture. Fixed: instead of skipping, Lobby now gets
   relabeled to whatever THIRD crew's away-label her home cell actually
   shows, the same principle as the existing ROOMS relabel, generalized
   to wherever she's really covering. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "schedApplyLinkedPeopleForDate relabels Gabriela Cuevas's Lobby row to match a THIRD crew (e.g. Laundry) her Room Attendant cell shows, instead of leaving it stuck on a stale ROOMS",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-10-24';

    // ── The real case: her Room Attendant cell now reads LAUNDRY (she's
    // covering it), but Lobby still shows the stale ROOMS from before. ──
    const SCH1 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LAUNDRY']], lobby: [['Gabriela', 'ROOMS']] } } };
    t.assert(win.schedApplyLinkedPeopleForDate(SCH1, ds, { crew: 'gra', name: 'Gabriela Cuevas' }),
      'reports a real change — Lobby needed updating');
    t.eq(SCH1.days[ds].lobby[0][1], 'LAUNDRY', "her Lobby row relabels to LAUNDRY, matching where she's actually covering, instead of staying stuck on ROOMS");

    // ── Settles after one pass — a second run with no edit behind it
    // reports no further change, same "stable self-heal" guarantee every
    // other linked-pair relabel already has. ──
    t.assert(!win.schedApplyLinkedPeopleForDate(SCH1, ds), 'a second pass reports no change, so it settles instead of re-saving forever');

    // ── Already correct — Lobby already reads LAUNDRY (e.g. an earlier
    // pass already fixed it, or it was never stale to begin with) — no
    // spurious change reported. ──
    const SCH2 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LAUNDRY']], lobby: [['Gabriela', 'LAUNDRY']] } } };
    t.assert(!win.schedApplyLinkedPeopleForDate(SCH2, ds), 'no change reported when Lobby already matches');

    // ── A render-time self-heal pass (no `edited` argument at all, e.g.
    // Auto-fill or another device's pulled data) still catches and fixes
    // the same stale ROOMS, not just a pass with an explicit edit. ──
    const SCH3 = { days: { [ds]: { gra: [['Gabriela Cuevas', 'LAUNDRY']], lobby: [['Gabriela', 'ROOMS']] } } };
    t.assert(win.schedApplyLinkedPeopleForDate(SCH3, ds), 'fixes the stale label even with no edited side named');
    t.eq(SCH3.days[ds].lobby[0][1], 'LAUNDRY', 'Lobby relabels to LAUNDRY on the self-heal pass too');

    // ── Her real home-crew/Lobby relationship (no third crew involved)
    // is completely unaffected by this fix — the plain ROOMS relabel
    // still works exactly as before. ──
    const SCH4 = { days: { [ds]: { gra: [['Gabriela Cuevas', '1']], lobby: [['Gabriela', '1']] } } };
    win.schedApplyLinkedPeopleForDate(SCH4, ds, { crew: 'gra', name: 'Gabriela Cuevas' });
    t.eq(SCH4.days[ds].lobby[0][1], 'ROOMS', "working her own Room Attendant shift still relabels Lobby to ROOMS, same as always — unrelated to the third-crew fix");
  },
};
