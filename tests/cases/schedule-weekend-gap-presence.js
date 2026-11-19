/* Found during code review, 2026-11-19 (while building the Weekend
   Rotation feature, not yet a live Carlos report): schedWeekendGap
   counted a week as "checked" the moment that CALENDAR DAY existed in
   SCH.days for the crew — not whether THIS PERSON had an actual row on
   it. A brand-new hire, whose crewmates already have data for the weeks
   before she joined, read as having just as much "checked" history as
   someone who'd genuinely been on the crew the whole time, even though
   she herself has none of it.

   Two real, already-shipped consequences:
   1. schedScheduleChecks' weekend reminder could flag a brand-new hire
      with "hasn't had a full weekend off" the same week she joins.
   2. schedWeekendDueOrder — which Auto-fill uses to decide who gets the
      next full weekend off — ranks anyone with weeksAgo===null as
      equally/more overdue than someone with real history (key 9999,
      no gap.checked guard at all), so a brand-new hire with zero
      weekend data could get PRIORITIZED ahead of someone who'd
      genuinely waited the longest — the opposite of the fairness goal
      the surrounding comments describe.

   Fixed by checking whether `name` herself has a row that Saturday or
   Sunday, the same hasRow pattern _schedRestOffCount already uses a
   few lines up for the identical reason. */
const { loadApp, fakeSession } = require('../_harness');

function fillWeek(win, SCH, weekStartYMD, entries) {
  const [y, m, d] = weekStartYMD.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start); dt.setDate(start.getDate() + i);
    const ds = win.dateStr(dt);
    if (!SCH.days[ds]) SCH.days[ds] = {};
    if (!SCH.days[ds].gra) SCH.days[ds].gra = [];
    Object.keys(entries).forEach((name) => {
      const v = entries[name][i];
      if (v === undefined) return; // no row this day for this person
      SCH.days[ds].gra.push([name, v]);
    });
  }
}

module.exports = {
  name: 'schedWeekendGap only counts a week as "checked" when the PERSON herself has a row, not just because her crewmates\' data made the calendar day exist',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const SCH = { days: {} };
    const WORK = ['1', '1', '1', '1', '1', '1', '1'];

    // Veteran: real history, 5 weeks back, no full weekend at all —
    // every week she has a real row, every week should count as checked.
    for (let back = 1; back <= 5; back++) {
      const start = new Date(2026, 9, 3 - 7 * back); // walking back from Sat Oct 3, 2026
      fillWeek(win, SCH, win.dateStr(start), { Veterana: WORK });
    }
    // New hire: only on the crew for the most recent 2 of those 5 weeks —
    // the other 3 weeks have real data (Veterana's), but NOT for her.
    for (let back = 1; back <= 2; back++) {
      const start = new Date(2026, 9, 3 - 7 * back);
      fillWeek(win, SCH, win.dateStr(start), { Nueva: WORK });
    }

    win.dlSaveSchedule(SCH);
    const SCH2 = win.dlLoadSchedule();
    const beforeWeekStart = new Date(2026, 9, 3); // the week after the most recent examined one

    const gapVeterana = win.schedWeekendGap(SCH2, 'gra', 'Veterana', beforeWeekStart);
    t.eq(gapVeterana.checked, 5, 'Veterana: all 5 weeks she was genuinely present for count as checked');

    const gapNueva = win.schedWeekendGap(SCH2, 'gra', 'Nueva', beforeWeekStart);
    t.eq(gapNueva.checked, 2, 'Nueva: only the 2 weeks SHE actually has a row for count — not the 3 earlier weeks that only have Veterana\'s data');

    // ── schedWeekendDueOrder: Veterana (real, longer history, never had
    // a full weekend) must rank as MORE overdue than Nueva (barely any
    // history at all), not the reverse. ──
    const order = win.schedWeekendDueOrder(SCH2, 'gra', ['Veterana', 'Nueva'], win.dateStr(beforeWeekStart));
    t.eq(order[0], 'Veterana', 'Veterana (genuinely longer without a full weekend) is ranked most overdue, not outranked by a brand-new hire\'s "never" reading');

    // ── schedScheduleChecks: Nueva must NOT get the spurious "hasn't had
    // a full weekend off" reminder the week she joins — she hasn't been
    // around long enough (gap.checked<3) to judge fairly. ──
    const recentDates = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(2026, 9, 3); dt.setDate(dt.getDate() + i);
      recentDates.push(win.dateStr(dt));
    }
    if (!SCH2.days[recentDates[0]]) SCH2.days[recentDates[0]] = {};
    SCH2.days[recentDates[0]].gra = [['Veterana', '1'], ['Nueva', '1']];
    const warnings = win.schedScheduleChecks(SCH2, recentDates);
    t.assert(!warnings.some((w) => w.type === 'weekend' && w.text.indexOf('Nueva') === 0),
      'Nueva (barely any real history yet) is not flagged for a full-weekend reminder');

    // ── Found during the same code review: schedWeekendGap's loop was
    // hardcoded to look back only 10 weeks, no matter how far a caller
    // actually needed to see — Weekend Rotation's own 12-week view
    // couldn't find a real full weekend sitting in week 11 or 12. Added
    // an optional maxBack parameter (defaults to 10, so every
    // pre-existing caller is unaffected). ──
    const SCH3 = { days: {} };
    for (let back = 1; back <= 12; back++) {
      const start = new Date(2026, 9, 3 - 7 * back);
      const working = back === 12 ? ['OFF', 'OFF', '1', '1', '1', '1', '1'] : ['1', '1', '1', '1', '1', '1', '1'];
      fillWeek(win, SCH3, win.dateStr(start), { Dolores: working });
    }
    win.dlSaveSchedule(SCH3);
    const SCH4 = win.dlLoadSchedule();
    const gapDefault = win.schedWeekendGap(SCH4, 'gra', 'Dolores', beforeWeekStart);
    t.eq(gapDefault.weeksAgo, null, 'without maxBack, her real full weekend 12 weeks back is outside the default 10-week lookback');
    t.eq(gapDefault.checked, 10, 'and checked stops at the default cap');
    const gap12 = win.schedWeekendGap(SCH4, 'gra', 'Dolores', beforeWeekStart, 12);
    t.eq(gap12.weeksAgo, 12, 'passing maxBack=12 (what a 12-week Weekend Rotation view actually needs) finds it correctly');
    t.eq(gap12.checked, 12, 'and checked now covers the full window asked for');
  },
};
