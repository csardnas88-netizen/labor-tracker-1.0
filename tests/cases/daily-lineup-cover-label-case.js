/* Found 2026-11-05 by audit. The Daily Lineup reads three "someone from
   another crew is covering here today" marks, and all three compared the
   cell with a raw === against an upper-case literal:

     a Room Attendant covering Houseman   (gra cell 'HOUSEMAN')
     a Turndown attendant covering PM Houseman (td cell 'HOUSEMAN')
     a Room Attendant covering Lobby AM   (gra cell 'LOBBY')

   Everywhere else in the schedule compares these through schedStatusIs,
   which trims and upper-cases first. The workbook import trims cell
   values but does NOT upper-case them, so a label typed in Excel as
   "Houseman" or "Lobby" rather than "HOUSEMAN"/"LOBBY" matched nothing
   and the covering person simply never appeared on the printed lineup —
   with no warning, because an empty slot looks the same as a slot nobody
   was assigned to. The lineup has already lost a whole Houseman block to
   a case-sensitive match once before (7.39.0), which is what made this
   worth hunting for rather than assuming it was fine. */
const { loadApp, fakeSession } = require('../_harness');

const DS = '2026-11-05';

const SECTIONS = {
  gra: { '2nd': 'Ada' },
  gra_floaters: [],
  hm: [['2nd - 5th', 'Mauricia'], ['6th - 9th', 'Elmer']],
  hm_float: '',
  hm_pm: '',
  sup: [['2nd - 5th', 'Rubidia']],
  sup_pm: '',
  lobby: [['Lobby AM', 'Marroquin']],
  td: [['Turn Down 2-5', 'Aura']],
};

// Julia (a Room Attendant) and Paty (Turndown) are both lent to Houseman,
// and Ada (Room Attendant) is lent to Lobby AM — each written in the
// casing a person would actually type into Excel.
function buildDay(win, casing) {
  win.dlSaveSchedule({
    days: {
      [DS]: {
        sheet: 't', occ: '150', dep: '60', tdOcc: '150',
        mgr: [], sup: [['Rubidia', '1']], laundry: [],
        lobby: [['Marroquin', '1']],
        td: [['Aura', '1'], ['Paty', casing]],
        gra: [['Ada', casing === 'HOUSEMAN' ? 'LOBBY' : 'Lobby'], ['Julia', casing]],
        hp: [['Mauricia', '1'], ['Elmer', '1']],
        pmhm: [], night: [],
      },
    },
    count: 1,
    savedAt: new Date().toISOString(),
  });
}

module.exports = {
  name: 'Daily Lineup: a cover mark typed in Excel as "Houseman"/"Lobby" counts the same as "HOUSEMAN"/"LOBBY" — a lower-case label used to drop the covering person off the printed lineup entirely',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));
    win.localStorage.setItem('hk_dl_sections', JSON.stringify(SECTIONS));

    // Baseline: the all-caps spelling the app's own picker writes.
    buildDay(win, 'HOUSEMAN');
    let P = win.dlBuildPlan(DS);
    t.assert(P, 'a plan builds');
    t.assert(P.hm.indexOf('Julia') !== -1, 'upper-case HOUSEMAN: the covering Room Attendant is on the lineup');
    t.assert(P.hm_pm.indexOf('Paty') !== -1, 'upper-case HOUSEMAN: the covering Turndown attendant lands on PM Houseman');
    t.assert(P.lobby_am.indexOf('Ada') !== -1, 'upper-case LOBBY: the covering Room Attendant is on Lobby AM');

    // The real-world spelling: typed by hand into the workbook.
    buildDay(win, 'Houseman');
    P = win.dlBuildPlan(DS);
    t.assert(P.hm.indexOf('Julia') !== -1,
      'mixed-case "Houseman" still puts the covering Room Attendant on the lineup: ' + JSON.stringify(P.hm));
    t.assert(P.hm_pm.indexOf('Paty') !== -1,
      'mixed-case "Houseman" still puts the covering Turndown attendant on PM Houseman: ' + JSON.stringify(P.hm_pm));
    t.assert(P.lobby_am.indexOf('Ada') !== -1,
      'mixed-case "Lobby" still puts the covering Room Attendant on Lobby AM: ' + JSON.stringify(P.lobby_am));

    // And the people genuinely rostered to Houseman are still there — the
    // relaxed match must not have swallowed or duplicated anyone.
    t.assert(P.hm.indexOf('Mauricia') !== -1 && P.hm.indexOf('Elmer') !== -1,
      'the regular House Attendants are unaffected: ' + JSON.stringify(P.hm));
    t.eq(P.hm.filter((n) => n === 'Julia').length, 1, 'the covering attendant appears exactly once, not twice');
  },
};
