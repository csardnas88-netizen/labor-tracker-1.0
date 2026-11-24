/* Found during review of the dl_schedule save-race fix (7.136.0): dlSaveDay,
   the Daily Lineup's per-day save (floater placements, the per-day "Floors"
   column, the Lady rows, the Occupancy boxes), had ZERO merge protection —
   not even the whole-blob fetch-merge dlSaveSchedule had before ITS fix,
   just a raw local overwrite plus a raw cloud push. Carlos edits this same
   kind of form the same quick way (tab through several fields in a row), so
   the identical race applies: dlSetFloors/dlSetLady/dlSetExtra/dlSetOcc all
   read a fresh copy via dlLoadDay(ds), mutate ONE field, then call
   dlSaveDay(ds, rec) — and an EARLIER edit's remote round trip resolving
   AFTER a LATER edit's own (already-saved) localStorage write could stomp
   the later edit, exact same class as the Schedule bug, just never even
   attempted a fix here.

   Reproduced with the first edit's remote fetch deliberately resolving LAST
   (the realistic worst case, same setup as the Schedule race test) and
   fixed the same way: before overwriting localStorage with a merge of the
   stale snapshot, re-merge again against whatever dlLoadDay(ds) currently
   holds. */
const { loadApp, fakeSession } = require('../_harness');

const DS = '2026-11-24';

function makeFetchImpl() {
  let dayGetCount = 0;
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
    if (method === 'GET' && u.indexOf('key=eq.dl_day_' + DS) !== -1) {
      dayGetCount++;
      // A teammate's device already placed a floater this device never
      // touched — this is what makes the merge genuinely differ from the
      // caller's own snapshot, unlocking the overwrite path being tested.
      const remoteRow = [{ value: JSON.stringify({ assign: { 'Floater Z': 'Floor 9' } }) }];
      // First call (the first edit's own fetch) resolves LAST — the
      // realistic worst case where network responses land out of order.
      const delay = dayGetCount === 1 ? 150 : 20;
      return new Promise((resolve) => setTimeout(() => resolve({
        ok: true, status: 200, json: () => Promise.resolve(remoteRow),
      }), delay));
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Daily Lineup day save: an edit made while an earlier edit's cloud sync is still in flight is not wiped out once that earlier sync finally resolves",
  async run(t) {
    const seed = fakeSession();
    const { win } = await loadApp({ seed, fetchImpl: makeFetchImpl() });
    await new Promise((r) => setTimeout(r, 60)); // let load-time pulls settle

    // Edit 1: Carlos types the Supervisor's floors. Kicks off its own
    // remote fetch (150ms).
    win.dlDate = DS;
    win.dlSetFloors('Supervisor', '3-5');

    // Edit 2 lands while edit 1's fetch is still pending — exactly
    // "tabbing to the next field quickly." Its own fetch resolves fast (20ms).
    await new Promise((r) => setTimeout(r, 15));
    const mid = win.dlLoadDay(DS);
    t.eq(mid.floors.Supervisor, '3-5', "edit 2 starts from edit 1's already-saved value");
    win.dlSetFloors('Houseman', '6-9');

    // Let both async chains fully settle, including the slow first one.
    await new Promise((r) => setTimeout(r, 250));

    const final = win.dlLoadDay(DS);
    t.eq(final.floors.Houseman, '6-9', "edit 2 (added while edit 1 was still syncing) survives once edit 1's own slower sync finally resolves");
    t.eq(final.floors.Supervisor, '3-5', 'edit 1 itself is also still intact');
    t.eq(final.assign && final.assign['Floater Z'], 'Floor 9', "the teammate's remote floater placement is still picked up by the merge");
  }
};
