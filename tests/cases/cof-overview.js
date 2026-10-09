/* Carlos's follow-up ask, 2026-10-09, right after Late Arrivals shipped:
   he wants a single screen to catch employees who have BOTH a Call-Off
   and a Late Arrival logged — a different, more concerning signal than
   either one alone. Added as a third "Overview" tab. Only employees
   with at least one of EACH show up (confirmed with Carlos: a flag
   list, not a side-by-side of everyone), sorted by combined total
   descending, with a quick link to jump to either journal pre-filtered
   to that same person. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Call-Offs Overview tab: flags employees with BOTH a Call-Off and a Late Arrival, and links jump to the matching filtered journal',
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

    // ── Jorge has both (3 call-offs across two name spellings, no
    // shared id on one of them — but the same empId elsewhere still
    // folds them — plus 2 late arrivals) — he must appear. ──
    t.assert(/Jorge Gonzalez/.test(html), 'Jorge Gonzalez (has both a Call-Off and a Late Arrival) shows on the Overview tab');
    const jorgeIdx = html.indexOf('Jorge Gonzalez');
    const jorgeRow = html.slice(jorgeIdx, jorgeIdx + 900);
    // Anchored to the actual table cells (not just "a 2 shows up somewhere
    // nearby") — otherwise a real bug where the Call-Offs column reads 1
    // (failing to fold his id-less, reversed-name "Gonzalez Jorge" record
    // into the same person) could hide behind the Late Arrivals column's
    // correct 2, since both numbers sit close together in the row.
    const cellRe = /font-weight:800;color:var\(--red\);">(\d+)<\/td>/g;
    const counts = [];
    let m;
    while ((m = cellRe.exec(jorgeRow))) counts.push(Number(m[1]));
    t.eq(counts[0], 2, "Jorge's Call-Offs column folds his id-carrying record and the id-less 'Gonzalez Jorge' reversed-name one into a real 2, not 1+1 as two different people");
    t.eq(counts[1], 2, "Jorge's Late Arrivals column shows 2");

    // ── Heidy only has call-offs (no late arrival) — must NOT appear. ──
    t.assert(!/Heidy/.test(html), 'Heidy (call-offs only, no late arrival) is excluded — this is a BOTH list, not an either/or list');

    // ── Ana only has a late arrival (no call-off) — must NOT appear either. ──
    t.assert(!/Ana Lopez/.test(html), 'Ana Lopez (late arrival only, no call-off) is excluded too');

    // ── Jumping from Overview to a filtered Call-Offs/Late Arrivals view ──
    const btnMatch = /cofJumpToFilter\('calloffs','([^']*)'\)/.exec(html);
    t.assert(btnMatch, "Jorge's row has a working 'Call-Offs' jump link");
    win.cofJumpToFilter('calloffs', btnMatch[1]);
    t.eq(win.COF_TAB, 'calloffs', 'jumping switches the tab to Call-Offs');
    html = win.document.getElementById('calloffsContent').innerHTML;
    // The filter dropdown always lists every employee as an <option> (same as
    // Call-Offs' own filter already does) — what actually proves the filter
    // took effect is the record LIST below it, not whether "Heidy" appears
    // anywhere on the page at all.
    t.assert(html.indexOf('2026-09-02') !== -1 && html.indexOf('2026-09-05') !== -1, "Jorge's two call-off dates show under the filtered view");
    t.assert(html.indexOf('2026-09-01') === -1 && html.indexOf('2026-09-10') === -1, "Heidy's call-off dates are filtered out");

    win.setCofTab('overview');
    html = win.document.getElementById('calloffsContent').innerHTML;
    const laBtnMatch = /cofJumpToFilter\('latearrivals','([^']*)'\)/.exec(html);
    t.assert(laBtnMatch, "Jorge's row also has a working 'Late Arrivals' jump link");
    win.cofJumpToFilter('latearrivals', laBtnMatch[1]);
    t.eq(win.COF_TAB, 'latearrivals', 'jumping switches the tab to Late Arrivals');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(html.indexOf('2026-09-03') !== -1 && html.indexOf('2026-09-08') !== -1, "Jorge's two late arrival dates show under the filtered view");
    t.assert(html.indexOf('2026-09-04') === -1, "Ana's late arrival date is filtered out");

    // ── Empty state when no one qualifies ──
    win.localStorage.setItem('calloffs_data', JSON.stringify([]));
    win.localStorage.setItem('latearrivals_data', JSON.stringify([]));
    win.setCofTab('overview');
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/No one currently has both/.test(html), 'an empty combined list shows the "nothing to flag" state, not an empty table');
  },
};
