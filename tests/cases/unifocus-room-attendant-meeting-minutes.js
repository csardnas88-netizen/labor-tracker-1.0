/* Room Attendant's third Unifocus component: 20 minutes for EVERY Room
   Attendant who actually worked that day, for the morning pre-shift
   meeting — Unifocus's "01. Hotel Rooms, Staff (Minutes): 20" line.
   Carlos explained it directly: "20 minutos para cada room attendant que
   trabaja diariamente para mi meeting de la manana."

   This is a flat PER-EMPLOYEE allowance, not per-room and not banded — it
   comes from the day's own already-uploaded Labor Distribution Report
   (days[ds].byPosition['Room Attendant'].emps, the same headcount the
   Paid column already reflects), not a separate schedule or manual count.

   Self-check against Unifocus's real per-day Aug 2026 reports: after
   adding this term, the residual gap on Aug 1/2/3 (233 / 234 / 279
   minutes) divided by 20 lands within ~0.35 min of 12 / 12 / 14 staff —
   plausible headcounts, and the small residuals are consistent with
   Unifocus's own report rounding hours to 2 decimals. Not treated as
   confirmed to the exact employee until Carlos checks a real day's actual
   Room Attendant headcount against it (see the CHANGELOG entry for this
   version) — this test locks in the MECHANISM (which field feeds the
   formula, and that it's additive/flat-per-head), not that specific
   historical numbers. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Room Attendant's Unifocus budget adds 20 minutes per Room Attendant who worked that day (the morning meeting)",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          // 12 Room Attendants worked this day.
          '2026-07-15': { totalPaid: 60, byPosition: { 'Room Attendant': { paid: 55, emps: 12 } } },
          // Same rooms/departures, but nobody's headcount recorded at all
          // (a snapshot from before this field existed, or a position with
          // no report yet) -> treated as 0 staff, not null/broken.
          '2026-07-16': { totalPaid: 60, byPosition: { 'Room Attendant': { paid: 55 } } }
        },
        rooms: { '2026-07-14': 200, '2026-07-15': 200 }
      },
      'hk_r106_2026-07': {
        '2026-07-15': { occ: 200, comp: 0, net: 200, dep: 40 },
        '2026-07-16': { occ: 200, comp: 0, net: 200, dep: 40 }
      }
    });
    const { win } = await loadApp({ seed });

    // Stayovers = 200 - 40 = 160. Base (stayovers + departures only):
    // (160*0.85*20 + 40*30)/60 = (2720+1200)/60 = 65.3333h — this is the
    // exact figure the OLDER two-component test already covers; here we
    // confirm what changes once headcount enters the picture.
    const base = (160 * 0.85 * 20 + 40 * 30) / 60;

    // With 12 Room Attendants recorded: +12*20 = 240 min = 4h on top.
    const withMeeting = win.unifocusHoursForPosition('Room Attendant', '2026-07-15');
    t.assert(Math.abs(withMeeting - (base + 4)) < 0.001,
      '12 Room Attendants add 12*20min = 4h on top of the stayover+departure base (got ' + withMeeting + ', expected ' + (base + 4) + ')');

    // With no emps field recorded at all: falls back to 0 staff, same as
    // the base figure, not null and not a crash.
    const noHeadcount = win.unifocusHoursForPosition('Room Attendant', '2026-07-16');
    t.assert(Math.abs(noHeadcount - base) < 0.001,
      'a day with no recorded Room Attendant headcount contributes 0 meeting minutes, falling back to the stayover+departure base only');

    // The constant itself is named and inspectable, matching the pattern
    // of RA_STAYOVER_PCT/RA_STAYOVER_MIN/RA_DEPARTURE_MIN.
    t.eq(win.RA_MEETING_MIN, 20, 'the per-person morning-meeting allowance is the 20 minutes Carlos confirmed');
  }
};
