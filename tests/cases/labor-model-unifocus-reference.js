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
    t.assert(/trimmed to whole 6h shifts/.test(html), "the 6h shift trimming is explained where it applies");
    t.assert(/>30h/.test(html), "Turndown's 32h band is shown as the 30h it actually counts as");

    // ── Public Area's day-of-week exception is surfaced rather than
    // flattened into one number. ──
    t.assert(/Wed 24h/.test(html), "Public Area's Wednesday overnight exception is called out by day");

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
