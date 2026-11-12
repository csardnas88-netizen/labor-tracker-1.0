/* Carlos's real report, 2026-11-11, after a labor-meeting screenshot: on a
   wide monitor the Labor page left a visible band of unused space on both
   sides of every table, making an already-long page feel like even more
   scrolling than it needed to be. Break Exceptions and Position Mismatches
   are both compact, day-scoped cards that used to always stack full-width
   one above the other — this pairs them side by side (same .ot-under-grid
   class Overtime/Under Hours already uses) whenever BOTH have something to
   show, same optional-pairing pattern as that card. A day with no mismatches
   must still show Break Exceptions at full width, not stranded in a
   half-width column alone. */
const { loadApp, fakeSession } = require('../_harness');

function seedDay() {
  return {
    'hk_month_2026-08': {
      days: {
        // Olga: a real No Break exception, posted under her own (correct)
        // position — appears in Break Exceptions, never in Mismatches.
        '2026-08-05': {
          emps: [
            { id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', unpaid: 0, paid: 40, ot1: 0 }
          ]
        }
      },
      rooms: { '2026-08-04': 150 }
    }
  };
}

module.exports = {
  name: "Labor dash: Break Exceptions pairs with Position Mismatches in a 2-col grid when both exist, stays full-width alone otherwise",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedDay());
    const { win } = await loadApp({ seed });
    const week = { start: new Date(2026, 7, 2), end: new Date(2026, 7, 8) };
    win.dashSelectedDate = new Date(2026, 7, 5);

    // ── Both cards present: Heidy's live DATA.emps row is posted under a
    // DIFFERENT position (House Attendant) than her real roster position
    // (Room Attendant) — a genuine mismatch, independent of the day's own
    // snapshot (Position Mismatches reads live DATA.emps, not snap.emps). ──
    win.DATA.emps = [
      { id: '26100006', name: 'Heidy Ajsoc', pos: 'House Attendant', paid: 40, ot1: 0, unpaid: 0.5 }
    ];
    win.renderDashDayAnalysis(win.loadMonthData('2026-08').days, 150, new Date(), week);
    let html = win.document.getElementById('dashDayAnalysis').innerHTML;

    t.assert(html.indexOf('Olga Ajpacaja') !== -1, 'Olga\'s No Break exception appears');
    t.assert(html.indexOf('Position Mismatches') !== -1, 'the mismatch card appears');
    t.assert(html.indexOf('Heidy Ajsoc') !== -1, 'Heidy\'s mismatch row appears');
    t.assert(html.indexOf('<div class="ot-under-grid"><div class="card"') !== -1,
      'Break Exceptions and Position Mismatches are wrapped in the same side-by-side grid Overtime/Under Hours uses');

    // ── Only Break Exceptions: no mismatch this time (Heidy posted under
    // her real position) — the grid wrapper must not appear at all, and
    // Break Exceptions must render at full width, not half-stranded. ──
    win.DATA.emps = [
      { id: '26100006', name: 'Heidy Ajsoc', pos: 'Room Attendant', paid: 40, ot1: 0, unpaid: 0.5 }
    ];
    win.renderDashDayAnalysis(win.loadMonthData('2026-08').days, 150, new Date(), week);
    html = win.document.getElementById('dashDayAnalysis').innerHTML;

    t.assert(html.indexOf('Olga Ajpacaja') !== -1, 'Olga\'s exception still appears');
    t.assert(html.indexOf('Position Mismatches') === -1, 'no mismatch card when nothing actually mismatches');
    t.assert(html.indexOf('ot-under-grid') === -1, 'no grid wrapper when there is only one card to show');
  }
};
