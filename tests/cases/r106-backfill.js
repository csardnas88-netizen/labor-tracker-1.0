/* R106 → rooms backfill: empty days get filled from the R106 net so the budget
   isn't blank, while a manually-entered day is never overwritten. Guards the
   "R106 shows N rooms but the budget is blank" data-integrity gap. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "R106 backfill fills empty room days, protects manual ones",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // R106 occupancy store has three days...
      'hk_r106_2026-07': {
        '2026-07-18': { occ: 180, comp: 2, net: 178 },
        '2026-07-19': { occ: 200, comp: 0, net: 200 },
        '2026-07-20': { occ: 150, comp: 0, net: 150 },
      },
      // ...but the month's applied "rooms" only has one, and day 19 was set by hand.
      'hk_month_2026-07': {
        days: {},
        rooms: { '2026-07-19': 195 },
        roomsSource: { '2026-07-19': 'manual' },
      },
    });
    const { win } = await loadApp({ seed });

    // The app back-fills on load (renderLaborDash), which is the real behavior we
    // want. Re-create the gap explicitly so we can test the function directly.
    const md0 = win.loadMonthData('2026-07');
    md0.rooms = { '2026-07-19': 195 };
    md0.roomsSource = { '2026-07-19': 'manual' };
    win.saveMonthData(md0, '2026-07');

    const changed = win.applyR106ToEmptyRooms('2026-07');
    t.assert(changed === true, 'backfill should report a change');

    const md = win.loadMonthData('2026-07');
    t.eq(md.rooms['2026-07-18'], 178, 'empty day 18 should fill to R106 net 178');
    t.eq(md.rooms['2026-07-20'], 150, 'empty day 20 should fill to R106 net 150');
    t.eq(md.rooms['2026-07-19'], 195, 'manual day 19 must NOT be overwritten (stays 195)');
    t.eq(md.roomsSource['2026-07-19'], 'manual', 'manual source preserved');
    t.eq(md.roomsSource['2026-07-18'], 'r106', 'backfilled day tagged r106');

    // getRoomsForDay drives the budget off the PREVIOUS night; Jul 20's budget
    // uses Jul 19 (manual 195), Jul 21's uses Jul 20 (now 150).
    t.eq(win.getRoomsForDay('2026-07-21'), 150, 'Jul 21 budget should see Jul 20 = 150 after backfill');

    // Running again is a no-op (nothing empty left to fill).
    t.assert(win.applyR106ToEmptyRooms('2026-07') === false, 'second run should be a no-op');
  }
};
