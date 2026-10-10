/* Carlos's ask, 2026-10-10: hotel occupancy can genuinely RISE between
   when a Schedule week is built and a later R106 upload — not a
   correction, a real increase he'd rather see reflected automatically
   than have to go retype. schedBackfillOccFromR106's usual rule (fill
   BLANK boxes only, forever protect anything with a number) now has one
   exception: a filled OCC box — whether it got its number from auto-fill
   or from Carlos typing it in himself — still gets bumped UP if a later
   upload's night figure for that date is higher. Only upward, only OCC
   (Departures keeps the old all-or-nothing rule unchanged — he only
   asked about occupancy), and it runs automatically every time R106 is
   uploaded or the Schedule is opened, no button press needed. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "schedBackfillOccFromR106: a filled OCC box bumps UP (never down) when a later R106 upload's night figure is higher, whether the box was hand-typed or auto-filled; Departures is unaffected (Carlos's 2026-10-10 ask)",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    win.localStorage.setItem('hk_r106_2026-10', JSON.stringify({
      '2026-10-13': { occ: 200, comp: 0, net: 200, dep: 40 },
      '2026-10-14': { occ: 200, comp: 0, net: 200, dep: 40 },
    }));

    const SCH = {
      days: {
        // Auto-filled earlier (occAuto:true) — the ordinary case.
        '2026-10-14': { sheet: 't', occ: '200', occAuto: true, dep: '40', depAuto: true, tdOcc: '' },
        // Hand-typed by Carlos himself (occAuto:false, the strongest
        // protection the app has elsewhere) — must STILL bump up, per
        // his explicit answer that this applies "siempre", manual or not.
        '2026-10-15': { sheet: 't', occ: '200', occAuto: false, dep: '40', depAuto: false, tdOcc: '' },
      },
      count: 2,
      savedAt: new Date().toISOString(),
    };
    win.dlSaveSchedule(SCH);

    // A later, corrected R106 now shows the hotel more occupied both
    // nights — Wednesday (feeds 10-14's OCC) up to 250, Thursday (feeds
    // 10-15's OCC) up to 230.
    win.localStorage.setItem('hk_r106_2026-10', JSON.stringify({
      '2026-10-13': { occ: 250, comp: 0, net: 250, dep: 40 },
      '2026-10-14': { occ: 230, comp: 0, net: 230, dep: 55 },
    }));

    const filled = win.schedBackfillOccFromR106(SCH);
    t.eq(filled, 2, 'both already-filled OCC boxes count as touched when the new night figure is higher');

    t.eq(SCH.days['2026-10-14'].occ, '250', 'an auto-filled OCC box bumps up to the higher night figure (200→250)');
    t.eq(SCH.days['2026-10-15'].occ, '230', "a HAND-TYPED OCC box (occAuto:false) bumps up too — Carlos's explicit call: manual or not, higher always wins");
    t.eq(SCH.days['2026-10-14'].dep, '40', "Departures is untouched even though its own R106 row rose too — he only asked about occupancy, and Departures keeps its old all-or-nothing protection");
    t.eq(SCH.days['2026-10-15'].dep, '40', 'same for the hand-typed day — its Departures figure, also protected the old way, never moves');

    // A further upload with a LOWER figure than what's now on the grid
    // must never pull it back down.
    win.localStorage.setItem('hk_r106_2026-10', JSON.stringify({
      '2026-10-13': { occ: 180, comp: 0, net: 180, dep: 40 },
    }));
    const second = win.schedBackfillOccFromR106(SCH);
    t.eq(second, 0, 'a lower re-upload touches nothing');
    t.eq(SCH.days['2026-10-14'].occ, '250', 'the higher number already on the box survives a lower re-upload — only increases ever apply');

    // An EQUAL figure is a no-op too (not greater, so no change, no
    // spurious "filled" count).
    win.localStorage.setItem('hk_r106_2026-10', JSON.stringify({
      '2026-10-14': { occ: 230, comp: 0, net: 230, dep: 55 },
    }));
    t.eq(win.schedBackfillOccFromR106(SCH), 0, 'an equal night figure is not an increase, so nothing changes');
    t.eq(SCH.days['2026-10-15'].occ, '230', 'and the box keeps its exact value');
  },
};
