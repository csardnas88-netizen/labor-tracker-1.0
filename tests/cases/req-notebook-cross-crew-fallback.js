/* Carlos's real report, 2026-10-15: Jorge Gonzalez's 3 R-OFF requests
   (Sat 24/Sun 25/Mon 26) never showed up on his Schedule row at all —
   Houseman's card read all dashes for him that week. He sits on two
   crews (his home crew, Houseman, plus Laundry as Victoriano Ch's
   cover), and confirmed the 3 entries were captured against "(Laundry)"
   — the crew he's a backup on, not his real home crew — AND that the
   notebook showed the yellow "not written" badge on them.

   Root cause: Laundry doesn't necessarily carry a row for him every
   single day (it's only added on days he's actually covering), so
   `_reqScheduleRow` found nothing on the picked crew for those 3 dates
   and gave up entirely — never even trying Houseman, where his real row
   (and his real day off) actually needed to land. Fixed: the picked
   crew is now a preference, not a hard requirement — falls back to
   searching every OTHER crew, but only acts if exactly one match turns
   up across all of them combined, the same "never guess" rule a single
   crew's own loose match already follows. Also now runs
   schedApplyCrossCrewSyncForDate right after each write (same as
   schedApplyCallOff already does for its own writes), so a second real
   crew reconciles immediately instead of waiting for the next render's
   self-heal pass. */
const { loadApp, fakeSession } = require('../_harness');

function buildDay(win, ds, crews) {
  const SCH = win.dlLoadSchedule() || { days: {}, count: 0 };
  SCH.days[ds] = SCH.days[ds] || { sheet: 't', occ: '100', dep: '40', tdOcc: '' };
  Object.keys(crews).forEach((bk) => {
    SCH.days[ds][bk] = crews[bk].map((n) => [n, '1']);
  });
  win.dlSaveSchedule(SCH);
}

module.exports = {
  name: "Request Off write-through falls back to Jorge Gonzalez's OTHER crew when the picked crew has no row for him that day, and reconciles both crews immediately via cross-crew sync",
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // ── The real case: Jorge only has a row on Houseman this day, not
    // Laundry (Laundry's row only gets added on days he's covering) —
    // but "(Laundry)" is the crew picked in the notebook. ──
    buildDay(win, '2026-10-24', { hp: ['Jorge Gonzalez'] });
    const res1 = win.reqWriteToSchedule('Jorge Gonzalez', 'laundry', ['2026-10-24'], 'roff');
    t.eq(JSON.stringify(res1.written), JSON.stringify(['2026-10-24']), "falls back to Houseman and writes through, even though Laundry (the picked crew) was requested");
    t.eq(JSON.stringify(res1.missing), JSON.stringify([]), 'nothing reported missing');
    t.eq(win.dlLoadSchedule().days['2026-10-24'].hp[0][1], 'R-OFF', "Jorge's real Houseman row reads R-OFF");

    // Clearing must find the same fallback row, or the R-OFF would be stuck.
    win.reqClearFromSchedule('Jorge Gonzalez', 'laundry', ['2026-10-24'], 'roff');
    t.eq(win.dlLoadSchedule().days['2026-10-24'].hp[0][1], '', 'clearing the request finds the same Houseman row and reverts it');

    // ── Jorge has rows on BOTH crews this day (actively covering
    // Laundry) — his real Houseman row (the crew actually picked) wins
    // AND Laundry immediately reconciles to match, same-day, not on
    // some later render. ──
    buildDay(win, '2026-10-25', { hp: ['Jorge Gonzalez'], laundry: ['Jorge Gonzalez'] });
    const res2 = win.reqWriteToSchedule('Jorge Gonzalez', 'hp', ['2026-10-25'], 'roff');
    t.eq(JSON.stringify(res2.written), JSON.stringify(['2026-10-25']), 'writes through on the picked (correct) crew');
    const day25 = win.dlLoadSchedule().days['2026-10-25'];
    t.eq(day25.hp[0][1], 'R-OFF', "Houseman (the crew actually picked) reads R-OFF");
    t.eq(day25.laundry[0][1], 'R-OFF', 'and Laundry reconciles to the same R-OFF immediately via cross-crew sync, instead of being left on a stale "1" until the next render');

    // ── Genuinely ambiguous fallback: two DIFFERENT people on two
    // DIFFERENT other crews could both loosely match — must refuse to
    // guess, same as the exact-crew case already does. ──
    buildDay(win, '2026-10-26', { gra: ['Jorge G'], sup: ['Jorge Gon'] });
    const res3 = win.reqWriteToSchedule('Jorge Gonzalez', 'laundry', ['2026-10-26'], 'roff');
    t.eq(JSON.stringify(res3.written), JSON.stringify([]), 'an ambiguous fallback (two possible Jorges on two other crews) writes nothing rather than guessing wrong');
    t.eq(JSON.stringify(res3.missing), JSON.stringify(['2026-10-26']), 'and is reported back as missing');
  },
};
