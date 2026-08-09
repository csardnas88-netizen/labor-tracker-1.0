/* Bug report from Carlos: filtering Call-Offs by employee only showed
   that employee's call-offs FOR THE CURRENT MONTH, hiding older history.

   Root cause: the "Filter by employee" dropdown and the underlying filter
   both grouped call-offs by the compound key empId+'|'+empName. Before
   the New Call-Off search box guaranteed a real Paychex id on every save
   (see call-off-employee-list.js), some older records were saved with a
   blank empId. A later call-off for the SAME person, logged after that
   fix, carries a real id — a different compound key even though it's the
   exact same employee and name. That split one real person into two
   entries in the dropdown ("Heidy Ajsoc" appearing twice with different
   counts); picking whichever one happened to hold only the recent record
   showed just that record's month and nothing older.

   Fixed by resolving identity primarily by (normalized) name — an id-less
   legacy record folds into the same group as a same-named record that
   does have an id, via _coKeyEmployees()'s nameToId pass — while two
   genuinely different people with different names still stay separate. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Call-Offs filter by employee shows an employee's full history, even when older records were saved without a Paychex id",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'calloffs_data': JSON.stringify([
        { id: 1, date: '2026-06-05', empId: '', empName: 'Heidy Ajsoc', pos: 'Room Attendant', reason: 'Sick', created: '2026-06-05T00:00:00.000Z' },
        { id: 2, date: '2026-07-10', empId: '', empName: 'Heidy Ajsoc', pos: 'Room Attendant', reason: 'Family', created: '2026-07-10T00:00:00.000Z' },
        { id: 3, date: '2026-08-03', empId: '26100006', empName: 'Heidy Ajsoc', pos: 'Room Attendant', reason: 'Sick', created: '2026-08-03T00:00:00.000Z' },
        { id: 4, date: '2026-05-01', empId: '26100015', empName: 'Yorlin Arias Hurtado', pos: 'Turndown Attendant', reason: 'Sick', created: '2026-05-01T00:00:00.000Z' }
      ])
    });
    const { win } = await loadApp({ seed });
    win.showPage('calloffs');

    // ── The dropdown must offer Heidy ONCE, with all 3 of her records
    // counted together — not split into an id-less group and an id group. ──
    let sel = win.document.getElementById('coFilterEmp');
    let heidyOpts = Array.from(sel.options).filter((o) => /Heidy/.test(o.textContent));
    t.eq(heidyOpts.length, 1, 'Heidy Ajsoc appears as a single dropdown entry, not split by whether the record has an id');
    t.assert(/\(3\)/.test(heidyOpts[0].textContent), 'her count folds all 3 records together (Jun+Jul+Aug), not just the id-carrying one');

    // ── Selecting her shows June AND July (the id-less legacy records)
    // alongside August (the id-carrying one) — the exact history Carlos
    // reported as missing. ──
    win.setCallOffFilter(heidyOpts[0].value);
    let html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(html.indexOf('2026-06-05') !== -1, 'June (id-less legacy record) shows under the filter');
    t.assert(html.indexOf('2026-07-10') !== -1, 'July (id-less legacy record) shows under the filter');
    t.assert(html.indexOf('2026-08-03') !== -1, 'August (id-carrying record) shows under the filter too');
    t.assert(/Total Call-Offs/.test(html) && />3</.test(html.slice(html.indexOf('Total Call-Offs') - 200, html.indexOf('Total Call-Offs') + 50)), 'the header total reflects all 3, not just the current month');

    // ── A genuinely different person must NOT get folded into Heidy's
    // group just because both records exist in the same list. ──
    sel = win.document.getElementById('coFilterEmp');
    const yorlinOpt = Array.from(sel.options).find((o) => /Yorlin/.test(o.textContent));
    t.assert(yorlinOpt, 'Yorlin Arias Hurtado still has her own separate dropdown entry');
    win.setCallOffFilter(yorlinOpt.value);
    html = win.document.getElementById('calloffsContent').innerHTML;
    t.assert(html.indexOf('2026-05-01') !== -1, "Yorlin's own record shows under her filter");
    t.assert(html.indexOf('2026-06-05') === -1 && html.indexOf('2026-08-03') === -1, "Heidy's records do not leak into Yorlin's filtered view");

    // ── Export PDF must respect the same folded identity (it used to
    // compute its own separate, unfixed empId+name key). ──
    win.setCallOffFilter(heidyOpts[0].value);
    const list = win.loadCallOffs();
    win._coKeyEmployees(list);
    const filtered = list.filter((c) => c._coKey === win.COF_FILTER);
    t.eq(filtered.length, 3, "exportCallOffsPDF's filter (same _coKeyEmployees pass) also resolves all 3 of Heidy's records, not just the current month's");
  }
};
