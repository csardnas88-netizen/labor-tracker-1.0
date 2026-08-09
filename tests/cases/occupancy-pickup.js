/* Occupancy pickup — Carlos's ask, verbatim: "si el lunes al subir el
   R106 se registraron 100 habitaciones, para el miércoles al subir el
   R106 existió un incremento... registrar ese incremento".

   hk_r106_<mk> cannot answer this on its own: every upload REPLACES that
   month's record, so the previous OCC's figure for the same night is
   gone the instant a newer one lands. hk_occhist_<mk> is the append-only
   log added alongside it. The three things that must hold, and that this
   file pins:

     1. Re-uploading the SAME figure is not a revision. Carlos re-uploads
        corrected OCCs routinely; each one must not manufacture a +0
        "pickup" entry that pads the log and the readings count.
     2. A night's FIRST reading is a baseline, not a pickup — counting it
        would make the very first upload after this shipped look like a
        whole month of movement that never happened.
     3. A remote merge UNIONS readings. This is an append-only log, the
        one shape where a last-write-wins overwrite genuinely destroys
        data: the other device's readings would be gone with nothing
        left to show they ever existed. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Occupancy pickup: OCC readings accumulate per night, unchanged re-uploads add nothing, and a remote merge unions rather than overwrites",
  async run(t) {
    const seed = Object.assign(fakeSession(), { 'hk_rooms_migrated_v2': '1' });
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    // ── Monday's OCC: first read of two nights. Neither is a pickup. ──
    let revised = win.recordOccRevisions('2026-08', {
      '2026-08-20': { occ: 105, comp: 5, net: 100 },
      '2026-08-21': { occ: 152, comp: 2, net: 150 }
    });
    t.eq(revised, 0, 'a night seen for the first time is a baseline, not a pickup — nothing to report yet');
    let hist = win.loadOccHist('2026-08');
    t.eq(hist['2026-08-20'].length, 1, 'but the reading IS recorded, so a later one has something to compare against');
    t.eq(hist['2026-08-20'][0].net, 100, "storing the night's net figure");
    t.assert(hist['2026-08-20'][0].at, 'stamped with when it was read');

    // ── Re-uploading the identical OCC (a corrected report that didn't
    // change these nights) must not log a thing. ──
    revised = win.recordOccRevisions('2026-08', {
      '2026-08-20': { occ: 105, comp: 5, net: 100 },
      '2026-08-21': { occ: 152, comp: 2, net: 150 }
    });
    t.eq(revised, 0, 'an unchanged re-upload reports no revisions');
    hist = win.loadOccHist('2026-08');
    t.eq(hist['2026-08-20'].length, 1, 'and appends nothing — the log stays a list of CHANGES, not of uploads');

    // ── Wednesday's OCC: Aug 20 picked up 12 rooms, Aug 21 unchanged. ──
    revised = win.recordOccRevisions('2026-08', {
      '2026-08-20': { occ: 117, comp: 5, net: 112 },
      '2026-08-21': { occ: 152, comp: 2, net: 150 }
    });
    t.eq(revised, 1, 'exactly one night moved, and only that one is counted');
    hist = win.loadOccHist('2026-08');
    t.eq(hist['2026-08-20'].length, 2, 'the night that moved now carries two readings');
    t.eq(hist['2026-08-20'][1].net, 112, 'the newer figure is appended, not written over the old one');
    t.eq(hist['2026-08-20'][0].net, 100, 'and the original reading survives — that is the whole point of the log');
    t.eq(hist['2026-08-21'].length, 1, 'the unchanged night stays at one reading');

    // ── The rendered card: Carlos's exact scenario, end to end. ──
    let html = win.buildOccPickupHTML('2026-08');
    t.assert(/Pickup/i.test(html), 'the pickup card renders');
    t.assert(/\+12/.test(html), 'the +12 room pickup is shown as the headline number for that night');
    t.assert(/100/.test(html) && /112/.test(html), 'with both the first and the latest reading, so the movement is auditable');
    t.assert(!/Aug 21/.test(html), 'a night that never moved is left out — a list of zeros would bury the ones that matter');

    // ── A drop reads as a drop, not an unsigned number or a double
    // negative. Cancellations are real and must be legible. ──
    win.recordOccRevisions('2026-08', { '2026-08-21': { occ: 142, comp: 2, net: 140 } });
    html = win.buildOccPickupHTML('2026-08');
    t.assert(/-10/.test(html), 'a night that lost 10 rooms shows -10');

    // ── Empty month: an explanation, not a broken card. ──
    const emptyHtml = win.buildOccPickupHTML('2026-01');
    t.assert(/No night in this month has changed/i.test(emptyHtml),
      'a month with no recorded movement explains itself rather than rendering an empty table');

    // ── Merge: the remote device logged a reading this one never saw.
    // Both must survive. ──
    const local = { '2026-09-01': [{ net: 200, at: '2026-09-01T10:00:00.000Z' }] };
    const remote = { '2026-09-01': [{ net: 215, at: '2026-09-02T10:00:00.000Z' }], '2026-09-05': [{ net: 90, at: '2026-09-05T10:00:00.000Z' }] };
    const merged = win._mergeOccHist(local, remote);
    t.eq(merged['2026-09-01'].length, 2, "a remote reading this device never saw is added, not dropped");
    t.eq(merged['2026-09-01'][0].net, 200, 'and the merged log stays in chronological order');
    t.eq(merged['2026-09-01'][1].net, 215);
    t.assert(merged['2026-09-05'], 'a night only the remote knows about comes across whole');

    // ── The same reading arriving from both sides (the normal case once
    // both devices have synced) must not double up. ──
    const dup = win._mergeOccHist(
      { '2026-09-10': [{ net: 100, at: '2026-09-10T10:00:00.000Z' }] },
      { '2026-09-10': [{ net: 100, at: '2026-09-10T10:00:00.000Z' }] }
    );
    t.eq(dup['2026-09-10'].length, 1, 'the same reading seen from both sides stays a single entry');

    // ── A union can interleave two devices' entries into a run of the
    // same figure; the log must still read as a list of changes. ──
    const runs = win._mergeOccHist(
      { '2026-09-11': [{ net: 100, at: '2026-09-11T10:00:00.000Z' }, { net: 100, at: '2026-09-11T12:00:00.000Z' }] },
      { '2026-09-11': [{ net: 100, at: '2026-09-11T11:00:00.000Z' }, { net: 130, at: '2026-09-11T13:00:00.000Z' }] }
    );
    t.eq(runs['2026-09-11'].length, 2, 'consecutive identical figures collapse to one');
    t.eq(runs['2026-09-11'][1].net, 130, 'leaving the genuine change intact');
  }
};
