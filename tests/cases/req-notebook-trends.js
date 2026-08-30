/* Request Off "Trends" tab — Carlos's ask: when someone complains
   "she always gets the weekend off and I never do", there needs to be
   a real record to check that against instead of a feeling, including
   whether the person raising the complaint has had just as many
   weekends herself. Breaks every logged request down by day of week
   per person, sorted so the heaviest weekend user sits on top. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'Request Off Trends: per-person day-of-week breakdown, sorted by weekend count, filterable by request type',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // Susan: two Saturdays R-OFF (2026-09-05, 2026-09-12) — the person
    // allegedly always getting the weekend.
    // Maria: one Sunday and one Monday R-OFF — the one complaining she
    // never gets it, except the record shows she actually had one too.
    const entries = [
      { id: 1, name: 'Susan', crewKey: 'gra', crewLabel: 'Room Attendant', type: 'roff', dates: ['2026-09-05'], capturedBy: 'Carlos', capturedAt: '2026-09-01T00:00:00.000Z' },
      { id: 2, name: 'Susan', crewKey: 'gra', crewLabel: 'Room Attendant', type: 'roff', dates: ['2026-09-12'], capturedBy: 'Carlos', capturedAt: '2026-09-01T00:00:00.000Z' },
      { id: 3, name: 'Maria', crewKey: 'gra', crewLabel: 'Room Attendant', type: 'roff', dates: ['2026-09-06', '2026-09-07'], capturedBy: 'Carlos', capturedAt: '2026-09-01T00:00:00.000Z' },
      // A vacation entry for Susan too — must NOT bleed into the R-OFF count.
      { id: 4, name: 'Susan', crewKey: 'gra', crewLabel: 'Room Attendant', type: 'vac', dates: ['2026-09-08'], capturedBy: 'Carlos', capturedAt: '2026-09-01T00:00:00.000Z' }
    ];
    win.saveReqNotebook(entries);

    // ── Default type is R-OFF ──
    const data = win.rnTrendsData();
    t.eq(data.Susan.dow[0], 2, 'Susan has 2 Saturdays (index 0) logged as R-OFF');
    t.eq(data.Susan.dow[0] + data.Susan.dow[1], 2, "Susan's weekend total (Sat+Sun) is 2");
    t.eq(data.Susan.total, 2, "Susan's R-OFF total excludes her vacation day");
    t.eq(data.Maria.dow[1], 1, 'Maria has 1 Sunday (index 1) logged');
    t.eq(data.Maria.dow[2], 1, 'Maria has 1 Monday (index 2) logged');
    t.eq(data.Maria.dow[0] + data.Maria.dow[1], 1, "Maria's weekend total is 1 — she is not actually shut out of weekends, just behind Susan's 2");

    // ── Rendered table: sorted by weekend count, Susan (2) above Maria (1) ──
    win.rnSetTab('trends');
    const html = win.document.getElementById('reqNotebookContent').innerHTML;
    t.assert(/>Weekend</.test(html) && /Sat<\/th>/.test(html) && /Fri<\/th>/.test(html), 'the table has a Weekend column and all seven day-of-week headers');
    const susanIdx = html.indexOf('>Susan<');
    const mariaIdx = html.indexOf('>Maria<');
    t.assert(susanIdx !== -1 && mariaIdx !== -1 && susanIdx < mariaIdx,
      "Susan (2 weekend days) is ranked above Maria (1) — the exact comparison Carlos wants to check a fairness complaint against");

    // ── Carlos's real report: Sat/Sun/Weekend headers were invisible
    // because the app's global "thead tr{background:navy}" swallowed
    // var(--navy) text — the exact color those headers used. Pin that
    // the header block no longer uses navy-on-navy anywhere. ──
    const theadSegment = html.substring(html.indexOf('<thead'), html.indexOf('</thead>'));
    t.assert(!/color:var\(--navy\)/.test(theadSegment),
      'no header cell uses navy text against the global navy header background anymore (the exact bug Carlos reported — Sat/Sun/Weekend were unreadable)');

    // ── Click a name to see the actual dates behind the count ──
    t.assert(!/Sat Sep 5/.test(html), 'no dates are shown before a name is clicked');
    win.rnToggleTrendsName('Susan');
    const openHtml = win.document.getElementById('reqNotebookContent').innerHTML;
    t.assert(/Sat Sep 5/.test(openHtml) && /Sat Sep 12/.test(openHtml),
      "clicking Susan's name reveals the exact dates behind her count of 2 — Carlos's ask, so the number isn't just trusted blind");
    t.assert(!/Sun Sep 6/.test(openHtml), "only Susan's dates open — Maria's Sunday isn't shown just because Susan's row is expanded");
    win.rnToggleTrendsName('Susan'); // click again to close
    const closedHtml = win.document.getElementById('reqNotebookContent').innerHTML;
    t.assert(!/Sat Sep 5/.test(closedHtml), 'clicking the same name again collapses the date list');

    // ── Type filter: switching to Vacation only counts Susan's one vac day, not either R-OFF entry ──
    win.rnSetTrendsType('vac');
    const vacData = win.rnTrendsData();
    t.eq(vacData.Susan.total, 1, 'switching to the Vacation filter counts only the vacation entry');
    t.assert(!vacData.Maria, 'Maria has no vacation entries at all, so she drops out of the Vacation view entirely');

    // ── Empty state: a type with nothing logged says so plainly ──
    win.rnSetTrendsType('flex');
    const flexHtml = win.document.getElementById('reqNotebookContent').innerHTML;
    t.assert(/No Flex requests logged yet/.test(flexHtml), 'an empty type says plainly there is nothing to compare, rather than an empty table');

    win.rnSetTrendsType('roff'); // leave state clean for any test after this one
  }
};
