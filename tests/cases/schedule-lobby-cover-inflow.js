/* Carlos's real report, 2026-10-20: the Export warning kept saying
   "Lobby AM has no coverage on Thu/Fri" even though Vanesa was covering
   the Lobby those days. Pulled from his live schedule, the exact shape:
   Vanesa has NO row in the Lobby crew at all — she's a Laundry attendant
   whose Laundry cell reads 'LOBBY' on Thu/Fri (the lobby away-label,
   meaning she spends those days on the Lobby). The coverage check only
   summed rows physically in the lobby array, so her cover was invisible
   and wrongly flagged. _schedLobbyCoverNames now counts anyone covering
   the Lobby from another crew, exactly mirroring how a 'LAUNDRY' mark
   already pulls someone onto the Laundry card. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-29', '2026-10-30'];

// Thu/Fri exactly as they sit in Carlos's live schedule: Marroquin OFF,
// Gabriela on ROOMS, the two PM people (Sarahi working, Andrea R-OFF), and
// Vanesa present ONLY on Laundry — with the value the test varies.
function build(win, vanesaLaundryCell) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = {
      sheet: 't', occ: '150', dep: '60', tdOcc: '150',
      lobby: [['Marroquin', 'OFF'], ['Sarahi', '1'], ['Gabriela', 'ROOMS'], ['Andrea', 'R-OFF']],
      laundry: [['Olga A', '1'], ['Vanesa', vanesaLaundryCell]],
    };
  });
  win.dlSaveSchedule({ days, count: 2, savedAt: new Date().toISOString() });
}

module.exports = {
  name: 'schedExportWarnings counts a Laundry attendant marked LOBBY (no lobby row of her own) as real Lobby AM coverage, so it no longer falsely flags "no coverage" — but still flags a day genuinely left uncovered',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── Real case: Vanesa's Laundry cell = 'LOBBY' → she's covering the
    // Lobby AM both days. No false "no coverage" warning. ──
    build(win, 'LOBBY');
    let SCH = win.dlLoadSchedule();
    let warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(!warnings.some((w) => w.indexOf('Lobby AM has no coverage') !== -1),
      'a Laundry attendant marked LOBBY counts as Lobby AM coverage — no false warning: ' + JSON.stringify(warnings));

    // ── Control: same week but Vanesa is actually doing Laundry ('1'),
    // NOT covering the Lobby — now AM genuinely has nobody (Marroquin OFF,
    // Gabriela on ROOMS), so the warning must still fire. ──
    build(win, '1');
    SCH = win.dlLoadSchedule();
    warnings = win.schedExportWarnings(SCH, DATES);
    const amGaps = warnings.filter((w) => w.indexOf('Lobby AM has no coverage') !== -1);
    t.eq(amGaps.length, 2, 'with nobody actually covering AM, both days still warn: ' + JSON.stringify(warnings));

    // ── And a direct check of the helper itself. ──
    build(win, 'LOBBY');
    SCH = win.dlLoadSchedule();
    t.eq(win._schedLobbyCoverNames(SCH, '2026-10-29', 'am').join(','), 'Vanesa',
      'the cover helper names Vanesa as covering Lobby AM on Thu');
    t.eq(win._schedLobbyCoverNames(SCH, '2026-10-29', 'pm').length, 0,
      'and does not put her on the PM shift (she is an AM-default name)');

    // ── Carlos's follow-up ask: she should SHOW on the Lobby AM card too.
    // schedSyncAllLobbyCoverRows makes a disposable 'cover' row for her in
    // the Lobby crew (so _schedCrewRef/the card pick her up), on the AM
    // sub-card, and removes it again once her LOBBY mark is gone. ──
    build(win, 'LOBBY');
    SCH = win.dlLoadSchedule();
    t.assert(win.schedSyncAllLobbyCoverRows(SCH, DATES), 'the lobby cover-sync reports it made a change');
    let vCover = SCH.days['2026-10-29'].lobby.find((p) => p[0] === 'Vanesa');
    t.assert(vCover && vCover[1] === '1' && vCover[2] === 'cover',
      "Vanesa now has a 'cover' row on the Lobby crew: " + JSON.stringify(SCH.days['2026-10-29'].lobby));
    t.eq(win.schedLobbyShift('Vanesa'), 'am', 'and she lands on the AM sub-card');
    // Idempotent: running it again changes nothing.
    t.assert(!win.schedSyncAllLobbyCoverRows(SCH, DATES), 'running the cover-sync again is a no-op');
    // Clearing her LOBBY mark removes the cover row (never leaves a ghost).
    SCH.days['2026-10-29'].laundry.find((p) => p[0] === 'Vanesa')[1] = '1';
    SCH.days['2026-10-30'].laundry.find((p) => p[0] === 'Vanesa')[1] = '1';
    win.schedSyncAllLobbyCoverRows(SCH, DATES);
    t.assert(!SCH.days['2026-10-29'].lobby.some((p) => p[0] === 'Vanesa'),
      'the cover row is removed once she is no longer marked LOBBY');

    // ── Guard: a 'cover' row must NOT trip the days-off/overtime warning.
    // Her days off belong to her home crew (Laundry), not the Lobby she is
    // only covering — counting the cover row here would flag her every time. ──
    build(win, 'LOBBY');
    SCH = win.dlLoadSchedule();
    win.schedSyncAllLobbyCoverRows(SCH, DATES); // gives her a Lobby cover row with 0 days off
    warnings = win.schedExportWarnings(SCH, DATES);
    t.assert(!warnings.some((w) => w.indexOf('Vanesa (Lobby)') !== -1),
      'a Lobby cover row never flags Vanesa for Lobby overtime: ' + JSON.stringify(warnings));

    // ── Guard: a re-upload must NOT carry a 'cover' row across (it is
    // regenerated from the underlying LOBBY mark, not a persistent member). ──
    const oldWithCover = {
      days: {
        '2026-10-29': { lobby: [['Marroquin', '1'], ['Vanesa', '1', 'cover']], laundry: [['Vanesa', 'LOBBY']] },
      },
    };
    const freshImport = { days: { '2026-10-29': { lobby: [['Marroquin', '1']], laundry: [['Vanesa', 'LOBBY']] } } };
    const merged = win.schedCarryAddedRows(oldWithCover, freshImport);
    t.assert(!merged.days['2026-10-29'].lobby.some((p) => p[0] === 'Vanesa'),
      'the old cover row is not carried into the fresh import as a permanent row: ' + JSON.stringify(merged.days['2026-10-29'].lobby));
  },
};
