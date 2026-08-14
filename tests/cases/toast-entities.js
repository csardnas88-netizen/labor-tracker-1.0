/* Toast messages were showing their icon as raw text.

   Most callers write the leading icon as a numeric HTML entity —
   showToast("&#10003; Project created"), "&#9729; Pushing 4 keys to
   Supabase..." — but showToast assigned the string to textContent, which
   renders "&#10003;" as those literal eight characters rather than a
   checkmark. Over thirty call sites did this, so it was visible on
   nearly every save in the app.

   The fix decodes ONLY numeric entities and still writes through
   textContent. That distinction is the point of this test: toast text
   interpolates roster names, report labels and email addresses, so
   switching to innerHTML would have turned a cosmetic bug into a markup
   injection through data the app does not control. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Toast icons written as numeric HTML entities render as characters, and toast text is never parsed as markup",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const el = () => win.document.getElementById('toastMsg');

    win.showToast('&#10003; Project created');
    t.eq(el().textContent, '✓ Project created', 'a checkmark entity comes out as an actual checkmark');
    t.assert(!/&#/.test(el().textContent), 'and no raw entity survives in what the user reads');

    win.showToast('&#9729; Pushing 4 keys to Supabase...');
    t.eq(el().textContent, '☁ Pushing 4 keys to Supabase...', 'the sync toast Carlos saw on screen reads correctly now');

    // Icons above the BMP need the surrogate pair String.fromCodePoint
    // gives; String.fromCharCode would silently mangle these.
    win.showToast('&#128197; Labor saved');
    t.eq(el().textContent, '\u{1F4C5} Labor saved', 'an astral-plane icon (calendar) survives intact');

    // Plain text and real emoji were always fine and must stay fine.
    win.showToast('✓ OCC loaded — 12 days auto-filled');
    t.eq(el().textContent, '✓ OCC loaded — 12 days auto-filled', 'messages already using real characters are untouched');

    // The security guarantee: names and labels are interpolated into
    // these strings, so markup in them must stay inert text.
    win.showToast('&#10003; <img src=x onerror=alert(1)> added to Roster');
    t.eq(el().textContent, '✓ <img src=x onerror=alert(1)> added to Roster',
      'markup in an interpolated name stays literal text, not parsed HTML');
    t.eq(el().getElementsByTagName('img').length, 0, 'and produces no element in the DOM');

    // A malformed or nonsense entity must not throw or blank the toast.
    win.showToast('&#99999999999; still readable');
    t.assert(/still readable/.test(el().textContent), 'an out-of-range entity leaves the rest of the message intact');
    win.showToast('&amp; &notanentity; plain');
    t.eq(el().textContent, '&amp; &notanentity; plain', 'non-numeric entities are left exactly as written');

    win.showToast('');
    t.eq(el().textContent, '', 'an empty message clears the toast rather than printing "null"');
  }
};
