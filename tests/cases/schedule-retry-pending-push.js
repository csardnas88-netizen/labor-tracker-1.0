/* Carlos's real report, 2026-11-13: a Schedule edit made on his iPhone
   never reached his laptop. dlSaveSchedule saves locally FIRST (never
   lost) then asynchronously pulls+merges+pushes to Supabase — if the
   phone's tab gets backgrounded (locked screen, switched apps) before
   that chain settles, iOS can suspend or discard it mid-flight. Nothing
   used to retry it: _onResumeForeground only pulled, and the existing
   30s failure-retry loop only fires once a failure is actually recorded,
   which never happens if the JS simply never got to run.

   dlSaveSchedule now stamps hk_dl_schedule_savedat synchronously (before
   any async work) and hk_dl_schedule_pushedat only once a push attempt
   actually completes. _schedRetryPendingPush compares the two on the
   next resume/load and retries the push if the save was never actually
   confirmed — same shadow-timestamp idea as _monthPushShadow, applied to
   this one record. */
const { loadApp, fakeSession } = require('../_harness');

function makeFetchImpl(pushedKeys) {
  return (url, options) => {
    options = options || {};
    const method = (options.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.indexOf('/auth/v1/') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
    }
    if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
      const body = JSON.parse(options.body);
      pushedKeys.push(body.key);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    }
    // GET (the remote pull inside dlSaveSchedule, and the app's own load-time pull) — nothing remote yet.
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Schedule: a save whose push never got confirmed is retried on the next resume/load, but a confirmed one is left alone",
  async run(t) {
    const pushedKeys = [];
    const seed = Object.assign(fakeSession(), {
      hk_dl_schedule: JSON.stringify({ days: { '2026-11-10': { gra: [['Maritza', '1']] } } }),
    });
    const { win } = await loadApp({ seed, fetchImpl: makeFetchImpl(pushedKeys) });
    await new Promise((r) => setTimeout(r, 100)); // let load-time pulls settle

    // ── Simulate the real bug: a local save happened (savedat stamped)
    // but its push never landed (pushedat is stale/missing) — exactly
    // what a backgrounded-tab-killed-the-fetch looks like. ──
    win.localStorage.setItem('hk_dl_schedule_savedat', String(Date.now()));
    win.localStorage.setItem('hk_dl_schedule_pushedat', String(Date.now() - 60000));
    pushedKeys.length = 0;

    win._schedRetryPendingPush();
    await new Promise((r) => setTimeout(r, 80));
    t.assert(pushedKeys.indexOf('dl_schedule') !== -1, 'a stale (unconfirmed) save is retried and actually pushed');
    const pushedAtAfterRetry = Number(win.localStorage.getItem('hk_dl_schedule_pushedat'));
    t.assert(pushedAtAfterRetry > Number(win.localStorage.getItem('hk_dl_schedule_savedat')) - 1, 'pushedat is advanced once the retry actually lands');

    // ── A save that WAS already confirmed pushed must not be re-pushed
    // on every resume — that would mean a network write on every single
    // foreground return, not just when something is actually stuck. ──
    pushedKeys.length = 0;
    const now = Date.now();
    win.localStorage.setItem('hk_dl_schedule_savedat', String(now));
    win.localStorage.setItem('hk_dl_schedule_pushedat', String(now + 5)); // confirmed AFTER the save
    win._schedRetryPendingPush();
    await new Promise((r) => setTimeout(r, 80));
    t.eq(pushedKeys.length, 0, 'an already-confirmed save triggers no extra push');

    // ── dlSaveSchedule itself: savedat is stamped synchronously, BEFORE
    // the async push even starts — so a tab killed immediately after the
    // edit still leaves the correct "something is pending" signal behind. ──
    pushedKeys.length = 0;
    const beforeSavedAt = Number(win.localStorage.getItem('hk_dl_schedule_savedat') || 0);
    win.dlSaveSchedule({ days: { '2026-11-11': { gra: [['Maritza', '1']] } } });
    const savedAtRightAfterCall = Number(win.localStorage.getItem('hk_dl_schedule_savedat') || 0);
    t.assert(savedAtRightAfterCall > beforeSavedAt, 'savedat is already updated synchronously, before the async push has had any chance to run');

    await new Promise((r) => setTimeout(r, 80));
    t.assert(pushedKeys.indexOf('dl_schedule') !== -1, 'and the push itself does go out, confirming pushedat normally catches up right behind it');
  }
};
