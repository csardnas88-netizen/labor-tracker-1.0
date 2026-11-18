/* Found during code review, 2026-11-17 (not yet a live Carlos report):
   schedExportWarnings's own comment claimed it "forces the exact same
   passes renderSchedule's own self-heal runs" before reading anything,
   but it was actually missing schedSyncAllLaundryCoverRows/
   schedSyncAllLobbyCoverRows — the two passes that CREATE a linked
   person's cover row in the first place (exactly what the same-day
   Sandra/Laundry fix restores). renderDailyLineup's own self-heal had
   the identical gap. Opening Export or Daily Lineup before the Schedule
   tab has rendered this session (data just arrived via sync, straight to
   Export/Lineup) could silently miss a linked person's cover row that
   genuinely should exist, undercounting coverage. Both now run the same
   creation passes renderSchedule does, in the same order, before
   reading anything. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedExportWarnings and renderDailyLineup both create a linked person\'s missing cover row before reading anything, not just clean up an existing one',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const ds = '2026-11-21';

    // ── schedExportWarnings: Sandra marked LAUNDRY on Room Attendant,
    // no laundry row at all yet — must create it, not just leave it be. ──
    const SCH1 = { days: { [ds]: { gra: [['Sandra', 'LAUNDRY']] } } };
    win.schedExportWarnings(SCH1, [ds]);
    const laundryRows1 = (SCH1.days[ds].laundry || []);
    t.assert(laundryRows1.some((r) => r[0] === 'Sandra' && r[1] === '1'),
      'schedExportWarnings creates Sandra\'s missing Laundry cover row before computing anything, matching renderSchedule\'s own self-heal chain');

    // ── renderDailyLineup: same scenario, driven through the real page
    // render so it exercises the actual wiring, not just the function
    // in isolation. ──
    win.dlSaveSchedule({ days: { [ds]: { gra: [['Sandra', 'LAUNDRY']] } }, count: 1, savedAt: new Date().toISOString() });
    win.renderDailyLineup();
    const saved = JSON.parse(win.localStorage.getItem('hk_dl_schedule'));
    const laundryRows2 = (saved.days[ds] && saved.days[ds].laundry) || [];
    t.assert(laundryRows2.some((r) => r[0] === 'Sandra' && r[1] === '1'),
      'renderDailyLineup\'s own self-heal also creates the missing row, not just cleans up an already-existing one');
  },
};
