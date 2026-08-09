/* Carlos reported the "Offline" indicator still flickering just as often
   on the work computer even after v7.1.1's quiet retry-once for failed
   pulls/presence. Root cause of the part v7.1.1 missed: a separate,
   un-debounced listener —

     window.addEventListener('offline', function(){ setSyncStatus('offline'); });

   — flips the sidebar to Offline the INSTANT the browser fires a real
   'offline' event, with zero delay and no relation to any REST request at
   all. Wifi roaming between access points, a VPN client reconnecting, or
   a corporate proxy hiccup can make the OS report the network interface
   as down for well under a second — the browser still fires a genuine
   'offline' event for that, and the old code believed it immediately.
   That path never went through supaGetAll/loadPresence, so v7.1.1's
   retry-once never touched it.

   Fixed by waiting _offlineDebounceMs (4s) before actually setting the
   status, cancelling the pending flip if 'online' fires first. A real,
   sustained outage still ends up showing Offline — just not a blip. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A brief browser 'offline' blip (wifi roam, VPN reconnect) does not flip the sidebar to Offline; a sustained one still does",
  async run(t) {
    const seed = Object.assign(fakeSession(), {});
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    const statusText = () => win.document.getElementById('syncStatus').textContent;
    const setOnLine = (val) => Object.defineProperty(win.navigator, 'onLine', { value: val, configurable: true });

    // ── A blip: offline then online again well inside the debounce
    // window must never show Offline at all. ──
    win.setSyncStatus('synced');
    setOnLine(false);
    win.dispatchEvent(new win.Event('offline'));
    await new Promise((r) => setTimeout(r, 500));
    t.assert(!/Offline/.test(statusText()), 'Offline does not show yet, mid-debounce');
    setOnLine(true);
    win.dispatchEvent(new win.Event('online'));
    await new Promise((r) => setTimeout(r, win._offlineDebounceMs + 500));
    t.assert(!/Offline/.test(statusText()), "a brief blip that recovers before the debounce fires never shows Offline at all");

    // ── A sustained outage — still offline once the debounce window
    // elapses — must still show Offline; the debounce only absorbs
    // blips, it doesn't hide a real disconnection. ──
    win.setSyncStatus('synced');
    setOnLine(false);
    win.dispatchEvent(new win.Event('offline'));
    await new Promise((r) => setTimeout(r, win._offlineDebounceMs + 500));
    t.assert(/Offline/.test(statusText()), 'a sustained outage past the debounce window still shows Offline');
  }
};
