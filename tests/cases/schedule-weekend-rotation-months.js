/* Carlos's real ask, 2026-11-19 (follow-up to Weekend Rotation itself):
   "puedes mas o menos delimitar los meses... para poder ver como
   descansan en un mes" — group the displayed weeks by the calendar
   month their own Saturday falls in, with a spanning label and a
   divider between groups, instead of making him count date headers by
   hand to tell where one month ends and the next begins.

   Computed from the REAL current date (getHotelWeekStart(new Date())),
   same as the main Weekend Rotation test — this test derives its own
   expected month grouping from that same real date rather than
   hardcoding month names, so it holds on whatever day it actually runs. */
const { loadApp, fakeSession } = require('../_harness');

function buildWeekStarts(win, n) {
  const anchor = win.getHotelWeekStart(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = new Date(anchor);
    w.setDate(w.getDate() - 7 * i);
    out.push(w);
  }
  return out;
}

function expectedMonthGroups(weekStarts) {
  const groups = [];
  let lastKey = null;
  weekStarts.forEach((w) => {
    const key = w.getFullYear() + '-' + w.getMonth();
    if (key !== lastKey) {
      groups.push({ label: w.toLocaleDateString('en-US', { month: 'long' }), count: 1 });
      lastKey = key;
    } else {
      groups[groups.length - 1].count++;
    }
  });
  return groups;
}

module.exports = {
  name: 'Weekend Rotation groups its week columns into month headers (spanning the right number of weeks each), with a divider between groups',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    const weekStarts = buildWeekStarts(win, 8);
    const groups = expectedMonthGroups(weekStarts);

    const SCH = { days: {} };
    weekStarts.forEach((w) => {
      const dates = [];
      for (let i = 0; i < 7; i++) { const d = new Date(w); d.setDate(d.getDate() + i); dates.push(win.dateStr(d)); }
      dates.forEach((ds) => { SCH.days[ds] = { gra: [['Marta', '1']] }; });
    });
    win.dlSaveSchedule(SCH);
    win.schedWeekendRotationOpen = true;
    win.renderSchedule();
    const html = win.document.getElementById('scheduleContent').innerHTML;

    groups.forEach((g) => {
      const re = new RegExp('grid-column:span ' + g.count + ';[^>]*>' + g.label + '<');
      t.assert(re.test(html), 'month group "' + g.label + '" spans exactly ' + g.count + ' week column(s) — groups: ' + JSON.stringify(groups));
    });

    // Exactly (groups.length - 1) dividers — one between each pair of
    // adjacent month groups, none before the very first group.
    const dividerCount = (html.match(/border-left:1px solid var\(--border2\);"[^>]*>(?:January|February|March|April|May|June|July|August|September|October|November|December)/g) || []).length;
    t.eq(dividerCount, Math.max(0, groups.length - 1), 'exactly one divider per month boundary, none before the first group');

    // Every month label that appears must be one of the expected ones —
    // guards against an off-by-one silently inventing/dropping a group.
    const labelsInHtml = (html.match(/grid-column:span \d+;[^>]*>(January|February|March|April|May|June|July|August|September|October|November|December)</g) || []);
    t.eq(labelsInHtml.length, groups.length, 'exactly ' + groups.length + ' month-group header cell(s) rendered, not duplicated per crew card beyond the first (only one crew is seeded here)');
  },
};
