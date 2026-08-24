/* Carlos's ask, 2026-08-23: Sundays run heavy on late checkouts, which
   compresses GRA cleaning into the back half of their shift and drags that
   day's Room Attendant labor standard down. He wanted proof, not just an
   assertion, for the labor meeting. This tests the aggregation/weekday math
   and the PDF-row parser against synthetic text fragments shaped exactly
   like the real Housekeeping Task Sheet (OperaPrint) report — same x/y
   positions verified against Carlos's actual file — without needing a real
   PDF binary in the test suite. */
const { loadApp, fakeSession } = require('../_harness');

function fragItem(x, y, str) {
  return { str: str, transform: [1, 0, 0, 1, x, y] };
}

// One page's worth of fragments: an "Instructions"/attendant header row,
// plus four data rows — Departed before 11am, Departed at/after 11am, a
// still-occupied Due Out with NO printed time (must stay excluded — real
// example from Carlos's report: no way to know when it'll actually leave),
// and a still-occupied Due Out WITH a printed time (Carlos's exact catch:
// room 1503 was "Due Out" but the report already had 16:00 on file as its
// approved/scheduled late checkout — that belongs in the late list too).
function buildPageItems(attendantName, y0) {
  const items = [];
  // Header fragments, same on every page of the real report — used to read
  // the report's own date (drives the assigned/suites/floors summary,
  // independent of any one room's own reservation dates).
  items.push(fragItem(0, y0 + 200, 'Task Date From'));
  items.push(fragItem(120, y0 + 200, '08-23-26'));
  items.push(fragItem(160, y0 + 200, 'to'));
  items.push(fragItem(180, y0 + 200, '08-23-26'));
  // Instructions label + attendant name, same row (y = y0 + 40)
  items.push(fragItem(9.1, y0 + 40, 'Instructions'));
  items.push(fragItem(94.5, y0 + 40, attendantName));
  // Header/table rows below. Rooms 1503/1505 are real Suites
  // (LATEDEP_SUITE_ROOMS); 1501/1502/1504/1506 are not. All six are floor 15.
  // Room 1506 carries the report's own "!" (Arrival) legend marker right
  // next to its room number — Carlos's real bug: Sandy's page had 13 rooms
  // but the app only counted 12, because a marker like this used to get
  // concatenated onto the room number and fail the room-number match,
  // silently dropping the whole row.
  const rows = [
    { room: '1501', resv: 'Departed', depdate: '08-23-26', deptime: '07:04' },              // before 11
    { room: '1502', resv: 'Departed', depdate: '08-23-26', deptime: '12:01' },              // at/after 11
    { room: '1503', resv: 'Due', resv2: 'Out', depdate: '', deptime: '' },                  // still occupied, no time — excluded from LATE detail, still assigned (Suite)
    { room: '1504', resv: 'Due', resv2: 'Out', depdate: '08-23-26', deptime: '16:00' },     // still occupied, SCHEDULED late checkout printed — now included
    { room: '1505', resv: 'Stayover', depdate: '', deptime: '' },                           // guest staying another night — "occupied" (Suite too)
    { room: '1506', resv: 'Arrived', depdate: '', deptime: '', marker: '!' },               // flagged row — must still be counted
  ];
  rows.forEach((r, i) => {
    const y = y0 - i * 20;
    if (r.marker) items.push(fragItem(9.0, y, r.marker)); // legend-marker column, left of the room number
    items.push(fragItem(23, y, r.room));           // room bin (<60)
    items.push(fragItem(208, y, r.resv));           // resv bin (195-260)
    if (r.resv2) items.push(fragItem(225, y, r.resv2));
    if (r.depdate) items.push(fragItem(503, y, r.depdate)); // depdate bin (500-530)
    if (r.deptime) items.push(fragItem(551, y, r.deptime)); // deptime bin (530-590)
  });
  return items;
}

function fakePdf(pages) {
  return {
    numPages: pages.length,
    getPage(n) {
      return Promise.resolve({
        getTextContent() { return Promise.resolve({ items: pages[n - 1] }); }
      });
    }
  };
}

module.exports = {
  name: 'Late Departures: PDF row parser + weekday aggregation (Carlos\'s Sunday late-checkout analysis)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── _ldParsePdf against synthetic fragments shaped like the real report ──
    const pdf = fakePdf([
      buildPageItems('Gabriela', 194.6),
      buildPageItems('Evangelina', 194.6),
    ]);
    const result = await win._ldParsePdf(pdf);
    t.eq(result.reportDate, '2026-08-23', "the report's own date is read from its 'Task Date From' header");
    const byDate = result.lateByDs;
    t.assert(Object.keys(byDate).length === 1, 'both synthetic pages report the same departure date');
    const rooms = byDate['2026-08-23'];
    t.eq(rooms.length, 6, 'Due Out WITH a printed time now counts too: 3 late-detail rows per page (1501/1502/1504) x 2 pages — only 1503 (Due Out, no time) stays excluded');
    const gabRoom = rooms.find((r) => r.attendant === 'Gabriela' && r.room === '1502');
    t.assert(!!gabRoom, 'attendant name is correctly attached to the room from the same page\'s Instructions row');
    t.eq(gabRoom.depTime, '12:01', 'actual departure time is read from the Dep. Time column, not the date column');
    const scheduledLate = rooms.find((r) => r.attendant === 'Gabriela' && r.room === '1504');
    t.assert(!!scheduledLate, "Carlos's exact catch: room 1504 (Due Out, still occupied) is now included because it has a scheduled/approved late checkout time printed");
    t.eq(scheduledLate.depTime, '16:00', "the still-occupied room's scheduled checkout time reads correctly, same column as an actual Departed time");
    t.assert(!rooms.some((r) => r.room === '1503'), 'room 1503 (Due Out, NO time printed) stays excluded — no way to know when it will actually leave');

    // ── roomsByAttendant — Carlos's ask: "el total de cuartos asignados a
    // limpiarse en ese día" counts EVERY room (every status), unlike
    // the late-checkout detail above ──
    t.eq(result.roomsByAttendant['Gabriela'].length, 6, "Gabriela's room list includes all 6 rows, including the flagged one (1506)");
    t.eq(result.roomsByAttendant['Evangelina'].length, 6, 'same for Evangelina');
    t.eq(result.roomsByAttendant['Gabriela'][0].resv, 'Departed', 'roomsByAttendant keeps each room\'s reservation status alongside its number');
    t.assert(result.roomsByAttendant['Gabriela'].some((r) => r.room === '1506'), "Carlos's real bug: a room flagged with the report's own legend marker (!/@/#) next to its number is no longer silently dropped");

    // ── _ldSummarizeAssigned / _ldIsSuite / _ldFloorOf — Carlos's ask:
    // floors + Suites + late count together explain a slow day, and split
    // "occupied" (Stayover) from "checked out" (everything else) ──
    const summary = win._ldSummarizeAssigned(result.roomsByAttendant['Gabriela']);
    t.eq(summary.total, 6, 'total rooms assigned, every status, including the flagged room');
    t.eq(summary.floors, 1, 'rooms 1501-1506 are all floor 15 — one floor');
    t.eq(summary.suites, 2, 'rooms 1503 and 1505 are real Suites (LATEDEP_SUITE_ROOMS); the rest are not');
    t.eq(summary.occupied, 1, 'only room 1505 (Stayover) counts as occupied');
    t.eq(summary.checkedOut, 5, 'the other 5 rooms (Departed, Due Out, or Arrived) count as checked out');

    // ── _ldCleanMinutes / roomMinutes / totalMinutes — Carlos's own average
    // figures: 45 min checked-out Suite, 30 min other checked-out, 30 min
    // occupied Suite, 20 min other occupied ──
    t.eq(win._ldCleanMinutes(true, false), 45, 'checked-out Suite');
    t.eq(win._ldCleanMinutes(false, false), 30, 'checked-out standard room');
    t.eq(win._ldCleanMinutes(true, true), 30, 'occupied (Stayover) Suite');
    t.eq(win._ldCleanMinutes(false, true), 20, 'occupied (Stayover) standard room');
    t.eq(summary.roomMinutes['1503'], 45, 'room 1503 (checked out, Suite) gets the 45-min figure');
    t.eq(summary.roomMinutes['1505'], 30, 'room 1505 (occupied, Suite) gets the 30-min figure, not the standard-occupied 20');
    t.eq(summary.roomMinutes['1501'], 30, 'room 1501 (checked out, standard) gets 30 min');
    t.eq(summary.totalMinutes, 195, 'total workload: 30+30+45+30(occupied suite)+30 = 195 min across all 6 of her rooms, not just the ones shown in either detail list');
    t.eq(summary.stayoverRooms.length, 1, 'stayoverRooms lists the actual room numbers, not just a count');
    t.eq(summary.stayoverRooms[0], '1505', 'the room 1505 (Stayover) is the one listed — Carlos\'s ask: show which rooms specifically, colored apart from checked-out rooms');
    t.eq(win._ldFloorOf('2003'), 20, 'floor from a 4-digit room number');
    t.eq(win._ldFloorOf('0605'), 6, "floor from a room number with the hotel's own leading zero");
    t.assert(win._ldIsSuite('1503'), '1503 is on the real Suite list Carlos provided');
    t.assert(!win._ldIsSuite('1501'), '1501 is not on the Suite list');

    // ── _ldAggregate ──
    const agg = win._ldAggregate(rooms);
    t.eq(agg.total, 6, 'total departures counted, including the scheduled-late Due Out rooms');
    t.eq(agg.after11, 4, 'the two 12:01 AND the two 16:00 scheduled checkouts all count as at/after 11 AM');
    t.eq(agg.before11, 2, 'the two 07:04 checkouts count as before 11 AM');
    t.eq(agg.byAttendant['Gabriela'].total, 3, 'per-attendant breakdown splits by page (1501/1502/1504)');
    t.eq(agg.byAttendant['Gabriela'].after11, 2, 'per-attendant late count includes the scheduled Due Out');

    // ── _ldGroupByAttendant — Carlos's ask: group the day's detail by
    // attendant (worst-affected first), not a flat chronological list ──
    const grouped = win._ldGroupByAttendant({ rooms: rooms });
    t.eq(grouped.length, 2, 'both attendants who worked the day appear');
    t.eq(grouped[0].after11, 2, "every attendant here is tied at 2 late rooms, so order falls back to name");
    t.eq(grouped[0].attendant, 'Evangelina', 'alphabetical tie-break when after11/total are equal');
    t.eq(grouped[0].rooms.length, 3, "each attendant's own room list stays intact, sorted by time");
    t.eq(grouped[0].rooms[0].depTime, '07:04', "an attendant's rooms are sorted earliest-first within her own group");
    t.eq(grouped[0].rooms[2].depTime, '16:00', "the scheduled-late Due Out room sorts in with everything else by time");
    const lopsided = win._ldGroupByAttendant({ rooms: [
      { room: '1', depTime: '07:00', attendant: 'Ana' },
      { room: '2', depTime: '12:00', attendant: 'Bea' },
      { room: '3', depTime: '13:00', attendant: 'Bea' },
    ] });
    t.eq(lopsided[0].attendant, 'Bea', 'the attendant with more late rooms sorts first, worst-affected-first as Carlos asked');
    t.eq(lopsided[0].after11, 2, "Bea's late count");
    t.eq(lopsided[1].attendant, 'Ana', 'Ana (zero late) still appears — every attendant who worked the day, not just the ones with late rooms');
    t.eq(lopsided[1].after11, 0, "Ana had zero late rooms but is not omitted");

    // assigned attaches per attendant, including one who worked (Cleo,
    // all Stayover) but has zero rooms in the late-departure detail at all.
    const withAssigned = win._ldGroupByAttendant({
      rooms: [{ room: '1', depTime: '12:00', attendant: 'Bea' }],
      assigned: { Bea: { total: 5, suites: 1, floors: 2 }, Cleo: { total: 4, suites: 0, floors: 1 } }
    });
    const bea = withAssigned.find((a) => a.attendant === 'Bea');
    const cleo = withAssigned.find((a) => a.attendant === 'Cleo');
    t.eq(bea.assigned.total, 5, "an attendant's assigned summary attaches alongside her late-departure detail");
    t.assert(!!cleo, 'an attendant present ONLY in assigned (e.g. all-Stayover day) still appears in the grouped list');
    t.eq(cleo.total, 0, 'Cleo has zero rooms in the late-departure detail (all Stayover, excluded from that math)');
    t.eq(cleo.assigned.total, 4, 'but her real assigned-room count for the day still shows');
    t.eq(cleo.assigned.floors, 1, 'and her floors/suites summary too');

    // ── save/get round trip ──
    const assignedForSunday = {};
    Object.keys(result.roomsByAttendant).forEach((name) => {
      assignedForSunday[name] = win._ldSummarizeAssigned(result.roomsByAttendant[name]);
    });
    win.saveLateDepForDate('2026-08-23', Object.assign(agg, { assigned: assignedForSunday })); // a Sunday
    win.saveLateDepForDate('2026-08-24', { total: 10, after11: 1, before11: 9, byAttendant: {}, rooms: [] }); // Monday, light
    win.saveLateDepForDate('2026-08-30', { total: 4, after11: 4, before11: 0, byAttendant: {}, rooms: [] }); // another Sunday, all late
    // A day with zero late checkouts but a real assigned-rooms count (e.g.
    // every reservation that day was a Stayover) must not be dropped.
    win.saveLateDepForDate('2026-08-25', { total: 0, after11: 0, before11: 0, byAttendant: {}, rooms: [], assigned: { Cleo: { total: 6, suites: 2, floors: 3 } } });

    const stored = win.getLateDepForDay('2026-08-23');
    t.eq(stored.total, 6, 'getLateDepForDay reads back exactly what was saved');
    t.eq(stored.assigned['Gabriela'].suites, 2, "the assigned summary's suites count survives the save round trip too");

    const all = win.getAllLateDepDays();
    t.eq(all.length, 4, 'all four logged days are found across the month(s), including the zero-late/assigned-only day');
    const zeroLateDay = all.find((d) => d.ds === '2026-08-25');
    t.assert(!!zeroLateDay, 'a day with zero late checkouts is not silently dropped when it has a real assigned count');
    t.eq(zeroLateDay.assigned.Cleo.total, 6, 'its assigned data survives the round trip');
    t.eq(zeroLateDay.assigned.Cleo.suites, 2, 'including the suites/floors breakdown');

    const byDow = win.getLateDepByWeekday(all);
    const sunday = byDow[0]; // Date.getDay() === 0
    t.eq(sunday.n, 2, 'two Sunday reports were logged');
    t.eq(sunday.totalRooms, 10, 'Sunday totals combine both logged Sundays (6 + 4)');
    t.eq(sunday.totalLate, 8, 'Sunday late count combines both (4 + 4)');
    t.eq(Math.round(sunday.avgPct), 80, 'Sunday late share is 8/10 = 80%, materially worse than Monday');
    const monday = byDow[1];
    t.eq(Math.round(monday.avgPct), 10, 'Monday late share is 1/10 = 10%, the contrast Carlos was looking for');

    // ── Carlos's ask: "Total Departures" (and every % built from it) should
    // measure against the REAL day total already uploaded in Labor (R106/
    // OCC), not our own count of rows off the Housekeeping Task Sheet —
    // worked through his own example: 41 late out of a real 99 departures
    // is 41%, not whatever the PDF-only count would have shown. ──
    win.saveDeparturesForDate('2026-08-23', 99);
    const allWithLabor = win.getAllLateDepDays();
    const sundayWithLabor = allWithLabor.find((d) => d.ds === '2026-08-23');
    t.eq(sundayWithLabor.total, 99, "Total Departures now reads Labor's real day total (99), not our own PDF row count (6)");
    t.eq(sundayWithLabor.parsedTotal, 6, "the raw PDF-parsed count is preserved separately as parsedTotal, not lost");
    t.eq(Math.round(sundayWithLabor.pct * 10) / 10, Math.round((4 / 99) * 1000) / 10, '% at/after 11 AM is now late-count over the REAL Labor total, not our own PDF count');
    // A day with no Labor departures figure uploaded at all still falls
    // back to our own PDF count, so the tile is never blank.
    const mondayNoLabor = allWithLabor.find((d) => d.ds === '2026-08-24');
    t.eq(mondayNoLabor.total, 10, 'a day with nothing uploaded in Labor falls back to the PDF-parsed total');

    // ── Daily Stand Up + wait-after-standup — Carlos's own shift hours:
    // 9:00 AM Sat/Sun, 8:15 AM Mon-Fri, plus a fixed 20-min stand-up ──
    t.eq(win._ldShiftStartMin(0), 9 * 60, 'Sunday shift starts 9:00 AM');
    t.eq(win._ldShiftStartMin(6), 9 * 60, 'Saturday shift starts 9:00 AM');
    t.eq(win._ldShiftStartMin(1), 8 * 60 + 15, 'Monday shift starts 8:15 AM');
    t.eq(win._ldShiftStartMin(5), 8 * 60 + 15, 'Friday shift starts 8:15 AM');
    t.eq(win._ldTimeToMin('09:33'), 9 * 60 + 33, 'HH:MM converts to minutes-since-midnight');
    // Sunday: stand-up runs 9:00-9:20. Gabriela's earliest room (1501,
    // sorted first) is 07:04 — before stand-up even starts, so no wait.
    const standupEndSun = win._ldShiftStartMin(0) + win.LATEDEP_STANDUP_MIN;
    t.eq(standupEndSun, 9 * 60 + 20, "Sunday's stand-up ends at 9:20 AM");
    const firstRoomMin = win._ldTimeToMin(grouped.find((a) => a.attendant === 'Gabriela').rooms[0].depTime);
    t.eq(firstRoomMin, 7 * 60 + 4, "Gabriela's earliest checked-out room is 07:04, well before stand-up ends");
    t.assert(firstRoomMin < standupEndSun, 'confirms this case has zero real wait — her first room was ready before stand-up even ended');

    // ── Shift Timeline: shift end/length + finish-time math — Carlos's
    // ask: start, stand-up, wait, scheduled shift, workload, and finally
    // whether all of that gets her out on time ──
    t.eq(win._ldShiftEndMin(0), 17 * 60 + 30, 'Sunday shift ends 5:30 PM');
    t.eq(win._ldShiftEndMin(1), 16 * 60 + 45, 'Monday shift ends 4:45 PM');
    t.eq(win._ldShiftEndMin(0) - win._ldShiftStartMin(0), 510, 'Sunday shift is 8h30m, same length as a weekday');
    t.eq(win._ldShiftEndMin(1) - win._ldShiftStartMin(1), 510, 'Monday shift is also 8h30m, just shifted earlier');
    t.eq(win._ldFmtClock(9 * 60), '9:00 AM', 'minutes-since-midnight formats to a 12h clock string');
    t.eq(win._ldFmtClock(17 * 60 + 30), '5:30 PM', 'PM formatting crosses noon correctly');
    t.eq(win._ldFmtClock(0), '12:00 AM', 'midnight formats as 12:00 AM, not 0:00 AM');
    t.eq(win._ldFmtDur(510), '8h 30m', 'duration formats as Xh Ym');
    t.eq(win._ldFmtDur(480), '8h', 'a whole-hour duration omits the minutes');
    // A light Sunday: standup ends 9:20, first vacant at 07:04 (no wait),
    // Gabriela's workload is 195 min (3h15m) — she finishes well inside
    // her 8h30m shift, even counting the 30-min break as elapsed time.
    const gabFinish = win._ldShiftStartMin(0) + win.LATEDEP_STANDUP_MIN + 0 + summary.totalMinutes + win.LATEDEP_BREAK_MIN;
    t.assert(gabFinish < win._ldShiftEndMin(0), "Gabriela's light day finishes on time, well before shift end, break included");

    // ── Carlos's correction: "Scheduled shift" is working time only —
    // the 30-min break is elapsed clock time, not cleaning time ──
    t.eq(win.LATEDEP_BREAK_MIN, 30, '30-minute break, every shift');
    t.eq(win._ldShiftEndMin(0) - win._ldShiftStartMin(0) - win.LATEDEP_BREAK_MIN, 480, 'Scheduled (working) shift is 8h once the break is subtracted from the 8h30m clock span');
  }
};
