/* Time Card Check compares Paychex's Weekly Time Card (per employee, whole
   department) against the app's own daily total. Before this fix, the app
   side only ever summed snap.emps (HK department clock-ins), so any day an
   HK-roster employee worked a non-HK department (e.g. Banquet) permanently
   showed as "Changed" — Paychex's time card still counts her under
   Housekeeping, but the app's daily total silently dropped her hours, and
   no amount of re-uploading that day's PDF could ever fix it, since those
   hours live in otherEmps, which this comparison never read.

   Real case that surfaced this (2026-07-27): Susan Aguilar Ambrocio worked
   Banquet on 7/17 (paid 8.53h, OT 6.92h per Paychex) — exactly the size of
   the "Changed" diff Carlos saw on that day in Time Card Check. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Time Card Check folds in otherEmps hours for HK-roster employees who worked a non-HK department",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-17': {
            emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8, ot1: 0 }],
            otherEmps: [
              // Susan (real roster id 26100002, primary "Housekeeping Supervisor") — a real HK employee, off in Banquet that day.
              { id: '26100002', name: 'Susan Karina Aguilar Ambrocio', pos: 'Banquet', paid: 8.53, ot1: 6.92 },
              // A genuine outside contractor — never counted here before, must stay excluded now too.
              { id: '99999903', name: 'Totally External', pos: 'Banquet', paid: 5, ot1: 0 },
            ],
          },
        },
      },
    });
    const { win } = await loadApp({ seed });

    // Paychex's Weekly Time Card: both Olga and Susan show up under Housekeeping
    // (Susan because she belongs to the department, even though that day's punch
    // was coded to Banquet). The outside contractor never appears here at all.
    const report = {
      startDate: '2026-07-13', endDate: '2026-07-19',
      byId: {
        '26100005': { id: '26100005', name: 'Olga Ajpacaja', days: {
          '2026-07-17': { reg: 8, ot: 0, nonwkd: 0, total: 8, unpaid: 0, types: [] },
        }},
        '26100002': { id: '26100002', name: 'Susan Karina Aguilar Ambrocio', days: {
          '2026-07-17': { reg: 1.61, ot: 6.92, nonwkd: 0, total: 8.53, unpaid: 0, types: ['Banquet'] },
        }},
      },
    };

    const days = win.wtc_computeDays(report);
    const d17 = days.find(d => d.ds === '2026-07-17');
    t.assert(!!d17, '7/17 is present in the computed comparison');

    t.eq(d17.wtcSum, 16.53, 'Weekly Time Card total: Olga 8 + Susan 8.53');
    t.assert(Math.abs(d17.appSum - 16.53) < 0.001, `app total should now include Susan's Banquet hours too (got ${d17.appSum})`);
    t.assert(Math.abs(d17.diff) < 0.001, `paid diff should resolve to ~0 once Susan's hours are counted (got ${d17.diff})`);

    t.eq(d17.wtcOtSum, 6.92, 'Weekly Time Card OT: Susan\'s 6.92h');
    t.assert(Math.abs(d17.appOtSum - 6.92) < 0.001, `app OT should now include Susan's 6.92h (got ${d17.appOtSum})`);
    t.assert(Math.abs(d17.otDiff) < 0.001, `OT diff should resolve to ~0 (got ${d17.otDiff})`);

    t.eq(d17.status, 'ok', 'the day now reconciles instead of showing "Changed" forever');

    t.assert(!!d17.appEmps['26100002'], 'Susan appears in the per-employee breakdown');
    t.assert(Math.abs(d17.appEmps['26100002'].paid - 8.53) < 0.001, 'her breakdown row shows the correct paid hours');
    t.assert(!d17.appEmps['99999903'], 'the outside contractor is excluded — no HK primary position, never counted here');
  }
};
