/* Carlos's ask, 2026-09-10: he wasn't sure whether someone had the full
   weekend off LAST week — the same rotation fact the crew card already
   highlights for THIS week (a blue row for a full Sat+Sun off) — and
   had to switch weeks to check. This surfaces the same fact on the
   week he's actually building: a small blue dot next to the "Last
   week" work-day count, using the exact same schedHasFullWeekend check
   and the exact same blue the current-week row highlight already uses,
   so the two can never disagree about what "a full weekend off" means. */
const { loadApp, fakeSession } = require('../_harness');

const THIS_WEEK = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
const LAST_WEEK = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];

module.exports = {
  name: 'The crew card shows a blue dot next to "Last week" for anyone who had Sat+Sun off last week, visible without switching weeks (Carlos\'s 2026-09-10 ask)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const days = {};
    // Olga: had last Saturday AND Sunday off — the case the dot exists for.
    LAST_WEEK.forEach((ds, i) => {
      days[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', i < 2 ? 'OFF' : '1'], ['Gady', '1']] };
    });
    // This week: nobody has it off, so the row-highlight (a different
    // signal, for THIS week) stays off and can't be mistaken for the dot.
    THIS_WEEK.forEach((ds) => {
      days[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', '1'], ['Gady', '1']] };
    });
    win.dlSaveSchedule({ days, count: 14 });
    win.schedViewWeekStart = new Date(2026, 8, 12);
    win.showPage('schedule');
    win.renderSchedule();

    const html = win.document.getElementById('scheduleContent').innerHTML;
    const laundryStart = html.indexOf('>Laundry</div>');
    t.assert(laundryStart !== -1, 'the Laundry crew card renders at all');
    const laundryHtml = html.slice(laundryStart, laundryStart + 20000);

    // Each day cell is a <select> with every crew-value option spelled
    // out (LOBBY, ROOMS, HOUSEMAN, TAILOR, LAUNDRY, TURNDOWN, ...), so a
    // single person's row easily runs several thousand characters
    // across all 7 days — the window has to be generous enough to
    // actually reach the Last-week column past all of them.
    const olgaRowStart = laundryHtml.indexOf('Olga A');
    const olgaRowHtml = laundryHtml.slice(olgaRowStart, olgaRowStart + 8000);
    t.assert(/Had the full weekend off last week/.test(olgaRowHtml),
      'Olga A, who had last Sat+Sun off, gets the blue-dot marker in her row');

    const gadyRowStart = laundryHtml.indexOf('Gady');
    const gadyRowHtml = laundryHtml.slice(gadyRowStart, gadyRowStart + 8000);
    t.assert(!/Had the full weekend off last week/.test(gadyRowHtml),
      'Gady, who worked all of last weekend, gets no marker');

    // The header explains what the dot means, so it isn't a mystery mark.
    t.assert(/blue dot next to the number means she had Saturday AND Sunday off last week/.test(html),
      'the "Last week" column header explains the dot');

    // Nobody with no last-week record at all gets a false dot.
    const days2 = {};
    THIS_WEEK.forEach((ds) => { days2[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Rubia', '1']] }; });
    win.dlSaveSchedule({ days: days2, count: 7 });
    win.renderSchedule();
    const html2 = win.document.getElementById('scheduleContent').innerHTML;
    const laundry2Start = html2.indexOf('>Laundry</div>');
    t.assert(!/Had the full weekend off last week/.test(html2.slice(laundry2Start, laundry2Start + 3000)),
      'with no last-week record at all, nobody gets a false-positive dot');

    win.localStorage.removeItem('hk_dl_schedule');
  },
};
