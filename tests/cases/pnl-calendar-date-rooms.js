/* P&L's "Rooms sold" must use each day's OWN calendar-date occupancy, to
   agree with how accounting books room revenue — NOT the previous-night shift
   Labor uses for staffing. This guards against the two ever being conflated
   again: Labor still needs the shift (today's cleaning crew is sized by who
   stayed last night), P&L must not have it (accounting reconciles by date). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "P&L rooms total uses calendar dates, Labor keeps the previous-night shift",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // Skip the one-time legacy rooms-key migration (migrateRoomsData in
      // index.html) — it assumes a room count sharing its date with a days[]
      // snapshot is pre-migration data and shifts it back a day, which would
      // corrupt this fixture. Every real device migrated long ago.
      hk_rooms_migrated_v2: '1',
      'hk_month_2026-06': {
        days: {},
        rooms: { '2026-06-30': 200 },
        roomsSource: { '2026-06-30': 'manual' },
      },
      'hk_month_2026-07': {
        days: {
          '2026-07-01': { totalPaid: 10, totalOT: 0, byPosition: {} },
          '2026-07-02': { totalPaid: 10, totalOT: 0, byPosition: {} },
        },
        rooms: { '2026-07-01': 50, '2026-07-02': 70 },
        roomsSource: { '2026-07-01': 'manual', '2026-07-02': 'manual' },
      },
    });
    const { win } = await loadApp({ seed });

    // Labor's own lookup must still shift to the previous night, unchanged.
    t.eq(win.getRoomsForDay('2026-07-01'), 200, 'Labor: Jul 1 budget still driven by Jun 30 (prev night)');
    t.eq(win.getRoomsForDay('2026-07-02'), 50, 'Labor: Jul 2 budget still driven by Jul 1 (prev night)');

    // P&L must sum each day's OWN date — 50 (Jul 1) + 70 (Jul 2) = 120 — and
    // must NOT pull in Jun 30's 200 the way getRoomsForDay would.
    win.showPage('pnl');
    win.renderPnl();
    const roomsBarHtml = win.document.getElementById('pnlRoomsBar').innerHTML;
    t.assert(roomsBarHtml.indexOf('120') > -1, 'P&L Rooms sold should show 120 (calendar-date 50+70), got: ' + roomsBarHtml);
    t.assert(roomsBarHtml.indexOf('320') === -1, 'P&L must NOT include Jun 30 via the previous-night shift (120+200=320)');
  }
};
