/* Team presence: the online/last-seen classification and the rendered list.
   The heartbeat/network is not exercised here (network is stubbed) — this
   guards the pure logic and the markup the profile menu shows. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Presence: online vs last-seen classification and rendering",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    const now = new Date();
    const mins = (m) => new Date(now.getTime() - m * 60000).toISOString();

    // Classification thresholds (PRESENCE_ONLINE_MS = 90s).
    t.eq(win._presenceRel(new Date().toISOString()), 'online', 'recent = online');
    t.eq(win._presenceRel(mins(2)), '2 min ago', '2 min ago label');
    t.eq(win._presenceRel(mins(200)), '3h ago', 'hours label');
    t.eq(win._presenceRel(mins(60 * 24 * 2)), '2d ago', 'days label');

    // Render a list: me (online) + a teammate (offline 10 min).
    const me = win.getSignedInEmail().toLowerCase();
    win.renderPresenceList([
      { email: me, name: 'Carlos', last_seen: new Date().toISOString() },
      { email: 'ale@example.com', name: 'Alejandro', last_seen: mins(10) },
    ]);
    const html = win.document.getElementById('presenceList').innerHTML;
    t.assert(/Carlos \(you\)/.test(html), 'current user marked "(you)"');
    t.assert(/online/.test(html), 'online label present');
    t.assert(/last seen 10 min ago/.test(html), 'offline last-seen label present');
    t.assert(/Alejandro/.test(html), 'teammate name present');
  }
};
