/* Carlos's real report, 2026-11-24: typing names into several Section
   Owners floor boxes without having clicked "Save section owners" yet,
   something he'd typed "disappeared out of nowhere." Root cause: unlike
   the Schedule Draft's per-cell autosave, Section Rotation (both the
   existing rotation-order editor and the new Section Owners boxes) is a
   type-several-then-click-Save form — but the background sync pull
   handler re-renders whichever page is open the instant ANY remote data
   changes anywhere in the app, even something completely unrelated
   (another employee's call-off, a training mark, anything), wiping every
   box he hadn't saved yet. Fixed by skipping that re-render while focus
   is actually inside the page's own content. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section Rotation: a background sync pull does not wipe an unsaved Section Owners box while it's still focused, but does catch the page up once focus moves away",
  async run(t) {
    const seed = fakeSession();
    const { win } = await loadApp({ seed });
    win.showPage('sectionrotation');
    win.renderSectionRotation();

    const input = win.document.querySelector('[data-so="gallery-2"]');
    t.assert(input, 'gallery floor 2 input missing');
    input.focus();
    input.value = 'Typing, not saved yet';

    // Something totally unrelated changes remotely (a call-off) — enough
    // to flip `updated` true and trigger the page re-render path, with no
    // real network involved.
    win._supaGetAllWithRetry = (cb) => cb(null, { calloff_1: { id: 1, empId: 'X', empName: 'Someone', pos: 'Room Attendant', date: '2026-01-01', reason: 'x' } });
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 30));

    const stillFocused = win.document.querySelector('[data-so="gallery-2"]');
    t.assert(stillFocused, 'gallery floor 2 input should still exist after the background pull');
    t.eq(stillFocused.value, 'Typing, not saved yet', 'unsaved in-progress typing must survive a background sync pull while the box is focused');

    // Move focus away (e.g. Carlos clicks elsewhere) — the NEXT background
    // pull should now be free to catch the page up normally. (document.body
    // isn't focusable by default, so blur the input directly rather than
    // trying to focus something else.)
    stillFocused.blur();
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 30));

    const afterBlur = win.document.querySelector('[data-so="gallery-2"]');
    t.eq(afterBlur.value, '', 'once focus moves away, the next sync should repaint the page from the real saved state — the unsaved typed text should be gone, not resurrected as if it were real data');
  }
};
