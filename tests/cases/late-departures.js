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
    const byDate = await win._ldParsePdf(pdf);
    t.assert(Object.keys(byDate).length === 1, 'both synthetic pages report the same departure date');
    const rooms = byDate['2026-08-23'];
    t.eq(rooms.length, 4, 'Due Out rows are excluded; only the two Departed rows per page (x2 pages) survive');
    const gabRoom = rooms.find((r) => r.attendant === 'Gabriela' && r.room === '1502');
    t.assert(!!gabRoom, 'attendant name is correctly attached to the room from the same page\'s Instructions row');
    t.eq(gabRoom.depTime, '12:01', 'actual departure time is read from the Dep. Time column, not the date column');

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

    // ── save/get round trip ──
    win.saveLateDepForDate('2026-08-23', agg); // a Sunday
    win.saveLateDepForDate('2026-08-24', { total: 10, after11: 1, before11: 9, byAttendant: {}, rooms: [] }); // Monday, light
    win.saveLateDepForDate('2026-08-30', { total: 4, after11: 4, before11: 0, byAttendant: {}, rooms: [] }); // another Sunday, all late

    const stored = win.getLateDepForDay('2026-08-23');
    t.eq(stored.total, 4, 'getLateDepForDay reads back exactly what was saved');

    const all = win.getAllLateDepDays();
    t.eq(all.length, 3, 'all three logged days are found across the month(s)');

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
