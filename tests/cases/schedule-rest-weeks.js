/* Carlos's ask, 2026-10-04: while deciding who to rest on a light-
   occupancy day, see who in a position has already rested the most
   lately — so the day off goes to someone who hasn't, instead of
   stacking onto whoever's already had the most, which reads as unfair.
   Walked through several mockups with him before building this:
   - A week "counts" at 3+ days off (his own threshold, confirmed as
     "3 o más", not "more than 3").
   - Only OFF/R-OFF count — Vacation/Flex/a Call-Off are explicitly
     excluded, confirmed after he first asked about "everything that
     isn't working" and picked the narrower definition instead.
   - Looks back SCHED_REST_LOOKBACK_WEEKS (10) weeks, NOT including the
     week currently on screen (it isn't finished yet).
   - A week with no row at all for that person is skipped — never
     counted as a zero (same distinction schedWeekendGap already makes).
   - The badge next to the name is a quiet "N wk" count, omitted
     entirely at 0; tapping it opens the week-by-week breakdown, most
     recent qualifying week highlighted. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedRestWeeksFor: who has rested 3+ days in a week, over the last 10 weeks, OFF/R-OFF only',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // Viewed week: Sat 2026-09-26 .. Fri 2026-10-02. Lookback starts the
    // week before this one (Sat 2026-09-19) and walks backward.
    win.schedViewWeekStart = new Date(2026, 8, 26);
    const SCH = { days: {} };

    function fillWeek(weekStartYMD, name, values) {
      // weekStartYMD: 'YYYY-MM-DD' for the Saturday the week starts.
      const [y, m, d] = weekStartYMD.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      for (let i = 0; i < 7; i++) {
        const dt = new Date(start); dt.setDate(start.getDate() + i);
        const ds = win.dateStr(dt);
        if (!SCH.days[ds]) SCH.days[ds] = {};
        if (!SCH.days[ds].lobby) SCH.days[ds].lobby = [];
        SCH.days[ds].lobby.push([name, values[i]]);
      }
    }

    // The currently-viewed week itself — both need a row here just so the
    // Lobby crew card actually renders at all (renderSchedule only shows a
    // card with at least one row inside the dates currently on screen).
    // Left ordinary ('1' every day), uninvolved in the lookback assertions.
    fillWeek('2026-09-26', 'Marroquin', ['1', '1', '1', '1', '1', 'OFF', '1']);
    fillWeek('2026-09-26', 'Gabriela', ['1', '1', '1', '1', '1', '1', '1']);

    // 1 week back (Sep 19-25): exactly 3 OFF -> qualifies, the most recent.
    fillWeek('2026-09-19', 'Marroquin', ['OFF', '1', '1', 'OFF', '1', '1', 'OFF']);
    // 2 weeks back (Sep 12-18): only 2 OFF -> does not qualify.
    fillWeek('2026-09-12', 'Marroquin', ['OFF', '1', '1', '1', 'OFF', '1', '1']);
    // 3 weeks back (Sep 5-11): 4 days off, but one is VAC and one is
    // CALL-OFF, not OFF/R-OFF -> only 2 real OFF/R-OFF -> does not qualify.
    fillWeek('2026-09-05', 'Marroquin', ['OFF', 'VAC', 'R-OFF', 'CALL-OFF', '1', '1', '1']);
    // 4 weeks back (Aug 29-Sep 4): R-OFF x3 -> qualifies.
    fillWeek('2026-08-29', 'Marroquin', ['R-OFF', '1', 'R-OFF', '1', 'R-OFF', '1', '1']);
    // 5 weeks back (Aug 22-28): left with NO row for Marroquin at all on
    // this crew (simulates her not being on the schedule that week) ->
    // must be skipped entirely, not counted as a zero.
    const skippedStart = new Date(2026, 7, 22);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(skippedStart); dt.setDate(skippedStart.getDate() + i);
      const ds = win.dateStr(dt);
      SCH.days[ds] = { lobby: [] }; // crew exists that day, just no row for her
    }

    // Gabriela: a past week with no OFF days at all — never crosses the
    // threshold in the whole lookback.
    fillWeek('2026-09-19', 'Gabriela', ['1', '1', '1', '1', '1', '1', '1']);

    const weeks = win.schedRestWeeksFor(SCH, 'lobby', 'Marroquin');

    t.eq(weeks.length, 2, 'exactly two qualifying weeks found (Sep 19-25 and Aug 29-Sep 4) — Sep 12-18 (only 2) and Sep 5-11 (VAC/CALL-OFF do not count) are correctly excluded');
    t.eq(win.dateStr(weeks[0].start), '2026-09-19', 'the most recent qualifying week is first');
    t.eq(weeks[0].count, 3, 'with its real OFF count');
    t.eq(win.dateStr(weeks[1].start), '2026-08-29', 'the older qualifying week is second, not re-ordered');
    t.eq(weeks[1].count, 3, 'R-OFF counts exactly the same as OFF toward the threshold');

    // The skipped (no-row) week must never silently appear as a false "0" week.
    t.assert(!weeks.some((w) => win.dateStr(w.start) === '2026-08-22'), 'the week with no row for her at all is never treated as a qualifying OR disqualifying week — it is simply absent');

    // A person who never crosses the threshold gets an empty list, not a
    // list of zero-count weeks.
    const gabrielaWeeks = win.schedRestWeeksFor(SCH, 'lobby', 'Gabriela');
    t.eq(gabrielaWeeks.length, 0, 'someone who never had a 3+ day-off week in the lookback gets an empty list');

    // ── Rendered on the Schedule Draft card ──
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify(SCH));
    win.renderSchedule();
    let grid = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/Marroquin[\s\S]{0,400}>2 wk</.test(grid), "Marroquin's badge shows 2 wk (2 qualifying weeks) next to her name");
    const gIdx = grid.indexOf('>Gabriela<');
    t.assert(gIdx !== -1 && !/\d wk/.test(grid.slice(gIdx, gIdx + 200)), 'Gabriela has no badge at all — zero qualifying weeks renders nothing, not "0 wk"');

    win.schedToggleRestWeeks('lobby', 'Marroquin');
    grid = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/Rested 3\+ days, last 10 weeks/.test(grid), 'tapping the badge opens the breakdown panel');
    t.assert(/most recent/.test(grid), 'the most recent qualifying week (Sep 19-25) is labeled');
    const panelIdx = grid.indexOf('Rested 3+ days');
    const mostRecentIdx = grid.indexOf('most recent', panelIdx);
    const olderWeekIdx = grid.indexOf('Aug 29', panelIdx);
    t.assert(mostRecentIdx !== -1 && olderWeekIdx !== -1 && mostRecentIdx < olderWeekIdx, 'the most-recent week renders before the older one, top to bottom');

    win.schedToggleRestWeeks('lobby', 'Marroquin');
    grid = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(!/Rested 3\+ days, last 10 weeks/.test(grid), 'tapping the badge again closes the panel');
  }
};
