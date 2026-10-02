/* Carlos's ask, 2026-09-28: tap a position's own name on Weekly Labor
   Pace to see its Unifocus Labor Standard right there, without leaving
   the page for the full reference down on Labor Model
   ([[labor-tracker-unifocus-standard]]). buildUnifocusStandardHTML grew
   an optional onlyPos filter for this — reads the exact same
   UNIFOCUS_STANDARDS the full card does, never a second hand-copied
   figure, so Weekly Pace's version can't quietly drift from Labor
   Model's. wpStdOpen is keyed by position only (not position+day,
   unlike wpCardOpen/wpNoteExpanded) since the standard itself doesn't
   change day to day. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: "Weekly Labor Pace: tapping a position's name shows its Unifocus Labor Standard inline, scoped to that position only",
  async run(t) {
    const seed = Object.assign(fakeSession(), {
      'hk_rooms_migrated_v2': '1',
      'hk_month_2026-07': {
        days: {
          '2026-07-19': { totalPaid: 30, byPosition: { 'Room Attendant': { paid: 30 }, 'Laundry Attendant': { paid: 20 } } }
        },
        rooms: { '2026-07-18': 120, '2026-07-19': 120 }
      },
      'hk_r106_2026-07': { '2026-07-19': { occ: 120, comp: 0, net: 120, dep: 80 } }
    });
    const { win } = await loadApp({ seed });

    // ── buildUnifocusStandardHTML(onlyPos) itself ──
    const full = win.buildUnifocusStandardHTML();
    const raOnly = win.buildUnifocusStandardHTML('Room Attendant');
    const laundryOnly = win.buildUnifocusStandardHTML('Laundry Attendant');

    t.assert(/Room Attendant/.test(full) && /Laundry/.test(full) && /House Attendant/.test(full),
      'the unfiltered call still renders every position — Labor Model\'s own full reference card is unaffected by this change');

    t.assert(/25 min/.test(raOnly) && /35 min/.test(raOnly) && /85%/.test(raOnly),
      "Room Attendant's own per-room rate formula is in its scoped block");
    t.assert(!/House Attendant/.test(raOnly) && !/Laundry/.test(raOnly) && !/Turndown/.test(raOnly),
      'and nothing else is — scoping to one position actually excludes the others, not just reorders them');

    t.assert(/Laundry/.test(laundryOnly), "Laundry Attendant's own block renders when it's the one asked for");
    t.assert(!/Room Attendant/.test(laundryOnly) && !/85%/.test(laundryOnly),
      "Room Attendant's rate formula — the one block not driven by LM_ORDER/UNIFOCUS_STANDARDS — is correctly excluded too when scoped elsewhere");

    // ── Wired into Weekly Labor Pace's own position header ──
    const month = JSON.parse(win.localStorage.getItem('hk_month_2026-07'));
    const week = { start: new Date(2026, 6, 18), end: new Date(2026, 6, 24) };

    let pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(!/85% of Stayovers/.test(pace), 'collapsed by default — the standard detail is not in the markup at all until tapped');

    win.toggleWPStandard('Room Attendant');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    const raBlock = pace.slice(pace.indexOf('>Room Attendant<'), pace.indexOf('>Laundry<') !== -1 ? pace.indexOf('>Laundry<') : undefined);
    t.assert(/85% of Stayovers/.test(raBlock), "Room Attendant's card shows its own standard once toggled open");
    const laundryBlockStillClosed = pace.slice(pace.indexOf('>Laundry<'));
    t.assert(!/>Staff</.test(laundryBlockStillClosed),
      "Laundry's own standard panel (its band table has a Staff column header) stays collapsed — opening Room Attendant's doesn't open every position's");

    win.toggleWPStandard('Room Attendant');
    pace = win.buildWeeklyPaceHTML(month.days, month.rooms, week);
    t.assert(!/85% of Stayovers/.test(pace), 'tapping it again closes it back down');
  }
};
