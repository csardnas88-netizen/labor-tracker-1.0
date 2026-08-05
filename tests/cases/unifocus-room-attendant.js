/* Sixth and last position added to the Unifocus Labor Standard: Room
   Attendant. Unlike every other position (a stepped band lookup),
   Carlos's own math for Room Attendant is a continuous per-room RATE:
   20 min for 85% of Stayovers + 30 min per Departure, where Stayovers =
   last night's rooms minus today's departures (the app's existing
   night-before/same-day conventions). That's why it's computed directly
   by unifocusRoomAttendantHours() rather than living in
   UNIFOCUS_STANDARDS/unifocusBandLookup like the rest.

   The 85% is a FIXED assumption baked into the budget math — confirmed
   explicitly with Carlos ("Es fijo. El conteo será para evidencia,
   justificación aparte"). The REAL daily DND evidence is tracked
   separately as the actual room list Carlos types in (Carlos's own
   follow-up ask: he needs to know WHICH rooms, not just a total, in case
   of an audit) — getDNDRoomsForDay/saveDNDRoomsForDate store the raw
   comma-separated list, and getDNDCountForDay derives the count from it.
   This file's second half proves that count never leaks into the budget
   calculation itself, no matter what's entered. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Room Attendant standard: 85% of Stayovers at 20min + Departures at 30min, with a separate non-math-affecting DND count",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      // See [[labor-tracker-tests]] — skips the legacy rooms migration that
      // would otherwise reshuffle rooms[] keys on dates that also have a
      // days[] snapshot.
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-15': { totalPaid: 60, byPosition: { 'Room Attendant': { paid: 55 } } },
          // No R106 entry at all for this date -> departures unknown.
          '2026-07-16': { totalPaid: 40, byPosition: { 'Room Attendant': { paid: 40 } } }
        },
        // Previous night's rooms drives Jul 15's Stayovers, same convention
        // as every other Rooms-driven position.
        rooms: { '2026-07-14': 200 }
      },
      'hk_r106_2026-07': {
        '2026-07-15': { occ: 200, comp: 0, net: 200, dep: 40 }
      }
    });
    const { win } = await loadApp({ seed });

    // ── Core formula: Stayovers = 200 rooms - 40 departures = 160.
    // (160 * 0.85 * 20 + 40 * 30) / 60 = (2720 + 1200) / 60 = 65.33h. ──
    t.eq(win.getRoomsForDay('2026-07-15'), 200, 'rooms uses the existing night-before convention, unaffected');
    t.eq(win.getDeparturesForDay('2026-07-15'), 40, 'departures uses the existing same-day convention, unaffected');
    const hours = win.unifocusHoursForPosition('Room Attendant', '2026-07-15');
    t.assert(Math.abs(hours - 65.3333) < 0.001, 'Stayovers(160) x 85% x 20min + 40 departures x 30min = 65.33h (got ' + hours + ')');

    // ── No departures data at all for a date -> null (Stayovers can't be
    // derived), same null-propagation convention as every other position. ──
    t.eq(win.getDeparturesForDay('2026-07-16'), null, 'no R106 record for this date at all -> null');
    t.eq(win.unifocusHoursForPosition('Room Attendant', '2026-07-16'), null, 'Room Attendant also returns null when departures data is missing, not a false 0 or a partial calculation');

    // ── The 85%/15% split is a FIXED constant, never derived from the
    // day's actual DND count. ──
    t.eq(win.RA_STAYOVER_PCT, 0.85, 'the Stayover percentage is the fixed 85% Carlos confirmed');
    t.eq(win.RA_STAYOVER_MIN, 20, '20 minutes per Stayover room');
    t.eq(win.RA_DEPARTURE_MIN, 30, '30 minutes per Departure room');

    // ── DND rooms: manual entry as a comma-separated room list (Carlos's
    // explicit ask — an audit trail of WHICH rooms, not just a total),
    // read back correctly, and proven to never affect the budget above no
    // matter what's entered. ──
    const dndRoomList = Array.from({ length: 24 }, (_, i) => 1301 + i).join(', '); // 24 rooms, e.g. "1301, 1302, ..."
    t.eq(win.getDNDRoomsForDay('2026-07-15'), '', 'no DND rooms entered yet -> empty string');
    t.eq(win.getDNDCountForDay('2026-07-15'), null, 'no DND rooms entered yet -> null count, not 0');
    win.saveDNDRoomsForDate('2026-07-15', dndRoomList);
    t.eq(win.getDNDRoomsForDay('2026-07-15'), dndRoomList, 'the raw room list reads back exactly what was saved');
    t.eq(win.getDNDCountForDay('2026-07-15'), 24, 'the count is derived from the room list (24 rooms listed)');
    const hoursAfterDND = win.unifocusHoursForPosition('Room Attendant', '2026-07-15');
    t.eq(hoursAfterDND, hours, "entering DND rooms doesn't change the Unifocus budget at all — it's pure evidence, not an input to the formula");

    // The field is a textarea — typing one room per line instead of
    // comma-separating is natural with a long list, and the count must
    // still come out right.
    win.saveDNDRoomsForDate('2026-07-15', '1301\n1302\n1303');
    t.eq(win.getDNDCountForDay('2026-07-15'), 3, 'newline-separated room numbers are counted correctly too, not just comma-separated ones');
    win.saveDNDRoomsForDate('2026-07-15', dndRoomList); // restore the comma-separated list for the rest of this test

    // Clearing it back out reads as empty/null again, not a silent revert to 0.
    win.saveDNDRoomsForDate('2026-07-15', '');
    t.eq(win.getDNDCountForDay('2026-07-15'), null, 'clearing the DND room list reads back as null count');
    win.saveDNDRoomsForDate('2026-07-15', dndRoomList); // restore for the render check below

    // ── By Position table: Room Attendant's row shows the real Unifocus
    // total, and — once DND rooms are entered — a justification caption
    // with the real percentage against the fixed-85% assumption. ──
    win.dashSelectedDate = new Date(2026, 6, 15);
    win.setLaborStandardMode('unifocus');
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = html.split('<tr>');
    const roomRow = rows.find((r) => />Room</.test(r)) || '';
    t.assert(/65\.33/.test(roomRow), "Room Attendant's row shows its computed Unifocus total (65.33h)");
    // Stayovers = 160, DND count = 24 -> 24/160 = 15.0%
    t.assert(/24 DND/.test(roomRow), 'the justification caption shows the real derived DND count');
    t.assert(/15\.0% of 160 stayovers/.test(roomRow), "the caption shows the real percentage (15.0%) against the day's actual Stayovers (160), for comparison against the standard's fixed 85/15 assumption");

    // The Occupancy card gained a third tile for the DND room list,
    // alongside Rooms and Departures — the actual room numbers are
    // preserved in the field, not just a count, so Carlos has the list on
    // hand for an audit.
    const occHtml = win.document.querySelector('.rooms-day-card').innerHTML;
    t.assert(/occ-tile-label"[^>]*>DNDs/.test(occHtml), 'the Occupancy card has a DNDs tile alongside Rooms and Departures');
    t.assert(occHtml.indexOf(dndRoomList) !== -1, 'the actual room list text is preserved in the field, not collapsed to just a count');
    t.assert(/data-ds="2026-07-15"/.test(occHtml), 'the DND input is wired to the day itself, not the previous night');
  }
};
