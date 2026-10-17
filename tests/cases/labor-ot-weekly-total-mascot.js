/* Carlos's ask, 2026-10-17: show the total overtime generated this week
   right on the Overtime card, with a brief attention pulse. On Fridays
   only, add a housekeeper mascot whose mood reflects that total — happy
   under 5h, neutral 5-10h, sad over 10h. Shown a mockup, several rounds
   of feedback (duster had to stay visible beside the happy one instead
   of hiding behind her z-index-wise; the "getting bonked" gag moved from
   happy to sad; the thing bonking her had to be the SAME duster, swung
   in from her side rather than from above), approved. */
const { loadApp, fakeSession } = require('../_harness');

const DATES = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
// Scheduled Sat-Thu only, deliberately NOT the selected Friday itself —
// otherwise "today" with no report yet counts as a remaining day and
// inflates the projection past what this test is trying to pin down.
const WORK_DATES = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];

function buildSeed(scheduleFor) {
  const days = {};
  DATES.forEach((ds) => {
    days[ds] = { gra: Object.keys(scheduleFor).map((name) => [name, scheduleFor[name][ds] || 'OFF']) };
  });
  return Object.assign(fakeSession(), {
    hk_dl_schedule: JSON.stringify({ days, count: 6, savedAt: new Date().toISOString() }),
  });
}

function seedFor(name, id, paid) {
  const schedule = { [name]: Object.fromEntries(WORK_DATES.map((d) => [d, '1'])) };
  const seed = buildSeed(schedule);
  Object.assign(seed, {
    'hk_month_2026-10': {
      days: { '2026-10-10': { emps: [{ id, name, pos: 'Room Attendant', paid, ot1: 0, unpaid: 0.5 }] } },
    },
  });
  return seed;
}

module.exports = {
  name: 'Overtime card shows the total OT generated this week (pulsing), and on Fridays only a housekeeper mascot whose mood (happy/neutral/sad) matches that total',
  async run(t) {
    const { win } = await loadApp({ seed: seedFor('Neutral Girl', 'n1', 48) });

    // ── Unit checks: threshold boundaries ──
    t.eq(win._owmMascotStateFor(0), 'happy', '0 minutes is happy');
    t.eq(win._owmMascotStateFor(299), 'happy', '4h59m is still happy');
    t.eq(win._owmMascotStateFor(300), 'neutral', 'exactly 5h is neutral, not happy');
    t.eq(win._owmMascotStateFor(600), 'neutral', 'exactly 10h is still neutral');
    t.eq(win._owmMascotStateFor(601), 'sad', '10h01m tips into sad');

    // ── Friday render: 48 paid - 40 = 8h over -> neutral band (5-10h) ──
    win.dashSelectedDate = new Date(2026, 9, 16); // Friday
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const html = win.document.getElementById('dashDayAnalysis').innerHTML;

    t.assert(html.indexOf('Total OT this week') !== -1, 'the weekly total label renders');
    t.assert(html.indexOf('8h 0m') !== -1, 'the weekly total adds up to 8h0m');
    t.assert(html.indexOf('owm-pulse') !== -1, 'the total pill carries the attention-pulse class');
    t.assert(html.indexOf('owm-char-box') !== -1, 'on a Friday, the mascot renders');
    t.assert(html.indexOf('owm-neutral') !== -1, '8h of OT (between 5h and 10h) is the neutral mascot');
    t.assert(html.indexOf('owm-happy') === -1, 'not the happy mascot');
    t.assert(html.indexOf('owm-sad') === -1, 'not the sad mascot');

    // ── Same data, NOT a Friday: total still shows, mascot does not ──
    win.dashSelectedDate = new Date(2026, 9, 10); // Saturday, same hotel week
    win.renderDashDayAnalysis(win.loadMonthData('2026-10').days, null, null, null);
    const htmlSat = win.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(htmlSat.indexOf('Total OT this week') !== -1, 'the weekly total still renders on a non-Friday');
    t.assert(htmlSat.indexOf('owm-char-box') === -1, 'but the mascot does NOT render on a non-Friday');

    // ── Light week: under 5h -> happy mascot, with her own duster ──
    const { win: winHappy } = await loadApp({ seed: seedFor('Happy Girl', 'h1', 42) });
    winHappy.dashSelectedDate = new Date(2026, 9, 16); // Friday
    winHappy.renderDashDayAnalysis(winHappy.loadMonthData('2026-10').days, null, null, null);
    const htmlHappy = winHappy.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(htmlHappy.indexOf('2h 0m') !== -1, 'light week: total is 2h0m');
    t.assert(htmlHappy.indexOf('owm-happy') !== -1, '2h of OT (under 5h) is the happy mascot');
    t.assert(htmlHappy.indexOf('owm-duster-handle') !== -1, "the happy mascot's own duster renders");
    t.assert(htmlHappy.indexOf('owm-hit') === -1, 'the happy mascot does NOT also render the bonking duster');

    // ── Heavy week: over 10h -> sad mascot, with the bonking duster ──
    const { win: winSad } = await loadApp({ seed: seedFor('Sad Girl', 's1', 55) });
    winSad.dashSelectedDate = new Date(2026, 9, 16); // Friday
    winSad.renderDashDayAnalysis(winSad.loadMonthData('2026-10').days, null, null, null);
    const htmlSad = winSad.document.getElementById('dashDayAnalysis').innerHTML;
    t.assert(htmlSad.indexOf('15h 0m') !== -1, 'heavy week: total is 15h0m');
    t.assert(htmlSad.indexOf('owm-sad') !== -1, '15h of OT (over 10h) is the sad mascot');
    t.assert(htmlSad.indexOf('owm-hit') !== -1, "the sad mascot's bonking duster renders");
    t.assert(htmlSad.indexOf('owm-duster-handle') === -1, 'the sad mascot does NOT also render the happy-holding duster markup');
  },
};
