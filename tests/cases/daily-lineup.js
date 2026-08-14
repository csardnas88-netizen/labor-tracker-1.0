/* Daily Lineup — drafts tomorrow's housekeeping shift from three of
   Carlos's own spreadsheets (Schedule Draft, Section assignment, and his
   printed template).

   Three things here are genuinely easy to get wrong and were all hit
   while building it against the real files, so each gets pinned:

   1) Blocks in the Schedule Draft must be located by their column-A
      LABEL, never a fixed row. The layout shifts between weekly sheets
      (one week carries an extra Turndown name and pushes everything
      below it down a row), so hard row numbers silently read the wrong
      people. Worse, "Departures" appears TWICE — once as the header
      figure up top and again above the supervisor block — so the
      supervisor block has to be anchored past "Managers" or it swallows
      Laundry and Managers instead.

   2) Name resolution must be scoped to ONE block. First names repeat
      across the sheet: there is a "Susan" in Laundry and a "Susan A"
      supervising floors. Matching against every name at once returns
      whichever collides first and reports the wrong person's day off.

   3) A day with nothing entered is not a day of zeros. An owner who is
      off leaves her section UNCOVERED, and that has to surface as a
      warning Carlos acts on — not silently vanish, and not get filled by
      a guess. Which floater covers what is his call ("criterio del
      momento"), so the app never invents it. */
const { loadApp, fakeSession } = require('../_harness');

const SERIAL = (y, m, d) => Date.UTC(y, m, d) / 86400000 + 25569;

/* Sparse row builder: rows[r-1][c-1], 1-indexed like the spreadsheet. */
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

/* One real week: Sat Aug 8 .. Fri Aug 14 2026, Friday's column (8) is the
   day under test and carries the real values from Carlos's own file. */
function scheduleWb() {
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
        // A "Susan" here on purpose — she collides with the supervisor
        // "Susan A" below and is OFF on Friday, so a global name lookup
        // would wrongly drop Susan A from the lineup.
        12: [[1, 'Susan'], [F, 'OFF']],
        13: [[1, 'Jorge Gonzalez'], [F, '1']],
        26: [[1, 'Total  Linen Att']],
        28: [[1, 'Managers']],
        29: [[1, 'Carlos'], [F, '1']],
        30: [[1, 'Manny'], [F, '1']],
        31: [[1, 'Ingrid'], [F, 'PM']],
        34: [[1, 'Departures']],   /* second one — supervisors start here */
        36: [[1, 'Rolando'], [F, '1']],
        37: [[1, 'Jose B'], [F, '1']],
        38: [[1, 'Rubidia G'], [F, 'R-OFF']],
        39: [[1, 'Maria T'], [F, 'R-OFF']],
        40: [[1, 'Susan A'], [F, '1']],
        41: [[1, 'Yanira'], [F, 'PM']],
        42: [[1, 'Missing Supervisor']],
        50: [[1, 'AM lobby']],
        51: [[1, 'Marroquin'], [F, 'OFF']],
        52: [[1, 'Sarahi'], [F, '1']],
        55: [[1, 'Vanesa'], [F, '1']],
        58: [[1, 'Total  Lobby Att']],
        60: [[1, 'PM Turndown /GRA']],
        61: [[1, 'OCC'], [F, '133']],
        // Another collision: this "Andrea" is in Turndown, and there is
        // no Andrea in Lobby this week — but the section sheet names one
        // for each, so the lookup still has to stay in its own block.
        64: [[1, 'Guadalupe'], [F, '1']],
        65: [[1, 'Andrea'], [F, '1']],
        66: [[1, 'Lorena'], [F, '1']],
        67: [[1, 'Aura'], [F, 'OFF']],
        68: [[1, 'Paty'], [F, 'OFF']],
        69: [[1, 'Veronica'], [F, 'OFF']],
        70: [[1, 'Jazmin'], [F, 'OFF']],
        71: [[1, 'Yesenia'], [F, 'HOUSEMAN']],
        73: [[1, 'Total  TD attd']],
        80: [[1, 'Overnight']],
        81: [[1, 'Katherine'], [F, '']],
        82: [[1, 'Melvin'], [F, '1']],
        83: [[1, 'Luis'], [F, '1']],
        84: [[1, 'Total  ON Attd']],
        86: [[1, 'AM ROOM ATTENDANT']],
        91: [[1, 'Departures'], [F, '130']],
        92: [[1, 'Claudia Villanueva'], [F, '1']],
        93: [[1, 'Evangelina Frias'], [F, '1']],
        94: [[1, 'Thelma Raymundo'], [F, '1']],
        95: [[1, 'Karla Varela'], [F, '1']],
        96: [[1, 'Aletis Tzunun'], [F, 'OFF']],
        97: [[1, 'Maria Noriega'], [F, 'OFF']],
        98: [[1, 'Sandra'], [F, 'OFF']],
        99: [[1, 'Jazmy'], [F, 'OFF']],
        100: [[1, 'Abigail Rosa'], [F, 'OFF']],
        101: [[1, 'Maria Aguilar'], [F, 'OFF']],
        102: [[1, 'Sandra S'], [F, 'LOBBY']],
        103: [[1, 'Ada'], [F, '1']],
        104: [[1, 'Mayra'], [F, '1']],
        105: [[1, 'Debora'], [F, '1']],
        117: [[1, 'Total Room Att']],
        122: [[1, 'Houseman']],
        123: [[1, 'Supervisor'], [F, '3']],
        124: [[1, 'Mauricia'], [F, '1']],
        125: [[1, 'David'], [F, '1']],
        126: [[1, 'Vanessa'], [F, 'OFF']],
        127: [[1, 'Elmer Galindo'], [F, 'OFF']],
        128: [[1, 'Diana'], [F, '1']],
        132: [[1, 'Total HP']]
      })
    }
  };
}

function sectionsWb() {
  return {
    SheetNames: ['GRA', 'HM & Supervisor'],
    Sheets: {
      GRA: sheet({
        7: [[2, '3rd'], [4, 'Aletis']],
        8: [[2, '4th'], [4, 'Maria'], [8, 'Gabriela']],
        9: [[2, '5th'], [4, 'Karla Varela'], [8, 'Ada']],
        10: [[2, '6th'], [4, 'Sandra'], [8, 'Mayra']],
        11: [[2, '7th'], [4, 'Debora']],
        12: [[2, '8th'], [4, 'Evangelina']],
        14: [[2, '10th'], [4, 'Jazmy']],
        15: [[2, '11th'], [4, 'Claudia']],
        16: [[2, '12th'], [4, 'Thelma']],
        25: [[2, '21st'], [4, 'Abby']],
        26: [[2, '22nd'], [4, 'Maria Aguilar']]
      }, 10),
      'HM & Supervisor': sheet({
        7: [[1, '2nd - 5th'], [2, 'Mauricia'], [5, '2nd - 5th'], [6, 'Rubidia']],
        8: [[1, '6th - 9th'], [2, 'Vane'], [5, '6th - 9th'], [6, 'Jose']],
        9: [[1, '10th - 13th'], [2, 'Elmer'], [5, '10th - 13th'], [6, 'Susan']],
        10: [[1, '14th - 17th'], [2, 'David'], [5, '14h - 17th'], [6, 'Maria']],
        11: [[1, '18th - 22nd'], [2, 'Jorge'], [5, '18th - 22nd'], [6, 'Rolando']],
        13: [[1, 'Floater'], [2, 'Diana']],
        16: [[1, 'PM'], [2, 'Yesenia']],
        17: [[1, 'ON'], [6, 'Yanira']],
        22: [[1, 'Lobby AM'], [2, 'Maria M'], [5, 'Turn Down 2-5'], [6, 'Aura']],
        23: [[1, 'Lobby PM'], [2, 'Sarahy'], [5, 'Turn Down 6-10'], [6, 'Paty']],
        24: [[1, 'Lobby AM Floater'], [2, 'Gabriela'], [5, 'Turn Down 10-14'], [6, 'Guadalupe']],
        26: [[1, 'Lobby PM'], [2, 'Vanesa'], [5, 'Turn Down 18-22'], [6, 'Jazmin']],
        28: [[5, 'Floater'], [6, 'Andrea']],
        29: [[5, 'Floater 2'], [6, 'Lorena']]
      }, 8)
    }
  };
}

module.exports = {
  name: "Daily Lineup: blocks found by label not row, names resolved within their own block, and an uncovered section is never quietly filled",
  async run(t) {
    const { win } = await loadApp({ seed: Object.assign(fakeSession(), { 'hk_rooms_migrated_v2': '1' }) });
    await new Promise((r) => setTimeout(r, 60));

    // The harness stubs XLSX (no real parser in jsdom); hand sheet_to_json
    // the arrays directly so the app's own parsing logic is what runs.
    win.XLSX.utils.sheet_to_json = (ws) => ws._rows;

    // ── Section assignment ──
    const S = win.dlParseSections(sectionsWb());
    t.eq(S.gra['7th'], 'Debora', 'floor -> owner comes off the GRA sheet');
    t.eq(S.gra['22nd'], 'Maria Aguilar');
    t.eq(S.gra_floaters.join(','), 'Gabriela,Ada,Mayra', 'the three AM floaters are read as floaters, not as section owners');
    t.eq(S.sup.length, 5, 'supervisors come back as five floor ranges');
    t.eq(S.sup[1][1], 'Jose', 'with the person who owns each range');
    t.eq(S.hm_float, 'Diana', 'the houseman floater is picked up separately');
    t.eq(S.td.length, 6, 'turndown ranges plus its two floaters');
    win.dlSaveSections(S);

    // ── Schedule Draft ──
    const SCH = win.dlParseSchedule(scheduleWb(), new Date(2026, 7, 13));
    t.eq(SCH.count, 7, 'all seven days of the week land inside the window');
    const day = SCH.days['2026-08-14'];
    t.assert(day, 'Friday Aug 14 is keyed by its own date, decoded from the sheet\'s date serial');
    t.eq(day.occ, '190', "and carries that day's occupancy");
    t.eq(day.dep, '130');

    // The trap: "Departures" appears twice, so an unanchored lookup makes
    // the supervisor block start at row 8 and swallow Laundry + Managers.
    const supNames = day.sup.map((p) => p[0]);
    t.assert(supNames.indexOf('Rolando') !== -1 && supNames.indexOf('Susan A') !== -1,
      'the supervisor block is the one under the SECOND "Departures" row');
    t.assert(supNames.indexOf('Carlos') === -1 && supNames.indexOf('Susan') === -1,
      'and does not swallow Managers or Laundry, which sit above it');
    t.eq(day.mgr.length, 3, 'Managers is its own block');

    // Dates outside the window are dropped rather than stored for weeks
    // nobody will open.
    const far = win.dlParseSchedule(scheduleWb(), new Date(2027, 0, 1));
    t.eq(far.count, 0, 'a week far outside the window is not stored at all');
    win.dlSaveSchedule(SCH);

    // ── Name resolution stays inside its block ──
    t.eq(win.dlLook(day, 'sup', 'Susan'), '1',
      'the section sheet\'s "Susan" resolves to the supervisor Susan A, who is IN');
    t.eq(win.dlLook(day, 'gra', 'Maria'), 'OFF',
      '"Maria" resolves to Maria Noriega, not Maria Aguilar — the alias exists precisely because both are on the sheet');
    t.eq(win.dlLook(day, 'td', 'Andrea'), '1', 'and Turndown\'s Andrea is found in the Turndown block');

    // ── The plan ──
    const P = win.dlBuildPlan('2026-08-14');
    t.assert(P, 'a plan builds for a day the schedule covers');
    t.eq(P.sup.join(','), 'Jose,Susan,Rolando', 'only the supervisors actually in that day, in floor-range order');
    t.eq(P.sup_pm.join(','), 'Yanira', 'the PM supervisor is picked up from her PM code, not a 1');
    t.eq(P.hm.join(','), 'Mauricia,David,Diana', 'housemen in, with the floater appended');
    t.eq(P.pm_coord.join(','), 'Ingrid', 'PM coordinator');
    t.eq(P.td.join(','), 'Guadalupe,Andrea,Lorena', 'turndown: the one range owner in, plus both floaters');
    t.eq(P.night.join(','), 'Melvin,Luis', 'overnight');

    // A GRA the schedule explicitly pulls to the lobby covers it when the
    // usual lobby person is off — that override is how Carlos records it.
    t.eq(P.lobby_pm.join(','), 'Sarahy,Vanesa', 'PM lobby from the section sheet');
    t.assert(P.lobby_am.indexOf('Sandra S') !== -1,
      'a GRA whose schedule cell reads LOBBY is placed in the lobby, not left among the room attendants');
    t.assert(P.pulled.some((p) => p[0] === 'Sandra S' && p[1] === 'LOBBY'),
      'and the override is surfaced so it is visible why she left her section');

    // ── Sections: owners placed, the rest flagged, nothing invented ──
    t.eq(P.gra['7th'], 'Debora', 'an owner who is in gets her own section');
    t.eq(P.gra['5th'], 'Karla Varela');
    t.assert(!P.gra['4th'], "Maria Noriega is off, so the 4th is NOT filled by anyone");
    t.assert(!P.gra['6th'], 'nor the 6th');
    const unc = P.uncovered.map((u) => u[0]);
    t.assert(unc.indexOf('4th') !== -1 && unc.indexOf('6th') !== -1,
      'both surface as uncovered, which is what Carlos acts on');
    t.eq(P.floaters.join(','), 'Ada,Mayra',
      'the floaters who are in are offered, NOT auto-placed — which floor each takes is his call');
    t.eq(win.dlUnplacedFloaters(P).join(','), 'Ada,Mayra', 'and start out unplaced');
    t.assert(Object.keys(win.dlFinalFloors(P)).indexOf('4th') === -1,
      'so the 4th stays empty until he says otherwise');

    // ── His decision, once made, sticks ──
    win.dlDate = '2026-08-14';
    win.dlAssignFloater('Mayra', '4th');
    const P2 = win.dlBuildPlan('2026-08-14');
    t.eq(P2.assign.Mayra, '4th', 'a floater placement is remembered against that date');
    t.eq(win.dlFinalFloors(P2)['4th'], 'Mayra', 'and shows on the 4th');
    t.eq(win.dlUnplacedFloaters(P2).join(','), 'Ada', 'leaving only the floater he has not placed yet');
    t.assert(!P2.gra['4th'], 'without rewriting who OWNS the section — she is covering it, not taking it');

    // Clearing it puts the section back to uncovered rather than stranding
    // a stale name on a floor nobody is working.
    win.dlAssignFloater('Mayra', '');
    t.assert(!win.dlFinalFloors(win.dlBuildPlan('2026-08-14'))['4th'], 'un-assigning frees the section again');

    // ── Occupancy: seeded from the schedule, overridable per day ──
    t.eq(P.occ, '190', 'occupancy starts at the schedule\'s own projection');
    t.eq(P.occOverride, null, 'with no override until Carlos types one');
    win.dlSetOcc('occ', '181');
    t.eq(win.dlBuildPlan('2026-08-14').occOverride, 181,
      'the real Opera figure overrides it for that day without touching the schedule');
    win.dlSetOcc('occ', '');
    t.eq(win.dlBuildPlan('2026-08-14').occOverride, null, 'and clearing it falls back to the schedule again');

    // ── Drop rooms / rooms received ──
    // Carlos's sheet computes To Clean as (HR/Day of + OCC before) −
    // HR/Next Day: rooms he takes on ADD to the day, rooms he pushes to
    // tomorrow SUBTRACT. This is what decides how many rooms each lady
    // carries, and an earlier version of the Excel export blanked those
    // two cells outright — silently wiping the adjustment every time.
    const base = win.dlBuildPlan('2026-08-14');
    t.eq(base.toClean, 190, 'with no adjustment, To Clean is just the base occupancy');
    t.eq(base.recv, 0, 'nothing received by default');
    t.eq(base.drop, 0, 'and nothing dropped');

    win.dlSetOcc('recv', '2');
    win.dlSetOcc('drop', '5');
    const adj = win.dlBuildPlan('2026-08-14');
    t.eq(adj.toClean, 187, 'received ADDS and dropped SUBTRACTS: 2 + 190 − 5 = 187');
    t.eq(adj.occBase, 190, 'without disturbing the base figure the schedule supplied');

    // Departures carry their own adjustment on the row below.
    win.dlSetOcc('recvDep', '1');
    win.dlSetOcc('dropDep', '4');
    t.eq(win.dlBuildPlan('2026-08-14').toCleanDep, 127, 'departures adjust independently: 1 + 130 − 4 = 127');

    // The whole point: the per-lady figure must follow the adjustment,
    // not the raw schedule number.
    const adj2 = win.dlBuildPlan('2026-08-14');
    win.dlAssignFloater('Mayra', '4th');
    const withF = win.dlBuildPlan('2026-08-14');
    const ladies = Object.keys(win.dlFinalFloors(withF)).length;
    t.assert(Math.abs(withF.toClean / ladies - 187 / ladies) < 1e-9,
      'rooms per lady is computed off the adjusted To Clean, which is the number that changes her workload');
    win.dlAssignFloater('Mayra', '');

    // ── Yesterday's drop becomes today's received, automatically ──
    // Those rooms went somewhere, and it is the next day that inherits
    // them. It stays a DEFAULT though: if only part of them carried,
    // typing a number pins it. Tested across Thu 13 -> Fri 14, both in
    // the loaded week.
    win.dlSetOcc('recv', ''); win.dlSetOcc('drop', '');
    win.dlSetOcc('recvDep', ''); win.dlSetOcc('dropDep', '');
    win.dlDate = '2026-08-13';
    win.dlSetOcc('drop', '5');
    win.dlSetOcc('dropDep', '4');

    const next = win.dlBuildPlan('2026-08-14');
    t.eq(next.recv, 5, "the 5 rooms dropped on the 13th show up as received on the 14th");
    t.eq(next.recvAuto, true, 'flagged as carried over, so the page can say where it came from');
    t.eq(next.recvDep, 4, 'departures carry the same way');
    t.eq(next.toClean, 195, 'and they land in the total: 5 + 190 = 195');

    win.dlDate = '2026-08-14';
    win.dlSetOcc('recv', '3');
    const pinned = win.dlBuildPlan('2026-08-14');
    t.eq(pinned.recv, 3, 'typing over it wins — only some of the dropped rooms actually carried');
    t.eq(pinned.recvAuto, false, 'and it stops being reported as automatic');
    win.dlSetOcc('recv', '');
    t.eq(win.dlBuildPlan('2026-08-14').recv, 5, 'clearing it falls back to the carry-over again rather than to zero');

    win.dlDate = '2026-08-13';
    win.dlSetOcc('drop', ''); win.dlSetOcc('dropDep', '');
    win.dlDate = '2026-08-14';
    t.eq(win.dlBuildPlan('2026-08-14').toClean, 190, 'clearing every adjustment returns To Clean to the plain schedule figure');

    // ── Turndown divides by its OWN occupancy ──
    // Carlos's sheet keeps turndown's figure in a separate cell from To
    // Clean, and they genuinely differ: on Aug 14 To Clean was 181 while
    // turndown ran 133. Dividing turndown by To Clean would have told
    // three attendants they had 63 rooms each on a night that really ran
    // 44 — a number a manager would act on.
    const td0 = win.dlBuildPlan('2026-08-14');
    t.eq(td0.tdOccSched, 133, "the schedule's own turndown OCC row is read, from inside the turndown block");
    t.eq(td0.tdOcc, 133, 'and is what turndown divides by — NOT To Clean');
    t.assert(td0.tdOcc !== td0.toClean, 'the two are genuinely different figures (190 to clean vs 133 turndown)');
    t.eq(td0.tdOccAuto, true, 'flagged as not hand-confirmed, so the page can show where it came from');

    win.dlDate = '2026-08-14';
    win.dlSetOcc('tdOcc', '133');
    const td1 = win.dlBuildPlan('2026-08-14');
    t.eq(td1.tdOcc, 133, "typing turndown's real occupancy pins it");
    t.eq(td1.tdOccAuto, false, 'and it stops being a seed');
    t.eq(td1.toClean, 190, 'without touching To Clean, which is a different figure entirely');
    win.dlSetOcc('tdOcc', '');
    t.eq(win.dlBuildPlan('2026-08-14').tdOcc, 133, "clearing it falls back to the schedule's figure, not to zero and not to To Clean");

    // ── What Carlos fills in during the Opera opening ──
    // Beside each lady: her room total, her departures, and a tick once
    // her assignment is done. Kept per DATE, so reopening a past day
    // shows what actually went out.
    win.dlDate = '2026-08-14';
    win.dlSetLady('7th', 'rooms', '13');
    win.dlSetLady('7th', 'dep', '9');
    win.dlSetLady('7th', 'done', true);
    const opened = win.dlBuildPlan('2026-08-14');
    t.eq(opened.lady['7th'].rooms, '13', "the lady's room total is kept against her floor");
    t.eq(opened.lady['7th'].dep, '9', 'and her departures');
    t.eq(opened.lady['7th'].done, true, 'and the finished tick');

    win.dlSetLady('7th', 'done', false);
    t.assert(!(win.dlBuildPlan('2026-08-14').lady['7th'] || {}).done, 'unticking clears it');
    win.dlSetLady('7th', 'rooms', '');
    win.dlSetLady('7th', 'dep', '');
    t.assert(!win.dlBuildPlan('2026-08-14').lady['7th'],
      'clearing every field drops the row entirely rather than leaving an empty husk behind');

    // Numbers belong to the DAY, not to the floor forever — a different
    // date must not inherit yesterday's counts.
    win.dlSetLady('7th', 'rooms', '13');
    t.assert(!(win.dlBuildPlan('2026-08-13').lady['7th'] || {}).rooms,
      "another day's sheet starts clean");
    win.dlDate = '2026-08-14';
    win.dlSetLady('7th', 'rooms', '');

    // ── The four room lists along the bottom of his sheet ──
    // Room NUMBERS, not counts — the point is which rooms.
    t.eq(win.DL_EXTRA_FIELDS.length, 4, 'all four lists are carried');
    const labels = win.DL_EXTRA_FIELDS.map((f) => f.label).join('|');
    t.assert(/Anz Room/.test(labels) && /Stayover/.test(labels)
      && /Feather Free/.test(labels) && /Rooms Found Vacant/.test(labels),
      'Anz Room, Stayover, Feather Free and Rooms Found Vacant');
    win.DL_EXTRA_FIELDS.forEach((f) => {
      t.assert(/^[A-Z]+\d+$/.test(f.cell), f.label + ' knows which template cell it writes into');
    });

    win.dlSetExtra('anz', '1204, 1508');
    t.eq(win.dlBuildPlan('2026-08-14').extras.anz, '1204, 1508', 'room numbers are stored as written');
    win.dlSetExtra('anz', '');
    t.assert(!win.dlBuildPlan('2026-08-14').extras.anz, 'and clear back out');

    // ── Which floors each Floor Supervisor AND House Attendant ends up
    // covering ──
    // This is Carlos's own call, made after he's counted the day's real
    // rooms — not something the weekly Section assignment file can know
    // ahead of time. Both roles share the same map, since it's the same
    // "Floors" column on his template for both (right of the
    // supervisors AND right of the housemen). Typed in per date; the
    // printed line stays blank and ready for a pen even when nothing's
    // been typed.
    win.dlDate = '2026-08-14';
    t.eq(win.dlBuildPlan('2026-08-14').sup.join(','), 'Jose,Susan,Rolando', 'the supervisor fixture for this day');
    t.eq(win.dlBuildPlan('2026-08-14').hm.join(','), 'Mauricia,David,Diana', 'the houseman fixture for this day');
    win.dlSetFloors('Jose', '2-6');
    win.dlSetFloors('Susan', '7, 9-11');
    win.dlSetFloors('David', '14-17');
    let floorsPlan = win.dlBuildPlan('2026-08-14');
    t.eq(floorsPlan.floorsByName.Jose, '2-6', "Jose's range is kept against his name");
    t.eq(floorsPlan.floorsByName.Susan, '7, 9-11', 'a non-contiguous range is stored exactly as typed');
    t.assert(!floorsPlan.floorsByName.Rolando, 'a supervisor nobody typed a range for stays unset');
    t.eq(floorsPlan.floorsByName.David, '14-17', "a houseman's range is kept the same way, in the same map");
    t.assert(!floorsPlan.floorsByName.Mauricia, 'a houseman nobody typed a range for stays unset too');

    win.dlSetFloors('Jose', '');
    t.assert(!win.dlBuildPlan('2026-08-14').floorsByName.Jose, 'clearing one range leaves the others untouched');
    t.eq(win.dlBuildPlan('2026-08-14').floorsByName.Susan, '7, 9-11', "Susan's is still there");
    t.eq(win.dlBuildPlan('2026-08-14').floorsByName.David, '14-17', "and David's");

    // Per DATE, not permanently pinned to the name.
    win.dlSetFloors('Susan', '3-5');
    t.assert(!(win.dlBuildPlan('2026-08-13').floorsByName || {}).Susan,
      "another day's sheet does not inherit today's floor range");
    win.dlDate = '2026-08-14';

    win.renderDailyLineup();
    const floorsHtml = win.document.getElementById('dailyLineupContent').innerHTML;
    t.assert(/3-5/.test(floorsHtml), "Susan's floor range shows on the page");
    t.assert(/14-17/.test(floorsHtml), "and David's, under House attendants");

    let floorsPrinted = '';
    const realOpenFloors = win.open;
    win.open = () => ({ document: { write: (h) => { floorsPrinted = h; }, close() {} }, focus() {}, print() {} });
    try { win.dlPrint(); } finally { win.open = realOpenFloors; }
    t.assert(/flline">3-5<\/span>/.test(floorsPrinted), "the printed lineup shows Susan's typed-in floors on her line");
    t.assert(/flline">14-17<\/span>/.test(floorsPrinted), "and David's, under House attendants");
    t.assert(/flline">&nbsp;<\/span>/.test(floorsPrinted), "and Rolando's line — nothing typed — prints blank and ready for a pen");
    win.dlSetFloors('Susan', '');
    win.dlSetFloors('David', '');

    // ── The .XX in "43.33 each" spelled out as a real split ──
    // Carlos asked what the decimal actually means once the shift
    // starts: with 130 departures across 3 supervisors, nobody gets a
    // fraction — two of them get 43 and one gets 44. This must show up
    // wherever a per-person average already does (Floor supervisors,
    // House attendants, Turndown), on both the screen and the print.
    const evenPlan = win.dlBuildPlan('2026-08-14');
    t.eq(evenPlan.toCleanDep, 130, 'the departures total this split is based on');
    t.eq(evenPlan.sup.length, 3, 'three floor supervisors this day');
    // 130 / 3 = 43 remainder 1 -> two people at 43, one at 44.
    win.renderDailyLineup();
    const splitHtml = win.document.getElementById('dailyLineupContent').innerHTML;
    t.assert(/43\.33/.test(splitHtml), 'the average still shows');
    t.assert(/\(2 at 43, 1 at 44\)/.test(splitHtml), 'and the real split is spelled out beside it');

    let splitPrinted = '';
    const realOpenSplit = win.open;
    win.open = () => ({ document: { write: (h) => { splitPrinted = h; }, close() {} }, focus() {}, print() {} });
    try { win.dlPrint(); } finally { win.open = realOpenSplit; }
    t.assert(/\(2 at 43, 1 at 44\)/.test(splitPrinted), 'the printed sheet spells out the same split for Floor supervisors');
    // Turndown: 133 rooms / 3 attendants = 44 remainder 1 -> two at 44, one at 45.
    t.assert(/\(2 at 44, 1 at 45\)/.test(splitPrinted), 'and its own split for Turndown, a different total and a different remainder');

    // A split with no remainder gets no note — it would just repeat the
    // average and add noise on a day that happens to divide evenly.
    // GRA Sections: 190 rooms / 5 ladies = 38 exactly, 130 departures /
    // 5 ladies = 26 exactly.
    const graBarHtml = splitHtml.match(/GRA Sections<\/span>.*?<\/div>/s);
    t.assert(graBarHtml && /38\.00/.test(graBarHtml[0]), 'the even rooms average still shows');
    t.assert(graBarHtml && !/\(\d+ at \d+/.test(graBarHtml[0]), 'but no split note, since 190 divides evenly across 5 ladies');

    // The printed GRA Sections figure is its own hand-rolled line (not
    // routed through the shared each()/dlEach() helper the other roles
    // use), so it needs its own check that the split note actually
    // reaches it — this was the one place it didn't, until now.
    win.dlSetOcc('occ', '191');
    let graPrinted = '';
    const realOpenGra = win.open;
    win.open = () => ({ document: { write: (h) => { graPrinted = h; }, close() {} }, focus() {}, print() {} });
    try { win.dlPrint(); } finally { win.open = realOpenGra; }
    t.assert(/perlady">38\.20 rooms <span class="sn">\(4 at 38, 1 at 39\)/.test(graPrinted),
      'and it shows up there too: 191 rooms / 5 ladies is not even, so the printed sheet says who gets the extra one');
    win.dlSetOcc('occ', '');

    // ── Every floor stays on the sheet, covered or not ──
    // An uncovered floor still has rooms that must go somewhere; Carlos
    // writes a name on that line by hand, so the row cannot vanish.
    const openingPlan = win.dlBuildPlan('2026-08-14');
    const covered = win.dlFinalFloors(openingPlan);
    t.assert(Object.keys(covered).length < win.DL_FLOORS.length, 'this day genuinely has uncovered floors');
    const printed = (() => {
      let cap = '';
      const realOpen = win.open;
      win.open = () => ({ document: { write: (h) => { cap = h; }, close() {} }, focus() {}, print() {} });
      try { win.dlPrint(); } finally { win.open = realOpen; }
      return cap;
    })();
    win.DL_FLOORS.forEach((fl) => {
      t.assert(new RegExp('>' + fl + '<').test(printed), fl + ' has a row on the printed sheet even when nobody owns it');
    });
    t.assert(/Anz Room/.test(printed) && /Feather Free/.test(printed), 'the four room lists print too');

    // ── A day the schedule does not cover must say so, not draw a blank
    // lineup that looks like nobody is working. ──
    t.eq(win.dlBuildPlan('2026-12-25'), null, 'a date outside the loaded schedule yields no plan at all');

    // ── The page renders end to end ──
    win.dlDate = '2026-08-14';
    win.renderDailyLineup();
    const html = win.document.getElementById('dailyLineupContent').innerHTML;
    t.assert(/Daily Lineup/.test(html), 'the lineup card renders');
    t.assert(/Debora/.test(html), 'with the section owners on it');
    t.assert(/uncovered/i.test(html), 'and says plainly that sections are uncovered');
    t.assert(/Ada/.test(html) && /Mayra/.test(html), 'and offers the floaters to place');

    // ── Print: a real printed page, not the browser's dark-mode guess
    // at one. A print window that never states its own colors gets
    // force-inverted by a dark OS/browser theme — legible on screen,
    // useless once actually printed and read off paper. ──
    let printedHtml = '';
    const realOpen = win.open;
    win.open = () => ({ document: { write: (h) => { printedHtml = h; }, close() {} }, focus() {}, print() {} });
    try { win.dlPrint(); } finally { win.open = realOpen; }
    t.assert(/name="color-scheme" content="light"/.test(printedHtml), 'the print page pins itself to light mode explicitly');
    t.assert(/background:#fff/.test(printedHtml), 'with a real white background stated outright, not left to the browser to guess');
  }
};
