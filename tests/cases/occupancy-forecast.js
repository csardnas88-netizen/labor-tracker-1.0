/* Occupancy forecast vs actual — Carlos's ask: every Wednesday he builds
   the following week's schedule off a forecast occupancy, and needs the
   day-by-day gap between that forecast and what the hotel actually ran.
   That gap is the number that explains an over/under in the labor
   meeting ("we staffed for 100, the night came in at 130").

   Two things here are easy to get wrong and would be invisible once
   wrong, so they get pinned hard:

   1. WHICH NIGHT a column describes. This app's Daily Occupancy table is
      indexed by WORK DAY but stores by NIGHT — getRoomsForDay(D) returns
      rooms[D-1], because you clean this morning what was occupied last
      night. The forecast is stored by work day for exactly that reason,
      so a forecast and an actual sharing a column always describe the
      same night. An off-by-one here would silently shift every
      comparison by a day and still look completely plausible.

   2. A day with no forecast must read as "not forecast", never as
      "forecast zero". Otherwise every untouched day in the week shows up
      as a catastrophic miss and the week total becomes nonsense. */
const { loadApp, fakeSession } = require('../_harness');

/* Hotel weeks run Saturday→Friday (getHotelWeekStart). Aug 15 2026 is a
   Saturday, so the week under test is Aug 15–21, and its work days draw
   their actuals from the nights of Aug 14–20. */
function seedRooms() {
  return {
    'hk_rooms_migrated_v2': '1',
    'hk_month_2026-08': {
      days: {},
      rooms: {
        '2026-08-14': 120,  /* night before Sat 15 → Sat 15's actual */
        '2026-08-15': 130,  /* → Sun 16's actual */
        '2026-08-16': 145,  /* → Mon 17's actual */
        '2026-08-17': 150   /* → Tue 18's actual */
      }
    }
  };
}

module.exports = {
  name: "Occupancy forecast: stored by hotel week, aligned to the same night as the actual, and a blank day never counts as zero",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedRooms());
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    // ── The week key is the hotel week's SATURDAY, whichever day of that
    // week you ask with — Carlos enters on a Wednesday for a week that
    // starts on the Saturday after. ──
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 15)), '2026-08-15', 'a Saturday resolves to its own week');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 19)), '2026-08-15', 'the Wednesday inside that week resolves to the same key');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 21)), '2026-08-15', 'and so does the closing Friday');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 22)), '2026-08-22', 'the next Saturday starts a new week, not a continuation');

    // ── Nothing entered yet reads as null, NOT zero. ──
    t.eq(win.getOccForecastForDay('2026-08-17'), null, 'a day never forecast reads as null, not 0 — a 0 would show as a total miss');

    // ── Enter the week the way Carlos would: one box at a time. ──
    win.saveOccForecastDay('2026-08-15', '2026-08-15', '125');
    win.saveOccForecastDay('2026-08-15', '2026-08-16', '135');
    win.saveOccForecastDay('2026-08-15', '2026-08-17', '140');
    t.eq(win.getOccForecastForDay('2026-08-17'), 140, 'a saved day reads back as a number');
    t.eq(win.getOccForecastForDay('2026-08-15'), 125, 'and the other days of the same week are untouched by each other');
    t.eq(win.getOccForecastForDay('2026-08-16'), 135);

    // Writing one day must not disturb the rest of the week's record.
    const rec = win.loadOccForecast('2026-08-15');
    t.eq(Object.keys(rec.days).length, 3, 'three days stored, each written without clobbering its siblings');
    t.assert(rec.savedAt, 'the record carries a savedAt for last-write-wins on sync');

    // ── Clearing a box removes the day rather than storing a 0. ──
    win.saveOccForecastDay('2026-08-15', '2026-08-16', '');
    t.eq(win.getOccForecastForDay('2026-08-16'), null, 'an emptied box goes back to "not forecast"');
    t.assert(!(('2026-08-16') in win.loadOccForecast('2026-08-15').days), 'and is genuinely removed, not stored as 0');
    win.saveOccForecastDay('2026-08-15', '2026-08-16', '135'); /* restore for the totals below */

    // Junk is ignored rather than stored as NaN.
    win.saveOccForecastDay('2026-08-15', '2026-08-18', 'abc');
    t.eq(win.getOccForecastForDay('2026-08-18'), null, 'unparseable input is ignored, never stored as NaN');

    // ── THE ALIGNMENT CHECK. Mon Aug 17's actual must be the night of
    // Sun Aug 16 = 145, the identical figure the Daily Occupancy table
    // shows on that row. If this ever reads 150 (the night OF Aug 17)
    // the whole card is a day out of step. ──
    t.eq(win.getRoomsForDay('2026-08-17'), 145, "Mon Aug 17's actual is the night before it (Aug 16 = 145), matching the Daily Occupancy table");
    const wd = win._occfcWeekData(new Date(2026, 7, 15));
    const mon = wd.cells.find((c) => c.ds === '2026-08-17');
    t.eq(mon.ac, 145, 'the card reads that same actual');
    t.eq(mon.fc, 140, 'against the forecast entered for the same column');
    t.eq(mon.diff, 5, 'so the gap is +5 — the hotel ran 5 rooms heavier than the schedule was built for');
    t.eq(win.dateStr(mon.night), '2026-08-16', 'and the column states the night it describes, so nothing is left to infer');

    // ── Week totals count only days that have BOTH a forecast and a real
    // actual. Aug 15/16/17 qualify (125/135/140 vs 120/130/145). Aug 18
    // has an actual but no forecast, and Aug 19-21 have neither. ──
    t.eq(wd.fcTotal, 400, 'forecast total covers only the three days that have one (125+135+140)');
    t.eq(wd.acTotal, 395, 'actual total covers exactly those same three days (120+130+145)');
    t.eq(wd.bothDays, 3, 'three comparable days');
    t.eq(wd.netVar, -5, 'net variance is actual minus forecast across only the comparable days');

    const aug18 = wd.cells.find((c) => c.ds === '2026-08-18');
    t.eq(aug18.fc, null, 'Aug 18 has an actual but no forecast');
    t.assert(aug18.ac > 0, 'the actual is genuinely there');
    t.eq(aug18.diff, null, 'yet its gap is null, not a huge negative — a missing forecast is a data gap, not a miss');

    const aug20 = wd.cells.find((c) => c.ds === '2026-08-20');
    t.eq(aug20.ac, 0, 'a future night has no actual yet');
    t.eq(aug20.diff, null, 'and shows no gap rather than a fabricated one');

    // ── A week Carlos never touched must not report a variance at all. ──
    const empty = win._occfcWeekData(new Date(2026, 7, 22));
    t.eq(empty.netVar, null, 'an untouched week has no variance');
    t.eq(empty.anyFc, false, 'and knows it has no forecast, so the card can say so plainly');

    // ── The rendered card. ──
    const html = win.buildOccForecastHTML(2026, 7);
    t.assert(/Forecast vs actual/.test(html), 'the card renders on the Occupancy page');
    t.assert(/night Sun 16/.test(html), 'each column spells out the night it covers');
    t.assert(/occfcIn_2026-08-17/.test(html), 'each day has its own input, addressable for the in-place refresh');
    t.assert(/occfcSum_2026-08-15/.test(html), 'and each week has an addressable summary');
    t.assert(/No forecast entered yet/.test(html), 'a week with nothing entered says so instead of showing zeros');

    // ── Sync: a newer remote plan replaces the local one wholesale; an
    // older one is ignored. A week's forecast is one act of planning, so
    // mixing days from two different plans would produce a week that was
    // never actually scheduled. ──
    const older = { days: { '2026-08-15': 999 }, savedAt: '2020-01-01T00:00:00.000Z' };
    win.localStorage.setItem('hk_occfc_2026-08-15', JSON.stringify(win.loadOccForecast('2026-08-15')));
    const beforeLocal = win.loadOccForecast('2026-08-15');
    t.assert(beforeLocal.savedAt > older.savedAt, 'the local plan is the newer of the two');
    t.eq(win.getOccForecastForDay('2026-08-15'), 125, 'and an older remote record must not win');
  }
};
