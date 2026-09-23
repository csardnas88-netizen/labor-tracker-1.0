/* Carlos's ask, 2026-09-23: see exactly which days someone rested LAST
   week without leaving the page. Presented with three design options
   (floating text card, mini calendar, inline strip) — he picked Option
   C: tap the name and a strip opens right under the row, reusing the
   exact same day-pill look "Prefers off" already uses in the ⋮ menu.
   No floating popover, so it works the same with a mouse or a finger
   on a phone. Purely display — schedToggleLastWeekOff only flips an
   open/closed flag, no schedule data changes. */
const { loadApp, fakeSession } = require('../_harness');

const THIS_WEEK = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
const LAST_WEEK = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];

module.exports = {
  name: 'Tapping a name in the Schedule Draft opens a strip of pills for exactly which days they rested last week (Carlos\'s 2026-09-23 ask, Option C)',
  async run(t) {
    const { win } = await loadApp({ seed: fakeSession() });
    await new Promise((r) => setTimeout(r, 60));

    const days = {};
    // Olga: off last Tuesday and Thursday, worked the rest.
    LAST_WEEK.forEach((ds, i) => {
      const olgaOff = (i === 3 || i === 5) ? 'OFF' : '1';
      days[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', olgaOff], ['Gady', '1']] };
    });
    THIS_WEEK.forEach((ds) => {
      days[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Olga A', '1'], ['Gady', '1']] };
    });
    win.dlSaveSchedule({ days, count: 14 });
    win.schedViewWeekStart = new Date(2026, 8, 12);
    win.showPage('schedule');
    win.renderSchedule();

    function laundryCard() {
      const html = win.document.getElementById('scheduleContent').innerHTML;
      const start = html.indexOf('>Laundry</div>');
      return html.slice(start, start + 40000);
    }

    t.assert(!/Last week off/.test(laundryCard()), 'closed by default — nobody\'s strip is open on first render');

    win.schedToggleLastWeekOff('laundry', 'Olga A');
    const openedCard = laundryCard();
    t.assert(/Last week off/.test(openedCard), 'toggling Olga opens her strip');
    const labelIdx = openedCard.indexOf('Last week off');
    const stripHtml = openedCard.slice(labelIdx, openedCard.indexOf('</div>', labelIdx) + 6);
    const pills = stripHtml.match(/>(Sat|Sun|Mon|Tue|Wed|Thu|Fri)</g);
    t.eq(JSON.stringify(pills), JSON.stringify(['>Tue<', '>Thu<']), 'her strip shows exactly Tue and Thu, in week order, and no other day');

    // Gady's own name (in his row, not inside an onclick attribute) still
    // has no open strip right after it — opening Olga's didn't open his.
    const gadyNameStart = openedCard.indexOf('>Gady<');
    t.assert(gadyNameStart !== -1, 'Gady\'s own name badge renders');
    t.assert(!/Last week off/.test(openedCard.slice(gadyNameStart, gadyNameStart + 400)), 'Gady\'s strip stays closed — opening Olga\'s doesn\'t open anyone else\'s');

    win.schedToggleLastWeekOff('laundry', 'Gady');
    const bothOpenCard = laundryCard();
    const gadyNameStart2 = bothOpenCard.indexOf('>Gady<');
    t.assert(/Worked every day last week/.test(bothOpenCard.slice(gadyNameStart2, gadyNameStart2 + 700)), 'Gady, who had no days off last week, reads "Worked every day last week" instead of an empty strip');

    win.schedToggleLastWeekOff('laundry', 'Olga A');
    const closedAgainCard = laundryCard();
    const olgaNameStart = closedAgainCard.indexOf('>Olga A<');
    t.assert(!/Last week off/.test(closedAgainCard.slice(olgaNameStart, olgaNameStart + 400)), 'tapping Olga again closes her strip back up');
    const gadyNameStart3 = closedAgainCard.indexOf('>Gady<');
    t.assert(/Worked every day last week/.test(closedAgainCard.slice(gadyNameStart3, gadyNameStart3 + 700)), 'Gady\'s strip stays open independently of Olga\'s closing');

    // Someone with no record of last week at all gets a distinct message,
    // not a false "worked every day".
    const days2 = {};
    THIS_WEEK.forEach((ds) => { days2[ds] = { sheet: 'test', occ: '', dep: '', tdOcc: '', laundry: [['Rubia', '1']] }; });
    win.dlSaveSchedule({ days: days2, count: 7 });
    win.renderSchedule();
    win.schedToggleLastWeekOff('laundry', 'Rubia');
    const rubiaCard = laundryCard();
    const rubiaStart = rubiaCard.indexOf('>Rubia<');
    t.assert(/No record of last week/.test(rubiaCard.slice(rubiaStart, rubiaStart + 700)),
      'with no last-week record at all, the strip says so instead of implying a full week worked');

    win.localStorage.removeItem('hk_dl_schedule');
  },
};
