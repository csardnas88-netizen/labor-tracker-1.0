/* Same root cause as section-rotation-background-sync-preserves-typing.js,
   a different trigger: saveSectionOwners's own cloud round trip re-renders
   the page once its merge lands, to pick up a peer's floor the form never
   showed (see that function's own comment). If Carlos clicks "Save section
   owners" and immediately keeps typing into the NEXT floor box while that
   round trip is still in flight, the same re-render would wipe what he just
   typed. Guarded the same way: skip the post-merge re-render while focus is
   still inside the page. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section Owners: typing into another box right after clicking Save, while that save's own cloud round trip is still in flight, is not wiped once the round trip resolves",
  async run(t) {
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (method === 'GET' && u.indexOf('key=eq.hk_section_owners') !== -1) {
        // Delayed so there's a real window to keep typing before this resolves.
        return new Promise((resolve) => setTimeout(() => resolve({
          ok: true, status: 200, json: () => Promise.resolve([{ value: JSON.stringify({ gallery: { 10: 'Peer Owner' } }) }]),
        }), 60));
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const seed = fakeSession();
    const { win } = await loadApp({ seed, fetchImpl });
    win.showPage('sectionrotation');
    win.renderSectionRotation();

    // Carlos fills floor 2 and clicks Save (kicks off the delayed round trip).
    win.document.querySelector('[data-so="gallery-2"]').value = 'Carlos Pick';
    win.saveSectionOwnersFromUI();

    // Immediately keeps going: focuses and types into the NEXT box while
    // that save is still in flight.
    const next = win.document.querySelector('[data-so="gallery-3"]');
    next.focus();
    next.value = 'Still typing floor 3';

    await new Promise((r) => setTimeout(r, 120)); // let the delayed round trip resolve

    const stillFocused = win.document.querySelector('[data-so="gallery-3"]');
    t.eq(stillFocused.value, 'Still typing floor 3', "typing into the next box right after Save must survive once that save's own cloud round trip resolves");

    // The peer's floor 10 should still have come along in the saved data,
    // proving the merge itself still ran — just didn't repaint over active typing.
    const saved = win.loadSectionOwners();
    t.eq(saved.gallery['10'], 'Peer Owner', "the peer's floor should still be merged in locally even though the repaint was skipped");
  }
};
