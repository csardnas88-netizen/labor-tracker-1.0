/* Carlos's real report, 2026-09-07: a duplicate Laundry row for Sandra S.
   ("Sandra S", no period, vs "Sandra S.", with one) already existed
   before the dlNormAlias fix (schedSyncLaundryCoverRow) shipped, and the
   "Remove from crew" button wasn't clearing it from the week he was
   actually looking at. schedPurgeDuplicateAliasRows self-heals any
   day/crew where two rows alias to the same person, on every render, so
   a duplicate created before this shipped — or a future alias hitting
   the same class of bug — can't survive being opened once. */
const { loadApp, fakeSession } = require('../_harness');

module.exports = {
  name: 'schedPurgeDuplicateAliasRows: self-heals a day/crew with two rows that alias to the same person, keeping the real spelling and never losing a real value (Carlos\'s 2026-09-07 report)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // The exact reported case: the real 'added' row (with a value) comes
    // first, the auto-generated 'cover' duplicate second.
    const SCH1 = { days: { '2026-09-12': { laundry: [['Sandra S.', 'OFF', 'added'], ['Sandra S', '1', 'cover']] } } };
    t.assert(win.schedPurgeDuplicateAliasRows(SCH1), 'reports a real change');
    t.eq(SCH1.days['2026-09-12'].laundry.length, 1, 'the duplicate is gone, only one row remains');
    t.eq(SCH1.days['2026-09-12'].laundry[0][0], 'Sandra S.', 'the surviving row keeps the real spelling (with the period), not the cover row\'s');
    t.eq(SCH1.days['2026-09-12'].laundry[0][1], 'OFF', "and its real OFF value survives untouched");

    // Same pair, opposite array order — the cover row (with a value)
    // happens to sit BEFORE the real 'added' row (blank). The correct
    // spelling still wins, and the cover row's real value is carried
    // across rather than lost, since the surviving row was blank.
    const SCH2 = { days: { '2026-09-12': { laundry: [['Sandra S', '1', 'cover'], ['Sandra S.', '', 'added']] } } };
    t.assert(win.schedPurgeDuplicateAliasRows(SCH2), 'reports a real change regardless of array order');
    t.eq(SCH2.days['2026-09-12'].laundry.length, 1, 'still just one row');
    t.eq(SCH2.days['2026-09-12'].laundry[0][0], 'Sandra S.', 'the real spelling wins even when the cover row came first');
    t.eq(SCH2.days['2026-09-12'].laundry[0][1], '1', "the cover row's real value is carried across rather than lost, since the surviving row was blank");

    // Two 'cover' rows (or two 'added' rows) — an ambiguous tie with no
    // tag to prefer — still merges into one row without throwing, and
    // never discards a real value in favor of a blank one.
    const SCH3 = { days: { '2026-09-12': { laundry: [['Sandra S', '', 'cover'], ['Sandra S.', '1', 'cover']] } } };
    t.assert(win.schedPurgeDuplicateAliasRows(SCH3), 'reports a change for an ambiguous tie too');
    t.eq(SCH3.days['2026-09-12'].laundry.length, 1, 'merges down to one row');
    t.eq(SCH3.days['2026-09-12'].laundry[0][1], '1', 'the real value is kept even when neither row has priority by tag');

    // No duplicate at all — a single ordinary row is left completely alone.
    const SCH4 = { days: { '2026-09-12': { laundry: [['Someone Else', '1', 'added']] } } };
    t.assert(!win.schedPurgeDuplicateAliasRows(SCH4), 'no change reported when there is nothing to merge');
    t.eq(SCH4.days['2026-09-12'].laundry.length, 1, 'the single row is untouched');

    // Runs across every crew, not just Laundry, and every loaded day.
    const SCH5 = {
      days: {
        '2026-09-12': { gra: [['Sandra S.', '', 'cover'], ['Sandra S', '1', 'added']] },
        '2026-09-13': { laundry: [['Someone Else', '1', 'added']] },
      },
    };
    t.assert(win.schedPurgeDuplicateAliasRows(SCH5), 'reports a change for a duplicate on a different crew entirely');
    t.eq(SCH5.days['2026-09-12'].gra.length, 1, 'the gra crew duplicate is merged too');
    t.eq(SCH5.days['2026-09-13'].laundry.length, 1, 'an unrelated day/crew with no duplicate is untouched');

    // Nothing at all to work with is handled without throwing.
    t.assert(!win.schedPurgeDuplicateAliasRows(null), 'no schedule record at all is a no-op, not a crash');
    t.assert(!win.schedPurgeDuplicateAliasRows({ days: {} }), 'no days at all is a no-op too');
  },
};
