/* Carlos's real context, 2026-10-31: two Labor Distribution Reports go up
   every day — one in the afternoon for the SAME day, then another the
   next morning covering the PREVIOUS day. The old "always defaults to
   yesterday" picker only ever matched the morning upload; his real
   report (Manny's afternoon upload never got detected) is exactly the
   other case landing silently under the wrong date. _applySmartUploadDateDefault
   now picks between the two using the clock: before noon -> yesterday
   (the morning catch-up upload), noon or later -> today (the afternoon
   same-day upload) — same noon split the Good afternoon/evening greeting
   already uses. Runs once at page load AND every time showUploadModal()
   opens, so it's still right even if the tab was left open across noon. */
const { loadApp, fakeSession } = require('../_harness');

/* Pins the window's clock to a fixed local wall-clock time by overriding
   Date() with no arguments only — `new Date(...)` with explicit args
   (used all over the app for real date math) still behaves normally. */
function pinClock(win, isoLocal) {
  const fixed = new win.Date(isoLocal);
  const RealDate = win.Date;
  function FakeDate(...args) {
    if (args.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...args);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixed.getTime();
  win.Date = FakeDate;
}

module.exports = {
  name: 'Upload modal date picker: defaults to YESTERDAY before noon (the morning catch-up upload) and TODAY at/after noon (the afternoon same-day upload), re-applied every time the modal opens',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Before noon: defaults to yesterday ──
    pinClock(win, '2026-10-31T09:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', 'before noon, month defaults to yesterday\'s (October)');
    t.eq(win.document.getElementById('pickYear').value, '2026', 'before noon, year defaults to yesterday\'s');
    t.eq(win.document.getElementById('pickDay').value, '30', 'before noon on Oct 31, day defaults to 30 (yesterday) — the morning catch-up upload for the previous day');

    // ── At/after noon: defaults to today ──
    pinClock(win, '2026-10-31T14:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', 'at/after noon, month defaults to today\'s (October)');
    t.eq(win.document.getElementById('pickDay').value, '31', 'at/after noon on Oct 31, day defaults to 31 (today) — the afternoon same-day upload, Carlos\'s real Manny report');

    // ── Exactly noon counts as "at/after noon" (today), not before ──
    pinClock(win, '2026-10-31T12:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '31', 'exactly 12:00 PM defaults to today, not yesterday');

    // ── Month boundary: before noon on the 1st rolls back to the last day of the PREVIOUS month ──
    pinClock(win, '2026-11-01T08:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', 'before noon on Nov 1, month rolls back to October');
    t.eq(win.document.getElementById('pickDay').value, '31', 'before noon on Nov 1, day defaults to Oct 31 (yesterday), not day 0 or day 1');

    // ── showUploadModal() re-applies the default on every open, not just at page load ──
    pinClock(win, '2026-11-02T07:00:00'); // before noon
    win.showUploadModal();
    t.eq(win.document.getElementById('pickDay').value, '1', 'opening the upload modal before noon on Nov 2 re-defaults to Nov 1 (yesterday)');
    t.eq(win.document.getElementById('uploadOverlay').style.display, 'flex', 'and the modal itself still opens');

    pinClock(win, '2026-11-02T15:00:00'); // afternoon, same calendar day
    win.showUploadModal();
    t.eq(win.document.getElementById('pickMonth').value, '11', 'reopening the modal that same afternoon re-defaults to November');
    t.eq(win.document.getElementById('pickDay').value, '2', 'and to day 2 (today) — the default tracks the clock on every open, not just once at page load');
  },
};
