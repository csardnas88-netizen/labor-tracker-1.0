/* Carlos's real reports about Vanesa's Lobby row disappearing on
   re-upload, and the fix that a re-upload must NEVER silently remove
   someone who was working (his explicit call, 2026-10-20).

   Three behaviours proven here:
   1. An app-added ('added') row whose fresh-import cell is still blank
      keeps its app-confirmed value AND keeps the 'added' tag (an earlier
      narrow fix merged the value but dropped the tag, which let the next
      re-upload delete her anyway).
   2. A native workbook row that was working and the fresh import dropped
      is carried across (tagged 'added' from then on) — the real Vanesa
      case: her Lobby row comes from Excel, not "+ Add someone", so it had
      no protection and vanished whenever a re-upload omitted it.
   3. The deliberate removals still work: a row hidden in the new workbook
      (hiddenPeople) is NOT carried, and an all-blank placeholder that
      never actually worked is NOT resurrected. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedCarryAddedRows never silently drops a working person on re-upload (app-added keeps value+tag; a dropped native working row is carried as added), while a hidden row and an all-blank placeholder are still removed',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── App-added row, fresh import re-lists her blank: keep value+tag. ──
    const oldAdded = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '1', 'added']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '1', 'added']] },
      },
    };
    const newBlank = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
      },
    };
    const mergedBlank = win.schedCarryAddedRows(oldAdded, newBlank);
    const vThu = mergedBlank.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa');
    t.eq(vThu[1], '1', 'her app-confirmed Thu value survives a re-upload that re-lists her blank');
    t.eq(vThu[2], 'added', 'and the "added" tag is preserved, so a LATER re-upload still protects her');
    t.eq(mergedBlank.days['2026-10-30'].lobby.find((p) => p[0] === 'Vanesa')[1], '1',
      'her app-confirmed Fri value survives too');

    // ── Fresh import gives that cell a REAL value: that newer value wins. ──
    const newReal = { days: { '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', 'OFF']] } } };
    const mergedReal = win.schedCarryAddedRows(oldAdded, newReal);
    t.eq(mergedReal.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa')[1], 'OFF',
      'a real value already in the fresh import is never overwritten by the carried old value');

    // ── Added row absent from the import entirely: carried, as before. ──
    const newAbsentAdded = { days: { '2026-10-29': { lobby: [['Marroquin', '1']] } } };
    const mergedAbsentAdded = win.schedCarryAddedRows(oldAdded, newAbsentAdded);
    const vAbs = mergedAbsentAdded.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa');
    t.assert(vAbs && vAbs[1] === '1' && vAbs[2] === 'added',
      'an added row still carries when the import omits her entirely');

    // schedCarryAddedRows MUTATES newSch in place, so every call below
    // builds its own fresh "fresh import" object — reusing one would let
    // an earlier call's carried-in row pollute the next assertion.
    const dropsVanesa = () => ({
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1']] },
        '2026-10-30': { lobby: [['Marroquin', '1']] },
      },
    });

    // ── THE REAL VANESA CASE: a NATIVE Lobby row (no "added" tag, straight
    // from Excel) that was working, dropped by a re-upload, must now be
    // carried across — tagged 'added' so she's protected going forward. ──
    const oldNative = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '1']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '1']] },
      },
    };
    const mergedNative = win.schedCarryAddedRows(oldNative, dropsVanesa());
    ['2026-10-29', '2026-10-30'].forEach((ds) => {
      const row = mergedNative.days[ds].lobby.find((p) => p[0] === 'Vanesa');
      t.assert(row && row[1] === '1' && row[2] === 'added',
        'native working Lobby row Vanesa is carried across the re-upload that dropped her, now app-managed — ' + ds);
    });

    // ── Deliberate removal #1: her row is hidden in the new workbook.
    // hiddenPeople is how Carlos takes someone off the team — she must
    // NOT be resurrected. ──
    const newHidden = {
      hiddenPeople: { 'vanesa': 'Vanesa' },
      days: { '2026-10-29': { lobby: [['Marroquin', '1']] } },
    };
    const mergedHidden = win.schedCarryAddedRows(oldNative, newHidden);
    t.assert(!mergedHidden.days['2026-10-29'].lobby.some((p) => p[0] === 'Vanesa'),
      'a row hidden in the new workbook stays removed — hiding is a deliberate take-off-the-team');

    // ── Not resurrecting a ghost: an all-blank native row that never
    // actually worked this week is NOT carried. ──
    const oldGhost = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
        '2026-10-30': { lobby: [['Marroquin', '1'], ['Vanesa', '']] },
      },
    };
    const mergedGhost = win.schedCarryAddedRows(oldGhost, dropsVanesa());
    t.assert(!mergedGhost.days['2026-10-29'].lobby.some((p) => p[0] === 'Vanesa'),
      'an all-blank placeholder (never worked) is not resurrected');
  },
};
