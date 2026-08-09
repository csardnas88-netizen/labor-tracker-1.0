/* Labor Effectiveness's Notes column — Carlos's ask, right after
   Overtime: a place to justify a position's weekly variance. One note per
   position per WEEK (this section is a weekly total, not a day-by-day
   breakdown), stored under its own key (hk_laboreff_notes_<weekKey>)
   deliberately SEPARATE from the uploaded PDF record
   (hk_laboreff_<weekKey>).

   v7.1.3 redesign: this started (v7.1.0) as a block underneath the row,
   opened by tapping "+ Note". Carlos found that visually disconnected
   from the row it belonged to and asked for it to live in the row
   itself, as its own column next to Overtime — so it's now an
   always-visible narrow textarea, auto-saving on blur (saveWLENoteInline)
   instead of a separate open/edit/Save/Close cycle.

   The other half of this test file is unchanged in intent: the PDF
   record is replaced WHOLESALE on every (re-)upload (see
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
  name: "Labor Effectiveness Notes column: inline auto-save on blur, survives a PDF re-upload, and shares no storage with the PDF record",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedTurndownWeek());
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('unifocus');
    const week = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 7) };

    // ── Default: no note yet, an empty textarea sits right in the row
    // (in the same grid line as Position/Worked/.../OT — not a block
    // rendered underneath it), inviting a note via its placeholder. ──
    let html = win.buildLaborEffectivenessHTML(win.loadMonthData('2026-08').days, 200, week);
    let tdIdx = html.indexOf('>Turndown<');
    t.assert(tdIdx !== -1, 'Turndown row found');
    let tdBlock = html.slice(tdIdx, tdIdx + 2000);
    t.assert(/<textarea[^>]*placeholder="\+ Note"/.test(tdBlock), 'the Notes column textarea is right there in the row, inviting a note');
    t.assert(!/Explanation/.test(tdBlock), 'no separate "Explanation" block underneath the row anymore — the column replaced it');

    // ── Round trip: save via the underlying store, reads back on render,
    // pre-filled into the same inline textarea. ──
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
    t.assert(/Covered two call-offs this week/.test(tdBlock), 'the saved note shows pre-filled in the inline textarea');
    t.assert(/background:var\(--gt\)/.test(tdBlock), 'a position with a note gets the same soft gold highlight used elsewhere in this app for "has a note"');

    // ── Editing: no tap-to-open step — the textarea is always live.
    // saveWLENoteInline (wired to onblur) writes through immediately. ──
    win.saveWLENoteInline('2026-08-01', 'Turndown Attendant', 'Updated: also a training day mid-week.');
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), 'Updated: also a training day mid-week.', 'blurring the textarea overwrites the note directly, no separate Save step');

    // Clearing the textarea (blur with empty value) deletes the note —
    // there's no separate Delete button in the inline design.
    win.saveWLENoteInline('2026-08-01', 'Turndown Attendant', '');
    t.eq(win.getWeeklyEffNote('2026-08-01', 'Turndown Attendant'), '', 'blurring an emptied textarea clears the note');

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
    t.assert(pdfRecord && pdfRecord.positions['Turndown Attendant'], 'the PDF record is intact after a note save/edit/clear cycle');
    t.eq(pdfRecord.positions['Turndown Attendant'].scheduled, 126.00, 'and its own data is unchanged');
    t.assert(win.localStorage.getItem('hk_laboreff_notes_2026-08-01'), 'notes have their own distinct localStorage key');
    const rawNotes = JSON.parse(win.localStorage.getItem('hk_laboreff_notes_2026-08-01'));
    t.assert(!('range' in rawNotes) && !('uploadedAt' in rawNotes) || rawNotes.notes, 'the notes record has its own shape, not the PDF record\'s fields');
  }
};
