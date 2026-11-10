/* Carlos's real report, 2026-11-09: "el 'Open view edit DND room list' no
   se marca. Yo agregué los DnD y aun así no se completa el checklist."

   The checklist step's own title is "Update the PREVIOUS DAY'S DNDs" — he
   adds them from nightDs's Occupancy card (e.g. viewing the Sprint for
   Monday, he opens Sunday's card and saves Sunday's DND room list there;
   saveDNDRoomsForDate stamps dndRoomsUpdatedAt under THAT date). But
   laborSprintAutoChecks(ds)'s `dnd` signal checked
   mData.dndRoomsUpdatedAt[ds] — TODAY — which a save against yesterday's
   date can never satisfy. Same bug class as the paychex fix in
   labor-sprint-am-review-detection.js, just never applied to this
   sibling flag in the same function. */
const { loadApp, fakeSession } = require('../_harness');

function seedDND(win, ds, savedAtIso, rooms) {
  const mk = ds.slice(0, 7);
  const key = 'hk_month_' + mk;
  let data = { days: {}, rooms: {} };
  try { const raw = win.localStorage.getItem(key); if (raw) data = JSON.parse(raw); } catch (e) {}
  data.dndRooms = data.dndRooms || {};
  data.dndRoomsUpdatedAt = data.dndRoomsUpdatedAt || {};
  data.dndRooms[ds] = rooms;
  data.dndRoomsUpdatedAt[ds] = savedAtIso;
  win.localStorage.setItem(key, JSON.stringify(data));
}

module.exports = {
  name: "laborSprintAutoChecks: the 'Update the Previous Day's DNDs' step auto-checks when the DND room list was saved for YESTERDAY (nightDs), not only when TODAY happens to have one — Carlos's real report that adding DNDs never completed the checklist",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Carlos's real case: viewing the Sprint for Monday Nov 9, he
    // saves DNDs against Sunday Nov 8 (the previous day's Occupancy
    // card) — exactly what the step title asks for. ──
    seedDND(win, '2026-11-08', '2026-11-09T14:00:00', '0211\n0508\n0613');
    let checks = win.laborSprintAutoChecks('2026-11-09');
    t.eq(checks.dnd, true, "saving DNDs against yesterday (Nov 8) while viewing today's (Nov 9) Sprint checks the step — this is the real bug fix");

    // ── Before any save, correctly still outstanding. ──
    win.localStorage.removeItem('hk_month_2026-11');
    checks = win.laborSprintAutoChecks('2026-11-09');
    t.eq(checks.dnd, false, 'with no DND save at all, the step is correctly unchecked');

    // ── A save against TODAY's own date (not yesterday) must NOT satisfy
    // this step — that would be the wrong day's DNDs. ──
    seedDND(win, '2026-11-09', '2026-11-09T14:00:00', '0211');
    checks = win.laborSprintAutoChecks('2026-11-09');
    t.eq(checks.dnd, false, "a DND save stamped against TODAY, not yesterday, does not satisfy 'the previous day's DNDs'");

    // ── Month boundary: viewing the Sprint for Nov 1 means the previous
    // day is Oct 31 — a DIFFERENT month's data blob. The fix loads
    // nightDs's own month fresh rather than reusing ds's, so this must
    // still be found. ──
    seedDND(win, '2026-10-31', '2026-11-01T08:00:00', '1203\n1406');
    checks = win.laborSprintAutoChecks('2026-11-01');
    t.eq(checks.dnd, true, 'a save against Oct 31 is found when viewing the Nov 1 Sprint, even though it lives in the previous month\'s own data blob');
  },
};
