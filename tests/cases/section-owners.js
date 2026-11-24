/* Carlos's ask, 2026-11-24: a place in Section Rotation to say who owns
   each floor's section, split by building — Gallery Tower (floors 2-22)
   and Studio Towers (floors 3-10). Unlike the three rotating roles already
   on this page, this is a stable hand-maintained list (no anchor/period
   math) that supports adding brand-new hires and clearing/replacing
   anyone who leaves. Confirmed with Carlos before building: reference
   only, same as the rest of Section Rotation — the Daily Lineup's GRA
   Sections table keeps reading the Section Assignment Excel file exactly
   as it does today, this list doesn't feed it. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section Rotation: Room Attendant Section Owners lists both buildings' floors, supports brand-new names, saves/clears independently of the roster, and a push never clobbers what another device just saved",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      hk_roster_overrides: {
        E1: { name: 'Ana Lopez', pos: 'Room Attendant', code: '2560', status: 'active', updated: new Date().toISOString() },
        E2: { name: 'Beto Cruz', pos: 'House Attendant', code: '2560', status: 'active', updated: new Date().toISOString() },
      },
    });
    const { win } = await loadApp({ seed });
    win.showPage('sectionrotation');
    win.renderSectionRotation();

    const html = win.document.getElementById('sectionRotationContent').innerHTML;
    t.assert(/Room Attendant Section Owners/.test(html), 'new block title missing');
    t.assert(/Gallery Tower/.test(html) && /Studio Towers/.test(html), 'both building names missing');

    // Gallery Tower: floors 2..22 (21 floors), Studio Towers: floors 3..10 (8 floors).
    for (const f of [2, 12, 22]) t.assert(html.includes('Floor ' + f), `Gallery Tower should list floor ${f}`);
    t.assert(!html.includes('data-so="gallery-23"'), 'Gallery Tower should stop at floor 22');
    for (const f of [3, 7, 10]) t.assert(html.includes('Floor ' + f), `Studio Towers should list floor ${f}`);
    t.assert(!html.includes('data-so="studio-11"'), 'Studio Towers should stop at floor 10');
    t.assert(!html.includes('data-so="studio-2"'), 'Studio Towers should start at floor 3, not 2');

    // Datalist offers Room Attendants only, as a hint — not a constraint.
    t.assert(/raSectionOwnerNames/.test(html) && /Ana Lopez/.test(html), "Room Attendant Ana Lopez should appear in the autocomplete list");
    const datalistStart = html.indexOf('<datalist');
    const datalistEnd = html.indexOf('</datalist>');
    const datalistHtml = html.slice(datalistStart, datalistEnd);
    t.assert(!/Beto Cruz/.test(datalistHtml), 'House Attendant Beto Cruz should NOT appear in the Room Attendant autocomplete list');

    // Fill in a mix: an existing roster name, and a brand-new hire never
    // seen anywhere else in the app — both must save the same way.
    win.document.querySelector('[data-so="gallery-2"]').value = 'Ana Lopez';
    win.document.querySelector('[data-so="gallery-22"]').value = 'Brand New Hire';
    win.document.querySelector('[data-so="studio-3"]').value = 'Someone Else';
    win.saveSectionOwnersFromUI();

    const saved = win.loadSectionOwners();
    t.eq(saved.gallery['2'], 'Ana Lopez', 'Gallery Tower floor 2 owner not saved');
    t.eq(saved.gallery['22'], 'Brand New Hire', 'a brand-new name (not anywhere else in the roster) should still save');
    t.eq(saved.studio['3'], 'Someone Else', 'Studio Towers floor 3 owner not saved');
    t.assert(!('12' in saved.gallery), 'an untouched floor should not appear in the saved map at all');

    // Re-render picks the saved values back up.
    win.renderSectionRotation();
    const html2 = win.document.getElementById('sectionRotationContent').innerHTML;
    t.assert(html2.includes('value="Brand New Hire"'), 'saved brand-new name should show back up after re-render');

    // Clearing a box removes that floor's owner entirely (not an empty string left behind).
    win.document.querySelector('[data-so="gallery-2"]').value = '';
    win.saveSectionOwnersFromUI();
    const saved2 = win.loadSectionOwners();
    t.assert(!('2' in saved2.gallery), 'clearing a floor\'s name should remove it, marking the floor as having no owner');
    t.eq(saved2.gallery['22'], 'Brand New Hire', 'clearing one floor should not disturb another');

    // ── CLAUDE.md recurring-bug-class #3 (whole-blob overwrite): a push
    // must not clobber what another device already saved. Device B edits
    // Studio Towers floor 5 (gallery untouched locally); meanwhile the
    // cloud already holds Device A's edit to Gallery Tower floor 2. The
    // push must end up with BOTH, not just Device B's own building. ──
    const pushedBodies = [];
    let remoteValue = { gallery: { 2: 'Device A Pick' } };
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
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ value: JSON.stringify(remoteValue) }]) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const seed2 = Object.assign(fakeSession(), { hk_section_owners: JSON.stringify({}) });
    const { win: win2 } = await loadApp({ seed: seed2, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));
    pushedBodies.length = 0;
    win2.showPage('sectionrotation');
    win2.renderSectionRotation();
    win2.document.querySelector('[data-so="studio-5"]').value = 'Device B Pick';
    win2.saveSectionOwnersFromUI();
    await new Promise((r) => setTimeout(r, 60));
    const pushed = pushedBodies.find((b) => b.key === 'hk_section_owners');
    t.assert(pushed, 'expected a push under the hk_section_owners key');
    const pushedVal = JSON.parse(pushed.value);
    t.eq(pushedVal.studio['5'], 'Device B Pick', 'this device\'s own edit must be in the push');
    t.eq(pushedVal.gallery['2'], 'Device A Pick', 'the OTHER device\'s already-cloud-saved edit must survive this push, not get overwritten');

    // ── A genuine clear must beat a stale device's lingering remote value,
    // not lose to it. Simulate a THIRD, stale device's cloud copy that
    // still shows Studio floor 5 occupied (no _at — exactly what a
    // pre-this-feature or long-disconnected device's copy looks like),
    // while this device (win2) deliberately clears the floor it had just
    // set a moment ago. ──
    remoteValue = { gallery: { 2: 'Device A Pick' }, studio: { 5: 'Stale Device C Value' } };
    pushedBodies.length = 0;
    win2.document.querySelector('[data-so="studio-5"]').value = '';
    win2.saveSectionOwnersFromUI();
    await new Promise((r) => setTimeout(r, 60));
    const pushed2 = pushedBodies.find((b) => b.key === 'hk_section_owners');
    const pushedVal2 = JSON.parse(pushed2.value);
    t.assert(!pushedVal2.studio || !('5' in pushedVal2.studio), 'a deliberate clear on this device must beat a stale device\'s lingering value, not lose to it');
    t.eq(pushedVal2.gallery['2'], 'Device A Pick', 'the unrelated building\'s data should still survive this push too');
  }
};
