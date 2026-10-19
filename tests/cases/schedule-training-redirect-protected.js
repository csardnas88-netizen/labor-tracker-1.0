/* Carlos's real report, 2026-10-19, while building the week of Oct 24:
   Maria Aguilar's TRAINING cell on Turndown kept flipping back to '1'
   every single time he edited ANY OTHER employee's cell, anywhere on
   the schedule — not even someone related to Maria.

   This is a DIFFERENT clobber site than the one fixed 2026-10-11 (see
   schedule-training-cross-crew-protected.js), which only protected the
   loop that relabels OTHER crews to match an absence. The new report
   comes from the "redirect" mechanism instead: once Maria's Room
   Attendant cell reads 'TURNDOWN' (the normal away-label this same sync
   writes once she's confirmed working Turndown that day), the redirect
   scan in schedApplyCrossCrewSyncForDate re-picks her TRAINING entry as
   "source" purely because her Room Attendant cell's text matches
   Turndown's away-label — with zero connection to who was actually
   edited. The line right after that then force-confirmed source's own
   cell to '1' whenever it wasn't already '1' or a recognized absence,
   and TRAINING satisfied neither exemption. Since this sync reruns
   non-targeted (edited=undefined) on every renderSchedule(), ANY edit
   to ANY other employee repainted the whole week and clobbered her. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];

function buildWeek(win) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = {
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      gra: [['Maria Aguilar', 'TURNDOWN'], ['Lorena', '1']],
      td: [
        ['Aura', '1'], ['Guadalupe', '1'], ['Paty', '1'], ['Jazmin', '1'], ['Andrea', '1'],
        ['Maria Aguilar', 'TRAINING'],
      ],
    };
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
  win.schedViewWeekStart = new Date(2026, 9, 24);
}

module.exports = {
  name: "TRAINING survives the redirect branch of schedApplyCrossCrewSync — editing an unrelated employee must never flip Maria's Turndown training back to '1' just because her Room Attendant cell legitimately reads the TURNDOWN away-label (Carlos's real report, 2026-10-19)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Direct unit check: Maria's Room Attendant cell reads 'TURNDOWN'
    // (confirming she's really working Turndown that day) while her
    // Turndown row itself reads TRAINING — exactly the state that
    // triggers the redirect scan to pick her TRAINING entry as source. ──
    buildWeek(win);
    const SCH = win.dlLoadSchedule();
    win.schedApplyCrossCrewSync(SCH, DATES);
    DATES.forEach((ds) => {
      const tdRow = SCH.days[ds].td.find((p) => p[0] === 'Maria Aguilar');
      t.eq(tdRow[1], 'TRAINING', 'her Turndown training cell must survive a full non-targeted sync pass — ' + ds);
      const graRow = SCH.days[ds].gra.find((p) => p[0] === 'Maria Aguilar');
      t.eq(graRow[1], 'TURNDOWN', 'her Room Attendant away-label stays TURNDOWN, untouched — ' + ds);
    });

    // ── End-to-end: editing a COMPLETELY UNRELATED employee (Lorena)
    // triggers renderSchedule(), which reruns the cross-crew sync over
    // the whole week with no 'edited' context — Carlos's exact report,
    // "cada vez que hacía un cambio en otro empleado, cualquiera que
    // sea". Maria's TRAINING must not move. ──
    buildWeek(win);
    win.confirm = () => true;
    win.schedViewWeekStart = new Date(2026, 9, 24);
    const firstDs = win.schedWeekDates()[0];
    win.schedSetCell('gra', 1, 'Lorena', firstDs, '1');
    win.renderSchedule();
    const afterEdit = win.dlLoadSchedule();
    DATES.forEach((ds) => {
      const tdRow = afterEdit.days[ds].td.find((p) => p[0] === 'Maria Aguilar');
      t.eq(tdRow[1], 'TRAINING', "editing an unrelated employee (Lorena) must never flip Maria's Turndown training day — " + ds);
    });
  },
};
