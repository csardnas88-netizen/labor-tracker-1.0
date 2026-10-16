/* Carlos's real question, 2026-10-15: is part of someone's Overtime
   overage actually explained by a short break or an early clock-in?
   Shown him a mockup (two signals combined into a note, plus a muted
   "upload the Weekly Time Card Report" prompt only when the data
   genuinely isn't there yet), approved.

   Two independent signals:
   - Short break: the SAME breakStatus/combineDayEntries math Break
     Compliance already runs on the Labor Distribution Report's own
     unpaid-minutes field — no Weekly Time Card Report needed at all.
     "Extra paid minutes" = her position's floor (25min normal, 15min
     Turndown/part-time) minus her actual unpaid minutes, only counted
     on a day that's an actual 'short' violation.
   - Early clock-in: genuinely needs the Weekly Time Card Report's real
     workStartTime, compared against the Schedule Draft's scheduled
     start (schedScheduledStartTimeReason, same lookup Late Arrivals
     already uses), mirroring WTC_LATE_THRESHOLD_MIN to the early side.

   Priority: show the real explanation whenever EITHER signal fired,
   even if the other signal's data is incomplete. Only prompt to upload
   the report when there's NOTHING to show yet and a worked day this
   week has no Weekly Time Card row at all. Show nothing when the data
   is complete and neither signal fired — the overage is just real
   scheduled hours. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Overtime rows explain part of the overage via a short break and/or an early clock-in when the data supports it, and prompt to upload the Weekly Time Card Report only when it genuinely can\'t tell yet',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({
        days: {
          '2026-10-06': { gra: [['Early Girl', '1'], ['Clean Girl', '1']] },
        },
        count: 1, savedAt: new Date().toISOString(),
      }),
      'hk_month_2026-10': {
        days: {
          // Break Girl: a real short break (20min, floor is 25) on Sat —
          // 5 extra paid minutes. No schedule/WTC at all for her.
          '2026-10-03': { emps: [
            { id: 'b1', name: 'Break Girl', pos: 'Room Attendant', paid: 30, ot1: 0, unpaid: 0.333 },
            { id: 'm1', name: 'Mystery Girl', pos: 'Room Attendant', paid: 41, ot1: 0, unpaid: 0.5 },
            { id: 'c1', name: 'Clean Girl', pos: 'Room Attendant', paid: 10, ot1: 0, unpaid: 0.5 },
          ]},
          '2026-10-04': { emps: [
            { id: 'b1', name: 'Break Girl', pos: 'Room Attendant', paid: 11, ot1: 0, unpaid: 0.5 },
          ]},
          // Early Girl: today's own data already exists, 45h alone is
          // already over 40h — her short break check is clean (30min).
          '2026-10-06': { emps: [
            { id: 'e1', name: 'Early Girl', pos: 'Room Attendant', paid: 45, ot1: 0, unpaid: 0.5 },
            { id: 'c1', name: 'Clean Girl', pos: 'Room Attendant', paid: 31, ot1: 0, unpaid: 0.5 },
          ]},
        },
      },
      hk_wtc_report: JSON.stringify({
        byId: {
          e1: { id: 'e1', name: 'Early Girl', days: {
            '2026-10-06': { workStartTime: '7:55 AM', schedTime: '8:15 AM', reg: 45, ot: 0, nonwkd: 0, total: 45, unpaid: 0, types: [] },
          }},
          c1: { id: 'c1', name: 'Clean Girl', days: {
            '2026-10-03': { workStartTime: '8:14 AM', schedTime: '8:15 AM', reg: 10, ot: 0, nonwkd: 0, total: 10, unpaid: 0, types: [] },
            '2026-10-06': { workStartTime: '8:16 AM', schedTime: '8:15 AM', reg: 31, ot: 0, nonwkd: 0, total: 31, unpaid: 0, types: [] },
          }},
        },
      }),
    });
    const { win } = await loadApp({ seed });

    const ds = '2026-10-06';
    const projections = win.laborProjectedWeekHours(ds);
    const breakGirl = projections.find((p) => p.id === 'b1');
    const earlyGirl = projections.find((p) => p.id === 'e1');
    const mysteryGirl = projections.find((p) => p.id === 'm1');
    const cleanGirl = projections.find((p) => p.id === 'c1');

    // ── Unit checks ──
    const breakNote = win._laborOtContributingFactorsNote(ds, breakGirl);
    t.eq(breakNote.type, 'detail', "Break Girl's short break alone is enough to explain part of her overage");
    t.eq(breakNote.text, '5m over comes from a short break (Sat)', 'exactly the 5 extra minutes a full break would have cost her, on the real day');

    const earlyNote = win._laborOtContributingFactorsNote(ds, earlyGirl);
    t.eq(earlyNote.type, 'detail', "Early Girl's early clock-in explains part of her overage");
    t.eq(earlyNote.text, '20m over comes from an early clock-in (Tue)', '20 real minutes (7:55 AM vs her 8:15 AM scheduled start), on the real day');

    const mysteryNote = win._laborOtContributingFactorsNote(ds, mysteryGirl);
    t.eq(mysteryNote.type, 'missing', 'Mystery Girl has no break violation and no Weekly Time Card Report at all — genuinely unknown, so it prompts instead of staying silent');

    const cleanNote = win._laborOtContributingFactorsNote(ds, cleanGirl);
    t.eq(cleanNote, null, 'Clean Girl has a normal break AND full Weekly Time Card coverage with on-time clock-ins both days — nothing to explain, so no note at all');

    t.eq(win._laborOtContributingFactorsNote(ds, null), null, "doesn't throw when detail is null (a real-OT row with no resolved weekly projection)");

    // ── Full render ──
    win.dashSelectedDate = new Date(2026, 9, 6);
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    const bIdx = html.indexOf('Break Girl');
    t.assert(bIdx !== -1, 'Break Girl appears in Overtime');
    t.assert(/5m over comes from a short break \(Sat\)/.test(html.slice(bIdx, bIdx + 400)), 'her row shows the short-break explanation');

    const eIdx = html.indexOf('Early Girl');
    t.assert(eIdx !== -1, 'Early Girl appears in Overtime');
    t.assert(/20m over comes from an early clock-in \(Tue\)/.test(html.slice(eIdx, eIdx + 400)), 'her row shows the early-clock-in explanation');

    const mIdx = html.indexOf('Mystery Girl');
    t.assert(mIdx !== -1, 'Mystery Girl appears in Overtime');
    t.assert(/Upload the Weekly Time Card Report/.test(html.slice(mIdx, mIdx + 600)), 'her row prompts to upload the report instead of staying silent');

    const cIdx = html.indexOf('Clean Girl');
    t.assert(cIdx !== -1, 'Clean Girl appears in Overtime');
    t.assert(!/comes from|Upload the Weekly Time Card/.test(html.slice(cIdx, cIdx + 300)), 'her row shows NO note at all — nothing to explain and nothing missing');
  },
};
