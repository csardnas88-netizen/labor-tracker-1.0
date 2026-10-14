/* Carlos's real follow-up report, 2026-10-14, right after the first batch
   of 5 Room Attendant name aliases shipped: 4 more real mismatches across
   OTHER positions (Supervisors, Laundry, Houseman), same root cause —
   payroll name and Schedule Draft nickname share no tokens, so
   laborProjectedWeekHours' remainingDays search comes up empty.

   Two of these four are deliberately keyed the OPPOSITE way from every
   other SCHED_NAME_ALIASES entry: "sandra s" (Laundry) and bare "elmer"
   (Houseman) are themselves load-bearing identity strings elsewhere in
   this file —
     - _schedCrossCrewExcluded has a literal `dlNormAlias(name)==='sandra
       s'` check carving her OUT of the exclusion list (so she
       participates in the generic cross-crew sync for her real
       Room Attendant/Lobby/Laundry reconciliation).
     - Request Off's existing name-matching already works today for
       Schedule Draft "Elmer" against roster "Elmer Galindo", with NO
       alias involved, via plain token prefix-matching.
   Aliasing the KEYS "sandra s" or "elmer" to a different string would
   have silently redirected what those already correctly resolve to
   everywhere else in the app. This test guards both regressions
   explicitly, not just the new matches. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

module.exports = {
  name: 'SCHED_NAME_ALIASES batch 2 (Supervisors/Laundry/Houseman) resolves 4 more real name mismatches without disturbing the pre-existing "sandra s" / bare "elmer" identities those two entries were keyed around',
  async run(t) {
    const people = [
      { id: '91001', crew: 'sup', pos: 'Housekeeping Supervisor', payrollName: 'Aguilar Ambrocio', scheduleName: 'Susan Aguilar' },
      { id: '91002', crew: 'sup', pos: 'Housekeeping Supervisor', payrollName: 'Rolando', scheduleName: 'Julian Puac' },
      { id: '91003', crew: 'laundry', pos: 'Laundry Attendant', payrollName: 'Silva Henriquez', scheduleName: 'Sandra S' },
      { id: '91004', crew: 'hp', pos: 'House Attendant', payrollName: 'Galindo Melendez', scheduleName: 'Elmer' },
    ];

    const days = {};
    DATES.forEach((ds, i) => {
      days[ds] = {};
      people.forEach((p) => {
        if (!days[ds][p.crew]) days[ds][p.crew] = [];
        // Each works ONLY on 2026-10-07 (index 1) — OFF the other 3 —
        // so a correct match yields remainingDays===1 exactly.
        days[ds][p.crew].push([p.scheduleName, i === 1 ? '1' : 'OFF']);
      });
    });

    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({ days, count: 4, savedAt: new Date().toISOString() }),
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: people.map((p) => ({ id: p.id, name: p.payrollName, pos: p.pos, paid: 8, ot1: 0, unpaid: 0.5 })) },
          '2026-10-04': { emps: people.map((p) => ({ id: p.id, name: p.payrollName, pos: p.pos, paid: 8, ot1: 0, unpaid: 0.5 })) },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const projections = win.laborProjectedWeekHours('2026-10-05');
    people.forEach((p) => {
      const proj = projections.find((x) => x.id === p.id);
      t.assert(!!proj, p.payrollName + ' appears in the projection list at all');
      t.eq(proj.hoursSoFar, 16, p.payrollName + ': 2 days × 8h paid so far');
      t.eq(proj.remainingDays, 1, p.payrollName + ' (Schedule Draft name "' + p.scheduleName + '") correctly finds her/his 1 real remaining working day, not 0');
      t.eq(proj.projected, 24, p.payrollName + ': 16 so far + 1 × 8h = 24, not stuck at a final 16');
    });

    // ── Regression guard 1: "Sandra S" must still resolve to the exact
    // "sandra s" identity _schedCrossCrewExcluded special-cases — the new
    // "silva henriquez" alias was deliberately keyed on the PAYROLL side
    // specifically so it never touches this. ──
    t.eq(win.dlNormAlias('Sandra S'), 'sandra s', '"Sandra S" (Schedule Draft spelling) still normalizes to itself, unaffected by the new Laundry alias');
    t.assert(win._schedCrossCrewExcluded('Sandra S') === false, '_schedCrossCrewExcluded still deliberately returns false for Sandra S (she still participates in the generic cross-crew sync)');

    // ── Regression guard 2: bare "Elmer" on the Schedule Draft must still
    // match the fuller roster name "Elmer Galindo" directly, with no
    // alias needed — the pre-existing Request Off behavior. ──
    t.assert(win.schedNameLooselyMatches('Elmer', 'Elmer Galindo'), 'Schedule Draft "Elmer" still matches roster "Elmer Galindo" directly, unaffected by the new Houseman alias');
    t.eq(win.dlNormAlias('Elmer'), 'elmer', 'bare "Elmer" still normalizes to itself');

    // ── Sanity: the other 3 names Carlos listed that same message
    // (Melvin Luna/Melvin, Luis Ordonez/Luis, Victoriano Chuquiej/
    // Victoriano on Public Area Attendant and Laundry) already matched
    // fine via plain token prefix-matching — no alias was added for any
    // of them, and none should be needed. ──
    t.assert(win.schedNameLooselyMatches('Melvin', 'Luna Melvin'), 'Public Area Attendant "Melvin" already matches payroll "Luna Melvin" with no alias');
    t.assert(win.schedNameLooselyMatches('Luis', 'Ordonez Luis'), 'Public Area Attendant "Luis" already matches payroll "Ordonez Luis" with no alias');
    t.assert(win.schedNameLooselyMatches('Victoriano', 'Victoriano Chuquiej'), '"Victoriano" already matches payroll "Victoriano Chuquiej" with no alias');
  },
};
