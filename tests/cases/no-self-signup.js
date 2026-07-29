/* Account creation is invite-only (2026-07-28): a signed-out visitor must
   only ever see "Sign in" / "Forgot password?" — never a path to create an
   account, and no function that could POST to /auth/v1/signup should exist
   to be called even from the console. Locks in the fix for the "someone
   could squat a future manager's email" risk from the security audit. */
const { loadApp } = require('../_harness');

module.exports = {
  name: "No self-service signup: signed-out screen only offers sign-in / forgot password",
  async run(t) {
    const { win } = await loadApp({ seed: {} });
    const doc = win.document;

    t.eq(doc.getElementById('authOverlay').style.display, 'flex', 'auth overlay should be visible when signed out');
    t.eq(doc.getElementById('authPasswordField').style.display, '', 'password field should be visible in default sign-in mode');
    t.eq(doc.getElementById('authSignInBtn').textContent, 'Sign in', 'the only button offered by default is Sign in');
    t.eq(doc.getElementById('authToggleBtn').style.display, 'none', 'no toggle to a create-account mode should be visible by default');

    t.assert(typeof win.authSignUp === 'undefined', 'authSignUp must not exist — there is no code path left that can POST to /auth/v1/signup');

    t.assert(/ask carlos for an invite/i.test(doc.querySelector('.auth-note').textContent), 'the note should point people to Carlos for an invite instead of a create-account link');

    // Forgot-password must still work — this removal should not have touched it.
    win._authSetMode('forgot');
    t.eq(doc.getElementById('authToggleBtn').style.display, '', 'the toggle reappears in forgot mode, to get back to sign-in');
    t.eq(doc.getElementById('authToggleBtn').textContent, 'Back to sign in', 'its only remaining job is returning to sign-in');
    win._authToggleMode();
    t.eq(doc.getElementById('authPasswordField').style.display, '', 'toggling from forgot mode returns to sign-in');
    t.eq(doc.getElementById('authToggleBtn').style.display, 'none', 'the toggle hides again back in sign-in mode');
  }
};
