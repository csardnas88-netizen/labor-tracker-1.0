/* Weekly Labor Pace day-cards. Went through two rounds with Carlos:
   first "Opcion B" (compact by default, expand on tap) to fit all 7 days
   on screen at once, then a follow-up asking for the detail — Actual/
   Standard/Var (h)/Var (%)/Explanation — to show OPEN by default instead,
   with all app-facing text in English (the compact version briefly shipped
   with Spanish button/prompt text — "Guardar"/"Borrar"/"Cerrar"/"+ agregar
   nota" — inconsistent with the rest of the app, which is English
   throughout). toggleWPCard now COLLAPSES a card (the exception), not
   expands it.

   Three things this guards:
   1) These cards read and write the shared variance-note store
      (getVarianceNote/saveVarianceNote, keyed by ds+pos) rather than
      keeping notes of their own. That store predates them — it was built
      for the By Position table (removed in v6.97.0) and is the same data
      the sync layer pushes and merges — so a note written anywhere, by
      any surface or device, has to read back here unchanged.
   2) TWO independent expand states, both keyed by pos+ds (not pos alone —
      see [[labor-tracker-v6-64-name-parsing]] for why per-day keys matter
      whenever multiple days of the same position are on screen together):
      wpCardOpen controls whether the detail rows are visible at all (true
      unless explicitly collapsed — undefined/unset reads as OPEN, only an
      explicit false collapses it); wpNoteExpanded (nested inside an open
      card) controls whether the Explanation is showing read-only text or
      an editable textarea. Collapsing one day's card, or opening one
      day's note editor, must not affect any other day for that same
      position.
   3) The gold "has a note" highlight is driven by the note's own presence,
      not by which state a card happens to be in, and survives collapse. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace day-cards default to open, in English, reading and writing the shared variance-note store",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-11': { totalPaid: 100, byPosition: { 'Turndown Attendant': { paid: 30 } } },
          '2026-07-12': { totalPaid: 100, byPosition: { 'Turndown Attendant': { paid: 24 } } }
        },
        rooms: { '2026-07-10': 50, '2026-07-11': 200, '2026-07-12': 200 }
      }
    });
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('current');
    const week = { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) };

    // ── Default render: BOTH days are already open — the labeled detail
    // rows and an English "+ Note" prompt show without tapping anything. ──
    let pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    t.assert(/Explanation/.test(pace), 'day-cards show their detail rows by default, with no tap needed');
    t.assert(/>\+ Note</.test(pace), 'the no-note prompt reads "+ Note" in English');
    t.assert(!/agregar nota/.test(pace), 'no Spanish text ("agregar nota") leaks into the card');
    t.assert(!/wpNoteInput_/.test(pace), 'no editor is open until the note area itself is tapped');

    // ── A note written straight into the shared store — as a sync pull
    // from another device would — shows up immediately, gold-highlighted,
    // with the text visible since the card is already open. ──
    win.saveVarianceNote('2026-07-11', 'Turndown Attendant', 'Cubri un call-off, 6h extra.');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const tdIdx = pace.indexOf('>Turndown</div>');
    t.assert(tdIdx !== -1, 'Turndown position block found');
    let tdBlock = pace.slice(tdIdx, tdIdx + 3000);
    t.assert(/var\(--gt\)/.test(tdBlock), 'Jul 11 (which now has a note) gets the gold highlight');
    t.assert(/Cubri un call-off, 6h extra\./.test(tdBlock), 'a note written straight into the shared store reads back here, already visible without tapping');

    // ── Collapsing Jul 11's card must NOT collapse Jul 12's — the bug a
    // pos-only key would cause. ──
    win.toggleWPCard('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    tdBlock = pace.slice(pace.indexOf('>Turndown</div>'), pace.indexOf('>Turndown</div>') + 3000);
    t.assert(!/Cubri un call-off/.test(tdBlock.slice(0, tdBlock.indexOf('Sun'))), 'collapsing Jul 11 hides its detail rows (note text no longer shown before the Jul 12 card starts)');
    t.assert(/Explanation/.test(tdBlock), "Jul 12 stays open (its detail rows are still present)");
    t.eq(win.wpCardOpen['Turndown Attendant|2026-07-11'], false, "Jul 11's card is recorded as explicitly collapsed");
    t.eq(win.wpCardOpen['Turndown Attendant|2026-07-12'], undefined, "Jul 12 was never touched, so it's still just implicitly open (no stored value)");

    // Reopen Jul 11 for the rest of this test.
    win.toggleWPCard('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);

    // ── Tapping the note text opens the textarea for Jul 11 only. ──
    win.toggleWPNote('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const inputMatch = pace.match(/id="(wpNoteInput_2026-07-11_TurndownAttendant)"/);
    t.assert(inputMatch, 'Jul 11 editor id matches the expected ds+pos pattern');
    t.assert(!/wpNoteInput_2026-07-12_TurndownAttendant/.test(pace), "Jul 12's editor did NOT open just because Jul 11's did");

    // ── Saving from the Weekly Pace editor writes through to that same
    // shared store, and collapses just the editor (the card stays open so
    // the saved text is visible right away).
    // buildWeeklyPaceHTML() is called directly above (deterministic,
    // clock-independent — see [[labor-tracker-v6-64-name-parsing]]), so its
    // returned markup was never inserted into the page; drop it into a
    // scratch container so the textarea actually exists for
    // saveWPNoteFromInput's getElementById to find. ──
    const scratch = win.document.createElement('div');
    scratch.innerHTML = pace;
    win.document.body.appendChild(scratch);
    win.document.getElementById(inputMatch[1]).value = 'Actualizado: tambien entrene a alguien nuevo.';
    win.saveWPNoteFromInput('Turndown Attendant', '2026-07-11', inputMatch[1]);
    scratch.remove();
    t.eq(win.getVarianceNote('2026-07-11', 'Turndown Attendant'), 'Actualizado: tambien entrene a alguien nuevo.', 'saving from the Weekly Pace card writes through to the shared note store');
    t.eq(win.wpNoteExpanded['Turndown Attendant|2026-07-11'], false, 'Save collapses the editor');

    // ── Deleting clears the note and collapses the editor too. ──
    win.saveVarianceNote('2026-07-12', 'Turndown Attendant', 'Nota temporal.');
    win.toggleWPNote('Turndown Attendant', '2026-07-12');
    win.deleteWPNote('Turndown Attendant', '2026-07-12');
    t.eq(win.getVarianceNote('2026-07-12', 'Turndown Attendant'), '', 'Delete clears the note for that specific day');
    t.eq(win.wpNoteExpanded['Turndown Attendant|2026-07-12'], false, 'Delete also collapses that day\'s editor');

    // Jul 11's note must be untouched by anything done to Jul 12 above —
    // proves the two days are genuinely independent.
    t.eq(win.getVarianceNote('2026-07-11', 'Turndown Attendant'), 'Actualizado: tambien entrene a alguien nuevo.', "Jul 11's note survives Jul 12's delete untouched");
  }
};
