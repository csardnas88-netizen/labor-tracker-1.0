/* Found during a self-review Carlos explicitly asked for right after the
   DND Delete button shipped ("comprobaste tu trabajo? todo se sincroniza
   sin problema?"): saveDNDRoomsForDate cleared a day by delete()-ing its
   key from mData.dndRooms, matching how saveDeparturesForDate/
   saveRoomsForDate already clear a value. But _pushMonthRows only builds a
   row for keys still present in Object.keys(mData.dndRooms) — a deleted
   key means NO row is ever pushed for that date, so the clear only ever
   takes effect on the device that clicked Delete. The cloud (and every
   other device) keeps showing the old room list forever, which is exactly
   backwards for a button literally labeled "Delete."

   Fixed by storing '' instead of delete()-ing the key, so the day stays
   in Object.keys() and a real (empty) row gets pushed, actually
   propagating the clear. This test pins that by inspecting the actual
   POST body sent to labor_upsert_many — reading local state back isn't
   enough to catch this class of bug, since local reads looked correct
   even before the fix (the bug was specifically that nothing got pushed). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Deleting a DND room list actually pushes the clear (not just a local-only change)",
  async run(t) {
    const pushedBodies = [];
    const fetchImpl = (url, options) => {
      options = options || {};
      const method = (options.method || 'GET').toUpperCase();
      const u = String(url);
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/rpc/labor_upsert_many') !== -1) {
        pushedBodies.push(JSON.parse(options.body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(1) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    const seed = Object.assign(fakeSession(), {});
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60)); // let load-time sync settle

    win.saveDNDRoomsForDate('2026-08-04', '1706, 1707, 1710');
    await new Promise((r) => setTimeout(r, 80));
    const savedRow = pushedBodies[pushedBodies.length - 1].p_rows.find((r) => r.key === 'mdnd_2026-08_2026-08-04');
    t.assert(savedRow, 'saving the room list pushed its own mdnd_ row');
    t.eq(JSON.parse(savedRow.value).v, '1706, 1707, 1710', 'the pushed row carries the room list that was saved');

    win.deleteDNDRooms('2026-08-04');
    await new Promise((r) => setTimeout(r, 80));
    const deleteRow = pushedBodies[pushedBodies.length - 1].p_rows.find((r) => r.key === 'mdnd_2026-08_2026-08-04');
    t.assert(deleteRow, 'Delete must push its own mdnd_ row too — this is the actual bug: it silently pushed nothing before the fix');
    t.eq(JSON.parse(deleteRow.value).v, '', 'the pushed row carries the cleared (empty) value, so other devices actually see the deletion');

    // And the local read reflects the clear either way, before or after
    // the fix — confirming the bug was specifically about the push, not
    // the local read path.
    t.eq(win.getDNDRoomsForDay('2026-08-04'), '', 'local read confirms the room list is cleared');
    t.eq(win.getDNDCountForDay('2026-08-04'), null, 'local derived count confirms the clear too');
  }
};
