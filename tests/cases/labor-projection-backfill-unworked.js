/* Carlos's real report, 2026-10-15: Rubia Toro Munoz showed up in
   NEITHER the Overtime nor the Under Hours card. Root cause —
   laborProjectedWeekHours' byEmp map was built ONLY from actual
   reported hours (wtc_buildDayIndex); anyone who simply hadn't worked
   a single day yet this week (every day so far off, or her reports are
   genuinely still blank) never entered the projection at all, no matter
   what her Schedule Draft says about the days still coming — invisible
   everywhere, not just missing from one card.

   Fixed by backfilling anyone scheduled to work today-or-later who
   isn't already known, resolved against ROSTER_BY_ID (the same
   identity source primaryPos already uses), skipping any row that
   doesn't resolve to exactly one roster person. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'laborProjectedWeekHours backfills anyone scheduled for a remaining day who has no actual hours anywhere this week yet, so Under/Over Hours can still flag her',
  async run(t) {
    // 2026-10-15 is a Thursday; the hotel week is Sat 10-10..Fri 10-16.
    const ds = '2026-10-15';
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          // Noemi hasn't worked a single day this week (OFF every day so
          // far), but IS scheduled today and tomorrow — the exact shape
          // of Rubia's real case.
          '2026-10-10': { gra: [['Noemi Castillo', 'OFF']] },
          '2026-10-11': { gra: [['Noemi Castillo', 'OFF']] },
          '2026-10-12': { gra: [['Noemi Castillo', 'OFF']] },
          '2026-10-13': { gra: [['Noemi Castillo', 'OFF']] },
          '2026-10-14': { gra: [['Noemi Castillo', 'OFF']] },
          '2026-10-15': { gra: [['Noemi Castillo', '1']] },
          '2026-10-16': { gra: [['Noemi Castillo', '1']] },
        },
        count: 7, savedAt: new Date().toISOString(),
      }),
      // No 'hk_month_2026-10' at all for Noemi — her actual reports are
      // genuinely empty this week; a different real Room Attendant (Ana
      // Soto) HAS actual hours already, to prove the backfill never
      // overwrites someone already known from real data.
      'hk_month_2026-10': {
        days: {
          '2026-10-10': { emps: [{ id: '90002', name: 'Ana Soto', pos: 'Room Attendant', paid: 9, ot1: 0, unpaid: 0.5 }] },
        },
      },
    });
    const { win } = await loadApp({ seed });

    // Synthetic roster entry — mirrors a real ROSTER_BY_ID record's
    // shape, added directly so this test doesn't depend on any specific
    // real employee ever staying in the roster.
    win.ROSTER_BY_ID['90001'] = { name: 'Noemi Castillo', pos: 'Room Attendant', code: '9999' };
    win.ROSTER_BY_ID['90002'] = { name: 'Ana Soto', pos: 'Room Attendant', code: '9998' };

    const projections = win.laborProjectedWeekHours(ds);
    const noemi = projections.find((p) => p.id === '90001');
    t.assert(!!noemi, "Noemi appears in the projection list even though she has zero actual hours anywhere this week");
    t.eq(noemi.hoursSoFar, 0, 'no actual hours recorded for her yet');
    t.eq(noemi.remainingDays, 2, 'today (10-15) and tomorrow (10-16) both count as real remaining scheduled days');
    t.eq(noemi.projected, 16, '0 + 2×8 = 16');

    const ana = projections.find((p) => p.id === '90002');
    t.eq(ana.hoursSoFar, 9, "the backfill never touches someone already known from real actual data (Ana)");

    // ── Full render: Noemi shows up in Under Hours (projected 16h, well
    // short of 40h), grouped under Room Attendant. ──
    win.dashSelectedDate = new Date(2026, 9, 15);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    win.toggleLaborPosGroup('under:Room Attendant');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const underHtml = html.slice(html.indexOf('Under Hours'));

    t.assert(/Noemi Castillo/.test(underHtml), 'Noemi now appears in the Under Hours card, where she was previously invisible');
    const idx = underHtml.indexOf('Noemi Castillo');
    t.assert(/0m so far \+ 2 more days scheduled \(~8h each\)/.test(underHtml.slice(idx, idx + 300)), "her row shows the real math — 2 remaining days, nothing worked yet");
  },
};
