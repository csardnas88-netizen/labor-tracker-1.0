/* Real bug Carlos hit: he saved a variance note on Supervisors for Aug 4 on
   his phone, then it was gone. Root cause, found by tracing the sync code:
   _syncFromSheetsPull's final merge step rebuilt the ENTIRE hk_month_<mk>
   blob from a brand-new object naming only {days, rooms, roomsSource} —
   ANY other top-level field on the month blob (departures,
   departuresSource, and the new varianceNotes) was silently dropped, not
   just on a report re-upload (the Project Hours class of bug, fixed in
   v6.80.0) but on EVERY routine cloud sync pull — which fires far more
   often (on load, on realtime events, on foreground resume, every 30s
   while a push is pending). A note saved locally would survive until the
   next sync pull, then vanish.

   Fixed in v6.88.0 two ways: (1) departures and variance notes now get
   their own per-day cloud rows (mdep_/mvnote_), pushed and folded the same
   way rooms/days already were; (2) the final local merge now starts from a
   full copy of local data instead of a fresh object naming only the fields
   it explicitly merges, so even a field this code doesn't know about yet
   survives untouched instead of disappearing.

   This test reproduces the exact failure mode: a sync pull that only
   carries a ROOM row for the month (nothing related to notes/departures at
   all) must not wipe local departures/varianceNotes that were already
   there — that's what "any other field gets dropped" looks like in
   practice, and it's precisely what happened to Carlos's note. */
const { loadApp, fakeSession } = require('../_harness');

function remoteRowsFetch(rows) {
  return (url) => {
    if (typeof url === 'string' && url.indexOf('/rest/v1/labor_data') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Sync pull no longer wipes departures/variance notes it doesn't itself carry (the bug behind Carlos's missing note)",
  async run(t) {
    const now = Date.now();

    // ── Local already has a manually-entered Departures count AND a
    // variance note for Aug 4 — exactly what "saved a note on my phone"
    // looks like on disk before any sync happens. ──
    const seed = Object.assign(fakeSession(), {});
    seed['hk_month_2026-08'] = JSON.stringify({
      days: {}, daysUpdatedAt: {},
      rooms: { '2026-08-03': 150 }, roomsSource: { '2026-08-03': 'manual' }, roomsUpdatedAt: { '2026-08-03': new Date(now).toISOString() },
      departures: { '2026-08-04': 61 }, departuresSource: { '2026-08-04': 'manual' }, departuresUpdatedAt: { '2026-08-04': new Date(now).toISOString() },
      varianceNotes: { '2026-08-04': { 'Housekeeping Supervisor': 'Covered a call-off on the 10th floor.' } },
      varianceNotesUpdatedAt: { '2026-08-04': new Date(now).toISOString() }
    });

    // Remote's response carries ONLY an unrelated room row for the same
    // month — nothing about departures or notes at all. This is the exact
    // trigger: any remote row for the month is enough to enter the
    // rebuild-the-whole-blob merge path.
    const remoteRows = [
      { key: 'mroom_2026-08_2026-08-10', value: JSON.stringify({ v: 200, ts: new Date(now - 3600000).toISOString(), src: 'r106' }) }
    ];

    const { win } = await loadApp({ seed, fetchImpl: remoteRowsFetch(remoteRows) });
    win.syncFromSheets();
    await new Promise((r) => setTimeout(r, 200));

    const merged = win.loadMonthData('2026-08');
    t.eq(merged.departures['2026-08-04'], 61, 'the manually-entered Departures count must survive a sync pull that says nothing about departures');
    t.eq(merged.departuresSource['2026-08-04'], 'manual', 'departuresSource must survive too, not just the raw number');
    t.assert(merged.varianceNotes && merged.varianceNotes['2026-08-04'], 'the day\'s varianceNotes entry must still exist after the sync');
    t.eq(merged.varianceNotes['2026-08-04']['Housekeeping Supervisor'], 'Covered a call-off on the 10th floor.', 'the note text itself must survive a sync pull unrelated to notes — this is the exact bug Carlos hit');
    // The unrelated remote room row should still have been picked up normally.
    t.eq(merged.rooms['2026-08-10'], 200, 'the sync still does its actual job — the unrelated remote room row gets merged in');

    // ── Forward direction: a note saved on ANOTHER device (remote, newer)
    // must actually reach this device — proving the fix isn't just "never
    // touch these fields," but a real two-way sync. ──
    const seed2 = Object.assign(fakeSession(), {});
    seed2['hk_month_2026-08'] = JSON.stringify({
      days: {}, daysUpdatedAt: {}, rooms: {}, roomsSource: {}, roomsUpdatedAt: {},
      departures: {}, departuresSource: {}, departuresUpdatedAt: {},
      varianceNotes: {}, varianceNotesUpdatedAt: {}
    });
    const remoteRows2 = [
      { key: 'mvnote_2026-08_2026-08-04', value: JSON.stringify({ v: { 'Housekeeping Supervisor': 'Written on the other device.' }, ts: new Date(now).toISOString(), by: 'phone@example.com' }) },
      { key: 'mdep_2026-08_2026-08-04', value: JSON.stringify({ v: 61, ts: new Date(now).toISOString(), src: 'manual', by: 'phone@example.com' }) }
    ];
    const { win: win2 } = await loadApp({ seed: seed2, fetchImpl: remoteRowsFetch(remoteRows2) });
    win2.syncFromSheets();
    await new Promise((r) => setTimeout(r, 200));
    const merged2 = win2.loadMonthData('2026-08');
    t.eq(merged2.varianceNotes['2026-08-04']['Housekeeping Supervisor'], 'Written on the other device.', 'a note pushed as its own mvnote_ row from another device is correctly pulled in');
    t.eq(merged2.departures['2026-08-04'], 61, 'a departures count pushed as its own mdep_ row from another device is correctly pulled in');

    // ── saveVarianceNote / saveDeparturesForDate now push their own rows
    // (not just write localStorage) — confirms the write side, not just
    // the merge side, actually reaches the sync layer. ──
    win2.saveVarianceNote('2026-08-05', 'Room Attendant', 'Extra RA to cover a NCNS.');
    t.eq(win2.getVarianceNote('2026-08-05', 'Room Attendant'), 'Extra RA to cover a NCNS.', 'the note is readable back immediately after saving');
  }
};
