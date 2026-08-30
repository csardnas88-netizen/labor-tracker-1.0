/* Carlos's real bug, 2026-08-30: dl_schedule was pulled as one whole
   blob — whichever side had the newer top-level savedAt replaced the
   other ENTIRELY. Carlos built next week's Schedule Draft on his own
   device Aug 29 afternoon; a manager's device, still on an older local
   copy (missing that week), saved something unrelated that evening,
   and because its savedAt landed later, its stale copy replaced
   Carlos's local record outright — deleting the whole new week even
   though the manager's device had never touched it. Confirmed against
   the real Supabase row, which ended exactly on the manager's last
   loaded date.

   Fixed with _schedMergeRecord: day-keys (and the three person-level
   mark maps) are now UNIONED on pull, never wholesale-replaced. A
   day/mark either side is missing is always kept; only a day/mark
   BOTH sides actually have is decided by savedAt. This test pins that
   exact scenario so it can't quietly regress back to whole-blob
   overwrite. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Schedule Draft pull merges weeks together instead of one device's stale copy wiping out another's new week (Carlos's real 2026-08-30 bug)",
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

    // Carlos's device: the current week (Aug 29-Sep 4) PLUS the new week
    // he just built (Sep 5-11), saved most recently (afternoon of Aug 29).
    win.dlSaveSchedule({
      days: {
        '2026-08-29': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Rolando', '1']] },
        '2026-09-05': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Rolando', '1']] },
        '2026-09-06': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Rolando', 'OFF']] }
      },
      count: 3,
      savedAt: '2026-08-29T15:06:58.000Z'
    });

    // A manager's device: only ever saw the current week, never pulled
    // Carlos's new one — but saves something unrelated later THAT
    // evening, so its savedAt is the more recent one.
    getAllRows = [{
      key: 'dl_schedule',
      value: JSON.stringify({
        days: {
          '2026-08-29': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Rolando', '1']] }
        },
        count: 1,
        savedAt: '2026-08-29T18:35:42.000Z'
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));

    const after = JSON.parse(win.localStorage.getItem('hk_dl_schedule'));
    t.assert(!!after.days['2026-09-05'] && !!after.days['2026-09-06'],
      "the manager's older, newer-timestamped save does not delete the week Carlos's device has that the manager's never did");
    t.eq(after.days['2026-09-06'].gra[0][1], 'OFF',
      'the kept week is the real content, not a placeholder — Rolando is still OFF on the 6th');
    t.eq(after.days['2026-08-29'].gra[0][1], '1',
      "the day both devices share is still there (identical content either way here, so nothing to lose)");

    // ── The genuine-conflict case still resolves by savedAt: if the
    // remote side is newer AND both sides have the SAME day with
    // different content, the newer one wins for that day — this stays
    // a real merge, not "local always wins". ──
    getAllRows = [{
      key: 'dl_schedule',
      value: JSON.stringify({
        days: {
          '2026-08-29': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Rolando', 'OFF']] } // conflicting edit
        },
        count: 1,
        savedAt: new Date(Date.now() + 60000).toISOString() // clearly newer than anything above
      })
    }];
    win._syncFromSheetsPull();
    await new Promise((r) => setTimeout(r, 40));
    const afterConflict = JSON.parse(win.localStorage.getItem('hk_dl_schedule'));
    t.eq(afterConflict.days['2026-08-29'].gra[0][1], 'OFF',
      'a day both sides genuinely edited differently still resolves to whichever save is newer');
    t.assert(!!afterConflict.days['2026-09-05'] && !!afterConflict.days['2026-09-06'],
      "days the newer side never even had are still carried forward — a real merge, not a fresh whole-blob replace");
  }
};
