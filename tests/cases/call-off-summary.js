/* Carlos's real ask, 2026-11-21: the old "Most Call-Offs — All Time" table
   (top 8, raw total only) couldn't answer the question HR actually asks him
   in person — given someone's total, how proper vs. improper were they, and
   did they happen close together or spread out (e.g. 3 call-offs inside 90
   days reads very differently than 3 spread across a year, even though the
   total is identical). The Summary tab lists EVERY employee with a
   proper/improper/unlogged breakdown plus two time measures: the plain
   first-to-last span, and the single busiest 90-day window found anywhere
   in their history (a sliding window, not just first-vs-last — so a cluster
   buried in the middle of a longer history still surfaces correctly).

   2026-11-22 follow-up, after Carlos rejected a denser v2 redesign
   (compact icon chips, Call-Offs+Tardiness merged into one row, default
   sort changed) with "no me gusta": he wants the ORIGINAL word-badge
   design back, just split into one card per position (same canonical
   order HK_WEEKLY_POSITIONS already uses elsewhere), plus a "+ New
   Call-Off" button right on this screen so logging one doesn't require
   leaving Summary — and it must actually show up here immediately. */
const { loadApp, fakeSession } = require('../_harness');

function groupTitleFor(html, nameIdx) {
  const re = /<div class="card-title">([^<]*)<\/div>/g;
  let m, last = null;
  while ((m = re.exec(html)) && m.index < nameIdx) last = m[1];
  return last;
}

module.exports = {
  name: 'Call-Offs Summary: grouped by position, word-badge breakdown, span, busiest-90-day cluster, and a New Call-Off button that reflects immediately',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // Gady: Laundry Attendant, 3 call-offs all within ~73 days (a real
    // cluster) — 2 improper, 1 proper.
    const gady = [
      { id: 1, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-01-01', reason: 'Sick', improper: true },
      { id: 2, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-01-20', reason: 'Sick', improper: false },
      { id: 3, empId: '1', empName: 'Gady Gonzalez', pos: 'Laundry Attendant', date: '2026-03-15', reason: 'Family', improper: true },
    ];
    // Ana: Room Attendant, 3 total but spread exactly a year apart — same
    // total as Gady, very different real pattern — all proper.
    const ana = [
      { id: 4, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2025-01-01', reason: 'Sick', improper: false },
      { id: 5, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2025-07-01', reason: 'Sick', improper: false },
      { id: 6, empId: '2', empName: 'Ana Lopez', pos: 'Room Attendant', date: '2026-01-01', reason: 'Sick', improper: false },
    ];
    // Carla: ALSO Room Attendant, same group as Ana — 2 call-offs 19 days
    // apart, a real cluster (busy90=2) despite a lower total than Ana's 3.
    // Pairs with Ana to prove the sort toggle reorders WITHIN a position
    // group now, since cross-group order is fixed by canonical position
    // order, not by the chosen sort.
    const carla = [
      { id: 11, empId: '5', empName: 'Carla Ruiz', pos: 'Room Attendant', date: '2026-04-01', reason: 'Sick', improper: false },
      { id: 12, empId: '5', empName: 'Carla Ruiz', pos: 'Room Attendant', date: '2026-04-20', reason: 'Sick', improper: true },
    ];
    // Beatriz: Turndown Attendant, a single call-off, no Time Notified
    // entered at all — must read as "no time logged", not silently proper.
    const beatriz = [
      { id: 7, empId: '3', empName: 'Beatriz Cruz', pos: 'Turndown Attendant', date: '2026-06-01', reason: 'Sick' },
    ];
    // Diego: catches the position-resolution regression guard — her real
    // dates are Feb 10 (Room Attendant, listed LAST in the array) and
    // May 1 (Supervisor, promoted, listed FIRST), plus a malformed-date
    // "N/A" record carrying a third, decoy label ("Front Desk") that would
    // wrongly win under a naive full-array date-string sort (ASCII 'N' >
    // '2' sorts it after every real date). Correct position is
    // "Supervisor" — the most recent of the two genuinely dated records.
    const diego = [
      { id: 8, empId: '4', empName: 'Diego Ramirez', pos: 'Supervisor', date: '2026-05-01', reason: 'Sick', improper: false },
      { id: 9, empId: '4', empName: 'Diego Ramirez', pos: 'Front Desk', date: 'N/A', reason: 'Bad legacy record', improper: true },
      { id: 10, empId: '4', empName: 'Diego Ramirez', pos: 'Room Attendant', date: '2026-02-10', reason: 'Sick', improper: true },
    ];
    // Elena: a REAL Housekeeping Supervisor, logged with the full
    // canonical position string. Caught in this feature's own code
    // review: HK_WEEKLY_POSITIONS' short display label for the canonical
    // key "Housekeeping Supervisor" is literally "Supervisor" — the exact
    // same bare string Diego's record above uses. Without a fold, Elena
    // and Diego would render as two separate cards both titled
    // "Supervisor" with no way to tell them apart; Elena proves they
    // correctly land in the SAME one.
    const elena = [
      { id: 13, empId: '6', empName: 'Elena Soto', pos: 'Housekeeping Supervisor', date: '2026-08-01', reason: 'Sick', improper: false },
    ];
    // Mateo: a genuinely non-housekeeping position that matches nothing
    // canonical (not a key, not a label) — the real "still shows up
    // under its own ad-hoc card" case, now that Diego/Elena's case is a
    // fold rather than an ad-hoc group.
    const mateo = [
      { id: 14, empId: '7', empName: 'Mateo Reyes', pos: 'Overnight Houseman', date: '2026-09-01', reason: 'Sick', improper: false },
    ];
    win.saveCallOffs(gady.concat(ana, carla, beatriz, diego, elena, mateo));

    win.showPage('calloffs');
    win.setCofTab('summary');
    const html = win.document.getElementById('calloffsContent').innerHTML;

    t.assert(/Employees/.test(html) && />7<\/div>/.test(html), 'the employee count stat reads 7');
    t.assert(/Call-Offs, All Time/.test(html), 'and the all-time call-off count stat renders');

    // ── Grouped by position, same canonical order HK_WEEKLY_POSITIONS
    // already uses elsewhere (Room Attendant, House Attendant,
    // Housekeeping Supervisor, Turndown, Public Area, Laundry), with
    // unmatched labels (Diego's "Supervisor") still rendering, just
    // further down under their own ad-hoc group. ──
    const roomIdx = html.indexOf('>Room Attendant<');
    const turndownIdx = html.indexOf('>Turndown<');
    const laundryIdx = html.indexOf('>Laundry<');
    t.assert(roomIdx !== -1 && turndownIdx !== -1 && laundryIdx !== -1, 'Room Attendant, Turndown, and Laundry group cards all render');
    t.assert(roomIdx < turndownIdx && turndownIdx < laundryIdx, 'groups follow the same canonical position order used elsewhere in the app, not insertion order');

    const anaIdx = html.indexOf('Ana Lopez');
    const carlaIdx = html.indexOf('Carla Ruiz');
    const gadyIdx = html.indexOf('Gady Gonzalez');
    const beaIdx = html.indexOf('Beatriz Cruz');
    const diegoIdx = html.indexOf('Diego Ramirez');
    const elenaIdx = html.indexOf('Elena Soto');
    const mateoIdx = html.indexOf('Mateo Reyes');
    t.assert([anaIdx, carlaIdx, gadyIdx, beaIdx, diegoIdx, elenaIdx, mateoIdx].every((i) => i !== -1), 'all seven employees render somewhere');

    t.eq(groupTitleFor(html, anaIdx), 'Room Attendant', 'Ana renders under the Room Attendant card');
    t.eq(groupTitleFor(html, carlaIdx), 'Room Attendant', 'Carla renders under the SAME Room Attendant card as Ana');
    t.eq(groupTitleFor(html, gadyIdx), 'Laundry', 'Gady renders under the Laundry card (HK_WEEKLY_POSITIONS\' own short label)');
    t.eq(groupTitleFor(html, beaIdx), 'Turndown', 'Beatriz renders under the Turndown card');

    // ── The exact collision caught in this feature's own code review:
    // Diego's bare "Supervisor" and Elena's canonical "Housekeeping
    // Supervisor" must fold into ONE card, not two identically-titled
    // ones with no way to tell them apart. Mateo's genuinely unmatched
    // "Overnight Houseman" still gets its own ad-hoc card. Neither the
    // malformed-date decoy ("Front Desk") nor Diego's OTHER real record
    // (Room Attendant) ever creates a group of their own. ──
    t.eq(groupTitleFor(html, diegoIdx), 'Supervisor', 'Diego renders under the Supervisor card (her real, chronologically-last position)');
    t.eq(groupTitleFor(html, elenaIdx), 'Supervisor', 'Elena (logged with the full canonical string) renders under the SAME Supervisor card as Diego');
    const supervisorTitleCount = (html.match(/<div class="card-title">Supervisor<\/div>/g) || []).length;
    t.eq(supervisorTitleCount, 1, 'exactly ONE "Supervisor" card exists — Diego and Elena are folded together, not duplicated into two identical cards');
    t.eq(groupTitleFor(html, mateoIdx), 'Overnight Houseman', 'Mateo, a genuinely non-housekeeping position, still gets his own ad-hoc card rather than vanishing');
    t.assert(html.indexOf('>Front Desk<') === -1, 'the malformed-date record\'s decoy label never creates its own group');

    const roomCardHtml = html.slice(roomIdx, html.indexOf('>Turndown<'));
    t.assert(/2 employees/.test(roomCardHtml), 'the Room Attendant card reports its own count (Ana + Carla)');
    const supervisorIdx = html.indexOf('<div class="card-title">Supervisor</div>');
    const supervisorCardHtml = html.slice(supervisorIdx, supervisorIdx + 3000);
    t.assert(/2 employees/.test(supervisorCardHtml), 'the folded Supervisor card reports 2 employees (Diego + Elena), not 1+1 split across two cards');

    const gadyBlock = html.slice(gadyIdx, gadyIdx + 1200);
    const anaBlock = html.slice(anaIdx, anaIdx + 1200);
    const beaBlock = html.slice(beaIdx, beaIdx + 1200);
    const diegoBlock = html.slice(diegoIdx, diegoIdx + 1200);

    // ── Breakdown: proper/improper counted correctly, full words (the
    // design Carlos explicitly asked to go back to) ──
    t.assert(/1 proper/.test(gadyBlock) && /2 improper/.test(gadyBlock), "Gady's breakdown is 1 proper, 2 improper");
    t.assert(/3 proper/.test(anaBlock) && /0 improper/.test(anaBlock), "Ana's breakdown is 3 proper, 0 improper");
    t.assert(/no time logged/.test(beaBlock), "Beatriz's single call-off with no Time Notified reads as unlogged, not silently proper");

    // ── Span ──
    t.assert(/73 days/.test(gadyBlock), "Gady's first-to-last span is 73 days (Jan 1 to Mar 15, 2026)");
    t.assert(/year/.test(anaBlock), "Ana's span reads in years (a full year apart), not days");
    t.assert(/—/.test(beaBlock), 'Beatriz, with only one call-off, shows a dash for span rather than "same day" or "0 days"');

    // ── Busiest 90 days ──
    t.assert(/b-yellow">3</.test(gadyBlock), "Gady's busiest 90-day window is 3 (all of them cluster together), flagged amber");
    t.assert(/b-gray">1</.test(anaBlock), "Ana's busiest 90-day window is only 1 despite the same total of 3, correctly NOT flagged");

    // ── Diego: position-resolution + malformed-date regression guard ──
    t.assert(!/NaN/.test(diegoBlock), 'the malformed-date record never leaks a NaN into the span/cluster columns');
    t.assert(/1 proper/.test(diegoBlock) && /2 improper/.test(diegoBlock),
      "Diego's breakdown counts all 3 records including the malformed-date one (1 proper, 2 improper), since it's still a real logged call-off");
    t.assert(/80 days/.test(diegoBlock), "Diego's span is 80 days (Feb 10 to May 1, 2026) — computed only from the two real dates, ignoring the malformed one");
    t.assert(/b-gray">2</.test(diegoBlock), "Diego's busiest 90-day cluster is 2 (only her two real dates), not inflated by the malformed-date record and not flagged amber");

    // ── Sort toggle now reorders WITHIN a position group (Room Attendant
    // has two people); cross-group order stays fixed by canonical
    // position, so this is the only place the toggle is actually
    // observable. ──
    t.assert(anaIdx < carlaIdx, 'default sort (Most Call-Offs) ranks Ana (3) ahead of Carla (2) within Room Attendant');
    win.setCofSummarySort('busy90');
    const html2 = win.document.getElementById('calloffsContent').innerHTML;
    const anaIdx2 = html2.indexOf('Ana Lopez');
    const carlaIdx2 = html2.indexOf('Carla Ruiz');
    t.assert(carlaIdx2 < anaIdx2, 'sorting by Busiest 90 Days ranks Carla (cluster of 2) ahead of Ana (cluster of 1), even though Ana has the higher total');
    win.setCofSummarySort('total'); // reset for the assertions below

    // ── The View link still jumps back to the Call-Offs tab, filtered to
    // that same person. ──
    const btnMatch = /cofJumpToFilter\('calloffs','([^']*)'\)/.exec(gadyBlock);
    t.assert(!!btnMatch, "Gady's row has a View link wired to cofJumpToFilter");
    win.cofJumpToFilter('calloffs', btnMatch[1]);
    t.eq(win.COF_TAB, 'calloffs', 'the View link switches back to the Call-Offs tab');
    t.eq(win.COF_FILTER, btnMatch[1], 'filtered to the same employee key the row was built from');

    // ── Carlos's new ask: a "+ New Call-Off" button right on Summary, and
    // logging one here must show up on THIS screen immediately — no tab
    // switch needed. ──
    win.setCofTab('summary');
    const html3 = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/showNewCallOffModal\(\)/.test(html3), 'Summary has its own "+ New Call-Off" button wired to the real modal');

    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-11-21';
    win.document.getElementById('coEmp').value = '50|Noor Velez|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Sick';
    win.saveNewCallOff();

    t.eq(win.COF_TAB, 'summary', 'saving from here leaves Summary as the active tab (does not bounce back to the journal)');
    const html4 = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Noor Velez/.test(html4), 'the brand-new call-off, logged from Summary itself, shows up on this same screen without switching tabs');
    t.eq(groupTitleFor(html4, html4.indexOf('Noor Velez')), 'Public Area', "and lands under her own position's card (Public Area)");
  },
};
