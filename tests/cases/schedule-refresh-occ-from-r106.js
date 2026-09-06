/* Carlos's follow-up, 2026-09-06: he re-uploaded a CORRECTED R106 for a week
   he's still actively building and expected the schedule's OCC/Departures
   boxes to pick up the new numbers — the opposite of the permanent
   blank-only rule in schedule-occ-from-r106.js, which is exactly what he
   wanted for a week he'd already finished. His resolution: a manual
   "Refresh OCC from R106" button, scoped to the week on screen, that pulls
   in the latest report except any box he's typed into by hand himself.

   Same NIGHT-date convention as schedBackfillOccFromR106 (fixed alongside
   this test, 2026-09-06): the OCC box for schedule date ds reads R106's
   row for prevDateStr(ds), one calendar day earlier. Every fixture below
   keys its R106 rows accordingly.

   Second real bug, same day: occAuto/depAuto only started being recorded
   the moment this button shipped — every box already auto-filled before
   that (including Carlos's whole Sept 12-18 week, which the night-date bug
   above had filled with the WRONG number) has the flag undefined, not
   true, so treating "undefined" as protected made the button a no-op on
   exactly the boxes it exists to fix. Only an EXPLICIT false (set by
   schedSetNum once he's actually typed into the box) counts as protected.

   Third real bug, same day: the box must take rec.occ (Total Occ), not
   rec.net (Total Occ minus Comp rooms) — Carlos's real report, Sept 14
   read 192 on the R106 but refreshing the box gave 186. A Comp room still
   needs cleaning, so it must stay in the Schedule's count even though
   Labor's own budget math excludes it. Every fixture below sets comp>0 on
   at least one row so occ !== net, and asserts against occ. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "schedRefreshOccFromR106: re-pulls R106 from the NIGHT BEFORE each date using Total Occ (comp rooms included), refreshing legacy auto-filled boxes (occAuto undefined) too, but never one Carlos explicitly typed by hand (occAuto===false)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      '2026-09-11': { occ: 320, comp: 5, net: 315, dep: 88 },
      '2026-09-12': { occ: 250, comp: 2, net: 248, dep: 61 },
      '2026-09-13': { occ: 230, comp: 2, net: 228, dep: 47 },
    }));

    const SCH = {
      days: {
        // Auto-filled under the new (flagged) code — the ordinary case.
        '2026-09-12': { sheet: 't', occ: '290', occAuto: true, dep: '80', depAuto: true, tdOcc: '' },
        // Auto-filled BEFORE this button existed — no occAuto flag at all,
        // same as every box in Carlos's real Sept 12-18 week. Must still
        // refresh: this is the exact case his real report hit.
        '2026-09-13': { sheet: 't', occ: '125', dep: '', tdOcc: '' },
        // Genuinely typed by hand (schedSetNum sets occAuto explicitly
        // false) — must survive the refresh untouched.
        '2026-09-14': { sheet: 't', occ: '400', occAuto: false, dep: '', tdOcc: '' },
      },
      count: 3,
      savedAt: new Date().toISOString(),
    };
    win.dlSaveSchedule(SCH);

    const dates = ['2026-09-12', '2026-09-13', '2026-09-14'];
    const refreshed = win.schedRefreshOccFromR106(dates);
    t.eq(refreshed, 3, 'reports how many days actually changed (09-12 OCC, 09-13 OCC+Departures fill, 09-14 Departures fills)');

    const after = win.dlLoadSchedule();
    t.eq(after.days['2026-09-12'].occ, '320', "a flagged auto-filled box updates to the NIGHT BEFORE's Total Occ (09-11's report, for 09-12), comp rooms included");
    t.eq(after.days['2026-09-12'].dep, '88', 'same for its auto-filled Departures box');

    t.eq(after.days['2026-09-13'].occ, '250', "a legacy box with no occAuto flag at all still refreshes — Carlos's real bug, the button must be able to fix it (09-12's night, Total Occ not net)");
    t.eq(after.days['2026-09-13'].dep, '61', 'and its blank Departures box fills the same way');
    t.eq(after.days['2026-09-13'].occAuto, true, 'now explicitly marked auto, so it stops being ambiguous going forward');

    t.eq(after.days['2026-09-14'].occ, '400', "Carlos's explicitly hand-typed OCC (occAuto===false) survives the refresh untouched");
    t.eq(after.days['2026-09-14'].dep, '47', "but its blank Departures box still fills, from the night before (09-13's night) — only OCC was hand-typed on this day");

    // Once refreshed, editing that box by hand must protect it going forward.
    win.schedSetNum('2026-09-12', 'occ', '300');
    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      // Same dep as the first refresh (88) — only OCC changed in the report,
      // isolating the assertion to the field Carlos actually hand-edited.
      '2026-09-11': { occ: 360, comp: 5, net: 355, dep: 88 },
    }));
    const second = win.schedRefreshOccFromR106(['2026-09-12']);
    const afterEdit = win.dlLoadSchedule();
    t.eq(afterEdit.days['2026-09-12'].occ, '300', 'a box edited by hand after a refresh is now protected, just like the permanent backfill');
    t.eq(second, 0, 'so a further refresh finds nothing left to change on that day (Departures matches the report already, OCC is protected)');

    // Nothing at all to work with is handled without throwing.
    t.eq(win.schedRefreshOccFromR106([]), 0, 'no dates given is a no-op, not a crash');
  },
};
