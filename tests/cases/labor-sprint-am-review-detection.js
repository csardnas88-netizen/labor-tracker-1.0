/* Carlos's real report, 2026-10-31: "Manny subió el labor distribution
   hoy y el checklist no detectó automáticamente que lo había subido."
   Investigated against real Supabase data: Manny HAD genuinely done his
   job — the AM manager's actual daily routine (per Carlos's full
   explanation) is reviewing and re-uploading the PREVIOUS day's Labor
   Distribution Report with Paychex's corrected final figures, not
   uploading a brand-new one for today (today's own report only exists
   once the PM manager uploads it later that afternoon).

   laborSprintAutoChecks(ds)'s `paychex` signal only ever checked
   mData.days[ds] — TODAY's own snapshot — which Manny's real, correct
   action (re-saving YESTERDAY's) can never satisfy. Now it also
   recognizes that re-save via _dayUpdatedOnLocalDate(prevDateStr(ds),ds):
   true the moment yesterday's snapshot carries a daysUpdatedAt stamp
   from today, same signal _applySmartUploadDateDefault uses for the
   upload picker's own default (see upload-smart-date-default.js). */
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

module.exports = {
  name: "laborSprintAutoChecks: the 'upload Labor Distribution Report' step auto-checks when the AM manager re-saves YESTERDAY's report today (Manny's real case), not just when TODAY has its own fresh snapshot",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Manny's real case: Oct 29's report (originally uploaded Oct 29
    // afternoon) gets re-saved on Oct 30 morning, Paychex's corrected
    // figures. Oct 30 itself has no snapshot of its own yet — that only
    // comes later, from the PM manager's own afternoon upload. ──
    seedMonthDay(win, '2026-10-29', '2026-10-29T22:00:00'); // original PM-manager upload
    seedMonthDay(win, '2026-10-29', '2026-10-30T15:07:00'); // Manny's real AM re-save, same day's data
    let checks = win.laborSprintAutoChecks('2026-10-30');
    t.eq(checks.paychex, true, "Oct 30's checklist recognizes Manny's re-save of Oct 29's report as the Labor Distribution step being done — this is the real bug fix");

    // ── Before Manny's re-save (only the stale Oct 29 original upload
    // exists, never touched on Oct 30), the step is correctly still
    // outstanding. ──
    seedMonthDay(win, '2026-10-29', '2026-10-29T22:00:00'); // reset to only the stale timestamp
    checks = win.laborSprintAutoChecks('2026-10-30');
    t.eq(checks.paychex, false, "Oct 29's report exists but was never touched on Oct 30 — the AM review is still outstanding, correctly unchecked");

    // ── The original path still works too: if TODAY already has its own
    // fresh snapshot (the PM manager's afternoon upload already
    // happened), the step is done regardless of yesterday. ──
    seedMonthDay(win, '2026-10-30', '2026-10-30T19:00:00');
    checks = win.laborSprintAutoChecks('2026-10-30');
    t.eq(checks.paychex, true, "today's own snapshot existing is still sufficient on its own, same as before this fix");

    // ── Neither condition met: correctly still unchecked. ──
    win.localStorage.removeItem('hk_month_2026-10');
    checks = win.laborSprintAutoChecks('2026-10-30');
    t.eq(checks.paychex, false, 'with no data at all for the month, the step is correctly unchecked');
  },
};
