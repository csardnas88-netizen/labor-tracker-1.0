/* Roster seniority: hire-date parsing, and the shared-rank rule.

   The shared-rank rule is the important one. 50 of the 64 people on this
   roster have the same official Paychex start date (1 Nov 2024, the payroll
   migration), and employee numbers were handed out alphabetically in that
   migration — so ranking them 1/2/3 would award a gold medal for having a
   surname that starts with A. Equal dates must therefore SHARE a rank. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Roster seniority: shared ranks for equal hire dates, flexible date parsing",
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

    /* ── shared ranks ── */
    const dates = {
      a: { hire: '2024-11-01' },   // three people share the oldest date
      b: { hire: '2024-11-01' },
      c: { hire: '2024-11-01' },
      d: { hire: '2025-06-15' },   // next distinct date
      e: { hire: '2026-04-20' },
      f: { hire: '2026-04-20' },   // ties again, further down
      // g has no hire date at all
    };
    win.localStorage.setItem('hk_emp_dates', JSON.stringify(dates));

    const people = [
      { id: 'e', name: 'Eva' },  { id: 'a', name: 'Ana' },
      { id: 'g', name: 'Gil' },  { id: 'c', name: 'Cruz' },
      { id: 'd', name: 'Dora' }, { id: 'f', name: 'Fabi' },
      { id: 'b', name: 'Beto' },
    ];
    const out = win.rankBySeniority(people);
    const byId = {};
    out.list.forEach(p => { byId[p.id] = p; });

    // The three oldest all share rank 1 — no invented winner.
    t.eq(byId.a.rank, 1, 'Ana (1 Nov 2024) is rank 1');
    t.eq(byId.b.rank, 1, 'Beto shares rank 1 (same date)');
    t.eq(byId.c.rank, 1, 'Cruz shares rank 1 (same date)');
    t.eq(byId.a.tiedWith, 2, 'Ana is tied with 2 others');

    // Ranks count DISTINCT dates, so the next date is 2 — not 4.
    t.eq(byId.d.rank, 2, 'next distinct date is rank 2, not 4');
    t.eq(byId.e.rank, 3, 'third distinct date is rank 3');
    t.eq(byId.f.rank, 3, 'and its tie shares rank 3');
    t.eq(byId.e.tiedWith, 1, 'Eva is tied with 1 other');

    // No hire date = unranked, never guessed at, and sorted last.
    t.eq(byId.g.rank, null, 'employee with no hire date stays unranked');
    t.eq(out.list[out.list.length - 1].id, 'g', 'unranked employee sorts last');

    // Most senior first.
    t.eq(out.list[0].hire, '2024-11-01', 'list starts with the oldest hire date');
    t.eq(out.list[3].id, 'd', 'the 3 tied are followed by the next date');

    // Bars scale off the longest tenure in the position.
    t.assert(out.maxTenureDays === byId.a.tenureDays, 'maxTenureDays is the most-senior tenure');
    t.assert(byId.a.tenureDays > byId.e.tenureDays, 'older hire yields more tenure days');

    /* An unranked employee must not render a medal-coloured bar. */
    const unrankedHtml = win.seniorityRowHTML(byId.g, out.maxTenureDays);
    t.assert(unrankedHtml.indexOf('sen-f') === -1, 'unranked row renders no tenure bar');
    t.assert(unrankedHtml.indexOf('No hire date') > -1, 'unranked row says why it has no rank');

    /* A tied row surfaces the tie so a medal is never read as "the winner". */
    const tiedHtml = win.seniorityRowHTML(byId.a, out.maxTenureDays);
    t.assert(tiedHtml.indexOf('same date') > -1, 'tied row shows how many share the date');
    t.assert(tiedHtml.indexOf('sen-fg') > -1, 'rank 1 uses the gold bar');
  }
};
