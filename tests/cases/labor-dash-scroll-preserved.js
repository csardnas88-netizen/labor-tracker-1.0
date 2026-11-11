/* Carlos's real report, 2026-11-10, two symptoms, one root cause:
   1) Clicking "+ Note" on a Weekly Labor Pace day card jumped the page
      down near Labor Effectiveness.
   2) Sitting scrolled down at Break Exceptions for a few idle seconds
      snapped back up to the top on its own, with no click.

   renderDashDayAnalysis rebuilds Occupancy + Labor Effectiveness + Weekly
   Pace + Break Exceptions together as ONE el.innerHTML replacement.
   Anything that touches any of them (a WP note toggle, a Labor
   Effectiveness note blur) calls back up through renderLaborDash to here.
   Replacing a tall block's innerHTML doesn't move window.scrollY itself,
   but the new content is rarely the same height as the old, so whatever
   used to sit at that pixel position is no longer the same thing —
   that's symptom 1. Fixed by capturing scrollY right before the
   replacement and restoring it right after.

   Symptom 2's other half: _syncFromSheetsPull used to call
   renderLaborDash()/renderDashHub() UNCONDITIONALLY on every remote
   change, regardless of which page was even open — unlike every other
   page-specific render call right next to them, which already checks
   currentPage first. A schedule edit from another device, a training
   mark, anything at all, quietly rebuilt Labor's whole block in the
   background. Now scoped the same way as the rest. */
const { loadApp, fakeSession } = require('../_harness');

function seedWeek() {
  return {
    'hk_rooms_migrated_v2': '1',
    'hk_month_2026-08': {
      days: {
        '2026-08-01': { totalPaid: 30.11, byPosition: { 'Turndown Attendant': { paid: 30.11, ot1: 0 } } },
      },
      rooms: { '2026-07-31': 124, '2026-08-01': 154 },
    },
  };
}

module.exports = {
  name: 'renderDashDayAnalysis preserves window.scrollY across its innerHTML replacement, and a background sync pull only re-renders Labor/Dashboard when one of them is actually the open page',
  async run(t) {
    const seed = Object.assign(fakeSession(), seedWeek());
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    // ── Symptom 1: the scroll position is read before the replacement and
    // restored after, regardless of how much the new content's height
    // differs from the old. ──
    let scrollToCalls = [];
    win.scrollTo = function (x, y) { scrollToCalls.push([x, y]); };
    Object.defineProperty(win, 'scrollY', { value: 1234, configurable: true });

    win.dashSelectedDate = new Date(2026, 7, 1);
    win.renderDashDayAnalysis(win.loadMonthData('2026-08').days, 200, new Date(), week);

    t.assert(scrollToCalls.length > 0, 'renderDashDayAnalysis calls scrollTo after replacing the block\'s content');
    const lastCall = scrollToCalls[scrollToCalls.length - 1];
    t.eq(lastCall[0], 0, 'restores the horizontal position (0)');
    t.eq(lastCall[1], 1234, 'restores the exact vertical position that was recorded before the replacement, not the top of the page');

    // ── Symptom 2: a background sync pull that touches data unrelated to
    // Labor/Dashboard must not call renderLaborDash/renderDashHub at all
    // while some OTHER page is open. Each call carries a genuinely NEW
    // call-off record (different id/reason) so the merge actually reports
    // updated=true every time — otherwise a repeat of the same remote
    // content would correctly no-op on its own, masking whether the
    // currentPage guard is the thing actually doing the skipping. ──
    let callOffRow = null;
    const fetchImpl = (url) => {
      const u = String(url);
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(callOffRow ? [callOffRow] : []) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const { win: win2 } = await loadApp({ seed: fakeSession(), fetchImpl });
    await new Promise((r) => setTimeout(r, 60));

    let laborCalls = 0, dashCalls = 0;
    win2.renderLaborDash = function () { laborCalls++; };
    win2.renderDashHub = function () { dashCalls++; };

    callOffRow = { key: 'calloffs_data', value: JSON.stringify([{ id: 1, date: '2026-08-01', empName: 'Someone', pos: 'Turndown Attendant', reason: 'Sick (roster page)' }]) };
    win2.currentPage = 'roster';
    win2._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.eq(laborCalls, 0, 'renderLaborDash is NOT called while an unrelated page (Roster) is open, even though new data genuinely arrived');
    t.eq(dashCalls, 0, 'renderDashHub is NOT called either');

    callOffRow = { key: 'calloffs_data', value: JSON.stringify([{ id: 1, date: '2026-08-01', empName: 'Someone', pos: 'Turndown Attendant', reason: 'Sick (labor page)' }]) };
    win2.currentPage = 'labor';
    win2._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.assert(laborCalls >= 1, 'renderLaborDash IS called once Labor is the open page and new data actually arrived');

    callOffRow = { key: 'calloffs_data', value: JSON.stringify([{ id: 1, date: '2026-08-01', empName: 'Someone', pos: 'Turndown Attendant', reason: 'Sick (dashboard page)' }]) };
    win2.currentPage = 'dashboard';
    win2._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.assert(dashCalls >= 1, 'renderDashHub IS called once the Dashboard is the open page');
  },
};
