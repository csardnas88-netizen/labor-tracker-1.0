/* Carlos's ask, 2026-09-28: while doing his weekly labor analysis he
   wants to SEE a day's logged call-offs right on Weekly Labor Pace's own
   day-card, in the matching position — a low Actual number should read
   as "right, she called off" instead of an unexplained gap. This is the
   REVERSE of what he first described (a shortcut to ADD a call-off FROM
   Weekly Pace) — he corrected that mid-conversation: existing Call-Offs
   records should be reflected here, read-only, nothing new to log from
   this page. callOffsForDayPosition reads the exact same calloffs_data
   store the Call-Offs page itself writes (New Call-Off's employee picker
   is what attaches a roster-canonical position to each record), so this
   can never show something the Call-Offs page itself wouldn't agree with.

   Same week/seed shape as unifocus-weekly-pace.js, for the same reason:
   renderDashDayAnalysis's getDashWeek() is clock-derived, so a fixture
   pinned to a fixed calendar week has to call buildWeeklyPaceHTML()
   directly with an explicit wk, or the card renders empty outside "this
   week" (see [[labor-tracker-v6-64-name-parsing]]). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace shows a day's logged Call-Offs on that day+position's own card, read-only",
  async run(t) {
    // Week of Sat 2026-07-18 .. Fri 2026-07-24. Two reported days:
    // Sun 07-19 (Room Attendant) and Wed 07-22 (Public Area).
    const seed = Object.assign(fakeSession(), {
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-19': { totalPaid: 30, byPosition: { 'Room Attendant': { paid: 30 } } },
          '2026-07-22': { totalPaid: 36, byPosition: { 'Public Area Attendant': { paid: 36 } } }
        },
        rooms: { '2026-07-18': 120, '2026-07-19': 120, '2026-07-21': 120, '2026-07-22': 120 }
      },
      'hk_r106_2026-07': {
        '2026-07-19': { occ: 120, comp: 0, net: 120, dep: 80 },
        '2026-07-22': { occ: 120, comp: 0, net: 120, dep: 80 }
      },
      'calloffs_data': [
        // Matches: Sunday, Room Attendant — should appear on that card.
        { id: 1, date: '2026-07-19', empId: 'e1', empName: 'Sindi Ocheita', pos: 'Room Attendant', reason: 'Sick', created: '2026-07-19T08:00:00.000Z' },
        // Same day, DIFFERENT position — must not leak onto Room Attendant's card.
        { id: 2, date: '2026-07-19', empId: 'e2', empName: 'Someone Else', pos: 'Public Area Attendant', reason: 'Family emergency', created: '2026-07-19T08:00:00.000Z' },
        // Same position, DIFFERENT day with no report at all — must not leak into the week's rendered cards.
        { id: 3, date: '2026-07-20', empId: 'e3', empName: 'Nobody Reported This Day', pos: 'Room Attendant', reason: '', created: '2026-07-20T08:00:00.000Z' }
      ]
    });
    const { win } = await loadApp({ seed });

    const month = JSON.parse(win.localStorage.getItem('hk_month_2026-07'));
    const week = { start: new Date(2026, 6, 18), end: new Date(2026, 6, 24) };

    // callOffsForDayPosition itself: exact day+position match only.
    t.eq(win.callOffsForDayPosition('2026-07-19', 'Room Attendant').length, 1, 'finds exactly the one matching record');
    t.eq(win.callOffsForDayPosition('2026-07-19', 'Room Attendant')[0].empName, 'Sindi Ocheita');
    t.eq(win.callOffsForDayPosition('2026-07-19', 'Public Area Attendant').length, 1, 'a different position on the same day is its own separate match');
    t.eq(win.callOffsForDayPosition('2026-07-22', 'Room Attendant').length, 0, 'a different day with no record for this position finds nothing');

    const pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(pace.length > 0, 'the weekly pace card renders for a week that has reported days');

    const raBlock = pace.slice(pace.indexOf('>Room Attendant<'), pace.indexOf('>Public Area<') !== -1 ? pace.indexOf('>Public Area<') : undefined);
    t.assert(/Called off/.test(raBlock), "Room Attendant's card shows the Called off section for Sunday");
    t.assert(/Sindi Ocheita/.test(raBlock), 'naming who called off');
    t.assert(/Sick/.test(raBlock), 'and the reason logged with it');
    t.assert(!/Someone Else/.test(raBlock), "the Public Area call-off on the SAME day does not leak onto Room Attendant's card");
    t.assert(!/Nobody Reported This Day/.test(raBlock), 'a call-off on a day with no report for this position is never rendered at all — there is no card for it to appear on');

    // Public Area's own card DOES render a Sunday sub-card too (the day
    // level snapshot exists, even though Public Area itself had no hours
    // that day) — so its own real call-off (id 2, same Sunday) correctly
    // shows up there, scoped to the right position this time.
    const paBlock = pace.slice(pace.indexOf('>Public Area<'));
    t.assert(/Called off/.test(paBlock), "Public Area's Sunday sub-card shows its own Called off section");
    t.assert(/Someone Else/.test(paBlock), 'naming who called off Public Area that day');
    t.assert(/Family emergency/.test(paBlock), 'and the reason');
    t.assert(!/Sindi Ocheita/.test(paBlock), "Room Attendant's call-off does not leak onto Public Area's card");
  }
};
