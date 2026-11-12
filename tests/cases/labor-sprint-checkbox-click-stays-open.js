/* Carlos's real report, 2026-11-12: checking a Labor Focus Sprint item
   closed the panel immediately — he had to re-tap the bubble before he
   could check the NEXT item, tedious on a list of a dozen boxes.

   The existing auto-collapse test (labor-sprint-panel-auto-collapse.js)
   clicked a plain, handler-less div inside the panel and saw it stay
   open — which is true, but doesn't reproduce the real bug: a REAL
   checklist row's own onclick (laborSprintToggle) re-renders the panel
   body SYNCHRONOUSLY, replacing that row with a new DOM node before the
   click finishes bubbling up to document. The old bubble-phase listener
   read panel.contains(e.target) AFTER that replacement, so e.target was
   already detached — every single checkbox tap looked like an outside
   click. This test clicks an ACTUAL checklist row (p1, a manual item)
   to catch exactly that. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Labor Focus Sprint: clicking a real checklist row (which re-renders itself) checks the item without closing the panel',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    win.showPage('labor');

    win.localStorage.setItem('hk_ls_panel_open', '1');
    win.renderLaborSprint();
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'flex', 'panel starts open');

    const row = win.document.querySelector('[onclick*="\'p1\'"]');
    t.assert(row, 'a real checklist row (p1) is found in the rendered panel');
    row.click();

    const ds = win.dateStr(new Date());
    const state = win.laborSprintLoad(ds);
    t.eq(state.p1, true, 'the click actually checked the item');
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'flex', 'the panel is still open after checking a real row, not collapsed');
    t.eq(win.localStorage.getItem('hk_ls_panel_open'), '1', 'the open flag was never flipped to closed');

    // ── Unchecking it (a second click on the same, now-different, row
    // node) must behave the same way — not just the first click. ──
    const row2 = win.document.querySelector('[onclick*="\'p1\'"]');
    row2.click();
    const state2 = win.laborSprintLoad(ds);
    t.eq(state2.p1, false, 'a second click unchecks it');
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'flex', 'still open after the second click too');
  },
};
