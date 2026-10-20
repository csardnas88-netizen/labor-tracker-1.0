/* Carlos's real report, 2026-10-20: Vanesa, added to Lobby via "+ Add
   someone to this crew" and confirmed working ('1') by hand on Thu/Fri,
   "disappeared" from those days after some other change. Root cause: a
   later re-upload of the Schedule Draft workbook happened to list her on
   Lobby too (same spelling) but with a blank cell there — schedCarryAddedRows
   treated "she's already named in the fresh import" as reason enough to
   skip carrying her value across, blank cell or not, silently dropping
   her real confirmation. Fixed: the carried value now only loses to a
   REAL value already sitting in the fresh import, never to a blank one. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedCarryAddedRows keeps an added row\'s real value when the fresh import lists the same person with a still-blank cell, but still lets a real value already in the fresh import win',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const oldSch = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '1', 'added']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '1', 'added']] },
      },
    };

    // Fresh re-upload: the workbook now also lists Vanesa on Lobby, but
    // her cell is still blank there (he never filled it into the file).
    const newSchBlank = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
      },
    };
    const mergedBlank = win.schedCarryAddedRows(oldSch, newSchBlank);
    t.eq(mergedBlank.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa')[1], '1',
      'her app-confirmed Thu value survives a re-upload that still lists her blank in the file');
    t.eq(mergedBlank.days['2026-10-30'].lobby.find((p) => p[0] === 'Vanesa')[1], '1',
      'her app-confirmed Fri value survives too');

    // But if the fresh import gives that same cell a REAL value of its
    // own (Carlos actually filled her in the workbook this time), that
    // genuinely newer correction must win, not get silently overwritten
    // back to the old app-side value.
    const newSchReal = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', 'OFF']] },
      },
    };
    const mergedReal = win.schedCarryAddedRows(oldSch, newSchReal);
    t.eq(mergedReal.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa')[1], 'OFF',
      'a real value already in the fresh import is never overwritten by the carried-over old value');

    // And the original no-match case (she's not in the fresh import at
    // all that day) still carries her whole row across unchanged.
    const newSchAbsent = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1']] },
      },
    };
    const mergedAbsent = win.schedCarryAddedRows(oldSch, newSchAbsent);
    const vanesaRow = mergedAbsent.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa');
    t.assert(vanesaRow && vanesaRow[1] === '1' && vanesaRow[2] === 'added',
      'still pushed across as a fresh added row when she is not in the new import at all');
  },
};
