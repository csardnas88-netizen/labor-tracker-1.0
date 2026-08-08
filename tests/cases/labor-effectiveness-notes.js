/* Labor Effectiveness's Explanation notes — Carlos's ask, right after
   Overtime: a place to justify a position's weekly variance the same way
   Weekly Pace's day-cards already let him explain a single day. One note
   per position per WEEK (this section is a weekly total, not a
   day-by-day breakdown), stored under its own key
   (hk_laboreff_notes_<weekKey>) deliberately SEPARATE from the uploaded
   PDF record (hk_laboreff_<weekKey>).

   That separation is the whole point of this test file: the PDF record
   is replaced WHOLESALE on every (re-)upload (see
   labor-effectiveness-sync.js), so a note stored inside it would vanish
   the moment a corrected report comes in — the exact class of bug already
   fixed once for By Position's variance notes. This pins that a note
   survives a re-upload, and that the two keys' sync paths never collide
   even though hk_laboreff_notes_<week> starts with the literal string
   hk_laboreff_ that the PDF record's own key check matches on. */
const { loadApp, fakeSession } = require('../_harness');

function seedTurndownWeek() {
  return {
    'hk_rooms_migrated_v2': '1',
    'hk_month_2026-08': {
      days: {
        '2026-08-01': { totalPaid: 30.11, byPosition: { 'Turndown Attendant': { paid: 30.11, ot1: 0 } } },
        '2026-08-02': { totalPaid: 18.36, byPosition: { 'Turndown Attendant': { paid: 18.36, ot1: 0 } } },
        '2026-08-03': { totalPaid: 23.05, byPosition: { 'Turndown Attendant': { paid: 23.05, ot1: 0 } } }
      },
      rooms: { '2026-07-31': 124, '2026-08-01': 154, '2026-08-02': 114, '2026-08-03': 201 }
    }
  };
}

module.exports = {
  name: "Labor Effectiveness Explanation notes: save/read round-trip, survive a PDF re-upload, and share no storage with the PDF record",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedTurndownWeek());
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    // ── Default: no note yet, "+ Note" invites adding one, positioned
    // right after Overtime in reading order (no separate note UI floating
    // elsewhere on the row). ──
    let html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    let tdIdx = html.indexOf('>Turndown<');
    t.assert(tdIdx !== -1, 'Turndown row found');
    let tdBlock = html.slice(tdIdx, tdIdx + 2000);
    const explanationIdx = tdBlock.indexOf('Explanation');
    t.assert(explanationIdx !== -1, 'Explanation section renders for a position with no note yet');
    t.assert(/\+ Note/.test(tdBlock), 'invites adding a note');
    t.assert(!/wleNoteInput_/.test(tdBlock), 'no editor open until tapped');

    // ── Round trip: save via the underlying store, reads back on render. ──
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), '', 'no note stored yet reads back empty');
    win.saveWeeklyEffNote('2026-08-01', 'Turndown Attendant', 'Covered two call-offs this week — expect this to normalize once the roster is back to full strength.');
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Covered two call-offs this week — expect this to normalize once the roster is back to full strength.');

    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    // The gold background lives on the ROW'S OWN wrapper div, which opens
    // BEFORE the position label text — so the search window has to start
    // a little earlier than ">Turndown<" itself, or it misses the very
    // style attribute it's trying to check.
    tdIdx = html.lastIndexOf('border-top:1px solid var(--border);', html.indexOf('>Turndown<'));
    tdBlock = html.slice(tdIdx, tdIdx + 2000);
    t.assert(/Covered two call-offs this week/.test(tdBlock), 'the saved note shows on render');
    t.assert(/background:var\(--gt\)/.test(tdBlock), 'a position with a note gets the same soft gold highlight used elsewhere in this app for "has a note"');

    // ── Editing: tap opens the textarea pre-filled; Save writes through
    // and collapses the editor; Delete clears it. ──
    win.toggleWLENote('2026-08-01', 'Turndown Attendant');
    html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    // weekKey's dashes are stripped by the same [^a-zA-Z0-9] scrub as the
    // position name, so "2026-08-01" becomes "20260801" in the id.
    const inputMatch = html.match(/id="(wleNoteInput_20260801_TurndownAttendant)"/);
    t.assert(inputMatch, 'editor id follows the expected weekKey+pos pattern');

    const scratch = win.document.createElement('div');
    scratch.innerHTML = html;
    win.document.body.appendChild(scratch);
    win.document.getElementById(inputMatch[1]).value = 'Updated: also a training day mid-week.';
    win.saveWLENoteFromInput('2026-08-01', 'Turndown Attendant', inputMatch[1]);
    scratch.remove();
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Updated: also a training day mid-week.', 'saving from the textarea overwrites the note');
    t.eq(win.wleNoteExpanded['2026-08-01|Turndown Attendant'], false, 'Save collapses the editor');

    win.deleteWLENote('2026-08-01', 'Turndown Attendant');
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), '', 'Delete clears the note');

    // ── The critical guarantee: a note survives a Labor Effectiveness PDF
    // re-upload, which wholesale-replaces hk_laboreff_<weekKey> (see
    // labor-effectiveness-sync.js) — the note must live somewhere that
    // replacement never touches. ──
    win.saveWeeklyEffNote('2026-08-01', 'Turndown Attendant', 'Note that must survive a re-upload.');
    win.saveLaborEffForWeek('2026-08-01', {
      positions: { 'Turndown Attendant': { worked: 71.52, standard: 90.00, scheduled: 126.00, projected: 216.00, hoursVariance: -18.48, variancePct: -21, otHours: 0 } },
      range: { from: '2026-08-01', to: '2026-08-07' },
      uploadedAt: new Date().toISOString()
    });
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Note that must survive a re-upload.',
      'the note survives a PDF (re-)upload for the same week — separate storage, not touched by saveLaborEffForWeek');

    // ── And the two keys' storage genuinely never collide: writing a note
    // must not corrupt the PDF record, and vice versa. hk_laboreff_notes_
    // starts with the literal prefix hk_laboreff_ that the PDF record's
    // own local-storage key also starts with. ──
    const pdfRecord = win.getLaborEffForWeek('2026-08-01');
    t.assert(pdfRecord && pdfRecord.positions['Turndown Attendant'], 'the PDF record is intact after a note save/edit/delete cycle');
    t.eq(pdfRecord.positions['Turndown Attendant'].scheduled, 126.00, 'and its own data is unchanged');
    t.assert(win.localStorage.getItem('hk_laboreff_notes_2026-08-01'), 'notes have their own distinct localStorage key');
    const rawNotes = JSON.parse(win.localStorage.getItem('hk_laboreff_notes_2026-08-01'));
    t.assert(!('range' in rawNotes) && !('uploadedAt' in rawNotes) || rawNotes.notes, 'the notes record has its own shape, not the PDF record\'s fields');
  }
};
