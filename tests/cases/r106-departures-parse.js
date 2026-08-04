/* parseR106() historically kept only Total Occ and Comp Rooms from each row,
   discarding everything else — including Dep. Rooms (departures), the volume
   metric the new Unifocus Houseperson standard needs. Dep. Rooms sits past
   three decimal/comma-formatted columns (Occ.%, Room Revenue, Average Rate),
   which fragment under a plain \d+ sweep and would throw off a naive fixed
   index — so this locks in the "strip those three formats out first" fix
   against a row shaped like the app's real pdf.js text-reconstruction output
   (space-joined items in left-to-right column order; verified against a real
   R106 PDF, values below are fabricated, not the hotel's actual figures). */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "parseR106() extracts Dep. Rooms without being thrown off by Occ.%/Revenue/Rate",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });

    // Total Occ | Arr | Comp | HouseUse | DeductIndiv | NonDedIndiv | DeductGroup | NonDedGroup | Occ.% | Revenue | Rate | Dep | DayUse | NoShow | OOO | Adl&Chl
    const text =
      "07-19-26 Sun 181 128 3 0 167 0 14 0 66.30% 52,574.29 290.47 124 0 3 111 240\n" +
      // A row with revenue under $1,000 (no comma) to prove the fix isn't
      // relying on the comma being present — Average Rate still has a plain
      // decimal here too.
      "07-20-26 Mon 12 8 1 0 6 0 2 0 40.00% 874.29 95.50 9 0 0 20 15\n" +
      // Forecast row: No Show Rooms is structurally BLANK (not "0") in real
      // R106 forecast rows — that gap sits AFTER Dep. Rooms in column order,
      // so it must not shift Dep. Rooms itself.
      "08-03-26 Mon 201 137 0 0 193 0 8 0 68.60% 59,698.42 297.01 50 0 91 213";

    const parsed = win.parseR106(text);

    t.eq(parsed['2026-07-19'].dep, 124, 'normal row: Dep. Rooms extracted correctly past %/comma-currency fields');
    t.eq(parsed['2026-07-19'].occ, 181, 'Total Occ still correct (unaffected by the new logic)');
    t.eq(parsed['2026-07-19'].comp, 3, 'Comp Rooms still correct (unaffected by the new logic)');

    t.eq(parsed['2026-07-20'].dep, 9, 'row with no comma in Revenue: Dep. Rooms still extracted correctly');

    t.eq(parsed['2026-08-03'].dep, 50, 'forecast row with a blank (not zero) No Show Rooms cell: Dep. Rooms unaffected since it comes before that gap');
  }
};
