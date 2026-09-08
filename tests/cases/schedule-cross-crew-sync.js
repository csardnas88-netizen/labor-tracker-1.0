/* Carlos's ask, 2026-09-07: generalizes the Gabriela Cuevas/Sandra S kind
   of pairing (a fixed SCHED_LINKED_PEOPLE list he'd otherwise have to grow
   one person at a time) to EVERY employee who's added to more than one
   crew — "aplicaría a todos los empleados que están en el horario."
   Whoever's actually working wins, and every other crew she's in shows
   that crew's own label (SCHED_CREW_AWAY_LABEL) instead of a plain '1'.

   schedApplyCrossCrewSyncForDate deliberately EXCLUDES anyone already
   covered by a more specific, already-tuned mechanism (SCHED_LINKED_PEOPLE,
   SCHED_COVER_CHAINS, Sarahi/Andrea's direct mirror), so this generic pass
   can never fight one of those over the same cell — the whole reason two
   earlier regressions (Karla Varela's borrowed Laundry row, Andrea's
   Sarahi-driven Turndown relabel) showed up while building this and had
   to be excluded explicitly. Also excludes any row tagged 'added'
   (schedAddPerson's deliberate BORROW) entirely — "borrowing is not a
   transfer," she can genuinely work both crews the same day. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedApplyCrossCrewSyncForDate: generic same-person cross-crew reconciliation for every employee, not just a fixed pairs list (Carlos\'s 2026-09-07 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const ds = '2026-09-19';

    // ── Basic sync: an employee added to both Supervisors and Houseman.
    // Editing one crew's cell to '1' relabels the other to that crew's
    // own away-label instead of leaving a plain '1' (double-booked look). ──
    const SCH1 = { days: { [ds]: { sup: [['Elsa', '1']], hp: [['Elsa', '']] } } };
    t.assert(!win.schedApplyCrossCrewSyncForDate(SCH1, ds, { crew: 'sup', name: 'Elsa' }),
      'no change reported — a blank cell in the other crew is left alone, not relabeled');
    t.eq(SCH1.days[ds].hp[0][1], '', "a BLANK cell in the other crew is left alone — blank means not scheduled there that day, not ambiguous");

    const SCH2 = { days: { [ds]: { sup: [['Elsa', '1']], hp: [['Elsa', '1']] } } };
    win.schedApplyCrossCrewSyncForDate(SCH2, ds, { crew: 'sup', name: 'Elsa' });
    t.eq(SCH2.days[ds].hp[0][1], 'SUPERVISOR', "a plain '1' left over in the other crew IS relabeled — she reads as working Supervisors, not double-booked on Houseman");

    // ── Absence propagates across every crew she's in, unconditionally
    // (same as SCHED_LINKED_PEOPLE) — she can't be resting on one and
    // working (or PM/covering) on another. ──
    const SCH3 = { days: { [ds]: { sup: [['Elsa', 'R-OFF']], hp: [['Elsa', '1']] } } };
    win.schedApplyCrossCrewSyncForDate(SCH3, ds, { crew: 'sup', name: 'Elsa' });
    t.eq(SCH3.days[ds].hp[0][1], 'R-OFF', "an R-OFF on one crew overwrites even a real working '1' on the other — the exact absence text carries across");

    // A deliberate different value (PM, a cover label already set by
    // something else) is left exactly as is — only a plain '1' is replaced.
    const SCH4 = { days: { [ds]: { sup: [['Elsa', '1']], hp: [['Elsa', 'HOUSEMAN']] } } };
    t.assert(!win.schedApplyCrossCrewSyncForDate(SCH4, ds, { crew: 'sup', name: 'Elsa' }),
      "no change reported — Houseman already correctly reads its own away-label 'HOUSEMAN', nothing to fix");
    t.eq(SCH4.days[ds].hp[0][1], 'HOUSEMAN', 'confirmed untouched');

    // ── Reverse direction: editing the cell DIRECTLY to the other crew's
    // own label (the way a cover-chain or a manual note would) redirects
    // the source to that crew instead of treating the edited crew as
    // authoritative — same fix schedApplyLinkedPeopleForDate needed for
    // Gabriela Cuevas's cover-chain label. Without this, editing 'sup' to
    // 'HOUSEMAN' would wrongly stamp 'SUPERVISOR' over Houseman's real '1'. ──
    const SCH5 = { days: { [ds]: { sup: [['Elsa', 'HOUSEMAN']], hp: [['Elsa', '1']] } } };
    t.assert(!win.schedApplyCrossCrewSyncForDate(SCH5, ds, { crew: 'sup', name: 'Elsa' }),
      "no change — Houseman's real '1' is correctly recognized as authoritative once Supervisors reads Houseman's own label");
    t.eq(SCH5.days[ds].hp[0][1], '1', "Houseman's real working '1' survives untouched, not stomped to 'SUPERVISOR'");

    // ── A row tagged 'added' (schedAddPerson's deliberate borrow) is
    // excluded entirely — she can genuinely work both crews the same day,
    // "borrowing is not a transfer." Carlos's real regression while
    // building this: Karla Varela borrowed onto Laundry kept her Room
    // Attendant day untouched by the Laundry edit. ──
    const SCH6 = { days: { [ds]: { gra: [['Karla Varela', '1']], laundry: [['Karla Varela', '1', 'added']] } } };
    t.assert(!win.schedApplyCrossCrewSyncForDate(SCH6, ds, { crew: 'laundry', name: 'Karla Varela' }),
      'no change at all — a borrowed row never participates in cross-crew reconciliation');
    t.eq(SCH6.days[ds].gra[0][1], '1', 'her real Room Attendant day is untouched');
    t.eq(SCH6.days[ds].laundry[0][1], '1', 'and her borrowed Laundry day is untouched too');

    // ── Anyone already in SCHED_LINKED_PEOPLE, SCHED_COVER_CHAINS, or the
    // Sarahi/Andrea direct mirror is excluded entirely, so this generic
    // pass can never fight those already-tuned mechanisms. ──
    t.assert(!win.schedApplyCrossCrewSyncForDate(
      { days: { [ds]: { gra: [['Gabriela Cuevas', '1']], sup: [['Gabriela Cuevas', '1']] } } }, ds, { crew: 'gra', name: 'Gabriela Cuevas' }),
      'Gabriela Cuevas is skipped — her Room Attendant/Lobby pairing is already handled by SCHED_LINKED_PEOPLE');
    t.assert(!win.schedApplyCrossCrewSyncForDate(
      { days: { [ds]: { laundry: [['Jorge Gonzalez', '1']], sup: [['Jorge Gonzalez', '1']] } } }, ds, { crew: 'laundry', name: 'Jorge Gonzalez' }),
      'Jorge Gonzalez is skipped — already in the SCHED_COVER_CHAINS laundry chain');
    t.assert(!win.schedApplyCrossCrewSyncForDate(
      { days: { [ds]: { lobby: [['Andrea', '1']], sup: [['Andrea', '1']] } } }, ds, { crew: 'lobby', name: 'Andrea' }),
      "Andrea is skipped — her Turndown/Lobby cover already has its own dedicated mirror (schedApplyLobbyMirror)");

    // ── With no edited context (Auto-fill, a full render self-heal), a
    // day already saved with both crews on a plain '1' still repairs
    // itself, deterministically — the first crew in SCHED_BLOCKS order
    // (laundry, before sup) wins. ──
    const SCH7 = { days: { [ds]: { laundry: [['Marisol', '1']], sup: [['Marisol', '1']] } } };
    t.assert(win.schedApplyCrossCrewSyncForDate(SCH7, ds), 'a render-time pass with no edit behind it still reports the relabel');
    t.eq(SCH7.days[ds].sup[0][1], 'LAUNDRY', "Laundry (earlier in SCHED_BLOCKS order) wins, Supervisors relabels to LAUNDRY");
    t.assert(!win.schedApplyCrossCrewSyncForDate(SCH7, ds), 'and a second pass reports no change, so it settles instead of re-saving forever');

    // Only one crew that day (no second row at all) is a no-op.
    t.assert(!win.schedApplyCrossCrewSyncForDate({ days: { [ds]: { sup: [['Solo Person', '1']] } } }, ds),
      'an employee on only one crew that day has nothing to reconcile');

    // ── End-to-end through the real edit path: schedSetCell on a brand
    // new employee added to two crews, exactly what Carlos described. ──
    win.localStorage.removeItem('hk_dl_schedule');
    const dates = win.schedWeekDates();
    const SCHLive = { days: {} };
    dates.forEach((d) => { SCHLive.days[d] = { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Nueva Empleada', '']], laundry: [['Nueva Empleada', '']] }; });
    win.dlSaveSchedule(SCHLive);
    win.schedSetCell('laundry', 0, 'Nueva Empleada', dates[0], '1', null);
    const afterLive = win.dlLoadSchedule();
    t.eq(afterLive.days[dates[0]].laundry[0][1], '1', 'her real Laundry edit sticks');
    t.eq(afterLive.days[dates[0]].gra[0][1], '', "her still-blank Room Attendant row for that day is left alone — she isn't scheduled there that day at all");

    // Now give her a stale plain '1' on Room Attendant too (as if left
    // over from before this feature, or a Fill Week copy) and edit
    // Laundry again — it should relabel live, no Auto-fill needed.
    win.schedSetCell('gra', 0, 'Nueva Empleada', dates[1], '1', null);
    win.schedSetCell('laundry', 0, 'Nueva Empleada', dates[1], '1', null);
    const afterLive2 = win.dlLoadSchedule();
    t.eq(afterLive2.days[dates[1]].laundry[0][1], '1', 'Laundry stays 1, the crew she just edited');
    t.eq(afterLive2.days[dates[1]].gra[0][1], 'LAUNDRY', "Room Attendant relabels to LAUNDRY live, the same moment, no Auto-fill run needed");

    // ── Carlos's real report, 2026-09-07 (the Sandra S bug, generalized
    // to any employee): on THREE crews at once, an unrelated genuine
    // absence on one crew must never outrank a real cover-chain label on
    // another. Before this fix, absence-priority picked Laundry's OFF
    // first (order-earlier in SCHED_BLOCKS) and cascaded it onto Room
    // Attendant, destroying a real 'LOBBY' cover assignment. The redirect
    // scan now runs BEFORE the absence fallback, so the crew she's
    // actually named in always wins. ──
    const SCH8 = { days: { [ds]: { gra: [['Otra Persona', 'LOBBY']], lobby: [['Otra Persona', '1']], laundry: [['Otra Persona', 'OFF']] } } };
    t.assert(win.schedApplyCrossCrewSyncForDate(SCH8, ds), 'reports a change — Laundry\'s stale OFF releases');
    t.eq(SCH8.days[ds].gra[0][1], 'LOBBY', "her real Lobby cover assignment on Room Attendant survives — this was the reported bug, it was getting stomped by Laundry's unrelated OFF");
    t.eq(SCH8.days[ds].lobby[0][1], '1', 'her real Lobby row stays a plain 1');
    t.eq(SCH8.days[ds].laundry[0][1], 'LOBBY', "her stale Laundry OFF releases to LOBBY too — she's confirmed working Lobby today, so an OFF elsewhere is stale leftover data, not a separate deliberate fact (same 'absence always cascades' rule every other pair already uses)");
  },
};
