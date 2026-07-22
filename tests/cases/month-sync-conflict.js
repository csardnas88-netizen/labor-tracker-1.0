/* Month data (day reports + room counts) is the one sync path that never got
   the last-write-wins treatment projects/call-offs got in v6.9.0 — a pull
   always let the cloud value win for any day present on both sides, with no
   timestamp check, and roomsSource ("manual" protection) wasn't even carried
   through the merge at all. Guards both: (1) roomsSource survives a sync,
   (2) a newer local edit beats an older remote one instead of being silently
   clobbered, and (3) old untimestamped data keeps the historical
   remote-wins behavior so nothing changes for days synced before this fix. */
const { loadApp, fakeSession } = require('../_harness');

function remoteRowsFetch(monthValue) {
  return (url) => {
    if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data') !== -1) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve([{ key: 'month_2026-07', value: JSON.stringify(monthValue) }]),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Month sync: roomsSource survives, and last-write-wins protects newer edits",
  async run(t) {
    // Case 1: local has a MANUAL room count for 07-20, made just now (newer than
    // the remote's r106-sourced value from an hour ago). Local must win, and
    // "manual" must still be set afterward — not wiped or overwritten.
    const now = Date.now();
    const seed1 = Object.assign(fakeSession(), {});
    seed1['hk_month_2026-07'] = JSON.stringify({
      rooms: { '2026-07-20': 180 },
      roomsSource: { '2026-07-20': 'manual' },
      roomsUpdatedAt: { '2026-07-20': new Date(now).toISOString() },
      days: {}, daysUpdatedAt: {},
    });

    const remoteOlder = {
      rooms: { '2026-07-20': 999 }, // an older, stale r106 value from another device
      roomsSource: { '2026-07-20': 'r106' },
      roomsUpdatedAt: { '2026-07-20': new Date(now - 3600000).toISOString() }, // 1h older
      days: {}, daysUpdatedAt: {},
    };

    const { win: win1 } = await loadApp({ seed: seed1, fetchImpl: remoteRowsFetch(remoteOlder) });
    win1.syncFromSheets();
    await new Promise((r) => setTimeout(r, 200));

    const merged1 = win1.loadMonthData('2026-07');
    t.eq(merged1.rooms['2026-07-20'], 180, 'newer local manual room count must survive the sync, not be overwritten by an older remote value');
    t.eq(merged1.roomsSource['2026-07-20'], 'manual', 'roomsSource must be preserved through the merge, not dropped');

    // Case 2: remote is NEWER than local for a different day — remote should win.
    const seed2 = Object.assign(fakeSession(), {});
    seed2['hk_month_2026-07'] = JSON.stringify({
      rooms: { '2026-07-21': 100 },
      roomsSource: { '2026-07-21': 'manual' },
      roomsUpdatedAt: { '2026-07-21': new Date(now - 3600000).toISOString() }, // 1h older
      days: {}, daysUpdatedAt: {},
    });
    const remoteNewer = {
      rooms: { '2026-07-21': 205 },
      roomsSource: { '2026-07-21': 'manual' },
      roomsUpdatedAt: { '2026-07-21': new Date(now).toISOString() },
      days: {}, daysUpdatedAt: {},
    };
    const { win: win2 } = await loadApp({ seed: seed2, fetchImpl: remoteRowsFetch(remoteNewer) });
    win2.syncFromSheets();
    await new Promise((r) => setTimeout(r, 200));
    const merged2 = win2.loadMonthData('2026-07');
    t.eq(merged2.rooms['2026-07-21'], 205, 'newer remote room count should win over an older local one');

    // Case 3: neither side has a timestamp (pre-fix data) — remote wins, same
    // as the historical behavior, so old already-synced days don't change.
    const seed3 = Object.assign(fakeSession(), {});
    seed3['hk_month_2026-07'] = JSON.stringify({ rooms: { '2026-07-22': 50 }, roomsSource: {}, days: {} });
    const remoteNoTs = { rooms: { '2026-07-22': 212 }, roomsSource: {}, days: {} };
    const { win: win3 } = await loadApp({ seed: seed3, fetchImpl: remoteRowsFetch(remoteNoTs) });
    win3.syncFromSheets();
    await new Promise((r) => setTimeout(r, 200));
    const merged3 = win3.loadMonthData('2026-07');
    t.eq(merged3.rooms['2026-07-22'], 212, 'with no timestamps on either side, remote should win (unchanged historical behavior)');
  }
};
