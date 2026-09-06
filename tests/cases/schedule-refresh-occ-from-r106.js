/* Carlos's follow-up, 2026-09-06: he re-uploaded a CORRECTED R106 for a week
   he's still actively building and expected the schedule's OCC/Departures
   boxes to pick up the new numbers — the opposite of the permanent
   blank-only rule in schedule-occ-from-r106.js, which is exactly what he
   wanted for a week he'd already finished. His resolution: a manual
   "Refresh OCC from R106" button, scoped to the week on screen, that pulls
   in the latest report EXCEPT any box he's typed into by hand himself
   (occAuto/depAuto is false there) — same protection the permanent
   backfill already gives a hand-typed estimate, just triggered on demand
   instead of only once. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "schedRefreshOccFromR106: a manual button that re-pulls R106 into THIS week, but never overwrites a box Carlos typed by hand (2026-09-06 ask)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      '2026-09-12': { occ: 320, comp: 2, net: 315, dep: 88 },
      '2026-09-13': { occ: 250, comp: 0, net: 248, dep: 61 },
      '2026-09-14': { occ: 230, comp: 0, net: 228, dep: 47 },
    }));

    const SCH = {
      days: {
        // Auto-filled yesterday from an earlier R106 upload.
        '2026-09-12': { sheet: 't', occ: '290', occAuto: true, dep: '80', depAuto: true, tdOcc: '' },
        // Carlos typed this OCC number in by hand — must survive the refresh.
        '2026-09-13': { sheet: 't', occ: '265', dep: '', tdOcc: '' },
        // Still blank — a plain first-time fill, same as the backfill above.
        '2026-09-14': { sheet: 't', occ: '', dep: '', tdOcc: '' },
      },
      count: 3,
      savedAt: new Date().toISOString(),
    };
    win.dlSaveSchedule(SCH);

    const dates = ['2026-09-12', '2026-09-13', '2026-09-14'];
    const refreshed = win.schedRefreshOccFromR106(dates);
    t.eq(refreshed, 3, 'reports how many days actually changed, for the button\'s toast (09-12 updates, 09-13 fills its blank Departures, 09-14 fills fresh)');

    const after = win.dlLoadSchedule();
    t.eq(after.days['2026-09-12'].occ, '315', 'an auto-filled box updates to the corrected report figure');
    t.eq(after.days['2026-09-12'].dep, '88', 'same for its auto-filled Departures box');

    t.eq(after.days['2026-09-13'].occ, '265', "Carlos's own hand-typed OCC survives the refresh untouched");
    t.eq(after.days['2026-09-13'].dep, '61', 'but the still-blank Departures box next to it does fill');

    t.eq(after.days['2026-09-14'].occ, '228', 'a plain blank box fills the same way the permanent backfill already does');
    t.eq(after.days['2026-09-14'].occAuto, true, 'and is marked auto so a LATER refresh can still update it again');

    // Once refreshed, editing that box by hand must protect it going forward.
    win.schedSetNum('2026-09-12', 'occ', '300');
    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      // Same dep as the first refresh (88) — only OCC changed in the report,
      // isolating the assertion to the field Carlos actually hand-edited.
      '2026-09-12': { occ: 320, comp: 2, net: 340, dep: 88 },
    }));
    const second = win.schedRefreshOccFromR106(['2026-09-12']);
    const afterEdit = win.dlLoadSchedule();
    t.eq(afterEdit.days['2026-09-12'].occ, '300', 'a box edited by hand after a refresh is now protected, just like the permanent backfill');
    t.eq(second, 0, 'so a further refresh finds nothing left to change on that day (Departures matches the report already, OCC is protected)');

    // Nothing at all to work with is handled without throwing.
    t.eq(win.schedRefreshOccFromR106([]), 0, 'no dates given is a no-op, not a crash');
  },
};
