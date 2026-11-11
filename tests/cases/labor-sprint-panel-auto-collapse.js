/* Carlos's real report, 2026-11-10: the open Labor Focus Sprint panel is
   a floating overlay on top of the Labor page, and it blocked the hours
   he was trying to read/comment on underneath it. His preferred fix
   (asked for directly, over a narrower or draggable panel): tapping
   anywhere ELSE on the page auto-collapses it back to the bubble, same
   end state the explicit X already produces, re-opened with one tap on
   the bubble. A click genuinely inside the panel, or on the bubble
   itself (which already owns its own toggle), must not be affected. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Labor Focus Sprint panel auto-collapses to the bubble on a click anywhere outside it, leaving clicks inside the panel (or on the bubble) alone',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    win.showPage('labor');

    const panel = win.document.getElementById('laborSprintPanel');
    const bubble = win.document.getElementById('laborSprintBubble');

    // ── Open the panel (same action the bubble's own click does). ──
    win.localStorage.setItem('hk_ls_panel_open', '1');
    win.renderLaborSprint();
    t.eq(panel.style.display, 'flex', 'panel is open');

    // ── A click INSIDE the panel (e.g. a checklist row) leaves it open. ──
    const innerEl = panel.querySelector('div') || panel;
    innerEl.click();
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'flex', 'still open after a click inside the panel itself');
    t.eq(win.localStorage.getItem('hk_ls_panel_open'), '1', 'the open flag is untouched');

    // ── A click somewhere else entirely on the page auto-collapses it. ──
    win.document.body.click();
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'none', 'collapses to the bubble on a click outside the panel');
    t.eq(win.localStorage.getItem('hk_ls_panel_open'), '0', 'the open flag is recorded as closed, same as the explicit X');

    // ── Re-opened, a click ON THE BUBBLE goes through the bubble's own
    // toggle exactly once — not fought over by the auto-collapse listener
    // (which must recognize the bubble and defer to it). ──
    win.localStorage.setItem('hk_ls_panel_open', '1');
    win.renderLaborSprint();
    t.eq(win.document.getElementById('laborSprintPanel').style.display, 'flex', 'open again for this part of the test');
    win.document.getElementById('laborSprintBubble').click();
    t.eq(win.localStorage.getItem('hk_ls_panel_open'), '0', 'the bubble\'s own click closed it exactly once (not left open by a fight between two handlers)');

    // ── Clicking outside while it's ALREADY closed is a harmless no-op. ──
    win.document.body.click();
    t.eq(win.localStorage.getItem('hk_ls_panel_open'), '0', 'still closed, no error');
  },
};
