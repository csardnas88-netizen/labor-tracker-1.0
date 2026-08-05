/* Second position added to the Unifocus Labor Standard (after House
   Attendant): Housekeeping Supervisor, from Unifocus's own "Hskpg
   Supervisor" report page. This is what proved UNIFOCUS_STANDARDS/
   unifocusHoursForPosition needed to be position-keyed instead of
   hardcoded to House Attendant — see unifocus-houseperson.js for the
   shared mechanics (band lookup, manual-entry departures, date alignment),
   which this file deliberately does not re-test. Same two shifts, same
   band numbers as House Attendant (Unifocus's own data, not a copy-paste
   assumption on this app's part) — only the shift clock times differ
   (0830-1700 vs 0815-1645), and this app never uses clock times, only the
   band tables, so that difference doesn't affect anything computed here. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Unifocus Labor Standard covers a second position (Housekeeping Supervisor), independently of House Attendant",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_month_2026-07': {
        days: {
          '2026-07-20': {
            totalPaid: 50,
            byPosition: {
              'Housekeeping Supervisor': { paid: 28 },
              'House Attendant': { paid: 22 },
              'Room Attendant': { paid: 60 }
            }
          }
        },
        rooms: { '2026-07-19': 100 } // previous night -> drives Jul 20's Rooms-shift budget
      },
      'hk_r106_2026-07': {
        '2026-07-20': { occ: 100, comp: 0, net: 100, dep: 45 } // 45 -> 1-70 band -> 16h
      }
    });
    const { win } = await loadApp({ seed });

    // Both positions are driven by the SAME departures/rooms inputs for the
    // day, but computed independently via their own UNIFOCUS_STANDARDS entry.
    t.eq(win.unifocusHoursForPosition('Housekeeping Supervisor', '2026-07-20'), 24, '16h (departures 45 -> 1-70 band) + 8h (flat rooms band) = 24h for Supervisor');
    t.eq(win.unifocusHoursForPosition('House Attendant', '2026-07-20'), 24, 'House Attendant computes independently from the same day\'s inputs — happens to match here since both positions share identical band tables');

    // Changing House Attendant's standard has no effect on Supervisor's, and
    // vice versa — they're separate entries, not a shared reference.
    t.assert(win.UNIFOCUS_STANDARDS['Housekeeping Supervisor'] !== win.UNIFOCUS_STANDARDS['House Attendant'], 'Supervisor and House Attendant have distinct shift/band arrays, not the same array reused');

    // By Position table: all three positions show their own real Unifocus
    // figure, computed independently from the same day's rooms/departures.
    // Room Attendant's standard (added in v6.90.0 — see
    // unifocus-room-attendant.js) is a per-room rate, not a banded lookup
    // like Supervisor/House Attendant, so it lands on a different number
    // even though it's driven by the same inputs — proof it isn't
    // secretly sharing their band tables.
    win.dashSelectedDate = new Date(2026, 6, 20);
    win.setLaborStandardMode('unifocus');
    win.showPage('labor');
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;
    const rows = html.split('<tr>').filter((r) => /Sup\.Supervisor|>House<|>Room</.test(r));
    const supRow = rows.find((r) => /Sup\.Supervisor/.test(r)) || '';
    const houseRow = rows.find((r) => />House</.test(r)) || '';
    const roomRow = rows.find((r) => />Room</.test(r)) || '';
    t.assert(/24\.00/.test(supRow), "Supervisor's row shows its own Unifocus total (24.00h)");
    t.assert(/24\.00/.test(houseRow), "House Attendant's row still shows its own Unifocus total too");
    // Stayovers = 100 rooms - 45 departures = 55; (55*0.85*20 + 45*30) / 60 = 38.08h
    t.assert(/38\.08/.test(roomRow), "Room Attendant's row shows its own rate-based Unifocus total (38.08h), unaffected by adding Supervisor");
  }
};
