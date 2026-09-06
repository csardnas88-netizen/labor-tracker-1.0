/* Carlos's ask, 2026-09-05: he uploads the OCC/R106 report many days in
   advance, which already fills Labor and Occupancy. The Schedule's own
   OCC/Departures boxes stayed blank, so he was retyping numbers the app
   was already holding. schedBackfillOccFromR106 carries them across as
   a head start he then adjusts by how he expects occupancy to move.

   His explicit call on the one real design fork: BLANK CELLS ONLY, and
   permanently so. Once a box has a number, nothing here ever touches it
   again — not even a later corrected re-upload of the same report — so
   an estimate he typed can never be walked back by an automatic pass.
   That rule needs no source tracking to be safe: "is it blank" is the
   whole test.

   R106 is stored by NIGHT date (same convention as Labor's own Rooms/
   Departures card): the schedule's OCC box for date ds means "rooms
   occupied the night BEFORE ds", so it reads R106's row for
   prevDateStr(ds), one calendar day earlier — not ds itself. This was a
   real bug (fixed 2026-09-06, Carlos's real report: Sunday Sept 13 showed
   125 instead of the 144 R106 actually carried for that morning), so
   every fixture below keys its R106 rows one day BEFORE the schedule date
   it fills, on purpose. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "The OCC/R106 upload fills the Schedule's blank OCC/Departures boxes from the NIGHT BEFORE each date, and never touches one that already has a number (Carlos's 2026-09-05 ask, night-date fix 2026-09-06)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // A real OCC report, forward-dated the way Carlos uploads it. Each row
    // is the NIGHT before the schedule date it's meant to fill.
    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      '2026-09-04': { occ: 320, comp: 2, net: 315, dep: 88 },
      '2026-09-05': { occ: 250, comp: 0, net: 248, dep: 61 },
      '2026-09-06': { occ: 230, comp: 0, net: 228, dep: 47 },
      '2026-09-07': { occ: 0, comp: 0, net: 0, dep: 0 },
    }));

    const SCH = {
      days: {
        '2026-09-05': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Ana', '1']] },
        // Carlos's own estimate already typed in — must survive untouched.
        '2026-09-06': { sheet: 't', occ: '265', dep: '', tdOcc: '', gra: [['Ana', '1']] },
        // Departures already his; only the blank OCC should fill.
        '2026-09-07': { sheet: 't', occ: '', dep: '50', tdOcc: '', gra: [['Ana', '1']] },
        // The report carries no figure for the night before this date.
        '2026-09-08': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Ana', '1']] },
        // No OCC report covers the night before this date at all.
        '2026-09-09': { sheet: 't', occ: '', dep: '', tdOcc: '', gra: [['Ana', '1']] },
      },
      count: 5,
      savedAt: new Date().toISOString(),
    };

    const filled = win.schedBackfillOccFromR106(SCH);
    t.eq(filled, 3, 'reports the number of schedule days it actually filled, for the upload toast');

    t.eq(SCH.days['2026-09-05'].occ, '315', "a blank OCC box takes the NIGHT BEFORE's net occupied rooms (09-04's report, for 09-05)");
    t.eq(SCH.days['2026-09-05'].dep, '88', "and the blank Departures box takes that same night's Dep. Rooms");

    // The whole point of the blank-only rule.
    t.eq(SCH.days['2026-09-06'].occ, '265', "Carlos's own estimate is never overwritten, even though the report says 248");
    t.eq(SCH.days['2026-09-06'].dep, '61', 'but the still-blank Departures box on that same day does fill');

    t.eq(SCH.days['2026-09-07'].occ, '228', 'a blank OCC fills next to a Departures figure he entered himself');
    t.eq(SCH.days['2026-09-07'].dep, '50', 'and that hand-entered Departures figure stays exactly as he left it');

    // A zero in the report means "no figure for this night", not an empty
    // hotel — writing a literal 0 would read as a decision he made.
    t.eq(SCH.days['2026-09-08'].occ, '', 'a zero in the report is skipped rather than written as a real 0');
    t.eq(SCH.days['2026-09-08'].dep, '', 'same for a zero departures figure');

    t.eq(SCH.days['2026-09-09'].occ, '', 'a day whose night-before the report never covered is simply left blank');

    // Running again changes nothing: everything it could fill, it filled,
    // and everything else is now a real number it must not touch.
    t.eq(win.schedBackfillOccFromR106(SCH), 0, 'a second pass fills nothing — it settles instead of re-saving forever');

    // A corrected re-upload must NOT walk back what is now on the grid.
    // This is the fork Carlos chose, so it gets its own assertion.
    win.localStorage.setItem('hk_r106_2026-09', JSON.stringify({
      '2026-09-04': { occ: 340, comp: 2, net: 336, dep: 95 },
      '2026-09-05': { occ: 260, comp: 0, net: 259, dep: 70 },
    }));
    t.eq(win.schedBackfillOccFromR106(SCH), 0, 'a corrected re-upload fills nothing — those boxes are no longer blank');
    t.eq(SCH.days['2026-09-05'].occ, '315', 'the number already on the grid survives a corrected report, by design');
    t.eq(SCH.days['2026-09-05'].dep, '88', 'departures likewise');

    // But a NEW week, created later, still picks the report up — this is
    // what makes uploading days ahead actually pay off.
    SCH.days['2026-09-06'].occ = '';
    t.eq(win.schedBackfillOccFromR106(SCH), 1, 'a box cleared back to blank becomes eligible again');
    t.eq(SCH.days['2026-09-06'].occ, '259', 'and takes the latest report figure, not the stale one');

    // A night that falls in the PREVIOUS month is still found correctly —
    // the lookup keys off the night's own month, not the schedule day's.
    win.localStorage.setItem('hk_r106_2026-08', JSON.stringify({
      '2026-08-31': { occ: 300, comp: 0, net: 296, dep: 40 },
    }));
    const SCH2 = { days: { '2026-09-01': { sheet: 't', occ: '', dep: '', tdOcc: '' } }, count: 1, savedAt: new Date().toISOString() };
    t.eq(win.schedBackfillOccFromR106(SCH2), 1, 'a month boundary still resolves to the correct night, one month back');
    t.eq(SCH2.days['2026-09-01'].occ, '296', 'and pulls that night\'s net, not anything from the new month');

    // Nothing at all to work with is handled without throwing.
    t.eq(win.schedBackfillOccFromR106(null), 0, 'no schedule record at all is a no-op, not a crash');
    t.eq(win.schedBackfillOccFromR106({ days: { '2027-01-01': { occ: '', dep: '' } } }), 0,
      'a month with no OCC report stored is a no-op too');
  },
};
