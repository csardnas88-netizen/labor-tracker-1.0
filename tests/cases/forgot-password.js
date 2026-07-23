/* Forgot-password flow: the "Forgot password?" link swaps the sign-in card
   into email-only "send a reset link" mode; the request hits Supabase's
   /auth/v1/recover with a redirect_to back to the app; and returning from
   the emailed link (URL hash has type=recovery&access_token=…) shows a
   dedicated "set new password" screen that PUTs the new password using that
   token, then hands back to a normal sign-in with a confirmation message. */
const { loadApp } = require('../_harness');

module.exports = {
  name: "Forgot password: mode toggle, reset request, and setting a new password",
  async run(t) {
    let recoverCall = null;
    let userPutCall = null;
    const fetchImpl = (url, opts) => {
      if (typeof url === 'string' && url.indexOf('/auth/v1/recover') !== -1) {
        recoverCall = { url, body: opts && opts.body ? JSON.parse(opts.body) : null };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      if (typeof url === 'string' && url.indexOf('/auth/v1/user') !== -1) {
        userPutCall = { url, method: opts && opts.method, headers: opts && opts.headers, body: opts && opts.body ? JSON.parse(opts.body) : null };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'u1' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    // No session seeded — this is the signed-out auth screen.
    const { win } = await loadApp({ seed: {}, fetchImpl });
    const doc = win.document;

    t.eq(doc.getElementById('authOverlay').style.display, 'flex', 'auth overlay should be visible when signed out');

    // --- Entering forgot-password mode ---
    win._authSetMode('forgot');
    t.eq(doc.getElementById('authPasswordField').style.display, 'none', 'password field should hide in forgot mode');
    t.eq(doc.getElementById('authSignInBtn').textContent, 'Send reset link', 'button should relabel for forgot mode');
    t.eq(doc.getElementById('authToggleBtn').textContent, 'Back to sign in', 'toggle link should offer a way back');

    // --- Sending the reset request ---
    doc.getElementById('authEmail').value = 'manager@example.com';
    await win.authSendReset();
    t.assert(recoverCall, 'authSendReset should call /auth/v1/recover');
    t.assert(recoverCall.url.indexOf('/auth/v1/recover?redirect_to=') !== -1, 'recover call should include a redirect_to back to the app');
    t.eq(recoverCall.body.email, 'manager@example.com', 'recover call should send the entered email');
    t.assert(/reset link is on its way/.test(doc.getElementById('authError').textContent), 'should confirm the email was sent');

    // Toggle back to sign-in restores the password field.
    win._authToggleMode();
    t.eq(doc.getElementById('authPasswordField').style.display, '', 'password field should reappear back in sign-in mode');
    t.eq(doc.getElementById('authSignInBtn').textContent, 'Sign in', 'button should relabel back to Sign in');

    // --- Returning from the emailed link ---
    win.location.hash = '#access_token=recovery-tok-123&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery';
    const took = win._checkRecoveryLink();
    t.assert(took, '_checkRecoveryLink should detect a recovery hash');
    t.eq(doc.getElementById('authOverlay').style.display, 'none', 'normal auth overlay should hide during recovery');
    t.eq(doc.getElementById('authRecoveryOverlay').style.display, 'flex', 'the set-new-password screen should show');

    // A non-recovery hash (or none) must NOT take over the screen.
    win.location.hash = '';
    t.eq(win._checkRecoveryLink(), false, 'no hash should not trigger recovery mode');

    // --- Setting the new password ---
    // Put recovery mode back for the actual submit test.
    win.location.hash = '#access_token=recovery-tok-123&type=recovery';
    win._checkRecoveryLink();

    doc.getElementById('authNewPassword').value = 'short';
    doc.getElementById('authNewPassword2').value = 'short';
    await win.authSetNewPassword();
    t.assert(!userPutCall, 'a too-short password must be rejected before calling the API');
    t.assert(/at least 6 characters/.test(doc.getElementById('authRecoveryError').textContent), 'should explain the length requirement');

    doc.getElementById('authNewPassword').value = 'newpass1';
    doc.getElementById('authNewPassword2').value = 'newpass2';
    await win.authSetNewPassword();
    t.assert(!userPutCall, 'mismatched passwords must be rejected before calling the API');
    t.assert(/don't match/.test(doc.getElementById('authRecoveryError').textContent), 'should say the passwords do not match');

    doc.getElementById('authNewPassword').value = 'newpass1';
    doc.getElementById('authNewPassword2').value = 'newpass1';
    await win.authSetNewPassword();
    t.assert(userPutCall, 'a valid matching password should call /auth/v1/user');
    t.eq(userPutCall.method, 'PUT', 'should PUT the new password');
    t.eq(userPutCall.headers.Authorization, 'Bearer recovery-tok-123', 'should authenticate the PUT with the recovery token, not the normal session');
    t.eq(userPutCall.body.password, 'newpass1', 'should send the new password');
    t.eq(doc.getElementById('authRecoveryOverlay').style.display, 'none', 'recovery screen should hide after success');
    t.eq(doc.getElementById('authOverlay').style.display, 'flex', 'should hand back to the normal sign-in screen');
    t.assert(/Password updated/.test(doc.getElementById('authError').textContent), 'sign-in screen should confirm the password was updated');
  }
};
