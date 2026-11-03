/* Carlos's real context, 2026-10-31: two Labor Distribution Reports go up
   every day — one in the afternoon for the SAME day, then another the
   next morning covering the PREVIOUS day. The old "always defaults to
   yesterday" picker only ever matched the morning upload; his real
   report (Manny's afternoon upload never got detected) is exactly the
   other case landing silently under the wrong date.

   First fix picked yesterday-vs-today off the clock (before/after noon).
   Carlos's own follow-up killed that: if HE is the one running late and
   uploads yesterday's catch-up report at 1pm because he didn't get to it
   that morning, a clock-only rule would wrongly default to TODAY right
   when he actually needs YESTERDAY. _applySmartUploadDateDefault now
   checks real upload state instead: if yesterday has no saved snapshot
   yet (loadMonthData(...).days[ds], the same presence check
   laborSprintAutoChecks already uses for its own "was it uploaded"
   signal), default to yesterday — it's overdue, no matter the time. Only
   once yesterday is actually covered does the default move to today.
   Runs once at page load AND every time showUploadModal() opens, so it
   tracks real state live, not a stale guess from whenever the tab
   loaded. */
const { loadApp, fakeSession } = require('../_harness');

function seedMonthDay(win, ds, extra) {
  const mk = ds.slice(0, 7);
  const key = 'hk_month_' + mk;
  let data = { days: {}, rooms: {} };
  try { const raw = win.localStorage.getItem(key); if (raw) data = JSON.parse(raw); } catch (e) {}
  data.days[ds] = Object.assign({ totalPaid: 100, totalEmps: 5 }, extra || {});
  win.localStorage.setItem(key, JSON.stringify(data));
}

/* Pins the window's clock to a fixed local wall-clock time, to prove the
   default no longer depends on time of day at all — only on whether
   yesterday's data exists. */
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
  name: "Upload modal date picker: defaults to YESTERDAY whenever yesterday has no saved report yet (no matter the time of day — Carlos's real 1pm catch-up scenario), and to TODAY only once yesterday is actually covered",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Yesterday has no report yet: defaults to yesterday, even in the
    // afternoon — this is exactly Carlos's own follow-up scenario, the
    // morning catch-up slipping to 1pm. ──
    pinClock(win, '2026-10-31T13:00:00'); // 1:00 PM
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', "yesterday's data is missing, so month defaults to October");
    t.eq(win.document.getElementById('pickYear').value, '2026', "yesterday's data is missing, so year defaults to 2026");
    t.eq(win.document.getElementById('pickDay').value, '30', "even at 1pm, day defaults to 30 (yesterday) because Oct 30 has no saved report yet — the clock never overrides missing data");

    // ── Once yesterday's report is actually uploaded, the SAME afternoon,
    // the default moves to today — the normal same-day upload. ──
    seedMonthDay(win, '2026-10-30');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '31', "now that Oct 30 has a saved report, the default moves to 31 (today) for the same-day afternoon upload");

    // ── Also true first thing in the morning: if yesterday is ALREADY
    // covered (e.g. uploaded unusually early), the morning default is
    // today too — this was never time-dependent to begin with, now
    // proven for the morning side as well. ──
    pinClock(win, '2026-10-31T07:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '31', "7am, but Oct 30 already has data — default is still today (31), not yesterday");

    // ── Month boundary: yesterday missing rolls back to the last day of
    // the PREVIOUS month correctly. ──
    pinClock(win, '2026-11-01T08:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', 'Oct 31 has no report yet, so month rolls back to October');
    t.eq(win.document.getElementById('pickDay').value, '31', 'and day defaults to Oct 31 (yesterday), not day 0 or day 1');

    // ── showUploadModal() re-applies the default on every open, picking
    // up newly-saved data between opens — not just once at page load. ──
    pinClock(win, '2026-11-02T10:00:00');
    win.showUploadModal();
    t.eq(win.document.getElementById('pickMonth').value, '11', "Nov 1 (yesterday, relative to Nov 2) still has no saved report, so the modal defaults to November");
    t.eq(win.document.getElementById('pickDay').value, '1', 'specifically Nov 1 (yesterday)');
    t.eq(win.document.getElementById('uploadOverlay').style.display, 'flex', 'and the modal itself still opens');

    seedMonthDay(win, '2026-11-01');
    win.showUploadModal();
    t.eq(win.document.getElementById('pickMonth').value, '11', 'reopening after Nov 1 gets a saved report re-defaults to November');
    t.eq(win.document.getElementById('pickDay').value, '2', "and to day 2 (today) — the default tracks real state on every open, not just once at page load");
  },
};
