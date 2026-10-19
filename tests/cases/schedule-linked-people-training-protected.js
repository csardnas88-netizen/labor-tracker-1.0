/* Carlos's broader ask, 2026-10-19: after fixing Maria Aguilar's TRAINING
   cell getting clobbered by schedApplyCrossCrewSyncForDate, he asked for
   the whole sync family to be re-audited for the same class of bug. This
   test covers what that audit found in schedApplyLinkedPeopleForDate
   (SCHED_LINKED_PEOPLE's own mechanism, separate from the generic sync,
   used for Gabriela Cuevas/Gabriela and Sandra/Sandra) — its main mirror
   write had NO TRAINING exemption at all, unlike the sibling function.

   Concretely: if Gabriela Cuevas ever had TRAINING on her linked Lobby
   row while her Room Attendant cell genuinely read a granted absence
   (VAC/R-OFF/FLEX/CALL-OFF/TAILOR), the absence's exact text would get
   mirrored straight over her TRAINING cell — on every single render,
   with no edit required, the same "silently stomped, no edit needed"
   shape as the Maria Aguilar bug. This was a latent gap (neither
   Gabriela nor Sandra currently has TRAINING in Carlos's real data) but
   structurally identical and worth closing proactively. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];

function buildWeek(win, graCell) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = {
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      gra: [['Gabriela Cuevas', graCell]],
      lobby: [['Gabriela', 'TRAINING']],
    };
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
}

module.exports = {
  name: "schedApplyLinkedPeopleForDate's main mirror write never overwrites TRAINING on the linked (b) side, even when the (a) side genuinely reads an absence — same class of bug as Maria Aguilar's, found by re-auditing the whole sync family",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Genuine absence on Room Attendant (VAC) must not mirror onto a
    // TRAINING day sitting on the linked Lobby row. ──
    buildWeek(win, 'VAC');
    const SCH = win.dlLoadSchedule();
    win.schedApplyLinkedPeople(SCH, DATES);
    DATES.forEach((ds) => {
      const lobbyRow = SCH.days[ds].lobby.find((p) => p[0] === 'Gabriela');
      t.eq(lobbyRow[1], 'TRAINING', "her linked Lobby TRAINING day survives a genuine VAC on Room Attendant — " + ds);
    });

    // ── Same for R-OFF, the status the ORIGINAL (2026-09-07) deadlock
    // fix was built around — must still correctly protect TRAINING too. ──
    buildWeek(win, 'R-OFF');
    const SCH2 = win.dlLoadSchedule();
    win.schedApplyLinkedPeople(SCH2, DATES);
    DATES.forEach((ds) => {
      const lobbyRow = SCH2.days[ds].lobby.find((p) => p[0] === 'Gabriela');
      t.eq(lobbyRow[1], 'TRAINING', 'survives R-OFF too — ' + ds);
    });

    // ── Not a blanket bypass: a plain '1' on Room Attendant still
    // correctly relabels a non-TRAINING Lobby '1' to ROOMS, same as
    // always — the fix is scoped to TRAINING only. ──
    const days3 = {};
    DATES.forEach((ds) => {
      days3[ds] = { sheet: 't', occ: '150', dep: '60', tdOcc: '150',
        gra: [['Gabriela Cuevas', '1']],
        lobby: [['Gabriela', '1']],
      };
    });
    win.dlSaveSchedule({ days: days3, count: 7, savedAt: new Date().toISOString() });
    const SCH3 = win.dlLoadSchedule();
    win.schedApplyLinkedPeople(SCH3, DATES);
    const lobbyRow3 = SCH3.days[DATES[0]].lobby.find((p) => p[0] === 'Gabriela');
    t.eq(lobbyRow3[1], 'ROOMS', "a non-TRAINING Lobby '1' still correctly relabels to ROOMS when she's genuinely on Room Attendant — the fix doesn't disable the real mechanism");
  },
};
