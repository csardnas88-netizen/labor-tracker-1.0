/* Carlos's real bug, 2026-08-23: two devices/tabs open, a fresh
   "Section assignment" re-upload (new Houseman names) kept getting
   silently undone. Root cause found by replicating the app's own
   dl_sections/dl_schedule pull-merge logic: dl_schedule already
   compared savedAt (last-write-wins) before overwriting the local
   copy, but dl_sections had NO such check at all — a stale device's
   own sync pull could clobber a fresh upload seconds after it landed,
   since the pull handler just overwrote hk_dl_sections with whatever
   Supabase had, unconditionally.

   Fixed by stamping savedAt in dlSaveSections and comparing it in the
   pull handler, exactly like dl_schedule already does. This test pins
   that comparison so it can't quietly regress back to unconditional
   overwrite. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Section assignment sync no longer clobbers a fresh upload with a stale device's older copy (Carlos's real Houseman bug)",
  async run(t) {
    let getAllRows = [];
    const fetchImpl = (url, options) => {
      options = options || {};
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.indexOf('/auth/v1/') !== -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
      if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (method === 'GET' && u.indexOf('/rest/v1/labor_data') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(getAllRows) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    };

    const seed = Object.assign(fakeSession(), {});
    const { win } = await loadApp({ seed, fetchImpl });
    await new Promise((r) => setTimeout(r, 60));

    // dlSaveSections stamps savedAt on its own — this is Carlos's real
    // upload path (dlUploadSections -> dlSaveSections).
    win.dlSaveSections({ gra: { '2nd': 'Ada' }, gra_floaters: [], hm: [['2nd - 5th', 'Mauricia']], hm_float: 'Diana', hm_pm: '', sup: [], sup_pm: '' });
    const saved = JSON.parse(win.localStorage.getItem('hk_dl_sections'));
    t.assert(typeof saved.savedAt === 'string' && saved.savedAt.length > 0, 'dlSaveSections stamps its own savedAt, same as dlSaveSchedule already does');

    // ── A stale device's own sync pull arrives carrying its OLDER
    // Sections copy (Elmer/Vanessa only, no David/Mauricia/Diana yet).
    // It must NOT overwrite the fresh local upload. ──
    getAllRows = [{
      key: 'dl_sections',
      value: JSON.stringify({
        gra: { '2nd': 'Old Owner' }, gra_floaters: [], hm: [['2nd - 5th', 'Elmer']], hm_float: '', hm_pm: '', sup: [], sup_pm: '',
        savedAt: '2020-01-01T00:00:00.000Z' // older than the fresh upload above
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    let afterStalePull = JSON.parse(win.localStorage.getItem('hk_dl_sections'));
    t.eq(afterStalePull.hm[0][1], 'Mauricia', "a stale device's older Sections copy does not clobber the fresh upload");
    t.eq(afterStalePull.gra['2nd'], 'Ada', 'the fresh floor assignment survives too, not just the Houseman list');

    // ── A genuinely NEWER remote copy (another device's own real edit,
    // made after this one) DOES win — this must stay a real merge, not
    // "local always wins" either. ──
    getAllRows = [{
      key: 'dl_sections',
      value: JSON.stringify({
        gra: { '2nd': 'Newer Owner' }, gra_floaters: [], hm: [['2nd - 5th', 'Someone Newer']], hm_float: '', hm_pm: '', sup: [], sup_pm: '',
        savedAt: new Date(Date.now() + 60000).toISOString() // clearly newer
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    const afterNewerPull = JSON.parse(win.localStorage.getItem('hk_dl_sections'));
    t.eq(afterNewerPull.hm[0][1], 'Someone Newer', 'a genuinely newer remote copy still wins — this is last-write-wins, not local-always-wins');

    // ── A pre-fix record with no savedAt at all must still lose to
    // anything with a real timestamp, so the transition itself is safe. ──
    win.localStorage.setItem('hk_dl_sections', JSON.stringify({ gra: {}, gra_floaters: [], hm: [['x', 'Legacy']], hm_float: '', hm_pm: '', sup: [], sup_pm: '' }));
    getAllRows = [{
      key: 'dl_sections',
      value: JSON.stringify({ gra: {}, gra_floaters: [], hm: [['x', 'Fresh']], hm_float: '', hm_pm: '', sup: [], sup_pm: '', savedAt: '2026-01-01T00:00:00.000Z' })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    const afterLegacyLocal = JSON.parse(win.localStorage.getItem('hk_dl_sections'));
    t.eq(afterLegacyLocal.hm[0][1], 'Fresh', 'a local record saved before this fix (no savedAt) loses to a timestamped remote one, same as before');
  }
};
