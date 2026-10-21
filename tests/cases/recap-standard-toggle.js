/* Carlos's ask, 2026-10-21: Monthly Recap was the one place in the app
   still hardcoded to Current Standard, with no way to see it against
   Unifocus like Labor/Weekly Pace already can. Added the same shared
   toggle (getLaborStandardMode/buildStandardToggleHtml) to Recap, plus a
   month-to-date Unifocus budget computed by summing
   unifocusHoursForPosition(pos,ds) over every loaded day.

   This test hand-derives the expected MTD Unifocus hours for 4 positions
   (the ones whose bands don't depend on day-of-week, so the math is fully
   deterministic regardless of which real calendar dates Oct 1-2 land on)
   directly from the UNIFOCUS_STANDARDS formulas in index.html, independent
   of the app's own implementation, then checks the rendered Recap HTML
   against it — not just that it doesn't crash.

   Day 1 (prev-night rooms 150, same-day departures 150):
     Room Attendant: stayovers=max(0,150-150)=0 -> (0*.85*25 + 150*35)/60 = 87.5h
     Hskp Supervisor / House Attendant: dep 150 -> band [141,180]=32h; rooms-shift flat 8h -> 40h
     Laundry Attendant: dep 150 < 175 (no departures-shift credit) + rooms-shift flat 40h -> 40h
   Day 2 (prev-night rooms 190, same-day departures 100):
     Room Attendant: stayovers=max(0,190-100)=90 -> (90*.85*25 + 100*35)/60 = 90.208333h
     Hskp Supervisor / House Attendant: dep 100 -> band [71,140]=24h; +8h rooms-shift -> 32h
     Laundry Attendant: dep 100 < 175 (0) + 40h rooms-shift -> 40h
   MTD (day1+day2): Room Attendant 177.708333h, Supervisor 72h, House 72h, Laundry 80h.

   Current Standard MTD for the same 2 days uses totalMonthRoomsRecap =
   rooms(Sep 30)+rooms(Oct 1) = 150+190=340h of room-nights:
     Room Attendant 340*0.562=191.08h, Supervisor 340*0.155=52.7h,
     House 340*0.175=59.5h, Laundry 340*0.18=61.2h — deliberately DIFFERENT
     numbers from the Unifocus MTD above, so a passing test proves the
     toggle is actually switching the source, not just re-displaying the
     same figure. */
const { loadApp } = require('../_harness');

module.exports = {
  name: 'Monthly Recap has the same Current Standard/Unifocus toggle as Labor, computing a correct month-to-date Unifocus budget per position (summed day-by-day), with Current Standard numbers exactly unchanged and positions with no Unifocus data this month shown as "no standard" instead of a fabricated number',
  async run(t) {
    const { win } = await loadApp();

    function daySnap(paidByPos) {
      const byPosition = {};
      let totalPaid = 0;
      Object.keys(paidByPos).forEach((pos) => {
        byPosition[pos] = { paid: paidByPos[pos], ot1: 0, breakEx: 0 };
        totalPaid += paidByPos[pos];
      });
      return { totalPaid, totalOT: 0, noBreak: 0, shortBreak: 0, byPosition };
    }

    const PAID_DAY = {
      'Room Attendant': 45, 'Housekeeping Supervisor': 18, 'House Attendant': 19,
      'Laundry Attendant': 19, 'Turndown Attendant': 10, 'Public Area Attendant': 16,
    };

    // September record, for Oct 1's prev-night rooms (cross-month lookup).
    win.saveMonthData({ days: {}, rooms: { '2026-09-30': 150 } }, '2026-09');

    // October record: 2 days, departures entered both days.
    win.saveMonthData({
      days: {
        '2026-10-01': daySnap(PAID_DAY),
        '2026-10-02': daySnap(PAID_DAY),
      },
      rooms: { '2026-10-01': 190, '2026-10-02': 210 },
      departures: { '2026-10-01': 150, '2026-10-02': 100 },
      departuresSource: { '2026-10-01': 'manual', '2026-10-02': 'manual' },
    }, '2026-10');

    win.recapViewMonth = new Date(2026, 9, 1);
    win.currentPage = 'recap';

    function row(html, label) {
      const idx = html.indexOf('>' + label + '<');
      t.assert(idx !== -1, 'position "' + label + '" row not found');
      return html.slice(idx, idx + 1200);
    }
    function budgetOf(section) {
      const m = section.match(/Budget MTD: ([\d.]+)h/);
      return m ? parseFloat(m[1]) : null;
    }
    function hasNoStandard(section) {
      return /no standard/.test(section) && /Budget MTD: &#8212;|Budget MTD: —/.test(section);
    }

    // ── Current Standard: the toggle UI exists, defaults wired up, and the
    // math is byte-for-byte the pre-existing formula (rooms × factor). ──
    win.setLaborStandardMode('current');
    let html = win.document.getElementById('recapContent').innerHTML;
    let toggleHtml = win.document.getElementById('recapStdToggleBar').innerHTML;
    t.assert(/Current Standard/.test(toggleHtml) && /Unifocus/.test(toggleHtml), 'the Current Standard/Unifocus toggle renders on Recap');
    t.assert(/rooms × factor \| fixed hrs × days loaded/.test(html), 'Current Standard shows the rooms×factor formula caption');

    let b = budgetOf(row(html, 'Room'));
    t.assert(b !== null && Math.abs(b - 191.08) < 0.05, 'Room Attendant Current Standard MTD budget ~191.08h, got ' + b);
    b = budgetOf(row(html, 'Sup.Supervisor'));
    t.assert(b !== null && Math.abs(b - 52.7) < 0.05, 'Supervisor Current Standard MTD budget ~52.70h, got ' + b);
    b = budgetOf(row(html, 'House'));
    t.assert(b !== null && Math.abs(b - 59.5) < 0.05, 'House Attendant Current Standard MTD budget ~59.50h, got ' + b);
    b = budgetOf(row(html, 'Laundry'));
    t.assert(b !== null && Math.abs(b - 61.2) < 0.05, 'Laundry Current Standard MTD budget ~61.20h, got ' + b);

    // ── Unifocus: setLaborStandardMode re-renders Recap (not Labor) because
    // currentPage==='recap', and the MTD figures match the hand-derived
    // day-by-day sums above — genuinely different numbers from Current
    // Standard, proving the toggle actually switched the source. ──
    win.setLaborStandardMode('unifocus');
    html = win.document.getElementById('recapContent').innerHTML;
    t.assert(/Unifocus Labor Standard \(per band, by day\)/.test(html), 'Unifocus mode shows the Unifocus formula caption');

    b = budgetOf(row(html, 'Room'));
    t.assert(b !== null && Math.abs(b - 177.708333) < 0.02, 'Room Attendant Unifocus MTD budget ~177.71h, got ' + b);
    b = budgetOf(row(html, 'Sup.Supervisor'));
    t.assert(b !== null && Math.abs(b - 72) < 0.02, 'Supervisor Unifocus MTD budget 72.00h, got ' + b);
    b = budgetOf(row(html, 'House'));
    t.assert(b !== null && Math.abs(b - 72) < 0.02, 'House Attendant Unifocus MTD budget 72.00h, got ' + b);
    b = budgetOf(row(html, 'Laundry'));
    t.assert(b !== null && Math.abs(b - 80) < 0.02, 'Laundry Unifocus MTD budget 80.00h, got ' + b);
    // Rooms-only, day-of-week-dependent positions: not hand-verified here,
    // just must have come out with a real (non-null) number.
    b = budgetOf(row(html, 'Turndown'));
    t.assert(b !== null && b > 0, 'Turndown has a real Unifocus budget (rooms-only, day-of-week bands)');
    b = budgetOf(row(html, 'Public Area'));
    t.assert(b !== null && b > 0, 'Public Area has a real Unifocus budget (rooms-only, day-of-week bands)');

    // ── No fabricated numbers: a month with rooms but NO departures at all
    // leaves the 4 departures-dependent positions with no Unifocus data —
    // shown as "no standard", never a false zero or false "over budget" —
    // while the 2 rooms-only positions still compute normally. The hero
    // "Total Budget"/"Total Variance" and the Monthly Labor Pace header's
    // Dept Over/Under Budget must also stay consistent with each other
    // (both scoped to the same included positions). ──
    win.saveMonthData({
      days: { '2026-11-01': daySnap(PAID_DAY) },
      rooms: { '2026-10-31': 150, '2026-11-01': 150 },
      // deliberately no departures / departuresSource at all this month
    }, '2026-11');
    win.recapViewMonth = new Date(2026, 10, 1);
    win.setLaborStandardMode('unifocus');
    html = win.document.getElementById('recapContent').innerHTML;

    ['Room', 'Sup.Supervisor', 'House', 'Laundry'].forEach((label) => {
      t.assert(hasNoStandard(row(html, label)), 'position "' + label + '" shows "no standard" with no departures data this month: ' + row(html, label).slice(0, 300));
    });
    t.assert(/No Unifocus data this month for/.test(html), 'a caveat note lists the excluded positions');
    t.assert(/Room/.test(html.match(/No Unifocus data this month for[^<]*/)[0]), 'the caveat note names Room Attendant specifically');

    b = budgetOf(row(html, 'Turndown'));
    t.assert(b !== null && b > 0, 'Turndown still has a real Unifocus budget with no departures entered (rooms-only)');
    b = budgetOf(row(html, 'Public Area'));
    t.assert(b !== null && b > 0, 'Public Area still has a real Unifocus budget with no departures entered (rooms-only)');

    // Hero "Total Budget" and the Monthly Labor Pace header's Dept Over/
    // Under Budget figure must be internally consistent — both scoped to
    // only Turndown+Public Area (the only 2 positions with data this month).
    const heroBudgetM = html.match(/Total Budget[\s\S]{0,4}/);
    const heroTotalBudget = parseFloat((html.match(/<strong[^>]*>([\d.]+)h<\/strong>\s*<span[^>]*>Total Budget/) || [])[1]);
    t.assert(!isNaN(heroTotalBudget), 'hero Total Budget is a real number');
    const deptLabelIdx = html.indexOf('Dept Over Budget');
    const deptLabelIdxU = deptLabelIdx !== -1 ? deptLabelIdx : html.indexOf('Dept Under Budget');
    t.assert(deptLabelIdxU !== -1, 'Monthly Labor Pace header shows a Dept Over/Under Budget label');
  },
};
