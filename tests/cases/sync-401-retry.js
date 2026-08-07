/* The narrow companion to sync-refresh-storm.js: the access token going
   stale in the window between supaPut's own _authExpired() check and the
   request actually reaching Supabase.

   That window is real on a slow connection — exactly the work-computer
   conditions behind Carlos's repeating banner on 2026-08-06 — and it used
   to surface as the sticky red "Couldn't save to the cloud" banner for
   something a single retry resolves. Worse, it then set _syncFailCount > 0,
   which armed the automatic full re-sync, which fired another burst. So a
   momentary 401 didn't just show a spurious banner, it kicked off the
   whole retry loop. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A put that comes back 401 renews once and retries, instead of going straight to the failure banner",
  async run(t) {
    let putAttempts = 0;
    let authCalls = 0;
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      if (u.indexOf('/auth/v1/token') !== -1) {
        authCalls++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 }) });
      }
      if (u.indexOf('/rest/v1/labor_data') !== -1 && (options.method || 'GET').toUpperCase() === 'POST') {
        putAttempts++;
        // First attempt: the token still looked unexpired locally, but the
        // server has already rejected it. The retry succeeds.
        if (putAttempts === 1) return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    const seed = Object.assign(fakeSession(), { 'hk_sa_ref': 'ref0' });
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));
    putAttempts = 0; authCalls = 0;
    win.markSyncSuccess(); // clear anything raised during load

    await win.supaPut('hk_labor_model', { probe: 1 });
    await new Promise((r) => setTimeout(r, 40));

    t.eq(putAttempts, 2, 'the 401 is retried once rather than reported immediately');
    t.eq(authCalls, 1, 'the retry renews the session first, exactly once');
    t.eq(win._syncFailCount, 0, 'a 401 the retry resolved must NOT arm the automatic full re-sync');
    const banner = win.document.getElementById('syncFailBanner');
    t.assert(!banner || banner.style.display === 'none', 'and no failure banner is shown for it');
  }
};
