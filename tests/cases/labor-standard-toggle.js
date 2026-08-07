/* Carlos asked for a way to see the Labor page "cleanly" under just one
   standard at a time, instead of the old/Unifocus figures sitting side by
   side — closer to how the page looked before Unifocus existed, but
   switchable. Originally scoped to just the By Position table; later
   extended (v6.82.0) to Weekly Labor Pace too. Persisted in localStorage
   (hk_labor_std_mode) so it survives navigation and reload.

   v6.84.0 moved the toggle itself out of the By Position card header and
   up to the top of the page (dashStdToggleBar, right under "Hours pace vs
   budget by day and week") so a manager picks a standard before looking at
   any numbers below — and flipped the default from Current to Unifocus,
   since that's the standard Carlos actually evaluates against day to day.
   An unrecognized/garbage stored value now falls back to that same new
   default (Unifocus), not the old one.

   v6.95.0 made that top bar the ONLY copy of the toggle (Weekly Pace and
   the Adjusted card each had their own duplicate driving the same
   setting), and v6.97.0 removed the By Position table entirely as
   redundant with Weekly Labor Pace — so the numbers this toggle drives are
   now checked on Weekly Pace's day-cards. buildWeeklyPaceHTML is called
   directly with an explicit week rather than going through showPage:
   renderDashDayAnalysis picks its week from the system clock, so a fixture
   pinned to July would render an empty card whenever "today" isn't in that
   week (see the fuller note in unifocus-weekly-pace.js). The toggle BAR is
   still read off the live page, since that's what proves
   setLaborStandardMode re-renders rather than just storing a value. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor standard toggle: one standard at a time, switchable, persisted, defaulting to Unifocus",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-15': {
            totalPaid: 30,
            byPosition: { 'House Attendant': { paid: 20 } }
          }
        },
        rooms: { '2026-07-14': 150 }
      },
      'hk_r106_2026-07': {
        '2026-07-15': { occ: 150, comp: 0, net: 150, dep: 90 }
      }
    });
    const { win } = await loadApp({ seed });
    win.dashSelectedDate = new Date(2026, 6, 15);
    const week = { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) };
    // House Attendant is 17.5% of rooms (150, the night before) under LABOR_STD.
    const houseBudgetCurrent = (150 * 0.175).toFixed(2); // 26.25

    function haBlock() {
      const pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 150, week);
      const i = pace.indexOf('>House Attendant</div>');
      t.assert(i !== -1, 'House Attendant block found in Weekly Labor Pace');
      return pace.slice(i, i + 3000);
    }

    // ── Defaults to 'unifocus' with nothing set. ──
    t.eq(win.getLaborStandardMode(), 'unifocus', "defaults to 'unifocus' with no stored preference");

    win.showPage('labor');
    let block = haBlock();
    let barHtml = win.document.getElementById('dashStdToggleBar').innerHTML;
    t.assert(/32\.00/.test(block), 'default (Unifocus) mode shows the Unifocus-derived budget (32.00h) for House Attendant');
    t.assert(block.indexOf(houseBudgetCurrent) === -1, 'the LABOR_STD figure (26.25h) is NOT shown by default — one standard at a time, not both');
    t.assert(/Unifocus/.test(barHtml), 'the toggle bar at the top of the page shows Unifocus as the active button');

    // ── The toggle exists in exactly ONE place: the top bar. Weekly Pace
    // used to embed its own copy (and so did the Adjusted card) — three
    // controls driving one setting, which Carlos asked to collapse into a
    // single, more prominent one. ──
    const pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 150, week);
    t.assert(!/setLaborStandardMode/.test(pace), 'Weekly Labor Pace does not embed its own copy of the toggle');
    t.assert(/setLaborStandardMode/.test(barHtml), 'the top bar is where the toggle actually lives');

    // ── Switching to Current re-renders with only the LABOR_STD figures. ──
    win.setLaborStandardMode('current');
    t.eq(win.getLaborStandardMode(), 'current', 'mode is now current');
    block = haBlock();
    barHtml = win.document.getElementById('dashStdToggleBar').innerHTML;
    t.assert(block.indexOf(houseBudgetCurrent) !== -1, 'Current Standard mode shows the LABOR_STD-derived budget (150 rooms * 17.5% = 26.25h)');
    t.assert(!/32\.00/.test(block), 'the Unifocus figure (32.00h) is no longer shown once switched to Current');
    t.assert(/Current Standard/.test(barHtml), 'the toggle bar now shows Current Standard as active');

    // ── setLaborStandardMode re-renders the Labor page itself (not just
    // storing a value) — calling it while on the Labor page updates the
    // live toggle bar with no separate showPage call. The bar is rendered
    // by renderLaborDash, so its contents changing IS the proof. ──
    const barBefore = win.document.getElementById('dashStdToggleBar').innerHTML;
    win.setLaborStandardMode('unifocus');
    const barAfter = win.document.getElementById('dashStdToggleBar').innerHTML;
    t.assert(barBefore !== barAfter, 'switching re-renders the page immediately, without needing to navigate away and back');
    t.assert(/32\.00/.test(haBlock()), 'and the figures follow it back to Unifocus');

    // ── The preference survives a fresh page load (persisted, not just
    // in-memory for the current session). ──
    win.setLaborStandardMode('current');
    const stored = win.localStorage.getItem('hk_labor_std_mode');
    t.eq(stored, 'current', 'an explicit choice is written to localStorage under hk_labor_std_mode');

    // ── An invalid/garbage stored value falls back to the new default
    // (Unifocus) rather than erroring or falling back to the old default. ──
    win.localStorage.setItem('hk_labor_std_mode', 'garbage');
    t.eq(win.getLaborStandardMode(), 'unifocus', 'an unrecognized stored value falls back to Unifocus, the current default');
  }
};
