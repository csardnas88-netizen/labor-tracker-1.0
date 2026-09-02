/* Carlos's real report: in the Training section, marking an employee
   Complete sometimes erased OTHER employees' progress. Root cause:
   hk_trainings pushed the WHOLE array as one blob (supaPut is a raw
   overwrite, no server-side merge) — so if this device's local copy
   hadn't yet picked up another device's more recent mark (no pull
   happened in between), pushing simply replaced the whole row and
   silently erased that mark. Same whole-blob-clobber class already
   fixed for month data (push-merge-protects-remote-days.js) and the
   Schedule Draft, just never applied here.

   saveTrainingsMerged (used by applyTrStatus/applyBulkMark) now fetches
   the current remote copy right before pushing and merges it in first,
   so a push can only ADD progress this device didn't know about, never
   erase it. */
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
  name: "saveTrainingsMerged merges the current remote copy before pushing, so marking one employee Complete never erases another device's more recent mark (Carlos's real report)",
  async run(t) {
    const { table, fetchImpl } = makeTable();

    // Remote already has Employee Y marked Complete by "another device" —
    // this device never pulled it before making its own edit.
    const remoteTrainings = [
      { id: 'tr1', title: 'Fire Safety', scope: 'all', done: {}, prog: { empY: { st: 'complete', at: Date.now() - 60000, date: '2026-09-01' } }, updated: '2026-09-01T10:00:00.000Z' },
    ];
    table['hk_trainings'] = JSON.stringify(remoteTrainings);

    // This device's local copy is stale — saved before Employee Y was
    // marked, so it has no idea that entry exists.
    const seed = Object.assign(fakeSession(), {
      hk_trainings: [
        { id: 'tr1', title: 'Fire Safety', scope: 'all', done: {}, prog: {}, updated: '2026-09-01T09:00:00.000Z' },
      ],
    });

    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));

    // The real user action Carlos reported: mark a DIFFERENT employee Complete.
    win.applyTrStatus('tr1', 'empX', 'complete');
    await new Promise((r) => setTimeout(r, 100)); // let the fetch-merge-push resolve

    // What actually landed on the server must have BOTH marks — this
    // device's push must not have erased Employee Y's.
    const pushed = JSON.parse(table['hk_trainings']);
    const pushedT1 = pushed.filter((x) => x.id === 'tr1')[0];
    t.eq(win.trGetStatus(pushedT1, 'empY'), 'complete', "Employee Y's mark (from another device, never pulled here) survives this device's push");
    t.eq(win.trGetStatus(pushedT1, 'empX'), 'complete', "Employee X's own new mark is on the server too");

    // Local storage reflects the same merged truth, not just what got pushed.
    const localT1 = win.loadTrainings().filter((x) => x.id === 'tr1')[0];
    t.eq(win.trGetStatus(localT1, 'empY'), 'complete', 'the merge lands locally too — this device now knows about Y as well');
    t.eq(win.trGetStatus(localT1, 'empX'), 'complete', "and this device's own edit is still there");

    // ── A genuine conflict: THIS device's own mark for the SAME employee
    // is newer than whatever the (unrelated) remote fetch returns for
    // that employee — the newer `at` must win, never the stale one. ──
    const { table: table2, fetchImpl: fetchImpl2 } = makeTable();
    table2['hk_trainings'] = JSON.stringify([
      { id: 'tr2', title: 'CPR', scope: 'all', done: {}, prog: { empZ: { st: 'pending', at: Date.now() - 120000, date: '' } }, updated: '2026-09-01T08:00:00.000Z' },
    ]);
    const seed2 = Object.assign(fakeSession(), {
      hk_trainings: [
        { id: 'tr2', title: 'CPR', scope: 'all', done: {}, prog: { empZ: { st: 'pending', at: Date.now() - 120000, date: '' } }, updated: '2026-09-01T08:00:00.000Z' },
      ],
    });
    const { win: win2 } = await loadApp({ seed: seed2, fetchImpl: fetchImpl2 });
    await new Promise((r) => setTimeout(r, 60));
    win2.applyTrStatus('tr2', 'empZ', 'complete'); // this device's own newer edit for the SAME employee
    await new Promise((r) => setTimeout(r, 100));
    const pushed2 = JSON.parse(table2['hk_trainings']).filter((x) => x.id === 'tr2')[0];
    t.eq(win2.trGetStatus(pushed2, 'empZ'), 'complete', "this device's own newer edit wins over the stale remote value for the same employee");

    // ── Safety check: deleteTraining still uses the plain overwrite
    // path (saveTrainings, not saveTrainingsMerged) — merging remote
    // back in right after a local delete would resurrect the very
    // training just removed, since the merge has no concept of an
    // intentional deletion. ──
    const { table: table3, fetchImpl: fetchImpl3 } = makeTable();
    table3['hk_trainings'] = JSON.stringify([
      { id: 'tr3', title: 'Old Policy', scope: 'all', done: {}, prog: {}, updated: '2026-08-01T00:00:00.000Z' },
    ]);
    const seed3 = Object.assign(fakeSession(), {
      hk_trainings: [
        { id: 'tr3', title: 'Old Policy', scope: 'all', done: {}, prog: {}, updated: '2026-08-01T00:00:00.000Z' },
      ],
    });
    const { win: win3 } = await loadApp({ seed: seed3, fetchImpl: fetchImpl3 });
    await new Promise((r) => setTimeout(r, 60));
    win3.deleteTraining('tr3');
    await new Promise((r) => setTimeout(r, 60));
    t.assert(!win3.loadTrainings().some((x) => x.id === 'tr3'), 'deleted training is gone locally');
    const pushed3 = JSON.parse(table3['hk_trainings'] || '[]');
    t.assert(!pushed3.some((x) => x.id === 'tr3'), 'and gone from what was pushed — delete is not undone by a merge');

    // ── Carlos's real report: the clobber kept happening even on the
    // version that shipped this fix. Root cause — the GET that fetches
    // remote before merging used authedFetch directly, which only
    // refreshes an expiring token PROACTIVELY; a token that goes stale
    // in the gap between that check and the request landing still came
    // back a 401 with no retry, and the old code silently treated ANY
    // non-ok response as "remote has nothing", pushing an unmerged local
    // copy — the exact clobber this mechanism exists to prevent.
    // _fetchRemoteTrainings now retries once after a forced refresh on a
    // 401, same as supaPut already does on the write side. ──
    let getAttempts = 0;
    let authCalls = 0;
    const table4 = {};
    table4['hk_trainings'] = JSON.stringify([
      { id: 'tr4', title: 'Fire Safety', scope: 'all', done: {}, prog: { empY: { st: 'complete', at: Date.now() - 60000, date: '2026-09-01' } }, updated: '2026-09-01T10:00:00.000Z' },
    ]);
    const fetchImpl4 = (url, opts) => {
      opts = opts || {};
      const method = (opts.method || 'GET').toUpperCase();
      const u = String(url);
      if (u.indexOf('/auth/v1/token') !== -1) {
        authCalls++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 }) });
      }
      if (u.indexOf('/auth/v1/') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      }
      if (u.indexOf('/rest/v1/labor_data') !== -1 && method === 'GET') {
        getAttempts++;
        // First attempt: the token looked fine locally but the server
        // has already rejected it — the retry (after a forced refresh)
        // must succeed and actually return the real remote data.
        if (getAttempts === 1) return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ key: 'hk_trainings', value: table4['hk_trainings'] }]) });
      }
      if (u.indexOf('/rest/v1/labor_data') !== -1 && method === 'POST') {
        const body = JSON.parse(opts.body);
        table4[body.key] = body.value;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const seed4 = Object.assign(fakeSession(), { hk_sa_ref: 'ref0' }, {
      hk_trainings: [
        { id: 'tr4', title: 'Fire Safety', scope: 'all', done: {}, prog: {}, updated: '2026-09-01T09:00:00.000Z' },
      ],
    });
    const { win: win4 } = await loadApp({ seed: seed4, fetchImpl: fetchImpl4 });
    await new Promise((r) => setTimeout(r, 60));
    getAttempts = 0; authCalls = 0;
    win4.applyTrStatus('tr4', 'empX', 'complete');
    await new Promise((r) => setTimeout(r, 120));

    t.eq(getAttempts, 2, 'the 401 on the pre-push GET is retried once, not silently treated as "remote has nothing"');
    t.eq(authCalls, 1, 'the retry forces exactly one session refresh first');
    const pushed4 = JSON.parse(table4['hk_trainings']).filter((x) => x.id === 'tr4')[0];
    t.eq(win4.trGetStatus(pushed4, 'empY'), 'complete', "Employee Y's mark survives — the retried GET actually found and merged the real remote data");
    t.eq(win4.trGetStatus(pushed4, 'empX'), 'complete', "and this device's own new mark is there too");
  },
};
