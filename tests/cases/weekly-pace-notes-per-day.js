/* Weekly Labor Pace day-cards, "Opcion B" redesign: cards default to
   compact (Actual/vs Budget/Variance pill) so all 7 days fit on screen at
   once — Carlos picked this over always-expanded cards (his "Opcion A"),
   which only left room for 2-3 days before needing to scroll. Tapping a
   card (toggleWPCard) expands it in place to the Unifocus-report-style
   detail rows (Actual/Standard/Var (h)/Var (%)) plus the Explanation
   (the note). Days with a note get a soft gold background even while
   collapsed, so they stand out while scanning the strip during the
   meeting — that's the whole point of the highlight, so it has to survive
   collapse, not just show once a card is opened.

   Three things this guards:
   1) The notes shown here are the EXACT SAME data as the By Position daily
      notes (getVarianceNote/saveVarianceNote, keyed by ds+pos) — this is a
      second place to read/write them, not a parallel note store that could
      drift out of sync. A note saved from Weekly Pace must be readable from
      By Position and vice versa.
   2) TWO independent expand states, both keyed by pos+ds (not pos alone —
      see [[labor-tracker-v6-64-name-parsing]] for why per-day keys matter
      whenever multiple days of the same position are on screen together):
      wpCardOpen controls whether the detail rows are visible at all;
      wpNoteExpanded (nested inside an open card) controls whether the
      Explanation is showing read-only text or an editable textarea.
      Opening one day's card, or one day's note editor, must not affect any
      other day for that same position.
   3) The gold "has a note" highlight is driven by the note's own presence,
      not by which state a card happens to be in. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace day-cards start compact and expand per day to the same note store as By Position",
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

    // ── Default render: both days compact, no detail table, no note area,
    // no gold highlight (neither day has a note yet). ──
    let pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    t.assert(!/agregar nota/.test(pace), 'no card is expanded by default, so "+ agregar nota" is not visible yet');
    t.assert(!/wpNoteInput_/.test(pace), 'no editor is open until a day is tapped');
    t.assert(!/Explanation/.test(pace), 'the labeled detail rows are not rendered until a card is expanded');
    t.assert(!/var\(--gt\)/.test(pace), 'neither day has a note yet, so no gold highlight');

    // ── Writing a note directly through the underlying store (as By
    // Position's UI would) shows up as a gold-highlighted compact card,
    // even before that card is ever expanded. ──
    win.saveVarianceNote('2026-07-11', 'Turndown Attendant', 'Cubri un call-off, 6h extra.');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const tdIdx = pace.indexOf('>Turndown</div>');
    t.assert(tdIdx !== -1, 'Turndown position block found');
    let tdBlock = pace.slice(tdIdx, tdIdx + 3000);
    t.assert(/var\(--gt\)/.test(tdBlock), 'Jul 11 (which now has a note) gets the gold highlight while still collapsed');
    t.assert(!/Cubri un call-off/.test(tdBlock), "the note text itself is not shown until the card is expanded — collapsed only signals THAT a note exists");

    // ── Expanding Jul 11's card must NOT expand Jul 12's — the bug a
    // pos-only key would cause. ──
    win.toggleWPCard('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    tdBlock = pace.slice(pace.indexOf('>Turndown</div>'), pace.indexOf('>Turndown</div>') + 3000);
    t.assert(/Explanation/.test(tdBlock), 'expanding Jul 11 reveals the labeled detail rows');
    t.assert(/Cubri un call-off, 6h extra\./.test(tdBlock), "the note saved via By Position's own store reads back here, once Jul 11 is expanded");
    t.assert(!/wpNoteInput_/.test(pace), 'expanding to VIEW the note does not itself open the edit textarea');

    // ── Tapping the note text opens the textarea for Jul 11 only. ──
    win.toggleWPNote('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const inputMatch = pace.match(/id="(wpNoteInput_2026-07-11_TurndownAttendant)"/);
    t.assert(inputMatch, 'Jul 11 editor id matches the expected ds+pos pattern');
    t.assert(!/wpNoteInput_2026-07-12_TurndownAttendant/.test(pace), "Jul 12's editor did NOT open just because Jul 11's did");

    // ── Saving from the Weekly Pace editor updates the SAME underlying
    // note By Position reads, and collapses just the editor (the card
    // stays expanded so the saved text is visible right away).
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
    t.eq(win.wpCardOpen['Turndown Attendant|2026-07-11'], true, 'Save leaves the day-card itself expanded');

    // ── Deleting clears the note and collapses the editor too. ──
    win.saveVarianceNote('2026-07-12', 'Turndown Attendant', 'Nota temporal.');
    win.toggleWPCard('Turndown Attendant', '2026-07-12');
    win.toggleWPNote('Turndown Attendant', '2026-07-12');
    win.deleteWPNote('Turndown Attendant', '2026-07-12');
    t.eq(win.getVarianceNote('2026-07-12', 'Turndown Attendant'), '', 'Delete clears the note for that specific day');
    t.eq(win.wpNoteExpanded['Turndown Attendant|2026-07-12'], false, 'Delete also collapses that day\'s editor');

    // Jul 11's note (and its expand state) must be untouched by anything
    // done to Jul 12 above — proves the two days are genuinely independent.
    t.eq(win.getVarianceNote('2026-07-11', 'Turndown Attendant'), 'Actualizado: tambien entrene a alguien nuevo.', "Jul 11's note survives Jul 12's delete untouched");
    t.eq(win.wpCardOpen['Turndown Attendant|2026-07-11'], true, "Jul 11's card stays expanded, unaffected by Jul 12's collapse");
  }
};
