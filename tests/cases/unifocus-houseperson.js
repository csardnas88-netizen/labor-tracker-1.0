/* New Unifocus Labor Standard for Houseperson (House Attendant) — a read-only
   reference figure shown next to the existing LABOR_STD-based budget, not a
   replacement for it. Two shifts for now (0815-1645 driven by same-day
   departures, banded; 1430-2300 driven by occupied rooms, flat 8h) — the
   1700-2300 shift is intentionally skipped until Carlos shares its band
   table. See UNIFOCUS_HOUSEPERSON_SHIFTS in index.html. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Houseperson standard: band lookup, same-day departures, and the By Position column",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-15': {
            totalPaid: 30,
            byPosition: {
              'House Attendant': { paid: 20 },
              'Room Attendant': { paid: 40 }
            }
          },
          // No R106 entry at all for this date -> "no data yet" case below.
          '2026-07-16': {
            totalPaid: 20,
            byPosition: { 'House Attendant': { paid: 18 } }
          }
        },
        // Rooms is keyed by the PREVIOUS night (existing getRoomsForDay
        // convention) — Jul 14's count drives Jul 15's Rooms-shift budget.
        rooms: { '2026-07-14': 150 }
      },
      // Departures use the SAME calendar date as the shift they drive
      // (confirmed with Carlos) — Jul 15's Dep. Rooms drives Jul 15's
      // Departures-shift budget directly, no offset.
      'hk_r106_2026-07': {
        '2026-07-15': { occ: 150, comp: 0, net: 150, dep: 90 }
      }
    });
    const { win } = await loadApp({ seed });

    // ── Pure band-lookup logic ──
    const bands = [[1, 70, 16], [71, 140, 24], [141, 180, 32], [181, 220, 40], [221, Infinity, 48]];
    t.eq(win.unifocusBandLookup(bands, 70), 16, 'volume exactly at a band boundary (70) uses that band');
    t.eq(win.unifocusBandLookup(bands, 71), 24, 'one past the boundary (71) rolls into the next band');
    t.eq(win.unifocusBandLookup(bands, 300), 48, 'volume above the top band still resolves via the open-ended 221+ band');
    t.eq(win.unifocusBandLookup(bands, 0), 0, 'zero volume is zero hours, not a false match on the first band');

    // ── Full per-day calculation: departures band (90 -> 71-140 -> 24h) + rooms flat band (150>0 -> 8h) ──
    t.eq(win.getDeparturesForDay('2026-07-15'), 90, 'departures read from the SAME date (no prevDs offset, unlike Rooms)');
    t.eq(win.getRoomsForDay('2026-07-15'), 150, 'rooms still uses the existing previous-night convention, unaffected');
    t.eq(win.unifocusHousepersonHours('2026-07-15'), 32, '24h (departures band) + 8h (flat rooms band) = 32h total');

    // ── No R106 data at all for a date -> null, not a false zero ──
    t.eq(win.getDeparturesForDay('2026-07-16'), null, 'no R106 record for this date at all -> null');
    t.eq(win.unifocusHousepersonHours('2026-07-16'), null, 'propagates to null so the UI can show "no data" instead of a misleading 0');

    // ── By Position table: Unifocus column present, populated only for House Attendant ──
    win.dashSelectedDate = new Date(2026, 6, 15);
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(/Unifocus/.test(html), 'the By Position table has a Unifocus column header');
    t.assert(/32\.00/.test(html), "House Attendant's row shows the computed Unifocus total (32.00h)");

    // A second date with no departures data renders the em-dash, not "0.00" or blank.
    win.dashSelectedDate = new Date(2026, 6, 16);
    win.showPage('labor');
    const html2 = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(!/0\.00<\/td><\/tr>/.test(html2), 'a date with no departures data does not render a false 0.00 for Unifocus');
  }
};
