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
    // Undo the borrow — the checks below (Unifocus standard, the DOM
    // render) are computed against the crew's ORIGINAL composition, so
    // this has to happen before them, not as an afterthought.
    win.confirm = () => true;
    win.schedRemovePerson('laundry', 'Karla Varela');
    t.assert(!laundryNames().includes('Karla Varela'), 'a borrowed person can be taken back off');
    t.assert(win.dlLoadSchedule().days[sat].gra.some((p) => p[0] === 'Karla Varela'),
      'and removing the loan leaves her own crew alone');

    // ── 10) The picker offers people from OTHER crews ──
    win.renderSchedule();
    const grid = html();
    t.assert(/Add someone to this crew/.test(grid), 'every crew card offers to add someone');
    t.assert(/<optgroup label="AM Room Attendant">/.test(grid),
      'grouped by the crew each person normally works, which is how Carlos identifies them');
    t.assert(/Someone else/.test(grid), 'with a way to name somebody not on the schedule at all');

    // ── 11) Unifocus standard, checked against what's actually scheduled ──
    // Carlos's ask: at a glance, is each position on standard, over, or
    // short. Values below were computed once via the app's own functions
    // and pinned here — this is a regression check, not a re-derivation
    // of Unifocus's math (that lives in the unifocus-* test files).
    // Restore OCC/Departures to the fixture's original numbers — an
    // earlier step in this same test edited them to prove they're
    // editable, and left them changed.
    win.schedSetNum(sat, 'occ', '158');
    win.schedSetNum(sat, 'dep', '68');

    const SCH2 = win.dlLoadSchedule();
    t.eq(SCH2.days[sat].occ, '158', 'sanity: the OCC this is computed from');
    t.eq(SCH2.days[sat].dep, '68', 'and the Departures');
    t.eq(SCH2.days[sat].tdOcc, '161', "and Turndown's own same-day OCC row");

    const uf = {};
    win.SCHED_UF_POS.forEach((p) => {
      uf[p.label] = { actual: win.schedUfActual(SCH2, sat, p.crews), std: win.schedUfExpected(SCH2, p.label, sat) };
    });
    t.eq(uf['Room Attendant'].actual, 3, 'three GRAs are actually in Saturday');
    t.eq(uf['Room Attendant'].std, 7, '158 rooms / 68 departures -> 59.5h -> 7 people at 8h — short by 4');
    t.eq(uf['House Attendant'].actual, 3, 'AM Houseman (2) + PM Houseman (1) combined');
    t.eq(uf['House Attendant'].std, 3, '16h (departures band) + 8h (flat rooms) = 24h -> 3 people — exactly on standard');
    t.eq(uf['Housekeeping Supervisor'].actual, 2);
    t.eq(uf['Housekeeping Supervisor'].std, 3, '16h + 8h = 24h -> 3 — short by 1');
    t.eq(uf['Laundry Attendant'].actual, 2);
    t.eq(uf['Laundry Attendant'].std, 5, '40h flat rooms component (68 departures is below the 175 threshold) -> 5 — short by 3');
    t.eq(uf['Turndown Attendant'].actual, 2);
    t.eq(uf['Turndown Attendant'].std, 5,
      "161 (Turndown's OWN same-day OCC, not the header 158) -> 136-180 band -> 32h -> truncated to 30 at 6h shifts -> 5 — short by 3");
    t.eq(uf['Public Area Attendant'].actual, 1, "AM Lobby's own total — confirmed as the Public Area Attendant crew");
    t.eq(uf['Public Area Attendant'].std, 4, "Saturday's day-of-week bands: 8h + 8h + 16h = 32h -> 4 — short by 3");

    // A day with no OCC/Departures typed in yet must not compute a false
    // standard — "short by 7" on a blank day would be actively wrong.
    win.schedSetNum('2026-08-18', 'occ', '');
    win.schedSetNum('2026-08-18', 'dep', '');
    const blankDay = win.dlLoadSchedule();
    t.eq(win.schedUfExpected(blankDay, 'Room Attendant', '2026-08-18'), null,
      'no departures typed in -> no standard computed, not a misleading 0');

    // Rendered: the card shows the position, the scheduled number, and
    // the standard beneath it, colored by status.
    win.renderSchedule();
    const ufHtml = html();
    t.assert(/Unifocus Standard/.test(ufHtml), 'the card is titled plainly');
    t.assert(/House Attendant/.test(ufHtml) && /Room Attendant/.test(ufHtml), 'positions are named, not abbreviated to the crew key');
    t.assert(/std 7/.test(ufHtml), "the standard prints beneath the actual number");
    t.assert(/AM Houseman \+ PM Houseman combined/.test(ufHtml),
      'the combined-crew caveat is stated on the page, not left implicit');

    // ── 12) "PM" is a real body, not a blank ──
    // Excel's own SUM() drops "PM" the same way it drops "OFF" — both are
    // text — but a PM supervisor is not absent, and Unifocus's
    // Housekeeping Supervisor standard is one headcount across BOTH
    // shifts. Undercounting the PM half made every day with a PM
    // supervisor read as short by exactly that one person.
    const supTotalBefore = win.schedDayTotal(win.dlLoadSchedule(), sat, 'sup');
    t.eq(supTotalBefore, 2, 'Rolando and Jose B are OFF Saturday in the fixture; Rubidia G and Maria T are in');

    const rolandoIdx = win.dlLoadSchedule().days[sat].sup.findIndex((p) => p[0] === 'Rolando');
    win.schedSetCell('sup', rolandoIdx, 'Rolando', sat, 'PM', null);
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), sat, 'sup'), 3,
      'Rolando on "PM" counts as a third supervisor, not zero');
    t.eq(win.document.getElementById('sct_sup_0').textContent, '3', 'and the on-screen Total repaints to match');

    // The inline standard row under the Supervisors card has to move with
    // it — it reads Rolando's PM day through the very same total.
    t.eq(win.schedUfActual(win.dlLoadSchedule(), sat, ['sup']), 3,
      'the Unifocus actual figure counts him too, since it is the same total');

    // "PM" must NOT be miscounted as a crew-redirect. Only LOBBY / HOUSEMAN
    // / TAILOR / LAUNDRY mean "covering somewhere else today" and stay
    // excluded; PM specifically means "here, the PM half of the shift".
    win.schedSetCell('sup', rolandoIdx, 'Rolando', sat, 'LOBBY', null);
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), sat, 'sup'), 2,
      'a genuine redirect (LOBBY) still does not count toward this crew, unlike PM');
    win.schedSetCell('sup', rolandoIdx, 'Rolando', sat, 'OFF', null);

    // ── 13) The standard rides along inside each crew card, not only in
    // the week-overview card at the top — Carlos's actual ask: looking at
    // Supervisors, he wants the standard right there next to that crew's
    // own total, not a scroll back up to cross-reference. ──
    win.renderSchedule();
    const cardHtml = html();
    const supCard = cardHtml.match(/>Supervisors<\/div>.*?(?=<div style="background:var\(--navy\))/s);
    t.assert(supCard, 'the Supervisors card is found');
    t.assert(/Unifocus std/.test(supCard[0]), 'and it carries its own standard row');
    t.assert(!/AM shift|PM shift/.test(supCard[0]),
      'Supervisors is a single-shift position, so no AM/PM shift label is needed');

    // Houseman is the LAST crew card, so there is no next navy header to
    // bound the match against — stop at one or the end of the string.
    const hpCard = cardHtml.match(/>Houseman<\/div>[\s\S]*?(?=<div style="background:var\(--navy\)|$)/);
    const pmhmCard = cardHtml.match(/>PM Houseman<\/div>[\s\S]*?(?=<div style="background:var\(--navy\))/s);

    // Carlos's actual complaint: the AM Houseman card's own Total reads 2,
    // and a combined House Attendant number ("3, split 2+1") needed
    // explaining to make sense of that. House Attendant's two shifts are
    // independent in Unifocus's own standard (AM is departures-driven,
    // PM is a flat 8h/1 person), so each crew is now measured against
    // its OWN shift's standard, exactly like every other crew — no
    // combining, no breakdown to read.
    t.assert(hpCard && /Unifocus std[\s\S]*?\(AM shift\)/.test(hpCard[0]), 'Houseman is labeled as the AM shift');
    t.assert(pmhmCard && /Unifocus std[\s\S]*?\(PM shift\)/.test(pmhmCard[0]), 'PM Houseman is labeled as the PM shift');
    t.assert(hpCard && !/2\+1|\(combined\)/.test(hpCard[0]), 'no combined number or split to read anymore');
    t.assert(hpCard && /House Attendant: 2 scheduled vs\. 2 standard/.test(hpCard[0]),
      "AM Houseman's own total (2) is judged against the AM shift's own standard (2) — on standard");
    t.assert(pmhmCard && /House Attendant: 1 scheduled vs\. 1 standard/.test(pmhmCard[0]),
      "and PM Houseman's own total (1) against the PM shift's own standard, independently");

    t.assert(!/>Managers<\/div>[\s\S]{0,900}?Unifocus std/.test(cardHtml),
      'Managers has no Unifocus standard on file and gets no row, same as everywhere else in the app');

    // Editing a cell must repaint the inline row too, not just the Total —
    // this is the same DOM ids _schedRefreshTotals targets, exercised
    // through the real event path rather than by calling it directly.
    const kIdx2 = win.dlLoadSchedule().days[sat].gra.findIndex((p) => p[0] === 'Karla Varela');
    const scuBefore = win.document.getElementById('scu_gra_0').innerHTML;
    win.schedSetCell('gra', kIdx2, 'Karla Varela', sat, 'OFF', null);
    const scuAfter = win.document.getElementById('scu_gra_0').innerHTML;
    t.assert(scuAfter !== scuBefore, 'taking a room attendant off Saturday moves the inline standard cell, not just the Total row');
    win.schedSetCell('gra', kIdx2, 'Karla Varela', sat, '1', null);

    // ── 14) "Fill week" — Carlos's own workflow from Unifocus ──
    // Type one day, then replicate it across the rest of that person's
    // week in one click instead of opening seven dropdowns for the same
    // value. Copies the first day that already has something in it.
    win.confirm = () => true;
    const mayraBefore = win.dlLoadSchedule().days[sat].gra.filter((p) => p[0] === 'Mayra')[0];
    t.eq(mayraBefore[1], '1', "Mayra's Saturday is the fixture's own value — the thing to copy");
    t.eq(win.dlLoadSchedule().days['2026-08-17'].gra.filter((p) => p[0] === 'Mayra')[0][1], '',
      "Monday starts blank — nothing typed for her yet that day");

    win.schedFillWeek('gra', 'Mayra');
    const afterFill = win.dlLoadSchedule();
    win.schedWeekDates().forEach((ds) => {
      const row = afterFill.days[ds] && afterFill.days[ds].gra.filter((p) => p[0] === 'Mayra')[0];
      if (row) t.eq(row[1], '1', ds + " is filled with Saturday's value, the whole week in one click");
    });

    // It is a real copy-paste, not a "fill blanks only" — a day already
    // set to something ELSE gets overwritten too, same as Excel/Unifocus.
    win.schedSetCell('gra', kIdx2, 'Karla Varela', '2026-08-18', 'OFF', null);
    win.schedFillWeek('gra', 'Karla Varela');
    t.eq(win.dlLoadSchedule().days['2026-08-18'].gra.filter((p) => p[0] === 'Karla Varela')[0][1], '1',
      "a day deliberately set to OFF is overwritten by the fill too — real copy-paste, not a smart merge");

    // Someone with nothing typed anywhere has nothing to copy, and the
    // week must not be silently touched.
    win.schedAddPerson('gra', 'Rolando');
    const beforeEmpty = JSON.stringify(win.dlLoadSchedule().days[sat].gra);
    win.schedFillWeek('gra', 'Rolando');
    t.eq(JSON.stringify(win.dlLoadSchedule().days[sat].gra), beforeEmpty,
      'a blank row is left alone — there is nothing to copy from');
    t.assert(/Nothing to copy/.test(win.document.getElementById('toastMsg').textContent),
      'and he is told why, rather than the button silently doing nothing');

    // Rendered: the button sits next to the name, and only for a row
    // that actually has something to copy.
    win.renderSchedule();
    const fillHtml = html();
    t.assert(/schedFillWeek\('gra','Mayra'\)/.test(fillHtml), "Mayra's row offers the fill button");
    t.assert(!/schedFillWeek\('gra','Rolando'\)/.test(fillHtml),
      "Rolando's row does not — an all-blank row has nothing worth offering to copy");

    // ── 15) A row that came from the workbook is removable too ──
    // Carlos's stated goal: the app should REPLACE Excel, not defer to
    // it. "Only app-added rows are removable" stopped making sense the
    // moment that became the plan — there has to be a way to take a
    // Turndown attendant back out of Laundry even though that row came
    // straight out of the file, not from a borrow.
    const laundryTotalBefore = win.schedDayTotal(win.dlLoadSchedule(), sat, 'laundry');
    win.schedRemovePerson('laundry', 'Isabel D');
    t.assert(!laundryNames().includes('Isabel D'),
      'a workbook row is removable now — only the app\'s own copy is touched, the Excel file itself is never modified');
    t.eq(win.schedDayTotal(win.dlLoadSchedule(), sat, 'laundry'), laundryTotalBefore - 1,
      'and the crew total drops with her, same as removing anyone else');

    // Rendered: every row gets the × now, not just borrowed ones.
    win.renderSchedule();
    const removeHtml = html();
    t.assert(/schedRemovePerson\('laundry','Olga A'\)/.test(removeHtml),
      "a workbook row (Olga A, never borrowed) still offers its own × — removability no longer depends on where the row came from");

    // ── 16) Building a week without Excel ──
    // Carlos's larger goal: the app should replace Excel entirely, not
    // just view what's already built there. A week outside the loaded
    // file can be built directly, cloning the CREW LIST from the most
    // recently loaded week — not the values, which stay blank.
    win.schedViewWeekStart = new Date(2026, 8, 5); // a week with no data at all
    win.renderSchedule();
    const emptyHtml = html();
    t.assert(/isn't in the loaded file/.test(emptyHtml), 'still says plainly that nothing is loaded here');
    t.assert(/schedCreateWeek\(\)/.test(emptyHtml),
      'and now offers to build it, since a reference week (08.15-08.21) exists to copy the crew list from');

    win.schedCreateWeek();
    const built = win.dlLoadSchedule();
    const newDates = win.schedWeekDates();
    t.eq(newDates.length, 7, 'sanity: still a seven-day week');
    newDates.forEach((ds) => {
      t.assert(!!built.days[ds], ds + ' now exists');
      t.eq(built.days[ds].occ, '', ds + ": OCC is blank, not guessed at");
      t.eq(built.days[ds].dep, '', ds + ": Departures is blank too");
    });

    // The crew LIST carried over — and reflects the CURRENT state (after
    // this test's own earlier edits), not blindly the original upload.
    const newLaundry = built.days[newDates[0]].laundry.map((p) => p[0]);
    t.assert(newLaundry.includes('Olga A'), "Olga A (still on laundry) carried into the new week");
    t.assert(!newLaundry.includes('Isabel D'), "Isabel D (removed earlier in this test) did NOT come back");
    const newGra = built.days[newDates[0]].gra.map((p) => p[0]);
    t.assert(newGra.includes('Rolando'), "Rolando, borrowed onto Room Attendant earlier, carried over into the new week too");

    // Every value is blank — nothing about who's actually working that
    // NEW week is invented.
    let anyValue = false;
    Object.keys(built.days[newDates[0]]).forEach((k) => {
      if (!Array.isArray(built.days[newDates[0]][k])) return;
      built.days[newDates[0]][k].forEach((p) => { if (p[1] !== '') anyValue = true; });
    });
    t.assert(!anyValue, 'every day, for every person, starts blank — only the roster is copied, not a guess at who works when');

    // Calling it again must not silently clobber a week that now has
    // real data in it.
    win.schedSetCell('gra', 0, newGra[0], newDates[0], '1', null);
    win.schedCreateWeek();
    t.eq(win.dlLoadSchedule().days[newDates[0]].gra[0][1], '1',
      'a week that already has data is left alone — building again would have silently erased the edit just made');
    t.assert(/already has data/.test(win.document.getElementById('toastMsg').textContent),
      'and he is told why, rather than nothing visibly happening');

    // ── 17) "Copy last week" — day-for-day, not one value repeated ──
    // Carlos's own words: not just multiplying the first Saturday or
    // Friday shift. A real week alternates; last week's actual pattern
    // for this person is the best guess for this week's.
    const thisWeekDates = win.schedWeekDates(); // Sep 5-11, built blank in step 16
    const lwStart = new Date(2026, 7, 29); // the week immediately before it, Aug 29-Sep 4
    const lwDatesForTest = [];
    for (let i = 0; i < 7; i++) { const d = new Date(lwStart); d.setDate(d.getDate() + i); lwDatesForTest.push(win.dateStr(d)); }

    // Fabricate last week directly — a distinct, alternating pattern for
    // Rolando (already on this week's Room Attendant roster, carried
    // over from the borrow in step 14/16), so a uniform "Fill week"
    // could never produce the same result as this.
    const lwPattern = ['1', 'OFF', '1', '1', 'OFF', 'R-OFF', '1'];
    const beforeCopy = win.dlLoadSchedule();
    lwDatesForTest.forEach((ds, i) => {
      beforeCopy.days[ds] = beforeCopy.days[ds] || { sheet: 'test', occ: '', dep: '', tdOcc: '' };
      beforeCopy.days[ds].gra = [['Rolando', lwPattern[i]]];
    });
    win.dlSaveSchedule(beforeCopy);

    t.assert(!win.dlLoadSchedule().days[thisWeekDates[0]].gra.some((p) => p[0] === 'Rolando' && p[1] !== ''),
      "Rolando's row this week starts blank, same as everyone else in the week built in step 16");

    win.renderSchedule();
    const copyHtml = html();
    t.assert(/schedCopyLastWeek\('gra','Rolando'\)/.test(copyHtml),
      'the copy-last-week button appears now that last week has something to copy');

    win.schedCopyLastWeek('gra', 'Rolando');
    const afterCopy = win.dlLoadSchedule();
    thisWeekDates.forEach((ds, i) => {
      const row = afterCopy.days[ds].gra.filter((p) => p[0] === 'Rolando')[0];
      t.eq(row[1], lwPattern[i], ds + " gets last week's SAME day of week (" + lwDatesForTest[i] + "'s value), not a single value repeated");
    });

    // A day last week has NOTHING for is left untouched, not blanked —
    // there's nothing to copy FROM. Pin this with an eighth day: clear
    // last week's Wednesday and confirm this week's Wednesday survives
    // whatever it already had rather than being wiped to blank.
    win.schedSetCell('gra', 0, 'Rolando', thisWeekDates[3], 'PM', null);
    const clearedLw = win.dlLoadSchedule();
    clearedLw.days[lwDatesForTest[3]].gra[0][1] = '';
    win.dlSaveSchedule(clearedLw);
    win.schedCopyLastWeek('gra', 'Rolando');
    t.eq(win.dlLoadSchedule().days[thisWeekDates[3]].gra.filter((p) => p[0] === 'Rolando')[0][1], 'PM',
      "a day with nothing to copy from last week is left as-is this week, not overwritten to blank");

    // Nobody with a fully blank last week gets the button at all.
    t.assert(!win.dlLoadSchedule().days[thisWeekDates[0]].gra.some((p) => p[0] === 'Debora')
      || !/schedCopyLastWeek\('gra','Debora'\)/.test(html()),
      'someone with nothing in last week (never loaded for these dates) offers no copy-last-week button');

    // With no reference week at all, there is nothing to copy the crew
    // list from, and that has to be said plainly rather than building
    // an empty schedule that reads as "nobody works this week either."
    win.localStorage.removeItem('hk_dl_schedule');
    win.schedViewWeekStart = new Date(2026, 9, 3);
    win.schedCreateWeek();
    t.assert(/Upload a Schedule Draft/.test(win.document.getElementById('toastMsg').textContent),
      'with nothing loaded anywhere, he is pointed back to uploading once, not left to guess why the button did nothing');

    // ── 18) Schedule Checks — Schedule Builder's fairness principles,
    // checked here rather than enforced ── Two rules, ported from
    // Schedule Builder's own autoFill (scheduleDept's offCount, and
    // weekendDueOrder/weekendHistory's full-weekend rotation): a minimum
    // number of days off per crew (2, or 1 for PM Turndown/GRA), and a
    // full Saturday+Sunday off that shouldn't go missing for too long
    // without one showing up somewhere in the app's own history. Built
    // from scratch here rather than reusing the earlier fixture, which
    // only ever fills in Saturday and Sunday. ──
    win.localStorage.removeItem('hk_dl_schedule');
    const wk = (n) => { const d = new Date(2026, 9, 3); d.setDate(d.getDate() + n * 7); return d; }; // Sat Oct 3 2026 as "this week"
    const datesFor = (n) => { const out = []; const d = wk(n); for (let i = 0; i < 7; i++) { out.push(win.dateStr(d)); d.setDate(d.getDate() + 1); } return out; };
    const mkRow = (vals) => vals; // [Sat..Fri]

    const SCH18 = { days: {}, count: 0 };
    const thisDates = datesFor(0);
    // sup: minimum is 2. Rolando gets exactly 1 (short); Jose B gets 2 (meets it).
    thisDates.forEach((ds, i) => {
      SCH18.days[ds] = {
        sheet: 't', occ: '100', dep: '40', tdOcc: '',
        sup: [['Rolando', i === 0 ? 'OFF' : '1'], ['Jose B', (i === 0 || i === 2) ? 'OFF' : '1']],
        // td: minimum is 1. Aura gets exactly 1 — meets it, no warning expected.
        td: [['Aura', i === 0 ? 'OFF' : '1']],
        // mgr: excluded from the rule entirely — zero days off should never warn.
        mgr: [['Carlos', '1']],
        // hp: used below for the weekend-rotation check; every day worked this week.
        hp: [['Elmer Galindo', '1'], ['Vanessa', '1']]
      };
    });
    win.dlSaveSchedule(SCH18);
    win.schedViewWeekStart = wk(0);

    let checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(checks.some((c) => c.type === 'off' && /Rolando has 1 day off this week \(usually 2\)/.test(c.text)),
      'a supervisor with only one day off this week is flagged against the 2-day minimum');
    t.assert(!checks.some((c) => /Jose B/.test(c.text) && c.type === 'off'),
      'a supervisor who got the full 2 days off is not flagged');
    t.assert(!checks.some((c) => /Aura/.test(c.text) && c.type === 'off'),
      "PM Turndown/GRA's own lower minimum (1) is honored — one day off there is not a shortfall");
    t.assert(!checks.some((c) => /Carlos/.test(c.text)),
      'Managers carries no days-off rule at all, same as Schedule Builder — zero off days there never warns');

    win.renderSchedule();
    t.assert(/Schedule Checks/.test(html()) && /Rolando has 1 day off this week/.test(html()),
      'the warning actually reaches the rendered page, not just the underlying function');

    // Weekend rotation: three prior weeks (checked >= 3) where Elmer never
    // gets a full Saturday+Sunday off, same as this week — flagged as
    // overdue. Vanessa gets a full weekend two weeks back — recent enough
    // (<= 3 weeks) that she is NOT flagged despite also working this
    // week's Sat/Sun.
    for (let n = -1; n >= -3; n--) {
      const ds = datesFor(n);
      const SCHn = win.dlLoadSchedule();
      ds.forEach((d, i) => {
        SCHn.days[d] = SCHn.days[d] || { sheet: 't', occ: '', dep: '', tdOcc: '' };
        const elmerOff = false; // never a full weekend for Elmer in any prior week
        const vanessaOff = (n === -2 && (i === 0 || i === 1)); // Vanessa's one full weekend, 2 weeks back
        SCHn.days[d].hp = [
          ['Elmer Galindo', elmerOff ? 'OFF' : '1'],
          ['Vanessa', vanessaOff ? 'OFF' : '1']
        ];
      });
      win.dlSaveSchedule(SCHn);
    }
    checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(checks.some((c) => c.type === 'weekend' && /Elmer Galindo hasn't had a full weekend off/.test(c.text)),
      "three weeks of history with no full weekend anywhere is enough to flag him as overdue — Schedule Builder's own weekendHistory idea");
    t.assert(!checks.some((c) => /Vanessa/.test(c.text) && c.type === 'weekend'),
      'a full weekend just two weeks back is recent enough that she is not flagged, even though this week has none either');

    // Not enough history at all (fewer than 3 prior weeks on file) should
    // never read as "never had one" — that would punish a schedule the
    // app simply hasn't seen much of yet.
    win.localStorage.removeItem('hk_dl_schedule');
    const SCH18b = { days: {}, count: 0 };
    thisDates.forEach((ds) => { SCH18b.days[ds] = { sheet: 't', occ: '', dep: '', tdOcc: '', hp: [['Elmer Galindo', '1']] }; });
    win.dlSaveSchedule(SCH18b);
    checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(!checks.some((c) => c.type === 'weekend'),
      'with no prior weeks on file at all, there is nothing to judge "overdue" against, so nobody is flagged');

    // ── 19) Exempting a person — real people (mutual cover pairs, low-
    // season aliases in Schedule Builder's own ALIAS_PEOPLE/exclusion
    // lists) never fit the plain rule by design, and this app has no way
    // to know that on its own. Carlos marks them once; the mark is a
    // property of the PERSON, holds on every crew, and survives a
    // re-upload the same way a borrowed row does. ──
    win.localStorage.removeItem('hk_dl_schedule');
    const SCH19 = { days: {} };
    thisDates.forEach((ds, i) => { SCH19.days[ds] = { sheet: 't', occ: '', dep: '', tdOcc: '', sup: [['Jorge Gonzalez', '1']] }; });
    win.dlSaveSchedule(SCH19);
    checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(checks.some((c) => /Jorge Gonzalez/.test(c.text)),
      'before exempting, Jorge (0 real off days here) is flagged like anyone else');

    win.schedToggleCheckExempt('Jorge Gonzalez');
    checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(!checks.some((c) => /Jorge Gonzalez/.test(c.text)),
      'once marked exempt, he drops out of Schedule Checks entirely — days-off AND weekend both');
    win.renderSchedule();
    t.assert(!/Jorge Gonzalez has\b/.test(html()) && !/Jorge Gonzalez hasn't\b/.test(html()),
      'and the rendered page agrees — his plain name can still appear in the crew card, just not in a Schedule Checks line');

    win.schedToggleCheckExempt('Jorge Gonzalez');
    checks = win.schedScheduleChecks(win.dlLoadSchedule(), win.schedWeekDates());
    t.assert(checks.some((c) => /Jorge Gonzalez/.test(c.text)),
      'toggling again un-exempts him — this is a switch, not a one-way mark');

    // Survives a re-upload, same idea as a borrowed row surviving one.
    win.schedToggleCheckExempt('Jorge Gonzalez'); // exempt again before the "upload"
    const before19 = win.dlLoadSchedule();
    t.assert(before19.checkExempt && before19.checkExempt[win.dlNorm('Jorge Gonzalez')], 'exempt flag is set going into the reload');
    const reparsed = { days: { [thisDates[0]]: { sheet: 'reuploaded', occ: '', dep: '', tdOcc: '', sup: [['Jorge Gonzalez', '1']] } }, count: 1 };
    const carried = win.schedCarryCheckExempt(before19, reparsed);
    t.assert(!!(carried.checkExempt && carried.checkExempt[win.dlNorm('Jorge Gonzalez')]),
      "schedCarryCheckExempt keeps the mark across a fresh workbook parse, which otherwise starts with no top-level properties at all");

    // ── 20) Auto-fill — generating a week without Schedule Builder or
    // Excel, ported from Schedule Builder's own scheduleDept/
    // repairShortfalls/weekendDueOrder (see the header comment on
    // schedAutoFill in index.html for why the roster and weekend
    // history are NOT imported from Schedule Builder's own — verified
    // stale against Carlos's real Laundry crew). ──
    win.localStorage.removeItem('hk_dl_schedule');
    const wk20 = (n) => { const d = new Date(2026, 10, 7); d.setDate(d.getDate() + n * 7); return d; }; // Sat Nov 7 2026
    const datesFor20 = (n) => { const out = []; const d = wk20(n); for (let i = 0; i < 7; i++) { out.push(win.dateStr(d)); d.setDate(d.getDate() + 1); } return out; };
    const thisDates20 = datesFor20(0);
    const SCH20 = { days: {} };
    const supNames = ['A', 'B', 'C', 'D', 'E', 'F'];
    thisDates20.forEach((ds) => {
      SCH20.days[ds] = {
        sheet: 't', occ: '100', dep: '80', tdOcc: '', // dep=80 -> schedSupHpNeeded = 3
        sup: supNames.map((n) => [n, '']),
        // pmhm/night/mgr present too, to confirm Auto-fill leaves them alone.
        pmhm: [['Untouched PM', '']], night: [['Untouched Night', '1']], mgr: [['Untouched Mgr', '']]
      };
    });
    // B already has one granted R-OFF on Sunday — must survive, and only
    // ONE more day off should be chosen for B (2 total), not 2 fresh ones.
    SCH20.days[thisDates20[1]].sup[1][1] = 'R-OFF';
    win.dlSaveSchedule(SCH20);
    win.schedViewWeekStart = wk20(0);

    t.assert(/Auto-fill this week/.test((() => { win.renderSchedule(); return html(); })()),
      'the Auto-fill button is on the page once a week with OCC is loaded');

    win.schedAutoFill();
    const afterAuto = win.dlLoadSchedule();
    supNames.forEach((nm) => {
      const row = afterAuto.days[thisDates20[0]].sup.find((p) => p[0] === nm); // just confirms the crew wasn't dropped
      t.assert(!!row, nm + ' is still on the Supervisors crew after Auto-fill');
      const offDays = thisDates20.filter((ds) => win.schedIsOff(afterAuto.days[ds].sup.find((p) => p[0] === nm)[1]));
      t.eq(offDays.length, 2, nm + ' ends up with exactly the 2-day minimum, not more or fewer');
    });
    t.eq(afterAuto.days[thisDates20[1]].sup[1][1], 'R-OFF',
      "B's granted R-OFF is still there — Auto-fill never overwrites a fixed request");

    // Every day should meet the need (3), since 6 people minus a 2-day
    // average off leaves plenty of slack — this is the "no repair needed"
    // case; the shortfall-repair path is exercised separately below.
    thisDates20.forEach((ds) => {
      const working = supNames.filter((nm) => !win.schedIsOff(afterAuto.days[ds].sup.find((p) => p[0] === nm)[1])).length;
      t.assert(working >= 3, ds + ' has at least the 3 supervisors this OCC/Departures calls for (got ' + working + ')');
    });

    // pmhm/night/mgr are excluded from Auto-fill entirely.
    t.assert(win.schedIsOff(afterAuto.days[thisDates20[0]].pmhm[0][1]) || afterAuto.days[thisDates20[0]].pmhm[0][1] === '1',
      "PM Houseman IS filled by Auto-fill (Yesenia's own 1-day-off arrangement, or a plain min-off fill for whoever's actually there) — a stand-in name like 'Untouched PM' just gets the same generic treatment as any other PM Houseman crew member");
    t.eq(afterAuto.days[thisDates20[0]].night[0][1], '1', 'Overnight is untouched by Auto-fill');
    t.eq(afterAuto.days[thisDates20[0]].mgr[0][1], '', 'Managers is untouched by Auto-fill');

    // Re-running is idempotent: the exact same OFF/1 pattern comes back,
    // not a fresh reshuffle, because weekendGap/weekendDueOrder read from
    // this SAME now-filled week and see everyone as already having had
    // their turn this week (mirrors Schedule Builder's own idempotency
    // guarantee, ported deliberately).
    const pattern1 = supNames.map((nm) => thisDates20.map((ds) => afterAuto.days[ds].sup.find((p) => p[0] === nm)[1]));
    win.schedAutoFill();
    const afterAuto2 = win.dlLoadSchedule();
    const pattern2 = supNames.map((nm) => thisDates20.map((ds) => afterAuto2.days[ds].sup.find((p) => p[0] === nm)[1]));
    t.eq(JSON.stringify(pattern2), JSON.stringify(pattern1), 'running Auto-fill again on the same week reproduces the same schedule, not a reshuffle');

    // Weekend rotation actually bites: give "A" three straight prior weeks
    // with NO full weekend off, and "F" a full weekend just last week —
    // A should come out of Auto-fill more likely to land Sat+Sun off than F.
    win.localStorage.removeItem('hk_dl_schedule');
    const SCH20b = { days: {} };
    thisDates20.forEach((ds) => { SCH20b.days[ds] = { sheet: 't', occ: '100', dep: '80', tdOcc: '', sup: supNames.map((n) => [n, '']) }; });
    for (let n = -1; n >= -3; n--) {
      const pdates = datesFor20(n);
      pdates.forEach((ds, i) => {
        SCH20b.days[ds] = SCH20b.days[ds] || { sheet: 't', occ: '', dep: '', tdOcc: '' };
        SCH20b.days[ds].sup = supNames.map((nm) => {
          if (nm === 'F' && n === -1 && (i === 0 || i === 1)) return [nm, 'OFF']; // F's full weekend, last week
          return [nm, '1']; // A (and everyone else) never gets a full weekend in this window
        });
      });
    }
    win.dlSaveSchedule(SCH20b);
    win.schedViewWeekStart = wk20(0);
    win.schedAutoFill();
    const afterAuto3 = win.dlLoadSchedule();
    const fullWeekend = (nm) => win.schedIsOff(afterAuto3.days[thisDates20[0]].sup.find((p) => p[0] === nm)[1])
      && win.schedIsOff(afterAuto3.days[thisDates20[1]].sup.find((p) => p[0] === nm)[1]);
    t.assert(fullWeekend('A'), "A, overdue for three straight weeks, gets this week's full weekend off");
    t.assert(!fullWeekend('F'), "F, who just had one last week, does not — the scarce weekend slack goes to whoever's actually overdue");

    // Shortfall repair: 4 people, need pinned at 4 (dep=25 -> need 2, but
    // forced up via a tight offCount so a naive per-person pass alone
    // would leave a day short) — confirms schedRepairShortfalls actually
    // fires rather than just being dead code.
    win.localStorage.removeItem('hk_dl_schedule');
    const SCH20c = { days: {} };
    const tdNames = ['G', 'H']; // PM Turndown/GRA: offCount is 1
    thisDates20.forEach((ds, i) => {
      SCH20c.days[ds] = { sheet: 't', occ: '48', dep: '10', tdOcc: '48', td: tdNames.map((n) => [n, '']) }; // turndownNeeded(48)=1
    });
    // Force both G and H to already be R-OFF on the same day (Monday) —
    // a real shortfall Auto-fill's per-person pass can't avoid on its own,
    // only the repair pass (borrowing a day from elsewhere in the week)
    // can restore coverage.
    SCH20c.days[thisDates20[2]].td[0][1] = 'R-OFF';
    SCH20c.days[thisDates20[2]].td[1][1] = 'R-OFF';
    win.dlSaveSchedule(SCH20c);
    win.schedViewWeekStart = wk20(0);
    win.schedAutoFill();
    const afterAuto4 = win.dlLoadSchedule();
    const mondayWorking = tdNames.filter((nm) => !win.schedIsOff(afterAuto4.days[thisDates20[2]].td.find((p) => p[0] === nm)[1])).length;
    t.eq(mondayWorking, 0, 'both being R-OFF the same day is a genuine, un-repairable shortage — Auto-fill leaves it as-is rather than breaking a fixed request');
    // But every OTHER day should still meet turndownNeeded(48)=1, since
    // the repair pass had a full week of slack to draw from for those.
    thisDates20.forEach((ds, i) => {
      if (i === 2) return;
      const working = tdNames.filter((nm) => !win.schedIsOff(afterAuto4.days[ds].td.find((p) => p[0] === nm)[1])).length;
      t.assert(working >= 1, ds + " still meets Turndown's need of 1 despite Monday's shortage");
    });

    // ── 21) Special-role machinery — confirmed directly with Carlos on
    // 2026-08-16 (Overnight's fixed pattern, Yanira's PM shift, the
    // Lobby/Laundry cover chains, Yesenia/Paty, the Houseman overflow
    // backups). Each piece is exercised as its own unit against
    // hand-built, fully-determined cell values rather than through the
    // full randomized Auto-fill pipeline — the escalation logic (does
    // the SECOND backup trigger only when the first is also off) needs
    // exact control that a real Auto-fill run can't guarantee day to
    // day. ──
    const ds21 = thisDates20; // reuse the same seven dates from step 20

    // Overnight: fixed pattern, R-OFF still wins over it.
    const SCH21a = { days: {} };
    ds21.forEach((ds) => { SCH21a.days[ds] = { night: [['Melvin', '1'], ['Luis', '1']] }; });
    SCH21a.days[ds21[5]].night[0][1] = 'R-OFF'; // Melvin, Thursday — not one of his default off days
    win.schedApplyOvernight(SCH21a, ds21);
    t.eq(SCH21a.days[ds21[2]].night[0][1], 'OFF', "Melvin's default pattern (Mon off) applies");
    t.eq(SCH21a.days[ds21[3]].night[0][1], 'OFF', "Melvin's default pattern (Tue off) applies");
    t.eq(SCH21a.days[ds21[0]].night[0][1], '1', 'Melvin works Saturday, his normal pattern');
    t.eq(SCH21a.days[ds21[5]].night[0][1], 'R-OFF', "Melvin's Thursday R-OFF survives even though it's not his default off day");
    t.eq(SCH21a.days[ds21[0]].night[1][1], 'OFF', "Luis's default pattern (Sat off) applies");
    t.eq(SCH21a.days[ds21[1]].night[1][1], 'OFF', "Luis's default pattern (Sun off) applies");
    t.eq(SCH21a.days[ds21[2]].night[1][1], '1', 'Luis works Monday, his normal pattern');

    // PM Supervisor: Yanira's working days relabel to 'PM'; her OFF days
    // and everyone else's cells are untouched.
    const SCH21b = { days: { [ds21[0]]: { sup: [['Yanira', '1'], ['Other', '1']] }, [ds21[1]]: { sup: [['Yanira', 'OFF']] } } };
    win.schedApplyPmSupervisor(SCH21b, ds21);
    t.eq(SCH21b.days[ds21[0]].sup[0][1], 'PM', "Yanira's working day relabels to PM — the value this app already counts as staffed");
    t.eq(SCH21b.days[ds21[0]].sup[1][1], '1', 'everyone else on Supervisors is untouched');
    t.eq(SCH21b.days[ds21[1]].sup[0][1], 'OFF', "Yanira's own OFF day is left alone, not relabeled");

    // Cover chains: single-tier (Sarahi -> Andrea, Victoriano Ch ->
    // Jorge Gonzalez), two-tier escalation (Marroquin -> Gabriela Cuevas
    // -> Sandra S), no-cover-needed, and no-one-available-to-cover.
    // Names here are spelled exactly as they appear in Carlos's real
    // Schedule Draft, confirmed 2026-08-16 — see the header comment on
    // SCHED_COVER_CHAINS in index.html for why these differ from how he
    // described them in chat.
    const SCH21c = {
      days: {
        [ds21[0]]: { // titular off, first-tier cover available
          lobby: [['Marroquin', 'OFF'], ['Sarahi', '1']],
          gra: [['Gabriela Cuevas', '1'], ['Sandra S', '1']],
        },
        [ds21[1]]: { // titular off, first-tier cover ALSO off — escalates to second tier
          lobby: [['Marroquin', 'OFF']],
          gra: [['Gabriela Cuevas', 'OFF'], ['Sandra S', '1']],
        },
        [ds21[2]]: { // titular off, both covers off — nobody covers
          lobby: [['Marroquin', 'OFF']],
          gra: [['Gabriela Cuevas', 'OFF'], ['Sandra S', 'OFF']],
        },
        [ds21[3]]: { // titular working — no cover needed
          lobby: [['Marroquin', '1']],
          gra: [['Gabriela Cuevas', '1'], ['Sandra S', '1']],
        },
        [ds21[4]]: { // Lobby PM chain + Laundry chain, same day
          lobby: [['Sarahi', 'OFF']],
          td: [['Andrea', '1'], ['Paty', '1']],
          laundry: [['Victoriano Ch', 'OFF']],
          hp: [['Jorge Gonzalez', '1']],
        },
      },
    };
    win.schedApplyCoverChains(SCH21c, ds21);
    t.eq(SCH21c.days[ds21[0]].gra[0][1], 'LOBBY', "Gabriela Cuevas covers Lobby AM on Marroquin's day off");
    t.eq(SCH21c.days[ds21[0]].gra[1][1], '1', 'Sandra S is untouched when Gabriela Cuevas already covered');
    t.eq(SCH21c.days[ds21[1]].gra[1][1], 'LOBBY', "Sandra S covers when BOTH Marroquin and Gabriela Cuevas are off");
    t.eq(SCH21c.days[ds21[2]].gra[0][1], 'OFF', 'with nobody available in the chain, everyone just stays off — nothing forced');
    t.eq(SCH21c.days[ds21[2]].gra[1][1], 'OFF', 'same for the second tier — no cover fabricated out of thin air');
    t.eq(SCH21c.days[ds21[3]].gra[0][1], '1', "Marroquin working means no cover triggers at all — Gabriela Cuevas stays on her own crew");
    t.eq(SCH21c.days[ds21[4]].td[0][1], 'LOBBY', "Andrea covers Lobby PM on Sarahi's day off");
    t.eq(SCH21c.days[ds21[4]].hp[0][1], 'LAUNDRY', "Jorge Gonzalez covers Laundry on Victoriano Ch's day off — a different chain, same day, doesn't interfere");
    t.eq(SCH21c.days[ds21[4]].td[1][1], '1', "Paty is unrelated to either chain that day and stays untouched");

    // A titular missing from this week's roster entirely is skipped, not
    // guessed at — schedCellFor returns '' and the chain never fires.
    const SCH21d = { days: { [ds21[0]]: { lobby: [], gra: [['Gabriela Cuevas', '1']] } } };
    win.schedApplyCoverChains(SCH21d, ds21);
    t.eq(SCH21d.days[ds21[0]].gra[0][1], '1', "no Marroquin row this week at all — Gabriela Cuevas is left alone rather than assumed covering");

    // Yesenia (PM Houseman): exactly 1 day off, forced deterministic via
    // a pre-set R-OFF so the cover check lands on a known day. Paty
    // covers on that day if she's actually working her own Turndown
    // shift; if she's off too, the day is left for Carlos, per his
    // answer that nobody covers automatically in that case.
    const SCH21e = { days: {} };
    ds21.forEach((ds) => { SCH21e.days[ds] = { pmhm: [['Yesenia', '']], td: [['Paty', '1']] }; });
    SCH21e.days[ds21[3]].pmhm[0][1] = 'R-OFF'; // Yesenia's one day off, forced to Tuesday
    win.schedApplyYesenia(SCH21e, ds21, 0);
    t.eq(SCH21e.days[ds21[3]].pmhm[0][1], 'R-OFF', "Yesenia's forced day off is unchanged");
    t.eq(SCH21e.days[ds21[3]].td[0][1], 'HOUSEMAN', "Paty covers on Yesenia's day off, since Paty is working her own Turndown shift that day");
    ds21.forEach((ds, i) => { if (i !== 3) t.eq(SCH21e.days[ds].pmhm[0][1], '1', ds + ': Yesenia works every other day, exactly the 6-day pattern'); });

    const SCH21f = { days: {} };
    ds21.forEach((ds) => { SCH21f.days[ds] = { pmhm: [['Yesenia', '']], td: [['Paty', '1']] }; });
    SCH21f.days[ds21[3]].pmhm[0][1] = 'R-OFF';
    SCH21f.days[ds21[3]].td[0][1] = 'OFF'; // Paty off too, same day
    win.schedApplyYesenia(SCH21f, ds21, 0);
    t.eq(SCH21f.days[ds21[3]].td[0][1], 'OFF', "Paty being off too is left exactly as Carlos said — nobody automatic, no HOUSEMAN forced onto her OFF day");

    // Houseman overflow: Rubia then Julia, pulled only as far as needed
    // and only from an actually-working Room Attendant day. ("Rubia" and
    // "Julia" — not "Rubia T"/"Julia S" — the exact spelling in Carlos's
    // real Room Attendant roster.)
    const SCH21g = { days: { [ds21[0]]: {
      occ: '100', dep: '80', tdOcc: '', // dep=80 -> schedSupHpNeeded = 3
      hp: [['H1', 'OFF'], ['H2', 'OFF']],
      gra: [['Rubia', '1'], ['Julia', '1'], ['Other RA', '1']],
    } } };
    win.schedApplyHpOverflow(SCH21g, ds21);
    t.eq(SCH21g.days[ds21[0]].gra[0][1], 'HOUSEMAN', 'Rubia is pulled first');
    t.eq(SCH21g.days[ds21[0]].gra[1][1], 'HOUSEMAN', 'Julia is pulled second, since Houseman is still short of 3 after Rubia alone');
    t.eq(SCH21g.days[ds21[0]].gra[2][1], '1', "Other RA isn't a designated backup and is never touched");

    const SCH21h = { days: { [ds21[0]]: {
      occ: '100', dep: '80', tdOcc: '',
      hp: [['H1', '1'], ['H2', '1'], ['H3', '1']], // already meets need=3 on its own
      gra: [['Rubia', '1'], ['Julia', '1']],
    } } };
    win.schedApplyHpOverflow(SCH21h, ds21);
    t.eq(SCH21h.days[ds21[0]].gra[0][1], '1', 'Houseman already at standard — the backups are never pulled at all');

    const SCH21i = { days: { [ds21[0]]: {
      occ: '100', dep: '80', tdOcc: '',
      hp: [['H1', 'OFF']],
      gra: [['Rubia', 'OFF'], ['Julia', '1']], // Rubia is off her own RA shift that day
    } } };
    win.schedApplyHpOverflow(SCH21i, ds21);
    t.eq(SCH21i.days[ds21[0]].gra[0][1], 'OFF', "Rubia being off her own shift means she isn't pulled — only someone already working can be relabeled");
    t.eq(SCH21i.days[ds21[0]].gra[1][1], 'HOUSEMAN', 'so Julia covers instead');
  }
};
