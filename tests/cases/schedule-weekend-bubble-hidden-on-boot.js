/* Found while verifying the new Weekend Rotation bubble live in a
   browser (2026-11-20), not from a report — caught before it ever
   reached Carlos. On a fresh load (default page is 'dashboard', nobody
   has navigated anywhere yet), the bubble/panel's own raw HTML has
   `display:none` followed by `display:flex` later in the SAME style
   attribute (needed so the panel is a flex column once actually shown)
   — the browser resolves that to flex, so with nothing ever calling
   renderSchedWeekendBubble() this early, the panel sat open over the
   Dashboard's Birthdays card on first load, before anyone ever touched
   Schedule.

   Root cause: showPage() only runs on an explicit navigation — the
   default page renders straight from static HTML, no showPage('dashboard')
   call ever fires. Labor Focus Sprint's own identical bubble/panel shape
   avoids this because the app's boot sequence already calls
   renderLaborDash() unconditionally (for unrelated reasons), which calls
   renderLaborSprint() at its own end. Fixed by adding an equally
   unconditional renderSchedWeekendBubble() call right next to it, rather
   than relying on renderSchedule() (expensive — builds the whole grid,
   runs every self-heal pass) just to hide a bubble.

   This test deliberately does NOT call showPage()/renderSchedule() at
   all before checking — that would mask the exact bug, like every other
   Weekend Rotation test already does for good reason (they're testing
   the feature once it's open, not the boot sequence). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Weekend Rotation bubble/panel stay hidden on a fresh load, before any page navigation ever happens',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    t.eq(win.currentPage, 'dashboard', 'sanity check: nobody navigated anywhere, still the default page');
    t.eq(win.document.getElementById('schedWeekendBubble').style.display, 'none',
      'the bubble never shows on the Dashboard with no explicit navigation');
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none',
      'nor does the panel — it must not sit open over the Dashboard on first load');
  },
};
