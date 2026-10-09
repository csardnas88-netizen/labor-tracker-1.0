/* Carlos's ask, 2026-10-09: a single screen with the combined
   attendance picture. Originally shipped showing only employees with
   BOTH a Call-Off and a Tardiness entry; widened the same day to show
   EVERY employee with at least one of either, side by side — Overview
   is the one combined view, not a narrow flag list. Added as a third
   tab (originally "Late Arrivals", renamed to "Tardiness" throughout
   the same day). Sorted by combined total descending, with a quick
   link to jump to whichever journal(s) that person actually has
   entries in, pre-filtered to them. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Call-Offs Overview tab: shows every employee with a Call-Off and/or Tardiness entry, and links jump to the matching filtered journal',
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      calloffs_data: JSON.stringify([
        { id: 1, date: '2026-09-01', empId: '', empName: 'Heidy Ajsoc', pos: 'Room Attendant', reason: 'Sick', created: '2026-09-01T00:00:00.000Z' },
        { id: 2, date: '2026-09-10', empId: '', empName: 'Heidy Ajsoc', pos: 'Room Attendant', reason: 'Family', created: '2026-09-10T00:00:00.000Z' },
        { id: 3, date: '2026-09-02', empId: '26100064', empName: 'Jorge Gonzalez', pos: 'House Attendant', reason: 'Sick', created: '2026-09-02T00:00:00.000Z' },
        { id: 4, date: '2026-09-05', empId: '', empName: 'Gonzalez Jorge', pos: 'House Attendant', reason: 'Sick', created: '2026-09-05T00:00:00.000Z' },
      ]),
      latearrivals_data: JSON.stringify([
        { id: 101, date: '2026-09-03', empId: '26100064', empName: 'Jorge Gonzalez', pos: 'House Attendant', scheduledTime: '8:15 AM', arrivalTime: '8:30 AM', minutesLate: 15, created: '2026-09-03T00:00:00.000Z' },
        { id: 102, date: '2026-09-08', empId: '26100064', empName: 'Jorge Gonzalez', pos: 'House Attendant', scheduledTime: '8:15 AM', arrivalTime: '8:45 AM', minutesLate: 30, created: '2026-09-08T00:00:00.000Z' },
        { id: 103, date: '2026-09-04', empId: '', empName: 'Ana Lopez', pos: 'Room Attendant', scheduledTime: '7:00 AM', arrivalTime: '7:10 AM', minutesLate: 10, created: '2026-09-04T00:00:00.000Z' },
      ]),
    });
    const { win } = await loadApp({ seed });
    win.showPage('calloffs');
    win.setCofTab('overview');

    let html = win.document.getElementById('calloffsContent').innerHTML;

    // ── Everyone from either journal shows up — this is a union now, not
    // a "has both" flag list. ──
    t.assert(/Jorge Gonzalez/.test(html), 'Jorge (both a Call-Off and Tardiness) shows');
    t.assert(/Heidy Ajsoc/.test(html), 'Heidy (Call-Offs only, zero Tardiness) now shows too');
    t.assert(/Ana Lopez/.test(html), 'Ana (Tardiness only, zero Call-Offs) now shows too');

    // Bounded to the row's own </tr> (not a fixed character window) so a
    // short row (few or no jump links) can never accidentally pick up
    // content that actually belongs to the NEXT row in the table.
    function rowFor(name) {
      const idx = html.indexOf(name);
      const end = html.indexOf('</tr>', idx);
      return html.slice(idx, end);
    }
    function cellCounts(name) {
      const row = rowFor(name);
      const re = /text-align:center;[^"]*">(\d+)<\/td>/g;
      const out = [];
      let m;
      while ((m = re.exec(row))) out.push(Number(m[1]));
      return out; // [coCount, laCount]
    }

    // Anchored to the actual table cells, not "a number shows up somewhere
    // nearby" — otherwise a real identity-folding bug (e.g. Jorge's
    // id-less, reversed-name "Gonzalez Jorge" call-off landing as a
    // separate person) could hide behind an adjacent column's correct value.
    let [jorgeCo, jorgeLa] = cellCounts('Jorge Gonzalez');
    t.eq(jorgeCo, 2, "Jorge's Call-Offs column folds his id-carrying record and the id-less 'Gonzalez Jorge' reversed-name one into a real 2");
    t.eq(jorgeLa, 2, "Jorge's Tardiness column shows 2");

    let [heidyCo, heidyLa] = cellCounts('Heidy Ajsoc');
    t.eq(heidyCo, 2, "Heidy's Call-Offs column shows her real 2");
    t.eq(heidyLa, 0, 'Heidy has zero Tardiness entries, shown as a plain 0, not hidden or guessed at');

    let [anaCo, anaLa] = cellCounts('Ana Lopez');
    t.eq(anaCo, 0, 'Ana has zero Call-Offs, shown as a plain 0');
    t.eq(anaLa, 1, "Ana's Tardiness column shows her real 1");

    // ── Sort order: combined total descending — Jorge (4) > Heidy (2) > Ana (1) ──
    const order = ['Jorge Gonzalez', 'Heidy Ajsoc', 'Ana Lopez'].map((n) => html.indexOf(n));
    t.assert(order[0] < order[1] && order[1] < order[2], 'rows are sorted by combined Call-Off + Tardiness total, highest first');

    // ── A journal with zero entries for that person gets no jump link —
    // no point linking to an empty filtered view. ──
    const heidyRow = rowFor('Heidy Ajsoc');
    t.assert(/cofJumpToFilter\('calloffs'/.test(heidyRow), "Heidy's row has a Call-Offs jump link (she has call-offs)");
    t.assert(!/cofJumpToFilter\('latearrivals'/.test(heidyRow), "Heidy's row has NO Tardiness jump link (she has none to jump to)");

    const anaRow = rowFor('Ana Lopez');
    t.assert(!/cofJumpToFilter\('calloffs'/.test(anaRow), "Ana's row has NO Call-Offs jump link");
    t.assert(/cofJumpToFilter\('latearrivals'/.test(anaRow), "Ana's row has a Tardiness jump link");

    // ── Jumping from Overview to a filtered Call-Offs/Tardiness view ──
    const jorgeRow = rowFor('Jorge Gonzalez');
    const btnMatch = /cofJumpToFilter\('calloffs','([^']*)'\)/.exec(jorgeRow);
    t.assert(btnMatch, "Jorge's row has a working 'Call-Offs' jump link");
    win.cofJumpToFilter('calloffs', btnMatch[1]);
    t.eq(win.COF_TAB, 'calloffs', 'jumping switches the tab to Call-Offs');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(html.indexOf('2026-09-02') !== -1 && html.indexOf('2026-09-05') !== -1, "Jorge's two call-off dates show under the filtered view");
    t.assert(html.indexOf('2026-09-01') === -1 && html.indexOf('2026-09-10') === -1, "Heidy's call-off dates are filtered out");

    win.setCofTab('overview');
    html = win.document.getElementById('calloffsContent').innerHTML;
    const jorgeRow2 = rowFor('Jorge Gonzalez');
    const laBtnMatch = /cofJumpToFilter\('latearrivals','([^']*)'\)/.exec(jorgeRow2);
    t.assert(laBtnMatch, "Jorge's row also has a working 'Tardiness' jump link");
    win.cofJumpToFilter('latearrivals', laBtnMatch[1]);
    t.eq(win.COF_TAB, 'latearrivals', 'jumping switches the tab to Tardiness');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(html.indexOf('2026-09-03') !== -1 && html.indexOf('2026-09-08') !== -1, "Jorge's two tardiness dates show under the filtered view");
    t.assert(html.indexOf('2026-09-04') === -1, "Ana's tardiness date is filtered out");

    // ── Empty state when nothing is logged anywhere ──
    win.localStorage.setItem('calloffs_data', JSON.stringify([]));
    win.localStorage.setItem('latearrivals_data', JSON.stringify([]));
    win.setCofTab('overview');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Nothing logged yet/.test(html), 'an empty combined list shows the empty state, not an empty table');
  },
};
