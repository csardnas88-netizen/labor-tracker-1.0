/* Project Hours This Week groups by position, but a single position can
   have hours logged against MORE THAN ONE project in the same week (e.g. a
   Room Attendant worked both "812 Building Prep" and "Go Back Rooms" that
   week). Dropping the old per-project header (see labor-pace-projects.js)
   means that context would be lost unless each person's row says which
   project their hours belong to — so when getProjectHoursForWeek() returns
   more than one project, _pacePosGroupHtml folds the project name into the
   note line. This was the one code path the initial redesign shipped
   without a regression test for (only hand-verified once); this locks it
   in. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Project Hours position group tags each person's row with their project when a position spans more than one project that week",
  async run(t) {
    const seed = fixture.build();
    // The fixture already logs Ana Lopez (Room Attendant, 9h, "812 Building
    // Prep") in the Jul 11–17 week. Add a second, different project with a
    // second Room Attendant entry in the same week.
    seed['projects_data'].push({
      id: 'p2', name: 'Go Back Rooms', kind: 'project', log: [
        { empId: '99', empName: 'Zed Extra', pos: 'Room Attendant', date: '2026-07-14', hours: 3, note: 'Rooms back in service' }
      ]
    });
    const { win } = await loadApp({ seed });
    win.showPage('labor');

    const pw = win.getProjectHoursForWeek('2026-07-11');
    t.eq(pw.projects.length, 2, 'expected two distinct projects logged this week');
    t.eq(pw.byPos['Room Attendant'], 12, "Room Attendant's weekly total sums across both projects (9 + 3 = 12)");

    win.togglePacePos('Room Attendant');
    const strip = win.buildWeeklyPaceHTML(
      win.loadMonthData('2026-07').days, 200,
      { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) }
    );

    // Search only from "Project Hours This Week" onward — "Room Attendant"
    // also appears earlier, as a row label in the main weekly pace table
    // above, which would otherwise give a false match.
    const sectionIdx = strip.indexOf('Project Hours This Week');
    t.assert(sectionIdx !== -1, 'Project Hours This Week section not found');
    const idx = strip.indexOf('>Room Attendant<', sectionIdx);
    t.assert(idx !== -1, 'Room Attendant position group not found');
    const group = strip.slice(idx, idx + 1500);
    t.assert(/12\.00h/.test(group), "the position header shows the combined 12h total, not either project's total alone");
    t.assert(/2 people/.test(group), 'headcount reflects both people across both projects');

    // Each person's row is tagged with THEIR OWN project — not a shared
    // label, and not the other person's project.
    const anaIdx = group.indexOf('Ana Lopez');
    const zedIdx = group.indexOf('Zed Extra');
    t.assert(anaIdx !== -1 && zedIdx !== -1, 'both employees should appear once the group is expanded');
    const anaLine = group.slice(anaIdx, anaIdx + 400);
    const zedLine = group.slice(zedIdx, zedIdx + 400);
    t.assert(/812 Building Prep/.test(anaLine) && !/Go Back Rooms/.test(anaLine), "Ana's row is tagged with her own project (812 Building Prep), not Zed's");
    t.assert(/Go Back Rooms/.test(zedLine) && !/812 Building Prep/.test(zedLine), "Zed's row is tagged with his own project (Go Back Rooms), not Ana's");
    t.assert(/Deep cleaned rooms/.test(anaLine), "Ana's original activity note still renders alongside the project tag");
  }
};
