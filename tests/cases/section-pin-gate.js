/* A 4-digit PIN gate in front of Labor Model and P&L, per Carlos's explicit
   request — applies to everyone including the owner, and is asked every
   single navigation (not just once per session). Soft deterrent only (a
   client-side single-file app can't truly enforce this), but it must still
   behave correctly: no page content should ever render without the correct
   PIN, and entering it wrong must not unlock anything. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section PIN gate: blocks Labor Model/P&L until the correct PIN is entered, every time",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    /* ── no PIN set: pages open normally, exactly like before ── */
    win.showPage('labormodel');
    t.eq(win.currentPage, 'labormodel', 'with no PIN configured, Labor Model opens with no gate at all');
    win.showPage('dashboard');

    /* ── set a PIN ── */
    win.saveSectionPin('1234');

    win.showPage('labormodel');
    t.eq(win.currentPage, 'dashboard', 'navigation is blocked — currentPage never changes to labormodel');
    t.eq(win.document.getElementById('pinGateOverlay').style.display, 'flex', 'the PIN gate overlay is shown instead');
    t.eq(win.document.getElementById('page-labormodel').style.display, 'none', 'the protected page itself is never revealed');

    /* ── wrong PIN ── */
    win.document.getElementById('pinGateInput').value = '0000';
    win.submitPinGate();
    t.eq(win.currentPage, 'dashboard', 'a wrong PIN does not navigate anywhere');
    t.eq(win.document.getElementById('pinGateOverlay').style.display, 'flex', 'the gate stays up');
    t.eq(win.document.getElementById('pinGateError').style.display, 'block', 'an error message shows');

    /* ── correct PIN ── */
    win.document.getElementById('pinGateInput').value = '1234';
    win.submitPinGate();
    t.eq(win.currentPage, 'labormodel', 'the correct PIN unlocks navigation');
    t.eq(win.document.getElementById('pinGateOverlay').style.display, 'none', 'the gate closes');
    t.eq(win.document.getElementById('page-labormodel').style.display, 'block', 'and the real page is now shown');

    /* ── every time, not once per session: navigating away and back re-gates ── */
    win.showPage('dashboard');
    win.showPage('pnl');
    t.eq(win.currentPage, 'dashboard', 'P&L is gated too, independently of Labor Model having just been unlocked');
    t.eq(win.document.getElementById('pinGateOverlay').style.display, 'flex', 'the gate reappears for P&L');

    win.document.getElementById('pinGateInput').value = '1234';
    win.submitPinGate();
    t.eq(win.currentPage, 'pnl', 'the same PIN unlocks P&L too');

    win.showPage('dashboard');
    win.showPage('labormodel');
    t.eq(win.currentPage, 'dashboard', 'going back to Labor Model asks again — the earlier unlock was not remembered');
    t.eq(win.document.getElementById('pinGateOverlay').style.display, 'flex', 'gate is back up for Labor Model too');

    /* ── ungated pages are unaffected ── */
    win.cancelPinGate();
    win.showPage('overtime');
    t.eq(win.currentPage, 'overtime', 'a page that was never gated navigates normally even while a PIN is configured');

    /* ── removing the PIN reopens both sections ── */
    win.saveSectionPin(null);
    win.showPage('pnl');
    t.eq(win.currentPage, 'pnl', 'with the PIN removed, P&L opens with no gate again');
  }
};
