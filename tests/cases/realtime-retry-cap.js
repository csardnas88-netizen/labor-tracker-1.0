/* Carlos's real bug this session, hit on two different long-lived tabs:
   "Maximum call stack size exceeded" inside supabase.min.js, always
   alongside a session that's dead server-side (repeating 401s) but not
   locally "expired" — _authExpired() is a local timestamp check, so it
   never bails startRealtime() out on its own. Before this fix, the 30s
   watchdog just kept calling startRealtime() forever whenever _rtChannel
   was null, so a permanently-broken connection retried every 30 seconds
   for as long as the tab stayed open — hours of that compounding into
   the crash. Now it gives up after _rtMaxFails consecutive failures until
   a real page reload or a genuinely new token (a fresh sign-in or a
   successful refresh, via _authStore). */
const { loadApp, fakeSession } = require('../_harness');

function installFailingClient(win, createCountRef) {
  win.supabase = {
    createClient: function () {
      return {
        realtime: { setAuth: function () {} },
        channel: function () {
          createCountRef.count++;
          const chan = {
            on: function () { return chan; },
            subscribe: function (statusCb) {
              chan._statusCb = statusCb;
              // Always fails — simulates a session that's dead server-side.
              setTimeout(function () { statusCb('CHANNEL_ERROR'); }, 0);
              return chan;
            },
          };
          return chan;
        },
        removeChannel: function () {},
        removeAllChannels: function () {},
      };
    },
  };
}

module.exports = {
  name: "Realtime: a permanently-dead connection stops retrying after _rtMaxFails instead of forever",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const createCountRef = { count: 0 };
    installFailingClient(win, createCountRef);

    // Drive it through _rtMaxFails failed attempts, same as the 30s
    // watchdog calling startRealtime() over and over on a dead session.
    for (let i = 0; i < win._rtMaxFails; i++) {
      win.startRealtime();
      await new Promise((r) => setTimeout(r, 10));
    }
    t.eq(createCountRef.count, win._rtMaxFails, `exactly ${win._rtMaxFails} channels created, one per attempt`);
    t.assert(win._rtGaveUp, 'after _rtMaxFails consecutive failures, the watchdog gives up');

    // One more call must be a true no-op — this is the fix: no more
    // reconnect attempts, no more chances to compound into the crash.
    win.startRealtime();
    await new Promise((r) => setTimeout(r, 10));
    t.eq(createCountRef.count, win._rtMaxFails, 'startRealtime() is a no-op once given up — does not create another channel');

    // A genuinely new token (fresh sign-in or successful refresh) is a
    // real reason to try again — it must clear the give-up state.
    win._authStore({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 });
    t.assert(!win._rtGaveUp, "_authStore (a real new token) clears _rtGaveUp");
    t.eq(win._rtFailCount, 0, '_authStore also resets the fail counter back to zero');

    win.startRealtime();
    await new Promise((r) => setTimeout(r, 10));
    t.eq(createCountRef.count, win._rtMaxFails + 1, 'after a fresh token, startRealtime() tries again — one more channel created');
  }
};
