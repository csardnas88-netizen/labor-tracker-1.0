/* Carlos's real ask, 2026-11-20: Weekend Rotation used to replace the
   WHOLE Schedule page, costing him his scroll position (he's often mid-
   edit on a specific crew, e.g. Supervisors, when he wants to check it)
   and forcing him back to the top on "Back to Schedule". Rebuilt as a
   floating bubble + panel, same pattern and same auto-collapse behavior
   as Labor Focus Sprint's own bubble (see
   labor-sprint-panel-auto-collapse.js) — a click anywhere outside the
   panel collapses it back to just the bubble, leaving whatever he was
   scrolled to on the Schedule page completely untouched; a click inside
   the panel, or on the bubble itself, is left alone. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Weekend Rotation bubble/panel auto-collapses on a click outside it, hides entirely off the Schedule page, and never disturbs the underlying page',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // A real week loaded for "today", so the normal Schedule grid
    // actually renders underneath instead of the "no schedule loaded
    // yet" placeholder — the point of this test is that the panel floats
    // OVER that grid, which needs something there to float over.
    const weekStart = win.getHotelWeekStart(new Date());
    const dates = [];
    for (let i = 0; i < 7; i++) { const d = new Date(weekStart); d.setDate(d.getDate() + i); dates.push(win.dateStr(d)); }
    const SCH = { days: {} };
    dates.forEach((ds) => { SCH.days[ds] = { gra: [['Marta', '1']] }; });
    win.dlSaveSchedule(SCH);

    win.showPage('schedule');

    const panel = win.document.getElementById('schedWeekendPanel');
    const bubble = win.document.getElementById('schedWeekendBubble');
    t.eq(bubble.style.display, 'flex', 'the bubble shows on the Schedule page');
    t.eq(panel.style.display, 'none', 'closed by default');

    // ── Open it (same action the bubble's own click does). ──
    win.localStorage.setItem('hk_sched_wknd_panel_open', '1');
    win.renderSchedWeekendBubble();
    t.eq(panel.style.display, 'flex', 'panel is open');

    // ── A click INSIDE the panel leaves it open. ──
    const innerEl = panel.querySelector('div') || panel;
    innerEl.click();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'still open after a click inside the panel itself');
    t.eq(win.localStorage.getItem('hk_sched_wknd_panel_open'), '1', 'the open flag is untouched');

    // ── A click somewhere else entirely on the page auto-collapses it —
    // and the page underneath (the normal Schedule week grid) was never
    // replaced in the first place, so there's nothing to "return" to. ──
    t.assert(/Previous week|Next week/.test(win.document.getElementById('scheduleContent').innerHTML),
      'the normal Schedule week grid is showing underneath the whole time, never replaced by the panel');
    win.document.body.click();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none', 'collapses to the bubble on a click outside the panel');
    t.eq(win.localStorage.getItem('hk_sched_wknd_panel_open'), '0', 'the open flag is recorded as closed, same as clicking the panel\'s own X');

    // ── Re-opened, a click ON THE BUBBLE goes through its own toggle
    // exactly once — not fought over by the auto-collapse listener. ──
    win.localStorage.setItem('hk_sched_wknd_panel_open', '1');
    win.renderSchedWeekendBubble();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'open again for this part of the test');
    win.document.getElementById('schedWeekendBubble').click();
    t.eq(win.localStorage.getItem('hk_sched_wknd_panel_open'), '0', 'the bubble\'s own click closed it exactly once');

    // ── Navigating to a different page hides the bubble/panel entirely,
    // same safety Labor Sprint's bubble already has — a background
    // render of the Schedule page (a sync pull) must never pop this up
    // over whatever page the manager actually has open. ──
    win.localStorage.setItem('hk_sched_wknd_panel_open', '1');
    win.renderSchedWeekendBubble();
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'open once more');
    win.showPage('labor');
    t.eq(win.document.getElementById('schedWeekendBubble').style.display, 'none', 'the bubble hides immediately on navigating away');
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'none', 'and so does the panel, even though the open flag itself was never cleared');

    // ── Coming back to Schedule shows the bubble again. The open flag
    // itself was never cleared by navigating away (only hidden), same
    // "local display preference" Labor Sprint's own panel already
    // behaves like — so the panel picks back up open, exactly as he
    // left it, rather than forcing a re-tap on the bubble for no reason. ──
    win.showPage('schedule');
    t.eq(win.document.getElementById('schedWeekendBubble').style.display, 'flex', 'the bubble is back');
    t.eq(win.document.getElementById('schedWeekendPanel').style.display, 'flex', 'and the panel reopens, matching the preference as he left it');
  },
};
