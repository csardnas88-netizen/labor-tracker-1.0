/* Carlos's real report, 2026-10-11, the same day TRAINING shipped:
   Maria Aguilar — a Room Attendant starting training on PM Turndown,
   so she carries a row on BOTH crews that week — had every single
   TRAINING day silently flip to OFF/1 after he adjusted Lorena (a
   different person entirely) on the Schedule page.

   Root cause, found by isolating each step of a full Auto-fill run:
   isFixedOff/isFixedOffFn already protect TRAINING from Auto-fill's
   OWN day-off rotation and shortfall repair on the 'td' crew itself —
   but Auto-fill ALSO ran its ordinary fairness rotation on Maria's
   OTHER crew (Room Attendant), which isn't protected at all there
   (TRAINING isn't even on that crew's cell — she's a completely
   normal Room Attendant for rotation purposes) and legitimately gave
   her a routine day off. schedApplyCrossCrewSyncForDate — which keeps
   someone's rows in sync across every crew she's on, and runs full
   non-targeted ('edited' is undefined) on every render — then treated
   that Room Attendant absence as authoritative for EVERY crew she's
   on, including her Turndown row, and overwrote TRAINING with it: "she
   can't be resting on one crew and working/covering on another" is the
   right rule for an ordinary cover label (LOBBY/HOUSEMAN/etc), but
   training is independent of whatever her home crew's own fairness
   rotation decides that week.

   Carlos's one single-cell edit to Lorena didn't need to touch Maria
   at all to trigger this: ANY edit whose own reconciliation forces a
   full renderSchedule() re-runs the cross-crew sync across the WHOLE
   week (schedApplyCrossCrewSync(SCH, schedWeekDates()), not just the
   one date edited), which is exactly what repaints every crew card on
   the page — including Maria's, even though she wasn't the one
   edited. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];

function buildWeek(win, { graOff = [] } = {}) {
  const days = {};
  DATES.forEach((ds, di) => {
    days[ds] = {
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      gra: [['Maria Aguilar', graOff.indexOf(di) !== -1 ? 'OFF' : '1']],
      td: [
        ['Aura', '1'], ['Guadalupe', '1'], ['Paty', '1'], ['Jazmin', '1'], ['Andrea', '1'], ['Lorena', '1'],
        ['Maria Aguilar', 'TRAINING'],
      ],
    };
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
  win.schedViewWeekStart = new Date(2026, 9, 17);
}

module.exports = {
  name: "TRAINING survives schedApplyCrossCrewSync even when the SAME person has a genuine absence on her OTHER crew — a routine Room Attendant day off must never cascade onto her independent Turndown training day (Carlos's real Maria Aguilar report, 2026-10-11)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Direct unit check: Maria has a genuine OFF on Room Attendant
    // (Monday, index 2) while her Turndown row reads TRAINING every
    // day — the exact cross-crew state Auto-fill's own rotation left
    // her in. The generic sync must not touch her Turndown row. ──
    buildWeek(win, { graOff: [2] });
    const SCH = win.dlLoadSchedule();
    const changed = win.schedApplyCrossCrewSync(SCH, DATES);
    const mondayRow = SCH.days['2026-10-19'].td.find((p) => p[0] === 'Maria Aguilar');
    t.eq(mondayRow[1], 'TRAINING', "Monday's TRAINING survives even though her Room Attendant row genuinely reads OFF that same day");
    DATES.forEach((ds) => {
      const row = SCH.days[ds].td.find((p) => p[0] === 'Maria Aguilar');
      t.eq(row[1], 'TRAINING', 'every other day of her training week is untouched too — ' + ds);
    });

    // ── End-to-end: a real Auto-fill run (which legitimately rotates
    // her OWN Room Attendant days off, same as any other Room
    // Attendant) must not corrupt her independent Turndown training
    // week as a side effect. ──
    buildWeek(win);
    const SCH2 = win.dlLoadSchedule();
    win.confirm = () => true;
    win.schedViewWeekStart = new Date(2026, 9, 17);
    win.renderSchedule();
    win.schedAutoFill();
    const afterAutoFill = win.dlLoadSchedule();
    DATES.forEach((ds) => {
      const row = afterAutoFill.days[ds].td.find((p) => p[0] === 'Maria Aguilar');
      t.eq(row[1], 'TRAINING', "Auto-fill (which DOES give her a routine Room Attendant day off elsewhere) must never flip her Turndown training day — " + ds);
    });

    // ── The protection is specific to TRAINING, not a blanket "never
    // sync this person" exemption — an ordinary cover label on another
    // crew still correctly syncs to a genuine absence, same as always. ──
    const days3 = {};
    DATES.forEach((ds) => {
      days3[ds] = { sheet: 't', occ: '150', dep: '60', tdOcc: '',
        gra: [['Karla Varela', 'OFF']],
        laundry: [['Karla Varela', '1']],
      };
    });
    win.dlSaveSchedule({ days: days3, count: 7, savedAt: new Date().toISOString() });
    const SCH3 = win.dlLoadSchedule();
    win.schedApplyCrossCrewSync(SCH3, DATES);
    const karlaLaundry = SCH3.days[DATES[0]].laundry.find((p) => p[0] === 'Karla Varela');
    t.eq(karlaLaundry[1], 'OFF', "a NON-training cover row (Karla's Laundry '1') still correctly syncs to a genuine absence elsewhere — the fix is scoped to TRAINING only, not a general sync bypass");
  },
};
