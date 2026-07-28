/* Auto sign-out after inactivity — reduced from 45 to 10 minutes per
   Carlos's explicit request (2026-07-28). Locks in the actual value so a
   future edit can't silently drift it back, and confirms the boundary
   behavior: activity within the window keeps the session, inactivity past
   it signs out and shows the (dynamically-worded) message. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Auto sign-out fires at 10 minutes of inactivity, not before",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    t.eq(win.AUTO_LOGOUT_MS, 10 * 60 * 1000, 'the timeout is 10 minutes, not the old 45');

    /* ── recent activity: session survives a check ── */
    win._lastActivity = Date.now();
    win._checkInactivity();
    t.assert(!!win._authToken(), 'a session with recent activity is not signed out');
    t.assert(win.document.getElementById('authOverlay').style.display !== 'flex', 'the sign-in overlay stays hidden');

    /* ── 9 minutes idle: still within the window ── */
    win._lastActivity = Date.now() - (9 * 60 * 1000);
    win._checkInactivity();
    t.assert(!!win._authToken(), '9 minutes idle is still inside the 10-minute window');

    /* ── 11 minutes idle: past the window ── */
    win._lastActivity = Date.now() - (11 * 60 * 1000);
    win._checkInactivity();
    t.assert(!win._authToken(), '11 minutes idle signs the session out');
    t.eq(win.document.getElementById('authOverlay').style.display, 'flex', 'the sign-in screen reappears');
    t.assert(win.document.getElementById('authError').textContent.indexOf('10 minutes') > -1, 'the message states the actual current timeout (10 minutes), not a stale value');
  }
};
