/* Carlos's real report, 2026-10-10: he tried to log a Tardiness and "it
   wouldn't let him" — no visible reason why. Root cause: the employee
   combobox's hidden value (the actual selection New Call-Off/New
   Tardiness read on Save) only ever gets set by clicking a suggestion
   from the dropdown. Typing the exact name and going straight to Save
   left every field LOOKING filled in while the hidden value stayed
   blank, so Save silently failed with the generic "Please fill in all
   fields" — nothing told him the employee field was the actual problem.

   Fixed with _resolveEmpPickerValue: if the hidden value is blank but
   the typed text matches exactly one roster employee, that's used
   instead of requiring the click. A typed name that doesn't resolve
   (blank or ambiguous) now gets a specific message pointing at the
   dropdown, instead of the generic one. Shared by both New Call-Off
   and New Tardiness, since both use the identical combobox pattern. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: 'New Call-Off / New Tardiness: typing an exact employee name and saving without clicking the dropdown suggestion still works',
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });
    win.viewMonth = new Date(2026, 6, 1); // matches the July fixture month

    // ── New Call-Off: type the name, never click a suggestion ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-07-20';
    win.document.getElementById('coEmpSearch').value = 'Ana Lopez';
    // #coEmp (hidden) intentionally left blank — simulates never clicking the dropdown.
    win.document.getElementById('coReason').value = 'Sick';
    win.saveNewCallOff();
    let list = win.loadCallOffs();
    t.assert(list.some((c) => c.date === '2026-07-20' && c.empName === 'Ana Lopez'), 'the call-off saved even though the hidden field was never set by a click');
    t.eq(win.document.getElementById('callOffModal'), null, 'the modal closed — the save actually went through');

    // ── An unresolved typed name gets a specific, actionable message instead of silent/generic failure ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-07-21';
    win.document.getElementById('coEmpSearch').value = 'Totally Unknown Person';
    win.document.getElementById('coReason').value = 'Sick';
    win.saveNewCallOff();
    t.assert(win.document.getElementById('callOffModal'), 'the modal stays open — nothing saved for a name that matches nobody');
    t.assert(/Select the employee from the list/.test(win.document.getElementById('toastMsg').textContent), 'the toast now specifically points at the dropdown, not the generic "fill in all fields"');
    win.document.getElementById('callOffModal').remove();

    // ── New Tardiness: identical fallback ──
    win.showNewLateArrivalModal();
    win.document.getElementById('laDate').value = '2026-07-20';
    win.document.getElementById('laEmpSearch').value = 'Ana Lopez';
    win.document.getElementById('laArrival').value = '08:15';
    win.saveNewLateArrival();
    list = win.loadLateArrivals();
    t.assert(list.some((c) => c.date === '2026-07-20' && c.empName === 'Ana Lopez'), 'the tardiness entry saved too, via the same fallback');
    t.eq(win.document.getElementById('lateArrivalModal'), null, 'its modal closed as well');
  },
};
