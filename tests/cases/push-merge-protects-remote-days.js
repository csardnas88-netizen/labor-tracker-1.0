/* Reproduces the 2026-07-23 incident under the new per-day-row model: a device
   whose local month blob is missing a day the CLOUD already has (a report
   uploaded from a different device it never pulled) makes an UNRELATED save
   (editing a room count). Under the old single-blob model this pushed the
   stale whole-month copy and erased the cloud-only day. Now each day is its
   own row (mday_<mk>_<ds>) written through labor_upsert_many, and a save only
   upserts the rows for the days IT changed — it never deletes or rewrites a
   day it doesn't have. So the cloud-only day must remain untouched. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A stale device's save must not erase a day only the cloud has",
  async run(t) {
    // Shared cloud modeling labor_upsert_many's ts-conditional atomic upsert.
    const table = {};
    const tsOf = (val) => { try { return JSON.parse(val).ts || ''; } catch (e) { return ''; } };
    const applyRow = (row) => { const cur = table[row.key]; if (cur === undefined || tsOf(cur) <= tsOf(row.value)) table[row.key] = row.value; };

    // Cloud already has day 22 (uploaded elsewhere) as its own row.
    table['mday_2026-07_2026-07-22'] = JSON.stringify({ v: { date: '2026-07-22', totalPaid: 55, emps: [] }, ts: '2026-07-23T08:00:00.000Z' });

    const fetchImpl = (url, opts) => {
      opts = opts || {};
      const method = (opts.method || 'GET').toUpperCase();
      const u = String(url);
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (u.indexOf('/rest/v1/rpc/labor_upsert_many') !== -1 && method === 'POST') {
        ((JSON.parse(opts.body).p_rows) || []).forEach(applyRow);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(1) });
      }
      if (u.indexOf('/rest/v1/labor_data') !== -1 && method === 'GET') {
        const rows = Object.keys(table).map((k) => ({ key: k, value: table[k] }));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    // Local copy has only day 21 — it never pulled day 22.
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: { '2026-07-21': { date: '2026-07-21', totalPaid: 40, emps: [] } },
        daysUpdatedAt: { '2026-07-21': '2026-07-21T10:00:00.000Z' },
        rooms: {}, roomsSource: {}, roomsUpdatedAt: {},
      },
    });

    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));   // let load-time sync settle

    // Unrelated local edit: a manual room count for a THIRD day. This triggers
    // a save/push — which under the old model clobbered the cloud.
    const md = win.loadMonthData('2026-07');
    md.rooms = md.rooms || {}; md.roomsSource = md.roomsSource || {}; md.roomsUpdatedAt = md.roomsUpdatedAt || {};
    md.rooms['2026-07-19'] = 175; md.roomsSource['2026-07-19'] = 'manual'; md.roomsUpdatedAt['2026-07-19'] = '2026-07-24T00:00:00.000Z';
    win.saveMonthData(md, '2026-07');
    await new Promise((r) => setTimeout(r, 80));

    // Day 22's row must still be intact in the cloud — never touched.
    t.assert(table['mday_2026-07_2026-07-22'], 'day 22 (only in the cloud) must survive a stale device\'s unrelated save');
    t.eq(JSON.parse(table['mday_2026-07_2026-07-22']).v.totalPaid, 55, 'day 22 content must be unchanged');
    // The device pushed its own room edit as its own row (added, not blob-replaced).
    t.assert(table['mroom_2026-07_2026-07-19'], 'the room edit that triggered the save should be pushed as its own row');
    t.eq(JSON.parse(table['mroom_2026-07_2026-07-19']).v, 175, 'the room edit value should be there');
  }
};
