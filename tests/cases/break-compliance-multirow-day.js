/* An employee can appear more than once in a single day's emps[] — a flat
   Holiday/PTO amount coded under their home department, plus their real
   worked shift coded under a different department they covered that day.
   Real case Carlos found: Jorge Gonzalez, 2026-07-03 — the daily report
   has TWO rows for id 26100064 that day:
     House Attendant (his home dept): paid:0, unpaid:0   (the Holiday line)
     Laundry Attendant (covered shift): paid:7.3, unpaid:0.5   (real, compliant break)
   Evaluating each row independently flagged him "No Break" from the
   Holiday row, even though the same person took a real compliant break
   on the other row that same day. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Break Compliance combines same-employee multi-row days (Holiday row + real-shift row)",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-03': {
            emps: [
              // Order matches the real data: the zero-break Holiday row comes first.
              { id: '26100064', name: 'Gonzalez, Jorge', pos: 'House Attendant', paid: 0, work: 0, unpaid: 0, regular: 8, ot1: 0 },
              { id: '26100064', name: 'Gonzalez, Jorge', pos: 'Laundry Attendant', paid: 7.3, work: 5.67, unpaid: 0.5, regular: 5.67, ot1: 1.63 },
            ],
          },
          // A genuine, real no-break day for the same employee, unrelated to
          // any split-row scenario — must still be flagged normally.
          '2026-07-06': {
            emps: [{ id: '26100064', name: 'Gonzalez, Jorge', pos: 'House Attendant', paid: 8, work: 8, unpaid: 0, regular: 8, ot1: 0 }],
          },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const combined = win.combineDayEntries(
      [
        { id: '26100064', name: 'Gonzalez, Jorge', pos: 'House Attendant', paid: 0, unpaid: 0 },
        { id: '26100064', name: 'Gonzalez, Jorge', pos: 'Laundry Attendant', paid: 7.3, unpaid: 0.5 },
      ],
      '26100064'
    );
    t.eq(combined.unpaidMin, 30, 'the longer (real) break wins — 30 minutes, not the Holiday row\'s 0');
    t.eq(combined.pos, 'Laundry Attendant', 'the row with the most paid hours is used as the representative position');

    const data = win.getMonthBreakData('2026-07');
    t.eq(data['26100064'].total, 1, 'only the genuine Jul 6 no-break day counts — Jul 3 resolves as compliant');
    t.eq(data['26100064'].none, 1, 'and it is correctly a No Break exception');

    /* ── the calendar shows Jul 3 as compliant, not a violation ── */
    const weeks = win.getEmployeeBreakWeeks('2026-07', '26100064');
    const allCells = weeks.flatMap(w => w.cells);
    const jul3 = allCells.find(c => c.date === 3);
    const jul6 = allCells.find(c => c.date === 6);
    t.assert(!jul3, 'Jul 3 never appears at all — its week has no real exception to show (the only week returned is Jul 6\'s)');
    t.assert(!!jul6 && jul6.status === 'none', 'Jul 6, the genuine no-break day, is the one that shows up');

    /* Sanity: Jul 3 truly resolves as 'ok' when checked directly. */
    const jul3Snap = win.loadMonthData('2026-07').days['2026-07-03'];
    const jul3Combined = win.combineDayEntries(jul3Snap.emps, '26100064');
    t.eq(win.breakStatus(jul3Combined.unpaidMin, jul3Combined.pos, '26100064'), 'ok', 'Jul 3, combined, is a compliant break — not a violation');
  }
};
