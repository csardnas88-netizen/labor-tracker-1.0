/* Weekly Labor Pace v6.94.0 redesign, per Carlos's explicit mockup approval:
   one card per POSITION, then a horizontally-scrolling strip of DAY cards
   (Actual/Budget/Variance), with the labor-meeting note centered directly
   underneath that day's numbers — inside the same card, not in a separate
   list. His words: "que la nota estuviera inmediatamente debajo del dia...
   centrada".

   Two things this guards:
   1) The notes shown here are the EXACT SAME data as the By Position daily
      notes (getVarianceNote/saveVarianceNote, keyed by ds+pos) — this is a
      second place to read/write them, not a parallel note store that could
      drift out of sync. A note saved from Weekly Pace must be readable from
      By Position and vice versa.
   2) The expand/collapse state is keyed by BOTH position AND date
      (wpNoteExpanded[pos+'|'+ds]), unlike By Position's varNoteExpanded
      (keyed by pos alone) — because Weekly Pace shows every reported day
      for a position on screen at once. If this were keyed by pos alone,
      opening one day's note editor would silently open/close every other
      day's editor for that same position too. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace shows a note card per day, sharing the same store as By Position's daily notes",
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

    // ── No notes yet: both days invite adding one, neither shows a textarea. ──
    let pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    t.assert(/agregar nota/.test(pace), 'a day with no note invites adding one');
    t.assert(!/wpNoteInput_/.test(pace), 'no editor is open until a day is tapped');

    // ── Writing a note directly through the underlying store (as By
    // Position's UI would) must show up here — same data, second window. ──
    win.saveVarianceNote('2026-07-11', 'Turndown Attendant', 'Cubri un call-off, 6h extra.');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const tdIdx = pace.indexOf('>Turndown</div>');
    t.assert(tdIdx !== -1, 'Turndown position block found');
    const tdBlock = pace.slice(tdIdx, tdIdx + 3000);
    t.assert(/Cubri un call-off, 6h extra\./.test(tdBlock), "the note saved via By Position's own store reads back here, under Jul 11's card");

    // ── Expanding Jul 11's editor via the Weekly Pace toggle must NOT open
    // Jul 12's editor too — the bug that a pos-only key would cause. ──
    win.toggleWPNote('Turndown Attendant', '2026-07-11');
    pace = win.buildWeeklyPaceHTML(win.loadMonthData('2026-07').days, 200, week);
    const inputMatch = pace.match(/id="(wpNoteInput_2026-07-11_TurndownAttendant)"/);
    t.assert(inputMatch, 'Jul 11 editor id matches the expected ds+pos pattern');
    t.assert(!/wpNoteInput_2026-07-12_TurndownAttendant/.test(pace), "Jul 12's editor did NOT open just because Jul 11's did — expand state is keyed by day, not just position");

    // ── Saving from the Weekly Pace editor updates the SAME underlying
    // note By Position reads, and collapses the editor without a second
    // click. buildWeeklyPaceHTML() is called directly above (deterministic,
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
    t.eq(win.wpNoteExpanded['Turndown Attendant|2026-07-11'], false, 'Save collapses this specific day\'s editor');

    // ── Deleting clears the note and collapses the editor too. ──
    win.saveVarianceNote('2026-07-12', 'Turndown Attendant', 'Nota temporal.');
    win.toggleWPNote('Turndown Attendant', '2026-07-12');
    win.deleteWPNote('Turndown Attendant', '2026-07-12');
    t.eq(win.getVarianceNote('2026-07-12', 'Turndown Attendant'), '', 'Delete clears the note for that specific day');
    t.eq(win.wpNoteExpanded['Turndown Attendant|2026-07-12'], false, 'Delete also collapses that day\'s editor');

    // Jul 11's note (and its collapsed state) must be untouched by anything
    // done to Jul 12 above — proves the two days are genuinely independent.
    t.eq(win.getVarianceNote('2026-07-11', 'Turndown Attendant'), 'Actualizado: tambien entrene a alguien nuevo.', "Jul 11's note survives Jul 12's delete untouched");
  }
};
