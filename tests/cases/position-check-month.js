/* Monthly Position Check must catch BOTH kinds of issue across every saved
   day of the month, not just whatever PDF happens to be loaded right now:
     - an HK employee clocked into a DIFFERENT HK position (kind "hk")
     - an HK employee clocked into a non-HK department entirely, e.g.
       Banquet (kind "other") — the real case that motivated this page:
       Susan Aguilar (Housekeeping Supervisor) worked 2 days in Banquet and
       the old page never caught it, because it only ever looked at
       whichever single day's PDF was currently loaded, and even then only
       compared among HK positions.
   Also guards the decision/note keys: they're scoped per employee+date, so
   marking one day's occurrence doesn't bleed into another day's for the
   same person (the bug the old single-day PREV/PNOTE mechanism didn't need
   to worry about, but this monthly view would if it reused that shape). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Monthly Position Check: HK mismatches + non-HK department occurrences, across the month",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          // Susan Aguilar (real roster id 26100002, primary "Housekeeping
          // Supervisor") clocked in Banquet — a non-HK department — on two
          // separate days. Neither day should overwrite the other.
          '2026-07-05': {
            emps: [{ id: '26100005', name: 'Olga Ajpacaja', pos: 'Laundry Attendant', paid: 8 }],
            otherEmps: [{ id: '26100002', name: 'Susan Karina Aguilar Ambrocio', pos: 'Banquet', paid: 8 }],
          },
          '2026-07-06': {
            emps: [
              // Heidy Ajsoc (real roster id 26100006, primary "Room Attendant")
              // clocked in AS a different HK position.
              { id: '26100006', name: 'Heidy Ajsoc', pos: 'House Attendant', paid: 6.5 },
              // An id nowhere in the roster — genuinely unknown.
              { id: '99999901', name: 'Nobody On File', pos: 'Room Attendant', paid: 4 },
            ],
            otherEmps: [
              { id: '26100002', name: 'Susan Karina Aguilar Ambrocio', pos: 'Banquet', paid: 7.5 },
              // A real outside contractor with no HK primary at all — this is
              // Other Depts' job, not Position Check's; must stay excluded.
              { id: '99999902', name: 'External Contractor', pos: 'Banquet', paid: 5 },
            ],
          },
        },
      },
    });
    const { win } = await loadApp({ seed });

    const issues = win.getMonthPositionIssues('2026-07');

    const susan = issues.filter(r => r.id === '26100002');
    t.eq(susan.length, 2, 'both of Susan\'s Banquet days are captured, not just the most recent one');
    t.assert(susan.every(r => r.kind === 'other' && r.status === 'mismatch' && r.primary === 'Housekeeping Supervisor' && r.clockedAs === 'Banquet'),
      'both occurrences are flagged as an HK employee working a non-HK department');
    t.eq(new Set(susan.map(r => r.ds)).size, 2, 'the two occurrences are on two distinct dates');

    const heidy = issues.find(r => r.id === '26100006');
    t.assert(!!heidy, 'an HK-to-HK position mismatch is still caught');
    t.eq(heidy.kind, 'hk', 'a different HK position is tagged kind "hk", not "other"');
    t.eq(heidy.primary, 'Room Attendant', 'Heidy\'s roster position is Room Attendant');
    t.eq(heidy.clockedAs, 'House Attendant', 'clocked as House Attendant that day');

    const unknown = issues.find(r => r.id === '99999901');
    t.assert(!!unknown, 'an employee id absent from the roster is still surfaced');
    t.eq(unknown.status, 'unknown', 'status is "unknown", not "mismatch"');

    t.assert(!issues.some(r => r.id === '26100005'), 'an employee correctly matching their primary position is never flagged');
    t.assert(!issues.some(r => r.id === '99999902'), 'an outside contractor with no HK primary position is excluded (Other Depts\' job, not this page\'s)');

    /* ── decisions/notes are scoped per employee+date ── */
    win.setPosCheckDecision('26100002_2026-07-05', 'correct');
    let notes = win.pcNotes();
    t.eq(notes['26100002_2026-07-05'].decision, 'correct', 'the July 5 occurrence is marked correct');
    t.assert(!notes['26100002_2026-07-06'], 'marking July 5 does not touch July 6\'s occurrence for the same person');

    win.setPosCheckDecision('26100002_2026-07-06', 'incorrect');
    notes = win.pcNotes();
    t.eq(notes['26100002_2026-07-05'].decision, 'correct', 'July 5\'s decision is unchanged after July 6 is set');
    t.eq(notes['26100002_2026-07-06'].decision, 'incorrect', 'July 6 got its own, different decision');

    /* ── rendering ── */
    win.showPage('position');
    const html = win.document.getElementById('positionContent').innerHTML;
    t.assert(html.indexOf('Susan Karina Aguilar Ambrocio') > -1, 'Susan appears in the rendered page');
    t.assert(html.indexOf('Banquet') > -1, 'her clocked-in department is shown');
    t.assert(html.indexOf('Heidy Ajsoc') > -1, 'Heidy\'s HK mismatch appears too');
    t.assert(html.indexOf('Olga Ajpacaja') === -1, 'a correctly-matched employee is not shown');
    t.assert(html.indexOf('External Contractor') === -1, 'the outside contractor is not shown');

    /* ── filter: Unknown Only ── */
    win.PCF = 'unknown';
    win.renderPositionCheckPage();
    const unknownHtml = win.document.getElementById('positionContent').innerHTML;
    t.assert(unknownHtml.indexOf('Nobody On File') > -1, 'the unknown employee shows under the Unknown filter');
    t.assert(unknownHtml.indexOf('Susan Karina Aguilar Ambrocio') === -1, 'Susan\'s mismatches are hidden under the Unknown filter');
  }
};
