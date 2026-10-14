/* Carlos's ask, 2026-10-14: for anyone in Overtime/Approaching OT who
   still has real scheduled days left, warn a day ahead of her LAST
   scheduled day — not just the day itself — so there's still time to act.
   He was shown 3 visual options (a top banner, an inline badge on the
   row, and a standalone "decision needed" card) and picked the inline
   badge, scoped to Overtime only (he never asked for this on Under Hours).

   Escalating window, his explicit pick over a flat "1 day before" rule:
     - her LAST remaining scheduled day is TOMORROW → red "Last day: tomorrow"
     - her LAST remaining scheduled day is in 2 days → amber "Last day: in 2 days"
     - 3+ days out, or no remaining days at all (the "already over, nothing
       left to change it" tier) → no badge at all. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

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
  name: 'Overtime rows (only Overtime, never Under Hours) show a "Last day: tomorrow"/"in 2 days" badge for anyone with real remaining scheduled days, computed from the same remainingDays logic the sub-text already uses',
  async run(t) {
    // 2026-10-05 is a Monday; the hotel week is Sat 10-03..Fri 10-09, so
    // the remaining days this function can see are 10-06..10-09.
    const ds = '2026-10-05';

    // Tomorrow (10-06) only → "Last day: tomorrow"
    const tomorrowSchedule = { 'Tomorrow Girl': { '2026-10-06': '1' } };
    // In 2 days (10-07) is her LAST working day, even though she also
    // works 10-06 — the badge must track the LAST day, not the first.
    const twoDaysSchedule = { 'TwoDays Girl': { '2026-10-06': '1', '2026-10-07': '1' } };
    // 3+ days out (10-09 is her last) → no badge
    const farSchedule = { 'Far Girl': { '2026-10-09': '1' } };
    // An Under Hours candidate whose own last remaining day is ALSO
    // tomorrow — if the badge logic ever leaked into underRows, this is
    // exactly the case that would catch it.
    const shortSchedule = { 'Short Girl': { '2026-10-06': '1' } };

    const seed = buildSeed(Object.assign({}, tomorrowSchedule, twoDaysSchedule, farSchedule, shortSchedule));
    Object.assign(seed, {
      'hk_month_2026-10': {
        days: {
          '2026-10-03': { emps: [
            { id: 't1', name: 'Tomorrow Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'TwoDays Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't3', name: 'Far Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't4', name: 'Short Girl', pos: 'Room Attendant', paid: 4, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-04': { emps: [
            { id: 't1', name: 'Tomorrow Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'TwoDays Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't3', name: 'Far Girl', pos: 'Room Attendant', paid: 8, ot1: 0, unpaid: 0.5 },
            { id: 't4', name: 'Short Girl', pos: 'Room Attendant', paid: 4, ot1: 0, unpaid: 0.5 },
          ]},
          // 2 days × 16h paid + their remaining 8h days projects the
          // first 3 comfortably over 40h (stillApproaching); Short Girl's
          // 2 days × 4h + 1 remaining 8h day projects to 16h, well under.
          '2026-10-05': { emps: [
            { id: 't1', name: 'Tomorrow Girl', pos: 'Room Attendant', paid: 24, ot1: 0, unpaid: 0.5 },
            { id: 't2', name: 'TwoDays Girl', pos: 'Room Attendant', paid: 24, ot1: 0, unpaid: 0.5 },
            { id: 't3', name: 'Far Girl', pos: 'Room Attendant', paid: 24, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
    });

    const { win } = await loadApp({ seed });

    // ── Unit check: _laborLastScheduledDate / _laborLastDayBadge directly ──
    const projections = win.laborProjectedWeekHours(ds);
    const tomorrowEmp = projections.find((p) => p.id === 't1');
    const twoDaysEmp = projections.find((p) => p.id === 't2');
    const farEmp = projections.find((p) => p.id === 't3');

    t.eq(win._laborLastScheduledDate(ds, tomorrowEmp), '2026-10-06', "Tomorrow Girl's last (only) remaining day is 10-06");
    t.eq(win._laborLastScheduledDate(ds, twoDaysEmp), '2026-10-07', "TwoDays Girl's LAST remaining day is 10-07, not her first (10-06)");
    t.eq(win._laborLastScheduledDate(ds, farEmp), '2026-10-09', "Far Girl's only remaining day is 10-09");

    t.eq(win._laborLastDayBadge(ds, tomorrowEmp).text, 'Last day: tomorrow', 'badge text for a last day 1 day out');
    t.eq(win._laborLastDayBadge(ds, twoDaysEmp).text, 'Last day: in 2 days', 'badge text for a last day 2 days out');
    t.eq(win._laborLastDayBadge(ds, farEmp), null, 'no badge at all for a last day 3+ days out');

    const zeroRemaining = { id: 'z1', name: 'Zero Girl', pos: 'Room Attendant', remainingDays: 0 };
    t.eq(win._laborLastDayBadge(ds, zeroRemaining), null, 'no badge for anyone with 0 remaining scheduled days — her week is already final, nothing to warn ahead of');
    t.eq(win._laborLastDayBadge(ds, null), null, "doesn't throw when detail is null (today's real-OT rows with no resolved weekly projection)");

    // ── Full render: badge shows on the Overtime card, in the right color,
    // and NEVER appears anywhere in the Under Hours card (Carlos's explicit
    // scope — Option B, Overtime only). ──
    win.dashSelectedDate = new Date(2026, 9, 5);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    const underIdx = html.indexOf('Under Hours');
    const otHtml = underIdx === -1 ? html : html.slice(0, underIdx);
    const underHtml = underIdx === -1 ? '' : html.slice(underIdx);

    const tgIdx = otHtml.indexOf('Tomorrow Girl');
    t.assert(tgIdx !== -1, 'Tomorrow Girl is flagged as approaching OT');
    t.assert(/Last day: tomorrow/.test(otHtml.slice(tgIdx, tgIdx + 200)), 'her row shows the red "tomorrow" badge');

    const tdIdx = otHtml.indexOf('TwoDays Girl');
    t.assert(tdIdx !== -1, 'TwoDays Girl is flagged as approaching OT');
    t.assert(/Last day: in 2 days/.test(otHtml.slice(tdIdx, tdIdx + 200)), 'her row shows the amber "in 2 days" badge');

    const farIdx = otHtml.indexOf('Far Girl');
    t.assert(farIdx !== -1, 'Far Girl is flagged as approaching OT too (same 48h-ish projection)');
    t.assert(!/Last day:/.test(otHtml.slice(farIdx, farIdx + 200)), 'her row shows NO badge — her last day is 4 days out, outside the warning window');

    t.assert(!/Last day:/.test(underHtml), 'the badge never appears in the collapsed Under Hours card');

    // Expand Under Hours' Room Attendant group to actually see Short
    // Girl's row — she has the SAME "last day is tomorrow" shape as
    // Tomorrow Girl, so this is the real test of the scoping, not just an
    // empty-string pass. ──
    win.toggleLaborPosGroup('under:Room Attendant');
    const html2 = win.document.getElementById('dashDayAnalysis').innerHTML;
    const underHtml2 = html2.slice(html2.indexOf('Under Hours'));
    const sgIdx = underHtml2.indexOf('Short Girl');
    t.assert(sgIdx !== -1, 'Short Girl appears in the expanded Under Hours card');
    t.assert(!/Last day:/.test(underHtml2.slice(sgIdx, sgIdx + 200)), 'her Under Hours row shows NO badge even though her own last day is also tomorrow — this is Overtime-only, by Carlos\'s explicit pick');
  },
};
