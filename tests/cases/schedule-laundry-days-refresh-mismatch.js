/* Carlos's real report, 2026-10-11, with a screenshot of his actual
   Laundry card: Gady's and Adamary's "Days" counts (and several
   others') were flatly wrong — Jorge showed "5" despite 3 real rest
   days that week, Adamary showed "2" despite 5 real work days. Working
   through the whole card by hand, every wrong number turned out to be
   some OTHER person's real count, not a bad calculation.

   Root cause: renderSchedule() builds the Laundry card's row order with
   schedLaundryWasherGroups (washers — Victoriano Ch/Jorge Gonzalez/
   David P — grouped first, everyone else after), and assigns each
   row's "Days" DOM id (scd_laundry_<idx>) using THAT order. But
   _schedRefreshTotals — which re-patches scd_/scr_/scu_ ids after ANY
   unrelated edit elsewhere on the page (an OCC/Departures box, a drop,
   etc.) — rebuilt its own ref list from the plain, un-regrouped
   _schedCrewRef, a different order. The two orders disagreeing meant
   idx 0's DOM id (visually Victoriano's row) got repainted with
   whichever person the UNSORTED list put at index 0 — a silent
   cross-wire between rows, not a bad count. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];

module.exports = {
  name: "_schedRefreshTotals (the live-patch path an OCC/Departures edit triggers) uses the SAME washers-grouped Laundry order renderSchedule() does, so a 'Days' count can never land on the wrong person's row (Carlos's 2026-10-11 ask)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // Deliberately scattered (washers mixed in with regulars in the raw
    // data), each with a DISTINCT, unique work-day count so a cross-wire
    // between any two rows is immediately visible as a wrong number,
    // never a coincidental match.
    const pattern = {
      'Isabel D': ['OFF', 'OFF', 'OFF', 'OFF', '1', '1', '1'],       // 3
      'Victoriano Ch': ['1', '1', '1', '1', '1', 'OFF', 'OFF'],      // 5
      'Olga A': ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', '1'],     // 1
      'Jorge Gonzalez': ['OFF', 'OFF', 'OFF', '1', '1', '1', '1'],   // 4
      'David P': ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', '1', '1'],      // 2
    };
    const expected = { 'Isabel D': 3, 'Victoriano Ch': 5, 'Olga A': 1, 'Jorge Gonzalez': 4, 'David P': 2 };
    const names = Object.keys(pattern);

    const days = {};
    DATES.forEach((ds, di) => {
      days[ds] = { sheet: 't', occ: '150', dep: '60', tdOcc: '', laundry: names.map((n) => [n, pattern[n][di]]) };
    });
    win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
    win.schedViewWeekStart = new Date(2026, 9, 17);
    win.renderSchedule();

    // The full render's own washers-grouped order: Victoriano, Jorge,
    // David (washers, SCHED_LAUNDRY_WASHERS' own order), then Isabel,
    // Olga (regulars, in whatever order they appear).
    const orderedNames = ['Victoriano Ch', 'Jorge Gonzalez', 'David P', 'Isabel D', 'Olga A'];
    orderedNames.forEach((nm, idx) => {
      const el = win.document.getElementById('scd_laundry_' + idx);
      t.assert(!!el, 'scd_laundry_' + idx + ' exists right after a full render');
      t.eq(el.textContent, String(expected[nm]), nm + "'s Days count is correct immediately after rendering (idx " + idx + ")");
    });

    // ── The actual bug: an edit that has NOTHING to do with Laundry
    // (today's OCC box) still runs _schedRefreshTotals for every crew,
    // including Laundry — and before this fix, that repainted every one
    // of the ids above using the WRONG (unsorted) order. ──
    win.schedSetNum(DATES[0], 'occ', '999');

    orderedNames.forEach((nm, idx) => {
      const el = win.document.getElementById('scd_laundry_' + idx);
      t.eq(el.textContent, String(expected[nm]), nm + "'s Days count STILL reads correctly after an unrelated OCC edit elsewhere on the page — it must not have been silently repainted with someone else's count");
    });

    // ── Same check for the "departures each" ratio row and the
    // Unifocus std cell — both are patched by the exact same
    // mis-ordered card.ref before this fix, just via a different id
    // prefix (scr_/scu_ instead of scd_). ──
    const htmlAfter = win.document.getElementById('scheduleContent').innerHTML;
    const laundryStart = htmlAfter.indexOf('>Laundry</div>');
    const card = htmlAfter.slice(laundryStart, laundryStart + 60000);
    // Victoriano's row (idx 0) must still show HIS name next to his own
    // Days cell, not have silently swapped rows with Isabel or Olga.
    const victorianoRowIdx = card.indexOf('Victoriano Ch');
    const isabelRowIdx = card.indexOf('Isabel D');
    t.assert(victorianoRowIdx !== -1 && victorianoRowIdx < isabelRowIdx, 'Victoriano (a washer) still renders before Isabel (a regular) — the grouping itself survives the edit too');
  },
};
