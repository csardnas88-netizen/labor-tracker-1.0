/* Carlos's ask, 2026-10-10, changes to the Labor day view:

   (1) The "Turndown — Part-time OK" rows (people who punched their
   break correctly, 15-20 min for Turndown/part-time) cluttered the
   Break Exceptions card more than the real exceptions did — removed.
   The card now only ever shows an actual problem; "All breaks OK"
   already covers the reassurance case.

   (2) The old "Approaching OT" flag was just "worked 9+ hours today",
   which doesn't actually mean anything about the real 40h/week
   threshold he cares about. laborProjectedWeekHours now estimates each
   employee's end-of-week total: hours actually worked this week so far
   (summed across every day reported, via the same cross-month day
   index Time Card Check already relies on) + their remaining SCHEDULED
   working days this week × their position's standard shift length.

   (3) Same-day follow-up, from a real screenshot: Petronila showed
   "40.68h so far + 0 more days scheduled" under "Projected to cross
   40h" — but zero remaining scheduled days means that number is FINAL,
   not a projection. Split into "Already over 40h" (remainingDays===0)
   vs "Projected to cross 40h" (remainingDays>0, a genuine forward
   estimate) so the distinction is visible.

   (4) Also from the same report: decimal hours ("40.97h") don't tell a
   manager anything useful at a glance — every hour figure in this card
   now renders as whole hours + minutes (_hToHM), with an explicit
   "Nm over 40h" for anyone flagged. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Labor day view: Break Exceptions drops the "punched correctly" rows, Overtime projects real end-of-week hours in h/m, and zero-days-left is "already over" not "projected"',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          '2026-10-06': { gra: [['Maria Lopez', '1'], ['Ana Ruiz', '1']] },
          '2026-10-07': { gra: [['Maria Lopez', 'OFF'], ['Ana Ruiz', 'OFF']] },
          '2026-10-08': { gra: [['Maria Lopez', '1'], ['Ana Ruiz', 'OFF']] },
          '2026-10-09': { gra: [['Maria Lopez', '1'], ['Ana Ruiz', 'OFF']] },
          // Petronila has no row anywhere this week — simulates no more
          // scheduled days left for her, same as the real report.
        },
        count: 4, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: [
            { id: '50001', name: 'Maria Lopez', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '50002', name: 'Ana Ruiz', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '70001', name: 'Petronila Quiacain', pos: 'Public Area Attendant', paid: 16, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-04': { emps: [
            { id: '50001', name: 'Maria Lopez', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '50002', name: 'Ana Ruiz', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '70001', name: 'Petronila Quiacain', pos: 'Public Area Attendant', paid: 16, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-05': { emps: [
            { id: '50001', name: 'Maria Lopez', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '50002', name: 'Ana Ruiz', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: '50003', name: 'Carlos Tester', pos: 'Room Attendant', paid: 8, ot1: 2, unpaid: 0.5 },
            { id: '60001', name: 'Td Ok Person', pos: 'Turndown Attendant', paid: 6, ot1: 0, unpaid: 0.25 },
            { id: '60002', name: 'No Break Person', pos: 'Housekeeping Supervisor', paid: 8, ot1: 0, unpaid: 0 },
            { id: '70001', name: 'Petronila Quiacain', pos: 'Public Area Attendant', paid: 8.5, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
    });
    const { win } = await loadApp({ seed });

    // ── Unit check: the projection math itself ──
    const projections = win.laborProjectedWeekHours('2026-10-05');
    const maria = projections.find((p) => p.id === '50001');
    const ana = projections.find((p) => p.id === '50002');
    const petronila = projections.find((p) => p.id === '70001');
    t.eq(maria.hoursSoFar, 24, "Maria's hours so far (Sat+Sun+Mon, 8h each)");
    t.eq(maria.remainingDays, 3, 'Maria has 3 real scheduled working days left (Tue/Thu/Fri — Wed is OFF, correctly excluded)');
    t.eq(maria.shiftHours, 8, "Room Attendant's standard shift length");
    t.eq(maria.projected, 48, '24 + 3×8 = 48, over the 40h threshold');
    t.eq(ana.hoursSoFar, 24, "Ana's hours so far, same as Maria's");
    t.eq(ana.remainingDays, 1, 'Ana only has 1 real scheduled day left (Tue — Wed/Thu/Fri are all OFF for her)');
    t.eq(ana.projected, 32, '24 + 1×8 = 32, under the 40h threshold');
    t.eq(petronila.hoursSoFar, 40.5, "Petronila's real hours so far (16+16+8.5)");
    t.eq(petronila.remainingDays, 0, 'Petronila has no scheduled days left at all this week');
    t.eq(petronila.projected, 40.5, 'with no remaining days, projected is just hoursSoFar — not an estimate, the real final number');

    // ── _hToHM formatting ──
    t.eq(win._hToHM(2), '2h 0m', 'a whole-hour value formats cleanly');
    t.eq(win._hToHM(40.97), '40h 58m', ".97h becomes 58 real minutes, not a vague decimal");
    t.eq(win._hToHM(0.5), '30m', 'under an hour omits the "0h" prefix');

    // ── Full render ──
    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    // (1) Break Exceptions
    t.assert(!/Turndown — Part-time OK/.test(html), 'the "punched correctly" sub-header is gone');
    t.assert(!/Td Ok Person/.test(html), "the Turndown employee who took her break correctly (15 min, OK) doesn't show at all");
    t.assert(/No Break Person/.test(html), 'a REAL exception (no break taken) still shows');
    t.assert(/No Break — 0 min/.test(html), 'with its real violation label');

    // (2) Today's actual OT, now in h/m
    t.assert(/Carlos Tester/.test(html), "today's actual OT (Carlos) still shows in the Overtime list");
    t.assert(/2h 0m OT/.test(html), 'formatted as 2h 0m, not 2.00h');

    // (3) Already-over tier (Petronila: no days left, so this is final, not a projection)
    t.assert(/Already over 40h this week/.test(html), 'the "already over" section header shows');
    const petroIdx = html.indexOf('Petronila Quiacain');
    t.assert(petroIdx !== -1, 'Petronila is flagged');
    const petroRow = html.slice(petroIdx, petroIdx + 400);
    t.assert(/40h 30m worked this week, no more scheduled days/.test(petroRow), "Petronila's row explains there are no days left to change the outcome");
    t.assert(/30m over 40h/.test(petroRow), 'and shows she is 30 real minutes over 40h, not folded into the uncertain "projected" bucket');

    // (4) Still-projected tier (Maria: real scheduled days left, a genuine estimate)
    t.assert(/Projected to cross 40h this week/.test(html), 'the projected-OT section header shows separately');
    const mariaIdx = html.indexOf('Maria Lopez');
    t.assert(mariaIdx !== -1, 'Maria (projected 48h) is flagged as approaching OT');
    const mariaRow = html.slice(mariaIdx, mariaIdx + 500);
    t.assert(/24h 0m so far \+ 3 more days scheduled \(~8h each\)/.test(mariaRow), "Maria's row shows the real math behind the estimate, in h/m");
    t.assert(/~48h 0m projected \(480m over\)/.test(mariaRow), 'and her projected total with the exact minutes-over figure');
    t.assert(!/Ana Ruiz/.test(html), 'Ana (projected only 32h) is NOT flagged — she has real scheduled days left, just not enough to cross 40');

    // Card title reflects both tiers being present (innerHTML serializes a
    // literal "&" back out as "&amp;" — this is jsdom/DOM round-tripping,
    // not something the app does; the real browser displays a plain "&").
    t.assert(/Overtime &amp; Already Over 40h &amp; Approaching OT/.test(html), 'the card title names every tier actually present');
  },
};
