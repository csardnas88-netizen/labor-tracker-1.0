/* Carlos's real report, 2026-11-22: he changed several Room Attendants'
   schedule cells, then noticed one reverted; separately, tabbing through
   several days' "Drop to Tomorrow" numbers, some came back blank and he
   had to retype them. Both go through the one shared chokepoint every
   Schedule edit uses — schedSetCell/schedSetNum/schedSetDrop all read a
   fresh copy via dlLoadSchedule(), mutate it, then call dlSaveSchedule(o).

   dlSaveSchedule writes locally FIRST (safe), then asynchronously pulls
   the remote row, merges it with the snapshot `o` it was called with, and
   — only when that merge actually differs from `o` (e.g. a teammate's
   device pushed something new in the meantime) — overwrites localStorage
   with the merge result. That overwrite used to replace localStorage
   UNCONDITIONALLY with a result computed from `o`, the snapshot taken
   back when dlSaveSchedule was first called. Carlos edits quickly — tab
   to the next cell before the previous edit's remote round trip even
   lands — so a LATER edit's own (already-saved) localStorage write could
   get stomped by an EARLIER edit's merge callback finally resolving,
   discarding the later edit entirely. Worse, these are real network
   calls with no ordering guarantee: the earlier edit's own remote fetch
   can easily resolve AFTER the later edit's, so the clobber isn't even
   limited to "the very next edit" — any edit still in flight when an
   older one's callback finally lands can vanish.

   Reproduced here with the first edit's remote fetch deliberately
   resolving LAST (the realistic worst case), and fixed by re-merging
   against whatever is CURRENTLY in localStorage — not just the stale
   snapshot — before any overwrite. */
const { loadApp, fakeSession } = require('../_harness');

function makeFetchImpl() {
  let schedGetCount = 0;
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
    if (method === 'GET' && u.indexOf('key=eq.dl_schedule') !== -1) {
      schedGetCount++;
      // A teammate's device already added a later week — this is what makes
      // the merge result genuinely differ from the caller's own snapshot,
      // which is what unlocks the overwrite path being tested here.
      const remoteRow = [{
        value: JSON.stringify({
          days: {
            '2026-11-10': { gra: [['Maritza', '1']], _at: 1 },
            '2026-11-17': { gra: [['Other', '1']], _at: 2 },
          },
          count: 2,
          savedAt: new Date(10000).toISOString(),
        })
      }];
      // First call (the first edit's own fetch) resolves LAST — the
      // realistic worst case where network responses land out of order.
      const delay = schedGetCount === 1 ? 150 : 20;
      return new Promise((resolve) => setTimeout(() => resolve({
        ok: true, status: 200, json: () => Promise.resolve(remoteRow),
      }), delay));
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  };
}

module.exports = {
  name: "Schedule: an edit made while an earlier edit's cloud sync is still in flight is not wiped out once that earlier sync finally resolves",
  async run(t) {
    const seedState = {
      days: { '2026-11-10': { gra: [['Maritza', '1']], _at: 1 } },
      count: 1,
      savedAt: new Date(10000).toISOString(),
    };
    const seed = Object.assign(fakeSession(), { hk_dl_schedule: JSON.stringify(seedState) });
    const { win } = await loadApp({ seed, fetchImpl: makeFetchImpl() });
    await new Promise((r) => setTimeout(r, 60)); // let load-time pulls settle

    // Edit 1: Maritza's cell → OFF. Kicks off its own remote fetch (150ms).
    const SCH1 = win.dlLoadSchedule();
    SCH1.days['2026-11-10'].gra[0][1] = 'OFF';
    SCH1.savedAt = new Date().toISOString();
    win.dlSaveSchedule(SCH1);

    // Edit 2 lands while edit 1's fetch is still pending — exactly
    // "tabbing to the next cell quickly." Its own fetch resolves fast (20ms).
    await new Promise((r) => setTimeout(r, 15));
    const SCH2 = win.dlLoadSchedule();
    t.eq(SCH2.days['2026-11-10'].gra[0][1], 'OFF', 'edit 2 starts from edit 1\'s already-saved value');
    SCH2.days['2026-11-10'].gra.push(['Sandra', 'VAC']);
    SCH2.savedAt = new Date().toISOString();
    win.dlSaveSchedule(SCH2);

    // Let both async chains fully settle, including the slow first one.
    await new Promise((r) => setTimeout(r, 250));

    const final = win.dlLoadSchedule();
    const names = final.days['2026-11-10'].gra.map((r) => r[0]);
    t.assert(names.indexOf('Sandra') !== -1, 'edit 2 (added while edit 1 was still syncing) survives once edit 1\'s own slower sync finally resolves');
    t.eq(final.days['2026-11-10'].gra[0][1], 'OFF', 'edit 1 itself is also still intact');
    t.assert(!!final.days['2026-11-17'], 'the teammate\'s remote week is still picked up by the merge');
  }
};
