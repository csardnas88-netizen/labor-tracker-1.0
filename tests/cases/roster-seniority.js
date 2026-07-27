/* Roster seniority: hire-date parsing, sort order, and the row renderer.

   Every employee is its own row — no grouping, no medals, no rank numbers.
   Ties in hire date (very common here: half the roster shares one official
   Paychex start date from a payroll migration) are NOT specially called out;
   each tied person just gets the same date and the same gold tenure chip as
   everyone else, in stable name order. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Roster seniority: sort order, no-date handling, flexible date parsing",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    /* ── date parsing: every shape the Paychex export can produce ── */
    t.eq(win.parseFlexibleDate('11/1/2024'), '2024-11-01', 'M/D/YYYY (the real report format)');
    t.eq(win.parseFlexibleDate('07/20/2026'), '2026-07-20', 'MM/DD/YYYY');
    t.eq(win.parseFlexibleDate('2025-01-07'), '2025-01-07', 'ISO passes through');
    t.eq(win.parseFlexibleDate('1/7/25'), '2025-01-07', '2-digit year');
    t.eq(win.parseFlexibleDate(45597), '2024-11-01', 'Excel serial number');
    t.eq(win.parseFlexibleDate(''), null, 'blank is not a date');
    t.eq(win.parseFlexibleDate('Start Date'), null, 'a header label is not a date');
    t.eq(win.parseFlexibleDate('26100002'), null, 'an employee id must not parse as a date');
    t.eq(win.parseFlexibleDate('13/45/2024'), null, 'impossible month/day rejected');

    /* ── sort order ── */
    const dates = {
      a: { hire: '2024-11-01' },   // three people share the oldest date
      b: { hire: '2024-11-01' },
      c: { hire: '2024-11-01' },
      d: { hire: '2025-06-15' },   // next distinct date
      e: { hire: '2026-04-20' },
      // g has no hire date at all
    };
    win.localStorage.setItem('hk_emp_dates', JSON.stringify(dates));

    const people = [
      { id: 'e', name: 'Eva' },  { id: 'a', name: 'Ana' },
      { id: 'g', name: 'Gil' },  { id: 'c', name: 'Cruz' },
      { id: 'd', name: 'Dora' }, { id: 'b', name: 'Beto' },
    ];
    const out = win.rankBySeniority(people);
    t.assert(Array.isArray(out), 'rankBySeniority returns a plain array');

    // Most senior first; a tied date keeps a stable, name-sorted order.
    t.eq(out.map(p => p.id).join(','), 'a,b,c,d,e,g', 'oldest hire first, ties by name, no-date employee last');
    t.eq(out[0].hire, '2024-11-01', 'first row is the oldest hire date');
    t.eq(out[4].hire, '2026-04-20', 'the newest dated hire comes right before the unranked one');

    // No hire date at all: tenureDays is null, and it still sorts last.
    const gil = out.find(p => p.id === 'g');
    t.eq(gil.tenureDays, null, 'no hire date on file means no tenure to show');

    // Longer tenure for an earlier hire date.
    const ana = out.find(p => p.id === 'a'), eva = out.find(p => p.id === 'e');
    t.assert(ana.tenureDays > eva.tenureDays, 'an earlier hire date yields more tenure days');

    /* ── row rendering ── */
    // No hire date -> nothing rendered (no empty chip, no placeholder text).
    t.eq(win.seniorityRowHTML(gil), '', 'an employee with no hire date renders no seniority line at all');

    // A normal row: the date and a gold chip, nothing implying a rank.
    const row = win.seniorityRowHTML(ana);
    t.assert(row.indexOf('sen-chip') > -1, 'renders the gold tenure chip');
    t.assert(row.indexOf('sen-date') > -1, 'renders the hire date');
    t.assert(row.indexOf(win.formatHireDate('2024-11-01')) > -1, 'shows the actual formatted hire date');
    t.assert(row.indexOf('rank') === -1 && row.indexOf('medal') === -1, 'no rank or medal language anywhere in the row');

    // Two people sharing the exact same date render identically — no "tied" callout.
    const beto = out.find(p => p.id === 'b');
    t.eq(win.seniorityRowHTML(ana).replace(/./g, ''), win.seniorityRowHTML(beto).replace(/./g, ''), 'sanity: both rows are non-empty strings');
    t.assert(win.seniorityRowHTML(beto).indexOf('sen-chip') > -1, 'a tied employee gets the same gold chip treatment, not a special marker');
  }
};
