/* Carlos's real ask, 2026-11-21: the old "Most Call-Offs — All Time" table
   (top 8, raw total only) couldn't answer the question HR actually asks him
   in person — given someone's total, how proper vs. improper were they, and
   did they happen close together or spread out (e.g. 3 call-offs inside 90
   days reads very differently than 3 spread across a year, even though the
   total is identical). The new Summary tab lists EVERY employee with a
   proper/improper/unlogged breakdown plus two time measures: the plain
   first-to-last span, and the single busiest 90-day window found anywhere
   in their history (a sliding window, not just first-vs-last — so a cluster
   buried in the middle of a longer history still surfaces correctly). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Call-Offs Summary: every employee with a proper/improper/unlogged breakdown, their first-to-last span, and their busiest 90-day stretch',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // Gady: 3 call-offs, all within ~73 days of each other (a real
    // cluster) — 2 improper, 1 proper.
    const gady = [
      { id: 1, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-01-01', reason: 'Sick', improper: true },
      { id: 2, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-01-20', reason: 'Sick', improper: false },
      { id: 3, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-03-15', reason: 'Family', improper: true },
    ];
    // Ana: also 3 total, but spread exactly a year apart — same total as
    // Gady, very different real pattern — all proper.
    const ana = [
      { id: 4, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2025-01-01', reason: 'Sick', improper: false },
      { id: 5, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2025-07-01', reason: 'Sick', improper: false },
      { id: 6, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2026-01-01', reason: 'Sick', improper: false },
    ];
    // Beatriz: a single call-off, no Time Notified entered at all — must
    // read as "no time logged", not silently counted as proper.
    const beatriz = [
      { id: 7, empId: '3', empName: 'Beatriz Cruz', pos: 'Turndown Attendant', date: '2026-06-01', reason: 'Sick' },
    ];
    // Diego: three distinct position labels, deliberately chosen so three
    // different (two of them wrong) implementations each land on a
    // DIFFERENT answer — a weaker fixture (e.g. the malformed record
    // reusing "Supervisor") could pass even with a real bug still present.
    // Her real dates are Feb 10 (Room Attendant, listed LAST in the
    // array) and May 1 (Supervisor, promoted, listed FIRST) — storage
    // order must never win over actual chronological order. A third
    // record has a malformed, non-'YYYY-MM-DD' date ("N/A") carrying yet
    // another label ("Front Desk") — "N/A" sorts AFTER both real ISO date
    // strings under a naive raw string sort (ASCII 'N' > '2'), so a fix
    // that merely sorts the full mixed list by date string and reads the
    // last entry would wrongly land on "Front Desk" instead of either
    // real position. The correct answer is "Supervisor" — the most
    // recent of the two genuinely dated records — and it must still
    // count toward Total (a real logged call-off) without corrupting the
    // span/cluster math into "NaN" or inflating the cluster count.
    const diego = [
      { id: 8, empId: '4', empName: 'Diego Ramirez', pos: 'Supervisor', date: '2026-05-01', reason: 'Sick', improper: false },
      { id: 9, empId: '4', empName: 'Diego Ramirez', pos: 'Front Desk', date: 'N/A', reason: 'Bad legacy record', improper: true },
      { id: 10, empId: '4', empName: 'Diego Ramirez', pos: 'Room Attendant', date: '2026-02-10', reason: 'Sick', improper: true },
    ];
    win.saveCallOffs(gady.concat(ana, beatriz, diego));

    win.showPage('calloffs');
    win.setCofTab('summary');
    const html = win.document.getElementById('calloffsContent').innerHTML;

    t.assert(/Employees/.test(html) && />4<\/div>/.test(html), 'the employee count stat reads 4');
    t.assert(/Call-Offs, All Time/.test(html), 'and the all-time call-off count stat renders');

    const gadyIdx = html.indexOf('Gady Gonzalez');
    const anaIdx = html.indexOf('Ana Lopez');
    const beaIdx = html.indexOf('Beatriz Cruz');
    t.assert(gadyIdx !== -1 && anaIdx !== -1 && beaIdx !== -1, 'all three employees render');

    // Default sort is by total — Gady and Ana are tied at 3, so the
    // secondary alphabetical tiebreak puts Ana ("Ana Lopez") first, then
    // Gady, then Beatriz (total 1) last.
    t.assert(anaIdx < gadyIdx && gadyIdx < beaIdx, 'default sort (Most Call-Offs) ties broken alphabetically, then Beatriz last with only 1');

    const gadyBlock = html.slice(gadyIdx, gadyIdx + 1200);
    const anaBlock = html.slice(anaIdx, anaIdx + 1200);
    const beaBlock = html.slice(beaIdx, beaIdx + 1200);

    // ── Breakdown: proper/improper counted correctly per employee ──
    t.assert(/1 proper/.test(gadyBlock) && /2 improper/.test(gadyBlock), "Gady's breakdown is 1 proper, 2 improper");
    t.assert(/3 proper/.test(anaBlock) && /0 improper/.test(anaBlock), "Ana's breakdown is 3 proper, 0 improper");
    t.assert(/no time logged/.test(beaBlock), "Beatriz's single call-off with no Time Notified reads as unlogged, not silently proper");

    // ── Span: Gady's 3 are ~73 days apart; Ana's 3 are exactly a year
    // apart — same total, correctly different spans. Beatriz has only
    // one call-off, so span is a dash, not a bogus "0 days". ──
    t.assert(/73 days/.test(gadyBlock), "Gady's first-to-last span is 73 days (Jan 1 to Mar 15, 2026)");
    t.assert(/year/.test(anaBlock), "Ana's span reads in years (a full year apart), not days");
    t.assert(/—/.test(beaBlock), 'Beatriz, with only one call-off, shows a dash for span rather than "same day" or "0 days"');

    // ── Busiest 90 days: Gady's 3 call-offs ALL fall inside a 90-day
    // window (Jan 1 - Mar 15 is 73 days) so her busiest-90 is 3, flagged
    // amber; Ana's are a year apart so her busiest-90 is only 1, not
    // flagged, even though her plain total matches Gady's. ──
    t.assert(/b-yellow">3</.test(gadyBlock), "Gady's busiest 90-day window is 3 (all of them cluster together), flagged amber");
    t.assert(/b-gray">1</.test(anaBlock), "Ana's busiest 90-day window is only 1 despite the same total of 3, correctly NOT flagged");

    // ── Sorting by "Busiest 90 Days" surfaces the real cluster (Gady)
    // ahead of Ana, even though a plain total-sort ties them. ──
    win.setCofSummarySort('busy90');
    const html2 = win.document.getElementById('calloffsContent').innerHTML;
    const gadyIdx2 = html2.indexOf('Gady Gonzalez');
    const anaIdx2 = html2.indexOf('Ana Lopez');
    t.assert(gadyIdx2 < anaIdx2, 'sorting by Busiest 90 Days puts the real cluster (Gady) ahead of the evenly-spread total (Ana)');

    // ── Diego: a real position change mid-history, plus a malformed-date
    // legacy record. ──
    const diegoIdx = html.indexOf('Diego Ramirez');
    t.assert(diegoIdx !== -1, 'Diego Ramirez renders');
    const diegoBlock = html.slice(diegoIdx, diegoIdx + 1200);
    t.assert(!/NaN/.test(diegoBlock), 'the malformed-date record never leaks a NaN into the span/cluster columns');
    t.assert(/Supervisor/.test(diegoBlock) && !/Room Attendant/.test(diegoBlock) && !/Front Desk/.test(diegoBlock),
      'the position shown is from the chronologically LAST real date (May 1, Supervisor) — not "Room Attendant" (last in raw array/storage order) and not "Front Desk" (last if the malformed date were naively string-sorted alongside real ones)');
    t.assert(/1 proper/.test(diegoBlock) && /2 improper/.test(diegoBlock),
      "Diego's breakdown counts all 3 records including the malformed-date one (1 proper, 2 improper), since it's still a real logged call-off");
    t.assert(/80 days/.test(diegoBlock), "Diego's span is 80 days (Feb 10 to May 1, 2026) — computed only from the two real dates, ignoring the malformed one");
    t.assert(/b-gray">2</.test(diegoBlock), "Diego's busiest 90-day cluster is 2 (only her two real dates), not inflated by the malformed-date record and not flagged amber");

    // ── The View link jumps back to the Call-Offs tab, filtered to that
    // same person — same cofJumpToFilter mechanic the Overview tab's own
    // jump links already use and are already covered by their own test. ──
    const btnMatch = /cofJumpToFilter\('calloffs','([^']*)'\)/.exec(gadyBlock);
    t.assert(!!btnMatch, "Gady's row has a View link wired to cofJumpToFilter");
    win.cofJumpToFilter('calloffs', btnMatch[1]);
    t.eq(win.COF_TAB, 'calloffs', 'the View link switches back to the Call-Offs tab');
    t.eq(win.COF_FILTER, btnMatch[1], 'filtered to the same employee key the row was built from');
  },
};
