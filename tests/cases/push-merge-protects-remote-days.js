/* Reproduces the 2026-07-23 incident: a device whose local month blob is
   missing a day the CLOUD already has (e.g. a report uploaded from a
   different device it never pulled) makes an unrelated local save (editing
   a room count) — before this fix, that save PUSHED the stale local blob
   straight to Supabase, silently erasing the day that only existed in the
   cloud, with nothing ever having "deleted" it directly. saveMonthData must
   now fetch the current remote state and merge before pushing, so a stale
   device can only add/update its own edits, never erase what's already in
   the cloud — and its own local copy should get healed with what it was
   missing. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A stale device's save must not erase a day only the cloud has",
  async run(t) {
    // Local copy is missing 2026-07-22 entirely (the "stale device").
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: { '2026-07-21': { totalPaid: 40, emps: [] } },
        daysUpdatedAt: { '2026-07-21': '2026-07-21T10:00:00.000Z' },
        rooms: { '2026-07-20': 150 },
        roomsSource: {},
        roomsUpdatedAt: {},
      },
    });

    // The cloud has day 22 (uploaded from a different device) that this
    // device's local copy never pulled.
    const remoteMonth = {
      days: { '2026-07-22': { totalPaid: 55, emps: [] } },
      daysUpdatedAt: { '2026-07-22': '2026-07-23T08:00:00.000Z' },
      rooms: {},
      roomsSource: {},
      roomsUpdatedAt: {},
    };

    let pushedBody = null;
    const fetchImpl = (url, opts) => {
      if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data?select=value&key=eq.month_2026-07') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ key: 'month_2026-07', value: JSON.stringify(remoteMonth) }]) });
      }
      if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data') !== -1 && opts && opts.method === 'POST') {
        pushedBody = JSON.parse(opts.body);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    const { win } = await loadApp({ seed, fetchImpl });

    // Simulate an unrelated local edit on the stale device (a manual room
    // count for a THIRD day) — this is what triggers the save/push.
    const mData = win.loadMonthData('2026-07');
    mData.rooms['2026-07-19'] = 175;
    win.saveMonthData(mData, '2026-07');

    // Let the async GET-then-merge-then-push chain settle.
    await new Promise((r) => setTimeout(r, 100));

    t.assert(pushedBody, 'a POST to labor_data should have been made');
    const pushedValue = JSON.parse(pushedBody.value);
    t.assert(pushedValue.days['2026-07-22'], 'day 22 (only in the cloud) must survive the push, not get erased');
    t.eq(pushedValue.days['2026-07-22'].totalPaid, 55, 'day 22 content should be the real cloud version');
    t.assert(pushedValue.days['2026-07-21'], 'the local device\'s own existing day should still be there');
    t.eq(pushedValue.rooms['2026-07-19'], 175, 'the actual edit that triggered this save should still be included');

    // This device's own local copy should also get healed with day 22.
    const healedLocal = win.loadMonthData('2026-07');
    t.assert(healedLocal.days['2026-07-22'], 'the local copy should be healed with the day it was missing');
  }
};
