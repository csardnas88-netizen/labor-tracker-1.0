/* The DNDs section — Carlos's ask: "cuáles son los días con mayor número
   de DNDs históricamente", answered off the room lists already logged
   daily on the Occupancy card since v6.90.0.

   The subtle part this pins is what counts as a LOGGED day. dndRooms[ds]
   is stored as '' (not deleted) when the list is cleared, precisely so a
   clear syncs to other devices — see saveDNDRoomsForDate. That means the
   store is full of blanks that mean "nobody logged it", NOT "zero DNDs
   that day". Averaging those in as real zeros would drag every weekday
   average toward zero with days that were never observed, and would make
   the headline "heaviest day" answer depend on how many blanks each
   weekday happens to carry. Blanks must stay out of the denominator. */
const { loadApp, fakeSession } = require('../_harness');

/* Two Mondays that ran heavy, two Wednesdays that ran light, plus a
   Friday. Every date below is a real weekday-correct 2026 date:
   Aug 3 and Aug 10 are Mondays, Aug 5 and Aug 12 Wednesdays, Aug 7 a
   Friday. Monday must come out the clear heaviest day. */
function seedDndMonth() {
  return {
    'hk_rooms_migrated_v2': '1',
    'hk_month_2026-08': {
      days: {},
      rooms: {
        '2026-08-02': 200, '2026-08-03': 200, '2026-08-04': 200,
        '2026-08-05': 200, '2026-08-06': 200, '2026-08-09': 200,
        '2026-08-10': 200, '2026-08-11': 200, '2026-08-12': 200
      },
      dndRooms: {
        '2026-08-03': '1001,1002,1003,1004',   /* Monday  — 4 */
        '2026-08-05': '2001',                  /* Wed     — 1 */
        '2026-08-07': '3001,3002',             /* Friday  — 2 */
        '2026-08-10': '1001,1002,1005,1006,1007', /* Monday — 5 */
        '2026-08-12': '2001,2002',             /* Wed     — 2 */
        '2026-08-13': '',                      /* cleared — NOT a logged day */
        '2026-08-14': ''                       /* cleared — NOT a logged day */
      }
    }
  };
}

module.exports = {
  name: "DNDs section ranks weekdays by average and counts only genuinely logged days",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedDndMonth());
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    // ── Collection: five logged days, the two cleared ones excluded. ──
    const days = win.getAllDNDDays();
    t.eq(days.length, 5, 'only the five days with a non-empty room list count as logged');
    t.assert(!days.some((d) => d.ds === '2026-08-13' || d.ds === '2026-08-14'),
      "a cleared ('') room list is not a zero-DND day — it means nobody logged it, and must stay out of every average");
    t.assert(days[0].ds < days[days.length - 1].ds, 'days come back in date order');

    // ── Counts derive from the room list itself, never a second stored
    // number that could drift from it. ──
    const mon10 = days.find((d) => d.ds === '2026-08-10');
    t.eq(mon10.count, 5, "Aug 10's count is derived from its five listed rooms");
    t.eq(mon10.rooms.length, 5, 'and the rooms themselves come along for the detail table');

    // ── The headline answer: which weekday runs heaviest. ──
    const byDow = win.getDNDByWeekday(days);
    const monday = byDow[1], wednesday = byDow[3], friday = byDow[5], tuesday = byDow[2];
    t.eq(monday.n, 2, 'two Mondays were logged (Aug 3 and Aug 10)');
    t.eq(monday.total, 9, 'carrying 9 DNDs between them');
    t.eq(monday.avg, 4.5, 'so Monday averages 4.5');
    t.eq(wednesday.avg, 1.5, 'Wednesday averages 1.5 across its two logged days');
    t.eq(friday.avg, 2, 'Friday averages its single logged day');
    t.eq(tuesday.n, 0, 'no Tuesday was ever logged');
    t.eq(tuesday.avg, 0, 'and an unlogged weekday averages 0 rather than dividing by zero');

    const ranked = byDow.filter((b) => b.n > 0).sort((a, b) => b.avg - a.avg);
    t.eq(ranked[0].name, 'Monday', 'Monday is correctly identified as the heaviest day for DNDs');

    // ── % of stayovers is a real ratio against that day's own occupancy,
    // not a constant — this is the figure that justifies Room Attendant's
    // fixed 85%/15% assumption in the labor meeting. ──
    t.assert(mon10.stayovers > 0, 'stayovers are resolved for a day with occupancy data');
    t.assert(Math.abs(mon10.pct - (5 / mon10.stayovers) * 100) < 0.001,
      "the day's DND percentage is its own count over its own stayovers");

    // ── Weekly rollup runs on the app's hotel week, not an ISO week. ──
    const byWeek = win.getDNDByWeek(days);
    t.assert(byWeek.length >= 1, 'days roll up into hotel weeks');
    t.eq(byWeek.reduce((s, w) => s + w.total, 0), 14, 'every logged DND lands in exactly one week — none dropped, none double-counted');

    // ── The rendered page: headline, and the detail actually present. ──
    win.renderDnds();
    const html = win.document.getElementById('dndsContent').innerHTML;
    t.assert(/Heaviest day/i.test(html), 'the page leads with the heaviest-day answer');
    t.assert(/Monday/.test(html), 'and names Monday');
    t.assert(/5 logged days|Days logged/i.test(html), 'it says how many days the figures rest on, so a thin sample is visible');
    t.assert(/1001/.test(html), "the detail table still lists each day's actual room numbers — the audit record Carlos keeps them for");

    // ── Empty state: a brand-new device with nothing logged must not
    // render a chart of zeros that reads like real data. ──
    const { win: win2 } = await loadApp({ seed: Object.assign(fakeSession(), { 'hk_rooms_migrated_v2': '1' }) });
    await new Promise((r) => setTimeout(r, 60));
    t.eq(win2.getAllDNDDays().length, 0, 'nothing logged means no days');
    win2.renderDnds();
    const html2 = win2.document.getElementById('dndsContent').innerHTML;
    t.assert(/No DNDs logged yet/.test(html2), 'an empty state explains where the data comes from instead of charting zeros');
  }
};
