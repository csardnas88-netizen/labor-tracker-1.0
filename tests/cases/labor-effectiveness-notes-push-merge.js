/* Carlos's real report, 2026-10-23: his Room Attendant note for the week
   of 10-17 "disappeared" overnight — typed on his work PC, gone by the
   next morning on his laptop, no error on either device. Confirmed via
   the Supabase audit log: Rebeca saved a DIFFERENT position's note for
   the SAME week from her own device a few hours later, and her save wiped
   his out.

   labor-effectiveness-notes-sync.js already proves the PULL-side merge is
   correct (per-position, last-write-wins). This test proves the gap that
   merge alone could never close: saveWeeklyEffNote used to push the
   WHOLE local notes blob on every save (syncLaborEffNotesToSheets(key,
   data) — supaPut is a raw overwrite, no server-side merge). If device
   B's local copy hadn't yet pulled device A's more recent edit to a
   DIFFERENT position, device B's save would silently replace the cloud
   record with its own (A's-edit-missing) copy — erasing A's note even
   though B never touched it, never saw it, and got no error either.

   Fixed the same way Training was (saveTrainingsMerged): fetch the
   current remote copy right before pushing and merge it in first, so a
   save can only ADD/update, never erase a position it doesn't even know
   about. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Saving a Labor Effectiveness note for one position never erases another position's note that a different (stale) device hasn't pulled yet — merges with the current remote copy before pushing, not a blind whole-blob overwrite",
  async run(t) {
    const pushedBodies = [];
    // The "current remote state" this test controls — starts with
    // Carlos's Room Attendant note already live in the cloud, exactly as
    // confirmed in the real Supabase data.
    let remoteNotes = {
      notes: { 'Room Attendant': 'High occupancy, ironer down — scheduled 3 RAs at 6 days.' },
      notesUpdatedAt: { 'Room Attendant': '2026-10-23T19:41:27.753Z' },
    };
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
        const body = JSON.parse(options.body);
        pushedBodies.push(body);
        // Simulate the real cloud: an upsert actually lands, so the NEXT
        // fetch for this exact key sees whatever was just pushed.
        if (body.key === 'laboreffnotes_2026-10-17') remoteNotes = JSON.parse(body.value);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (method === 'GET' && u.indexOf('key=eq.laboreffnotes_2026-10-17') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ value: JSON.stringify(remoteNotes) }]) });
      }
      if (method === 'GET' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    // ── Device B (Rebeca): her local copy predates Carlos's Room
    // Attendant edit entirely — it only ever knew about Laundry's note,
    // saved earlier. This is the realistic stale-device state: she simply
    // hasn't had a pull land since Carlos's edit went up. ──
    const seed = Object.assign(fakeSession(), {
      'hk_laboreff_notes_2026-10-17': JSON.stringify({
        notes: { 'Laundry Attendant': 'Gady called off — covered with Petronila and Adamary (OT).' },
        notesUpdatedAt: { 'Laundry Attendant': '2026-10-21T13:31:28.672Z' },
      }),
    });
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));

    t.eq(win.getWeeklyEffNote('2026-10-17', 'Room Attendant'), '',
      "before saving, device B's local copy genuinely has no idea Carlos's Room Attendant note exists");

    // ── She edits (or merely re-saves) Turndown's note — a position
    // Carlos never touched. This is the actual trigger: ANY save on a
    // stale device, not necessarily editing the same position. ──
    win.saveWeeklyEffNote('2026-10-17', 'Turndown Attendant', 'Short on Room Attendant — Lupe Cruz clocked in early to cover.');
    await new Promise((r) => setTimeout(r, 80));

    // ── The actual bug: Room Attendant's note, which this device never
    // touched and didn't even know about, must survive in the cloud. ──
    t.assert(remoteNotes.notes['Room Attendant'], "Carlos's Room Attendant note must still exist in the cloud after Rebeca's unrelated save — this is the actual bug: it used to get silently wiped");
    t.eq(remoteNotes.notes['Room Attendant'], 'High occupancy, ironer down — scheduled 3 RAs at 6 days.',
      "and its text is untouched, not just present");
    t.eq(remoteNotes.notes['Turndown Attendant'], 'Short on Room Attendant — Lupe Cruz clocked in early to cover.',
      "her own Turndown edit is still there too — the fix merges, it doesn't just protect remote at the expense of the local edit");
    t.eq(remoteNotes.notes['Laundry Attendant'], 'Gady called off — covered with Petronila and Adamary (OT).',
      "and the Laundry note she already had locally (never in this particular remote fetch) also survives");

    // ── Her own local copy picks up the merge result too, not just the
    // cloud — so HER screen also now shows Carlos's note, not just a
    // future pull eventually catching up. ──
    t.eq(win.getWeeklyEffNote('2026-10-17', 'Room Attendant'), 'High occupancy, ironer down — scheduled 3 RAs at 6 days.',
      "device B's own local copy is updated with the merged result immediately, not left stale until the next pull");
  },
};
