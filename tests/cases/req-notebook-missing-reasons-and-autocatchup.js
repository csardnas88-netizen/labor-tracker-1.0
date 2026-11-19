/* Carlos's two real reports, 2026-11-19:

   1. "Susan Aguilar y Susan son dos personas... si alguno de los
      managers elige la Susan incorrecta, el request off no va al
      horario." Picking the wrong one of two same-first-name people
      used to fail exactly the same silent way as "the week just isn't
      built yet" — same bare missing list, same vague toast. Split so
      the two reasons are told apart: missingNoWeek (the day genuinely
      isn't loaded — nothing anyone picked could have helped) vs.
      missingNoMatch (the week IS loaded, but nothing matches this
      exact name+crew — the real symptom of a wrong pick).

   2. Rebeca logged ~24 real Request Off entries for the week of
      Nov 21-27 several days before that week was actually built —
      every one landed in missingDates at capture time (genuinely "not
      built yet"), and nothing ever retried them once the week WAS
      built days later; Carlos only noticed 2 of them missing
      (Gabriela, "Jasmine") out of the whole batch. schedAutoApplyPendingReqNotebook
      now catches these up automatically on render, but only ever
      fills a cell that's still genuinely undecided (blank/'1') — never
      overwrites a real decision made in the meantime. */
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
  name: 'Request Off: a wrong-person pick is told apart from "week not built yet", and entries captured before their week existed catch up automatically once it is — without overwriting a real decision',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // ── Part 1: two real same-first-name people, Susan Aguilar
    // (Supervisors) and Susan (Laundry). Picking the wrong NAME outright
    // (not just the wrong crew for the right one — _reqScheduleRow's own
    // cross-crew fallback already rescues that case on purpose) for a
    // day she genuinely isn't on ANY crew is the real "nothing happens"
    // symptom: no row anywhere matches, so nothing can be written. ──
    const weekStart = new Date(2026, 10, 21); // Sat Nov 21 2026
    const dates = buildWeek(win, weekStart, { sup: ['Susan Aguilar', 'Rolando'], laundry: ['Susan', 'Olga A'] });
    // Susan Aguilar is off this one specific day — removed from every
    // crew's row for it, same as a real day she isn't scheduled at all.
    const sch0 = win.dlLoadSchedule();
    ['sup', 'laundry'].forEach((bk) => {
      sch0.days[dates[0]][bk] = sch0.days[dates[0]][bk].filter((r) => r[0] !== 'Susan Aguilar');
    });
    win.dlSaveSchedule(sch0);

    let res = win.reqWriteToSchedule('Susan Aguilar', 'sup', [dates[0]], 'roff');
    t.eq(res.written.length, 0, 'nothing written — no row anywhere matches "Susan Aguilar" that day');
    t.eq(res.missingNoMatch.length, 1, 'this is a no-match failure (the week IS loaded)');
    t.eq(res.missingNoWeek.length, 0, 'not a "week not loaded" failure');
    t.eq(res.missing.length, 1, 'the combined .missing list still works for any existing caller');

    // The real Laundry Susan (a completely different person) must be
    // untouched — picking the wrong one must never write to an innocent
    // third party's cell.
    const schAfter = win.dlLoadSchedule();
    const laundryRow = schAfter.days[dates[0]].laundry.filter((r) => r[0] === 'Susan')[0];
    t.eq(laundryRow[1], '1', 'the real Laundry Susan\'s cell is untouched');

    // A genuinely future/unbuilt date mixed in — classified the other way.
    const futureDs = '2027-03-01';
    res = win.reqWriteToSchedule('Susan Aguilar', 'sup', [dates[1], futureDs], 'roff');
    t.eq(res.written.length, 1, 'the real Susan Aguilar on a day she IS scheduled does get written');
    t.eq(res.missingNoWeek.length, 1, 'the far-future date is "week not built yet"');
    t.eq(res.missingNoMatch.length, 0, 'not a no-match failure for the one that just has no data at all');

    // ── rnAddRequest's toast tells the two apart in plain language. ──
    win.rnSelName = 'Susan Aguilar';
    win.rnSelCrewKey = 'sup';
    win.rnSelCrewLabel = 'Supervisors';
    win.rnPickedDates = [dates[0]]; // the day she has no row anywhere
    let toastMsg = null;
    win.showToast = (m) => { toastMsg = m; };
    win.rnAddRequest();
    t.assert(/wrong person picked/.test(toastMsg), 'the toast says plainly that the pick looks wrong: ' + toastMsg);
    t.assert(!/not in a built week yet/.test(toastMsg), 'not the misleading "week not built" wording for this case');

    // ── Part 2: Rebeca's real scenario — captured before the week
    // existed, must catch up automatically once it does, without
    // clobbering a real decision made in the meantime. ──
    const { win: win2 } = await loadApp({ seed: fakeSession() });
    const entry = {
      id: 1794895733073, name: 'Gabriela Cuevas', crewKey: 'gra', crewLabel: 'AM Room Attendant',
      type: 'roff', dates: ['2026-11-26'], capturedBy: 'Rebeca', capturedAt: '2026-11-17T06:08:53.073Z',
      writtenDates: [], missingDates: ['2026-11-26'],
    };
    win2.saveReqNotebook([entry]);

    // The week didn't exist yet when captured — build it now, days later,
    // with Gabriela's cell still at its generic default.
    const weekStart2 = new Date(2026, 10, 21);
    const dates2 = buildWeek(win2, weekStart2, { gra: ['Gabriela Cuevas', 'Rubia'] });
    win2.schedViewWeekStart = weekStart2; // viewing the week this entry actually touches
    win2.renderSchedule();

    const sch2 = win2.dlLoadSchedule();
    const gabRow = sch2.days['2026-11-26'].gra.filter((r) => r[0] === 'Gabriela Cuevas')[0];
    t.eq(gabRow[1], 'R-OFF', 'her R-OFF was written automatically once the week existed, with no manual resync click');

    const list2 = win2.loadReqNotebook();
    const savedEntry = list2.filter((r) => r.id === 1794895733073)[0];
    t.assert((savedEntry.writtenDates || []).indexOf('2026-11-26') !== -1, 'the notebook entry\'s own bookkeeping is updated to reflect the catch-up');
    t.eq((savedEntry.missingDates || []).length, 0, 'and no longer shows as missing');

    // ── Safety: a cell someone genuinely decided something else for in
    // the meantime must NEVER be silently overwritten by the catch-up. ──
    const { win: win3 } = await loadApp({ seed: fakeSession() });
    const entry3 = {
      id: 999, name: 'Jazmy', crewKey: 'gra', crewLabel: 'AM Room Attendant',
      type: 'roff', dates: ['2026-11-27'], capturedBy: 'Rebeca', capturedAt: '2026-11-17T06:00:00.000Z',
      writtenDates: [], missingDates: ['2026-11-27'],
    };
    win3.saveReqNotebook([entry3]);
    const weekStart3 = new Date(2026, 10, 21);
    buildWeek(win3, weekStart3, { gra: ['Jazmy', 'Rubia'] });
    // A manager genuinely decided she's covering Laundry that day, AFTER
    // the request was captured but BEFORE this render ever runs.
    const sch3 = win3.dlLoadSchedule();
    sch3.days['2026-11-27'].gra.filter((r) => r[0] === 'Jazmy')[0][1] = 'LAUNDRY';
    win3.dlSaveSchedule(sch3);
    win3.schedViewWeekStart = weekStart3;
    win3.renderSchedule();

    const sch3After = win3.dlLoadSchedule();
    const jazmyRow = sch3After.days['2026-11-27'].gra.filter((r) => r[0] === 'Jazmy')[0];
    t.eq(jazmyRow[1], 'LAUNDRY', 'the real decision (covering Laundry) survives — the stale notebook entry never overwrites it');
    const list3 = win3.loadReqNotebook();
    const savedEntry3 = list3.filter((r) => r.id === 999)[0];
    t.assert((savedEntry3.missingDates || []).indexOf('2026-11-27') !== -1, 'and the entry honestly still shows that day as missing, not silently marked written');
  },
};
