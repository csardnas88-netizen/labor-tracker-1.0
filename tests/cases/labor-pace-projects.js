/* Weekly Labor Pace — the "Project hours this week" strip must list each
   employee with their position, hours, AND the activity note, and the
   reconciliation line (Worked − Training − Projects = Operations) must add up.
   This is what the labor meeting reads, so it's guarded. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Weekly pace: project strip shows names + notes, and reconciliation adds up",
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });

    // The fixture logs two project entries in the Jul 11–17 hotel week.
    const wkKey = '2026-07-11';
    const pw = win.getProjectHoursForWeek(wkKey);
    t.eq(pw.total, 17, 'project total for the week should be 17h (8 + 9)');
    t.assert(pw.byPos['House Attendant'] === 8 && pw.byPos['Room Attendant'] === 9, 'project by-position wrong');
    t.eq(pw.projects.length, 1, 'expected one project (812 Building Prep)');

    const proj = pw.projects[0];
    t.eq(proj.name, '812 Building Prep', 'project name wrong');
    t.eq(proj.items.length, 2, 'expected two employee items');
    const ana = proj.items.find((i) => i.empName === 'Ana Lopez');
    t.assert(ana, 'Ana Lopez missing from project items');
    t.eq(ana.hours, 9, 'Ana hours wrong');
    t.assert(/Deep cleaned rooms/.test(ana.note), 'Ana activity note missing');

    // The rendered strip must contain the name, hours, and the note text.
    const strip = win.buildWeeklyPaceHTML(
      win.loadMonthData('2026-07').days, 200,
      { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) }
    );
    t.assert(/Project hours this week/.test(strip), 'project strip title missing');
    t.assert(/Ana Lopez/.test(strip) && /Beto Cruz/.test(strip), 'employee names missing from strip');
    t.assert(/Deep cleaned rooms 1401-1410/.test(strip), 'activity note missing from strip');

    // Reconciliation line: Worked − Training − Projects = Operations, and it
    // must appear (the fixture has both training and project hours that week).
    t.assert(/This week/.test(strip) && /Operations/.test(strip), 'reconciliation line missing');
  }
};
