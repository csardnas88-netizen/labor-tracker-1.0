/* Variance notes on By Position — Carlos asked to be able to explain WHY a
   position was over/under budget on a given day (e.g. "covered a call-off"),
   attached right to that position's Variance cell. A small icon marks the
   affordance: a filled speech-bubble once a note exists, a muted dashed "+"
   before one does — icon only, so the table stays exactly as compact as
   before for anyone who never uses it. No note affordance renders for a
   position with no computed variance at all (the em-dash case) — there's
   nothing to explain.

   The critical design constraint this test guards: notes are stored at
   mData.varianceNotes[ds][pos], a SIBLING of days[] on the month blob — NOT
   nested inside days[ds].byPosition[pos]. That's deliberate. saveDayToMonth
   (the Labor Distribution Report upload path) replaces days[ds] AND every
   position's byPosition[pos] object WHOLESALE on every (re-)upload for that
   date — see index.html's snap.byPosition[pos]={...} followed by
   mData.days[ds]=snap. Anything stored inside byPosition[pos] would be
   silently wiped the next time that day's report is re-uploaded — the exact
   class of real data-loss bug already found and fixed for Project Hours
   (see [[labor-tracker-project-hours-clobber-bug]]). Keeping notes as a
   top-level sibling field means a report re-upload can never touch them. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Variance notes on By Position: save/read round-trip, UI affordance, and survival across a Labor Distribution Report re-upload",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-15': {
            totalPaid: 30,
            byPosition: {
              'House Attendant': { paid: 32, ot1: 0, emps: 4, breakEx: 0 },
              'Room Attendant': { paid: 128.89, ot1: 0, emps: 12, breakEx: 0 }
            }
          }
        },
        rooms: { '2026-07-14': 150 }
      }
    });
    const { win } = await loadApp({ seed });
    win.setLaborStandardMode('current'); // LABOR_STD has both positions covered; Unifocus doesn't cover Room Attendant here
    win.dashSelectedDate = new Date(2026, 6, 15);

    // ── Round trip: no note yet, then save one, then read it back. ──
    t.eq(win.getVarianceNote('2026-07-15', 'House Attendant'), '', 'no note stored yet reads back as an empty string');
    win.saveVarianceNote('2026-07-15', 'House Attendant', 'Covered a call-off on the 10th floor.');
    t.eq(win.getVarianceNote('2026-07-15', 'House Attendant'), 'Covered a call-off on the 10th floor.', 'the saved note reads back exactly');

    // ── UI: the icon reflects whether a note exists, and only appears
    // where there's an actual variance to explain. ──
    win.showPage('labor');
    let dayHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = dayHtml.split('<tr>');
    const houseRow = rows.find((r) => />House</.test(r)) || '';
    t.assert(/\u{1F4AC}/u.test(houseRow), 'House Attendant (has a note) shows the speech-bubble icon');
    t.assert(!/Add a note/.test(houseRow), 'House Attendant does not also show the "add a note" affordance');

    const roomRow = rows.find((r) => />Room</.test(r)) || '';
    t.assert(/Add a note/.test(roomRow), 'Room Attendant (variance exists, no note yet) shows the muted "add a note" affordance');
    t.assert(!/\u{1F4AC}/u.test(roomRow), 'Room Attendant does not show the filled speech-bubble (no note saved for it)');

    // ── The note editor is collapsed by default; toggling opens it and
    // pre-fills the textarea with the current note. ──
    t.assert(!/textarea/.test(dayHtml), 'the note textarea is not rendered until a position is expanded');
    win.toggleVarianceNote('House Attendant');
    dayHtml = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(/Covered a call-off on the 10th floor\./.test(dayHtml), 'expanding the position pre-fills the textarea with its saved note');

    // ── Saving from the textarea persists the new value and closes/re-renders. ──
    const inputIdMatch = dayHtml.match(/id="(varNoteInput_2026-07-15_HouseAttendant)"/);
    t.assert(inputIdMatch, 'the textarea has the expected id pattern');
    win.document.getElementById(inputIdMatch[1]).value = 'Updated: also trained a new hire.';
    win.saveVarianceNoteFromInput('2026-07-15', 'House Attendant', inputIdMatch[1]);
    t.eq(win.getVarianceNote('2026-07-15', 'House Attendant'), 'Updated: also trained a new hire.', 'saving from the textarea overwrites the stored note');

    // ── Clearing a note (empty text) removes it rather than storing a
    // blank string — getVarianceNote should read back '' either way, but
    // the underlying key should actually be gone (matches how Departures'
    // saveDeparturesForDate deletes rather than stores a falsy value). ──
    win.saveVarianceNote('2026-07-15', 'House Attendant', '   ');
    const mDataAfterClear = JSON.parse(win.localStorage.getItem('hk_month_2026-07'));
    t.assert(!mDataAfterClear.varianceNotes || !mDataAfterClear.varianceNotes['2026-07-15'] || !mDataAfterClear.varianceNotes['2026-07-15']['House Attendant'],
      'clearing a note to blank actually removes the stored key, not just an empty string');

    // ── The critical guarantee: notes live OUTSIDE days[], so a Labor
    // Distribution Report re-upload for this date — which wholesale-
    // replaces days[ds] and every byPosition[pos] object, exactly like
    // saveDayToMonth does — must NOT wipe a saved note. ──
    win.saveVarianceNote('2026-07-15', 'Room Attendant', 'Extra hours to prep for a group check-in.');
    t.eq(win.getVarianceNote('2026-07-15', 'Room Attendant'), 'Extra hours to prep for a group check-in.', 'sanity: the note is saved before simulating the re-upload');

    const mk = '2026-07';
    const mData = win.loadMonthData(mk);
    // Mirrors saveDayToMonth's snap construction exactly: a brand-new days[ds]
    // with brand-new byPosition[pos] objects, as a real re-upload would produce.
    mData.days['2026-07-15'] = {
      date: '2026-07-15',
      dayOfWeek: 3,
      totalPaid: 35,
      totalOT: 0,
      totalEmps: 16,
      byPosition: {
        'House Attendant': { paid: 33, ot1: 0, emps: 4, breakEx: 0 },
        'Room Attendant': { paid: 130, ot1: 0, emps: 12, breakEx: 0 }
      }
    };
    win.saveMonthData(mData, mk);

    t.eq(win.getVarianceNote('2026-07-15', 'Room Attendant'), 'Extra hours to prep for a group check-in.',
      'the note survives a simulated report re-upload that wholesale-replaces days[ds].byPosition — it lives in a separate top-level field the upload never touches');

    // And the re-uploaded numbers themselves did take effect, confirming
    // this really was an equivalent replacement, not a no-op.
    const reloaded = win.loadMonthData(mk);
    t.eq(reloaded.days['2026-07-15'].byPosition['Room Attendant'].paid, 130, 'the simulated re-upload did actually update the paid hours (proving the note survival above is meaningful, not just untouched data)');
  }
};
