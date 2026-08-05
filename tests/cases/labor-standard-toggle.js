/* Carlos asked for a way to see the Labor page "cleanly" under just one
   standard at a time, instead of the old/Unifocus figures sitting side by
   side — closer to how the page looked before Unifocus existed, but
   switchable. Proof-of-concept scope: the toggle only drives the By
   Position table for now (not Day Summary's aggregate budget or Weekly
   Pace) — see the comment above the toggle's render call in
   renderDashDayAnalysis. Persisted in localStorage (hk_labor_std_mode) so
   it survives navigation and reload; defaults to 'current' so nothing
   changes for anyone who's never touched it. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor standard toggle: By Position shows one standard at a time, switchable, persisted, defaulting to Current",
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

    // ── Defaults to 'current' with nothing set — an existing user sees no
    // change in behavior until they touch the toggle. ──
    t.eq(win.getLaborStandardMode(), 'current', "defaults to 'current' with no stored preference");

    win.showPage('labor');
    let html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const houseBudgetCurrent = (150 * 0.175).toFixed(2); // House Attendant is 17.5% of rooms (150, the night before) under LABOR_STD
    t.assert(html.indexOf(houseBudgetCurrent) !== -1, 'Current Standard mode shows the LABOR_STD-derived budget (150 rooms * 17.5% = 26.25h)');
    t.assert(!/32\.00/.test(html), "the Unifocus figure (32.00h) is NOT shown in Current mode — one standard at a time, not both");
    t.assert(/Current Standard/.test(html), 'the active toggle button is labeled "Current Standard"');

    // ── Switching to Unifocus re-renders with only the Unifocus figures. ──
    win.setLaborStandardMode('unifocus');
    t.eq(win.getLaborStandardMode(), 'unifocus', 'mode is now unifocus');
    html = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(/32\.00/.test(html), 'Unifocus mode shows the Unifocus-derived budget (32.00h) for House Attendant');
    t.assert(html.indexOf(houseBudgetCurrent) === -1 || houseBudgetCurrent === '32.00', "the old LABOR_STD figure is no longer shown once switched to Unifocus mode");

    // ── setLaborStandardMode re-renders the Labor page itself (not just
    // returning a value) — calling it while on the Labor page should be
    // enough to update the visible table without a separate showPage call. ──
    win.setLaborStandardMode('current');
    html = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(!/32\.00/.test(html), 'switching back to Current re-renders immediately, without needing to navigate away and back');

    // ── The preference survives a fresh page load (persisted, not just
    // in-memory for the current session). ──
    win.setLaborStandardMode('unifocus');
    const stored = win.localStorage.getItem('hk_labor_std_mode');
    t.eq(stored, 'unifocus', 'the preference is written to localStorage under hk_labor_std_mode');

    // ── An invalid/garbage stored value falls back to 'current' rather
    // than erroring or defaulting to Unifocus. ──
    win.localStorage.setItem('hk_labor_std_mode', 'garbage');
    t.eq(win.getLaborStandardMode(), 'current', 'an unrecognized stored value falls back to Current, not Unifocus');
  }
};
