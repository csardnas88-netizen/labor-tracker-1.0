/* Carlos reported "+ Add Employee" did nothing when clicked. Root cause:
   showAddModal() and saveNewEmp() both referenced a #newEmpNote field that
   doesn't exist in the modal's HTML (no Notes input was ever added there) —
   a leftover reference from before that field was removed. Reading .value
   on the null result threw immediately, before the modal could even open. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Add Employee modal opens and saves without throwing (no orphaned #newEmpNote reference)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    win.showPage('roster');

    let threw = null;
    try { win.showAddModal(); } catch (e) { threw = e.message; }
    t.assert(!threw, 'showAddModal() must not throw: ' + threw);
    t.eq(win.document.getElementById('addEmpOverlay').style.display, 'flex', 'the modal actually opens');

    win.document.getElementById('newEmpName').value = 'Test QA, Employee';
    win.document.getElementById('newEmpPos').value = 'Room Attendant';

    let saveThrew = null;
    try { win.saveNewEmp(); } catch (e) { saveThrew = e.message; }
    t.assert(!saveThrew, 'saveNewEmp() must not throw: ' + saveThrew);
    t.assert(win.ROSTER['Room Attendant'].indexOf('Test QA, Employee') > -1, 'the new employee is actually added to the roster');
    t.eq(win.document.getElementById('addEmpOverlay').style.display, 'none', 'the modal closes after a successful save');
  }
};
