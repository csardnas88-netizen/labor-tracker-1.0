/* Carlos's real report, 2026-10-14: looking at TODAY (Oct 14) before
   uploading today's own Labor Distribution Report (his normal workflow —
   he uploads yesterday's PDF today, so today's own report never exists
   yet while he's looking at today), the Overtime/Under Hours section
   showed NOTHING at all — not even for Maria Aguilar, whose Schedule
   Draft last scheduled day IS today and who's projected well over 40h.
   He wants to know TODAY that she should leave early, not find out
   tomorrow after the fact.

   Two root causes, both fixed here:
   (1) laborProjectedWeekHours' remainingDays loop only ever looked at
       days strictly AFTER the viewed date ("wds<=ds" skipped today too)
       — today fell into a gap neither the hoursSoFar loop (no actual
       data yet) nor the remainingDays loop (date already "passed" by
       its own test) ever counted. Now a day counts as "remaining" if
       it's today-or-later AND has no actual record for that specific
       employee yet — so today is eligible right up until her own actual
       hours are actually uploaded.
   (2) The entire Overtime/Under Hours card lived inside "if(snap)" in
       renderDashDayAnalysis, which only opens once TODAY's own report
       exists. Moved outside that gate — it only ever needed PAST actual
       reports + the Schedule Draft, never today's own report. Break
       Exceptions and Position Mismatches (which genuinely need today's
       real punch data) are still gated behind snap, unchanged. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Overtime/Under Hours render and warn about TODAY even with no report uploaded for today yet, using past actuals + the Schedule Draft alone — Break Exceptions/Position Mismatches stay correctly gated behind snap',
  async run(t) {
    // 2026-10-14 is a Wednesday; the hotel week is Sat 10-10..Fri 10-16.
    const ds = '2026-10-14';
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          '2026-10-14': { gra: [['Maria Aguilar', '1']] },
          '2026-10-15': { gra: [['Maria Aguilar', 'OFF']] },
          '2026-10-16': { gra: [['Maria Aguilar', 'OFF']] },
        },
        count: 3, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          // 4 real reported days (Sat-Tue), 9h each = 36h so far.
          // No entry at all for 10-14 (today) — today's report hasn't
          // been uploaded yet, the exact real-world gap Carlos hit.
          '2026-10-10': { emps: [{ id: 'ma1', name: 'Maria Aguilar', pos: 'Room Attendant', paid: 9, ot1: 0, unpaid: 0.5 }] },
          '2026-10-11': { emps: [{ id: 'ma1', name: 'Maria Aguilar', pos: 'Room Attendant', paid: 9, ot1: 0, unpaid: 0.5 }] },
          '2026-10-12': { emps: [{ id: 'ma1', name: 'Maria Aguilar', pos: 'Room Attendant', paid: 9, ot1: 0, unpaid: 0.5 }] },
          '2026-10-13': { emps: [{ id: 'ma1', name: 'Maria Aguilar', pos: 'Room Attendant', paid: 9, ot1: 0, unpaid: 0.5 }] },
        },
      },
    });
    const { win } = await loadApp({ seed });

    // ── Unit check: remainingDays now correctly counts TODAY ──
    const projections = win.laborProjectedWeekHours(ds);
    const maria = projections.find((p) => p.id === 'ma1');
    t.assert(!!maria, 'Maria appears in the projection list even though today has no report yet');
    t.eq(maria.hoursSoFar, 36, '4 real reported days × 9h = 36h so far');
    t.eq(maria.remainingDays, 1, 'TODAY (10-14, no actual report yet, but a real Schedule Draft "1") counts as her 1 remaining day — this used to come out 0');
    t.eq(maria.projected, 44, '36 + 1×8 = 44, over 40h');

    const lastDs = win._laborLastScheduledDate(ds, maria);
    t.eq(lastDs, ds, "her last scheduled date is TODAY itself — the lookup now considers today eligible, not just strictly-future days");

    const badge = win._laborLastDayBadge(ds, maria);
    t.assert(!!badge, 'a badge is returned at all for today-is-last-day');
    t.assert(/^Leave by \d{1,2}:\d{2} (AM|PM) today$/.test(badge.text), 'badge text is the specific leave-by-time form: "' + badge.text + '"');
    // 4h over 40h (44-40), counted back from her real 4:45 PM clock-out
    // (SCHED_SHIFT_TIMES.gra.weekday) — not a vague "today" placeholder.
    const expectedMin = win._timeTextToMinutes('4:45 PM') - 240;
    t.eq(badge.text, 'Leave by ' + win._minutesToTimeText(expectedMin) + ' today', 'the leave-by time is computed from her real scheduled clock-out minus the exact overage, same math the day-strip already used');
    t.eq(badge.bg, 'var(--red-bg)', "today's warning is red — the most urgent tier, same as tomorrow's");

    // ── Full render: no snap exists for today (days['2026-10-14'] was
    // never uploaded) — Overtime must still render; Break Exceptions and
    // Position Mismatches must NOT (they genuinely need today's actual
    // punch data, which doesn't exist). ──
    win.dashSelectedDate = new Date(2026, 9, 14);
    const monthData = win.loadMonthData('2026-10');
    t.assert(!monthData.days['2026-10-14'], "sanity check: today truly has no uploaded snapshot in this fixture");
    win.renderDashDayAnalysis(monthData.days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    t.assert(/Overtime/.test(html), 'the Overtime card renders even with no report for today');
    const mIdx = html.indexOf('Maria Aguilar');
    t.assert(mIdx !== -1, 'Maria Aguilar is flagged as approaching OT, today, before her own report is ever uploaded');
    t.assert(/Leave by \d{1,2}:\d{2} (AM|PM) today/.test(html.slice(mIdx, mIdx + 300)), 'her specific leave-by-time badge shows right on her row');

    t.assert(!/Break Exceptions/.test(html), 'Break Exceptions correctly stays hidden — it still needs today\'s own actual punch data, which doesn\'t exist yet');
    t.assert(!/Position Mismatches/.test(html), 'Position Mismatches correctly stays hidden for the same reason');
  },
};
