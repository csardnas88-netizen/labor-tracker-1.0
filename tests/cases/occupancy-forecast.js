/* Occupancy forecast: Forecast vs Scheduled vs Opera.

   v7.2.1 shipped a single number per day — Carlos called it "forecast",
   but when asked he explained it was really the number his team CHOSE
   for the schedule, a deliberate midpoint between two other numbers:
   Unifocus/Zelle hands them a forecast every Friday that consistently
   overshoots what Opera's actual reservations show, so the team picks a
   midpoint rather than trusting either one outright. v7.2.2 splits the
   single field into 'sched' (what v7.2.1 called "forecast" — unchanged
   meaning, just a clearer name) and 'uf' (new — Unifocus's own number).

   Real weeks Carlos already filled in under v7.2.1 are live in Supabase
   as a bare number per day, not the new {sched,uf} shape. That data is
   real and must keep reading correctly — this file pins the backward
   compat as hard as the rest of the behavior.

   Three things stay easy to get wrong here and would be invisible once
   wrong:

   1. WHICH NIGHT a column describes. This app's Daily Occupancy table is
      indexed by WORK DAY but stores by NIGHT — getRoomsForDay(D) returns
      rooms[D-1], because you clean this morning what was occupied last
      night. The forecast is stored by work day for exactly that reason,
      so every number in a column describes the same night.

   2. A day with nothing entered must read as "not entered", never as
      "entered zero". Otherwise every untouched day in the week shows up
      as a catastrophic miss and the week total becomes nonsense.

   3. Editing ONE field (say, Unifocus on a Friday) must never touch the
      OTHER field on the same day (the Scheduled number, likely entered
      days earlier on the Wednesday) — they're written independently,
      often on different days of the week, by the same manager. */
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
  name: "Occupancy forecast: Unifocus and Scheduled are independent per-day fields, a bare-number legacy week still reads correctly, and neither field is ever entered as a false zero",
  async run(t) {
    const seed = Object.assign(fakeSession(), seedRooms());
    const { win } = await loadApp({ seed });
    await new Promise((r) => setTimeout(r, 60));

    // ── The week key is the hotel week's SATURDAY, whichever day of that
    // week you ask with — Carlos enters on a Wednesday for a week that
    // starts on the Saturday after, and Unifocus's own number sometimes
    // lands as late as Friday, still the same week. ──
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 15)), '2026-08-15', 'a Saturday resolves to its own week');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 19)), '2026-08-15', 'the Wednesday inside that week resolves to the same key');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 21)), '2026-08-15', 'and so does the closing Friday');
    t.eq(win.occForecastWeekKey(new Date(2026, 7, 22)), '2026-08-22', 'the next Saturday starts a new week, not a continuation');

    // ── Nothing entered yet reads as null, NOT zero, for either field. ──
    t.eq(win.getOccForecastForDay('2026-08-17'), null, 'a day never scheduled reads as null, not 0 — a 0 would show as a total miss');
    t.eq(win.getOccForecastForDay('2026-08-17', 'uf'), null, 'same for the Unifocus field');

    // ── Enter the week the way Carlos would: Scheduled on Wednesday,
    // Unifocus arriving separately (often later, on the Friday). ──
    win.saveOccForecastDay('2026-08-15', '2026-08-15', 'sched', '125');
    win.saveOccForecastDay('2026-08-15', '2026-08-16', 'sched', '135');
    win.saveOccForecastDay('2026-08-15', '2026-08-17', 'sched', '140');
    t.eq(win.getOccForecastForDay('2026-08-17'), 140, 'a saved Scheduled day reads back as a number (field defaults to sched)');
    t.eq(win.getOccForecastForDay('2026-08-15'), 125, 'and the other days of the same week are untouched by each other');
    t.eq(win.getOccForecastForDay('2026-08-16'), 135);

    win.saveOccForecastDay('2026-08-15', '2026-08-17', 'uf', '165');
    t.eq(win.getOccForecastForDay('2026-08-17', 'uf'), 165, "Unifocus's own number for the same day is stored under its own field");
    t.eq(win.getOccForecastForDay('2026-08-17'), 140, "and writing Unifocus does NOT disturb that day's already-entered Scheduled number");

    // Writing one day must not disturb the rest of the week's record.
    const rec = win.loadOccForecast('2026-08-15');
    t.eq(Object.keys(rec.days).length, 3, 'three days touched, each written without clobbering its siblings');
    t.assert(rec.savedAt, 'the record carries a savedAt for last-write-wins on sync');

    // ── Clearing one field removes just that field, not the whole day —
    // Aug 17 still has its Scheduled number after Unifocus is cleared. ──
    win.saveOccForecastDay('2026-08-15', '2026-08-17', 'uf', '');
    t.eq(win.getOccForecastForDay('2026-08-17', 'uf'), null, 'an emptied Unifocus box goes back to "not entered"');
    t.eq(win.getOccForecastForDay('2026-08-17'), 140, "and Aug 17's Scheduled number survives — clearing one field must never take the other with it");

    // Clearing the LAST remaining field on a day drops the day entirely.
    win.saveOccForecastDay('2026-08-15', '2026-08-16', 'sched', '');
    t.eq(win.getOccForecastForDay('2026-08-16'), null, 'an emptied box goes back to "not entered"');
    t.assert(!(('2026-08-16') in win.loadOccForecast('2026-08-15').days), 'and the day itself is genuinely removed once both fields are empty, not stored as 0');
    win.saveOccForecastDay('2026-08-15', '2026-08-16', 'sched', '135'); /* restore for the totals below */

    // Junk is ignored rather than stored as NaN.
    win.saveOccForecastDay('2026-08-15', '2026-08-18', 'sched', 'abc');
    t.eq(win.getOccForecastForDay('2026-08-18'), null, 'unparseable input is ignored, never stored as NaN');

    // ── BACKWARD COMPAT: a real week Carlos filled in under v7.2.1, still
    // stored as a bare number per day (no {sched,uf} shape), must keep
    // reading correctly — this is live production data, not a hypothetical. ──
    win.localStorage.setItem('hk_occfc_2026-08-22', JSON.stringify({
      days: { '2026-08-22': 160, '2026-08-23': 170 },
      savedAt: '2026-08-11T18:05:35.054Z'
    }));
    t.eq(win.getOccForecastForDay('2026-08-22'), 160, 'a legacy bare-number day reads as its Scheduled value');
    t.eq(win.getOccForecastForDay('2026-08-22', 'uf'), null, 'and has no Unifocus value yet — the old format never had one');
    // Now enter Unifocus for that same legacy day — the pre-existing
    // Scheduled number (160) must survive being upgraded to the new shape.
    win.saveOccForecastDay('2026-08-22', '2026-08-22', 'uf', '190');
    t.eq(win.getOccForecastForDay('2026-08-22'), 160, "upgrading a legacy day to add Unifocus must not lose its original Scheduled number");
    t.eq(win.getOccForecastForDay('2026-08-22', 'uf'), 190, 'and the new Unifocus number is there alongside it');

    // ── THE ALIGNMENT CHECK. Mon Aug 17's actual must be the night of
    // Sun Aug 16 = 145, the identical figure the Daily Occupancy table
    // shows on that row. If this ever reads 150 (the night OF Aug 17)
    // the whole card is a day out of step. ──
    t.eq(win.getRoomsForDay('2026-08-17'), 145, "Mon Aug 17's actual is the night before it (Aug 16 = 145), matching the Daily Occupancy table");
    const wd = win._occfcWeekData(new Date(2026, 7, 15));
    const mon = wd.cells.find((c) => c.ds === '2026-08-17');
    t.eq(mon.ac, 145, 'the card reads that same actual');
    t.eq(mon.sched, 140, 'against the Scheduled number entered for the same column');
    t.eq(mon.uf, null, "and Unifocus for that column, cleared earlier, correctly shows nothing");
    t.eq(mon.diff, 5, 'the gap (Scheduled vs Actual) is +5 — the hotel ran 5 rooms heavier than the schedule was built for');
    t.eq(win.dateStr(mon.night), '2026-08-16', 'and the column states the night it describes, so nothing is left to infer');

    // ── Week totals count only days that have BOTH a Scheduled number
    // and a real actual. Aug 15/16/17 qualify (125/135/140 vs 120/130/145).
    // Aug 18 has an actual but nothing scheduled, and Aug 19-21 have
    // neither. Unifocus total is independent — it sums whatever Unifocus
    // numbers exist, with no actual required (Aug 22 above has one). ──
    t.eq(wd.schedTotal, 400, 'Scheduled total covers only the three days that have one (125+135+140)');
    t.eq(wd.acTotal, 395, 'actual total covers exactly those same three days (120+130+145)');
    t.eq(wd.bothDays, 3, 'three comparable days');
    t.eq(wd.netVar, -5, 'net variance is actual minus Scheduled across only the comparable days');
    t.eq(wd.ufTotal, 0, "this week's Unifocus total is 0 — the only Unifocus number entered for it was cleared");

    const aug18 = wd.cells.find((c) => c.ds === '2026-08-18');
    t.eq(aug18.sched, null, 'Aug 18 has an actual but nothing scheduled');
    t.assert(aug18.ac > 0, 'the actual is genuinely there');
    t.eq(aug18.diff, null, 'yet its gap is null, not a huge negative — a missing Scheduled figure is a data gap, not a miss');

    const aug20 = wd.cells.find((c) => c.ds === '2026-08-20');
    t.eq(aug20.ac, 0, 'a future night has no actual yet');
    t.eq(aug20.diff, null, 'and shows no gap rather than a fabricated one');

    // ── A week Carlos never touched must not report a variance at all. ──
    const empty = win._occfcWeekData(new Date(2026, 7, 29));
    t.eq(empty.netVar, null, 'an untouched week has no variance');
    t.eq(empty.anyFc, false, 'and knows nothing was entered, so the card can say so plainly');

    // ── The rendered card. ──
    const html = win.buildOccForecastHTML(2026, 7);
    t.assert(/Forecast vs Scheduled vs Opera/.test(html), 'the card renders on the Occupancy page under its three-number title, Carlos\'s own terms (Forecast/Sched/Opera)');
    t.assert(/night Sun 16/.test(html), 'each column spells out the night it covers');
    t.assert(/occfcSched_2026-08-17/.test(html), 'each day has its own addressable Scheduled input, for the in-place refresh');
    t.assert(/occfcUf_2026-08-17/.test(html), 'and its own addressable Unifocus input, independent of the Scheduled one');
    t.assert(/occfcSum_2026-08-15/.test(html), 'and each week has an addressable summary');
    t.assert(/Nothing entered yet/.test(html), 'a genuinely untouched week says so instead of showing zeros');

    // ── Sync: a newer remote plan replaces the local one wholesale; an
    // older one is ignored. A week's plan is one act of planning, so
    // mixing days from two different plans would produce a week that was
    // never actually scheduled. The record's internal day shape (bare
    // number vs {sched,uf}) is irrelevant to this — it's a whole-blob
    // compare by savedAt either way. ──
    const older = { days: { '2026-08-15': 999 }, savedAt: '2020-01-01T00:00:00.000Z' };
    win.localStorage.setItem('hk_occfc_2026-08-15', JSON.stringify(win.loadOccForecast('2026-08-15')));
    const beforeLocal = win.loadOccForecast('2026-08-15');
    t.assert(beforeLocal.savedAt > older.savedAt, 'the local plan is the newer of the two');
    t.eq(win.getOccForecastForDay('2026-08-15'), 125, 'and an older remote record must not win');
  }
};
