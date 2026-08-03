/* Bug report from Carlos: an active employee (Gady Gonzalez) stopped
   appearing in the "New Call-Off" employee dropdown. Root cause:
   showNewCallOffModal() sourced its list from getKnownEmployees(), which
   only includes people with a paid>0 entry in the CURRENTLY VIEWED month's
   uploaded report — not the full active roster. An employee with no hours
   reported yet this month (new month, report not uploaded yet, borrowed
   staff, etc.) silently couldn't be picked for a call-off, even though
   they're a normal active employee everywhere else in the app. Fixed by
   switching to getProjectEmployeeOptions(), the same full-roster-based
   list Training Hours/Log Hours already use for the identical reason.

   Later request from Carlos: the roster grew long enough that scrolling a
   plain <select> to find one name got tedious, so the dropdown was replaced
   with a type-to-search combobox (#coEmpSearch + #coEmpList, backed by the
   cached _coEmpAll array, filtered via coEmpFilter()/coEmpOpenList()). This
   also re-covers that same combobox with the original roster fixture. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "New Call-Off employee search includes active roster employees with no hours logged this month, and filters by typed name",
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
    t.assert(win._coEmpAll.some((e) => e.name === 'Nuevo Uno'), 'an active employee with no hours logged this month is in the cached search list');
    t.assert(win._coEmpAll.some((e) => e.name === 'Ana Lopez'), 'an employee who did work this month is in the cached search list too');

    // Focusing the search box with no text typed yet shows everyone.
    win.coEmpOpenList();
    let listHtml = win.document.getElementById('coEmpList').innerHTML;
    t.assert(/Nuevo Uno/.test(listHtml), 'opening the list with an empty search shows the roster-only employee');
    t.assert(/Ana Lopez/.test(listHtml), 'opening the list with an empty search shows the worked-this-month employee too');

    // Typing part of a name filters the list down (accent/case-insensitive).
    win.document.getElementById('coEmpSearch').value = 'nuevo';
    win.coEmpFilter();
    listHtml = win.document.getElementById('coEmpList').innerHTML;
    t.assert(/Nuevo Uno/.test(listHtml), 'typing a matching search term keeps the matching employee visible');
    t.assert(!/Ana Lopez/.test(listHtml), 'typing a matching search term filters out non-matching employees');

    // Clicking a filtered result selects it: hidden #coEmp gets id|name|pos,
    // and the visible search box reflects the pick.
    const opt = win.document.querySelector('#coEmpList [data-id="N1"]');
    t.assert(!!opt, 'the filtered match renders as a clickable option with the right data-id');
    win.selectCoEmpOption(opt);
    t.assert(win.document.getElementById('coEmp').value.indexOf('N1|Nuevo Uno') === 0, 'selecting the option sets the hidden coEmp value used by saveNewCallOff()');
    t.assert(win.document.getElementById('coEmpSearch').value.indexOf('Nuevo Uno') === 0, 'selecting the option fills the visible search box with the chosen name');
  }
};
