/* Found 2026-11-05 during a bug-class audit, not from a report — but it
   is the same "delete comes back" shape that has already bitten in
   production elsewhere, and Training was the one journal still missing
   the guard.

   Every other per-record journal in the app (Call-Offs, Late Arrivals,
   Projects, Request Off) records an intentional delete in its own
   tombstone list — calloffs_deleted_ids and friends — which syncs like
   any other key, so a device that still holds the record learns it was
   deleted on purpose. Training had no such list, and trMergeLists is a
   UNION: anything either side holds survives.

   That makes a deleted training come back by itself:
     1. Carlos deletes a training here. The push writes a list without
        it, so the server is correct.
     2. Another manager's device still has it (it hasn't pulled yet).
     3. That device marks ANYONE complete on ANY training, which runs
        saveTrainingsMerged: fetch remote (no longer has it), union with
        local (still has it) -> it survives the merge and is pushed back.
     4. It is now on the server again, and every device pulls it back.

   Nothing warns anybody; the training just reappears days later with all
   its records. Both halves are pinned below: the push must not put it
   back, and a pull must not quietly re-adopt it either. */
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

const DELETED = { id: 'trGone', title: 'Old Fire Safety', scope: 'all', done: {}, prog: {}, updated: '2026-09-01T09:00:00.000Z' };
const KEPT = { id: 'trKeep', title: 'CPR', scope: 'all', done: {}, prog: {}, updated: '2026-09-01T09:00:00.000Z' };

module.exports = {
  name: 'A deleted Training stays deleted: another device that still holds it must not push it back when it marks someone complete, and must not re-adopt it on a pull',
  async run(t) {
    // ── The other manager's device: deleting here must record a tombstone ──
    {
      const { table, fetchImpl } = makeTable();
      const seed = Object.assign(fakeSession(), { hk_trainings: [DELETED, KEPT] });
      const { win } = await loadApp({ seed, fetchImpl });
      await new Promise((r) => setTimeout(r, 60));
      win.confirm = () => true;
      win.deleteTraining('trGone');
      await new Promise((r) => setTimeout(r, 60));

      t.assert(win.loadTrainings().every((x) => x.id !== 'trGone'), 'the training is gone locally after deleting it');
      const tomb = JSON.parse(win.localStorage.getItem('trainings_deleted_ids') || '[]');
      t.assert(tomb.indexOf('trGone') !== -1,
        'deleting records an intentional-delete tombstone, the same way Call-Offs and Projects already do: ' + JSON.stringify(tomb));
      t.assert(table['trainings_deleted_ids'] !== undefined,
        'and the tombstone is pushed, so other devices can learn the delete was deliberate');
    }

    // ── This device is the stale one: it still holds the deleted training ──
    {
      const { table, fetchImpl } = makeTable();
      table['hk_trainings'] = JSON.stringify([KEPT]);          // server: already deleted
      table['trainings_deleted_ids'] = JSON.stringify(['trGone']);
      const seed = Object.assign(fakeSession(), {
        hk_trainings: [DELETED, KEPT],                          // local: still has it
        trainings_deleted_ids: ['trGone'],                      // this device knows the delete
      });
      const { win } = await loadApp({ seed, fetchImpl });
      await new Promise((r) => setTimeout(r, 60));

      // The ordinary action that triggers the resurrection: mark anyone
      // complete on an UNRELATED training.
      win.applyTrStatus('trKeep', 'empX', 'complete');
      await new Promise((r) => setTimeout(r, 120));

      const pushed = JSON.parse(table['hk_trainings']);
      t.assert(pushed.every((x) => x.id !== 'trGone'),
        'marking someone complete must not push the deleted training back onto the server: ' + JSON.stringify(pushed.map((x) => x.id)));
      t.assert(pushed.some((x) => x.id === 'trKeep'), 'the training that was not deleted is still pushed normally');
      t.assert(win.loadTrainings().every((x) => x.id !== 'trGone'),
        'and the merge drops it locally too, instead of keeping a copy that will push back later');
    }

    // ── The merge itself: a tombstoned id is never re-adopted from remote ──
    {
      const { fetchImpl } = makeTable();
      const seed = Object.assign(fakeSession(), { trainings_deleted_ids: ['trGone'] });
      const { win } = await loadApp({ seed, fetchImpl });
      await new Promise((r) => setTimeout(r, 60));

      // Remote still carries it (an older device pushed before learning of
      // the delete). A pull must not bring it back.
      const merged = win.trMergeLists([KEPT], [DELETED, KEPT]);
      t.assert(merged.every((x) => x.id !== 'trGone'),
        'a pull never re-adopts a training this device knows was deleted on purpose: ' + JSON.stringify(merged.map((x) => x.id)));
      t.eq(merged.length, 1, 'and the rest of the merge is untouched');
    }
  },
};
