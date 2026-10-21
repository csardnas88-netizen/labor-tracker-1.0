/* Carlos's real report, 2026-10-21: his work PC's Departures for two real
   days (Oct 12/13) stayed blank even after a confirmed successful sync,
   while his laptop — which had never touched that field — correctly
   showed R106's own figure. Clearing the Departures box IS deliberate
   ("I don't know this day," confirmed by unifocus-houseperson.js — it
   stays null, never silently reverts to R106) and that part was already
   correct and already tested. The actual gap: saveDeparturesForDate
   clears a day by delete()-ing its key from mData.departures — the same
   class of bug dnd-delete-pushes-clear.js found and fixed for DND room
   lists — so _pushMonthRows's normal loop (which only walks keys still
   PRESENT in departures) never sees it, and the clear only ever takes
   effect on the device that made it. Every other device just keeps
   showing whatever it already had, with no way to learn THIS device
   made a deliberate "don't guess" call for that day.

   Fixed by diffing the push shadow (every date ever successfully pushed)
   against what's still actually in departures now, and pushing one
   explicit v:null row (still carrying the 'manual' tag) for anything
   that dropped out — so every device learns the same deliberate null,
   not just whichever one made the call. Pinned here the same way the DND
   test pins it: by inspecting the actual POST body to labor_upsert_many,
   since local reads alone look correct even without the fix (the bug was
   specifically that nothing ever got pushed) — and by actually feeding
   that pushed row into a SECOND app instance to confirm the clear really
   reaches another device, not just that a row gets sent. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Clearing a manual Departures entry actually pushes the clear as a null tombstone (not just a local-only change), and another device pulling it adopts the same deliberate null instead of its own R106 figure',
  async run(t) {
    const pushedBodies = [];
    const fetchImplA = (url, options) => {
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

    const seedA = Object.assign(fakeSession(), {});
    const { win: winA } = await loadApp({ seed: seedA, fetchImpl: fetchImplA });
    await new Promise((r) => setTimeout(r, 60));

    // ── Device A: a manual entry pushes its own mdep_ row. ──
    winA.saveDeparturesForDate('2026-07-20', '55');
    await new Promise((r) => setTimeout(r, 80));
    let savedRow = pushedBodies[pushedBodies.length - 1].p_rows.find((r) => r.key === 'mdep_2026-07_2026-07-20');
    t.assert(savedRow, 'the manual entry pushed its own mdep_ row');
    t.eq(JSON.parse(savedRow.value).v, 55, 'the pushed row carries the value that was saved');

    // ── Device A clears it — a deliberate "I don't know this day." ──
    pushedBodies.length = 0;
    winA.saveDeparturesForDate('2026-07-20', '');
    await new Promise((r) => setTimeout(r, 80));
    t.eq(winA.getDeparturesForDay('2026-07-20'), null, 'local read confirms the deliberate null, before touching the push side at all');

    const clearRow = pushedBodies.length ? pushedBodies[pushedBodies.length - 1].p_rows.find((r) => r.key === 'mdep_2026-07_2026-07-20') : null;
    t.assert(clearRow, 'clearing a manual entry must push its own mdep_ row too — this is the actual bug: it silently pushed nothing before the fix');
    const clearVal = JSON.parse(clearRow.value);
    t.eq(clearVal.v, null, 'the pushed row carries an explicit null, not just omission');
    t.eq(clearVal.src, 'manual', "the pushed tombstone still carries the 'manual' tag, so another device learns this was a deliberate call, not a plain unset");

    // ── Device B: never touched this date, so it currently shows R106's
    // own number (90 for this date, seeded below) — until it pulls the
    // tombstone device A just pushed, at which point it must adopt the
    // SAME deliberate null, not keep showing its own R106 figure. ──
    const remoteRows = [{ key: 'mdep_2026-07_2026-07-20', value: JSON.stringify(clearVal) }];
    const fetchImplB = (url, options) => {
      options = options || {};
      const method = (options.method || 'GET').toUpperCase();
      const u = String(url);
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'GET' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(remoteRows) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };
    const seedB = Object.assign(fakeSession(), {
      'hk_r106_2026-07': JSON.stringify({ '2026-07-20': { occ: 90, comp: 0, net: 90, dep: 90 } }),
    });
    const { win: winB } = await loadApp({ seed: seedB, fetchImpl: fetchImplB });
    await new Promise((r) => setTimeout(r, 60));

    t.eq(winB.getDeparturesForDay('2026-07-20'), 90, "before pulling, device B correctly shows its own R106 figure (90) — it never made a manual call");

    winB.syncFromSheets();
    await new Promise((r) => setTimeout(r, 150));

    t.eq(winB.getDeparturesForDay('2026-07-20'), null, 'after pulling the tombstone, device B adopts the SAME deliberate null instead of keeping its own R106 number — the actual cross-device propagation Carlos needed');
  },
};
