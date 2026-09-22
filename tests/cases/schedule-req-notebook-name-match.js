/* Carlos's real report, 2026-09-17: the Excel his original Schedule Draft
   was built from didn't use exactly the roster's own names — some crews
   carry a full name ("Elmer Galindo"), others just a short one ("Elmer").
   Request Off entries picked/typed under the fuller name silently failed
   to write through to a cell that only ever had the short one — the
   write-through's row lookup was a strict dlNorm equality, so "Elmer
   Galindo" never found "Elmer"'s row at all. He'd build the week and
   never see that Elmer had actually requested Saturday+Sunday off.

   Fixed via the same proven loose-match Call-Offs already uses
   (schedNameLooselyMatches, schedApplyCallOff): every token of the
   SHORTER name has to prefix-match a distinct token of the fuller one.
   Exact match still wins first (keeps the Sandra S./Sandra S. alias case
   correct); loose match only resolves when exactly ONE row on that crew
   qualifies, so an ambiguous case is left for Carlos rather than guessed
   at — the same safety Call-Offs already has. */
const { loadApp, fakeSession } = require('../_harness');

function buildDay(win, ds, crews) {
  const SCH = win.dlLoadSchedule() || { days: {}, count: 0 };
  SCH.days[ds] = SCH.days[ds] || { sheet: 't', occ: '100', dep: '40', tdOcc: '' };
  Object.keys(crews).forEach((bk) => {
    SCH.days[ds][bk] = crews[bk].map((n) => [n, '1']);
  });
  win.dlSaveSchedule(SCH);
}

module.exports = {
  name: "Request Off write-through matches a fuller roster name (Elmer Galindo) to a shorter Schedule cell (Elmer), same as Call-Offs already does — but never guesses when it's ambiguous (Carlos's real 2026-09-17 report)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── The real case: only a short name on the grid ──
    buildDay(win, '2026-09-26', { hp: ['Elmer'] });
    const res1 = win.reqWriteToSchedule('Elmer Galindo', 'hp', ['2026-09-26'], 'roff');
    t.eq(JSON.stringify(res1.written), JSON.stringify(['2026-09-26']), "Elmer Galindo's request finds Elmer's row and writes through");
    t.eq(JSON.stringify(res1.missing), JSON.stringify([]), 'nothing reported missing — the day IS built, the name just needed loose matching');
    t.eq(win.dlLoadSchedule().days['2026-09-26'].hp[0][1], 'R-OFF', "Elmer's own cell reads R-OFF");

    // Clearing (e.g. deleting the notebook entry) must find the same row
    // the same way, or the R-OFF it wrote would be stuck forever.
    win.reqClearFromSchedule('Elmer Galindo', 'hp', ['2026-09-26'], 'roff');
    t.eq(win.dlLoadSchedule().days['2026-09-26'].hp[0][1], '', "clearing the request finds Elmer's row too and reverts it");

    // ── Exact match still wins when there is one, even with a
    // loosely-matching row also present on the same crew ──
    buildDay(win, '2026-09-27', { hp: ['Elmer Galindo', 'Elmer'] });
    const res2 = win.reqWriteToSchedule('Elmer Galindo', 'hp', ['2026-09-27'], 'roff');
    t.eq(JSON.stringify(res2.written), JSON.stringify(['2026-09-27']), 'still writes through — the exact row wins over guessing');
    const day27 = win.dlLoadSchedule().days['2026-09-27'].hp;
    t.eq(day27.filter((p) => p[0] === 'Elmer Galindo')[0][1], 'R-OFF', 'the EXACT "Elmer Galindo" row is the one that changed');
    t.eq(day27.filter((p) => p[0] === 'Elmer')[0][1], '1', "the other Elmer's row is untouched — exact match never falls through to guessing when it doesn't need to");

    // ── Genuinely ambiguous: two DIFFERENT short names that BOTH loosely
    // match the fuller name. Must refuse to guess, same as Call-Offs. ──
    buildDay(win, '2026-09-28', { hp: ['Elmer', 'Elmer G'] });
    const res3 = win.reqWriteToSchedule('Elmer Galindo', 'hp', ['2026-09-28'], 'roff');
    t.eq(JSON.stringify(res3.written), JSON.stringify([]), 'an ambiguous match (two possible Elmers) writes nothing rather than guessing wrong');
    t.eq(JSON.stringify(res3.missing), JSON.stringify(['2026-09-28']), 'and is reported back as missing, so Carlos knows to set it by hand');
    const day28 = win.dlLoadSchedule().days['2026-09-28'].hp;
    t.eq(day28.filter((p) => p[0] === 'Elmer')[0][1], '1', 'neither candidate row was touched');
    t.eq(day28.filter((p) => p[0] === 'Elmer G')[0][1], '1', 'neither candidate row was touched');
  },
};
