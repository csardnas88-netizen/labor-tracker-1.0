/* Carlos's real report, 2026-10-20: Ingrid opened the app after ~20 days
   away and uploaded a Labor Distribution before the first cloud pull had
   finished merging the roster. Two associates who'd been in the cloud
   roster since early September (David Pérez, Isabel Cruz) read as brand-new
   and she was prompted to add them — risking duplicates of people who
   already exist. Guard: while no full pull has completed this session
   (_rosterSyncedThisSession === false), a report upload that finds
   "unknown" employees warns and offers to sync first, instead of going
   straight to the add-employee modal. After a successful pull, only the
   names STILL unknown are treated as genuinely new. */
const { loadApp, fakeSession } = require('../_harness');

const NEW_EMPS = [
  { id: '26100367', name: 'Diaz Cruz, Isabel', pos: 'Laundry Attendant', paid: 8 },
  { id: '26100372', name: 'Perez Ramon, David', pos: 'Laundry Attendant', paid: 8 },
];

module.exports = {
  name: 'A report upload warns to sync first (instead of offering to add) when an "unknown" employee is found before the roster has synced this session, and after a sync only the still-unknown names are treated as new',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));
    const doc = win.document;

    t.eq(win._rosterSyncedThisSession, false, 'the roster is not marked synced at startup');

    // ── Warning modal shows, lists both names, has both buttons, and the
    // real add-employee modal is NOT opened. ──
    win.showRosterStaleWarning(NEW_EMPS, '2026-10-20');
    let warn = doc.getElementById('rosterStaleModal');
    t.assert(warn, 'the stale-sync warning modal appears');
    t.assert(warn.textContent.indexOf('Isabel') !== -1 && warn.textContent.indexOf('David') !== -1,
      'it lists both unknown associates');
    t.assert(doc.getElementById('rosterStaleSyncBtn') && doc.getElementById('rosterStaleAddBtn'),
      'it offers both "sync now" and "add anyway"');
    t.assert(!doc.getElementById('newEmpModal'), 'the add-employee modal is NOT shown yet');

    // ── "Add them anyway" opens the real add-employee modal. ──
    doc.getElementById('rosterStaleAddBtn').click();
    t.assert(!doc.getElementById('rosterStaleModal'), 'the warning closes on "add anyway"');
    t.assert(doc.getElementById('newEmpModal'), 'the add-employee modal opens on "add anyway"');
    doc.getElementById('newEmpModal').remove();

    // ── Sync & re-check, both already in the synced roster → no add modal,
    // just a confirmation. (_rosterSyncedThisSession preset true simulates
    // the background pull having completed by the time she clicks.) ──
    win.ROSTER_BY_ID['26100367'] = { name: 'Diaz Cruz, Isabel', pos: 'Laundry Attendant' };
    win.ROSTER_BY_ID['26100372'] = { name: 'Perez Ramon, David', pos: 'Laundry Attendant' };
    win._rosterSyncedThisSession = true;
    win.showRosterStaleWarning(NEW_EMPS, '2026-10-20');
    doc.getElementById('rosterStaleSyncBtn').click();
    await new Promise((r) => setTimeout(r, 700));
    t.assert(!doc.getElementById('rosterStaleModal'), 'warning closes after the sync re-check');
    t.assert(!doc.getElementById('newEmpModal'),
      'no add modal — both were found in the now-synced roster');

    // ── Sync & re-check where one is STILL unknown → add modal for ONLY
    // that one (the genuinely-new hire), never the already-synced one. ──
    delete win.ROSTER_BY_ID['26100372'];
    win._rosterSyncedThisSession = true;
    win.showRosterStaleWarning(NEW_EMPS, '2026-10-20');
    doc.getElementById('rosterStaleSyncBtn').click();
    await new Promise((r) => setTimeout(r, 700));
    const addModal = doc.getElementById('newEmpModal');
    t.assert(addModal, 'the add modal shows for the still-unknown hire');
    t.assert(addModal.textContent.indexOf('David') !== -1 && addModal.textContent.indexOf('Isabel') === -1,
      'only the genuinely-new David is offered, not the already-synced Isabel');
    addModal.remove();
  },
};
