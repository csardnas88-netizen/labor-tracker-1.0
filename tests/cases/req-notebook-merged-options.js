/* Carlos's ask, 2026-10-15, right after the Jorge Gonzalez cross-crew
   fallback shipped: for almost everyone, the crew picked in the Request
   Off dropdown is now just a starting preference, not a hard
   requirement — reqWriteToSchedule falls back to whichever crew
   actually has her row that date, and reconciles the other crew via
   cross-crew sync right after writing. So most people who sit on 2+
   crews under the exact same name no longer need to be listed twice.
   reqEmpOptions now shows ONE option for anyone not in the small
   exclusion list (SCHED_CROSS_CREW_EXTRA_EXCLUDED — Sarahi/Andrea/
   Rubia/Julia), who still need a separate option per crew since for
   them the crew really does carry different meaning (a mirror/cover
   relationship, not a second home) and there's no fallback to lean on. */
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

function selectRn(win, name, crewKey, crewLabel) {
  win.rnSelName = name;
  win.rnSelCrewKey = crewKey;
  win.rnSelCrewLabel = crewLabel;
}

module.exports = {
  name: 'Request Off picker shows ONE option for anyone on 2+ crews under the same name (not the small cross-crew-excluded list), relying on reqWriteToSchedule\'s own fallback instead of needing a choice per crew',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const weekStart = new Date(2026, 9, 24); // Sat Oct 24 2026
    buildWeek(win, weekStart, {
      hp: ['Jorge Gonzalez'],
      laundry: ['Jorge Gonzalez'],
      lobby: ['Andrea'],
      td: ['Andrea'],
    });

    const opts = win.reqEmpOptions();

    // ── Jorge (not excluded) now shows ONCE, not once per crew ──
    const jorgeOpts = opts.filter((e) => e.name === 'Jorge Gonzalez');
    t.eq(jorgeOpts.length, 1, 'Jorge Gonzalez is offered exactly once, even though he has a real row on both Houseman and Laundry');

    // ── Andrea (in SCHED_CROSS_CREW_EXTRA_EXCLUDED) still shows once
    // per crew — her case genuinely needs the explicit choice. ──
    const andreaOpts = opts.filter((e) => e.name === 'Andrea');
    t.eq(andreaOpts.length, 2, "Andrea still gets a separate option per crew — she's in the exclusion list, no fallback to lean on");
    t.assert(andreaOpts.some((e) => e.crewKey === 'lobby'), 'one of Andrea\'s options is Lobby');
    t.assert(andreaOpts.some((e) => e.crewKey === 'td'), 'and the other is PM Turndown/GRA — neither silently dropped');

    // ── Picking Jorge's single merged option still writes through
    // correctly, using reqWriteToSchedule's own fallback if the picked
    // crew happens to not have his row that day. ──
    win.rnPickedDates = [win.dateStr(weekStart)];
    win.renderReqNotebook();
    selectRn(win, jorgeOpts[0].name, jorgeOpts[0].crewKey, jorgeOpts[0].crewLabel);
    win.rnAddRequest();
    const afterJorge = win.dlLoadSchedule();
    const ds0 = win.dateStr(weekStart);
    t.eq(afterJorge.days[ds0].hp.filter((p) => p[0] === 'Jorge Gonzalez')[0][1], 'R-OFF', "picking Jorge's single option writes through to his real row");
  },
};
