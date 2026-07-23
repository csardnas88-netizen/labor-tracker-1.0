/* Adjusted Weekly Pace by Position: a second, gold-framed card under the
   main pace that recomputes each position's Variance after subtracting
   THAT position's training + project hours for the week. Guards the math
   (per-position subtraction, not the week aggregate) and that a position
   with no training/project hours that week is left unchanged and labeled
   "unchanged", not silently altered. */
const { loadApp } = require('../_harness');
const fixture = require('../_fixture');

module.exports = {
  name: "Adjusted Weekly Pace by Position recomputes variance per position",
  async run(t) {
    const { win } = await loadApp({ seed: fixture.build() });
    const strip = win.buildWeeklyPaceHTML(
      win.loadMonthData('2026-07').days, 200,
      { start: new Date(2026, 6, 11), end: new Date(2026, 6, 17) }
    );

    t.assert(/Adjusted<\/span>/.test(strip), 'adjusted card ribbon missing');

    const adjIdx = strip.indexOf('Adjusted</span>');
    const wsIdx = strip.indexOf('Week summary');
    t.assert(adjIdx !== -1 && wsIdx !== -1 && adjIdx < wsIdx, 'expected order: pace table -> adjusted card -> week summary');

    const originalSection = strip.slice(0, adjIdx);
    const adjustedSection = strip.slice(adjIdx, wsIdx);

    function variance(section, label) {
      const idx = section.indexOf('>' + label + '<');
      t.assert(idx !== -1, 'position "' + label + '" not found in section');
      // The original table has up to 7 daily columns before Actual/Budget/
      // Variance, so the pill can sit well past a short window — the
      // adjusted card's simpler 4-column layout doesn't, but a generous
      // window covers both without accidentally spilling into the next row.
      const win2 = section.slice(idx, idx + 1600);
      const m = win2.match(/>([+-][0-9.]+)h<\/span>/);
      t.assert(m, 'variance pill not found near "' + label + '"');
      return parseFloat(m[1]);
    }

    // Fixture: Room Attendant had 9h project (Ana Lopez) + 15.5h training (Nuevo Uno).
    const raOriginal = variance(originalSection, 'Room Attendant');
    const raAdjusted = variance(adjustedSection, 'Room Attendant');
    t.assert(Math.abs(raAdjusted - (raOriginal - 9 - 15.5)) < 0.02,
      'Room Attendant adjusted variance wrong (original ' + raOriginal + 'h, adjusted ' + raAdjusted + 'h)');

    // Fixture: House Attendant had 8h project (Beto Cruz) only, no training.
    const haOriginal = variance(originalSection, 'House Attendant');
    const haAdjusted = variance(adjustedSection, 'House Attendant');
    t.assert(Math.abs(haAdjusted - (haOriginal - 8)) < 0.02,
      'House Attendant adjusted variance wrong (original ' + haOriginal + 'h, adjusted ' + haAdjusted + 'h)');

    // Turndown had no training/project hours that week — must be unchanged
    // and explicitly labeled so, not silently altered.
    const tdOriginal = variance(originalSection, 'Turndown');
    const tdAdjusted = variance(adjustedSection, 'Turndown');
    t.eq(tdAdjusted, tdOriginal, 'Turndown should be unchanged in the adjusted card');
    const tdIdx = adjustedSection.indexOf('>Turndown<');
    t.assert(/unchanged/.test(adjustedSection.slice(tdIdx, tdIdx + 300)), 'Turndown row should say "unchanged"');

    // The adjusted card's header total must equal Variance - Projects - Training
    // (the same number the Week Summary bar shows) — one source of truth.
    const totalMatch = strip.slice(adjIdx, adjIdx + 2000).match(/([+-][0-9.]+)h<\/div>\s*<div[^>]*>Dept (Over|Under) Budget/);
    t.assert(totalMatch, 'adjusted card header total not found');
    const cardTotal = parseFloat(totalMatch[1]);
    const wsBlock = strip.slice(wsIdx, wsIdx + 600);
    const wsAdjMatch = wsBlock.match(/= Adjusted <strong[^>]*>([+-][0-9.]+)h/);
    t.assert(wsAdjMatch, 'week summary Adjusted figure not found');
    t.eq(cardTotal, parseFloat(wsAdjMatch[1]), 'adjusted card total must match the Week Summary bar\'s Adjusted figure');
  }
};
