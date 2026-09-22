/* Carlos's ask, 2026-09-22: within the Laundry crew card, the three
   people who actually run the washing machines (Victoriano Ch, Jorge
   Gonzalez, David P) were scattered through the same flat list as
   everyone else doing other Laundry work — "regulares actualmente me
   confunde debido a que están dispersos." A "LAVADORES" group, washers
   first, then "REGULARES" for everyone else, so washer coverage reads at
   a glance without hunting through the whole crew list. Purely a display
   grouping (schedLaundryWasherGroups) — doesn't touch who's on the crew,
   any headcount, or the cover mechanics elsewhere in the file. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];

function buildLaundryWeek(win, names) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = { sheet: 't', occ: '150', dep: '60', tdOcc: '', laundry: names.map((n) => [n, '1']) };
  });
  win.dlSaveSchedule({ days, count: 7, savedAt: new Date().toISOString() });
  win.schedViewWeekStart = new Date(2026, 8, 19);
}

module.exports = {
  name: 'Laundry crew card groups Victoriano Ch/Jorge Gonzalez/David P under "Lavadores", everyone else under "Regulares" (Carlos\'s 2026-09-22 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    // Washers deliberately scattered among regulars, matching the real
    // complaint — the grouping has to reorder them, not just label
    // wherever they happen to already sit.
    buildLaundryWeek(win, ['Isabel D', 'Victoriano Ch', 'Olga A', 'Jorge Gonzalez', 'Gady', 'David P']);
    win.renderSchedule();
    const html = win.document.getElementById('scheduleContent').innerHTML;
    const laundryStart = html.indexOf('>Laundry</div>');
    t.assert(laundryStart !== -1, 'the Laundry crew card renders');
    const card = html.slice(laundryStart, laundryStart + 60000);

    const lavadoresIdx = card.indexOf('>Lavadores<');
    const regularesIdx = card.indexOf('>Regulares<');
    t.assert(lavadoresIdx !== -1 && regularesIdx !== -1, 'both group labels render on a card with a mix of washers and regulars');
    t.assert(lavadoresIdx < regularesIdx, '"Lavadores" comes before "Regulares"');

    const victorianoIdx = card.indexOf('Victoriano Ch');
    const jorgeIdx = card.indexOf('Jorge Gonzalez');
    const davidIdx = card.indexOf('David P');
    const isabelIdx = card.indexOf('Isabel D');
    const olgaIdx = card.indexOf('Olga A');
    const gadyIdx = card.indexOf('Gady');

    t.assert(lavadoresIdx < victorianoIdx && victorianoIdx < jorgeIdx && jorgeIdx < davidIdx,
      'the three washers render together, right after the label, in SCHED_LAUNDRY_WASHERS\' own order — not wherever they originally sat');
    t.assert(davidIdx < regularesIdx, 'the last washer still comes before the "Regulares" label');
    [isabelIdx, olgaIdx, gadyIdx].forEach((i) => {
      t.assert(i > regularesIdx, 'every regular renders after the "Regulares" label, not intermixed with the washers');
    });

    // ── An all-washer crew (no regulars at all) gets no dividers — the
    // grouping only earns its place when there's actually something to
    // split apart. ──
    buildLaundryWeek(win, ['Victoriano Ch', 'Jorge Gonzalez', 'David P']);
    win.renderSchedule();
    const allWashersHtml = win.document.getElementById('scheduleContent').innerHTML;
    const allWashersStart = allWashersHtml.indexOf('>Laundry</div>');
    const allWashersCard = allWashersHtml.slice(allWashersStart, allWashersStart + 60000);
    t.assert(!/>Lavadores</.test(allWashersCard) && !/>Regulares</.test(allWashersCard),
      'an all-washer week (nobody to split off as "regular") shows neither label');

    // ── Same for an all-regular crew (no washers this week at all). ──
    buildLaundryWeek(win, ['Isabel D', 'Olga A', 'Gady']);
    win.renderSchedule();
    const noWashersHtml = win.document.getElementById('scheduleContent').innerHTML;
    const noWashersStart = noWashersHtml.indexOf('>Laundry</div>');
    const noWashersCard = noWashersHtml.slice(noWashersStart, noWashersStart + 60000);
    t.assert(!/>Lavadores</.test(noWashersCard) && !/>Regulares</.test(noWashersCard),
      'a week with none of the three washers on it shows neither label — nothing to group');

    // ── A DIFFERENT crew never gets these labels, even with the same
    // literal names on it (e.g. Isabel D borrowed onto another crew). ──
    const daysOther = {};
    DATES.forEach((ds) => { daysOther[ds] = { sheet: 't', occ: '', dep: '', tdOcc: '', sup: [['Rolando', '1'], ['Susan A', '1']] }; });
    win.dlSaveSchedule({ days: daysOther, count: 7, savedAt: new Date().toISOString() });
    win.renderSchedule();
    const supHtml = win.document.getElementById('scheduleContent').innerHTML;
    t.assert(!/>Lavadores</.test(supHtml) && !/>Regulares</.test(supHtml),
      'the grouping is scoped to Laundry only — no other crew card ever shows these labels');

    // ── The reorder is purely visual: editing a washer's cell after
    // reordering still writes to and reads from HIS OWN real row, not
    // whoever now happens to share his rendered position. ──
    buildLaundryWeek(win, ['Isabel D', 'Victoriano Ch', 'Olga A', 'Jorge Gonzalez', 'Gady', 'David P']);
    win.renderSchedule();
    win.confirm = () => true;
    const jorgeRealIdx = win.dlLoadSchedule().days[DATES[0]].laundry.findIndex((p) => p[0] === 'Jorge Gonzalez');
    win.schedSetCell('laundry', 0, 'Jorge Gonzalez', DATES[0], 'OFF', null);
    const afterEdit = win.dlLoadSchedule();
    t.eq(afterEdit.days[DATES[0]].laundry[jorgeRealIdx][1], 'OFF',
      "editing Jorge's cell (rendered at a reordered position) still lands on his own real row, not whoever the old idx 0 belonged to");
    t.eq(afterEdit.days[DATES[0]].laundry.find((p) => p[0] === 'Isabel D')[1], '1', 'and nobody else\'s row is disturbed by it');
  },
};
