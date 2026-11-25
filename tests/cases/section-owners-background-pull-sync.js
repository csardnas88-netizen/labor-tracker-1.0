/* Carlos's real report, 2026-11-25: he typed Fatima and Anabel into Section
   Owners' Floaters list on one computer, saw them stick there (and on the
   Daily Lineup) — but opening the same app on his laptop showed neither the
   floaters list nor the Lineup names. Root cause: the background sync pull
   (_syncFromSheetsPull) had no handler at all for 'hk_section_owners' — every
   OTHER page-level singleton (hk_section_rotation, hk_labor_model, etc.) gets
   read out of the pulled Supabase rows and written into local storage here,
   but this key was added 2026-11-24 and nobody wired it into this loop. The
   key's own save path (saveSectionOwners) already pulls-merges-pushes on
   every SAVE, so the computer that actually typed the names looked fine —
   but a device that never saves (just opens the page, or just opens the
   Lineup) had no other way to ever receive a peer's edit. Fixed by giving
   this key a pull handler too, reusing the exact same _mergeSectionOwners
   the save path already trusts. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section Owners' Floaters list (and the Daily Lineup names it feeds) reach a second device through the ordinary background sync pull, not just through that device's own Save",
  async run(t) {
    const seed = fakeSession();
    const { win } = await loadApp({ seed });

    // This "laptop" has never saved Section Owners itself.
    win.localStorage.removeItem('hk_section_owners');
    t.eq(JSON.stringify(win.loadSectionOwners()), '{}', 'laptop starts with nothing saved locally, same as Carlos\'s real report');

    // The "computer" already saved floaters and pushed them to Supabase.
    const remoteSO = { floaters: { f1: 'Fatima', f2: 'Anabel' }, gallery: {}, studio: {}, _at: { floaters_f1: 1000, floaters_f2: 1000 } };
    win._supaGetAllWithRetry = (cb) => cb(null, { hk_section_owners: remoteSO });
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));

    const pulled = win.loadSectionOwners();
    t.eq(Object.values(pulled.floaters || {}).sort().join(','), 'Anabel,Fatima',
      "an ordinary background sync pull (not a save on this device) now carries the peer's floaters list over — "
      + "this is exactly what dlBuildPlan's floater fix (7.140.0) reads, so this device's Daily Lineup now sees them too");

    // ── Merge correctness, not a blind overwrite: a genuine local edit
    // with a NEWER _at for the same floater id must still beat a stale
    // remote copy of that same id, exactly as the save-time merge already
    // guarantees — this pull path reuses that same _mergeSectionOwners,
    // so it must not regress into "remote always wins". ──
    win.localStorage.setItem('hk_section_owners', JSON.stringify({
      floaters: { f1: 'Fatima Corrected' }, gallery: {}, studio: {}, _at: { floaters_f1: 5000 }
    }));
    win._supaGetAllWithRetry = (cb) => cb(null, {
      hk_section_owners: { floaters: { f1: 'Stale Fatima' }, gallery: {}, studio: {}, _at: { floaters_f1: 2000 } }
    });
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    const afterConflict = win.loadSectionOwners();
    t.eq(afterConflict.floaters.f1, 'Fatima Corrected', "a newer local edit still wins a real conflict — this pull merges, it doesn't just overwrite with whatever remote has");

    win.localStorage.removeItem('hk_section_owners');
  }
};
