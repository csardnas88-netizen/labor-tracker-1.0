/* Request Off notebook — Phases 1, 3 and 4 of bringing Schedule
   Builder's shared notebook into labor-tracker: capture a request
   (employee + type + day(s)), see the list, have R-OFF write straight
   through to the Schedule using its own real, currently-loaded roster,
   get warned about cover-chain conflicts before saving, and sync
   across devices in realtime. */
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

// Selecting an employee is now JS state (rnSelName/rnSelCrewKey/
// rnSelCrewLabel), not hidden DOM inputs — a type toggle re-renders the
// whole form, which used to wipe a hidden input's value out from under it.
function selectRn(win, name, crewKey, crewLabel) {
  win.rnSelName = name;
  win.rnSelCrewKey = crewKey;
  win.rnSelCrewLabel = crewLabel;
}

module.exports = {
  name: "Request Off notebook: real roster, R-OFF write-through, capture-time cover-chain conflict alerts, and realtime multi-device sync",
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
    win.renderReqNotebook();
    selectRn(win, 'Rolando', 'sup', 'Supervisors');
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
    selectRn(win, 'Karla Varela', 'gra', 'AM Room Attendant');
    win.rnAddRequest();
    list = win.loadReqNotebook();
    const karlaEntry = list.find((r) => r.name === 'Karla Varela');
    t.eq(karlaEntry.writtenDates.length, 0, 'nothing written — that date is not in any built week');
    t.eq(karlaEntry.missingDates.length, 1, 'and it is flagged missing rather than silently ignored');

    // ── Flex/Vacation are logged but never touch the Schedule grid — there's no cell value for them ──
    win.rnPickedDates = [dates[3]];
    win.rnSelectedType = 'vac';
    selectRn(win, 'Jose B', 'sup', 'Supervisors');
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

    // ── Tap calendar (Libreta Phase 2) — a single tap toggles an R-OFF/Flex day straight in, no separate Add step ──
    win.rnPickedDates = [];
    win.rnSelectedType = 'roff';
    win.renderReqNotebook();
    selectRn(win, 'Karla Varela', 'gra', 'AM Room Attendant');
    win.rnCalTap(dates[4]);
    t.assert(win.rnPickedDates.includes(dates[4]), 'one tap adds the day to the picked set');
    win.rnCalTap(dates[4]);
    t.assert(!win.rnPickedDates.includes(dates[4]), 'tapping the same day again removes it — a toggle, not a one-way add');
    win.rnCalTap(dates[4]);
    win.rnAddRequest();
    let list2 = win.loadReqNotebook();
    t.assert(list2.some((r) => r.name === 'Karla Varela' && r.dates.includes(dates[4])), 'the tapped day is saved');

    // Vacation: first tap sets the range anchor, second tap fills the whole range in between (inclusive).
    win.rnPickedDates = [];
    win.rnSelectedType = 'vac';
    win.renderReqNotebook();
    selectRn(win, 'Karla Varela', 'gra', 'AM Room Attendant');
    win.rnCalTap(dates[0]);
    t.eq(win.rnPickedDates.join(','), dates[0], 'the first tap alone just picks that one day, awaiting the second tap');
    t.eq(win.rnRangeAnchor, dates[0]);
    win.rnCalTap(dates[2]);
    t.eq(win.rnPickedDates.join(','), [dates[0], dates[1], dates[2]].join(','), 'the second tap fills in every day between the two, inclusive');
    t.eq(win.rnRangeAnchor, null, 'the anchor clears once the range is confirmed, ready for a fresh range next time');
    win.rnAddRequest();
    list2 = win.loadReqNotebook();
    const vacEntry = list2.find((r) => r.type === 'vac' && r.dates.length === 3);
    t.assert(!!vacEntry, 'the whole tapped range is saved as one Vacation entry');
    t.eq(vacEntry.dates.join(','), [dates[0], dates[1], dates[2]].join(','), 'day by day, not just the two endpoints');

    // Tapping the LATER day first still produces the same range, in order.
    win.rnPickedDates = [];
    win.rnSelectedType = 'vac';
    win.renderReqNotebook();
    win.rnCalTap(dates[2]);
    win.rnCalTap(dates[0]);
    t.eq(win.rnPickedDates.join(','), [dates[0], dates[1], dates[2]].join(','), 'tap order does not matter — the range always comes out chronological');

    // ── Selecting an employee survives a Request-type toggle (the bug that motivated promoting selection to JS state) ──
    win.rnPickedDates = [];
    win.rnSelectedType = 'roff';
    win.renderReqNotebook();
    selectRn(win, 'Rolando', 'sup', 'Supervisors');
    win.rnSetType('vac'); // re-renders the whole form
    t.eq(win.rnSelName, 'Rolando', 'the employee pick survives a type toggle instead of being silently wiped');
    t.assert(new RegExp('value="Rolando \\(Supervisors\\)"').test(win.document.getElementById('reqNotebookContent').innerHTML),
      'and the search box itself shows the still-selected employee after the re-render');
    win.rnSetType('roff');

    // ── A day already picked under one type does not carry into another —
    // found live: switching to Vacation after picking an R-OFF day left it
    // highlighted on screen looking like a confirmed range anchor, but the
    // next tap silently wiped it instead of completing a range from it. ──
    win.rnPickedDates = [];
    win.rnSelectedType = 'roff';
    win.renderReqNotebook();
    win.rnCalTap(dates[0]);
    t.assert(win.rnPickedDates.includes(dates[0]), 'a day picked under R-OFF is in the set');
    win.rnSetType('vac');
    t.eq(win.rnPickedDates.length, 0, 'switching type clears the picked-days set — nothing ambiguous carries over');
    t.eq(win.rnRangeAnchor, null);
    win.rnSetType('roff');

    // ── Capture-time cover-chain conflict (Phase 3) — reuses the exact
    // SCHED_COVER_CHAINS Auto-fill's own cover chains use, so it can never
    // disagree with what Auto-fill would actually do. ──
    win.rnPickedDates = [];
    win.renderReqNotebook();
    // Gabriela Cuevas already has this date logged as her R-OFF — she's the
    // cover for Marroquin's Lobby AM slot, so logging Marroquin off the same
    // day is exactly the conflict this alert exists for.
    const gcEntry = { id: 5001, name: 'Gabriela Cuevas', crewKey: 'gra', crewLabel: 'AM Room Attendant', type: 'roff', dates: [dates[0]], writtenDates: [], missingDates: [] };
    win.saveReqNotebook([gcEntry]);

    selectRn(win, 'Marroquin', 'lobby', 'AM Lobby');
    win.rnPickedDates = [dates[0]];
    win.rnRefreshAlerts();
    const alertsHtml = win.document.getElementById('rnCaptureAlerts').innerHTML;
    t.assert(/Coverage conflict/.test(alertsHtml) && /Gabriela Cuevas/.test(alertsHtml),
      'the live alert box shows the cascade conflict before Save is even clicked');

    const conflicts = win.rnCascadeConflicts('Marroquin', [dates[0]]);
    t.eq(conflicts.length, 1, 'rnCascadeConflicts finds exactly the one hit');
    t.eq(conflicts[0].otherName, 'Gabriela Cuevas');

    // Save blocks on a plain confirm() unless it's answered yes — declining leaves nothing saved.
    let confirmMsg = '';
    win.confirm = (m) => { confirmMsg = m; return false; };
    const beforeCount = win.loadReqNotebook().length;
    win.rnAddRequest();
    t.eq(win.loadReqNotebook().length, beforeCount, 'declining the conflict confirm saves nothing');
    t.assert(/Gabriela Cuevas/.test(confirmMsg), 'the confirm dialog itself names who the conflict is with');

    // Confirming yes goes ahead and saves — Carlos's call, not a hard block.
    win.confirm = () => true;
    win.rnAddRequest();
    t.assert(win.loadReqNotebook().some((r) => r.name === 'Marroquin'), 'confirming yes saves the request despite the conflict');
    win.confirm = confirmFn;

    // No conflict at all when the two people covering each other are NOT both off the same day.
    win.rnPickedDates = [];
    win.renderReqNotebook();
    selectRn(win, 'Marroquin', 'lobby', 'AM Lobby');
    t.eq(win.rnCascadeConflicts('Marroquin', [dates[1]]).length, 0,
      'a day Gabriela Cuevas has nothing logged for is not flagged at all');

    // ── Small-team early warning — informational, never blocks Save ──
    win.saveReqNotebook([
      { id: 5002, name: 'Isabel D', crewKey: 'laundry', crewLabel: 'Laundry', type: 'roff', dates: [dates[5]], writtenDates: [], missingDates: [] },
      { id: 5003, name: 'Olga A', crewKey: 'laundry', crewLabel: 'Laundry', type: 'roff', dates: [dates[5]], writtenDates: [], missingDates: [] },
    ]);
    const early = win.rnEarlyWarnings('A Third Laundry Person', 'laundry', [dates[5]]);
    t.eq(early.length, 1, 'two other people from the same crew already off that day triggers the warning');
    t.eq(early[0].count, 3, 'the count includes the person being logged, not just the other two');
    win.confirm = () => { throw new Error('early warning must never block Save with a confirm()'); };
    selectRn(win, 'A Third Laundry Person', 'laundry', 'Laundry');
    win.rnPickedDates = [dates[6]]; // a day nobody else has logged — isolates this from the confirm-throwing setup above
    win.rnAddRequest();
    win.confirm = confirmFn;
    t.assert(win.loadReqNotebook().some((r) => r.name === 'A Third Laundry Person'), 'and the early warning alone never stops Save from going through');

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
