/* Carlos's ask, 2026-10-15, as a senior-designer pass over the whole
   Labor day view: Overtime/Under Hours rendered noticeably BIGGER text
   than the rest of Labor (Weekly Pace, Labor Effectiveness, Occupancy
   all cluster 9-11.5px/700 for row-level content) — person name was
   12px/600, the value figure 13px/700, the position group header
   10px/800. All matched down to the scale used everywhere else:
   name/value to 11px/700, group header to 9px/700.

   Also found in the same pass, from a real screenshot ("Martinez,
   Diana ... 488m over"): the "already over 40h" tier's over-figure was
   RAW MINUTES while the figure right next to it ("~48h 8m projected")
   went through _hToHM — the exact same two-standards-in-one-string bug
   already fixed for Under Hours' "already under" tier a few versions
   back. Both alreadyOver and stillApproaching's over-figures now go
   through _hToHM consistently. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Overtime/Under Hours row typography matches the rest of Labor (11px/700 name+value, 9px/700 group header), and the "already over 40h" figure is in h/m, not raw minutes',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          '2026-10-06': { gra: [['Diana Martinez', 'OFF']] },
          '2026-10-07': { gra: [['Diana Martinez', 'OFF']] },
          '2026-10-08': { gra: [['Diana Martinez', 'OFF']] },
          '2026-10-09': { gra: [['Diana Martinez', 'OFF']] },
        },
        count: 4, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          // 48h 8m worked, 0 remaining days — "already over 40h", final.
          // Overage: (48+8/60-40)*60 = 488 minutes = 8h 8m, previously
          // rendered as the raw "488m over 40h".
          '2026-10-03': { emps: [{ id: 'd1', name: 'Diana Martinez', pos: 'Room Attendant', paid: 48.1333, ot1: 0, unpaid: 0.5 }] },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const ds = '2026-10-05';
    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    const idx = html.indexOf('Diana Martinez');
    t.assert(idx !== -1, 'Diana is flagged as already over 40h');
    const row = html.slice(idx, idx + 800);
    t.assert(/8h 8m over 40h/.test(row), 'the overage figure is in h/m ("8h 8m over 40h"), not raw minutes ("488m over 40h")');
    t.assert(!/488m/.test(row), 'the old raw-minutes string never appears');

    // ── Typography: name, value figure, and group header all match the
    // scale used elsewhere in Labor (11px/700, 11px/700, 9px/700). ──
    t.assert(/font-size:11px;font-weight:700;">Diana Martinez/.test(html), "the person name renders at 11px/700, matching Weekly Pace's position label (11.5px/700) and Labor Effectiveness's position cell (11px/700) — not the old 12px/600");
    t.assert(/font-size:11px;font-weight:700;color:var\(--red\);white-space:nowrap;">8h 8m over 40h/.test(html), "the value figure renders at 11px/700 — not the old 13px/700");

    const groupHeaderIdx = html.indexOf('>Room Attendant<');
    t.assert(groupHeaderIdx !== -1, "Room Attendant's group header renders");
    t.assert(/font-size:9px;font-weight:700;color:var\(--text3\);/.test(html.slice(Math.max(0, groupHeaderIdx - 200), groupHeaderIdx)), "the group header renders at 9px/700, matching Labor Effectiveness's column headers and Occupancy's tile labels — not the old 10px/800");
  },
};
