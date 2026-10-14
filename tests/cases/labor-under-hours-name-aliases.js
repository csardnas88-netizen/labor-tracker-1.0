/* Carlos's real report, 2026-10-14, right after Under Hours shipped: 5 Room
   Attendants were all stuck in the "already under 40h, no more scheduled
   days" tier even though they had real days left on the Schedule Draft —
   the same root cause as the earlier Abby Puac/Tardiness bug (v with
   "Fixed the real root cause behind Abby's Tardiness..."): the name on her
   payroll upload ("Puac, Abby") and the nickname Carlos actually types
   into the Schedule Draft ("Abigail Rosa") share no tokens at all, so
   schedNameLooselyMatches could never connect them and
   laborProjectedWeekHours' remainingDays search came up empty — not
   because she's truly out of scheduled days, but because the search never
   found her real rows.

   Last time this was "fixed" by correcting Abby's saved data directly,
   which didn't survive the next week he typed her nickname again.
   SCHED_NAME_ALIASES (index.html, right above dlNormAlias) is now the
   permanent fix for all 5 people he reported in the same message. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

module.exports = {
  name: 'SCHED_NAME_ALIASES bridges 5 real Room Attendant nickname/payroll-name mismatches, so laborProjectedWeekHours finds their real remaining Schedule Draft days instead of concluding they have none',
  async run(t) {
    const people = [
      { id: '90001', payrollName: 'Puac, Abby', scheduleName: 'Abigail Rosa' },
      { id: '90002', payrollName: 'Cuevas Ibarra', scheduleName: 'Gabriela Cuevas' },
      { id: '90003', payrollName: 'Tzunun De Leon', scheduleName: 'Sandra' },
      { id: '90004', payrollName: 'Noriega, Hermelinda', scheduleName: 'Ermelinda Noriega' },
      { id: '90005', payrollName: 'Deleon Lopez, Santa', scheduleName: 'Elena De Leon' },
    ];

    const days = {};
    DATES.forEach((ds, i) => {
      // Each person works ONLY on 2026-10-07 (index 1) — OFF the other
      // 3 remaining days — so a correct match yields remainingDays===1,
      // not just "any nonzero number" from a lucky over-match.
      days[ds] = { gra: people.map((p) => [p.scheduleName, i === 1 ? '1' : 'OFF']) };
    });

    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({ days, count: 4, savedAt: new Date().toISOString() }),
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: people.map((p) => ({ id: p.id, name: p.payrollName, pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 })) },
          '2026-10-04': { emps: people.map((p) => ({ id: p.id, name: p.payrollName, pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 })) },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const projections = win.laborProjectedWeekHours('2026-10-05');
    people.forEach((p) => {
      const proj = projections.find((x) => x.id === p.id);
      t.assert(!!proj, p.payrollName + ' appears in the projection list at all');
      t.eq(proj.hoursSoFar, 16, p.payrollName + ": 2 days × 8h paid so far");
      t.eq(proj.remainingDays, 1, p.payrollName + ' (Schedule Draft name "' + p.scheduleName + '") correctly finds her 1 real remaining working day, not 0');
      t.eq(proj.projected, 24, p.payrollName + ': 16 so far + 1 × 8h = 24, not stuck at a final 16');
    });

    // ── The alias is scoped tight: a bare "Sandra" must resolve to Sandra
    // Tzunun De Leon ONLY. It must NOT also bridge a different Sandra
    // ("Sandra S", a distinct dlNorm string, already aliased to "sandra s"
    // for an unrelated punctuation-drift fix) to her payroll name. ──
    t.assert(!win.schedNameLooselyMatches('Sandra S', 'Tzunun De Leon'), '"Sandra S" (a different, distinct person) does not get swept into the bare "sandra" alias');
    t.assert(win.schedNameLooselyMatches('Sandra', 'Tzunun De Leon'), 'sanity: bare "Sandra" does resolve to Tzunun De Leon directly, confirming the alias is actually wired in');
  },
};
