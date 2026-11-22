/* Carlos's real ask, 2026-11-21: the old "Most Call-Offs — All Time" table
   (top 8, raw total only) couldn't answer the question HR actually asks him
   in person — given someone's total, how proper vs. improper were they, and
   did they happen close together or spread out (e.g. 3 call-offs inside 90
   days reads very differently than 3 spread across a year, even though the
   total is identical). A per-employee breakdown with two time measures: the
   plain first-to-last span, and the single busiest 90-day window found
   anywhere in their history (a sliding window, not just first-vs-last — so
   a cluster buried in the middle of a longer history still surfaces).

   2026-11-22, first follow-up: Carlos rejected a denser redesign (compact
   icon chips, Tardiness folded in, default sort changed) outright — "no me
   gusta" — and asked for the original word-badge design back, split one
   card per position, plus a "+ New Call-Off" button on that screen.

   2026-11-22, second follow-up, same day: having BOTH a "Call-Offs" tab
   (journal, filter, day-of-week chart, its own New Call-Off button) AND a
   separate "Summary" tab (the position-grouped breakdown, its own New
   Call-Off button) was itself the redundancy he was pointing at — "¿no se
   pueden fusionar esas dos cosas...?" Folded into ONE screen: unfiltered
   shows the position-grouped breakdown where Summary used to live on its
   own tab; filtering to one person narrows everything down to her — the
   same breakdown as a single highlight banner, with her raw month-by-month
   log (unchanged, still editable/deletable) right underneath, instead of
   flipping to a second tab to see it. */
const { loadApp, fakeSession } = require('../_harness');

function groupTitleFor(html, nameIdx) {
  const re = /<div class="card-title">([^<]*)<\/div>/g;
  let m, last = null;
  while ((m = re.exec(html)) && m.index < nameIdx) last = m[1];
  return last;
}

module.exports = {
  name: 'Call-Offs: unfiltered shows one position-grouped breakdown card per role (word badges, span, busiest-90-day cluster); filtering to one person narrows to her highlight + raw journal; a New Call-Off button reflects immediately — all on the same screen, no separate Summary tab',
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
    // group, since cross-group order is fixed by canonical position order.
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
    // canonical (not a key, not a label) — the real "still shows up under
    // its own ad-hoc card" case, now that Diego/Elena's case is a fold.
    const mateo = [
      { id: 14, empId: '7', empName: 'Mateo Reyes', pos: 'Overnight Houseman', date: '2026-09-01', reason: 'Sick', improper: false },
    ];
    win.saveCallOffs(gady.concat(ana, carla, beatriz, diego, elena, mateo));

    win.showPage('calloffs');
    const html = win.document.getElementById('calloffsContent').innerHTML;

    // ── No more separate Summary tab — Call-Offs is the only tab besides
    // Tardiness and Overview, and it's already showing the breakdown. ──
    t.assert(!/>Summary</.test(html), 'there is no separate "Summary" tab button anymore — it is folded into Call-Offs');
    t.assert(/Call-Off(s|)\s*by Day of Week/.test(html), 'the day-of-week chart lives on this same screen');
    t.assert(/Filter by employee/.test(html), 'the employee filter lives on this same screen too');
    t.assert((html.match(/showNewCallOffModal\(\)/g) || []).length === 1, 'exactly ONE "+ New Call-Off" entry point now, not a duplicate per former tab');
    t.assert(/Employees</.test(html) && />7<\/div>/.test(html), 'the employee count stat reads 7 (Gady, Ana, Carla, Beatriz, Diego, Elena, Mateo)');
    t.assert(html.indexOf('Most Call-Offs') === -1 || !/Most Call-Offs — All Time/.test(html), 'the old raw top-8 "Most Call-Offs" ranking table is gone, superseded by the grouped breakdown');

    // ── Grouped by position, same canonical order HK_WEEKLY_POSITIONS
    // already uses elsewhere. ──
    const roomIdx = html.indexOf('>Room Attendant<');
    const turndownIdx = html.indexOf('>Turndown<');
    const laundryIdx = html.indexOf('>Laundry<');
    t.assert(roomIdx !== -1 && turndownIdx !== -1 && laundryIdx !== -1, 'Room Attendant, Turndown, and Laundry group cards all render');
    t.assert(roomIdx < turndownIdx && turndownIdx < laundryIdx, 'groups follow the same canonical position order used elsewhere in the app, not insertion order');

    // Look for the <b>Name</b> the grouped TABLE ROW renders, not the
    // first occurrence of the name anywhere on the page — the "Filter by
    // employee" dropdown (new on this unified screen, didn't exist on
    // the old standalone Summary tab) lists every employee's plain name
    // too, and sits earlier in the HTML than the grouped cards.
    const anaIdx = html.indexOf('<b>Ana Lopez</b>');
    const carlaIdx = html.indexOf('<b>Carla Ruiz</b>');
    const gadyIdx = html.indexOf('<b>Gady Gonzalez</b>');
    const beaIdx = html.indexOf('<b>Beatriz Cruz</b>');
    const diegoIdx = html.indexOf('<b>Diego Ramirez</b>');
    const elenaIdx = html.indexOf('<b>Elena Soto</b>');
    const mateoIdx = html.indexOf('<b>Mateo Reyes</b>');
    t.assert([anaIdx, carlaIdx, gadyIdx, beaIdx, diegoIdx, elenaIdx, mateoIdx].every((i) => i !== -1), 'all seven employees render somewhere');

    t.eq(groupTitleFor(html, anaIdx), 'Room Attendant', 'Ana renders under the Room Attendant card');
    t.eq(groupTitleFor(html, carlaIdx), 'Room Attendant', 'Carla renders under the SAME Room Attendant card as Ana');
    t.eq(groupTitleFor(html, gadyIdx), 'Laundry', 'Gady renders under the Laundry card (HK_WEEKLY_POSITIONS\' own short label)');
    t.eq(groupTitleFor(html, beaIdx), 'Turndown', 'Beatriz renders under the Turndown card');

    // ── The exact collision caught in this feature's own code review:
    // Diego's bare "Supervisor" and Elena's canonical "Housekeeping
    // Supervisor" must fold into ONE card. Mateo's genuinely unmatched
    // "Overnight Houseman" still gets its own ad-hoc card. ──
    t.eq(groupTitleFor(html, diegoIdx), 'Supervisor', 'Diego renders under the Supervisor card (her real, chronologically-last position)');
    t.eq(groupTitleFor(html, elenaIdx), 'Supervisor', 'Elena (logged with the full canonical string) renders under the SAME Supervisor card as Diego');
    const supervisorTitleCount = (html.match(/<div class="card-title">Supervisor<\/div>/g) || []).length;
    t.eq(supervisorTitleCount, 1, 'exactly ONE "Supervisor" card exists — Diego and Elena are folded together, not duplicated into two identical cards');
    t.eq(groupTitleFor(html, mateoIdx), 'Overnight Houseman', 'Mateo, a genuinely non-housekeeping position, still gets his own ad-hoc card rather than vanishing');
    // "Front Desk" still legitimately appears once, as that raw record's
    // own position subtitle in the always-visible journal list below —
    // what must NOT happen is a card-title (a whole GROUP) for it.
    t.assert(html.indexOf('<div class="card-title">Front Desk</div>') === -1, 'the malformed-date record\'s decoy label never creates its own group');

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

    // ── Sort toggle reorders WITHIN a position group (Room Attendant has
    // two people); cross-group order stays fixed by canonical position. ──
    t.assert(anaIdx < carlaIdx, 'default sort (Most Call-Offs) ranks Ana (3) ahead of Carla (2) within Room Attendant');
    win.setCofSummarySort('busy90');
    const html2 = win.document.getElementById('calloffsContent').innerHTML;
    const anaIdx2 = html2.indexOf('<b>Ana Lopez</b>');
    const carlaIdx2 = html2.indexOf('<b>Carla Ruiz</b>');
    t.assert(carlaIdx2 < anaIdx2, 'sorting by Busiest 90 Days ranks Carla (cluster of 2) ahead of Ana (cluster of 1), even though Ana has the higher total');
    win.setCofSummarySort('total'); // reset for the assertions below

    // ── Caught in THIS feature's own code review: the single-person
    // highlight banner used to read its position subtitle from a
    // simpler "whichever record loads first" map, different from the
    // chronological resolution the grouped cards above already use —
    // so clicking View from a card correctly titled with Paula's CURRENT
    // position could show a stale one right underneath it on the same
    // screen. Her OLDER record (Laundry) is listed FIRST in the array;
    // her NEWER one (Room Attendant, a real promotion) is listed second
    // — the exact ordering that exposes "first record wins" vs. "most
    // recent real date wins". ──
    const paula = [
      { id: 15, empId: '8', empName: 'Paula Nunez', pos: 'Laundry Attendant', date: '2026-01-10', reason: 'Sick' },
      { id: 16, empId: '8', empName: 'Paula Nunez', pos: 'Room Attendant', date: '2026-06-15', reason: 'Sick' },
    ];
    win.saveCallOffs(gady.concat(ana, carla, beatriz, diego, elena, mateo, paula));
    win.showPage('calloffs');
    const htmlPaula = win.document.getElementById('calloffsContent').innerHTML;
    const paulaIdx = htmlPaula.indexOf('<b>Paula Nunez</b>');
    t.eq(groupTitleFor(htmlPaula, paulaIdx), 'Room Attendant', "Paula's grouped card correctly shows her CURRENT position (Room Attendant, the more recent real date)");
    const paulaKeyMatch = /setCallOffFilter\('([^']*)'\)/.exec(htmlPaula.slice(paulaIdx, paulaIdx + 1200));
    t.assert(!!paulaKeyMatch, "Paula's row has its own View link");
    win.setCallOffFilter(paulaKeyMatch[1]);
    const paulaFilteredHtml = win.document.getElementById('calloffsContent').innerHTML;
    // Slice to just the highlight banner itself (from its own distinctive
    // wrapper style to the next card, i.e. the raw journal below it) —
    // the journal legitimately shows "Laundry Attendant" on her OLD
    // January entry, since that genuinely was her position back then;
    // only the BANNER must show her current one.
    const bannerStart = paulaFilteredHtml.indexOf('background:var(--red-bg);border-radius:10px;padding:14px 16px;');
    const bannerEnd = paulaFilteredHtml.indexOf('<div class="card-head">', bannerStart);
    const bannerHtml = paulaFilteredHtml.slice(bannerStart, bannerEnd);
    t.assert(/Room Attendant/.test(bannerHtml) && !/Laundry Attendant/.test(bannerHtml),
      'her highlight banner shows the SAME current position (Room Attendant) as the grouped card she was just viewed from — not the stale Laundry Attendant from her older record');
    win.setCallOffFilter('all'); // reset

    // ── Clicking "View" on a row no longer jumps to a different tab — it
    // just filters this SAME screen down to that one person, whose
    // breakdown now renders as a highlight banner (not a table row) with
    // her raw journal right underneath. ──
    const btnMatch = /setCallOffFilter\('([^']*)'\)/.exec(gadyBlock);
    t.assert(!!btnMatch, "Gady's row has a View link wired to setCallOffFilter");
    win.setCallOffFilter(btnMatch[1]);
    t.eq(win.COF_FILTER, btnMatch[1], 'filtered to Gady\'s own key');
    const filteredHtml = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Gady Gonzalez/.test(filteredHtml) && /Total Call-Offs/.test(filteredHtml), 'her highlight banner renders (name + Total Call-Offs)');
    t.assert(/1 proper/.test(filteredHtml) && /2 improper/.test(filteredHtml), 'the SAME breakdown (proper/improper) shows on her highlight banner, not just in the grouped table');
    t.assert(/Busiest 90 days/.test(filteredHtml) && /b-yellow">3</.test(filteredHtml), 'her busiest-90-day cluster shows on the highlight banner too');
    t.assert(/Family/.test(filteredHtml) && /2026-03-15/.test(filteredHtml), 'her raw, editable/deletable journal entries still render right underneath the highlight banner');
    // Ana's name still legitimately appears once, in the "Filter by
    // employee" dropdown's own option list (every employee is always
    // offered there) — but none of HER OWN call-off dates/records leak
    // into Gady's filtered journal below.
    t.assert(!/2025-01-01/.test(filteredHtml) && !/2025-07-01/.test(filteredHtml), "someone else's (Ana's) records do not leak into Gady's filtered journal");
    win.setCallOffFilter('all'); // reset

    // ── Carlos's other ask, same day: a "+ New Call-Off" button right on
    // this screen, and logging one here must show up immediately. ──
    win.showNewCallOffModal();
    win.document.getElementById('coDate').value = '2026-11-21';
    win.document.getElementById('coEmp').value = '50|Noor Velez|Public Area Attendant';
    win.document.getElementById('coReason').value = 'Sick';
    win.saveNewCallOff();

    const html3 = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(/Noor Velez/.test(html3), 'the brand-new call-off, logged from here, shows up on this same screen immediately');
    t.eq(groupTitleFor(html3, html3.indexOf('<b>Noor Velez</b>')), 'Public Area', "and lands under her own position's card (Public Area)");
  },
};
