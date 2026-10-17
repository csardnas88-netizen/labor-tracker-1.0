/* Carlos's ask, 2026-10-17: a "Total OT" line under the OT column in
   Labor Effectiveness, so whoever's running the live labor meeting can
   read the week's total overtime without adding up every position by
   hand. Sums EVERY position's weekOT (wt.weekOT[p.key]), not just the
   rows that happen to render that week. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Labor Effectiveness shows a "Total OT" line summing every position\'s weekly OT, right under the OT column',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_rooms_migrated_v2: '1',
      'hk_month_2026-08': {
        days: {
          '2026-08-01': {
            totalPaid: 50,
            byPosition: {
              'Room Attendant': { paid: 30, ot1: 3.5 },
              'House Attendant': { paid: 20, ot1: 2.25 },
            },
          },
        },
        rooms: { '2026-07-31': 150 },
      },
    });
    const { win } = await loadApp({ seed });
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    const html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    t.assert(/Total OT/.test(html), 'the Total OT line renders');
    const idx = html.indexOf('Total OT');
    t.assert(/5\.75/.test(html.slice(idx, idx + 200)), "sums both positions' OT (3.50 + 2.25 = 5.75), not just one");

    // ── Zero total OT shows the same em-dash the per-row cells use, not "0.00" ──
    const seedNoOT = Object.assign(fakeSession(), {
      hk_rooms_migrated_v2: '1',
      'hk_month_2026-08': {
        days: { '2026-08-01': { totalPaid: 30, byPosition: { 'Room Attendant': { paid: 30, ot1: 0 } } } },
        rooms: { '2026-07-31': 150 },
      },
    });
    const { win: win2 } = await loadApp({ seed: seedNoOT });
    const html2 = win2.buildLaborEffectivenessHTML(win2.loadMonthData('2026-08').days, 200, week);
    const idx2 = html2.indexOf('Total OT');
    t.assert(idx2 !== -1, 'the Total OT line still renders with zero OT');
    t.assert(/&#8212;/.test(html2.slice(idx2, idx2 + 200)), 'and shows an em-dash, not "0.00", when nobody has any OT');
  },
};
