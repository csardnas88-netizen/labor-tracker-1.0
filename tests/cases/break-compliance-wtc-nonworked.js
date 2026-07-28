/* The daily Labor Distribution Report has no Holiday/Vacation/Flex Time
   concept — a paid day with no actual shift shows unpaid=0 and gets
   flagged as "No Break", which is meaningless with no shift to break
   from. Real case that surfaced this: Carlos found Olga Ajpacaja flagged
   "No Break" on 2026-07-03, but her Weekly Time Card Report shows that
   day as {reg:0, nonwkd:8, unpaid:0, types:['Holiday']} — she wasn't
   working at all. The Weekly Time Card Report (uploaded separately, for
   Time Card Check) is the only source that distinguishes this, so Break
   Compliance now cross-references it when available. Per Carlos's
   explicit choice, there is no manual override — this only works for
   days a Weekly Time Card Report actually covers. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Break Compliance cross-references the Weekly Time Card Report to exclude Holiday/Vacation/Flex days",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          // Olga's daily report shows both days as a flat 8h/0-unpaid entry —
          // the daily report has no idea these were Holiday/Vacation.
          '2026-07-03': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8, unpaid: 0 }] },
          '2026-07-10': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8, unpaid: 0 }] },
          // A genuine no-break day in the SAME hotel week as Jul 3 (Jun27–Jul3),
          // so that week still has a real exception to investigate and shows up.
          '2026-07-01': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8, unpaid: 0 }] },
          // A genuinely worked no-break day for Olga, in the same week as Jul 10.
          '2026-07-06': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8, unpaid: 0 }] },
          // Susan: a MIXED day — part Holiday, part real work — with a real
          // (non-compliant) break. Must NOT be excluded: she did work part
          // of the day, so the break rule still applies to that shift.
          '2026-07-17': { emps: [{ id: '26100002', name: 'Susan Karina Aguilar Ambrocio', pos: 'Housekeeping Supervisor', paid: 8.12, unpaid: 0 }] },
          // Hermelinda: a real no-break day, but with NO Weekly Time Card
          // coverage at all for her — must fall back to the old behavior.
          '2026-07-09': { emps: [{ id: '26100109', name: 'Hermelinda Noriega', pos: 'Room Attendant', paid: 8, unpaid: 0 }] },
        },
      },
      hk_wtc_report: {
        startDate: '2026-07-01', endDate: '2026-07-21',
        byId: {
          '26100005': { id: '26100005', name: 'Ajpacaja, Olga', days: {
            '2026-07-03': { reg: 0, ot: 0, nonwkd: 8, total: 8, unpaid: 0, types: ['Holiday'] },
            '2026-07-10': { reg: 0, ot: 0, nonwkd: 8, total: 8, unpaid: 0, types: ['Vacation'] },
            '2026-07-01': { reg: 7.45, ot: 0, nonwkd: 0, total: 7.45, unpaid: 0, types: ['Work'] },
            '2026-07-06': { reg: 7.45, ot: 0, nonwkd: 0, total: 7.45, unpaid: 0, types: ['Work'] },
          }},
          '26100002': { id: '26100002', name: 'Aguilar Ambrocio, Susan', days: {
            '2026-07-17': { reg: 6.1, ot: 2.02, nonwkd: 8, total: 16.12, unpaid: 0, types: ['Holiday', 'Work'] },
          }},
          // Note: no entry at all for 26100109 (Hermelinda) — she's simply
          // not covered by this Time Card Report.
        },
      },
    });
    const { win } = await loadApp({ seed });

    t.eq(win.wtcNonWorkedLabel('26100005', '2026-07-03'), 'Holiday', 'Olga\'s Jul 3 resolves to a Holiday label');
    t.eq(win.wtcNonWorkedLabel('26100005', '2026-07-10'), 'Vacation', 'her Jul 10 resolves to Vacation');
    t.eq(win.wtcNonWorkedLabel('26100005', '2026-07-06'), null, 'a real work day (reg>0) is not non-worked');
    t.eq(win.wtcNonWorkedLabel('26100002', '2026-07-17'), null, 'a mixed Holiday+Work day is NOT excluded — reg+ot > 0 means a real shift happened');
    t.eq(win.wtcNonWorkedLabel('26100109', '2026-07-09'), null, 'an employee with no Time Card Report coverage at all falls back to null, not a guess');

    const data = win.getMonthBreakData('2026-07');
    t.eq(data['26100005'].total, 2, 'Olga\'s Jul 3 (Holiday) and Jul 10 (Vacation) are excluded — only Jul 1 and Jul 6 (real no-break days) count');
    t.eq(data['26100005'].none, 2, 'both of her real exceptions are No Break');

    t.eq(data['26100002'].none, 1, 'Susan\'s mixed Holiday+Work day still counts as a real No Break exception');

    t.eq(data['26100109'].none, 1, 'Hermelinda\'s no-break day still counts — no Time Card Report covers her, so the old behavior applies');

    /* ── the calendar shows the Holiday/Vacation label, not a break status ── */
    const weeks = win.getEmployeeBreakWeeks('2026-07', '26100005');
    t.eq(weeks.length, 2, 'both weeks show up — each has a real exception (Jul 1 and Jul 6) alongside its excluded day (Jul 3 and Jul 10)');
    const allCells = weeks.flatMap(w => w.cells);
    const holidayCell = allCells.find(c => c.date === 3);
    const vacationCell = allCells.find(c => c.date === 10);
    const realExceptionCells = allCells.filter(c => c.date === 1 || c.date === 6);
    t.assert(!!holidayCell && holidayCell.nonworked === true && holidayCell.label === 'Holiday', 'Jul 3 renders as nonworked with the Holiday label, not a break status');
    t.assert(!!vacationCell && vacationCell.nonworked === true && vacationCell.label === 'Vacation', 'Jul 10 renders as nonworked with the Vacation label, not a break status');
    t.eq(realExceptionCells.length, 2, 'Jul 1 and Jul 6 are the two real exception cells');
    t.assert(realExceptionCells.every(c => c.status === 'none' && !c.nonworked), 'both of those genuinely show as No Break — only the Holiday/Vacation days get the nonworked treatment');

    win.showPage('breaks');
    win.bcToggleEmp('26100005');
    const html = win.document.getElementById('breaksPageContent').innerHTML;
    t.assert(html.indexOf('Holiday') > -1, 'Holiday label renders on the page');
    t.assert(html.indexOf('Vacation') > -1, 'Vacation label renders on the page');
  }
};
