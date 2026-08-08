/* Labor Effectiveness syncs as one whole-blob record per week
   (hk_laboreff_<weekKey>), same shape of key as R106's hk_r106_<monthKey> —
   but merged differently on pull. R106 is a date-keyed dict where two
   devices' entries can genuinely coexist, so it merges field-by-field.
   A Labor Effectiveness record is one atomic snapshot from a single PDF:
   mixing positions from two different uploads would pair one report's
   Worked/Standard with a DIFFERENT report's Scheduled/Projected, wrong in
   a way nothing would surface later. So the whole record is last-write-
   wins by uploadedAt, never merged field-by-field. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor Effectiveness pushes as a whole-blob record and pulls last-write-wins by uploadedAt, never field-merged",
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
    await new Promise((r) => setTimeout(r, 60)); // let load-time sync settle

    // ── Push: saving a week's record pushes it under "laboreff_<weekKey>". ──
    pushedBodies.length = 0;
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: '2026-08-08T10:00:00.000Z'
    });
    await new Promise((r) => setTimeout(r, 40));
    const pushed = pushedBodies.find((b) => b.key === 'laboreff_2026-08-01');
    t.assert(pushed, 'saving a week pushes a "laboreff_2026-08-01" row');
    const pushedVal = JSON.parse(pushed.value);
    t.eq(pushedVal.positions['Turndown Attendant'].worked, 71.52, 'the pushed value carries the saved data');
    t.assert(!('actualCosts' in (pushedVal.positions['Turndown Attendant'] || {})), 'no cost field ever reaches the pushed payload either');

    // ── Pull: a NEWER remote record replaces an older local one, whole. ──
    win.localStorage.setItem('hk_laboreff_2026-08-01', JSON.stringify({
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: '2026-08-08T09:00:00.000Z' // older
    }));
    const newerRemote = {
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 130.00, projected: 220.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: '2026-08-08T11:00:00.000Z' // newer — a corrected re-upload from another device
    };
    getAllRows = [{ key: 'laboreff_2026-08-01', value: JSON.stringify(newerRemote) }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    let local = win.getLaborEffForWeek('2026-08-01');
    t.eq(local.positions['Turndown Attendant'].scheduled, 130.00, 'a newer remote upload replaces the whole local record');
    t.eq(local.uploadedAt, '2026-08-08T11:00:00.000Z');

    // ── An OLDER remote record must NOT overwrite a newer local one — the
    // exact scenario that matters: Carlos re-uploads a corrected PDF on
    // his phone, then opens the work computer, which still has the STALE
    // report cached remotely from before the correction landed everywhere. ──
    win.localStorage.setItem('hk_laboreff_2026-08-01', JSON.stringify({
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 999.00, projected: 999.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: '2026-08-08T12:00:00.000Z' // newer than remote below
    }));
    getAllRows = [{ key: 'laboreff_2026-08-01', value: JSON.stringify(newerRemote) }]; // still the 11:00 one, now stale
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    local = win.getLaborEffForWeek('2026-08-01');
    t.eq(local.positions['Turndown Attendant'].scheduled, 999.00, "the newer local record survives — a stale remote record must not resurrect over it");

    // ── Never field-merged: even though both records share the exact same
    // position key, a pull never mixes Worked from one with Scheduled from
    // the other — it's always the whole record from whichever is newer. ──
    getAllRows = [{ key: 'laboreff_2026-08-01', value: JSON.stringify(newerRemote) }];
    win.localStorage.setItem('hk_laboreff_2026-08-01', JSON.stringify({
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 999.00, projected: 999.00, hoursVariance: -18.48, variancePct: -21, otHours: 1.50 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: '2026-08-08T10:30:00.000Z' // OLDER than remote's 11:00 this time
    }));
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    local = win.getLaborEffForWeek('2026-08-01');
    t.eq(local.positions['Turndown Attendant'].scheduled, 130.00, "remote wins wholesale (130.00, not a mix with the local record's 999.00)");
    t.eq(local.positions['Turndown Attendant'].worked, 71.52, "including fields that happened to be identical on both — still from the winning record, not left over from the loser");
  }
};
