/* Bug report from Carlos: an active employee (Gady Gonzalez) stopped
   appearing in the "New Call-Off" employee dropdown. Root cause:
   showNewCallOffModal() sourced its list from getKnownEmployees(), which
   only includes people with a paid>0 entry in the CURRENTLY VIEWED month's
   uploaded report — not the full active roster. An employee with no hours
   reported yet this month (new month, report not uploaded yet, borrowed
   staff, etc.) silently couldn't be picked for a call-off, even though
   they're a normal active employee everywhere else in the app. Fixed by
   switching to getProjectEmployeeOptions(), the same full-roster-based
   list Training Hours/Log Hours already use for the identical reason. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "New Call-Off employee list includes active roster employees with no hours logged this month",
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });
    // Pin the viewed month to match the fixture's data, regardless of the
    // real calendar date the test happens to run on.
    win.viewMonth = new Date(2026, 6, 1);

    // Sanity check the root cause itself: N1 ("Nuevo Uno") is a roster
    // override with no paid>0 entry in the July fixture, so the old,
    // narrower source really did exclude her.
    t.assert(!win.getKnownEmployees().some((e) => e.id === 'N1'), 'getKnownEmployees() excludes a roster employee with no hours logged this month (confirms the root cause)');
    t.assert(win.getProjectEmployeeOptions().some((e) => e.id === 'N1'), 'getProjectEmployeeOptions() includes her via the active roster');

    win.showNewCallOffModal();
    const options = win.document.getElementById('coEmp').innerHTML;
    t.assert(/Nuevo Uno/.test(options), 'an active employee with no hours logged this month still appears in the New Call-Off dropdown');
    t.assert(/Ana Lopez/.test(options), 'an employee who did work this month still appears too');
  }
};
