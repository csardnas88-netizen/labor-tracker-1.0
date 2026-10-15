/* Carlos's ask, 2026-10-15: the mirror of the Overtime "Leave by" badge
   — for anyone in Under Hours who still has a real scheduled day left,
   show the clock-out time on her LAST scheduled day that lands her
   exactly at 40h, same concept as Overtime already has for the opposite
   direction. Since nobody in Under Hours crosses 40h even working every
   remaining day at its normal length, the whole shortfall has to land
   on that one last day — _laborStayUntilBadge counts FORWARD from the
   normal scheduled end time (the mirror of Leave By counting backward
   for an overage). Scoped to underApproaching only — underAlready (no
   remaining days left) has no day left to stay late on. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

function buildSeed(scheduleFor) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = { gra: Object.keys(scheduleFor).map((name) => [name, scheduleFor[name][ds] || 'OFF']) };
  });
  return Object.assign(fakeSession(), {
    hk_dl_schedule: JSON.stringify({ days, count: 4, savedAt: new Date().toISOString() }),
  });
}

module.exports = {
  name: 'Under Hours rows (never Overtime) show a "Stay until HH:MM" badge on the last scheduled day, computed forward from her normal clock-out so the full shortfall lands on that one day',
  async run(t) {
    // 2026-10-05 is a Monday; the hotel week is Sat 10-03..Fri 10-09, so
    // the remaining days this function can see are 10-06..10-09.
    const ds = '2026-10-05';

    // Her LAST remaining day is TODAY (10-05 itself) — "Stay until X today".
    const todaySchedule = { 'Today Girl': { '2026-10-05': '1' } };
    // Her LAST remaining day is Wednesday (10-07), a real future date —
    // "Stay until X on Wed".
    const futureSchedule = { 'Future Girl': { '2026-10-07': '1' } };
    // Already under 40h with NO remaining days at all — must never get a
    // stay-until badge, there's no day left to stay late on.
    const noneSchedule = { 'None Girl': {} };
    // Barely worked (1h so far) with 2 remaining days (Thu/Fri) — the
    // shortfall (39h) is too large to make up on a single extended
    // shift; staying "until" would wrap past midnight into nonsense.
    const hugeSchedule = { 'Huge Girl': { '2026-10-08': '1', '2026-10-09': '1' } };

    const seed = buildSeed(Object.assign({}, todaySchedule, futureSchedule, noneSchedule, hugeSchedule));
    Object.assign(seed, {
      'hk_month_2026-10': {
        days: {
          // Today Girl: 28h so far (10-03/10-04), + today's 8h shift = 36h,
          // 4h (240min) short of 40 → stay 240min past her normal 4:45 PM
          // end, i.e. 8:45 PM.
          '2026-10-03': { emps: [
            { id: 't1', name: 'Today Girl', pos: 'Room Attendant', paid: 14, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'Future Girl', pos: 'Room Attendant', paid: 15, ot1: 0, unpaid: 0.5 },
            { id: 't3', name: 'None Girl', pos: 'Room Attendant', paid: 16, ot1: 0, unpaid: 0.5 },
            { id: 't4', name: 'Huge Girl', pos: 'Room Attendant', paid: 1, ot1: 0, unpaid: 0 },
          ]},
          // Future Girl: 30h so far, + her Wed 8h shift = 38h, 2h (120min)
          // short → stay 120min past 4:45 PM, i.e. 6:45 PM, on Wednesday.
          '2026-10-04': { emps: [
            { id: 't1', name: 'Today Girl', pos: 'Room Attendant', paid: 14, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'Future Girl', pos: 'Room Attendant', paid: 15, ot1: 0, unpaid: 0.5 },
            { id: 't3', name: 'None Girl', pos: 'Room Attendant', paid: 16, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
    });

    const { win } = await loadApp({ seed });

    // ── Unit check: _laborStayUntilBadge directly ──
    const projections = win.laborProjectedWeekHours(ds);
    const todayEmp = projections.find((p) => p.id === 't1');
    const futureEmp = projections.find((p) => p.id === 't2');
    const noneEmp = projections.find((p) => p.id === 't3');

    t.eq(todayEmp.projected, 36, '28 so far + 1 remaining day (today) × 8h = 36');
    const todayBadge = win._laborStayUntilBadge(ds, todayEmp);
    t.eq(todayBadge.text, 'Stay until 8:45 PM today', "4h (240min) short of 40, added to her normal 4:45 PM end time, today being her only remaining day");
    // Carlos's follow-up, 2026-10-15, right after the Overtime redesign
    // shipped: "today" gets the same solid-pill treatment here too.
    t.eq(todayBadge.bg, 'var(--indigo)', "today's badge is a SOLID indigo fill");
    t.eq(todayBadge.color, '#fff', 'white text on the solid fill');
    t.eq(todayBadge.rowBg, 'var(--indigo-bg)', "today's whole row also gets a light indigo tint");

    t.eq(futureEmp.projected, 38, '30 so far + 1 remaining day (Wed) × 8h = 38');
    const futureBadge = win._laborStayUntilBadge(ds, futureEmp);
    t.eq(futureBadge.text, 'Stay until 6:45 PM on Wed', "2h (120min) short of 40, added to her normal 4:45 PM end time, on her real last day (Wed, not today)");
    t.eq(futureBadge.bg, 'var(--indigo-bg)', "a future day stays the quieter light pill");
    t.eq(futureBadge.color, 'var(--indigo)', 'dark indigo text on the light fill');
    t.assert(!futureBadge.rowBg, 'a future day gets NO row tint — only today earns the stronger treatment');

    t.eq(noneEmp.remainingDays, 0, 'None Girl has no remaining scheduled days at all');
    t.eq(win._laborStayUntilBadge(ds, noneEmp), null, 'no stay-until badge when there is no remaining day to stay late on');
    t.eq(win._laborStayUntilBadge(ds, null), null, "doesn't throw when detail is null");

    // A shortfall too large to make up on a single extended shift (1h so
    // far + 2 remaining days = 17h projected, 23h short) would wrap the
    // "stay until" time past midnight into nonsense — must stay unbadged.
    const hugeEmp = projections.find((p) => p.id === 't4');
    t.eq(hugeEmp.projected, 17, '1h so far + 2 remaining days × 8h = 17');
    t.eq(win._laborStayUntilBadge(ds, hugeEmp), null, 'no stay-until badge when the shortfall would push past midnight into the next calendar day');

    // ── Full render: badge shows on Under Hours rows only, never Overtime ──
    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    win.toggleLaborPosGroup('under:Room Attendant');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const underIdx = html.indexOf('Under Hours');
    t.assert(underIdx !== -1, 'Under Hours card exists (all 3 are under 40h)');
    const otHtml = html.slice(0, underIdx);
    const underHtml = html.slice(underIdx);

    t.assert(!/Stay until/.test(otHtml), 'the stay-until badge never leaks into the Overtime card (there is none here anyway, but guards the scoping)');

    // Card itself: no blue wash — the badge's own light-pill background
    // used to be the SAME color as the card background, so it read as
    // plain text with no pill at all. Card is now plain/neutral.
    const cardIdx = html.lastIndexOf('class="card"', underIdx);
    const cardOpenTag = html.slice(cardIdx, html.indexOf('>', cardIdx) + 1);
    t.assert(!/var\(--indigo-bg\)/.test(cardOpenTag), 'the Under Hours card no longer washes blue (var(--indigo-bg)) across the whole background');
    t.assert(!/border-color:var\(--indigo\)/.test(cardOpenTag), 'nor does it keep the solid indigo border');

    const tIdx = underHtml.indexOf('Today Girl');
    t.assert(tIdx !== -1, 'Today Girl appears in Under Hours');
    t.assert(/Stay until 8:45 PM today/.test(underHtml.slice(tIdx, tIdx + 300)), "her row shows the today stay-until badge");

    const fIdx = underHtml.indexOf('Future Girl');
    t.assert(fIdx !== -1, 'Future Girl appears in Under Hours');
    t.assert(/Stay until 6:45 PM on Wed/.test(underHtml.slice(fIdx, fIdx + 300)), "her row shows the future-day stay-until badge");

    // ── Carlos's follow-up ask, same day: the gold (still-scheduled) day
    // cell in the expanded day-strip should show "Stay until X" too, the
    // same way Overtime's strip already shows "Out by X" on its crossing
    // day — not just the row-level badge above the strip. Isolated to
    // the strip markup itself (not the whole card), since the row's own
    // badge right above it already legitimately says the same thing —
    // a test scanning the whole card could pass even without the gold
    // cell ever getting it. ──
    win.toggleLaborOtDetail('t2');
    const html2 = win.document.getElementById('dashDayAnalysis').innerHTML;
    const stripIdx = html2.indexOf('Hours by day this week');
    t.assert(stripIdx !== -1, "Future Girl's day-strip expands");
    const strip = html2.slice(stripIdx, stripIdx + 2500);
    t.assert(/Stay until 6:45 PM/.test(strip), "her Wednesday gold cell itself shows the stay-until time, same treatment as Overtime's 'Out by'");

    const nIdx = underHtml.indexOf('None Girl');
    t.assert(nIdx !== -1, 'None Girl appears in Under Hours (already under, no days left)');
    t.assert(!/Stay until/.test(underHtml.slice(nIdx, nIdx + 300)), 'her row shows NO stay-until badge — she has no remaining day to stay late on');

    const hIdx = underHtml.indexOf('Huge Girl');
    t.assert(hIdx !== -1, 'Huge Girl appears in Under Hours (17h projected, well short of 40h)');
    t.assert(!/Stay until/.test(underHtml.slice(hIdx, hIdx + 300)), 'her row shows NO stay-until badge — her shortfall is too large for a single-day extension');
  },
};
