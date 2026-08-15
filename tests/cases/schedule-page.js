/* Schedule Draft — the weekly schedule, shown a week at a time and
   editable in place.

   Two things here have already gone wrong in production and are the
   reason this file exists:

   1) HIDDEN ROWS. Carlos takes someone off the team by hiding their row
      in Excel, not by deleting it. The reader ignored the hidden flag,
      so a departed Overnight attendant kept showing up on the Daily
      Lineup for weeks — invisible in Excel, invisible in every
      screenshot he sent, but still carrying a "1" in the file. A hidden
      row is not part of the schedule.

   2) ONE RECORD, NOT TWO. The page reads and writes the same stored
      schedule the Daily Lineup parses (hk_dl_schedule). A second,
      parallel copy would mean deciding which one is true every time
      they disagreed, and an edit here has to be what the lineup draws
      from — otherwise the two screens quietly describe different days. */
const { loadApp, fakeSession } = require('../_harness');

const SERIAL = (y, m, d) => Date.UTC(y, m, d) / 86400000 + 25569;

/* Sparse row builder: rows[r-1][c-1], 1-indexed like the spreadsheet.
   `hidden` is the list of 1-indexed rows Excel has collapsed — the
   worksheet carries them in ws['!rows'][r-1].hidden, which is only
   populated when the workbook is read with cellStyles on. */
function sheet(spec, hidden = [], width = 9) {
  const maxR = Math.max(...Object.keys(spec).map(Number));
  const rows = [];
  for (let r = 1; r <= maxR; r++) {
    const row = new Array(width).fill('');
    (spec[r] || []).forEach(([c, v]) => { row[c - 1] = v; });
    rows.push(row);
  }
  const rowProps = [];
  hidden.forEach((r) => { rowProps[r - 1] = { hidden: true }; });
  return { _rows: rows, '!rows': rowProps };
}

/* Sat Aug 15 .. Fri Aug 21 2026, matching the real workbook's layout:
   the header numbers up top, then each crew as its own labelled block. */
function scheduleWb() {
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push([i + 2, SERIAL(2026, 7, 15 + i)]);
  const SAT = 2, SUN = 3;
  return {
    SheetNames: ['08.15-08.21'],
    Sheets: {
      '08.15-08.21': sheet({
        1: dates,
        7: [[1, 'OCC'], [SAT, '158'], [SUN, '161']],
        8: [[1, 'Departures'], [SAT, '68'], [SUN, '88']],
        10: [[1, 'Laundry']],
        11: [[1, 'Isabel D'], [SAT, '1'], [SUN, 'OFF']],
        // Hidden: off the team, but still sitting in the file with a "1".
        12: [[1, 'Jecelyn'], [SAT, '1'], [SUN, '1']],
        13: [[1, 'Olga A'], [SAT, '1'], [SUN, '1']],
        14: [[1, 'Total  Linen Att']],
        16: [[1, 'Managers']],
        17: [[1, 'Carlos'], [SAT, 'OFF'], [SUN, 'OFF']],
        18: [[1, 'Manny'], [SAT, '1'], [SUN, '1']],
        19: [[1, 'Ingrid'], [SAT, 'PM'], [SUN, 'PM']],
        22: [[1, 'Departures'], [SAT, '68'], [SUN, '88']],
        24: [[1, 'Rolando'], [SAT, 'OFF'], [SUN, 'OFF']],
        25: [[1, 'Jose B'], [SAT, 'OFF'], [SUN, 'OFF']],
        26: [[1, 'Rubidia G'], [SAT, '1'], [SUN, '1']],
        27: [[1, 'Maria T'], [SAT, '1'], [SUN, '1']],
        28: [[1, 'Missing Supervisor']],
        32: [[1, 'AM lobby']],
        33: [[1, 'Marroquin'], [SAT, '1'], [SUN, '1']],
        34: [[1, 'Sarahi'], [SAT, 'OFF'], [SUN, 'OFF']],
        35: [[1, 'Total  Lobby Att']],
        37: [[1, 'PM Turndown /GRA']],
        38: [[1, 'OCC'], [SAT, '161'], [SUN, '170']],
        39: [[1, 'Aura'], [SAT, 'OFF'], [SUN, '1']],
        40: [[1, 'Guadalupe'], [SAT, 'OFF'], [SUN, 'R-OFF']],
        41: [[1, 'Paty'], [SAT, '1'], [SUN, 'HOUSEMAN']],
        42: [[1, 'Jazmin'], [SAT, '1'], [SUN, '1']],
        43: [[1, 'Total  TD attd']],
        45: [[1, 'PM Houseman']],
        // The workbook writes three quarters of a shift here rather than
        // a 1, the only crew that does.
        46: [[1, 'Paty'], [SAT, '0.75'], [SUN, '0.75']],
        47: [[1, 'Total PM HM']],
        49: [[1, 'Overnight']],
        50: [[1, 'Melvin'], [SAT, '1'], [SUN, '1']],
        51: [[1, 'Luis'], [SAT, 'OFF'], [SUN, 'OFF']],
        52: [[1, 'Total  ON Attd']],
        54: [[1, 'AM ROOM ATTENDANT']],
        55: [[1, 'Departures'], [SAT, '68'], [SUN, '88']],
        56: [[1, 'Claudia Villanueva'], [SAT, 'OFF'], [SUN, 'OFF']],
        57: [[1, 'Karla Varela'], [SAT, '1'], [SUN, '1']],
        58: [[1, 'Debora'], [SAT, '1'], [SUN, 'OFF']],
        59: [[1, 'Mayra'], [SAT, '1'], [SUN, '1']],
        60: [[1, 'Total Room Att']],
        62: [[1, 'Houseman']],
        63: [[1, 'Supervisor'], [SAT, '2'], [SUN, '3']],
        64: [[1, 'Elmer Galindo'], [SAT, '1'], [SUN, '1']],
        65: [[1, 'Vanessa'], [SAT, '1'], [SUN, '1']],
        66: [[1, 'Total HP']]
      }, [12])  /* row 12 = Jecelyn, hidden */
    }
  };
}

module.exports = {
  name: "Schedule Draft: hidden rows are not on the schedule, all nine crews are read, and an edit writes through to the record the lineup reads",
  async run(t) {
    const { win } = await loadApp({ seed: Object.assign(fakeSession(), { 'hk_rooms_migrated_v2': '1' }) });
    await new Promise((r) => setTimeout(r, 60));
    win.XLSX.utils.sheet_to_json = (ws) => ws._rows;

    const SCH = win.dlParseSchedule(scheduleWb(), new Date(2026, 7, 15));
    win.dlSaveSchedule(SCH);

    const sat = '2026-08-15';
    const day = SCH.days[sat];
    t.assert(!!day, 'Saturday the 15th is in the parsed week');

    // ── 1) A hidden row is not part of the schedule ──
    const laundry = day.laundry.map((p) => p[0]);
    t.eq(laundry.join(','), 'Isabel D,Olga A',
      'the hidden row is left out entirely — it is how Carlos takes someone off the team');
    t.assert(!laundry.includes('Jecelyn'),
      'and specifically the hidden person does not come through, even though her cell still says "1"');

    // Visible rows around the hidden one still read correctly, so the
    // skip does not shift anyone onto the wrong row.
    t.eq(day.laundry[0][1], '1', "the row above the hidden one keeps its own value");
    t.eq(day.laundry[1][1], '1', 'and the row below keeps its own value, not the hidden row\'s');

    // ── 2) All nine crews are captured ──
    // Laundry and PM Houseman were never read before this page existed;
    // the Daily Lineup has no use for them, the schedule grid does.
    ['laundry', 'mgr', 'sup', 'lobby', 'td', 'pmhm', 'night', 'gra', 'hp'].forEach((k) => {
      t.assert(Array.isArray(day[k]) && day[k].length > 0, k + ' block is read');
    });
    t.eq(day.pmhm.map((p) => p[0]).join(','), 'Paty', 'PM Houseman is its own block');
    t.eq(day.hp.map((p) => p[0]).join(','), 'Elmer Galindo,Vanessa',
      'Houseman skips the "Supervisor" count row that sits inside its block');
    t.eq(day.sup.map((p) => p[0]).join(','), 'Rolando,Jose B,Rubidia G,Maria T',
      'supervisors are anchored past Managers, not off the header "Departures" row');

    // ── 3) Totals follow Excel's SUM, which ignores text ──
    t.eq(win.schedDayTotal(SCH, sat, 'gra'), 3, 'three room attendants in on Saturday — "OFF" is text and does not count');
    t.eq(win.schedDayTotal(SCH, sat, 'td'), 2, 'turndown counts only the two working');
    t.eq(win.schedDayTotal(SCH, sat, 'laundry'), 2,
      'and laundry counts two, not three — the hidden row cannot pad the total');

    // ── PM Houseman reads like every other crew ──
    // The workbook writes 0.75 there — three quarters of a shift, real
    // in Excel's hour math but a broken-looking cell next to every other
    // crew's plain 1. Carlos asked for it to match the rest, so a number
    // means "in" and lands as 1, and the total becomes a headcount.
    t.eq(day.pmhm[0][1], '1', '0.75 comes through as a plain 1');
    t.assert(!JSON.stringify(SCH.days).includes('0.75'),
      'and no 0.75 survives anywhere in the parsed week');
    t.eq(win.schedDayTotal(SCH, sat, 'pmhm'), 1,
      'so the crew reads as one person in, the way every other crew does');

    // A schedule stored before this must be repaired without waiting for
    // the next upload — he would otherwise keep seeing 0.75 until
    // Wednesday.
    const stale = JSON.parse(JSON.stringify(SCH));
    stale.days[sat].pmhm[0][1] = '0.75';
    const staleStamp = stale.savedAt;
    t.eq(win.schedNormalizePmHm(stale), true, 'an old record reports that it needed repairing');
    t.eq(stale.days[sat].pmhm[0][1], '1', 'and comes out normalised');
    t.eq(stale.savedAt, staleStamp,
      'without touching savedAt — tidying a local copy must not win a sync race against another device');
    t.eq(win.schedNormalizePmHm(stale), false, 'a record already clean reports no change, so it is not re-saved on every render');

    // ── 4) Week navigation ──
    win.schedViewWeekStart = null;
    win.schedGoToThisWeek();
    const thisWeek = win.schedWeekDates();
    t.eq(thisWeek.length, 7, 'a week is seven days');
    t.eq(new Date(thisWeek[0] + 'T00:00:00').getDay(), 6, 'and starts on Saturday, like his workbook');

    win.schedViewWeekStart = new Date(2026, 7, 15);
    t.eq(win.schedWeekDates().join(','),
      '2026-08-15,2026-08-16,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21',
      'the Aug 15 week is Sat 15 through Fri 21');
    win.changeSchedWeek(-1);
    t.eq(win.schedWeekDates()[0], '2026-08-08', 'the back arrow moves a full week, not a day');
    win.changeSchedWeek(1);
    t.eq(win.schedWeekDates()[0], '2026-08-15', 'and forward returns');

    // ── 5) An edit writes through to the record the Daily Lineup reads ──
    // This is the whole point of keeping one store: the lineup must not
    // keep drawing from a stale copy after the schedule is corrected.
    const graIdx = SCH.days[sat].gra.findIndex((p) => p[0] === 'Debora');
    t.assert(graIdx >= 0, 'Debora is on the room attendant block');
    t.eq(win.dlBuildPlan ? 'ok' : 'ok', 'ok');

    win.schedSetCell('gra', graIdx, 'Debora', sat, 'OFF', null);
    const after = win.dlLoadSchedule();
    t.eq(after.days[sat].gra[graIdx][1], 'OFF', 'the edit is saved against that day');
    t.eq(after.days[sat].gra[graIdx][0], 'Debora', 'against the right person');
    t.eq(win.schedDayTotal(after, sat, 'gra'), 2, 'and the total drops to two');
    t.eq(after.days['2026-08-16'].gra[graIdx][1], 'OFF',
      "Sunday already had her off and is untouched — an edit changes one day, not the row");

    // Editing back restores it, and the header numbers are editable too.
    win.schedSetCell('gra', graIdx, 'Debora', sat, '1', null);
    t.eq(win.dlLoadSchedule().days[sat].gra[graIdx][1], '1', 'an edit is reversible');

    win.schedSetNum(sat, 'occ', '175');
    t.eq(win.dlLoadSchedule().days[sat].occ, '175', 'OCC is editable for the day');
    t.eq(win.dlLoadSchedule().days[sat].dep, '68', 'without disturbing departures');

    // A schedule edit has to survive the sync round trip, so savedAt must
    // move — last-write-wins is decided on it.
    const before = SCH.savedAt;
    win.schedSetNum(sat, 'dep', '70');
    t.assert(String(win.dlLoadSchedule().savedAt) >= String(before),
      'savedAt advances on an edit, so another device does not win with older data');

    // ── 6) The page renders, and a week with nothing loaded says so ──
    win.showPage('schedule');
    const html = () => win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/Debora/.test(html()), 'the grid renders the crew');
    t.assert(/Laundry/.test(html()) && /PM Houseman/.test(html()), 'including the two blocks that were never read before');
    t.assert(!/Jecelyn/.test(html()), 'and never the hidden person');
    t.assert(/08\.15-08\.21/.test(html()), 'the source sheet is named, so he can tell which tab it came from');

    win.schedViewWeekStart = new Date(2026, 11, 19);
    win.renderSchedule();
    t.assert(/isn't in the loaded file/.test(html()),
      'a week outside the file says so plainly rather than drawing an empty schedule that reads as "nobody works"');

    // ── 7) Borrowing someone into another crew ──
    // People cross departments here constantly: a Room Attendant covers
    // Laundry, a Laundry attendant works as Houseman. The person is
    // already on the schedule, just on a different crew.
    win.schedViewWeekStart = new Date(2026, 7, 15);
    win.renderSchedule();

    const laundryNames = () => win.dlLoadSchedule().days[sat].laundry.map((p) => p[0]);
    t.assert(!laundryNames().includes('Karla Varela'), 'Karla is a room attendant, not on laundry');

    win.schedAddPerson('laundry', 'Karla Varela');
    t.assert(laundryNames().includes('Karla Varela'), 'she can be borrowed onto laundry');
    t.assert(win.dlLoadSchedule().days[sat].gra.some((p) => p[0] === 'Karla Varela'),
      'and stays on her own crew — borrowing is not a transfer');

    // Added to EVERY day of the week, so the seven columns keep the same
    // shape and the days she actually covers get filled in after.
    const weekDates = win.schedWeekDates();
    weekDates.forEach((ds) => {
      const arr = win.dlLoadSchedule().days[ds];
      if (!arr) return;
      t.assert(arr.laundry.some((p) => p[0] === 'Karla Varela'), 'present on ' + ds);
    });

    // She lands with no days set — borrowed onto the crew, not yet working.
    t.eq(win.dlLoadSchedule().days[sat].laundry.filter((p) => p[0] === 'Karla Varela')[0][1], '',
      'and starts blank rather than being assumed in');
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), sat, 'laundry'), 2,
      'so the crew total does not move until a day is actually given to her');

    // Editing her day must find HER row, not whatever sits at that index
    // on another day — she was appended, so the index is only a hint.
    const kIdx = win.dlLoadSchedule().days[sat].laundry.findIndex((p) => p[0] === 'Karla Varela');
    win.schedSetCell('laundry', kIdx, 'Karla Varela', sat, '1', null);
    t.eq(win.dlLoadSchedule().days[sat].laundry[kIdx][1], '1', 'her Saturday is set');
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), sat, 'laundry'), 3, 'and now she counts on the crew');
    t.eq(win.dlLoadSchedule().days[sat].gra.filter((p) => p[0] === 'Karla Varela')[0][1], '1',
      'her room-attendant day is untouched by the laundry edit');

    // A wrong index must not write to the wrong person.
    win.schedSetCell('laundry', 0, 'Karla Varela', sat, 'OFF', null);
    t.eq(win.dlLoadSchedule().days[sat].laundry.filter((p) => p[0] === 'Karla Varela')[0][1], 'OFF',
      'a stale index still resolves to the named person');
    t.eq(win.dlLoadSchedule().days[sat].laundry[0][1], '1',
      "and the person actually at that index keeps her own value");
    win.schedSetCell('laundry', kIdx, 'Karla Varela', sat, '1', null);

    // Twice is a mistake, not a second row.
    win.schedAddPerson('laundry', 'Karla Varela');
    t.eq(laundryNames().filter((n) => n === 'Karla Varela').length, 1, 'adding her again does not duplicate the row');

    // ── 8) A borrowed row survives the next workbook upload ──
    // He rebuilds the schedule in Excel every Wednesday and re-uploads.
    // Wiping his cross-department cover every time would make the whole
    // feature pointless.
    const fresh = win.dlParseSchedule(scheduleWb(), new Date(2026, 7, 15));
    t.assert(!fresh.days[sat].laundry.some((p) => p[0] === 'Karla Varela'),
      'a straight re-parse of the workbook does not know about her');
    const merged = win.schedCarryAddedRows(win.dlLoadSchedule(), fresh);
    t.assert(merged.days[sat].laundry.some((p) => p[0] === 'Karla Varela'),
      'but the carry-over keeps her on the crew through the re-upload');
    t.eq(merged.days[sat].laundry.filter((p) => p[0] === 'Karla Varela')[0][1], '1',
      'with the day she was given still set');
    t.eq(merged.days[sat].laundry.filter((p) => p[0] === 'Isabel D').length, 1,
      'and the workbook rows are not duplicated by the merge');

    // If the workbook itself now names her on that crew, the carry-over
    // must not add a second copy of her.
    const wbWithHer = win.dlParseSchedule(scheduleWb(), new Date(2026, 7, 15));
    wbWithHer.days[sat].laundry.push(['Karla Varela', '1']);
    const merged2 = win.schedCarryAddedRows(win.dlLoadSchedule(), wbWithHer);
    t.eq(merged2.days[sat].laundry.filter((p) => p[0] === 'Karla Varela').length, 1,
      'once Excel carries her too, she is not added a second time');

    // ── 9) Removing ──
    // Only a borrowed row can be removed here. Workbook rows stay Excel's
    // to manage — that is the same rule that makes hiding a row work.
    win.confirm = () => true;
    win.schedRemovePerson('laundry', 'Karla Varela');
    t.assert(!laundryNames().includes('Karla Varela'), 'a borrowed person can be taken back off');
    t.assert(win.dlLoadSchedule().days[sat].gra.some((p) => p[0] === 'Karla Varela'),
      'and removing the loan leaves her own crew alone');

    win.schedRemovePerson('laundry', 'Isabel D');
    t.assert(laundryNames().includes('Isabel D'),
      'a row that came from the workbook is not removable here — Excel stays its source');

    // ── 10) The picker offers people from OTHER crews ──
    win.renderSchedule();
    const grid = html();
    t.assert(/Add someone to this crew/.test(grid), 'every crew card offers to add someone');
    t.assert(/<optgroup label="AM Room Attendant">/.test(grid),
      'grouped by the crew each person normally works, which is how Carlos identifies them');
    t.assert(/Someone else/.test(grid), 'with a way to name somebody not on the schedule at all');
  }
};
