/* Carlos's real ask, 2026-11-20: HM Alpha's 7 paid holidays should
   rotate fairly across each crew, same idea as Weekend Rotation but for
   holidays instead of Saturdays/Sundays — and computed from each
   holiday's own rule (fixed date, or Nth/last weekday of a month) so
   Carlos never has to re-enter them year to year. A separate floating
   bubble, not a tab on Weekend Rotation's own panel (his explicit call
   when asked). Confirmed "today" for this test run is 2026-11-20, so
   Thanksgiving 2026 (Nov 26) is still in the future — the exact case
   that matters for telling the historical window (excludes it) apart
   from the forward "next holiday" suggestion (targets it). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Holiday Rotation: dates are computed from each holiday\'s own rule every year, the historical window excludes a not-yet-happened holiday, and the forward suggestion correctly targets the next real one',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Date math, against known real 2026 dates. ──
    const dateFor = (key, year) => {
      const def = win.SCHED_HOLIDAYS.filter((h) => h.key === key)[0];
      return win.dateStr(win._schedHolidayDateForYear(def.rule, year));
    };
    t.eq(dateFor('newyear', 2026), '2026-01-01', "New Year's Day is always Jan 1");
    t.eq(dateFor('mlk', 2026), '2026-01-19', 'MLK Day 2026 is the 3rd Monday of January');
    t.eq(dateFor('memorial', 2026), '2026-05-25', 'Memorial Day 2026 is the last Monday of May');
    t.eq(dateFor('independence', 2026), '2026-07-04', 'Independence Day is always July 4');
    t.eq(dateFor('labor', 2026), '2026-09-07', 'Labor Day 2026 is the 1st Monday of September');
    t.eq(dateFor('thanksgiving', 2026), '2026-11-26', 'Thanksgiving 2026 is the 4th Thursday of November');
    t.eq(dateFor('christmas', 2026), '2026-12-25', 'Christmas Day is always Dec 25');
    // A different year, to prove it's not hardcoded — 2027 MLK is the
    // 3rd Monday of January 2027, a different date than 2026's.
    t.eq(dateFor('mlk', 2027), '2027-01-18', 'MLK Day recomputes correctly for a different year, not frozen to 2026');

    // ── The next real holiday from "today" (2026-11-20, per this test
    // run's fixed system date) is Thanksgiving, 6 days out — not
    // Christmas, which is further away. ──
    const next = win._schedNextHoliday();
    t.eq(next.key, 'thanksgiving', 'the next holiday from today is Thanksgiving');
    t.eq(next.ds, '2026-11-26', 'on its correct 2026 date');

    // ── The historical occurrence window excludes Thanksgiving 2026
    // (still in the future) but includes everything on or before today. ──
    const occ2yr = win._schedHolidayOccurrences(2);
    t.assert(!occ2yr.some((o) => o.ds === '2026-11-26'), 'a not-yet-happened holiday is excluded from the historical window');
    t.assert(occ2yr.some((o) => o.ds === '2026-07-04'), 'Independence Day 2026, already past, is included');
    t.assert(occ2yr.some((o) => o.ds === '2025-12-25'), 'with a 2-year window, last year\'s Christmas is included too');
    t.assert(!occ2yr.some((o) => o.ds === '2024-12-25'), 'but not 3 years back — that is outside the 2-year window');

    // ── Build a small Supervisors fixture: Ana had Christmas off last
    // year (this year's Christmas hasn't happened yet as of "today",
    // 2026-11-20, so only ONE Christmas falls inside the window);
    // Beatriz never had any holiday off at all; Carla is brand new (no
    // rows before this year), so she must never read as "overdue" from
    // simple silence. ──
    const SCH = { days: {} };
    const allOcc = win._schedHolidayOccurrences(2);
    allOcc.forEach((o) => {
      const row = [];
      row.push(['Ana', o.key === 'christmas' ? 'OFF' : '1']);
      // Carla only appears for occurrences in the current year — listed
      // BEFORE Beatriz on purpose: a sort that merely preserves input
      // order on a tie (every JS engine's Array#sort is stable) would
      // incidentally rank her first regardless of the real tenure guard
      // if Carla happened to come first here, exactly the ordering this
      // test needs to actually exercise rather than coincidentally dodge.
      if (o.date.getFullYear() === 2026) row.push(['Carla', '1']);
      row.push(['Beatriz', '1']);
      SCH.days[o.ds] = { sup: row };
    });
    win.dlSaveSchedule(SCH);
    win.schedHolidayRotationYears = 2;
    win.currentPage = 'schedule';
    win.localStorage.setItem('hk_sched_holiday_panel_open', '1');
    win.renderSchedHolidayBubble();

    const html = win.document.getElementById('schedHolidayPanelBody').innerHTML;
    t.assert(/Supervisors/.test(html), 'the Supervisors crew card renders');
    t.assert(/Had it off/.test(html) && /Suggested for the next holiday/.test(html), 'the legend explains both markers');

    const anaIdx = html.indexOf('>Ana<');
    const beaIdx = html.indexOf('>Beatriz<');
    t.assert(anaIdx !== -1 && beaIdx !== -1, 'both Ana and Beatriz render');
    // Ana's Had/N count: only last year's Christmas falls inside the
    // window — this year's Christmas (and Thanksgiving) are still in
    // the future as of "today" and are excluded entirely.
    t.assert(new RegExp('Ana[\\s\\S]{0,4000}1\\s*<span[^>]*>\\s*/\\s*' + allOcc.length).test(html),
      'Ana\'s Had/N count is exactly 1 (last year\'s Christmas — this year\'s hasn\'t happened yet)');

    // The amber "longest since" marker lands on Beatriz (never had one),
    // not Ana (had Christmas most recently).
    const anaBlock = html.slice(Math.max(0, anaIdx - 900), anaIdx + 50);
    const beaBlock = html.slice(Math.max(0, beaIdx - 900), beaIdx + 50);
    t.assert(!/Longest since her last holiday off/.test(anaBlock), 'not on Ana, who had Christmas most recently');
    t.assert(/Longest since her last holiday off/.test(beaBlock), 'the overdue marker sits on Beatriz, who has never had one');

    // The green "suggested for the next holiday" marker also lands on
    // Beatriz, the one who should get Thanksgiving this year — not on
    // Carla, who simply lacks history (new hire), and not on Ana.
    const carlaIdx = html.indexOf('>Carla<');
    t.assert(carlaIdx !== -1, 'Carla (new to the crew) still renders');
    const carlaBlock = html.slice(Math.max(0, carlaIdx - 900), carlaIdx + 50);
    t.assert(/Suggested for the next holiday/.test(beaBlock), 'Beatriz is suggested for Thanksgiving, the real most-overdue person');
    t.assert(!/Suggested for the next holiday/.test(anaBlock) && !/Suggested for the next holiday/.test(carlaBlock),
      'not Ana (rested most recently) and not Carla (no real history to judge from, despite having zero holidays off too)');

    // ── Bubble/panel mechanics: shown only on the Schedule page, hidden
    // elsewhere, same pattern as Weekend Rotation's own bubble. ──
    win.showPage('roster');
    t.eq(win.document.getElementById('schedHolidayBubble').style.display, 'none', 'hidden off the Schedule page');
    win.showPage('schedule');
    t.eq(win.document.getElementById('schedHolidayBubble').style.display, 'flex', 'shown again back on the Schedule page');

    // ── Code review, 2026-11-20: the Holiday Rotation panel is stacked
    // close enough above Weekend Rotation's own panel that both open at
    // once nearly cover each other. Opening either one must always
    // close the other, so only one of these two floating panels is ever
    // on screen together. ──
    win.localStorage.setItem('hk_sched_wknd_panel_open', '1');
    win.localStorage.setItem('hk_sched_holiday_panel_open', '0'); // closed to start, regardless of earlier test steps
    win.renderSchedWeekendBubble();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'Weekend panel open to start');
    win.schedToggleHolidayRotation(); // opens Holiday
    t.eq(win.document.getElementById('schedHolidayPanel').style.display, 'flex', 'Holiday panel now open');
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none', 'opening Holiday closed Weekend — never both at once');
    t.eq(win.localStorage.getItem('hk_sched_wknd_panel_open'), '0', 'and the flag itself is cleared, not just the DOM');

    win.schedToggleWeekendRotation(); // opens Weekend back
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'Weekend panel open again');
    t.eq(win.document.getElementById('schedHolidayPanel').style.display, 'none', 'and opening Weekend closed Holiday right back');
  },
};
