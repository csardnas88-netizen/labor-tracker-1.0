/* Carlos's real report, 2026-09-08 (with a screenshot of the Laundry
   card): Sunday's total read 5 while only FOUR rows on screen showed a
   "1". Sandra's Laundry row existed that day and counted toward the
   total, but the crew's row list was taken from a single reference day
   — the first day of the week with anything in it, Saturday — and she
   wasn't on the crew that day. So there was no row for her Sunday cell
   to paint into: a body the total could see and he could not, on a card
   with no way to edit her from.

   Two facets, both covered here:
     A. Anyone who joins a crew MID-week (a generated cover row, a
        borrow, another device's edit) was invisible all week.
     B. The same person under a drifted spelling ("Sandra S" vs
        "Sandra S.") split across days — the reference day showed her
        name, every other day's cell lookup missed and drew a dot. */
const { loadApp, fakeSession } = require('../_harness');

const SAT = '2026-09-12';
const WEEK = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

/* Every select on the rendered page that edits the given person's cells
   on the given crew — i.e. the days he can actually click. */
function editableDays(win, crew, name) {
  const el = win.document.getElementById('scheduleContent');
  return Array.from(el.querySelectorAll('select')).filter((s) => {
    const h = s.getAttribute('onchange') || '';
    return h.indexOf("'" + crew + "'") !== -1 && h.indexOf(name) !== -1;
  });
}

module.exports = {
  name: 'Schedule crew rows are the union of the whole week, not one reference day — a mid-week row is visible and editable, and a drifted spelling stays one row (Carlos\'s 2026-09-08 report)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── A) Someone who joins the crew after Saturday ──
    // Olga is on every day; Marta only from Sunday on. Before the fix
    // the card was built from Saturday alone, so Marta had no row at all
    // while her six days still counted toward each day's total.
    const days = {};
    WEEK.forEach((ds, i) => {
      days[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', '1']] };
      if (i > 0) days[ds].laundry.push(['Marta Ruiz', '1', 'added']);
    });
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({ days, count: WEEK.length }));

    win.schedViewWeekStart = new Date(2026, 8, 12);
    win.showPage('schedule');
    win.renderSchedule();

    const ref = win._schedCrewRef(win.dlLoadSchedule(), 'laundry', WEEK);
    t.eq(ref.length, 2, 'the crew list has both people, not just the one on the reference day');
    t.eq(ref.map((p) => p[0]).join(','), 'Olga A,Marta Ruiz',
      'the reference day comes first and the mid-week joiner is appended after');

    t.eq(editableDays(win, 'laundry', 'Marta Ruiz').length, 6,
      'all six of her days render as editable cells — she is no longer a body the total counts but the card cannot show');

    // The total and the visible rows now agree: Sunday is Olga + Marta.
    const SCH = win.dlLoadSchedule();
    t.eq(win.schedDayTotal(SCH, '2026-09-13', 'laundry'), 2, "Sunday's total is 2");
    t.eq(editableDays(win, 'laundry', 'Marta Ruiz').filter((s) => (s.getAttribute('onchange') || '').indexOf('2026-09-13') !== -1).length, 1,
      'and Sunday is one of the days he can click, so the total is fully accounted for on screen');

    // Her weekly work-day count reads off the union row too.
    const idx = ref.findIndex((p) => p[0] === 'Marta Ruiz');
    t.eq(win._schedWorkDaysFor(SCH, WEEK, 'laundry', idx, 'Marta Ruiz'), 6,
      'the Days column counts all six, not the one day the old reference row could see');

    // ── B) The same person, two spellings across the week ──
    // Exactly the reported shape: the manually added row on Saturday
    // carries the period, the rows generated for the rest of the week
    // do not. One person, one row, seven clickable days.
    const days2 = {};
    WEEK.forEach((ds, i) => {
      days2[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', '1']] };
      days2[ds].laundry.push([i === 0 ? 'Sandra S.' : 'Sandra S', '1', i === 0 ? 'added' : 'cover']);
    });
    win.localStorage.setItem('hk_dl_schedule', JSON.stringify({ days: days2, count: WEEK.length }));
    win.renderSchedule();

    const ref2 = win._schedCrewRef(win.dlLoadSchedule(), 'laundry', WEEK);
    t.eq(ref2.filter((p) => /Sandra/.test(p[0])).length, 1,
      'the two spellings are one person, one row — not two half-empty ones');
    t.eq(editableDays(win, 'laundry', 'Sandra S').length, 7,
      'and every day of the week is editable, including the six that used to draw a dot');

    // The cell lookup finds the drifted spelling, so the values show.
    t.eq(win.schedCellFor(win.dlLoadSchedule(), '2026-09-13', 'laundry', 'Sandra S.'), '1',
      "Sunday's value is found under the other spelling rather than reading as empty");

    // ── C) A stale retirement can't silently swallow a generated row ──
    // The flag Carlos left behind when he deleted an earlier duplicate
    // used to filter every row the app generated for her straight back
    // out again. Creating the cover row clears it, under both spellings.
    const SCH3 = {
      retired: { 'laundry|sandra s': true },
      days: { [SAT]: { laundry: [], gra: [['Sandra S.', 'LAUNDRY']] } },
    };
    t.assert(win.schedSyncLaundryCoverRow(SCH3, SAT, 'gra', 'Sandra S.', 'LAUNDRY'), 'the cover row is created');
    t.eq(SCH3.days[SAT].laundry.length, 1, 'she is on the Laundry card');
    t.assert(!win.schedIsRetired(SCH3, 'laundry', 'Sandra S.'), 'the retirement is cleared under the spelling used');
    t.assert(!win.schedIsRetired(SCH3, 'laundry', 'Sandra S'), 'and under the drifted one that was actually on file');

    win.localStorage.removeItem('hk_dl_schedule');
  },
};
