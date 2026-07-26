/* R106 backfill must keep refreshing a day it filled itself. If nobody ever
   confirmed the number by hand (roomsSource stays 'r106') and R106 is later
   corrected/updated for that same night, the stored count should silently
   track the new R106 net — not sit there triggering an Occupancy Mismatch
   against a number no human ever approved. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "R106 backfill refreshes a stale r106-sourced room count when R106 updates",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_r106_2026-07': {
        '2026-07-25': { occ: 169, comp: 0, net: 169 },
      },
      'hk_month_2026-07': {
        days: {},
        rooms: { '2026-07-25': 149 },
        roomsSource: { '2026-07-25': 'r106' },
      },
    });
    const { win } = await loadApp({ seed });

    const md0 = win.loadMonthData('2026-07');
    md0.rooms = { '2026-07-25': 149 };
    md0.roomsSource = { '2026-07-25': 'r106' };
    win.saveMonthData(md0, '2026-07');

    const changed = win.applyR106ToEmptyRooms('2026-07');
    t.assert(changed === true, 'backfill should report a change when the R106 net differs from the stored value');

    const md = win.loadMonthData('2026-07');
    t.eq(md.rooms['2026-07-25'], 169, 'stale r106-sourced 149 should refresh to the new R106 net 169');
    t.eq(md.roomsSource['2026-07-25'], 'r106', 'still tagged r106, not manual');

    // Running again is a no-op once the stored value matches R106 again.
    t.assert(win.applyR106ToEmptyRooms('2026-07') === false, 'second run should be a no-op once in sync');
  }
};
