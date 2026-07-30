/* Bug report from Carlos: uploaded the Labor Distribution Report, a
   trainee's day auto-filled to 3.75h. Uploaded a corrected report for that
   same day the next day (8.08h) — the training hours stayed at 3.75. Root
   cause: autofill only ever looked at entry.pending, and filling a day sets
   pending:false, so a second upload's autofill pass skipped it forever. Off
   days must still never be touched. */
const { loadApp, fakeSession } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Training hours refresh when a corrected report is re-uploaded for an already-filled day",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': fixture.month(2026, 7, 21),
      projects_data: []
    });
    const { win } = await loadApp({ seed });

    const md = win.loadMonthData('2026-07');
    md.days['2026-07-13'].emps.push({ id: 'MM', name: 'Mayra Martinez', pos: 'Room Attendant', paid: 3.75, ot1: 0 });
    win.saveMonthData(md, '2026-07');

    win.createTrainee('MM', 'Mayra Martinez', 'Room Attendant', '2026-07-13', '2026-07-13', '');
    win.autofillAllPendingProjectEntries();

    let idx = win.loadProjects().findIndex((p) => p.kind === 'training' && p.empId === 'MM');
    let entry = win.loadProjects()[idx].log.find((e) => e.date === '2026-07-13');
    t.eq(entry.hours, 3.75, 'first upload should fill 3.75h');
    t.eq(entry.pending, false, 'day is no longer pending once filled');

    // A corrected report re-upload replaces that day's row with new hours.
    const md2 = win.loadMonthData('2026-07');
    md2.days['2026-07-13'].emps = md2.days['2026-07-13'].emps.filter((e) => e.id !== 'MM');
    md2.days['2026-07-13'].emps.push({ id: 'MM', name: 'Mayra Martinez', pos: 'Room Attendant', paid: 8.08, ot1: 0 });
    win.saveMonthData(md2, '2026-07');

    const changed = win.autofillAllPendingProjectEntries();
    t.assert(changed === true, 'refreshing a stale auto-filled day should report a change');

    entry = win.loadProjects()[idx].log.find((e) => e.date === '2026-07-13');
    t.eq(entry.hours, 8.08, 'stale 3.75 should refresh to the corrected 8.08');
    t.assert(entry.autoFilled === true, 'still marked auto-filled');

    // Once in sync, a third run must be a no-op (mirrors the R106 refresh guard).
    t.assert(win.autofillAllPendingProjectEntries() === false, 'no-op once the stored value already matches the report');

    // An "Off" day must never be pulled back in by a later report upload.
    win.toggleTraineeDayOff(idx, '2026-07-13');
    const md3 = win.loadMonthData('2026-07');
    md3.days['2026-07-13'].emps = md3.days['2026-07-13'].emps.filter((e) => e.id !== 'MM');
    md3.days['2026-07-13'].emps.push({ id: 'MM', name: 'Mayra Martinez', pos: 'Room Attendant', paid: 5, ot1: 0 });
    win.saveMonthData(md3, '2026-07');
    win.autofillAllPendingProjectEntries();
    entry = win.loadProjects()[idx].log.find((e) => e.date === '2026-07-13');
    t.assert(entry.off === true && entry.hours === 0, 'a day marked Off must stay Off/0h even if the report later has hours for that date');
  }
};
