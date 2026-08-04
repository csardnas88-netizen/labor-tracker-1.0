/* New Unifocus Labor Standard for Houseperson (House Attendant) — a read-only
   reference figure shown next to the existing LABOR_STD-based budget, not a
   replacement for it. Two shifts for now (0815-1645 driven by same-day
   departures, banded; 1430-2300 driven by occupied rooms, flat 8h) — the
   1700-2300 shift is intentionally skipped until Carlos shares its band
   table. See UNIFOCUS_STANDARDS in index.html (this file covers House
   Attendant plus all the shared mechanics — band lookup, manual-entry
   departures, date alignment; see unifocus-supervisor.js for the
   position-generalization coverage once a 2nd position was added). */
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
    t.eq(win.unifocusHoursForPosition('House Attendant', '2026-07-15'), 32, '24h (departures band) + 8h (flat rooms band) = 32h total');

    // ── No R106 data at all for a date -> null, not a false zero ──
    t.eq(win.getDeparturesForDay('2026-07-16'), null, 'no R106 record for this date at all -> null');
    t.eq(win.unifocusHoursForPosition('House Attendant', '2026-07-16'), null, 'propagates to null so the UI can show "no data" instead of a misleading 0');

    // A position with no Unifocus standard on file at all -> null, distinct
    // from "standard exists but no data for this day yet".
    t.eq(win.unifocusHoursForPosition('Public Area Attendant', '2026-07-15'), null, 'a position with no Unifocus standard defined returns null, not 0');

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

    // ── Departures is manually editable, same as Rooms (Carlos's explicit
    // request) — a hand-entered value wins over R106 and survives a later
    // R106 re-upload, mirroring saveRoomsForDate/roomsSource exactly. ──
    win.saveDeparturesForDate('2026-07-15', '55');
    t.eq(win.getDeparturesForDay('2026-07-15'), 55, 'a manual entry overrides the R106-derived value (90 -> 55)');
    t.eq(win.unifocusHoursForPosition('House Attendant', '2026-07-15'), 24, '55 departures -> 1-70 band -> 16h, + 8h flat rooms band = 24h');

    // R106 still says 90 underneath — re-uploading must NOT clobber the
    // manual 55, same protection Rooms already has via roomsSource.
    const r106After = JSON.parse(win.localStorage.getItem('hk_r106_2026-07'));
    t.eq(r106After['2026-07-15'].dep, 90, 'the raw R106 record is untouched by the manual override');
    t.eq(win.getDeparturesForDay('2026-07-15'), 55, 'manual value still wins after confirming R106 data is still 90 underneath');

    // Clearing the input (empty value) removes the manual override's stored
    // number but the day stays flagged 'manual' -> falls back to null, not
    // back to R106's 90 (an explicit clear is a deliberate "I don't know"
    // for this hand-entered day, not "go re-read R106").
    win.saveDeparturesForDate('2026-07-15', '');
    t.eq(win.getDeparturesForDay('2026-07-15'), null, 'clearing the manual entry reads back as null, not a silent revert to R106');

    // The Rooms card renders an actual editable input for Departures (not
    // just read-only text), pre-filled from R106 when no manual entry
    // exists yet, mirroring the Rooms input right above it.
    win.dashSelectedDate = new Date(2026, 6, 15);
    win.showPage('labor');
    const roomsCardHtml = win.document.querySelector('.rooms-day-card').innerHTML;
    t.assert(/data-ds="2026-07-15"/.test(roomsCardHtml), 'the Departures input is wired to the day itself (ds), not the previous night');
  }
};
