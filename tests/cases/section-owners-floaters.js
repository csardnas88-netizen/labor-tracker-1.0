/* Carlos's follow-up ask, same day, right after trying the floor boxes:
   a place to name Room Attendant Floaters too — people who don't own one
   floor but cover wherever needed. Confirmed with Carlos: ONE shared
   list (not split by tower), open-ended rather than a fixed count — add
   or remove freely. Each row is keyed by its own id, not its position in
   the list, so the save-merge logic (_mergeSectionOwnerUnit) can tell
   two devices' adds/removes apart the same way the floor boxes already
   do, instead of two array-index merges silently colliding. Adding or
   removing a row is a pure DOM edit (sectionOwnerAddFloaterRow /
   sectionOwnerRemoveFloaterRow) — no renderSectionRotation() call — so
   it can't blow away unsaved typing anywhere else on the page, the same
   lesson just learned from the background-sync bug. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section Rotation: Room Attendant Floaters is one shared, open-ended list — add/remove rows without disturbing the rest of the page, saves/merges by row id",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_section_owners: JSON.stringify({ floaters: { f1: 'Rosa Diaz' } }),
    });
    const { win } = await loadApp({ seed });
    win.showPage('sectionrotation');
    win.renderSectionRotation();

    let html = win.document.getElementById('sectionRotationContent').innerHTML;
    t.assert(/Floaters/.test(html), 'Floaters section missing');
    t.assert(html.includes('value="Rosa Diaz"'), 'existing floater should show up on render');
    const floaterTitleCount = (html.match(/>Floaters</g) || []).length;
    t.eq(floaterTitleCount, 1, 'Floaters should be one shared list (one heading), not duplicated per tower');

    // Adding a row must NOT disturb an unsaved floor edit sitting right there.
    win.document.querySelector('[data-so="gallery-2"]').value = 'Unsaved Gallery Pick';
    win.sectionOwnerAddFloaterRow();
    const newRow = win.document.querySelector('#soFloatersList [data-floater-row]:last-child');
    t.assert(newRow, 'a new floater row should have been appended');
    t.eq(win.document.querySelector('[data-so="gallery-2"]').value, 'Unsaved Gallery Pick', 'adding a floater row must not disturb an unrelated unsaved floor edit');
    t.eq(win.document.activeElement, newRow.querySelector('[data-floater]'), 'the new row\'s input should be focused so Carlos can type right into it');

    const newId = newRow.querySelector('[data-floater]').getAttribute('data-floater');
    newRow.querySelector('[data-floater]').value = 'Brand New Floater';

    win.saveSectionOwnersFromUI();
    const saved = win.loadSectionOwners();
    t.eq(saved.floaters.f1, 'Rosa Diaz', 'the pre-existing floater must still be there');
    t.eq(saved.floaters[newId], 'Brand New Floater', 'the newly added floater must be saved under its own stable id');
    t.eq(saved.gallery['2'], 'Unsaved Gallery Pick', "the floor edit typed alongside it should also have saved normally");

    // Removing a row is a pure DOM edit; it only becomes permanent at the next Save.
    win.renderSectionRotation();
    const rowToRemove = win.document.querySelector('[data-floater="f1"]').closest('[data-floater-row]');
    const removeBtn = rowToRemove.querySelector('button');
    removeBtn.click();
    t.assert(!win.document.querySelector('[data-floater="f1"]'), 'the row should be gone from the DOM immediately after clicking remove');
    win.saveSectionOwnersFromUI();
    const saved2 = win.loadSectionOwners();
    t.assert(!('f1' in saved2.floaters), 'removing a floater row and saving should actually delete it, not leave a blank entry behind');
    t.eq(saved2.floaters[newId], 'Brand New Floater', 'removing one floater should not disturb another');

    // ── Cross-device merge: this device only ever touched its own
    // floater id; a different device's floater (a different id) must
    // still survive a save here, same protection the floor boxes get. ──
    const pushedBodies = [];
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
        pushedBodies.push(JSON.parse(options.body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (method === 'GET' && u.indexOf('key=eq.hk_section_owners') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ value: JSON.stringify({ floaters: { peerId: 'Peer Device Floater' } }) }]) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const seed2 = Object.assign(fakeSession(), { hk_section_owners: JSON.stringify({}) });
    const { win: win2 } = await loadApp({ seed: seed2, fetchImpl });
    win2.showPage('sectionrotation');
    win2.renderSectionRotation();
    win2.sectionOwnerAddFloaterRow();
    const myRow = win2.document.querySelector('#soFloatersList [data-floater-row]:last-child');
    myRow.querySelector('[data-floater]').value = 'My Device Floater';
    win2.saveSectionOwnersFromUI();
    await new Promise((r) => setTimeout(r, 60));

    const pushed = pushedBodies.find((b) => b.key === 'hk_section_owners');
    const pushedVal = JSON.parse(pushed.value);
    t.eq(pushedVal.floaters.peerId, 'Peer Device Floater', "a different device's floater must survive this device's own save");
    const myId = Object.keys(pushedVal.floaters).find((k) => k !== 'peerId');
    t.eq(pushedVal.floaters[myId], 'My Device Floater', "this device's own new floater must be in the push too");
  }
};
