/* Request Off notebook — Phase 1 of bringing Schedule Builder's shared
   notebook into labor-tracker: capture a request (employee + type +
   day(s)), see the list, and have R-OFF write straight through to the
   Schedule using its own real, currently-loaded roster. */
const { loadApp, fakeSession } = require('../_harness');

function buildWeek(win, weekStart, people) {
  const dates = [];
  const d = new Date(weekStart);
  for (let i = 0; i < 7; i++) { dates.push(win.dateStr(d)); d.setDate(d.getDate() + 1); }
  const SCH = win.dlLoadSchedule() || { days: {}, count: 0 };
  dates.forEach((ds) => {
    SCH.days[ds] = SCH.days[ds] || { sheet: 't', occ: '100', dep: '40', tdOcc: '' };
    Object.keys(people).forEach((bk) => {
      SCH.days[ds][bk] = people[bk].map((n) => [n, '1']);
    });
  });
  win.dlSaveSchedule(SCH);
  return dates;
}

module.exports = {
  name: "Request Off notebook: employees come from the Schedule's real roster, R-OFF writes through, other types don't, and deleting undoes only what it wrote",
  async run(t) {
    const { win } = await loadApp({ seed: Object.assign(fakeSession(), { hk_rooms_migrated_v2: '1' }) });
    await new Promise((r) => setTimeout(r, 60));

    // ── With no Schedule loaded at all, the notebook says so plainly ──
    t.eq(win.reqEmpOptions().length, 0, 'no employees to pick with nothing loaded');
    win.renderReqNotebook();
    const emptyHtml = win.document.getElementById('reqNotebookContent').innerHTML;
    t.assert(/No Schedule loaded yet/.test(emptyHtml), 'the page explains why, instead of showing a blank empty picker');

    // ── Build a real week so there is a roster to pick from ──
    const weekStart = new Date(2026, 8, 5); // Sat Sep 5 2026
    const dates = buildWeek(win, weekStart, { sup: ['Rolando', 'Jose B'], gra: ['Karla Varela'] });

    const opts = win.reqEmpOptions();
    t.assert(opts.some((e) => e.name === 'Rolando' && e.crewKey === 'sup'), 'Rolando is offered, tagged to his real crew (sup)');
    t.assert(opts.some((e) => e.name === 'Karla Varela' && e.crewKey === 'gra'), 'so is Karla, tagged to hers (gra)');

    // ── R-OFF writes straight to the Schedule cell for each picked day ──
    win.rnPickedDates = [dates[0], dates[2]];
    const doc = win.document;
    doc.getElementById('rnEmpSearch') || win.renderReqNotebook(); // ensure form markup exists
    win.renderReqNotebook();
    doc.getElementById('rnEmp').value = 'Rolando';
    doc.getElementById('rnEmpCrew').value = 'sup';
    doc.getElementById('rnEmpCrewLabel').value = 'Supervisors';
    win.rnAddRequest();

    const afterRoff = win.dlLoadSchedule();
    t.eq(afterRoff.days[dates[0]].sup.filter((p) => p[0] === 'Rolando')[0][1], 'R-OFF', "Saturday's cell is written");
    t.eq(afterRoff.days[dates[2]].sup.filter((p) => p[0] === 'Rolando')[0][1], 'R-OFF', "Monday's cell is written too");
    t.eq(afterRoff.days[dates[1]].sup.filter((p) => p[0] === 'Rolando')[0][1], '1', "Sunday wasn't picked — left alone");

    let list = win.loadReqNotebook();
    t.eq(list.length, 1, 'one entry saved');
    t.eq(list[0].name, 'Rolando');
    t.eq(list[0].writtenDates.length, 2, 'both picked days recorded as written');
    t.eq(list[0].missingDates.length, 0, 'nothing missing — both days are in the loaded week');

    // ── A day outside any loaded week is reported as missing, not silently dropped ──
    win.rnPickedDates = ['2099-01-01'];
    doc.getElementById('rnEmp').value = 'Karla Varela';
    doc.getElementById('rnEmpCrew').value = 'gra';
    doc.getElementById('rnEmpCrewLabel').value = 'AM Room Attendant';
    win.rnAddRequest();
    list = win.loadReqNotebook();
    const karlaEntry = list.find((r) => r.name === 'Karla Varela');
    t.eq(karlaEntry.writtenDates.length, 0, 'nothing written — that date is not in any built week');
    t.eq(karlaEntry.missingDates.length, 1, 'and it is flagged missing rather than silently ignored');

    // ── Flex/Vacation are logged but never touch the Schedule grid — there's no cell value for them ──
    win.rnPickedDates = [dates[3]];
    win.rnSelectedType = 'vac';
    doc.getElementById('rnEmp').value = 'Jose B';
    doc.getElementById('rnEmpCrew').value = 'sup';
    doc.getElementById('rnEmpCrewLabel').value = 'Supervisors';
    win.rnAddRequest();
    const afterVac = win.dlLoadSchedule();
    t.eq(afterVac.days[dates[3]].sup.filter((p) => p[0] === 'Jose B')[0][1], '1',
      "Vacation is logged in the notebook but does not overwrite Jose B's Schedule cell — SCHED_VALUES has no VAC marker yet");
    list = win.loadReqNotebook();
    t.assert(list.some((r) => r.name === 'Jose B' && r.type === 'vac'), 'the Vacation entry is still saved to the notebook itself');

    // ── Deleting an R-OFF entry clears only cells still saying R-OFF — a manual edit since is never overwritten back ──
    win.rnSelectedType = 'roff';
    const rolandoEntry = win.loadReqNotebook().find((r) => r.name === 'Rolando');
    const schBefore = win.dlLoadSchedule();
    schBefore.days[dates[2]].sup.filter((p) => p[0] === 'Rolando')[0][1] = 'PM'; // Carlos hand-edited this one after granting it
    win.dlSaveSchedule(schBefore);

    const confirmFn = win.confirm; win.confirm = () => true;
    win.rnDeleteRequest(rolandoEntry.id);
    win.confirm = confirmFn;

    const afterDelete = win.dlLoadSchedule();
    t.eq(afterDelete.days[dates[0]].sup.filter((p) => p[0] === 'Rolando')[0][1], '',
      'the day still marked R-OFF is cleared back to blank on delete');
    t.eq(afterDelete.days[dates[2]].sup.filter((p) => p[0] === 'Rolando')[0][1], 'PM',
      "the hand-edited day is left exactly as Carlos set it, not reverted");
    t.assert(!win.loadReqNotebook().some((r) => r.id === rolandoEntry.id), 'the entry itself is gone from the notebook');

    // ── Save request works straight off the date field, without a separate Add day/Add range tap first ──
    win.rnPickedDates = [];
    win.rnSelectedType = 'roff';
    win.renderReqNotebook();
    doc.getElementById('rnEmp').value = 'Karla Varela';
    doc.getElementById('rnEmpCrew').value = 'gra';
    doc.getElementById('rnEmpCrewLabel').value = 'AM Room Attendant';
    doc.getElementById('rnOneDay').value = dates[4];
    win.rnAddRequest();
    let list2 = win.loadReqNotebook();
    t.assert(list2.some((r) => r.name === 'Karla Varela' && r.dates.includes(dates[4])),
      'Save request alone picks up whatever is still sitting in the date field, same as clicking Add day first would have');

    win.rnPickedDates = [];
    win.rnSelectedType = 'vac';
    win.renderReqNotebook();
    doc.getElementById('rnEmp').value = 'Karla Varela';
    doc.getElementById('rnEmpCrew').value = 'gra';
    doc.getElementById('rnEmpCrewLabel').value = 'AM Room Attendant';
    doc.getElementById('rnRangeStart').value = dates[0];
    doc.getElementById('rnRangeEnd').value = dates[2];
    win.rnAddRequest();
    list2 = win.loadReqNotebook();
    const vacEntry = list2.find((r) => r.type === 'vac' && r.dates.length === 3);
    t.assert(!!vacEntry, 'the same shortcut expands an unconfirmed Start/End range for Vacation, not just a single day');
    t.eq(vacEntry.dates.join(','), [dates[0], dates[1], dates[2]].join(','), 'the whole range lands, day by day');

    // ── Realtime multi-device sync (Phase 4) — a remote reqnb_<id> row folds into the local list ──
    win.localStorage.removeItem('req_notebook');
    win.localStorage.removeItem('req_notebook_deleted_ids');
    win.saveReqNotebook([{ id: 1001, name: 'Local Only', type: 'roff', dates: [dates[0]], writtenDates: [], missingDates: [] }]);
    const remoteAll = {
      reqnb_1002: { id: 1002, name: 'From Other Device', type: 'roff', dates: [dates[1]], writtenDates: [], missingDates: [] },
    };
    const changed = win._mergeReqNotebookFromRemote(remoteAll);
    t.assert(changed, 'a genuinely new remote row reports a change');
    const merged = win.loadReqNotebook();
    t.assert(merged.some((r) => r.id === 1001), "the device's own entry survives the merge");
    t.assert(merged.some((r) => r.id === 1002), "the other device's entry is folded in");

    // A delete on another device (tombstone) removes it here too, even if
    // the stale reqnb_<id> row is still sitting in Supabase (deletes there
    // are eventually-consistent, same as Call-Offs).
    const remoteWithDelete = {
      reqnb_1002: remoteAll.reqnb_1002,
      req_notebook_deleted_ids: [1002],
    };
    win._mergeReqNotebookFromRemote(remoteWithDelete);
    const afterRemoteDelete = win.loadReqNotebook();
    t.assert(!afterRemoteDelete.some((r) => r.id === 1002), 'the remote tombstone wins — the row is gone locally too');
    t.assert(afterRemoteDelete.some((r) => r.id === 1001), "and it didn't touch anything else");

    // Deleting locally pushes its own tombstone, so it's the local side
    // of the same mechanism that just protected against resurrection above.
    const confirmFn2 = win.confirm; win.confirm = () => true;
    win.rnDeleteRequest(1001);
    win.confirm = confirmFn2;
    t.assert(win.getDeletedIds('req_notebook_deleted_ids').includes(1001), 'deleting locally records a tombstone for other devices to pick up');
  },
};
