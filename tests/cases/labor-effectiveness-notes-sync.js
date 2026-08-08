/* Labor Effectiveness notes sync per-POSITION, last-write-wins by a
   per-position timestamp — like variance notes' per-day fold, NOT like
   the PDF record's whole-record-replace (see labor-effectiveness-sync.js).
   Two devices editing different positions' explanations for the same
   week must both survive a pull; a delete on one device must propagate
   as a delete, not just "no update" leaving the stale text in place.

   Also pins the local/remote KEY-COLLISION guard: hk_laboreff_notes_<week>
   starts with the literal prefix hk_laboreff_ that the PDF record's own
   key also starts with, and the remote key laboreffnotes_<week> is one
   character away from the PDF record's laboreff_<week> — both push and
   pull have to tell them apart correctly, or a notes save could get
   pushed under the PDF record's remote key (or vice versa) and silently
   corrupt it. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor Effectiveness notes sync per-position (not whole-blob), and never collide with the PDF record's key",
  async run(t) {
    const pushedBodies = [];
    let getAllRows = [];
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
        pushedBodies.push(JSON.parse(options.body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (method === 'GET' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(getAllRows) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    const seed = Object.assign(fakeSession(), {});
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));

    // ── Push: a note push must land under "laboreffnotes_<week>", not
    // "laboreff_notes_<week>" or the PDF record's "laboreff_<week>". ──
    pushedBodies.length = 0;
    win.saveWeeklyEffNote('2026-08-01', 'Turndown Attendant', 'Covered a call-off.');
    await new Promise((r) => setTimeout(r, 40));
    const pushedKeys = pushedBodies.map((b) => b.key);
    t.assert(pushedKeys.includes('laboreffnotes_2026-08-01'), 'pushed under laboreffnotes_2026-08-01 (got: ' + pushedKeys.join(', ') + ')');
    t.assert(!pushedKeys.includes('laboreff_2026-08-01'), 'does NOT also touch the PDF record\'s remote key');

    // ── Also exercise forceSyncToSupabase's own key-routing, which reads
    // straight off localStorage keys rather than calling saveWeeklyEffNote
    // — the exact path where hk_laboreff_notes_ vs hk_laboreff_ ordering
    // matters. ──
    pushedBodies.length = 0;
    win.forceSyncToSupabase();
    await new Promise((r) => setTimeout(r, 60));
    const forceSyncKeys = pushedBodies.map((b) => b.key);
    t.assert(forceSyncKeys.includes('laboreffnotes_2026-08-01'), 'forceSyncToSupabase also routes the notes key correctly');

    // ── Pull: two devices edit DIFFERENT positions for the same week —
    // both must survive (per-position merge, not whole-blob). ──
    win.localStorage.setItem('hk_laboreff_notes_2026-08-01', JSON.stringify({
      notes: { 'Turndown Attendant': 'Covered a call-off.' },
      notesUpdatedAt: { 'Turndown Attendant': '2026-08-08T09:00:00.000Z' }
    }));
    getAllRows = [{
      key: 'laboreffnotes_2026-08-01',
      value: JSON.stringify({
        notes: { 'Room Attendant': 'Group check-in prep, extra hours expected.' },
        notesUpdatedAt: { 'Room Attendant': '2026-08-08T10:00:00.000Z' }
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    let merged = win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant');
    t.eq(merged, 'Covered a call-off.', "Turndown's locally-written note survives a pull that only carries Room Attendant's");
    merged = win.getWeeklyEffNote('2026-08-01', 'Room Attendant');
    t.eq(merged, 'Group check-in prep, extra hours expected.', "Room Attendant's remote-only note is folded in");

    // ── A NEWER remote edit to the SAME position wins over an older
    // local one. ──
    getAllRows = [{
      key: 'laboreffnotes_2026-08-01',
      value: JSON.stringify({
        notes: { 'Turndown Attendant': 'Corrected: also short-staffed Thursday.' },
        notesUpdatedAt: { 'Turndown Attendant': '2026-08-08T11:00:00.000Z' } // newer than local's 09:00
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Corrected: also short-staffed Thursday.', 'a newer remote edit to the same position wins');
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Room Attendant'), 'Group check-in prep, extra hours expected.', "Room Attendant's note is untouched by an update that only concerned Turndown");

    // ── A delete propagates: remote's notesUpdatedAt is newer but the
    // note itself is absent -> the local copy must be removed, not left
    // stale because "there's nothing to merge in". ──
    getAllRows = [{
      key: 'laboreffnotes_2026-08-01',
      value: JSON.stringify({
        notes: {}, // Turndown's note was deleted on the other device
        notesUpdatedAt: { 'Turndown Attendant': '2026-08-08T12:00:00.000Z' } // newer still
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), '', "a delete on another device propagates as a delete here, not a stale leftover");

    // ── An OLDER remote record must not resurrect an already-deleted (or
    // since-edited) local note. ──
    win.saveWeeklyEffNote('2026-08-01', 'Turndown Attendant', 'Re-added after the corrected report landed.');
    getAllRows = [{
      key: 'laboreffnotes_2026-08-01',
      value: JSON.stringify({
        notes: { 'Turndown Attendant': 'Corrected: also short-staffed Thursday.' },
        notesUpdatedAt: { 'Turndown Attendant': '2026-08-08T11:00:00.000Z' } // stale — older than the local edit above
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Re-added after the corrected report landed.', 'a stale remote record does not resurrect over a newer local edit');
  }
};
