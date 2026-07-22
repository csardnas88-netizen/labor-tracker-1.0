/* If the realtime socket drops (network blip, server restart, anything),
   the channel status callback fires CHANNEL_ERROR/TIMED_OUT/CLOSED. Before
   this fix, nothing cleared `_rtChannel`, so both startRealtime()'s "already
   subscribed" guard and the 30s watchdog's "!_rtChannel" check kept thinking
   the connection was still alive — no more live updates would ever arrive
   again until the whole app was reloaded. Guards that a dropped channel
   clears `_rtChannel` so a reconnect becomes possible.
   A fake `window.supabase.createClient` is installed before calling
   startRealtime() so `_loadSupabaseLib()` resolves instantly without trying
   to load the real CDN bundle (this suite never touches the network). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Realtime: a dropped channel clears _rtChannel so it can reconnect",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    let createCount = 0;
    win.supabase = {
      createClient: function () {
        return {
          realtime: { setAuth: function () {} },
          channel: function () {
            createCount++;
            const chan = {
              on: function () { return chan; },
              subscribe: function (statusCb) {
                chan._statusCb = statusCb;
                setTimeout(function () { statusCb('SUBSCRIBED'); }, 0);
                return chan;
              },
            };
            return chan;
          },
          removeChannel: function () {},
        };
      },
    };

    win.startRealtime();
    await new Promise((r) => setTimeout(r, 50));
    t.assert(win._rtChannel, 'channel should be set after a successful subscribe');
    t.eq(createCount, 1, 'exactly one channel should have been created so far');

    // Simulate the socket dying.
    win._rtChannel._statusCb('CHANNEL_ERROR');
    t.assert(win._rtChannel === null, '_rtChannel must be cleared when the channel errors out, or reconnect is blocked forever');

    // Now a fresh startRealtime() call must actually reconnect, not bail out
    // on a stale "already subscribed" guard.
    win.startRealtime();
    await new Promise((r) => setTimeout(r, 50));
    t.eq(createCount, 2, 'startRealtime() after a drop should create a new channel');
    t.assert(win._rtChannel, 'a new channel should be set after reconnecting');
  }
};
