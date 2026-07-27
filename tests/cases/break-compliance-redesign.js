/* Break Compliance redone on the same pattern as Overtime/Position Check:
   a "Who" ranking for the selected month (not an all-time table sitting on
   top of a week-by-week list you had to open one at a time), with
   click-to-expand showing the full hotel week — every day worked, not
   just the flagged ones — so a real pattern (e.g. breaks that are
   consistently 1 minute over 30, a very different problem than actually
   skipping a break) is visible instead of buried in the scroll. Per
   Carlos's explicit call, there is no "Where" or "Trend" section here. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Break Compliance: monthly Who ranking, full-week detail, no exceptions vs no data",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          // Heidy: one real no-break day and one borderline "over" day (31 min).
          '2026-07-06': { emps: [{ id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', unpaid: 0 }] },
          '2026-07-07': { emps: [{ id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', unpaid: 31 / 60 }] },
          // Olga: one compliant day (30 min, must NOT count) and one 1-minute-over day.
          '2026-07-08': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', unpaid: 30 / 60 }] },
          '2026-07-09': { emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', unpaid: 31 / 60 }] },
          // A genuine long break (+40 min).
          '2026-07-10': { emps: [{ id: '26100109', name: 'Hermelinda Noriega', pos: 'Room Attendant', unpaid: 45 / 60 }] },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const data = win.getMonthBreakData('2026-07');
    t.eq(data['26100006'].none, 1, 'Heidy has one No Break day');
    t.eq(data['26100006'].short, 1, 'and one Short/Over day (31 min)');
    t.eq(data['26100006'].total, 2, 'her total is 2');

    t.eq(data['26100005'].total, 1, 'Olga\'s compliant 30-min day does not count — only the 31-min day does');
    t.eq(data['26100005'].short, 1, 'her one real exception lands in the short/over bucket');

    t.eq(data['26100109'].long, 1, 'a 45-minute break is a Long Break exception');
    t.assert(!data['26100109'].none && !data['26100109'].short, 'and only the long bucket, nothing else');

    /* ── full-week detail: every day, not just the flagged one ── */
    const weeks = win.getEmployeeBreakWeeks('2026-07', '26100006');
    t.eq(weeks.length, 1, 'Heidy\'s two exception days fall in the same hotel week');
    const cells = weeks[0].cells;
    // cells are Sat,Sun,Mon,Tue,Wed,Thu,Fri — Jul 6 is a Monday, Jul 7 a Tuesday.
    t.eq(cells[2].status, 'none', 'Jul 6 (Mon, index 2) is the No Break day');
    t.eq(cells[3].status, 'over', 'Jul 7 (Tue, index 3) is the 31-min over day — breakStatus\'s precise status, not the collapsed short/over bucket');
    t.assert(cells[0].off === true, 'Sat (no entry) renders as off');

    /* ── rendering ── */
    win.showPage('breaks');
    let html = win.document.getElementById('breaksPageContent').innerHTML;
    t.assert(html.indexOf('Heidy Ajsoc') > -1, 'Heidy appears');
    t.assert(html.indexOf('Olga Ajpacaja') > -1, 'Olga appears');
    t.assert(html.indexOf('Hermelinda Noriega') > -1, 'Hermelinda appears');
    // Heidy (total 2) should rank above Olga and Hermelinda (total 1 each).
    t.assert(html.indexOf('Heidy Ajsoc') < html.indexOf('Olga Ajpacaja'), 'Heidy (2 exceptions) ranks above the others (1 each)');
    t.assert(html.indexOf('Where') === -1, 'no "Where" section per Carlos\'s explicit call');
    t.assert(html.indexOf('Trend') === -1, 'no "Trend" section per Carlos\'s explicit call');

    win.bcToggleEmp('26100006');
    html = win.document.getElementById('breaksPageContent').innerHTML;
    t.assert(html.indexOf('No break') > -1, 'expanding Heidy shows her No Break day labeled');
    t.assert(html.indexOf('31 min') > -1, 'and her 31-minute day');
    t.assert(html.indexOf('off') > -1, 'and her days off that week');

    /* ── empty states: no data vs. genuinely zero exceptions ── */
    win.changeBcMonth(1); // -> August, nothing loaded
    const augustHtml = win.document.getElementById('breaksPageContent').innerHTML;
    t.assert(augustHtml.indexOf('No reports uploaded yet') > -1, 'a month with no data says so, not "no exceptions"');
    win.changeBcMonth(-1); // back to July
  }
};
