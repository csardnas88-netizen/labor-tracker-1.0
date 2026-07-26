/* Occupancy Mismatch / Fix Now: confirming a manual rooms count — even one
   that still differs from R106 — must be treated as resolved, not re-flagged
   forever. Before this fix, saveOccupancyRoom (what the Fix Now modal's Save
   button calls) wrote the value but never marked it 'manual' the way the
   normal rooms field does, so the mismatch banner reappeared immediately
   after "fixing" it, making it look like the save hadn't worked. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Occupancy mismatch: confirming via Fix Now stops re-flagging that night",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_r106_2026-07': {
        '2026-07-24': { occ: 144, comp: 2, net: 142 },
      },
      'hk_month_2026-07': {
        days: {},
        rooms: {},
        roomsSource: {},
      },
    });
    const { win } = await loadApp({ seed });

    // The app auto-backfills empty rooms from R106 on load (same as
    // r106-backfill.js) — re-create the "nobody has entered anything yet"
    // gap explicitly so we're testing the manual-confirm path, not the
    // backfill itself.
    const md0 = win.loadMonthData('2026-07');
    md0.rooms = {};
    md0.roomsSource = {};
    win.saveMonthData(md0, '2026-07');

    // Before any manual entry: no source recorded for that night.
    t.eq(win.getRoomsSourceForDay('2026-07-25'), null, 'no rooms source before any entry');

    // Manager enters 146 by hand for the night of Jul 24 (drives Jul 25's
    // budget) via the Fix Now modal's Save button — same call it makes.
    win.saveOccupancyRoom('2026-07-25', 146);

    const md = win.loadMonthData('2026-07');
    t.eq(md.rooms['2026-07-24'], 146, 'manual value 146 is saved');
    t.eq(md.roomsSource['2026-07-24'], 'manual', 'BUG FIX: Fix Now must mark the night manual, same as the normal rooms field');
    t.eq(win.getRoomsSourceForDay('2026-07-25'), 'manual', 'getRoomsSourceForDay sees it as confirmed manual');

    // Recompute the exact mismatch condition the day view and the monthly
    // recap both use: manual>0 && r106>0 && manual!==r106 && NOT already confirmed manual.
    const r = win.getRoomsForDay('2026-07-25');
    const r106 = 142;
    const hasMismatch = r > 0 && r106 > 0 && r !== r106 && win.getRoomsSourceForDay('2026-07-25') !== 'manual';
    t.assert(hasMismatch === false, "BUG FIX: mismatch banner must NOT reappear once the manager confirmed 146, even though it still differs from R106's 142");

    // A night that was NEVER confirmed manual (e.g. still sourced from R106
    // auto-fill) must keep showing the mismatch if it genuinely disagrees —
    // this fix must not silence real, unconfirmed discrepancies.
    const md2 = win.loadMonthData('2026-07');
    md2.rooms['2026-07-18'] = 200;
    md2.roomsSource['2026-07-18'] = 'r106';
    win.saveMonthData(md2, '2026-07');
    const r2 = win.getRoomsForDay('2026-07-19');
    const hasMismatch2 = r2 > 0 && 178 > 0 && r2 !== 178 && win.getRoomsSourceForDay('2026-07-19') !== 'manual';
    t.assert(hasMismatch2 === true, 'an unconfirmed (r106-sourced) discrepancy must still be flagged');
  }
};
