/* Carlos's real ask, 2026-10-11: some days Opera shows more real
   departures than he can actually clean — not enough staff — so he
   deliberately leaves a known number of them for the next day. Modeled
   on Daily Lineup's own drop/received mechanic (dlBuildPlan), but just
   the drop half: Carlos only asked to be able to say "I'm leaving N for
   tomorrow," not to hand-correct how much of that actually carried over.

   Two things this has to do, both load-bearing:
   (1) VISUAL — a day he drops into, and the day right after that
       receives, both show a small note explaining why their effective
       Departures differs from the raw box (which still matches Opera
       exactly, untouched) — so another manager comparing the two
       numbers has the answer right there instead of asking Carlos.
   (2) REAL — schedAutoNeed (which decides how many Supervisors/House
       Attendants/Room Attendants Auto-fill schedules) now reads the
       EFFECTIVE departures, not the raw box, so a day he's intentionally
       lightening doesn't also get overstaffed, and the day he pushed the
       backlog into gets properly staffed for the extra load.

   Fixture week mirrors Carlos's own real screenshot (Oct 17-23 2026):
   Sunday 10/18 is the real day he can't clean all 192 departures. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const OCC = { '2026-10-17': 237, '2026-10-18': 229, '2026-10-19': 103, '2026-10-20': 215, '2026-10-21': 236, '2026-10-22': 216, '2026-10-23': 98 };
const DEP = { '2026-10-17': 46, '2026-10-18': 192, '2026-10-19': 38, '2026-10-20': 66, '2026-10-21': 77, '2026-10-22': 155, '2026-10-23': 65 };

module.exports = {
  name: "Schedule Draft: Drop to Tomorrow adjusts the EFFECTIVE Departures that Auto-fill's headcount math uses, without touching the raw Opera-sourced box, and explains itself with a visible note on both the dropping and receiving day (Carlos's 2026-10-11 ask)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const days = {};
    DATES.forEach((ds) => { days[ds] = { sheet: 'test', occ: String(OCC[ds]), dep: String(DEP[ds]), tdOcc: '', gra: [['Mayra', '1']], sup: [['Rosa', '1']] }; });
    win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
    win.schedViewWeekStart = new Date(2026, 9, 17);
    win.renderSchedule();

    // ── Before any drop: effective == raw, Sunday's real Supervisor/HP
    // need is the "too many departures" number Carlos is actually facing. ──
    let eff = win.schedEffectiveDep(win.dlLoadSchedule(), '2026-10-18');
    t.eq(eff.depBase, 192, 'sanity: the raw box reads Opera\'s real 192');
    t.eq(eff.drop, 0, 'no drop yet');
    t.eq(eff.recv, 0, 'Saturday never dropped anything, so Sunday receives nothing');
    t.eq(eff.dep, 192, 'with nothing dropped or received, effective equals the raw box');
    t.eq(win.schedSupHpNeeded(192), 5, 'sanity check on the needs formula itself: 192 departures needs 5 Supervisors/House Attendants');

    // ── Carlos drops 100 of Sunday's departures to Monday ──
    win.schedSetDropDep('2026-10-18', '100');
    const afterDrop = win.dlLoadSchedule();
    t.eq(afterDrop.days['2026-10-18'].dropDep, 100, 'the drop is saved on the day it was dropped FROM');
    t.eq(afterDrop.days['2026-10-18'].dep, '192', "the raw Departures box is NEVER touched by a drop — it must keep matching Opera exactly");
    t.eq(afterDrop.days['2026-10-19'].dep, '38', "Monday's own raw box is untouched too — only the EFFECTIVE figure moves, not the stored boxes");

    eff = win.schedEffectiveDep(afterDrop, '2026-10-18');
    t.eq(eff.dep, 92, "Sunday's effective departures: 192 - 100 dropped = 92");
    const effMon = win.schedEffectiveDep(afterDrop, '2026-10-19');
    t.eq(effMon.recv, 100, "Monday automatically RECEIVES exactly what Sunday dropped — no separate box to keep in sync");
    t.eq(effMon.dep, 138, "Monday's effective departures: 38 raw + 100 received = 138");

    // ── schedAutoNeed (Auto-fill's own headcount math) uses the EFFECTIVE
    // number, not the raw box — this is the whole point, not just a note. ──
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-18', 'sup'), win.schedSupHpNeeded(92), "Sunday needs fewer Supervisors/House Attendants once lightened (92 effective, not 192 raw)");
    t.assert(win.schedAutoNeed(afterDrop, '2026-10-18', 'sup') < win.schedSupHpNeeded(192), 'concretely fewer than the raw 192 would have required');
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-19', 'sup'), win.schedSupHpNeeded(138), "Monday needs MORE Supervisors/House Attendants to handle the carried-over backlog (138 effective, not 38 raw)");
    t.assert(win.schedAutoNeed(afterDrop, '2026-10-19', 'sup') > win.schedSupHpNeeded(38), 'concretely more than the raw 38 would have required');
    // Room Attendants also take dueouts as an input (schedRaNeeded), so
    // their need shifts the same direction for the same reason.
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-18', 'gra'), win.schedRaNeeded(229, 92), "Room Attendant need on Sunday (229 rooms) also uses the effective departures (92), not the raw (192)");

    // ── Visual explanation: both days show a note, each pointing at the
    // other and at the real effective number, not just a bare figure. ──
    const html = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/100[\s\S]{0,20}to tomorrow/.test(html), "Sunday's box shows it dropped 100 to tomorrow");
    t.assert(/100[\s\S]{0,20}from Sun/.test(html), "Monday's box shows it received 100 from Sunday — the actual explanation a manager needs");

    // ── Clearing the drop removes the adjustment on both days ──
    win.schedSetDropDep('2026-10-18', '');
    const cleared = win.dlLoadSchedule();
    t.assert(!('dropDep' in cleared.days['2026-10-18']), 'an empty value clears the stored drop entirely, not just zeroes it');
    t.eq(win.schedEffectiveDep(cleared, '2026-10-18').dep, 192, "Sunday's effective departures reverts to the raw 192");
    t.eq(win.schedEffectiveDep(cleared, '2026-10-19').dep, 38, "Monday stops receiving anything once the drop is cleared");

    // ── A negative number is rejected outright, same guard as every
    // other numeric Schedule field ──
    win.schedSetDropDep('2026-10-18', '40');
    win.schedSetDropDep('2026-10-18', '-5');
    t.eq(win.dlLoadSchedule().days['2026-10-18'].dropDep, 40, 'a negative value is rejected — the last valid drop (40) survives untouched');
  },
};
