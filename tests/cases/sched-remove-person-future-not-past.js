/* Carlos's real bug: removing Susan/Julia/Sandra from the week he was
   viewing didn't stop them from reappearing every time he built a new
   week going forward — because an already-built FUTURE week (built
   earlier, before he removed them) still had them, and THAT week became
   the "most recently loaded" reference schedCreateWeek copies from.
   schedRemovePerson now clears a crew member from the viewed week AND
   every week on or after it, so she can't keep resurfacing through an
   already-built future week — while a PAST week keeps its own history
   untouched, since removing someone going forward isn't the same as
   erasing that she really did work that crew before. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedRemovePerson clears a crew member from this week and every week after it, but never a past week',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    function blankRec() {
      const rec = { sheet: 'Built in app', occ: '', dep: '', tdOcc: '' };
      win.SCHED_BLOCKS.forEach((b) => { rec[b.key] = []; });
      return rec;
    }

    // A past week (Aug 8-14), the viewed week (Aug 15-21), and an
    // already-built future week (Aug 22-28) — Susan is on Laundry in all
    // three, matching Carlos's real situation.
    const days = {};
    ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].forEach((ds) => {
      const rec = blankRec(); rec.laundry = [['Susan', '1']]; days[ds] = rec;
    });
    ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'].forEach((ds) => {
      const rec = blankRec(); rec.laundry = [['Susan', '']]; days[ds] = rec;
    });
    ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'].forEach((ds) => {
      const rec = blankRec(); rec.laundry = [['Susan', '']]; days[ds] = rec;
    });
    win.dlSaveSchedule({ days, count: 21, savedAt: new Date().toISOString() });

    win.schedViewWeekStart = win.parseLocalDate('2026-08-15');
    const originalConfirm = win.confirm;
    win.confirm = () => true;
    win.schedRemovePerson('laundry', 'Susan');
    win.confirm = originalConfirm;

    const SCH = win.dlLoadSchedule();
    t.assert(SCH.days['2026-08-08'].laundry.some((p) => p[0] === 'Susan'), 'a past week (Aug 8) keeps Susan — her real history there is not erased');
    t.assert(!SCH.days['2026-08-15'].laundry.some((p) => p[0] === 'Susan'), 'the viewed week (Aug 15) no longer has Susan');
    t.assert(!SCH.days['2026-08-22'].laundry.some((p) => p[0] === 'Susan'), "an already-built FUTURE week (Aug 22) is also cleared — this is Carlos's real bug: it used to keep her and kept feeding her back into every week built after it");
  }
};
