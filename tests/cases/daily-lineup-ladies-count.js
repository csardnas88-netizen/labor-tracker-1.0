/* Carlos's real report, 2026-11-25: on the Daily Lineup, "X.XX rooms each"
   only ever counted floors that already have an owner — a Section file
   floor owner, or a floater he's already dragged onto a specific floor.
   A floater he hasn't placed yet (still sitting under "Floaters — you
   decide where each one goes") is a real Room Attendant working that
   day, but was left out of the denominator entirely, so "rooms each"
   quietly understated how many hands were actually splitting the work
   until the moment he got around to placing her. Fixed with
   dlLadiesCount: every covered floor counts once, plus any floater who
   hasn't landed on a counted floor yet — checked by name so a floater
   who's already been placed is never counted twice. */
const { loadApp, fakeSession } = require('../_harness');

const SERIAL = (y, m, d) => Date.UTC(y, m, d) / 86400000 + 25569;
function sheet(spec, width = 9) {
  const maxR = Math.max(...Object.keys(spec).map(Number));
  const rows = [];
  for (let r = 1; r <= maxR; r++) {
    const row = new Array(width).fill('');
    (spec[r] || []).forEach(([c, v]) => { row[c - 1] = v; });
    rows.push(row);
  }
  return { _rows: rows };
}

module.exports = {
  name: "Daily Lineup's ladies count (and 'rooms/departures each') includes an unplaced floater, not just floors that already have an owner",
  async run(t) {
    const { win } = await loadApp({ seed: Object.assign(fakeSession(), {}) });
    win.XLSX.utils.sheet_to_json = (ws) => ws._rows;

    const S = win.dlParseSections({
      SheetNames: ['GRA', 'HM & Supervisor'],
      Sheets: {
        GRA: sheet({ 5: [[2, 'Floor'], [4, 'Name']], 7: [[2, '3rd'], [4, 'Ada']] }, 10),
        'HM & Supervisor': sheet({ 7: [[1, '2nd - 5th'], [2, 'X']] }, 8)
      }
    });
    S.gra_floaters = [];
    win.dlSaveSections(S);

    const F = 2;
    const SCH = win.dlParseSchedule({
      SheetNames: ['wk'],
      Sheets: {
        wk: sheet({
          1: [[2, SERIAL(2026, 10, 26)]],
          2: [[2, 'Thursday']],
          7: [[1, 'OCC'], [F, '90']],
          8: [[1, 'Departures'], [F, '40']],
          86: [[1, 'AM ROOM ATTENDANT']],
          91: [[1, 'Departures'], [F, '40']],
          92: [[1, 'Ada'], [F, '1']],
          93: [[1, 'Nueva Floater'], [F, '1']],
          117: [[1, 'Total Room Att']]
        }, 9)
      }
    }, new Date(2026, 10, 26));
    win.dlSaveSchedule(SCH);
    win.localStorage.setItem('hk_section_owners', JSON.stringify({ floaters: { f1: 'Nueva Floater' }, _at: {} }));

    const ds = Object.keys(SCH.days)[0];
    const P = win.dlBuildPlan(ds);
    t.eq(P.floaters.join(','), 'Nueva Floater', 'sanity: she is a real floater working that day');

    const floors = win.dlFinalFloors(P);
    t.eq(Object.keys(floors).length, 1, "sanity: only Ada's floor is actually owned yet — this is the OLD (undercounting) figure");
    t.eq(win.dlLadiesCount(P, floors), 2, 'the unplaced floater still counts as a real body splitting the day\'s rooms, even though she owns no floor yet');

    // Once Carlos drags her onto a real floor, she must still count —
    // exactly once, not double-counted with the floor tally.
    win.dlSaveDay(ds, { assign: { 'Nueva Floater': '4th' } });
    const P2 = win.dlBuildPlan(ds);
    const floors2 = win.dlFinalFloors(P2);
    t.eq(Object.keys(floors2).length, 2, 'placing her gives her a floor of her own');
    t.eq(win.dlLadiesCount(P2, floors2), 2, 'and the ladies count stays the same — she was already counted before being placed, not added a second time');
  }
};
