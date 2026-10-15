/* Carlos's real complaint, 2026-10-15, looking at a real Overtime list:
   "todos me parecen iguales" — someone whose last day is TODAY (the most
   urgent case) used the exact same light red pill as someone whose last
   day is merely tomorrow, so nothing stood out while scanning. He also
   didn't like the whole card washing orange (var(--yellow), which despite
   the name is an orange hex) the moment nobody had confirmed OT yet.

   Shown 2 options for the card title color (navy vs a muted maroon); he
   picked maroon. Fix: the card itself goes neutral (no bgColor/borderColor
   override — .card's own white/border wins); the title uses var(--maroon)
   instead of var(--yellow) when nobody's confirmed over 40h yet; "today"
   badges are now solid red with white text plus a light red row tint,
   visually distinct from "tomorrow"/"in 2 days"' lighter pills. */
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
  name: 'Overtime card redesign: neutral (non-orange) card background, maroon title when nobody has confirmed OT, and a solid red "today" badge + row tint distinct from the lighter "tomorrow" pill',
  async run(t) {
    const ds = '2026-10-05';
    const todaySchedule = { 'Today Girl': { '2026-10-05': '1' } };
    const tomorrowSchedule = { 'Tomorrow Girl': { '2026-10-06': '1' } };

    const seed = buildSeed(Object.assign({}, todaySchedule, tomorrowSchedule));
    Object.assign(seed, {
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: [
            { id: 't1', name: 'Today Girl', pos: 'Room Attendant', paid: 16.5, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'Tomorrow Girl', pos: 'Room Attendant', paid: 16.5, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-04': { emps: [
            { id: 't1', name: 'Today Girl', pos: 'Room Attendant', paid: 16.5, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'Tomorrow Girl', pos: 'Room Attendant', paid: 16.5, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
    });

    const { win } = await loadApp({ seed });

    const projections = win.laborProjectedWeekHours(ds);
    const todayEmp = projections.find((p) => p.id === 't1');
    const tomorrowEmp = projections.find((p) => p.id === 't2');

    // ── Unit check: the two tiers now have structurally different badges ──
    const todayBadge = win._laborLastDayBadge(ds, todayEmp);
    const tomorrowBadge = win._laborLastDayBadge(ds, tomorrowEmp);
    t.eq(todayBadge.bg, 'var(--red)', "today's badge is a SOLID red fill");
    t.eq(todayBadge.color, '#fff', 'white text on the solid fill');
    t.eq(todayBadge.rowBg, 'var(--red-bg)', "today's whole row also gets a light red tint");
    t.eq(tomorrowBadge.bg, 'var(--red-bg)', "tomorrow's badge stays the quieter light pill");
    t.eq(tomorrowBadge.color, 'var(--red)', 'dark red text on the light fill');
    t.assert(!tomorrowBadge.rowBg, 'tomorrow gets NO row tint — only today earns the stronger treatment');

    // ── Full render ──
    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    // Card itself: no orange wash, no leftover red-border/red-bg override
    // (hasOT is false here — nobody has real OT1 minutes or is already
    // over with 0 days left, both are still just "approaching").
    const cardIdx = html.indexOf('class="card"');
    t.assert(cardIdx !== -1, 'the Overtime card renders');
    const cardOpenTag = html.slice(cardIdx, html.indexOf('>', cardIdx) + 1);
    t.assert(!/var\(--yellow-bg\)/.test(cardOpenTag), 'the card no longer washes orange (var(--yellow-bg)) across the whole background');
    t.assert(!/var\(--yellow-border\)/.test(cardOpenTag), 'nor does it keep the orange border');

    // Title: maroon, not var(--yellow), while nobody is confirmed over
    const titleIdx = html.indexOf('card-title');
    t.assert(titleIdx !== -1, 'the card title renders');
    t.assert(/color:var\(--maroon\)/.test(html.slice(titleIdx, titleIdx + 60)), "the title uses var(--maroon) instead of var(--yellow)");

    // Rows: Today Girl's row background is tinted; Tomorrow Girl's is not.
    // The row's own opening tag (not any inner wrapper div) is the nearest
    // "padding:8px 16px" before her name — that style string is unique to
    // the row container, so slicing from there excludes every earlier row.
    const tIdx = html.indexOf('Today Girl');
    t.assert(tIdx !== -1, 'Today Girl appears');
    const rowStart = html.lastIndexOf('padding:8px 16px', tIdx);
    t.assert(/background:var\(--red-bg\)/.test(html.slice(rowStart, tIdx)), "Today Girl's row div carries the red tint");
    t.assert(/background:var\(--red\);color:#fff/.test(html.slice(tIdx, tIdx + 200)), 'and her badge itself is the solid red fill with white text');

    const toIdx = html.indexOf('Tomorrow Girl');
    t.assert(toIdx !== -1, 'Tomorrow Girl appears');
    const toRowStart = html.lastIndexOf('padding:8px 16px', toIdx);
    t.assert(!/background:var\(--red-bg\)/.test(html.slice(toRowStart, toIdx)), "Tomorrow Girl's row has NO background tint — only today gets that");
  },
};
