/* Carlos's real bug, chased across two computers over a long session:
   Houseman came up completely empty on the Daily Lineup, on every date,
   even though the schedule file's raw cell values were provably correct
   (verified byte-for-byte against the real report) and every other block
   on the same sheet (Supervisors, Lobby, Turndown...) parsed fine.

   dlParseSchedule locates each block by searching column A for an EXACT
   string match on its label ("Houseman", "Total HP", etc.). That label is
   hand-typed in Excel and can drift — a manager retyping it in caps, or
   leaving a doubled space — without it looking any different to the eye.
   Before this fix, that silently returned an empty block for the ENTIRE
   sheet, with no indication anything had gone wrong. This pins two
   things: the label match is now case/whitespace-tolerant, and when a
   block genuinely can't be found (or resolves to nobody), the plan now
   carries a reason string the page can show instead of a bare "nobody
   in" that looks identical whether it's a real day off or a parsing
   failure. */
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

/* A minimal but complete one-week sheet — just enough blocks for
   dlParseSchedule to run end to end. `hmLabel`/`hmTotalLabel` let each
   test drop in a drifted version of the Houseman labels specifically. */
function scheduleWb(hmLabel, hmTotalLabel) {
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push([i + 2, SERIAL(2026, 7, 8 + i)]);
  const F = 8; /* Friday */
  return {
    SheetNames: ['08.08-08.14'],
    Sheets: {
      '08.08-08.14': sheet({
        1: dates,
        2: [[2, 'Saturday'], [3, 'Sunday'], [4, 'Monday'], [5, 'Tuesday'], [6, 'Wednesday'], [7, 'Thursday'], [8, 'Friday']],
        7: [[1, 'OCC'], [F, '190']],
        8: [[1, 'Departures'], [F, '130']],
        10: [[1, 'Laundry']],
        13: [[1, 'Jorge Gonzalez'], [F, '1']],
        26: [[1, 'Total  Linen Att']],
        28: [[1, 'Managers']],
        30: [[1, 'Manny'], [F, '1']],
        34: [[1, 'Departures']],
        36: [[1, 'Rolando'], [F, '1']],
        42: [[1, 'Missing Supervisor']],
        50: [[1, 'AM lobby']],
        58: [[1, 'Total  Lobby Att']],
        60: [[1, 'PM Turndown /GRA']],
        73: [[1, 'Total  TD attd']],
        80: [[1, 'Overnight']],
        84: [[1, 'Total  ON Attd']],
        86: [[1, 'AM ROOM ATTENDANT']],
        117: [[1, 'Total Room Att']],
        122: [[1, hmLabel]],
        123: [[1, 'Supervisor'], [F, '3']],
        124: [[1, 'Mauricia'], [F, '1']],
        125: [[1, 'David'], [F, 'OFF']],
        126: [[1, 'Diana'], [F, '1']],
        132: [[1, hmTotalLabel]]
      })
    }
  };
}

function sectionsWb() {
  return {
    SheetNames: ['GRA', 'HM & Supervisor'],
    Sheets: {
      GRA: sheet({ 5: [[2, 'Floor'], [4, 'Name']] }, 10),
      'HM & Supervisor': sheet({
        7: [[1, '2nd - 5th'], [2, 'Mauricia'], [5, '2nd - 5th'], [6, 'Rolando']],
        8: [[1, '6th - 9th'], [2, 'David']],
        13: [[1, 'Floater'], [2, 'Diana']],
      }, 8)
    }
  };
}

module.exports = {
  name: "Daily Lineup: Houseman still resolves through a case/spacing-drifted label, and an empty block explains why",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));
    win.XLSX.utils.sheet_to_json = (ws) => ws._rows;

    win.dlSaveSections(win.dlParseSections(sectionsWb()));

    // ── Case 1: the label is typed exactly as expected — sanity check the
    // fixture itself works before testing the drifted variants. ──
    const good = win.dlParseSchedule(scheduleWb('Houseman', 'Total HP'), new Date(2026, 7, 13));
    win.dlSaveSchedule(good); win.dlSaveScheduleSnapshot(good);
    let P = win.dlBuildPlan('2026-08-14');
    t.eq(P.hm.join(','), 'Mauricia,Diana', 'baseline: Mauricia and Diana are in, David is OFF');
    t.eq(P.hmEmptyReason, undefined, 'no reason string when the block is not empty');

    // ── Case 2: the SAME real label, but retyped in caps with a doubled
    // space — exactly the kind of drift a manager\'s typo produces,
    // invisible to the eye. This must still resolve correctly now. ──
    const capsSchedule = win.dlParseSchedule(scheduleWb('HOUSEMAN', 'Total  HP'), new Date(2026, 7, 13));
    t.assert(capsSchedule.days['2026-08-14'].hp.length > 0, "the block is found even though the label is in caps");
    win.dlSaveSchedule(capsSchedule); win.dlSaveScheduleSnapshot(capsSchedule);
    P = win.dlBuildPlan('2026-08-14');
    t.eq(P.hm.join(','), 'Mauricia,Diana', 'and the plan comes out identical to the exact-case version');

    // ── Case 3: the label genuinely is not on the sheet at all (renamed
    // to something unrelated) — this SHOULD come up empty, but the page
    // needs to say why instead of looking like an ordinary quiet day. ──
    const missingSchedule = win.dlParseSchedule(scheduleWb('Housekeepers', 'Total HP'), new Date(2026, 7, 13));
    t.eq(missingSchedule.days['2026-08-14'].hp.length, 0, "a genuinely different label finds nothing, as expected");
    win.dlSaveSchedule(missingSchedule); win.dlSaveScheduleSnapshot(missingSchedule);
    P = win.dlBuildPlan('2026-08-14');
    t.eq(P.hm.length, 0, 'Houseman comes up empty');
    t.assert(/find|section/i.test(P.hmEmptyReason || ''), 'and the plan explains that the section itself could not be found, not just "nobody in"');
  }
};
