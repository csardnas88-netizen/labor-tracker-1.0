/* Real bug found in Carlos's live data (2026-08-04): a manually-typed
   partial-task hour allocation (e.g. 2h logged against an 8h shift for a
   specific project task) got silently overwritten back to that day's full
   paid total the next time the Projects page rendered (which runs
   autofillAllPendingProjectEntries() as a catch-up pass). Root cause: the
   function's only protection for a non-pending entry was "hours already
   equal the day's paid total" — a deliberate partial allocation never
   satisfies that, so it always looked eligible for re-fill. Confirmed via
   direct Supabase query against the real projects_data row: 10 entries
   across two projects, going back to July, all landed on a suspicious
   full-shift-looking number (7.98h-8.37h) after originally being edited to
   something else. Fixed by tracking entry.autoFilled explicitly:
   saveEditEntry() now clears it on any manual save, and the autofill pass
   only ever touches entries that are pending OR still flagged autoFilled
   (i.e. never touched by a human since the last fill).

   Also covers a follow-up Carlos asked for after fixing the bug itself:
   "make sure nothing gets lost in the future" — the original 10 clobbered
   values were unrecoverable because nothing preserved what they'd been
   before being overwritten. entry.history now records the value being
   replaced (see _recordEntryHistory) on every path that changes
   entry.hours — manual edit or either autofill function — so even an
   unanticipated future bug would leave a recoverable trail instead of
   silent, permanent loss. Shown to the user directly in the Edit Entry
   modal (_entryHistoryHtml) rather than requiring a Supabase query. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "A manually-edited project hours entry is never overwritten by a later Labor Distribution Report, even when it doesn't match that day's paid total",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-08': {
        days: {
          '2026-08-04': {
            totalPaid: 8.18,
            emps: [{ id: '26100111', name: 'Maria Rosalma Noriega', pos: 'Room Attendant', paid: 8.18, ot1: 0 }]
          }
        },
        rooms: {}
      },
      projects_data: [{
        id: 1, name: 'Go back rooms', startDate: '2026-08-01', endDate: '2026-08-31', notes: '', created: 'x',
        log: [{ date: '2026-08-04', empId: '26100111', empName: 'Maria Rosalma Noriega', pos: 'Room Attendant', hours: null, pending: true, added: 'x' }]
      }]
    });
    const { win } = await loadApp({ seed });

    // First, the report auto-fills the pending entry to the day's full
    // total (8.18h) — same as any freshly-created pending entry today.
    win.autofillAllPendingProjectEntries();
    let entry = win.loadProjects()[0].log[0];
    t.eq(entry.hours, 8.18, 'starts auto-filled to the full paid total, like any new pending entry');
    t.assert(entry.autoFilled === true, 'flagged as auto-filled');

    // Carlos corrects it by hand to the actual task-specific allocation —
    // 2h of cleaning 7 rooms back into service, not her whole 8.18h shift.
    // Drive the real edit-modal flow (open it, set the hours field, save)
    // rather than poking at the object directly, so this test exercises
    // the exact same code path a real edit does.
    win.showEditEntryModal(0, 0);
    win.document.getElementById('editEntryHours').value = '2';
    win.saveEditEntry(0, 0);

    entry = win.loadProjects()[0].log[0];
    t.eq(entry.hours, 2, 'manual edit takes effect');
    t.eq(entry.pending, false, 'no longer pending');
    t.assert(entry.autoFilled === false, 'saveEditEntry clears autoFilled — this is what protects it going forward');

    // The bug: re-running the catch-up pass (which fires every time the
    // Projects page renders) must NOT revert this back to 8.18, even
    // though 2 !== that day's paid total and the day/employee data is
    // still right there to "fill" from.
    const changed = win.autofillAllPendingProjectEntries();
    entry = win.loadProjects()[0].log[0];
    t.eq(entry.hours, 2, 'the manual 2h survives the catch-up autofill pass — this is the exact bug that clobbered 10 real entries');
    t.assert(changed === false, 'a protected manual entry contributes no change at all, not just an unchanged value');

    // Running it several more times (mirrors visiting the Projects page
    // repeatedly) must never wear the protection down.
    win.autofillAllPendingProjectEntries();
    win.autofillAllPendingProjectEntries();
    entry = win.loadProjects()[0].log[0];
    t.eq(entry.hours, 2, 'still 2h after multiple catch-up passes');

    // A genuinely pending entry for the same employee/day (never manually
    // touched) must still auto-fill normally — the fix protects manual
    // edits specifically, it doesn't disable autofill altogether.
    const projectsForPush = win.loadProjects();
    projectsForPush[0].log.push({ date: '2026-08-04', empId: '26100111', empName: 'Maria Rosalma Noriega', pos: 'Room Attendant', hours: null, pending: true, added: 'x' });
    win.saveProjects(projectsForPush);
    win.autofillAllPendingProjectEntries();
    const secondEntry = win.loadProjects()[0].log[1];
    t.eq(secondEntry.hours, 8.18, 'a still-pending entry for the same person/day fills normally — the fix is scoped to manual edits, not a blanket freeze');

    // ── History: the value replaced at each step is preserved, not lost. ──
    entry = win.loadProjects()[0].log[0];
    t.assert(Array.isArray(entry.history), 'entry.history exists after being changed at least once');
    t.eq(entry.history.length, 1, 'one history row so far: the 8.18h auto-fill that was replaced by the manual 2h edit');
    t.eq(entry.history[0].hours, 8.18, 'the history row holds the value that was overwritten (8.18h), not the current one');
    t.eq(entry.history[0].source, 'manual', 'source records what REPLACED it (a manual edit), matching _recordEntryHistory\'s call site in saveEditEntry');

    // A pending entry's first-ever fill has nothing to preserve yet.
    t.assert(!secondEntry.history, "a fresh pending entry's first autofill records no history — there was no prior real value to lose");

    // The Edit Entry modal surfaces this directly, so Carlos never has to
    // ask for a Supabase query to see what a value used to be.
    win.showEditEntryModal(0, 0);
    const modalHtml = win.document.getElementById('editEntryModal').innerHTML;
    t.assert(/Previous values/.test(modalHtml), 'the edit modal shows a "Previous values" section once history exists');
    t.assert(/8\.18h/.test(modalHtml), 'the replaced 8.18h value is visible in the modal');
    win.closeEditEntryModal();
  }
};
