/* Carlos asked for the Unifocus standard to be documented inside the app
   ("agregar el nuevo estándar de Unifocus en la sección del Labor Model"),
   next to the editable Current Standard it can be toggled against on the
   Labor page. Until now those band tables only existed in code, so the
   numbers behind the toggle weren't inspectable mid-meeting.

   Two properties matter here and are easy to break later:

   1) It renders from UNIFOCUS_STANDARDS itself, not a hand-copied
      duplicate. If someone corrects a band in the standard, this card has
      to move with it — a second copy would quietly disagree with the
      figures the Labor page actually computes, which is worse than not
      showing them at all.
   2) It is READ-ONLY. The Current Standard table above it is a form;
      this must not be, or it becomes a way to silently drift out of
      agreement with Unifocus's own report. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Labor Model documents the Unifocus standard read-only, rendered from UNIFOCUS_STANDARDS rather than a hand-copied duplicate",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const html = win.buildUnifocusStandardHTML();

    // ── Every position is covered: the five banded ones plus Room
    // Attendant, whose standard is a rate and isn't in UNIFOCUS_STANDARDS. ──
    ['House Attendant', 'Supervisor', 'Laundry', 'Turndown', 'Public Area'].forEach((label) => {
      t.assert(html.indexOf('>' + label + '<') !== -1, label + ' appears in the reference');
    });
    t.assert(/Room Attendant/.test(html), 'Room Attendant appears too, even though it has no banded standard');
    t.assert(/20 min/.test(html) && /30 min/.test(html), "Room Attendant's rate formula is spelled out (20 min / 30 min)");
    t.assert(/85%/.test(html), "and its fixed 85% Stayover assumption is stated, since that's the number that gets challenged");

    // ── Rendered FROM the live standard, not a copy. Change a band and the
    // card must change with it. ──
    t.assert(/136&ndash;180/.test(html), "Turndown's real 136-180 band boundary is rendered from the standard");
    const realBands = win.UNIFOCUS_STANDARDS['Turndown Attendant'][0].bands;
    win.UNIFOCUS_STANDARDS['Turndown Attendant'][0].bands = [[1, 999, 12]];
    const edited = win.buildUnifocusStandardHTML();
    win.UNIFOCUS_STANDARDS['Turndown Attendant'][0].bands = realBands; // restore
    t.assert(/1&ndash;999/.test(edited), 'editing the standard changes the card — it reads UNIFOCUS_STANDARDS, it does not duplicate it');
    t.assert(!/136&ndash;180/.test(edited), 'and the old band is gone, confirming nothing is hand-copied');

    // ── Turndown's whole-shift trimming is shown, not just the raw band —
    // this is the exact discrepancy that took a day to track down against
    // Unifocus's own reports, so the card has to explain it. ──
    t.assert(/band 32h, trimmed/.test(html), 'the trimming is called out on the bands where it actually changes a number');
    t.assert(/30h/.test(html), "Turndown's 32h band is shown as the 30h it actually counts as");

    // ── Public Area's day-of-week exception is surfaced rather than
    // flattened into one number. ──
    t.assert(/Wed 24h/.test(html), "Public Area's Wednesday overnight exception is called out by day");

    // ── Headcount, Carlos's ask: he shouldn't have to work out 24 ÷ 8 in
    // his head while building a schedule. Every shift declares its length,
    // so hours divide into whole people — and the count is labelled with
    // the ROLE ("3 Supervisors"), his follow-up, so a band reads as the
    // staffing decision it is rather than an abstract "3 people". ──
    t.assert(/Staff/.test(html), 'the bands carry a staff column');
    t.assert(/8h shift/.test(html), 'each shift states its own length, so the division is inspectable');
    t.assert(!/people</.test(html), 'the generic "people" wording is gone — every count is named by role');

    // Supervisor is Carlos's literal example: 24h -> 3 Supervisors.
    const supIdx = html.indexOf('>Supervisor<');
    // Wide enough to reach the SECOND shift (1430-2300), where the
    // singular case lives — the five bands of the first shift alone run
    // past 2500 characters of markup.
    const supBlock = html.slice(supIdx, html.indexOf('>Laundry<'));
    t.assert(/71&ndash;140[\s\S]{0,300}?24h[\s\S]{0,200}?>3<\/span>[\s\S]{0,120}?Supervisors</.test(supBlock),
      "Supervisor's 24h band reads as 3 Supervisors — the exact case Carlos described");
    t.assert(/141&ndash;180[\s\S]{0,300}?32h[\s\S]{0,200}?>4<\/span>[\s\S]{0,120}?Supervisors</.test(supBlock),
      'and 32h reads as 4 Supervisors');
    t.assert(/>1<\/span>[\s\S]{0,120}?Supervisor</.test(supBlock), 'a one-person shift reads "1 Supervisor", singular');

    // Each position uses its OWN role name, not a shared one. The shortened
    // card labels ("Laundry", "Public Area") would read as a place rather
    // than a person with a count in front, so the role names spell them out.
    t.assert(/House Attendants</.test(html), 'House Attendant has its own plural');
    t.assert(/Laundry Attendants</.test(html), 'Laundry reads as "Laundry Attendants", not the bare "Laundry" card label');
    t.assert(/Public Area Attendants</.test(html), 'Public Area likewise reads as a role');
    t.assert(/Turndown Attendants</.test(html), 'and Turndown');

    // Turndown divides by its own 6h shift, not a blanket 8 — 30h = 5.
    const tdIdx = html.indexOf('>Turndown<');
    const tdBlock = html.slice(tdIdx, tdIdx + 2500);
    t.assert(/6h shift/.test(tdBlock), 'Turndown states its 6h shift length');
    t.assert(/>5<\/span>[\s\S]{0,120}?Turndown Attendants</.test(tdBlock), "Turndown's trimmed 30h reads as 5 (30 ÷ 6), not 3.75 by a blanket 8h assumption");
    t.assert(!/\d+\.\d+\s*(<[^>]*>)?\s*[A-Z]/.test(html), 'no fractional headcount anywhere — trimming to whole shifts is what guarantees this');

    // ── Read-only: no form controls anywhere in it. The editable Current
    // Standard table above is where inputs belong. ──
    t.assert(!/<input/.test(html), 'the reference renders no inputs');
    t.assert(!/<select/.test(html), 'and no selects');
    t.assert(!/<textarea/.test(html), 'and no textareas');
    t.assert(!/onchange=/.test(html), 'and wires up no change handlers');

    // ── It's collapsed by default on the page — a lookup, not something to
    // scroll past to reach the editable table. ──
    win.showPage('labormodel');
    const wrap = win.document.getElementById('unifocusStdWrap');
    t.assert(wrap, 'the reference section exists on the Labor Model page');
    t.eq(wrap.style.display, 'none', 'it starts collapsed');
    win.toggleUnifocusStd();
    t.assert(wrap.style.display !== 'none', 'and opens when tapped');
  }
};
