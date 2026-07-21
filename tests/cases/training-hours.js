/* Training Hours end-to-end: a trainee's days auto-fill from the report, days
   off don't count as pending, the week/position summary adds up, and the
   Labor-pace strips reflect it. Guards the feature the managers will lean on. */
const { loadApp, fakeSession } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Training Hours: auto-fill, days off, and weekly summary are correct",
  async run(t) {
    // Seed month reports so auto-fill has data to pull from.
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': fixture.month(2026, 7, 21),
      projects_data: []
    });
    const { win } = await loadApp({ seed });

    // Report shows the trainee worked Jul 13 (8h) and Jul 14 (7.5h).
    const md = win.loadMonthData('2026-07');
    md.days['2026-07-13'].emps.push({ id: 'TX', name: 'Test Trainee', pos: 'Room Attendant', paid: 8, ot1: 0 });
    md.days['2026-07-14'].emps.push({ id: 'TX', name: 'Test Trainee', pos: 'Room Attendant', paid: 7.5, ot1: 0 });
    win.saveMonthData(md, '2026-07');

    // Create trainee for Jul 13–17, then auto-fill from the report.
    win.createTrainee('TX', 'Test Trainee', 'Room Attendant', '2026-07-13', '2026-07-17', '');
    win.autofillAllPendingProjectEntries();

    let idx = win.loadProjects().findIndex((p) => p.kind === 'training' && p.empId === 'TX');
    t.assert(idx !== -1, 'trainee not created');
    let log = win.loadProjects()[idx].log;
    t.eq(log.length, 5, 'expected 5 days in the range');
    t.eq(log.find((e) => e.date === '2026-07-13').hours, 8, 'Jul 13 should auto-fill to 8h');
    t.eq(log.find((e) => e.date === '2026-07-14').hours, 7.5, 'Jul 14 should auto-fill to 7.5h');
    t.assert(log.find((e) => e.date === '2026-07-15').pending === true, 'Jul 15 (no report) should be Pending');

    // Mark Jul 15 as a day off — it must stop being Pending and not count.
    win.toggleTraineeDayOff(idx, '2026-07-15');
    log = win.loadProjects()[idx].log;
    const off = log.find((e) => e.date === '2026-07-15');
    t.assert(off.off === true && off.pending === false, 'Jul 15 should be Off, not Pending');

    // Weekly summary should total 15.5h for Room Attendant that hotel week.
    const sum = win.getTrainingSummary();
    const wk = sum.weeks.find((w) => (w.byPos['Room Attendant'] || 0) > 0);
    t.assert(wk, 'no week with Room Attendant training hours');
    t.eq(wk.byPos['Room Attendant'], 15.5, 'week Room Attendant training total wrong');
    t.assert(wk.emps.some((e) => e.name === 'Test Trainee' && e.hours === 15.5), 'trainee not listed with 15.5h');

    // The Labor pace strip for that week must include a training strip.
    const strip = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) });
    t.assert(/Training hours this week/.test(strip), 'Weekly pace should show the training strip');
  }
};
