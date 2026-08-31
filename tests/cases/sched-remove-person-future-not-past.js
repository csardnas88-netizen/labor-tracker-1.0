/* Carlos's real bug: removing Susan/Julia/Sandra from the week he was
   viewing didn't stop them from reappearing every time he built a new
   week going forward — because an already-built FUTURE week (built
   earlier, before he removed them) still had them, and THAT week became
   the "most recently loaded" reference schedCreateWeek copies from.
   schedRemovePerson now clears a crew member from the viewed week AND
   every week on or after it, so she can't keep resurfacing through an
   already-built future week — while a PAST week keeps its own history
   untouched, since removing someone going forward isn't the same as
   erasing that she really did work that crew before.

   That still wasn't the whole fix, though — Carlos reported the SAME
   three names still coming back even after removing them, because a
   week built AFTER the removal (schedCreateWeek) or a workbook
   re-upload that still listed them (dlUploadSchedule) neither one knew
   she'd been retired; each just copied/parsed her right back in. Fixed
   with a permanent retired flag (schedIsRetired/schedSetRetired) both
   paths now check, cleared only by deliberately re-adding her via
   schedAddPerson. */
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
      // Olga A too, so the crew isn't left completely empty once Susan is retired — a real Laundry roster always has someone else on it.
      const rec = blankRec(); rec.laundry = [['Susan', ''], ['Olga A', '1']]; days[ds] = rec;
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

    // ── The permanent part: a brand-new week built AFTER the removal
    // must not carry her either, even though the "most recently loaded"
    // week (Aug 22) is now a real, existing week schedCreateWeek would
    // otherwise happily copy from. ──
    t.assert(win.schedIsRetired(SCH, 'laundry', 'Susan'), 'removing her sets the permanent retired flag for this crew');
    win.schedViewWeekStart = win.parseLocalDate('2026-08-29');
    win.schedCreateWeek();
    const afterBuild = win.dlLoadSchedule();
    t.assert(!afterBuild.days['2026-08-29'].laundry.some((p) => p[0] === 'Susan'),
      "a week built AFTER the removal (Aug 29) still does not have her, even though Aug 22's roster (the reference schedCreateWeek copies from) was never touched by the removal itself");

    // ── Re-uploading a workbook that still lists her must not bring her
    // back either — dlParseSchedule reads the file at face value, so the
    // filter has to run on the fresh parse, not just the roster copy. ──
    const fakeWb = { SheetNames: ['Week'], Sheets: {} }; // dlParseSchedule is stubbed below instead of driving real XLSX
    const originalParse = win.dlParseSchedule;
    win.dlParseSchedule = () => ({
      days: {
        '2026-09-05': { sheet: 'reuploaded', occ: '', dep: '', tdOcc: '', laundry: [['Susan', '1'], ['Olga A', '1']] },
      },
      count: 1,
    });
    const originalReadWorkbook = win.dlReadWorkbook;
    win.dlReadWorkbook = (file, cb) => cb(null, fakeWb);
    const fakeInput = { files: [{}], value: '' };
    win.dlUploadSchedule(fakeInput);
    await new Promise((r) => setTimeout(r, 80));
    win.dlParseSchedule = originalParse;
    win.dlReadWorkbook = originalReadWorkbook;
    const afterReupload = win.dlLoadSchedule();
    t.assert(!afterReupload.days['2026-09-05'].laundry.some((p) => p[0] === 'Susan'),
      "a re-uploaded workbook that still lists Susan in Laundry does not bring her back — the fresh parse is filtered the same as the roster copy");
    t.assert(afterReupload.days['2026-09-05'].laundry.some((p) => p[0] === 'Olga A'),
      'someone else genuinely on that same uploaded row is untouched — only the retired name is filtered');

    // ── Deliberately re-adding her clears the flag — she's not gone
    // forever, just until Carlos picks her again. ──
    win.schedViewWeekStart = win.parseLocalDate('2026-09-05');
    win.schedAddPerson('laundry', 'Susan');
    const afterReadd = win.dlLoadSchedule();
    t.assert(!win.schedIsRetired(afterReadd, 'laundry', 'Susan'), 'deliberately re-adding her clears the retired flag');
    t.assert(afterReadd.days['2026-09-05'].laundry.some((p) => p[0] === 'Susan'), 'and she is actually back on this week');
  }
};
