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
   default (Unifocus), not the old one. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor standard toggle: By Position shows one standard at a time, switchable, persisted, defaulting to Unifocus",
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

    // ── Defaults to 'unifocus' with nothing set. ──
    t.eq(win.getLaborStandardMode(), 'unifocus', "defaults to 'unifocus' with no stored preference");

    win.showPage('labor');
    const houseBudgetCurrent = (150 * 0.175).toFixed(2); // House Attendant is 17.5% of rooms (150, the night before) under LABOR_STD
    let dayHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    let barHtml = win.document.getElementById('dashStdToggleBar').innerHTML;
    t.assert(/32\.00/.test(dayHtml), 'default (Unifocus) mode shows the Unifocus-derived budget (32.00h) for House Attendant');
    t.assert(dayHtml.indexOf(houseBudgetCurrent) === -1, 'the LABOR_STD figure (26.25h) is NOT shown by default — one standard at a time, not both');
    t.assert(/Unifocus/.test(barHtml), 'the toggle bar at the top of the page shows Unifocus as the active button');

    // ── The toggle itself lives at the top of the page (dashStdToggleBar),
    // not inside the By Position card header anymore. ──
    const byPosIdx = dayHtml.indexOf('By Position');
    t.assert(byPosIdx !== -1, 'By Position table still renders');
    t.assert(!/<button/.test(dayHtml.slice(byPosIdx, byPosIdx + 400)), 'the By Position card header no longer embeds the toggle buttons itself');

    // ── Switching to Current re-renders with only the LABOR_STD figures. ──
    win.setLaborStandardMode('current');
    t.eq(win.getLaborStandardMode(), 'current', 'mode is now current');
    dayHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    barHtml = win.document.getElementById('dashStdToggleBar').innerHTML;
    t.assert(dayHtml.indexOf(houseBudgetCurrent) !== -1, 'Current Standard mode shows the LABOR_STD-derived budget (150 rooms * 17.5% = 26.25h)');
    t.assert(!/32\.00/.test(dayHtml), 'the Unifocus figure (32.00h) is no longer shown once switched to Current');
    t.assert(/Current Standard/.test(barHtml), 'the toggle bar now shows Current Standard as active');

    // ── setLaborStandardMode re-renders the Labor page itself (not just
    // returning a value) — calling it while on the Labor page should be
    // enough to update the visible table AND the top toggle bar without a
    // separate showPage call. ──
    win.setLaborStandardMode('unifocus');
    dayHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(/32\.00/.test(dayHtml), 'switching back to Unifocus re-renders immediately, without needing to navigate away and back');

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
