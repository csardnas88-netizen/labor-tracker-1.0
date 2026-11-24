/* Checked during review of the dl_schedule save-race fix (7.136.0), alongside
   dlSaveDay (same session, same bug class). dlSaveSections turned out NOT to
   need the same fix: `function dlSaveSections(o){ o.savedAt=...; safeSetItem(...);
   supaPut(...); }` never reads anything back from Supabase before writing —
   there is no async fetch-merge-then-maybe-overwrite-local step at all, so
   there is no window for a SECOND same-device upload's local save to get
   clobbered by a FIRST upload's delayed response, the way dl_schedule/dl_day
   both did. This test documents and pins that: two sequential uploads on one
   device, the later one always wins locally, no code change required — it
   already passes against dlSaveSections completely unmodified.

   The gap dlSaveSections' own header comment flags ("the dl_sections clobber
   fix was only ever applied on the PULL side") is a DIFFERENT, bigger problem
   than the one just fixed elsewhere: two DIFFERENT DEVICES each doing a full
   re-upload around the same time, where whichever device's supaPut POST lands
   last on Supabase wins outright — true last-write-wins with no merge, on the
   server, not a local in-flight-edit race. Fixing that would mean adding a
   fetch-before-push step that doesn't exist here today (unlike dl_schedule/
   dl_day, which already had one to adapt). Deliberately left as a separate,
   not-yet-attempted follow-up rather than rushed in here. */
const { loadApp, fakeSession } = require('../_harness');

function makeFetchImpl(state) {
  let getCount = 0;
  return (url, options) => {
    options = options || {};
    const method = (options.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.indexOf('/auth/v1/') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) });
    }
    if (method === 'POST' && u.indexOf('/rest/v1/labor_data') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    }
    if (method === 'GET' && u.indexOf('key=eq.dl_sections') !== -1) {
      getCount++;
      // A third device's upload already reached Supabase between upload 1
      // and upload 2 starting — newer than upload 1's own snapshot, older
      // than upload 2's (state.remoteSavedAt is set by the test right after
      // upload 1 is saved, a few ms ahead of it). This is exactly what a
      // naive "remote is newer than my stale snapshot, so remote wins"
      // merge would wrongly resurrect over upload 2's genuinely newer save.
      const remoteRow = [{
        value: JSON.stringify({ gra: { '3': 'Remote Person' }, savedAt: state.remoteSavedAt })
      }];
      // First call (upload 1's own fetch) resolves LAST — the realistic
      // worst case where network responses land out of order.
      const delay = getCount === 1 ? 150 : 20;
      return new Promise((resolve) => setTimeout(() => resolve({
        ok: true, status: 200, json: () => Promise.resolve(remoteRow),
      }), delay));
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Daily Lineup Sections save: a re-upload made while an earlier upload's cloud sync is still in flight is not wiped out once that earlier sync finally resolves",
  async run(t) {
    const seedState = { gra: { '1': 'Old Person' }, gra_floaters: [], savedAt: new Date(10000).toISOString() };
    const seed = Object.assign(fakeSession(), { hk_dl_sections: JSON.stringify(seedState) });
    const state = {};
    const { win } = await loadApp({ seed, fetchImpl: makeFetchImpl(state) });
    await new Promise((r) => setTimeout(r, 60)); // let load-time pulls settle

    // Upload 1: an older corrected file. Kicks off its own remote fetch
    // (150ms).
    const up1 = { gra: { '1': 'Upload One' }, gra_floaters: [] };
    win.dlSaveSections(up1);
    // The 3rd device's row lands a few ms after upload 1's own stamp —
    // newer than upload 1, but (since upload 2 is still 15ms away) older
    // than upload 2's.
    state.remoteSavedAt = new Date(Date.parse(up1.savedAt) + 5).toISOString();

    // Upload 2 lands while upload 1's fetch is still pending. Its own fetch
    // resolves fast (20ms) and sees the SAME 3rd-device row, which is older
    // than upload 2's own just-stamped savedAt, so upload 2 correctly wins
    // its own merge.
    await new Promise((r) => setTimeout(r, 15));
    const mid = win.dlLoadSections();
    t.eq(mid.gra['1'], 'Upload One', "upload 2 starts from upload 1's already-saved value");
    win.dlSaveSections({ gra: { '1': 'Upload Two' }, gra_floaters: [] });

    // Let both async chains fully settle, including the slow first one.
    await new Promise((r) => setTimeout(r, 250));

    const final = win.dlLoadSections();
    t.eq(final.gra['1'], 'Upload Two', "upload 2 (the genuinely newest save) survives once upload 1's own slower sync finally resolves");
  }
};
