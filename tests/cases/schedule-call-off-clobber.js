/* Carlos's real report, 2026-09-02: Guadalupe Cruz's Call-Off (marked
   CALL-OFF on her Turndown cell for Sept 1) showed on the Schedule
   Draft, then reverted back to '1' hours later — confirmed against
   Supabase, her cell really was back to '1' server-side even though
   the call-off record itself still shows it was applied.

   Root cause traced through the real audit log: THREE accounts (Carlos,
   Rebeca, Ingrid) all save dl_schedule as one whole blob with no
   server-side merge. A device holding a stale local copy of just that
   one day pushes its own snapshot for an unrelated edit elsewhere, and
   because ITS save is "now", it looks newest even though the one day
   it's carrying is actually older.

   Fixed two ways together: (1) dlSaveSchedule stamps each day with its
   own _at the moment its content actually changes; (2) a push now
   fetches the current remote copy and merges it in first (same pattern
   as saveTrainingsMerged), so a stale device's OWN push can't silently
   overwrite a day it never touched. */
const { loadApp, fakeSession } = require('../_harness');

function makeTable() {
  const table = {};
  const fetchImpl = (url, opts) => {
    opts = opts || {};
    const method = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.indexOf('/auth/v1/') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
    }
    if (u.indexOf('/rest/v1/labor_data') !== -1 && method === 'GET') {
      const m = /key=eq\.([^&]+)/.exec(u);
      const key = m ? decodeURIComponent(m[1]) : null;
      if (key && table[key] !== undefined) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ key, value: table[key] }]) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    }
    if (u.indexOf('/rest/v1/labor_data') !== -1 && method === 'POST') {
      const body = JSON.parse(opts.body);
      table[body.key] = body.value;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
  return { table, fetchImpl };
}

module.exports = {
  name: "dlSaveSchedule's merge-before-push protects a fresh Call-Off from a stale device's unrelated save (Carlos's real Guadalupe Cruz report)",
  async run(t) {
    const { table, fetchImpl } = makeTable();
    const ds = '2026-09-01';

    // ── Carlos's device: builds the week, marks Guadalupe CALL-OFF (the
    // real gesture — logging a call-off writes through to the Schedule
    // Draft via schedApplyCallOff). ──
    const { win: carlos } = await loadApp({ seed: fakeSession(), fetchImpl });
    await new Promise((r) => setTimeout(r, 60));
    carlos.dlSaveSchedule({
      days: {
        [ds]: { sheet: 't', occ: '100', dep: '40', tdOcc: '', td: [['Guadalupe', '1'], ['Aura', 'OFF']] },
      },
      count: 1,
      savedAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 80));

    const applied = carlos.schedApplyCallOff(ds, 'Guadalupe', 'Turndown Attendant');
    t.assert(applied, "schedApplyCallOff finds Guadalupe's row and marks it");
    t.eq(carlos.dlLoadSchedule().days[ds].td[0][1], 'CALL-OFF', "Guadalupe's cell reads CALL-OFF locally on Carlos's device");
    await new Promise((r) => setTimeout(r, 100)); // let the merge-then-push land

    const onServerAfterCallOff = JSON.parse(table['dl_schedule']);
    t.eq(onServerAfterCallOff.days[ds].td[0][1], 'CALL-OFF', "and the push actually landed on the server — this is the real state a second device would pull");

    // ── Ingrid's device: a STALE local copy of the same week, saved
    // BEFORE the call-off — she never touched Sept 1 at all, so her
    // copy of that day never got its own _at stamp. She makes an
    // unrelated edit to a DIFFERENT day, which still calls
    // dlSaveSchedule with her whole (stale) record. ──
    const { win: ingrid } = await loadApp({ seed: fakeSession(), fetchImpl });
    await new Promise((r) => setTimeout(r, 60));
    ingrid.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: {
        [ds]: { sheet: 't', occ: '100', dep: '40', tdOcc: '', td: [['Guadalupe', '1'], ['Aura', 'OFF']] }, // stale — no CALL-OFF, no _at
        '2026-09-02': { sheet: 't', occ: '90', dep: '30', tdOcc: '', td: [['Guadalupe', '1'], ['Aura', '1']] },
      },
      count: 2,
      savedAt: '2026-09-01T10:00:00.000Z',
    }));
    const staleSch = ingrid.dlLoadSchedule();
    staleSch.days['2026-09-02'].td[1][1] = 'OFF'; // her real, unrelated edit
    staleSch.savedAt = new Date().toISOString();
    ingrid.dlSaveSchedule(staleSch);
    await new Promise((r) => setTimeout(r, 100)); // let her merge-then-push land

    // ── The server must still show Guadalupe's CALL-OFF for Sept 1 —
    // Ingrid's push, even though it's "newer" as a whole record, must
    // not have clobbered a day she never actually touched. ──
    const onServerAfterIngrid = JSON.parse(table['dl_schedule']);
    t.eq(onServerAfterIngrid.days[ds].td[0][1], 'CALL-OFF', "Guadalupe's Call-Off survives Ingrid's unrelated save — this is the actual bug fix");
    t.eq(onServerAfterIngrid.days['2026-09-02'].td[1][1], 'OFF', "Ingrid's own real edit (Aura OFF on Sept 2) still goes through fine");

    // And Ingrid's own local copy picks up the correction too, not just
    // what got pushed — she now knows about the call-off as well.
    const ingridLocalAfter = ingrid.dlLoadSchedule();
    t.eq(ingridLocalAfter.days[ds].td[0][1], 'CALL-OFF', "Ingrid's local copy is corrected by the merge too, not just the server");

    // ── Carlos's follow-up: this should also just repair itself, with
    // no button to press — a Call-Off is a RECORD of a shift already
    // missed, not a plan that might be revised, so the cell should keep
    // saying so until the record itself is deleted.
    // schedSyncCallOffMarks re-marks a drifted cell on every render. ──
    const { win: w2 } = await loadApp({ seed: fakeSession(), fetchImpl });
    await new Promise((r) => setTimeout(r, 60));
    w2.saveCallOffs([{
      id: 1, date: ds, empId: '26100039', empName: 'Guadalupe Cruz',
      pos: 'Turndown Attendant', reason: 'Sick', created: '2026-09-01T17:17:34.242Z',
      schedCrew: 'td', schedName: 'Guadalupe', schedPrevVal: '1',
    }]);
    // A week where her cell has drifted back to '1' (the reported bug).
    w2.localStorage.setItem('hk_dl_schedule', JSON.stringify({
      days: { [ds]: { sheet: 't', occ: '100', dep: '40', tdOcc: '', td: [['Guadalupe', '1'], ['Aura', 'OFF']] } },
      count: 1, savedAt: new Date().toISOString(),
    }));
    const drifted = w2.dlLoadSchedule();
    t.assert(w2.schedSyncCallOffMarks(drifted, [ds]), 'reports a real change when a logged Call-Off has drifted back to working');
    t.eq(drifted.days[ds].td[0][1], 'CALL-OFF', "the drifted cell is re-marked automatically — no button, no manual re-entry");

    // Running it again with nothing drifted reports no change.
    t.assert(!w2.schedSyncCallOffMarks(drifted, [ds]), 'a second pass with nothing to repair reports changed:false');

    // ── The narrow scope that keeps this from ever arguing with a real
    // decision: a cell already showing ANY kind of absence is left
    // exactly as it is, so a granted R-OFF entered after the call-off
    // still wins. ──
    const granted = {
      days: { [ds]: { sheet: 't', occ: '100', dep: '40', tdOcc: '', td: [['Guadalupe', 'R-OFF'], ['Aura', 'OFF']] } },
      count: 1, savedAt: new Date().toISOString(),
    };
    t.assert(!w2.schedSyncCallOffMarks(granted, [ds]), 'no change reported when the cell already shows an absence');
    t.eq(granted.days[ds].td[0][1], 'R-OFF', 'a granted R-OFF entered afterward is never overwritten by the call-off re-mark');

    // A call-off that never matched a row in the first place (no
    // schedCrew logged) stays Carlos's to place by hand, as before.
    w2.saveCallOffs([{
      id: 2, date: ds, empId: '26100064', empName: 'Jorge Gonzalez',
      pos: 'House Attendant', reason: 'Sick', created: '2026-09-01T17:17:34.242Z',
    }]);
    const unmatched = {
      days: { [ds]: { sheet: 't', occ: '100', dep: '40', tdOcc: '', hp: [['Jorge Gonzalez', '1']] } },
      count: 1, savedAt: new Date().toISOString(),
    };
    t.assert(!w2.schedSyncCallOffMarks(unmatched, [ds]), 'a call-off that was never written through is not guessed at now either');
    t.eq(unmatched.days[ds].hp[0][1], '1', "and that person's cell is left untouched");
  },
};
