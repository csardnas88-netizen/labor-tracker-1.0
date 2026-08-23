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
// plus two data rows (one Departed before 11am, one Departed at/after
// 11am, one Due Out that must be excluded entirely).
function buildPageItems(attendantName, y0) {
  const items = [];
  // Header fragments, same on every page of the real report — used to read
  // the report's own date (drives totalAssigned, independent of any one
  // room's own reservation dates).
  items.push(fragItem(0, y0 + 200, 'Task Date From'));
  items.push(fragItem(120, y0 + 200, '08-23-26'));
  items.push(fragItem(160, y0 + 200, 'to'));
  items.push(fragItem(180, y0 + 200, '08-23-26'));
  // Instructions label + attendant name, same row (y = y0 + 40)
  items.push(fragItem(9.1, y0 + 40, 'Instructions'));
  items.push(fragItem(94.5, y0 + 40, attendantName));
  // Header/table rows below — three data rows
  const rows = [
    { room: '1501', resv: 'Departed', depdate: '08-23-26', deptime: '07:04' }, // before 11
    { room: '1502', resv: 'Departed', depdate: '08-23-26', deptime: '12:01' }, // at/after 11
    { room: '1503', resv: 'Due', resv2: 'Out', depdate: '', deptime: '' },      // excluded (not Departed)
  ];
  rows.forEach((r, i) => {
    const y = y0 - i * 20;
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
    t.eq(rooms.length, 4, 'Due Out rows are excluded from the LATE detail; only the two Departed rows per page (x2 pages) survive');
    const gabRoom = rooms.find((r) => r.attendant === 'Gabriela' && r.room === '1502');
    t.assert(!!gabRoom, 'attendant name is correctly attached to the room from the same page\'s Instructions row');
    t.eq(gabRoom.depTime, '12:01', 'actual departure time is read from the Dep. Time column, not the date column');

    // ── totalByAttendant — Carlos's ask: "el total de cuartos asignados a
    // limpiarse en ese día" counts EVERY room (Departed AND Due Out), unlike
    // the late-checkout detail above which is Departed-only ──
    t.eq(result.totalByAttendant['Gabriela'], 3, "Gabriela's total includes her Due Out room too, not just her 2 Departed ones");
    t.eq(result.totalByAttendant['Evangelina'], 3, 'same for Evangelina — 2 Departed + 1 Due Out');

    // ── _ldAggregate ──
    const agg = win._ldAggregate(rooms);
    t.eq(agg.total, 4, 'total departures counted');
    t.eq(agg.after11, 2, 'exactly the two 12:01 checkouts count as at/after 11 AM');
    t.eq(agg.before11, 2, 'the two 07:04 checkouts count as before 11 AM');
    t.eq(agg.byAttendant['Gabriela'].total, 2, 'per-attendant breakdown splits by page');
    t.eq(agg.byAttendant['Gabriela'].after11, 1, 'per-attendant late count is correct');

    // ── _ldGroupByAttendant — Carlos's ask: group the day's detail by
    // attendant (worst-affected first), not a flat chronological list ──
    const grouped = win._ldGroupByAttendant({ rooms: rooms });
    t.eq(grouped.length, 2, 'both attendants who worked the day appear');
    t.eq(grouped[0].after11, 1, "every attendant here is tied at 1 late room, so order falls back to name");
    t.eq(grouped[0].attendant, 'Evangelina', 'alphabetical tie-break when after11/total are equal');
    t.eq(grouped[0].rooms.length, 2, "each attendant's own room list stays intact, sorted by time");
    t.eq(grouped[0].rooms[0].depTime, '07:04', "an attendant's rooms are sorted earliest-first within her own group");
    const lopsided = win._ldGroupByAttendant({ rooms: [
      { room: '1', depTime: '07:00', attendant: 'Ana' },
      { room: '2', depTime: '12:00', attendant: 'Bea' },
      { room: '3', depTime: '13:00', attendant: 'Bea' },
    ] });
    t.eq(lopsided[0].attendant, 'Bea', 'the attendant with more late rooms sorts first, worst-affected-first as Carlos asked');
    t.eq(lopsided[0].after11, 2, "Bea's late count");
    t.eq(lopsided[1].attendant, 'Ana', 'Ana (zero late) still appears — every attendant who worked the day, not just the ones with late rooms');
    t.eq(lopsided[1].after11, 0, "Ana had zero late rooms but is not omitted");

    // totalAssigned attaches per attendant, including one who worked (Cleo,
    // all Stayover) but has zero rooms in the late-departure detail at all.
    const withAssigned = win._ldGroupByAttendant({
      rooms: [{ room: '1', depTime: '12:00', attendant: 'Bea' }],
      totalAssigned: { Bea: 5, Cleo: 4 }
    });
    const bea = withAssigned.find((a) => a.attendant === 'Bea');
    const cleo = withAssigned.find((a) => a.attendant === 'Cleo');
    t.eq(bea.totalAssigned, 5, "an attendant's totalAssigned count attaches alongside her late-departure detail");
    t.assert(!!cleo, 'an attendant present ONLY in totalAssigned (e.g. all-Stayover day) still appears in the grouped list');
    t.eq(cleo.total, 0, 'Cleo has zero rooms in the late-departure detail (all Stayover, excluded from that math)');
    t.eq(cleo.totalAssigned, 4, 'but her real assigned-room count for the day still shows');

    // ── save/get round trip ──
    win.saveLateDepForDate('2026-08-23', Object.assign(agg, { totalAssigned: result.totalByAttendant })); // a Sunday
    win.saveLateDepForDate('2026-08-24', { total: 10, after11: 1, before11: 9, byAttendant: {}, rooms: [] }); // Monday, light
    win.saveLateDepForDate('2026-08-30', { total: 4, after11: 4, before11: 0, byAttendant: {}, rooms: [] }); // another Sunday, all late
    // A day with zero late checkouts but a real assigned-rooms count (e.g.
    // every reservation that day was a Stayover) must not be dropped.
    win.saveLateDepForDate('2026-08-25', { total: 0, after11: 0, before11: 0, byAttendant: {}, rooms: [], totalAssigned: { Cleo: 6 } });

    const stored = win.getLateDepForDay('2026-08-23');
    t.eq(stored.total, 4, 'getLateDepForDay reads back exactly what was saved');

    const all = win.getAllLateDepDays();
    t.eq(all.length, 4, 'all four logged days are found across the month(s), including the zero-late/assigned-only day');
    const zeroLateDay = all.find((d) => d.ds === '2026-08-25');
    t.assert(!!zeroLateDay, 'a day with zero late checkouts is not silently dropped when it has a real totalAssigned count');
    t.eq(zeroLateDay.totalAssigned.Cleo, 6, 'its totalAssigned data survives the round trip');

    const byDow = win.getLateDepByWeekday(all);
    const sunday = byDow[0]; // Date.getDay() === 0
    t.eq(sunday.n, 2, 'two Sunday reports were logged');
    t.eq(sunday.totalRooms, 8, 'Sunday totals combine both logged Sundays (4 + 4)');
    t.eq(sunday.totalLate, 6, 'Sunday late count combines both (2 + 4)');
    t.eq(Math.round(sunday.avgPct), 75, 'Sunday late share is 6/8 = 75%, materially worse than Monday');
    const monday = byDow[1];
    t.eq(Math.round(monday.avgPct), 10, 'Monday late share is 1/10 = 10%, the contrast Carlos was looking for');
  }
};
