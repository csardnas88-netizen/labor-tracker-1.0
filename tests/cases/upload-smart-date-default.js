/* Carlos's real routine, spelled out fully 2026-10-31: the PM manager
   uploads a Labor Distribution Report every afternoon FOR THAT SAME day.
   The next morning, the AM manager reviews everything again and
   re-uploads — but that re-upload OVERWRITES THE SAME PREVIOUS DAY's
   report, with Paychex's corrected final figures. Both uploads of a
   given day's report target that SAME calendar date; only WHEN they
   happen differs.

   First fix picked yesterday-vs-today off the clock (before/after noon)
   — Carlos's follow-up killed that: if the morning review slips to 1pm,
   a clock-only rule would wrongly default to TODAY right when he's
   actually correcting YESTERDAY.

   Second fix checked whether yesterday has ANY saved snapshot
   (loadMonthData(...).days[ds] presence) — also wrong, once Carlos
   explained the full routine: in steady state yesterday ALWAYS already
   has one (that's yesterday's own afternoon upload), whether or not
   today's morning review has actually happened yet. That heuristic
   barely differed from "always default to today."

   What actually distinguishes "this morning's review still due" from
   "already done, this is the afternoon's upload for a NEW day" is
   whether YESTERDAY's snapshot was RE-SAVED TODAY specifically —
   mData.daysUpdatedAt already stamps that on every save
   (_dayUpdatedOnLocalDate). Not yet touched today → still due, default
   to yesterday, no matter the hour (Carlos's 1pm catch-up case). Already
   touched today → default to today, for the afternoon's new upload.
   Runs once at page load AND every time showUploadModal() opens, so it
   tracks real state live, not a stale guess from whenever the tab
   loaded. The same _dayUpdatedOnLocalDate signal also fixes the Labor
   Focus Sprint checklist's own "was the Labor Distribution Report
   uploaded" step — see labor-sprint-am-review-detection.js. */
const { loadApp, fakeSession } = require('../_harness');

function seedMonthDay(win, ds, updatedAtIso, extra) {
  const mk = ds.slice(0, 7);
  const key = 'hk_month_' + mk;
  let data = { days: {}, rooms: {} };
  try { const raw = win.localStorage.getItem(key); if (raw) data = JSON.parse(raw); } catch (e) {}
  data.days[ds] = Object.assign({ totalPaid: 100, totalEmps: 5 }, extra || {});
  data.daysUpdatedAt = data.daysUpdatedAt || {};
  data.daysUpdatedAt[ds] = updatedAtIso;
  win.localStorage.setItem(key, JSON.stringify(data));
}

/* Pins the window's clock to a fixed local wall-clock time. */
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
  name: "Upload modal date picker: defaults to YESTERDAY until yesterday's report has actually been RE-SAVED today (the AM review), not merely because yesterday already has some snapshot — Carlos's real 1pm catch-up scenario proves the clock alone can't decide this",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Oct 30's afternoon upload already happened (normal PM-manager
    // upload, timestamped Oct 30). By Oct 31 at 1pm, it STILL has not
    // been re-saved today — the AM review is overdue. Default must stay
    // on yesterday (Oct 30) even this late in the day, not flip to today
    // just because yesterday "has data" (it always does by now). ──
    seedMonthDay(win, '2026-10-30', '2026-10-30T18:00:00');
    pinClock(win, '2026-10-31T13:00:00'); // 1:00 PM
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', "Oct 30's report hasn't been re-saved today, so month defaults to October");
    t.eq(win.document.getElementById('pickYear').value, '2026', "year defaults to 2026");
    t.eq(win.document.getElementById('pickDay').value, '30', "even at 1pm, day defaults to 30 (yesterday) — Oct 30 already HAS a snapshot (yesterday's own upload), but it was never touched TODAY, so the AM review is still outstanding");

    // ── Now the AM manager actually does the review/re-upload, today. ──
    seedMonthDay(win, '2026-10-30', '2026-10-31T13:05:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '31', "now that Oct 30's report was re-saved TODAY, the default moves to 31 (today) for the afternoon's new upload");

    // ── Same logic holds first thing in the morning: if yesterday's
    // review hasn't happened yet, default is yesterday even at 7am. ──
    seedMonthDay(win, '2026-10-30', '2026-10-30T18:00:00'); // back to only the stale Oct 30 timestamp
    pinClock(win, '2026-10-31T07:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '30', "7am, Oct 30 hasn't been reviewed today yet — default is yesterday (30), not today");

    // ── But if the review happened unusually early, the default moves
    // to today just as early. ──
    seedMonthDay(win, '2026-10-30', '2026-10-31T06:30:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickDay').value, '31', "7am, but Oct 30 was already reviewed at 6:30am today — default is today (31)");

    // ── Month boundary: yesterday's report not yet reviewed today rolls
    // back to the last day of the PREVIOUS month correctly. ──
    seedMonthDay(win, '2026-10-31', '2026-10-31T18:00:00');
    pinClock(win, '2026-11-01T08:00:00');
    win._applySmartUploadDateDefault();
    t.eq(win.document.getElementById('pickMonth').value, '10', "Oct 31's report hasn't been reviewed today (Nov 1), so month rolls back to October");
    t.eq(win.document.getElementById('pickDay').value, '31', 'and day defaults to Oct 31 (yesterday), not day 0 or day 1');

    // ── showUploadModal() re-applies the default on every open, picking
    // up a review that happens between opens — not just once at page load. ──
    pinClock(win, '2026-11-02T10:00:00');
    win.showUploadModal();
    t.eq(win.document.getElementById('pickMonth').value, '11', "Nov 1's report hasn't been reviewed today (Nov 2), so the modal defaults to November");
    t.eq(win.document.getElementById('pickDay').value, '1', 'specifically Nov 1 (yesterday)');
    t.eq(win.document.getElementById('uploadOverlay').style.display, 'flex', 'and the modal itself still opens');

    seedMonthDay(win, '2026-11-01', '2026-11-02T09:00:00');
    win.showUploadModal();
    t.eq(win.document.getElementById('pickMonth').value, '11', 'reopening after Nov 1 is reviewed today re-defaults to November');
    t.eq(win.document.getElementById('pickDay').value, '2', "and to day 2 (today) — the default tracks real state on every open, not just once at page load");
  },
};
