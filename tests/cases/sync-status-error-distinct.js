/* Carlos reported "the offline problem" starting the moment he made his
   first change after opening the app (e.g. uploading a Labor Distribution
   Report) — never before that. setSyncStatus("error") — used by supaPut,
   _supaPutMany and syncFromSheets for a rejected write, a session that
   couldn't renew, or a bad response, none of which mean the network is
   actually down — used to fall through the same generic branch as a real
   "offline" event and render the identical "● Offline" text. So the very
   first write-related failure after opening the app (a session gone stale
   while it sat idle, a write rejected, anything) looked exactly like a
   disconnection, even on a fully connected machine. This pins that
   "error" now gets its own distinct, correctly-labeled state. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "setSyncStatus(\"error\") shows its own \"Sync error\" text, distinct from a real \"Offline\"",
  async run(t) {
    const seed = Object.assign(fakeSession(), {});
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    const statusText = () => win.document.getElementById('syncStatus').textContent;

    win.setSyncStatus('offline');
    t.eq(statusText(), '● Offline', 'a real offline event still reads exactly "Offline"');

    win.setSyncStatus('error');
    t.assert(/Sync error/i.test(statusText()), 'a write/auth failure reads as its own "Sync error", not "Offline"');
    t.assert(!/Offline/.test(statusText()), 'and does not also say "Offline" — the two must not look identical');

    win.setSyncStatus('synced');
    t.assert(/Synced|Live/.test(statusText()), 'recovering still reads Synced/Live as before');
  }
};
