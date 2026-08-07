/* Carlos reported the red "Couldn't save to the cloud … Retry now" banner
   coming back every few minutes on 2026-08-06, worst on his work
   computer. This pins the mechanism behind it.

   The failure loop, before the fix:

   1. Any single sync failure sets _syncFailCount > 0, which arms a 30s
      interval that calls forceSyncToSupabase().
   2. forceSyncToSupabase() walks ALL of localStorage and fires one
      supaPut per month, per OCC month, per project, per call-off, plus a
      dozen singletons — all in parallel, with no cap.
   3. Every one of those supaPut calls independently checks _authExpired()
      and, if the token is due for renewal, calls _authRefresh().
   4. _authRefresh() had no in-flight guard, so N parallel puts meant N
      parallel POSTs to /auth/v1/token, every one sending the SAME refresh
      token.

   Supabase rotates refresh tokens: the first exchange returns a new one
   and retires the old, so the rest of the burst is spending a token that
   is already being consumed. Whichever response lands last wins
   localStorage, so the app can also end up storing a refresh token that
   was already superseded — after which every later renewal fails too, and
   the banner stops being transient. A slow/proxied corporate network
   (the work computer) widens every one of those windows, which is exactly
   where Carlos saw it most.

   This test drives the real burst — a fixture with several months, OCC
   months, projects and call-offs, and a token already due for renewal —
   and asserts on how many times the auth endpoint is actually hit. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A full re-sync burst renews the session once, not once per key (the refresh storm behind Carlos's repeating sync banner)",
  async run(t) {
    let authCalls = 0;
    let putCalls = 0;
    let maxInFlightPuts = 0;
    let inFlightPuts = 0;
    const pending = [];

    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      if (u.indexOf('/auth/v1/token') !== -1) {
        authCalls++;
        // Rotate the refresh token on every exchange, exactly as Supabase
        // does — so a storm is observable as a changing value, not just a
        // call count.
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ access_token: 'tok' + authCalls, refresh_token: 'ref' + authCalls, expires_in: 3600 })
        });
      }
      if (u.indexOf('/rest/v1/labor_data') !== -1 && (options.method || 'GET').toUpperCase() === 'POST') {
        putCalls++;
        inFlightPuts++;
        if (inFlightPuts > maxInFlightPuts) maxInFlightPuts = inFlightPuts;
        // Hold the response open briefly so overlapping requests are
        // genuinely concurrent rather than serialised by the microtask queue.
        return new Promise((resolve) => {
          pending.push(() => {
            inFlightPuts--;
            resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
          });
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    // Enough distinct keys that the burst is realistic: forceSyncToSupabase
    // pushes one request per month, per OCC month, per project and per
    // call-off (plus each project/call-off's own row), not one per app.
    const seed = Object.assign(fakeSession(), {
      // fakeSession() only seeds an access token + expiry. A refresh token
      // has to be present too, or _authRefresh() bails before it ever
      // reaches the network and every put short-circuits to "session
      // expired" — which is a different failure than the one under test.
      'hk_sa_ref': 'ref0',
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-06': { days: {}, rooms: {} },
      'hk_month_2026-07': { days: {}, rooms: {} },
      'hk_month_2026-08': { days: {}, rooms: {} },
      'hk_r106_2026-06': {},
      'hk_r106_2026-07': {},
      'hk_r106_2026-08': {},
      'projects_data': [{ id: 'p1', name: 'Deep clean' }, { id: 'p2', name: 'Windows' }],
      'calloffs_data': [{ id: 'c1', name: 'Ana' }, { id: 'c2', name: 'Beto' }],
      'hk_roster_overrides': {},
      'hk_trainings': {},
      'hk_labor_model': {}
    });
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60)); // let load-time sync settle
    pending.splice(0).forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 20));

    // Put the stored session right at the renewal boundary, so every
    // supaPut in the burst below sees _authExpired() === true — the exact
    // state Carlos's long-open work-computer tab would be in.
    authCalls = 0;
    putCalls = 0;
    win.localStorage.setItem('hk_sa_exp', String(Date.now() + 1000)); // inside the 60s renewal margin

    win.forceSyncToSupabase();
    await new Promise((r) => setTimeout(r, 120));
    pending.splice(0).forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 60));

    t.assert(putCalls > 5, 'sanity: the fixture really does produce a multi-key burst (got ' + putCalls + ' puts)');

    // ── The actual defect. One expired session should be renewed ONCE for
    // the whole burst; every extra call is another request spending an
    // already-rotating refresh token. ──
    t.eq(authCalls, 1, 'the whole burst renews the session exactly once, no matter how many keys it pushes (got ' + authCalls + ' auth calls for ' + putCalls + ' puts)');

    // ── And the refresh token the app keeps must be the one the server
    // last issued. With a storm, the surviving value depends on which
    // response happened to land last, which is how a device ends up
    // permanently unable to renew. ──
    t.eq(win.localStorage.getItem('hk_sa_ref'), 'ref1', 'the stored refresh token is the one from that single renewal, not whichever racing response finished last');

    // ── The burst must also not open an unbounded number of concurrent
    // connections. A browser will queue them, a corporate proxy may drop
    // them, and either way failures here re-arm the 30s retry that starts
    // the loop over. ──
    t.assert(maxInFlightPuts <= 6, 'the burst is throttled to a handful of concurrent uploads rather than firing every key at once (peaked at ' + maxInFlightPuts + ')');

    // ── The retry itself has to back off. A flat 30s retry with no
    // in-flight guard was the other half of the loop: a slow full re-sync
    // was still running when the next one started, so attempts stacked and
    // each pile-up made the next round slower. ──
    t.assert(win.SYNC_RETRY_BASE_MS >= 30000, 'the first automatic retry still waits at least 30s');
    t.assert(win.SYNC_RETRY_MAX_MS >= win.SYNC_RETRY_BASE_MS * 4, 'the delay grows several times over before it caps, giving a flaky connection room to recover');

    // A successful sync clears the backoff, so the next incident starts at
    // 30s rather than inheriting a long delay from this one.
    win.markSyncFailure('Test');
    win._syncRetryAttempt = 3;
    win.markSyncSuccess();
    t.eq(win._syncRetryAttempt, 0, 'recovering resets the backoff for the next incident');

    // And an explicit "Retry now" tap is never made to wait it out.
    win._syncRetryAttempt = 3;
    win._syncRetryNextAt = Date.now() + 600000;
    win.retrySyncNow();
    t.eq(win._syncRetryNextAt, 0, 'tapping "Retry now" clears the pending backoff instead of being gated by it');
  }
};
