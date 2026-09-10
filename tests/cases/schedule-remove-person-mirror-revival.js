/* Carlos's real report, 2026-09-10: he accidentally marked Karla Varela
   LAUNDRY on her own Room Attendant row (instead of borrowing her in
   properly), which auto-generated her a cover row on Laundry's own
   crew card (schedSyncLaundryCoverRow). Clicking "Remove from crew,
   this week onward" on that Laundry row did nothing he could see — the
   confirm dialog appeared, he clicked OK, and she never left.

   Root cause: schedRemovePerson deleted her Laundry row and set the
   retired flag, then called renderSchedule() — which runs
   schedSyncAllLaundryCoverRows as part of its own self-heal pass BEFORE
   drawing the page. That scan found her Room Attendant cell still
   reading "LAUNDRY", recreated the very row just deleted, AND cleared
   the retired flag right back off (the v7.40.77 fix for a DIFFERENT
   real bug — a stale retirement blocking a legitimate new cover row).
   So the whole removal was silently undone on the SAME render it
   triggered, before Carlos ever saw anything change.

   The fix doesn't touch the un-retire behavior (still needed for that
   other bug) — instead, removing someone now also releases this crew's
   own away-label off every other crew's cell for her, for the same
   dates being retired, so there is nothing left for the self-heal to
   recreate a row FROM. */
const { loadApp, fakeSession } = require('../_harness');

const WEEK = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

module.exports = {
  name: 'schedRemovePerson survives its own render: a stale LAUNDRY label on her home crew no longer resurrects the row it was just used to delete (Carlos\'s real Karla Varela report, 2026-09-10)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // Exactly Carlos's real shape: Karla's own Room Attendant cell reads
    // LAUNDRY on Sat/Sun (the accidental mark), which already generated
    // her a cover row on Laundry for those two days.
    const days = {};
    WEEK.forEach((ds, i) => {
      days[ds] = {
        sheet: 'test', occ: '', dep: '', tdOcc: '',
        gra: [['Karla Varela', i < 2 ? 'LAUNDRY' : '8:15 AM - 4:45 PM']],
        laundry: i < 2 ? [['Olga A', '1'], ['Karla Varela', '1', 'cover']] : [['Olga A', '1']],
      };
    });
    win.dlSaveSchedule({ days, count: WEEK.length });
    win.schedViewWeekStart = new Date(2026, 8, 12);
    win.showPage('schedule');
    win.renderSchedule();

    const confirmFn = win.confirm;
    win.confirm = () => true;
    win.schedRemovePerson('laundry', 'Karla Varela');
    win.confirm = confirmFn;

    const SCH = win.dlLoadSchedule();
    t.assert(!SCH.days['2026-09-12'].laundry.some((p) => p[0] === 'Karla Varela'),
      'Karla is off Laundry\'s Saturday row right after the click');
    t.assert(!SCH.days['2026-09-13'].laundry.some((p) => p[0] === 'Karla Varela'),
      'and Sunday too');
    t.assert(win.schedIsRetired(SCH, 'laundry', 'Karla Varela'),
      'the retired flag actually stuck this time');
    t.eq(SCH.days['2026-09-12'].gra[0][1], '1',
      'her Room Attendant cell — the thing that was driving the auto-recreation — was released back to a plain 1, not left as LAUNDRY');
    t.eq(SCH.days['2026-09-14'].gra[0][1], '8:15 AM - 4:45 PM',
      'a day she was never mislabeled on (Monday, a real shift) is completely untouched');

    // The real bug: it looked fine ONCE, but broke back open on the very
    // next render (a page reload, switching pages and back, etc.) if
    // anything still triggered the self-heal. Render twice more and
    // confirm she stays gone and stays retired both times.
    win.renderSchedule();
    win.renderSchedule();
    const afterRerenders = win.dlLoadSchedule();
    t.assert(!afterRerenders.days['2026-09-12'].laundry.some((p) => p[0] === 'Karla Varela'),
      'she is still off Laundry after two more renders');
    t.assert(win.schedIsRetired(afterRerenders, 'laundry', 'Karla Varela'),
      'and still retired — the self-heal did not quietly clear it again');

    // The crew card itself reflects it too — the actual thing Carlos is
    // looking at, not just the underlying data.
    const html = win.document.getElementById('scheduleContent').innerHTML;
    const laundryCardStart = html.indexOf('LAUNDRY</div>');
    const laundryCardHtml = html.slice(laundryCardStart, laundryCardStart + 3000);
    t.assert(!/Karla Varela/.test(laundryCardHtml), 'the rendered Laundry card no longer shows her row at all');

    // Sandra S.'s real fix (v7.40.77) — a stale retirement blocking a
    // LEGITIMATE new cover row — must still work. This is the other
    // half of the same code path; confirm it wasn't broken by scoping
    // the release to only the crew actually being removed from.
    const days2 = {};
    WEEK.forEach((ds) => {
      days2[ds] = {
        sheet: 'test', occ: '', dep: '', tdOcc: '',
        gra: [['Sandra S.', 'LAUNDRY']],
        laundry: [['Olga A', '1']],
      };
    });
    const SCH2 = { days: days2, count: WEEK.length, retired: { 'laundry|sandra s': true } };
    win.dlSaveSchedule(SCH2);
    win.renderSchedule();
    const afterSandra = win.dlLoadSchedule();
    t.assert(afterSandra.days['2026-09-12'].laundry.some((p) => p[0].indexOf('Sandra') !== -1),
      'Sandra S. still gets her Laundry cover row generated despite the old stale retirement');
    t.assert(!win.schedIsRetired(afterSandra, 'laundry', 'Sandra S.'),
      'and the stale retirement still clears the way it did before — this fix did not reintroduce that bug');

    win.localStorage.removeItem('hk_dl_schedule');
  },
};
