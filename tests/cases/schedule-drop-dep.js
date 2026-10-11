/* Carlos's real ask, 2026-10-11: some days Opera shows more real
   departures than he can actually clean — not enough staff — so he
   deliberately leaves a known number of rooms for the next day.

   First version of this feature only touched Departures and only
   showed a tiny note under the box — Carlos tried it and reported back
   the SAME day: he wasn't seeing either number actually move. His own
   worked example, using his real screenshot's numbers (Oct 17-23 2026,
   Sunday 10/18 reading 229 OCC / 192 Departures): dropping 20 rooms
   makes Sunday effectively run 209 OCC / 172 Departures, and Monday
   (103 OCC / 38 Departures) effectively run 20 HIGHER on BOTH —
   123 OCC / 58 Departures. A dropped departure is still one of that
   day's OCC rooms going untouched, and it's still owed as a
   departure-type clean tomorrow — ONE number moves one block of rooms
   forward on both fronts, not two independent drops the way Daily
   Lineup's fuller OCC-drop/Departures-drop keeps them.

   Three things this has to do, all load-bearing:
   (1) REAL — schedAutoNeed (which decides how many Supervisors/House
       Attendants/Room Attendants Auto-fill schedules) reads the
       EFFECTIVE OCC and Departures, not the raw boxes, for BOTH the
       dropping day and the receiving day.
   (2) VISUAL — both the dropping day and the receiving day show their
       own bold effective OCC number AND effective Departures number
       right on screen, not just a small note describing the delta —
       so another manager comparing the Schedule Draft to Opera has the
       actual number, not just an explanation of why it's different.
   (3) The raw boxes themselves (what Carlos actually typed, or what
       came from Opera/R106) are NEVER overwritten by a drop — only the
       computed effective figure moves. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const OCC = { '2026-10-17': 237, '2026-10-18': 229, '2026-10-19': 103, '2026-10-20': 215, '2026-10-21': 236, '2026-10-22': 216, '2026-10-23': 98 };
const DEP = { '2026-10-17': 46, '2026-10-18': 192, '2026-10-19': 38, '2026-10-20': 66, '2026-10-21': 77, '2026-10-22': 155, '2026-10-23': 65 };

module.exports = {
  name: "Schedule Draft: Drop to Tomorrow is ONE shared number that adjusts the EFFECTIVE OCC *and* Departures Auto-fill's headcount math uses, shown as its own bold figure on both the dropping and receiving day, without touching either raw Opera-sourced box (Carlos's 2026-10-11 ask, corrected same day)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const days = {};
    DATES.forEach((ds) => { days[ds] = { sheet: 'test', occ: String(OCC[ds]), dep: String(DEP[ds]), tdOcc: '', gra: [['Mayra', '1']], sup: [['Rosa', '1']] }; });
    win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
    win.schedViewWeekStart = new Date(2026, 9, 17);
    win.renderSchedule();

    // ── Before any drop: effective == raw on both fronts ──
    let eff = win.schedEffectiveDay(win.dlLoadSchedule(), '2026-10-18');
    t.eq(eff.occBase, 229, "sanity: Sunday's raw OCC box");
    t.eq(eff.depBase, 192, "sanity: Sunday's raw Departures box");
    t.eq(eff.drop, 0, 'no drop yet');
    t.eq(eff.recv, 0, 'Saturday never dropped anything, so Sunday receives nothing');
    t.eq(eff.occ, 229, 'with nothing dropped or received, effective OCC equals the raw box');
    t.eq(eff.dep, 192, 'with nothing dropped or received, effective Departures equals the raw box');

    // ── Carlos's own worked example: drop 20 rooms from Sunday ──
    win.schedSetDrop('2026-10-18', '20');
    const afterDrop = win.dlLoadSchedule();
    t.eq(afterDrop.days['2026-10-18'].drop, 20, 'the drop is saved on the day it was dropped FROM');
    t.eq(afterDrop.days['2026-10-18'].occ, '229', "the raw OCC box is NEVER touched by a drop — it must keep matching Opera exactly");
    t.eq(afterDrop.days['2026-10-18'].dep, '192', "the raw Departures box is NEVER touched by a drop either");
    t.eq(afterDrop.days['2026-10-19'].occ, '103', "Monday's own raw boxes are untouched too — only the EFFECTIVE figures move");
    t.eq(afterDrop.days['2026-10-19'].dep, '38', "same for Monday's raw Departures box");

    eff = win.schedEffectiveDay(afterDrop, '2026-10-18');
    t.eq(eff.occ, 209, "Sunday's effective OCC: 229 - 20 dropped = 209, exactly Carlos's own worked example");
    t.eq(eff.dep, 172, "Sunday's effective Departures: 192 - 20 dropped = 172, exactly Carlos's own worked example");
    const effMon = win.schedEffectiveDay(afterDrop, '2026-10-19');
    t.eq(effMon.recv, 20, "Monday automatically RECEIVES exactly what Sunday dropped — no separate box to keep in sync");
    t.eq(effMon.occ, 123, "Monday's effective OCC: 103 + 20 received = 123, exactly Carlos's own worked example");
    t.eq(effMon.dep, 58, "Monday's effective Departures: 38 + 20 received = 58, exactly Carlos's own worked example");

    // ── schedAutoNeed (Auto-fill's own headcount math) uses the
    // EFFECTIVE figures on BOTH fronts, not the raw boxes ──
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-18', 'sup'), win.schedSupHpNeeded(172), "Sunday's Supervisor/House Attendant need uses effective Departures (172), not raw (192)");
    t.assert(win.schedAutoNeed(afterDrop, '2026-10-18', 'sup') <= win.schedSupHpNeeded(192), 'never MORE than the raw 192 would have required, since the day is being lightened');
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-19', 'sup'), win.schedSupHpNeeded(58), "Monday's Supervisor/House Attendant need uses effective Departures (58), not raw (38)");
    t.assert(win.schedAutoNeed(afterDrop, '2026-10-19', 'sup') >= win.schedSupHpNeeded(38), 'never LESS than the raw 38 would have required, since Monday absorbs the backlog');
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-18', 'gra'), win.schedRaNeeded(209, 172), "Room Attendant need on Sunday uses BOTH effective figures (209 rooms, 172 departures), not either raw box");
    t.eq(win.schedAutoNeed(afterDrop, '2026-10-19', 'gra'), win.schedRaNeeded(123, 58), "Room Attendant need on Monday uses both effective figures too (123 rooms, 58 departures)");

    // ── Visual: both OCC and Departures show their own bold effective
    // number on BOTH days, not a bare delta note ──
    const html = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(/>209</.test(html), "Sunday's effective OCC (209) is shown as its own figure");
    t.assert(/>172</.test(html), "Sunday's effective Departures (172) is shown as its own figure");
    t.assert(/>123</.test(html), "Monday's effective OCC (123) is shown as its own figure");
    t.assert(/>58</.test(html), "Monday's effective Departures (58) is shown as its own figure");

    // ── Carlos's real follow-up report, 2026-10-11: the Supervisors/
    // Houseman/Room Attendant crew cards further down the page (their
    // own "Departures" mirror row, "departures each"/"rooms each"
    // ratios, and Unifocus std OVER/UNDER label) kept showing the raw,
    // un-adjusted numbers — a drop that visibly changed the top card
    // did nothing down here. Every one of those now has to agree with
    // the same effective figures, proven by comparing against calling
    // the same functions on a schedule where the raw boxes themselves
    // were set to the effective numbers directly (no drop involved) —
    // if drop-adjusted and manually-typed give the same answer, the
    // wiring is correct, with no need to hand-derive the Unifocus
    // formula's own internals in this test. ──
    const manualDays = {};
    DATES.forEach((ds) => { manualDays[ds] = { sheet: 'test', occ: String(OCC[ds]), dep: String(DEP[ds]), tdOcc: '', gra: [['Mayra', '1']], sup: [['Rosa', '1']] }; });
    manualDays['2026-10-18'] = { ...manualDays['2026-10-18'], occ: '209', dep: '172' };
    manualDays['2026-10-19'] = { ...manualDays['2026-10-19'], occ: '123', dep: '58' };
    const manualSch = { days: manualDays, count: 7, savedAt: new Date().toISOString() };

    t.eq(win.schedUfExpected(afterDrop, 'Housekeeping Supervisor', '2026-10-18'), win.schedUfExpected(manualSch, 'Housekeeping Supervisor', '2026-10-18'),
      "Supervisors' Unifocus std on Sunday (what drives the crew card's OVER/UNDER label) matches typing 172 effective departures directly, not the raw 192");
    t.eq(win.schedUfExpected(afterDrop, 'Housekeeping Supervisor', '2026-10-19'), win.schedUfExpected(manualSch, 'Housekeeping Supervisor', '2026-10-19'),
      "same for Monday — matches typing 58 effective departures directly, not the raw 38");

    // Houseman (hp, AM shift of House Attendant) uses schedUfExpectedForShift.
    t.eq(win.schedUfExpectedForShift(afterDrop, 'House Attendant', 0, '2026-10-18'), win.schedUfExpectedForShift(manualSch, 'House Attendant', 0, '2026-10-18'),
      "Houseman's Unifocus std on Sunday also matches the effective (172), not the raw (192) departures");

    // The crew card's own HTML must carry the same adjusted number too —
    // the "Departures" mirror row right under each crew card's title,
    // and the "departures each"/"rooms each" ratio row underneath it.
    win.schedViewWeekStart = new Date(2026, 9, 17); // re-render after the schedUfExpected calls above read a DIFFERENT SCH object, not the live one
    win.renderSchedule();
    const html2 = win.document.getElementById('scheduleContent').innerHTML;
    const supIdx = html2.indexOf('>Supervisors<');
    t.assert(supIdx !== -1, 'the Supervisors crew card is on the page');
    const supCard = html2.slice(supIdx, supIdx + 3000);
    t.assert(/>172</.test(supCard), "Supervisors' own Departures mirror row shows Sunday's effective 172, not the raw 192");
    t.assert(/>58</.test(supCard), "Supervisors' own Departures mirror row shows Monday's effective 58, not the raw 38");

    // ── Clearing the drop removes the adjustment on both fronts, both days ──
    win.schedSetDrop('2026-10-18', '');
    const cleared = win.dlLoadSchedule();
    t.assert(!('drop' in cleared.days['2026-10-18']), 'an empty value clears the stored drop entirely, not just zeroes it');
    t.eq(win.schedEffectiveDay(cleared, '2026-10-18').occ, 229, "Sunday's effective OCC reverts to the raw 229");
    t.eq(win.schedEffectiveDay(cleared, '2026-10-18').dep, 192, "Sunday's effective Departures reverts to the raw 192");
    t.eq(win.schedEffectiveDay(cleared, '2026-10-19').occ, 103, "Monday stops receiving anything on OCC once the drop is cleared");
    t.eq(win.schedEffectiveDay(cleared, '2026-10-19').dep, 38, "Monday stops receiving anything on Departures once the drop is cleared");

    // ── A negative number is rejected outright, same guard as every
    // other numeric Schedule field ──
    win.schedSetDrop('2026-10-18', '40');
    win.schedSetDrop('2026-10-18', '-5');
    t.eq(win.dlLoadSchedule().days['2026-10-18'].drop, 40, 'a negative value is rejected — the last valid drop (40) survives untouched');
  },
};
